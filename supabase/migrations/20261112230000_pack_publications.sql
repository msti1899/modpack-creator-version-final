-- Milestone 5: published versions and sharing.
-- A publication is an immutable snapshot of the owner's approved draft plus the
-- presentation metadata frozen at publish time. Only current group members can
-- read or export one; a share link carries no authority by itself.
--
-- Access is RPC-only, following the group and draft boundary: tables are not
-- readable or writable by anon/authenticated, and every routine resolves the
-- caller from the signed Clerk subject instead of a supplied user ID.

create table public.pack_publications (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  sequence integer not null,
  name text not null,
  pack_version text not null,
  loader_version text not null,
  game_version text not null,
  loader text not null,
  version_ids text[] not null,
  is_active boolean not null default false,
  published_at timestamptz not null default now(),
  constraint pack_publications_sequence_positive check (sequence > 0),
  -- Presentation metadata uses the same explicit Unicode trim contract as group
  -- names, so the stored value matches what the HTTP boundary accepted.
  constraint pack_publications_name_format check (
    char_length(name) between 1 and 100 and
    name = public.group_name_trim(name) and
    name !~ '[[:cntrl:]]' and
    position(chr(65279) in name) = 0
  ),
  constraint pack_publications_version_format check (
    char_length(pack_version) between 1 and 50 and
    pack_version = public.group_name_trim(pack_version) and
    pack_version !~ '[[:cntrl:]]' and
    position(chr(65279) in pack_version) = 0
  ),
  constraint pack_publications_loader_version_format check (
    char_length(loader_version) between 1 and 50 and loader_version ~ '^[A-Za-z0-9_.+-]+$'
  ),
  constraint pack_publications_game_version_format check (
    char_length(game_version) between 1 and 50 and game_version ~ '^[A-Za-z0-9_.+-]+$'
  ),
  constraint pack_publications_loader_allowed check (loader in ('fabric', 'forge', 'neoforge', 'quilt')),
  constraint pack_publications_selection check (
    public.valid_pack_version_ids(version_ids) and cardinality(version_ids) > 0
  ),
  constraint pack_publications_sequence_unique unique (group_id, sequence)
);
-- At most one active version per group without a second table or a nullable FK.
create unique index pack_publications_one_active
  on public.pack_publications (group_id) where is_active;

alter table public.pack_publications enable row level security;
revoke all on public.pack_publications from public, anon, authenticated;

-- One projection for every response so list, detail and publish cannot drift.
create function public.pack_publication_json(p public.pack_publications) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'sequence', p.sequence, 'name', p.name, 'version', p.pack_version,
    'loaderVersion', p.loader_version, 'gameVersion', p.game_version, 'loader', p.loader,
    'versionIds', p.version_ids, 'active', p.is_active, 'publishedAt', p.published_at);
$$;
revoke all on function public.pack_publication_json(public.pack_publications) from public, anon, authenticated;

