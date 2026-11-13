-- Milestone 6: group mod-addition votes.
-- Access follows the existing groups boundary: tables are never readable or
-- writable by clients, and every RPC resolves the caller from the signed JWT
-- subject instead of trusting supplied user identifiers.

create function public.valid_vote_proposal(p_proposal jsonb, p_addition text[]) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select case
    when p_proposal is null or p_addition is null then false
    when jsonb_typeof(p_proposal) <> 'array' then false
    when jsonb_array_length(p_proposal) <> cardinality(p_addition) then false
    else
      not exists (
        select 1 from jsonb_array_elements(p_proposal) item
        where jsonb_typeof(item) is distinct from 'object'
          or jsonb_typeof(item -> 'versionId') is distinct from 'string'
          or jsonb_typeof(item -> 'projectId') is distinct from 'string'
          or jsonb_typeof(item -> 'projectTitle') is distinct from 'string'
          or jsonb_typeof(item -> 'versionNumber') is distinct from 'string'
          or (item ->> 'versionId') !~ '^[A-Za-z0-9_-]{1,100}$'
          or (item ->> 'projectId') !~ '^[A-Za-z0-9_-]{1,100}$'
          or char_length(item ->> 'projectTitle') not between 1 and 300
          or (item ->> 'projectTitle') ~ '[[:cntrl:]]'
          or char_length(item ->> 'versionNumber') not between 1 and 100
          or (item ->> 'versionNumber') ~ '[[:cntrl:]]'
          or not (item ->> 'versionId') = any(p_addition)
      )
      and (select count(distinct item ->> 'versionId') from jsonb_array_elements(p_proposal) item)
        = cardinality(p_addition)
      and (select count(distinct item ->> 'projectId') from jsonb_array_elements(p_proposal) item)
        = cardinality(p_addition)
  end;
$$;
revoke all on function public.valid_vote_proposal(jsonb,text[]) from public, anon, authenticated;

-- A vote stores the pinned addition and its display snapshot, so a later catalog
-- change cannot rewrite what the group voted on. Electorate rows are a snapshot
-- and survive later departures; ballots require a frozen-electorate membership.
create table public.group_votes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by text not null references public.profiles(user_id) on delete restrict,
  game_version text not null,
  loader text not null,
  addition text[] not null,
  proposal jsonb not null,
  duration_hours integer not null,
  electorate_size integer not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  closes_at timestamptz not null,
  resolved_at timestamptz,
  incorporated_at timestamptz,
  constraint group_votes_game_version check (
    char_length(game_version) between 1 and 50 and game_version ~ '^[A-Za-z0-9_.+-]+$'
  ),
  constraint group_votes_loader check (loader in ('fabric', 'forge', 'neoforge', 'quilt')),
  constraint group_votes_addition check (
    public.valid_pack_version_ids(addition) and cardinality(addition) between 1 and 50
  ),
  constraint group_votes_proposal check (public.valid_vote_proposal(proposal, addition)),
  constraint group_votes_duration check (duration_hours between 1 and 720),
  constraint group_votes_electorate check (electorate_size > 0),
  constraint group_votes_status check (status in ('open', 'approved', 'rejected', 'cancelled')),
  constraint group_votes_deadline check (closes_at > created_at),
  constraint group_votes_resolved check (status = 'open' or resolved_at is not null),
  constraint group_votes_incorporated check (incorporated_at is null or status = 'approved')
);

create index group_votes_group_created on public.group_votes (group_id, created_at desc, id desc);

