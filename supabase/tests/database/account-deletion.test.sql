-- Milestone 8: account deletion, retention and refusal.
--
-- Fixtures are built through the RPCs the product uses, so the suite also proves that
-- deletion works on rows created by the real group, draft, publication and vote paths.
-- Every claim about "writes nothing" compares a fingerprint of every affected table.
-- Tables are closed to clients, so each observation goes through a definer helper.
begin;
select no_plan();

create function pg_temp.assert(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'PROBE FAIL: %', p_msg; end if; end $$;

-- Every table an account deletion can touch, in one comparable value.
create function pg_temp.fp() returns text language sql security definer set search_path = '' as $$
  select md5(
    coalesce((select string_agg(to_jsonb(p)::text, ',' order by p.user_id) from public.profiles p), '')
    || '|' || coalesce((select string_agg(to_jsonb(g)::text, ',' order by g.id) from public.groups g), '')
    || '|' || coalesce((select string_agg(to_jsonb(m)::text, ',' order by m.group_id, m.user_id)
      from public.group_members m), '')
    || '|' || coalesce((select string_agg(to_jsonb(d)::text, ',' order by d.group_id)
      from public.pack_drafts d), '')
    || '|' || coalesce((select string_agg(to_jsonb(p)::text, ',' order by p.id)
      from public.pack_publications p), '')
    || '|' || coalesce((select string_agg(to_jsonb(v)::text, ',' order by v.id)
      from public.group_votes v), '')
    || '|' || coalesce((select string_agg(to_jsonb(e)::text, ',' order by e.vote_id, e.user_id)
      from public.group_vote_electorate e), '')
    || '|' || coalesce((select string_agg(to_jsonb(b)::text, ',' order by b.vote_id, b.user_id)
      from public.group_vote_ballots b), '')
    || '|' || coalesce((select string_agg(to_jsonb(i)::text, ',' order by i.id)
      from public.group_invitations i), '')
    || '|' || coalesce((select string_agg(to_jsonb(r)::text, ',' order by r.id)
      from public.group_join_requests r), '')
  );
$$;

create function pg_temp.vote(p_id text) returns jsonb language sql stable as $$
  select item from jsonb_array_elements(public.my_group_votes(null, 100)->'votes') item
  where item->>'id' = p_id;
$$;

create function pg_temp.proposal(p_ids text[]) returns jsonb language sql stable as $$
  select jsonb_agg(jsonb_build_object('versionId', item, 'projectId', 'p-' || item,
    'projectTitle', 'Mod ' || item, 'versionNumber', '1.0'))
  from unnest(p_ids) item;
$$;

create function pg_temp.profile_exists(p_sub text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.user_id = p_sub);
$$;

create function pg_temp.group_exists(p_group uuid) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from public.groups g where g.id = p_group);
$$;

create function pg_temp.membership_exists(p_group uuid, p_sub text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = p_sub);
$$;

create function pg_temp.draft_count(p_group uuid) returns bigint
language sql security definer set search_path = '' as $$
  select count(*) from public.pack_drafts d where d.group_id = p_group;
$$;

create function pg_temp.publication_count(p_group uuid) returns bigint
language sql security definer set search_path = '' as $$
  select count(*) from public.pack_publications p where p.group_id = p_group;
$$;

create function pg_temp.electorate_has(p_vote uuid, p_sub text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from public.group_vote_electorate e where e.vote_id = p_vote and e.user_id = p_sub);
$$;

create function pg_temp.ballot_has(p_vote uuid, p_sub text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from public.group_vote_ballots b where b.vote_id = p_vote and b.user_id = p_sub);
$$;

create function pg_temp.vote_creator(p_vote uuid) returns text
language sql security definer set search_path = '' as $$
  select v.created_by from public.group_votes v where v.id = p_vote;
$$;

create function pg_temp.invitation_creator(p_group uuid) returns text
language sql security definer set search_path = '' as $$
  select i.created_by from public.group_invitations i where i.group_id = p_group;
$$;

create function pg_temp.request_decider(p_group uuid, p_sub text) returns text
language sql security definer set search_path = '' as $$
  select r.decided_by from public.group_join_requests r where r.group_id = p_group and r.user_id = p_sub;
$$;

