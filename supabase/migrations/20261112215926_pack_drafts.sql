-- Drafts are lazy-created. Only the group owner may replace an explicit selection.
create function public.valid_pack_version_ids(p_ids text[]) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select p_ids is not null
    and coalesce(array_ndims(p_ids), 1) = 1
    and cardinality(p_ids) <= 50
    and not exists(select 1 from unnest(p_ids) x where x is null or x !~ '^[A-Za-z0-9_-]{1,100}$')
    and cardinality(p_ids) = (select count(distinct x) from unnest(p_ids) x);
$$;
revoke all on function public.valid_pack_version_ids(text[]) from public, anon, authenticated;

create table public.pack_drafts (
  group_id uuid primary key references public.groups(id) on delete cascade,
  game_version text not null check (char_length(game_version) between 1 and 50 and game_version ~ '^[A-Za-z0-9_.+-]+$'),
  loader text not null check (loader in ('fabric', 'forge', 'neoforge', 'quilt')),
  version_ids text[] not null check (public.valid_pack_version_ids(version_ids)),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.pack_drafts enable row level security;
revoke all on public.pack_drafts from public, anon, authenticated;

-- RPC-only access follows the existing groups boundary. Definer functions check
-- the signed Clerk subject and current membership/ownership, not supplied user IDs.
create function public.my_pack_draft() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_result jsonb;
begin
  select jsonb_build_object(
    'groupId', g.id,
    'role', case when g.owner_id = v_sub then 'owner' else 'member' end,
    'draft', case when d.group_id is null then null else jsonb_build_object(
      'gameVersion', d.game_version, 'loader', d.loader, 'versionIds', d.version_ids,
      'revision', d.revision, 'updatedAt', d.updated_at
    ) end
  ) into v_result
  from public.group_members m
  join public.groups g on g.id = m.group_id
  left join public.pack_drafts d on d.group_id = g.id
  where m.user_id = v_sub;
  if v_result is null then
    raise exception using errcode = 'P0001', message = 'Group required.';
  end if;
  return v_result;
end;
$$;

create function public.save_pack_draft(
  p_group_id uuid, p_game_version text, p_loader text,
  p_version_ids text[], p_expected_revision integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_revision integer;
begin
  -- Shared group lock order matches transfer/leave. Recheck ownership after the
  -- API's catalog validation, including when the owner changed groups meanwhile.
  select id into v_group from public.groups
    where id = p_group_id and owner_id = v_sub for update;
  if v_group is null then
    raise exception using errcode = 'P0001', message = 'Only the group owner may edit the draft.';
  end if;
  if p_game_version is null or char_length(p_game_version) not between 1 and 50
    or p_game_version !~ '^[A-Za-z0-9_.+-]+$'
    or p_loader is null or p_loader not in ('fabric', 'forge', 'neoforge', 'quilt') then
    raise exception using errcode = 'P0001', message = 'Invalid draft settings.';
  end if;
  if not public.valid_pack_version_ids(p_version_ids) then
    raise exception using errcode = 'P0001', message = 'Invalid draft selection.';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = 'P0001', message = 'Invalid draft revision.';
  end if;
  select revision into v_revision from public.pack_drafts where group_id = v_group;
  v_revision := coalesce(v_revision, 0);
  if v_revision <> p_expected_revision or v_revision = 2147483647 then
    raise exception using errcode = 'P0001', message = 'Draft revision conflict.';
  end if;
  insert into public.pack_drafts(group_id, game_version, loader, version_ids, revision)
    values (v_group, p_game_version, p_loader, p_version_ids, v_revision + 1)
  on conflict (group_id) do update set
    game_version = excluded.game_version, loader = excluded.loader,
    version_ids = excluded.version_ids, revision = excluded.revision, updated_at = now();
  return public.my_pack_draft();
end;
$$;

revoke all on function public.my_pack_draft() from public, anon, authenticated;
revoke all on function public.save_pack_draft(uuid,text,text,text[],integer) from public, anon, authenticated;
grant execute on function public.my_pack_draft() to authenticated;
grant execute on function public.save_pack_draft(uuid,text,text,text[],integer) to authenticated;
