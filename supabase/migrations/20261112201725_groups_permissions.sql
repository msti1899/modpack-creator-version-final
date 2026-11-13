-- Milestone 3: groups and permissions.
-- All client access goes through the RPC functions below. Tables are not
-- readable or writable by anon/authenticated; the RPCs validate the caller from
-- the signed JWT subject and enforce ownership rules in one transaction.

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  visibility text not null,
  owner_id text not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_name_format check (
    char_length(name) between 1 and 60 and
    name = btrim(name) and
    name !~ '[[:cntrl:]]'
  ),
  constraint groups_visibility_allowed check (visibility in ('public', 'private'))
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete restrict,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- One group per person, including owners, enforced under concurrent requests.
create unique index group_members_one_group_per_user on public.group_members (user_id);

-- Because an owner must be a member, the rule above also limits each user to at
-- most one owned group. Enforce it directly and index the owner lookups used by
-- every owner-only RPC.
create unique index groups_one_per_owner on public.groups (owner_id);

create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  token text not null unique,
  created_by text not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint group_invitations_token_format check (token ~ '^[a-f0-9]{64}$')
);

create unique index group_invitations_one_active
  on public.group_invitations (group_id) where revoked_at is null;

create table public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text references public.profiles(user_id) on delete restrict,
  constraint group_join_requests_status check (status in ('pending', 'approved', 'rejected'))
);

create unique index group_join_requests_one_pending
  on public.group_join_requests (group_id, user_id) where status = 'pending';

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invitations enable row level security;
alter table public.group_join_requests enable row level security;

revoke all on public.groups, public.group_members, public.group_invitations,
  public.group_join_requests from public, anon, authenticated;

-- A group owner must always be a member. Constraint triggers run at commit so
-- group creation can insert the group first and its owner membership second.
create function public.check_group_owner_membership() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  target uuid;
begin
  if tg_table_name = 'groups' then
    target := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    target := case when tg_op = 'DELETE' then old.group_id else new.group_id end;
  end if;
  if exists (select 1 from public.groups g where g.id = target) and not exists (
    select 1 from public.groups g
    join public.group_members m on m.group_id = g.id
    where g.id = target and m.user_id = g.owner_id
  ) then
    raise exception using errcode = 'P0001', message = 'Group owner must be a member.';
  end if;
  return null;
end;
$$;

create constraint trigger group_owner_membership
  after insert or update or delete on public.groups
  deferrable initially deferred
  for each row execute function public.check_group_owner_membership();

create constraint trigger group_member_owner_membership
  after insert or update or delete on public.group_members
  deferrable initially deferred
  for each row execute function public.check_group_owner_membership();

revoke all on function public.check_group_owner_membership() from public, anon, authenticated;

create function public.current_clerk_sub() returns text
language plpgsql stable security invoker set search_path = '' as $$
declare
  subject text := (select auth.jwt() ->> 'sub');
begin
  if subject is null or subject !~ '^user_[A-Za-z0-9]+$' then
    raise exception using errcode = 'P0001', message = 'Authentication required.';
  end if;
  return subject;
end;
$$;

revoke all on function public.current_clerk_sub() from public, anon, authenticated;

create function public.group_overview_for(p_group_id uuid, p_sub text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'visibility', g.visibility,
    'ownerId', g.owner_id,
    'role', case when g.owner_id = p_sub then 'owner' else 'member' end,
    'createdAt', g.created_at,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', m.user_id,
        'username', pr.username,
        'role', case when g.owner_id = m.user_id then 'owner' else 'member' end,
        'joinedAt', m.joined_at
      ) order by m.joined_at, m.user_id)
      from public.group_members m
      join public.profiles pr on pr.user_id = m.user_id
      where m.group_id = g.id
    ), '[]'::jsonb),
    'invitation', case when g.owner_id = p_sub and g.visibility = 'private' then (
      select jsonb_build_object('token', i.token, 'createdAt', i.created_at)
      from public.group_invitations i
      where i.group_id = g.id and i.revoked_at is null
      limit 1
    ) else null end,
    'requests', case when g.owner_id = p_sub then coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', r.user_id,
        'username', pr.username,
        'createdAt', r.created_at
      ) order by r.created_at, r.user_id)
      from public.group_join_requests r
      join public.profiles pr on pr.user_id = r.user_id
      where r.group_id = g.id and r.status = 'pending'
    ), '[]'::jsonb) else null end
  )
  from public.groups g
  where g.id = p_group_id;
$$;