create function pg_temp.request_exists(p_group uuid, p_sub text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from public.group_join_requests r where r.group_id = p_group and r.user_id = p_sub);
$$;

grant execute on function pg_temp.assert(boolean, text) to authenticated;
grant execute on function pg_temp.fp() to authenticated;
grant execute on function pg_temp.vote(text) to authenticated;
grant execute on function pg_temp.proposal(text[]) to authenticated;
grant execute on function pg_temp.profile_exists(text) to authenticated;
grant execute on function pg_temp.group_exists(uuid) to authenticated;
grant execute on function pg_temp.membership_exists(uuid, text) to authenticated;
grant execute on function pg_temp.draft_count(uuid) to authenticated;
grant execute on function pg_temp.publication_count(uuid) to authenticated;
grant execute on function pg_temp.electorate_has(uuid, text) to authenticated;
grant execute on function pg_temp.ballot_has(uuid, text) to authenticated;
grant execute on function pg_temp.vote_creator(uuid) to authenticated;
grant execute on function pg_temp.invitation_creator(uuid) to authenticated;
grant execute on function pg_temp.request_decider(uuid, text) to authenticated;
grant execute on function pg_temp.request_exists(uuid, text) to authenticated;

-- One callable entry point, one definer function, no client access to helpers.
select ok((select prosecdef from pg_proc where oid = 'public.delete_my_account()'::regprocedure),
  'The deletion routine runs with definer privileges');
select ok(has_function_privilege('authenticated', 'public.delete_my_account()', 'EXECUTE'),
  'Authenticated callers may delete their own account');
select ok(not has_function_privilege('anon', 'public.delete_my_account()', 'EXECUTE'),
  'Anonymous callers cannot delete an account');
select ok(not has_function_privilege('authenticated', 'public.current_clerk_sub()', 'EXECUTE'),
  'The subject resolver stays a helper, not a client RPC');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
  'Clients still cannot delete profiles directly');
select ok(not exists (select 1 from pg_constraint where conname in (
  'group_invitations_created_by_fkey', 'group_join_requests_decided_by_fkey',
  'group_votes_created_by_fkey', 'group_vote_electorate_user_id_fkey')),
  'Historical subject columns no longer depend on a deletable profile');
select ok(exists (select 1 from pg_constraint where conname = 'groups_owner_id_fkey')
  and exists (select 1 from pg_constraint where conname = 'group_members_user_id_fkey'),
  'The two keys that protect group ownership and membership remain');

insert into public.profiles (user_id, username) values
  ('user_delowner', 'DelOwner'), ('user_delmember', 'DelMember'), ('user_delvoter', 'DelVoter'),
  ('user_delsolo', 'DelSolo'), ('user_deldecider', 'DelDecider'), ('user_deljoiner', 'DelJoiner'),
  ('user_delpending', 'DelPending'), ('user_deloutsider', 'DelOutsider');

-- Group A: a public group with an owner, two members, a draft, a publication and a vote.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_delowner","role":"authenticated"}', true);
select public.create_group('Delete Probe', 'public');
select set_config('probe.group', public.my_group()->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_delmember","role":"authenticated"}', true);
select public.join_public_group(current_setting('probe.group')::uuid);
select set_config('request.jwt.claims', '{"sub":"user_delvoter","role":"authenticated"}', true);
select public.join_public_group(current_setting('probe.group')::uuid);
select set_config('request.jwt.claims', '{"sub":"user_delowner","role":"authenticated"}', true);
select public.save_pack_draft(current_setting('probe.group')::uuid, '1.21.1', 'fabric', array['main-v', 'dep-v'], 0);
select public.publish_pack_draft('Delete Pack', '1.0.0', '0.16.0', 1);
select set_config('probe.opened', public.open_group_vote(current_setting('probe.group')::uuid, '1.21.1',
  'fabric', array['vote-x'], pg_temp.proposal(array['vote-x']), 24, 1)::text, true);
select set_config('probe.vote', current_setting('probe.opened')::jsonb->>'id', true);
select set_config('probe.electorate', current_setting('probe.opened')::jsonb->>'electorateSize', true);
select pg_temp.assert(current_setting('probe.electorate')::int = 3, 'The vote freezes three participants');
select set_config('request.jwt.claims', '{"sub":"user_delvoter","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote')::uuid, 'approve');

