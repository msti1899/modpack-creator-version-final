-- Forward fix for two reproduced review findings. The already-applied groups
-- migration remains byte-identical; this migration replaces only the affected
-- routines and the name constraint.

-- S11: one name contract for SQL, the stored constraint and HTTP.
-- POSIX [[:space:]] is locale-dependent and did not match NBSP under PGlite.
-- Use the explicit Unicode whitespace set that JavaScript String.trim uses.
create function public.group_name_space_class() returns text
language sql immutable set search_path = '' as $$
  select '[' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32) ||
    chr(133) || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) ||
    chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) ||
    chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) ||
    chr(12288) || ']';
$$;

create function public.group_name_trim(p_value text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(
    coalesce(p_value, ''),
    '^' || public.group_name_space_class() || '+|' || public.group_name_space_class() || '+$',
    '', 'g'
  );
$$;

revoke all on function public.group_name_space_class() from public, anon, authenticated;
revoke all on function public.group_name_trim(text) from public, anon, authenticated;

alter table public.groups drop constraint groups_name_format;
alter table public.groups add constraint groups_name_format check (
  char_length(name) between 1 and 60 and
  name = public.group_name_trim(name) and
  name !~ '[[:cntrl:]]' and
  position(chr(65279) in name) = 0
);

create or replace function public.create_group(p_name text, p_visibility text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_name text := public.group_name_trim(p_name);
  v_group uuid;
begin
  if char_length(v_name) not between 1 and 60 or v_name ~ '[[:cntrl:]]' or
    position(chr(65279) in v_name) > 0 then
    raise exception using errcode = 'P0001', message = 'Invalid group name.';
  end if;
  if p_visibility is null or p_visibility not in ('public', 'private') then
    raise exception using errcode = 'P0001', message = 'Invalid group visibility.';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = v_sub) then
    raise exception using errcode = 'P0001', message = 'Profile required.';
  end if;
  if exists (select 1 from public.group_members m where m.user_id = v_sub) then
    raise exception using errcode = 'P0001', message = 'Already in a group.';
  end if;
  insert into public.groups (name, visibility, owner_id)
    values (v_name, p_visibility, v_sub) returning id into v_group;
  insert into public.group_members (group_id, user_id) values (v_group, v_sub);
  return public.group_overview_for(v_group, v_sub);
end;
$$;

-- S12: the overview embeds bounded first pages. Valid groups of any size stay
-- below the HTTP transport cap; callers fetch later pages with the cursors.
create or replace function public.group_overview_for(p_group_id uuid, p_sub text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_owner text;
  v_visibility text;
  v_members jsonb;
  v_members_next text;
  v_requests jsonb;
  v_requests_next text;
begin
  select g.owner_id, g.visibility into v_owner, v_visibility
  from public.groups g where g.id = p_group_id;
  if not found then return null; end if;

  with page as (
    select m.user_id, m.joined_at, pr.username
    from public.group_members m
    join public.profiles pr on pr.user_id = m.user_id
    where m.group_id = p_group_id
    order by m.joined_at, m.user_id
    limit 51
  ), kept as (
    select * from page order by joined_at, user_id limit 50
  )
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'userId', user_id,
      'username', username,
      'role', case when user_id = v_owner then 'owner' else 'member' end,
      'joinedAt', joined_at
    ) order by joined_at, user_id) from kept
  ), '[]'::jsonb),
  case when (select count(*) from page) > 50 then (
    select ((extract(epoch from joined_at) * 1000000)::bigint)::text || '.' || user_id
    from kept order by joined_at desc, user_id desc limit 1
  ) else null end
  into v_members, v_members_next;

  if v_owner = p_sub then
    with page as (
      select r.user_id, r.created_at, pr.username
      from public.group_join_requests r
      join public.profiles pr on pr.user_id = r.user_id
      where r.group_id = p_group_id and r.status = 'pending'
      order by r.created_at, r.user_id
      limit 51
    ), kept as (
      select * from page order by created_at, user_id limit 50
    )
    select coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', user_id,
        'username', username,
        'createdAt', created_at
      ) order by created_at, user_id) from kept
    ), '[]'::jsonb),
    case when (select count(*) from page) > 50 then (
      select ((extract(epoch from created_at) * 1000000)::bigint)::text || '.' || user_id
      from kept order by created_at desc, user_id desc limit 1
    ) else null end
    into v_requests, v_requests_next;
  end if;

  return jsonb_build_object(
    'id', p_group_id,
    'name', (select g.name from public.groups g where g.id = p_group_id),
    'visibility', v_visibility,
    'ownerId', v_owner,
    'role', case when v_owner = p_sub then 'owner' else 'member' end,
    'createdAt', (select g.created_at from public.groups g where g.id = p_group_id),
    'memberCount', (select count(*) from public.group_members m where m.group_id = p_group_id),
    'members', v_members,
    'membersNextCursor', v_members_next,
    'invitation', case when v_owner = p_sub and v_visibility = 'private' then (
      select jsonb_build_object('token', i.token, 'createdAt', i.created_at)
      from public.group_invitations i
      where i.group_id = p_group_id and i.revoked_at is null
      limit 1
    ) else null end,
    'requests', v_requests,
    'requestsNextCursor', v_requests_next
  );