revoke all on function public.group_overview_for(uuid, text) from public, anon, authenticated;

create function public.create_group(p_name text, p_visibility text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_name text := btrim(coalesce(p_name, ''));
  v_group uuid;
begin
  if char_length(v_name) not between 1 and 60 or v_name ~ '[[:cntrl:]]' then
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

create function public.my_group() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_result jsonb;
begin
  select public.group_overview_for(g.id, v_sub)
  into v_result
  from public.groups g
  join public.group_members m on m.group_id = g.id and m.user_id = v_sub
  limit 1;
  return v_result;
end;
$$;

create function public.join_public_group(p_group_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_visibility text;
begin
  select visibility into v_visibility from public.groups where id = p_group_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Group not found.';
  end if;
  if v_visibility <> 'public' then
    raise exception using errcode = 'P0001', message = 'Group is not public.';
  end if;
  if exists (select 1 from public.group_members m where m.group_id = p_group_id and m.user_id = v_sub) then
    return public.group_overview_for(p_group_id, v_sub);
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = v_sub) then
    raise exception using errcode = 'P0001', message = 'Profile required.';
  end if;
  if exists (select 1 from public.group_members m where m.user_id = v_sub) then
    raise exception using errcode = 'P0001', message = 'Already in a group.';
  end if;
  insert into public.group_members (group_id, user_id) values (p_group_id, v_sub)
    on conflict (user_id) do nothing;
  if not found then
    if exists (select 1 from public.group_members m where m.group_id = p_group_id and m.user_id = v_sub) then
      return public.group_overview_for(p_group_id, v_sub);
    end if;
    raise exception using errcode = 'P0001', message = 'Already in a group.';
  end if;
  return public.group_overview_for(p_group_id, v_sub);
end;
$$;

create function public.create_invitation() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_visibility text;
  v_token text;
  v_created timestamptz;
begin
  select id, visibility into v_group, v_visibility from public.groups where owner_id = v_sub for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Only the owner can perform this action.';
  end if;
  if v_visibility <> 'private' then
    raise exception using errcode = 'P0001', message = 'Invitations require a private group.';
  end if;
  update public.group_invitations set revoked_at = now()
    where group_id = v_group and revoked_at is null;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.group_invitations (group_id, token, created_by)
    values (v_group, v_token, v_sub) returning created_at into v_created;
  return jsonb_build_object('token', v_token, 'createdAt', v_created);
end;
$$;

create function public.revoke_invitation() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
begin
  select id into v_group from public.groups where owner_id = v_sub for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Only the owner can perform this action.';
  end if;
  update public.group_invitations set revoked_at = now()
    where group_id = v_group and revoked_at is null;
  return jsonb_build_object('invitation', null);
end;
$$;

create function public.resolve_invitation(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_name text;
  v_owner text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = 'P0001', message = 'Invitation is invalid.';
  end if;
  select g.id, g.name, p.username into v_group, v_name, v_owner
  from public.group_invitations i
  join public.groups g on g.id = i.group_id
  join public.profiles p on p.user_id = g.owner_id
  where i.token = p_token and i.revoked_at is null and g.visibility = 'private';
  if not found then
    raise exception using errcode = 'P0001', message = 'Invitation is invalid.';
  end if;
  return jsonb_build_object(
    'groupId', v_group,
    'name', v_name,
    'ownerUsername', v_owner,
    'requested', exists (
      select 1 from public.group_join_requests r
      where r.group_id = v_group and r.user_id = v_sub and r.status = 'pending'
    ),
    'member', exists (
      select 1 from public.group_members m
      where m.group_id = v_group and m.user_id = v_sub
    )
  );
end;
$$;

create function public.request_join(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_created timestamptz;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = 'P0001', message = 'Invitation is invalid.';
  end if;
  select g.id into v_group
  from public.group_invitations i
  join public.groups g on g.id = i.group_id
  where i.token = p_token and i.revoked_at is null and g.visibility = 'private';
  if not found then
    raise exception using errcode = 'P0001', message = 'Invitation is invalid.';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = v_sub) then
    raise exception using errcode = 'P0001', message = 'Profile required.';
  end if;
  if exists (select 1 from public.group_members m where m.user_id = v_sub) then
    raise exception using errcode = 'P0001', message = 'Already in a group.';
  end if;
  select created_at into v_created from public.group_join_requests
    where group_id = v_group and user_id = v_sub and status = 'pending';
  if found then
    return jsonb_build_object('groupId', v_group, 'status', 'pending', 'createdAt', v_created);
  end if;
  insert into public.group_join_requests (group_id, user_id) values (v_group, v_sub)
    on conflict (group_id, user_id) where status = 'pending' do nothing
    returning created_at into v_created;
  if not found then
    select created_at into v_created from public.group_join_requests
      where group_id = v_group and user_id = v_sub and status = 'pending';
  end if;
  return jsonb_build_object('groupId', v_group, 'status', 'pending', 'createdAt', v_created);
end;
$$;

create function public.approve_join_request(p_user_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_request uuid;
begin
  select id into v_group from public.groups where owner_id = v_sub for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Only the owner can perform this action.';
  end if;
  select id into v_request from public.group_join_requests
    where group_id = v_group and user_id = p_user_id and status = 'pending' for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Request not found.';
  end if;
  insert into public.group_members (group_id, user_id) values (v_group, p_user_id)
    on conflict (user_id) do nothing;
  if not found then
    raise exception using errcode = 'P0001', message = 'Target user is already in a group.';
  end if;
  update public.group_join_requests
    set status = 'approved', decided_at = now(), decided_by = v_sub
    where id = v_request;
  return public.group_overview_for(v_group, v_sub);
end;
$$;

create function public.reject_join_request(p_user_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_request uuid;
begin
  select id into v_group from public.groups where owner_id = v_sub for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Only the owner can perform this action.';
  end if;
  select id into v_request from public.group_join_requests
    where group_id = v_group and user_id = p_user_id and status = 'pending' for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Request not found.';
  end if;
  update public.group_join_requests
    set status = 'rejected', decided_at = now(), decided_by = v_sub
    where id = v_request;
  return jsonb_build_object('userId', p_user_id, 'status', 'rejected');
end;
$$;

create function public.transfer_ownership(p_user_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
begin
  select id into v_group from public.groups where owner_id = v_sub for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Only the owner can perform this action.';
  end if;
  if p_user_id is null or p_user_id !~ '^user_[A-Za-z0-9]+$' or
    not exists (select 1 from public.group_members m where m.group_id = v_group and m.user_id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'Target user is not a member.';
  end if;
  update public.groups set owner_id = p_user_id, updated_at = now() where id = v_group;
  return public.group_overview_for(v_group, v_sub);
end;
$$;

create function public.leave_group() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_owner text;
  v_members bigint;
begin
  select g.id, g.owner_id into v_group, v_owner
  from public.groups g
  join public.group_members m on m.group_id = g.id and m.user_id = v_sub
  for update of g;
  if not found then
    raise exception using errcode = 'P0001', message = 'Membership required.';
  end if;
  if v_owner = v_sub then
    select count(*) into v_members from public.group_members where group_id = v_group;
    if v_members > 1 then
      raise exception using errcode = 'P0001',
        message = 'Transfers are required before leaving a group with other members.';
    end if;
    delete from public.groups where id = v_group;
    return jsonb_build_object('groupId', v_group, 'groupDeleted', true);
  end if;
  delete from public.group_members where group_id = v_group and user_id = v_sub;
  return jsonb_build_object('groupId', v_group, 'groupDeleted', false);
end;
$$;

-- Only these RPCs are callable by authenticated clients.
revoke all on function public.create_group(text, text) from public, anon, authenticated;
revoke all on function public.my_group() from public, anon, authenticated;
revoke all on function public.join_public_group(uuid) from public, anon, authenticated;
revoke all on function public.create_invitation() from public, anon, authenticated;
revoke all on function public.revoke_invitation() from public, anon, authenticated;
revoke all on function public.resolve_invitation(text) from public, anon, authenticated;
revoke all on function public.request_join(text) from public, anon, authenticated;
revoke all on function public.approve_join_request(text) from public, anon, authenticated;
revoke all on function public.reject_join_request(text) from public, anon, authenticated;
revoke all on function public.transfer_ownership(text) from public, anon, authenticated;
revoke all on function public.leave_group() from public, anon, authenticated;

grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.my_group() to authenticated;
grant execute on function public.join_public_group(uuid) to authenticated;
grant execute on function public.create_invitation() to authenticated;
grant execute on function public.revoke_invitation() to authenticated;
grant execute on function public.resolve_invitation(text) to authenticated;
grant execute on function public.request_join(text) to authenticated;
grant execute on function public.approve_join_request(text) to authenticated;
grant execute on function public.reject_join_request(text) to authenticated;
grant execute on function public.transfer_ownership(text) to authenticated;
grant execute on function public.leave_group() to authenticated;