-- An owner with other members is refused and the refusal writes nothing.
select set_config('request.jwt.claims', '{"sub":"user_delowner","role":"authenticated"}', true);
select set_config('probe.fp_before', pg_temp.fp(), true);
select throws_ok($$select public.delete_my_account()$$, 'P0001',
  'Transfers are required before leaving a group with other members.',
  'An owner with other members cannot delete the account');
select pg_temp.assert(pg_temp.fp() = current_setting('probe.fp_before'),
  'The refused deletion leaves every row unchanged');
select pg_temp.assert(pg_temp.profile_exists('user_delowner'), 'The refused deletion keeps the profile');

-- A member deletes the account: the group and its records survive.
select set_config('request.jwt.claims', '{"sub":"user_delmember","role":"authenticated"}', true);
select set_config('probe.removed', public.delete_my_account()::text, true);
select pg_temp.assert((current_setting('probe.removed')::jsonb->>'deleted')::boolean,
  'A member deletes the account');
select pg_temp.assert((current_setting('probe.removed')::jsonb->>'groupDeleted')::boolean = false,
  'The surviving group is reported as not deleted');
select pg_temp.assert(current_setting('probe.removed')::jsonb->>'groupId' = current_setting('probe.group'),
  'The response names the group the account left');
select pg_temp.assert(not pg_temp.profile_exists('user_delmember'), 'The profile row is deleted');
select pg_temp.assert(not pg_temp.membership_exists(current_setting('probe.group')::uuid, 'user_delmember'),
  'The membership row is deleted');
select pg_temp.assert(pg_temp.group_exists(current_setting('probe.group')::uuid),
  'The group survives a member deletion');
select pg_temp.assert(pg_temp.draft_count(current_setting('probe.group')::uuid) = 1,
  'The draft survives a member deletion');
select pg_temp.assert(pg_temp.publication_count(current_setting('probe.group')::uuid) = 1,
  'The published version survives a member deletion');
select pg_temp.assert(pg_temp.electorate_has(current_setting('probe.vote')::uuid, 'user_delmember'),
  'The frozen electorate keeps the departed subject');
select pg_temp.assert(pg_temp.ballot_has(current_setting('probe.vote')::uuid, 'user_delvoter'),
  'A cast ballot survives another account deletion');
select set_config('request.jwt.claims', '{"sub":"user_delowner","role":"authenticated"}', true);
select pg_temp.assert((pg_temp.vote(current_setting('probe.vote'))->>'electorateSize')::int
  = current_setting('probe.electorate')::int, 'The electorate size is unchanged');
select pg_temp.assert((pg_temp.vote(current_setting('probe.vote'))->>'approveCount')::int = 1,
  'The approval count is unchanged');

-- The username is released immediately, exactly like a rename.
select set_config('request.jwt.claims', '{"sub":"user_delreuse","role":"authenticated"}', true);
select lives_ok($$insert into public.profiles (user_id, username) values ((auth.jwt()->>'sub'), 'DELMEMBER')$$,
  'A deleted username is immediately reusable regardless of casing');
select pg_temp.assert(pg_temp.profile_exists('user_delreuse'), 'The reusing account owns a profile now');

-- The current owner transfers and then deletes: group records keep the subject.
select set_config('request.jwt.claims', '{"sub":"user_delowner","role":"authenticated"}', true);
select public.transfer_ownership('user_delvoter');
select set_config('probe.removed', public.delete_my_account()::text, true);
select pg_temp.assert((current_setting('probe.removed')::jsonb->>'groupDeleted')::boolean = false,
  'A transferred owner deletes only the account');
select pg_temp.assert(pg_temp.group_exists(current_setting('probe.group')::uuid),
  'The group survives an owner deletion after transfer');
select pg_temp.assert(pg_temp.vote_creator(current_setting('probe.vote')::uuid) = 'user_delowner',
  'The vote keeps the deleted creator as a subject tombstone');
select set_config('request.jwt.claims', '{"sub":"user_delvoter","role":"authenticated"}', true);
select pg_temp.assert((pg_temp.vote(current_setting('probe.vote'))->>'electorateSize')::int
  = current_setting('probe.electorate')::int, 'The new owner reads the same frozen electorate');
select pg_temp.assert((pg_temp.vote(current_setting('probe.vote'))->>'approveCount')::int = 1,
  'The new owner reads the same approval count');