-- Members read a keyset page; the embedded collection is bounded so a large
-- publication history cannot inflate one response.
create function public.my_pack_publications(p_limit integer, p_before_sequence integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_role text;
  v_active uuid;
  v_items jsonb;
  v_last integer;
  v_count integer;
  v_next integer;
begin
  select g.id, case when g.owner_id = v_sub then 'owner' else 'member' end
    into v_group, v_role
  from public.group_members m
  join public.groups g on g.id = m.group_id
  where m.user_id = v_sub;
  if v_group is null then
    raise exception using errcode = 'P0001', message = 'Group required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 or
    (p_before_sequence is not null and p_before_sequence < 1) then
    raise exception using errcode = 'P0001', message = 'Invalid page request.';
  end if;
  select jsonb_agg(public.pack_publication_json(p) order by p.sequence desc),
      min(p.sequence), count(*)
    into v_items, v_last, v_count
  from (
    select * from public.pack_publications
    where group_id = v_group
      and (p_before_sequence is null or sequence < p_before_sequence)
    order by sequence desc
    limit p_limit
  ) p;
  v_items := coalesce(v_items, '[]'::jsonb);
  if v_count = p_limit and exists (
    select 1 from public.pack_publications where group_id = v_group and sequence < v_last
  ) then
    v_next := v_last;
  else
    v_next := null;
  end if;
  select id into v_active from public.pack_publications where group_id = v_group and is_active;
  return jsonb_build_object('groupId', v_group, 'role', v_role,
    'activePublicationId', v_active, 'publications', v_items, 'nextBeforeSequence', v_next);
end;
$$;

-- Any member may read one publication of its own group; another group's ID is
-- indistinguishable from a missing one.
create function public.my_pack_publication(p_publication_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_role text;
  v_row public.pack_publications;
begin
  select g.id, case when g.owner_id = v_sub then 'owner' else 'member' end
    into v_group, v_role
  from public.group_members m
  join public.groups g on g.id = m.group_id
  where m.user_id = v_sub;
  if v_group is null then
    raise exception using errcode = 'P0001', message = 'Group required.';
  end if;
  if p_publication_id is null then
    raise exception using errcode = 'P0001', message = 'Invalid publication identifier.';
  end if;
  select * into v_row from public.pack_publications
    where id = p_publication_id and group_id = v_group;
  if not found then
    raise exception using errcode = 'P0001', message = 'Publication not found.';
  end if;
  return jsonb_build_object('groupId', v_group, 'role', v_role,
    'publication', public.pack_publication_json(v_row));
end;
$$;

-- Publishing never activates. The group row lock serializes sequence assignment
-- against concurrent publishes, saves, transfers and deletion, matching the
-- existing draft and transfer lock order.
create function public.publish_pack_draft(
  p_name text, p_pack_version text, p_loader_version text, p_expected_revision integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_owner text;
  v_draft public.pack_drafts;
  v_sequence integer;
  v_row public.pack_publications;
begin
  select g.id, g.owner_id into v_group, v_owner
  from public.group_members m
  join public.groups g on g.id = m.group_id
  where m.user_id = v_sub
  for update of g;
  if v_group is null then
    raise exception using errcode = 'P0001', message = 'Group required.';
  end if;
  if v_owner <> v_sub then
    raise exception using errcode = 'P0001', message = 'Only the group owner may manage published versions.';
  end if;
  if p_name is null or char_length(p_name) not between 1 and 100 or
    p_name <> public.group_name_trim(p_name) or p_name ~ '[[:cntrl:]]' or
    position(chr(65279) in p_name) > 0 or
    p_pack_version is null or char_length(p_pack_version) not between 1 and 50 or
    p_pack_version <> public.group_name_trim(p_pack_version) or p_pack_version ~ '[[:cntrl:]]' or
    position(chr(65279) in p_pack_version) > 0 or
    p_loader_version is null or p_loader_version !~ '^[A-Za-z0-9_.+-]{1,50}$' then
    raise exception using errcode = 'P0001', message = 'Invalid publication details.';
  end if;
  select * into v_draft from public.pack_drafts where group_id = v_group;
  if not found then
    raise exception using errcode = 'P0001', message = 'Draft not found.';
  end if;
  if cardinality(v_draft.version_ids) = 0 then
    raise exception using errcode = 'P0001', message = 'Cannot publish an empty draft.';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 or
    p_expected_revision <> v_draft.revision then
    raise exception using errcode = 'P0001', message = 'Draft revision conflict.';
  end if;
  select coalesce(max(sequence), 0) into v_sequence
    from public.pack_publications where group_id = v_group;
  if v_sequence >= 2147483647 then
    raise exception using errcode = 'P0001', message = 'Publication limit reached.';
  end if;
  insert into public.pack_publications
      (group_id, sequence, name, pack_version, loader_version,
       game_version, loader, version_ids)
    values (v_group, v_sequence + 1, p_name, p_pack_version, p_loader_version,
      v_draft.game_version, v_draft.loader, v_draft.version_ids)
    returning * into v_row;
  return jsonb_build_object('groupId', v_group, 'role', 'owner',
    'publication', public.pack_publication_json(v_row));
end;
$$;

-- Explicit activation by the owner, independent of the newest publication.
create function public.activate_pack_publication(p_publication_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_owner text;
begin
  select g.id, g.owner_id into v_group, v_owner
  from public.group_members m
  join public.groups g on g.id = m.group_id
  where m.user_id = v_sub
  for update of g;
  if v_group is null then
    raise exception using errcode = 'P0001', message = 'Group required.';
  end if;
  if v_owner <> v_sub then
    raise exception using errcode = 'P0001', message = 'Only the group owner may manage published versions.';
  end if;
  if p_publication_id is null or not exists (
    select 1 from public.pack_publications
      where id = p_publication_id and group_id = v_group
  ) then
    raise exception using errcode = 'P0001', message = 'Publication not found.';
  end if;
  update public.pack_publications set is_active = false
    where group_id = v_group and is_active and id <> p_publication_id;
  update public.pack_publications set is_active = true where id = p_publication_id;
  return jsonb_build_object('groupId', v_group, 'activePublicationId', p_publication_id);
end;
$$;

revoke all on function public.my_pack_publications(integer,integer) from public, anon, authenticated;
revoke all on function public.my_pack_publication(uuid) from public, anon, authenticated;
revoke all on function public.publish_pack_draft(text,text,text,integer) from public, anon, authenticated;
revoke all on function public.activate_pack_publication(uuid) from public, anon, authenticated;

grant execute on function public.my_pack_publications(integer,integer) to authenticated;
grant execute on function public.my_pack_publication(uuid) to authenticated;
grant execute on function public.publish_pack_draft(text,text,text,integer) to authenticated;
grant execute on function public.activate_pack_publication(uuid) to authenticated;