end;
$$;

create index group_members_group_joined
  on public.group_members (group_id, joined_at, user_id);
create index group_join_requests_group_status_created
  on public.group_join_requests (group_id, status, created_at, user_id);

create function public.group_members_page(p_cursor text, p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_micros bigint;
  v_user text;
  v_members jsonb;
  v_next text;
begin
  select m.group_id into v_group from public.group_members m where m.user_id = v_sub;
  if not found then
    raise exception using errcode = 'P0001', message = 'Membership required.';
  end if;
  if p_cursor is not null then
    if p_cursor !~ '^[0-9]{1,16}\.user_[A-Za-z0-9]+$' then
      raise exception using errcode = 'P0001', message = 'Invalid page cursor.';
    end if;
    v_micros := split_part(p_cursor, '.', 1)::bigint;
    v_user := split_part(p_cursor, '.', 2);
  end if;
  with page as (
    select m.user_id, m.joined_at, pr.username
    from public.group_members m
    join public.profiles pr on pr.user_id = m.user_id
    where m.group_id = v_group and (
      p_cursor is null or
      (m.joined_at, m.user_id) > (to_timestamp(v_micros::numeric / 1000000), v_user)
    )
    order by m.joined_at, m.user_id
    limit v_limit + 1
  ), kept as (
    select * from page order by joined_at, user_id limit v_limit
  )
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'userId', user_id,
      'username', username,
      'role', case when user_id = (select owner_id from public.groups where id = v_group) then 'owner' else 'member' end,
      'joinedAt', joined_at
    ) order by joined_at, user_id) from kept
  ), '[]'::jsonb),
  case when (select count(*) from page) > v_limit then (
    select ((extract(epoch from joined_at) * 1000000)::bigint)::text || '.' || user_id
    from kept order by joined_at desc, user_id desc limit 1
  ) else null end
  into v_members, v_next;
  return jsonb_build_object('members', v_members, 'nextCursor', v_next);
end;
$$;

create function public.group_requests_page(p_cursor text, p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_micros bigint;
  v_user text;
  v_requests jsonb;
  v_next text;
begin
  select g.id into v_group from public.groups g where g.owner_id = v_sub;
  if not found then
    raise exception using errcode = 'P0001', message = 'Only the owner can perform this action.';
  end if;
  if p_cursor is not null then
    if p_cursor !~ '^[0-9]{1,16}\.user_[A-Za-z0-9]+$' then
      raise exception using errcode = 'P0001', message = 'Invalid page cursor.';
    end if;
    v_micros := split_part(p_cursor, '.', 1)::bigint;
    v_user := split_part(p_cursor, '.', 2);
  end if;
  with page as (
    select r.user_id, r.created_at, pr.username
    from public.group_join_requests r
    join public.profiles pr on pr.user_id = r.user_id
    where r.group_id = v_group and r.status = 'pending' and (
      p_cursor is null or
      (r.created_at, r.user_id) > (to_timestamp(v_micros::numeric / 1000000), v_user)
    )
    order by r.created_at, r.user_id
    limit v_limit + 1
  ), kept as (
    select * from page order by created_at, user_id limit v_limit
  )
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'userId', user_id,
      'username', username,
      'createdAt', created_at
    ) order by created_at, user_id) from kept
  ), '[]'::jsonb),
  case when (select count(*) from page) > v_limit then (
    select ((extract(epoch from created_at) * 1000000)::bigint)::text || '.' || user_id
    from kept order by created_at desc, user_id desc limit 1
  ) else null end
  into v_requests, v_next;
  return jsonb_build_object('requests', v_requests, 'nextCursor', v_next);
end;
$$;

revoke all on function public.create_group(text, text) from public, anon, authenticated;
revoke all on function public.group_overview_for(uuid, text) from public, anon, authenticated;
revoke all on function public.group_members_page(text, integer) from public, anon, authenticated;
revoke all on function public.group_requests_page(text, integer) from public, anon, authenticated;

grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.group_members_page(text, integer) to authenticated;
grant execute on function public.group_requests_page(text, integer) to authenticated;