select set_config('probe.role', public.my_group()->>'role', true);
select pg_temp.assert(current_setting('probe.role') = 'owner', 'The successor owns the group immediately');

-- A last owner deletes the group and everything under it.
select set_config('request.jwt.claims', '{"sub":"user_delsolo","role":"authenticated"}', true);
select public.create_group('Solo Probe', 'public');
select set_config('probe.solo', public.my_group()->>'id', true);
select public.save_pack_draft(current_setting('probe.solo')::uuid, '1.21.1', 'fabric', array['solo-v'], 0);
select set_config('probe.removed', public.delete_my_account()::text, true);
select pg_temp.assert((current_setting('probe.removed')::jsonb->>'groupDeleted')::boolean,
  'The last member deletes the group');
select pg_temp.assert(not pg_temp.group_exists(current_setting('probe.solo')::uuid),
  'The group row is gone');
select pg_temp.assert(pg_temp.draft_count(current_setting('probe.solo')::uuid) = 0,
  'The draft is gone with the group');
select pg_temp.assert(not pg_temp.profile_exists('user_delsolo'), 'The last owner profile is deleted');

-- Invitation creator and request decider survive as subjects of a surviving group.
select set_config('request.jwt.claims', '{"sub":"user_deldecider","role":"authenticated"}', true);
select public.create_group('Tombstone Probe', 'private');
select set_config('probe.private', public.my_group()->>'id', true);
select set_config('probe.token', public.create_invitation()->>'token', true);
select set_config('request.jwt.claims', '{"sub":"user_deljoiner","role":"authenticated"}', true);
select public.request_join(current_setting('probe.token'));

-- A pending request belongs to the departing account, so it goes with it.
select set_config('request.jwt.claims', '{"sub":"user_delpending","role":"authenticated"}', true);
select public.request_join(current_setting('probe.token'));
select set_config('probe.pending', public.delete_my_account()::text, true);
select pg_temp.assert((current_setting('probe.pending')::jsonb->>'deleted')::boolean,
  'An account with only a pending request deletes');
select pg_temp.assert(not pg_temp.request_exists(current_setting('probe.private')::uuid, 'user_delpending'),
  'The pending request goes with the deleted account');
select set_config('request.jwt.claims', '{"sub":"user_deldecider","role":"authenticated"}', true);
select public.approve_join_request('user_deljoiner');
select public.transfer_ownership('user_deljoiner');
select set_config('probe.removed', public.delete_my_account()::text, true);
select pg_temp.assert((current_setting('probe.removed')::jsonb->>'deleted')::boolean,
  'A former owner deletes the account after a transfer');
select pg_temp.assert(pg_temp.invitation_creator(current_setting('probe.private')::uuid) = 'user_deldecider',
  'The invitation keeps the deleted creator as a subject tombstone');
select pg_temp.assert(pg_temp.request_decider(current_setting('probe.private')::uuid, 'user_deljoiner')
  = 'user_deldecider', 'The approved request keeps the deleted decider as a subject tombstone');
select set_config('request.jwt.claims', '{"sub":"user_deloutsider","role":"authenticated"}', true);
select lives_ok(format('select public.resolve_invitation(%L)', current_setting('probe.token')),
  'A deleted profile does not break invitation resolution for others');

-- Repetition and absence are idempotent, not failures.
select set_config('request.jwt.claims', '{"sub":"user_deldecider","role":"authenticated"}', true);
select set_config('probe.again', public.delete_my_account()::text, true);
select pg_temp.assert((current_setting('probe.again')::jsonb->>'deleted')::boolean = false,
  'A repeated deletion reports that nothing was deleted');
select pg_temp.assert(current_setting('probe.again')::jsonb->>'groupId' is null,
  'A repeated deletion reports no group');
select set_config('request.jwt.claims', '{"sub":"user_delabsent","role":"authenticated"}', true);
select set_config('probe.none', public.delete_my_account()::text, true);
select pg_temp.assert((current_setting('probe.none')::jsonb->>'deleted')::boolean = false,
  'An account without a profile reports nothing to delete');

-- A caller without a Clerk subject is refused before any write.
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.delete_my_account()$$, 'P0001', 'Authentication required.',
  'A missing subject cannot delete anything');

select * from finish();
rollback;