create table public.group_vote_electorate (
  vote_id uuid not null references public.group_votes(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete restrict,
  primary key (vote_id, user_id)
);

create index group_vote_electorate_user on public.group_vote_electorate (user_id);

create table public.group_vote_ballots (
  vote_id uuid not null,
  user_id text not null,
  value text not null,
  cast_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (vote_id, user_id),
  constraint group_vote_ballots_value check (value in ('approve', 'reject')),
  constraint group_vote_ballots_electorate foreign key (vote_id, user_id)
    references public.group_vote_electorate (vote_id, user_id) on delete cascade
);

alter table public.group_votes enable row level security;
alter table public.group_vote_electorate enable row level security;
alter table public.group_vote_ballots enable row level security;
revoke all on public.group_votes, public.group_vote_electorate, public.group_vote_ballots
  from public, anon, authenticated;

-- A vote that reaches its deadline without the majority is reported as rejected.
-- No scheduler exists, so the stored status stays open and reads derive the result
-- from closes_at; every write path refuses to act on a derived-closed vote.
create function public.vote_snapshot(p_vote public.group_votes, p_sub text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p_vote.id,
    'groupId', p_vote.group_id,
    'gameVersion', p_vote.game_version,
    'loader', p_vote.loader,
    'proposal', p_vote.proposal,
    'durationHours', p_vote.duration_hours,
    'electorateSize', p_vote.electorate_size,
    'status', case when p_vote.status = 'open' and now() >= p_vote.closes_at
      then 'rejected' else p_vote.status end,
    'createdAt', p_vote.created_at,
    'closesAt', p_vote.closes_at,
    'resolvedAt', p_vote.resolved_at,
    'incorporatedAt', p_vote.incorporated_at,
    'approveCount', (select count(*) from public.group_vote_ballots b
      where b.vote_id = p_vote.id and b.value = 'approve')::integer,
    'rejectCount', (select count(*) from public.group_vote_ballots b
      where b.vote_id = p_vote.id and b.value = 'reject')::integer,
    'myBallot', (select b.value from public.group_vote_ballots b
      where b.vote_id = p_vote.id and b.user_id = p_sub)
  );
$$;
revoke all on function public.vote_snapshot(public.group_votes,text) from public, anon, authenticated;

create function public.open_group_vote(
  p_group_id uuid, p_game_version text, p_loader text, p_addition text[],
  p_proposal jsonb, p_duration_hours integer, p_expected_draft_revision integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_draft public.pack_drafts%rowtype;
  v_electorate integer;
  v_id uuid;
  v_result jsonb;
begin
  -- Shared group lock order matches transfer, leave and draft saves.
  select id into v_group from public.groups
    where id = p_group_id and owner_id = v_sub for update;
  if v_group is null then
    raise exception using errcode = 'P0001', message = 'Only the group owner may start votes.';
  end if;
  if p_game_version is null or char_length(p_game_version) not between 1 and 50
    or p_game_version !~ '^[A-Za-z0-9_.+-]+$'
    or p_loader is null or p_loader not in ('fabric', 'forge', 'neoforge', 'quilt') then
    raise exception using errcode = 'P0001', message = 'Invalid vote settings.';
  end if;
  if not public.valid_pack_version_ids(p_addition) or cardinality(p_addition) = 0 then
    raise exception using errcode = 'P0001', message = 'Invalid vote selection.';
  end if;
  if not public.valid_vote_proposal(p_proposal, p_addition) then
    raise exception using errcode = 'P0001', message = 'Invalid vote proposal.';
  end if;
  if p_duration_hours is null or p_duration_hours not between 1 and 720 then
    raise exception using errcode = 'P0001', message = 'Invalid vote duration.';
  end if;
  if p_expected_draft_revision is null or p_expected_draft_revision < 0
    or p_expected_draft_revision = 2147483647 then
    raise exception using errcode = 'P0001', message = 'Invalid vote revision.';
  end if;
  -- Opening a vote against a stale draft snapshot would let the group approve an
  -- addition that no longer fits what the owner validated.
  select * into v_draft from public.pack_drafts where group_id = v_group;
  if coalesce(v_draft.revision, 0) <> p_expected_draft_revision then
    raise exception using errcode = 'P0001', message = 'Draft revision conflict.';
  end if;
  if v_draft.group_id is not null then
    if v_draft.game_version <> p_game_version or v_draft.loader <> p_loader then
      raise exception using errcode = 'P0001', message = 'Vote does not match the draft settings.';
    end if;
    if v_draft.version_ids && p_addition then
      raise exception using errcode = 'P0001', message = 'A proposed version is already in the draft.';
    end if;
  end if;
  select count(*) into v_electorate from public.group_members where group_id = v_group;
  if v_electorate = 0 then
    raise exception using errcode = 'P0001', message = 'Only the group owner may start votes.';
  end if;
  insert into public.group_votes(group_id, created_by, game_version, loader, addition,
    proposal, duration_hours, electorate_size, closes_at)
    values (v_group, v_sub, p_game_version, p_loader, p_addition, p_proposal,
      p_duration_hours, v_electorate, now() + make_interval(hours => p_duration_hours))
    returning id into v_id;
  -- The electorate is frozen here, including the owner. Later joiners never vote.
  insert into public.group_vote_electorate(vote_id, user_id)
    select v_id, m.user_id from public.group_members m where m.group_id = v_group;
  select public.vote_snapshot(v, v_sub) into v_result
    from public.group_votes v where v.id = v_id;
  return v_result;
end;
$$;

create function public.cast_group_vote(p_vote_id uuid, p_value text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_vote public.group_votes%rowtype;
  v_approve integer;
  v_result jsonb;
begin
  if p_value is null or p_value not in ('approve', 'reject') then
    raise exception using errcode = 'P0001', message = 'Invalid vote value.';
  end if;
  select * into v_vote from public.group_votes where id = p_vote_id for update;
  if v_vote.id is null or not exists (
    select 1 from public.group_members m
    where m.group_id = v_vote.group_id and m.user_id = v_sub
  ) then
    raise exception using errcode = 'P0001', message = 'Vote not found.';
  end if;
  if not exists (
    select 1 from public.group_vote_electorate e
    where e.vote_id = v_vote.id and e.user_id = v_sub
  ) then
    raise exception using errcode = 'P0001', message = 'Only the fixed electorate may vote.';
  end if;
  if v_vote.status <> 'open' or now() >= v_vote.closes_at then
    raise exception using errcode = 'P0001', message = 'This vote is already closed.';
  end if;
  -- Latest ballot wins; reaching the majority closes the vote immediately.
  insert into public.group_vote_ballots(vote_id, user_id, value)
    values (v_vote.id, v_sub, p_value)
  on conflict (vote_id, user_id) do update
    set value = excluded.value, updated_at = now();
  select count(*) into v_approve from public.group_vote_ballots b
    where b.vote_id = v_vote.id and b.value = 'approve';
  if v_approve * 2 > v_vote.electorate_size then
    update public.group_votes set status = 'approved', resolved_at = now()
      where id = v_vote.id;
  end if;
  select public.vote_snapshot(v, v_sub) into v_result
    from public.group_votes v where v.id = v_vote.id;
  return v_result;
end;
$$;

create function public.cancel_group_vote(p_vote_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_vote public.group_votes%rowtype;
  v_result jsonb;
begin
  select group_id into v_group from public.group_votes where id = p_vote_id;
  if v_group is null then
    raise exception using errcode = 'P0001', message = 'Vote not found.';
  end if;
  perform 1 from public.groups g where g.id = v_group and g.owner_id = v_sub for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Only the group owner may cancel votes.';
  end if;
  select * into v_vote from public.group_votes where id = p_vote_id for update;
  if v_vote.status <> 'open' or now() >= v_vote.closes_at then
    raise exception using errcode = 'P0001', message = 'This vote is already closed.';
  end if;
  update public.group_votes set status = 'cancelled', resolved_at = now()
    where id = v_vote.id;
  select public.vote_snapshot(v, v_sub) into v_result
    from public.group_votes v where v.id = v_vote.id;
  return v_result;
end;
$$;

create function public.incorporate_group_vote(
  p_vote_id uuid, p_expected_draft_revision integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_vote public.group_votes%rowtype;
  v_draft public.pack_drafts%rowtype;
  v_ids text[];
  v_result jsonb;
begin
  if p_expected_draft_revision is null or p_expected_draft_revision < 0
    or p_expected_draft_revision = 2147483647 then
    raise exception using errcode = 'P0001', message = 'Invalid vote revision.';
  end if;
  select group_id into v_group from public.group_votes where id = p_vote_id;
  if v_group is null then
    raise exception using errcode = 'P0001', message = 'Vote not found.';
  end if;
  perform 1 from public.groups g where g.id = v_group and g.owner_id = v_sub for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Only the group owner may incorporate votes.';
  end if;
  select * into v_vote from public.group_votes where id = p_vote_id for update;
  if v_vote.status <> 'approved' then
    raise exception using errcode = 'P0001', message = 'Vote is not approved.';
  end if;
  if v_vote.incorporated_at is not null then
    raise exception using errcode = 'P0001', message = 'Vote is already incorporated.';
  end if;
  -- Same revision compare-and-swap as a draft save: the owner incorporates the
  -- addition they just reviewed, never a selection changed behind their back.
  select * into v_draft from public.pack_drafts where group_id = v_group;
  if coalesce(v_draft.revision, 0) <> p_expected_draft_revision then
    raise exception using errcode = 'P0001', message = 'Draft revision conflict.';
  end if;
  if v_draft.group_id is not null then
    if v_draft.game_version <> v_vote.game_version or v_draft.loader <> v_vote.loader then
      raise exception using errcode = 'P0001', message = 'Vote does not match the draft settings.';
    end if;
    if v_draft.version_ids && v_vote.addition then
      raise exception using errcode = 'P0001', message = 'A proposed version is already in the draft.';
    end if;
    v_ids := v_draft.version_ids || v_vote.addition;
  else
    v_ids := v_vote.addition;
  end if;
  if not public.valid_pack_version_ids(v_ids) then
    raise exception using errcode = 'P0001', message = 'Invalid vote selection.';
  end if;
  insert into public.pack_drafts(group_id, game_version, loader, version_ids, revision)
    values (v_group, v_vote.game_version, v_vote.loader, v_ids, coalesce(v_draft.revision, 0) + 1)
  on conflict (group_id) do update set
    version_ids = excluded.version_ids, revision = excluded.revision, updated_at = now();
  -- Approval never publishes or activates anything; milestone 5 owns versions.
  update public.group_votes set incorporated_at = now() where id = v_vote.id;
  select jsonb_build_object(
    'vote', public.vote_snapshot(v, v_sub),
    'draft', (select jsonb_build_object(
      'gameVersion', d.game_version, 'loader', d.loader, 'versionIds', d.version_ids,
      'revision', d.revision, 'updatedAt', d.updated_at)
      from public.pack_drafts d where d.group_id = v_group)
  ) into v_result from public.group_votes v where v.id = v_vote.id;
  return v_result;
end;
$$;

create function public.group_vote_ballots(
  p_vote_id uuid, p_cursor text default null, p_limit integer default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_result jsonb;
begin
  select v.group_id into v_group
    from public.group_votes v
    join public.group_members m on m.group_id = v.group_id and m.user_id = v_sub
    where v.id = p_vote_id;
  if v_group is null then
    raise exception using errcode = 'P0001', message = 'Vote not found.';
  end if;
  if p_cursor is not null and p_cursor !~ '^user_[A-Za-z0-9]+$' then
    raise exception using errcode = 'P0001', message = 'Invalid vote cursor.';
  end if;
  with candidates as (
    select e.user_id, p.username, b.value, b.cast_at, b.updated_at
    from public.group_vote_electorate e
    left join public.profiles p on p.user_id = e.user_id
    left join public.group_vote_ballots b
      on b.vote_id = e.vote_id and b.user_id = e.user_id
    where e.vote_id = p_vote_id
      and (p_cursor is null or e.user_id > p_cursor)
    order by e.user_id
    limit v_limit + 1
  ),
  kept as (select * from candidates order by user_id limit v_limit)
  select jsonb_build_object(
    'ballots', coalesce((select jsonb_agg(jsonb_build_object(
      'userId', k.user_id, 'username', k.username, 'ballot', k.value,
      'castAt', k.cast_at, 'updatedAt', k.updated_at) order by k.user_id)
      from kept k), '[]'::jsonb),
    'nextCursor', case when (select count(*) from candidates) > v_limit
      then (select k.user_id from kept k order by k.user_id offset v_limit - 1 limit 1)
      else null end
  ) into v_result;
  return v_result;
end;
$$;

create function public.my_group_votes(
  p_cursor text default null, p_limit integer default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_micros bigint;
  v_cursor_id uuid;
  v_result jsonb;
begin
  select m.group_id into v_group from public.group_members m where m.user_id = v_sub;
  if v_group is null then
    raise exception using errcode = 'P0001', message = 'Group required.';
  end if;
  if p_cursor is not null then
    if p_cursor !~ '^[0-9]{1,16}\.[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = 'P0001', message = 'Invalid vote cursor.';
    end if;
    v_micros := split_part(p_cursor, '.', 1)::bigint;
    v_cursor_id := split_part(p_cursor, '.', 2)::uuid;
  end if;
  with candidates as (
    select v.* from public.group_votes v
    where v.group_id = v_group
      and (p_cursor is null or (
        (extract(epoch from v.created_at) * 1000000)::bigint, v.id) < (v_micros, v_cursor_id))
    order by v.created_at desc, v.id desc
    limit v_limit + 1
  ),
  kept as (select * from candidates order by created_at desc, id desc limit v_limit)
  select jsonb_build_object(
    'votes', coalesce((select jsonb_agg(public.vote_snapshot(k, v_sub)
      order by k.created_at desc, k.id desc) from kept k), '[]'::jsonb),
    'nextCursor', case when (select count(*) from candidates) > v_limit
      then (select ((extract(epoch from k.created_at) * 1000000)::bigint)::text || '.' || k.id::text
        from kept k order by k.created_at desc, k.id desc offset v_limit - 1 limit 1)
      else null end
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.open_group_vote(uuid,text,text,text[],jsonb,integer,integer) from public, anon, authenticated;
revoke all on function public.cast_group_vote(uuid,text) from public, anon, authenticated;
revoke all on function public.cancel_group_vote(uuid) from public, anon, authenticated;
revoke all on function public.incorporate_group_vote(uuid,integer) from public, anon, authenticated;
revoke all on function public.group_vote_ballots(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.my_group_votes(text,integer) from public, anon, authenticated;

grant execute on function public.open_group_vote(uuid,text,text,text[],jsonb,integer,integer) to authenticated;
grant execute on function public.cast_group_vote(uuid,text) to authenticated;
grant execute on function public.cancel_group_vote(uuid) to authenticated;
grant execute on function public.incorporate_group_vote(uuid,integer) to authenticated;
grant execute on function public.group_vote_ballots(uuid,text,integer) to authenticated;
grant execute on function public.my_group_votes(text,integer) to authenticated;
