-- Milestone 8: provider-side account deletion reconciliation.
--
-- The provider entry point is executable by service_role only and never reads a session.
-- These probes prove the ownership succession rule, the reuse of the ADR0004 cases, the
-- idempotent repeat and that no client role can reach the routine or its shared helper.
begin;
select no_plan();

create function pg_temp.assert(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'PROBE FAIL: %', p_msg; end if; end $$;

create function pg_temp.fp() returns text language sql security definer set search_path = '' as $$
  select md5(
    coalesce((select string_agg(to_jsonb(p)::text, ',' order by p.user_id) from public.profiles p), '')
    || '|' || coalesce((select string_agg(to_jsonb(g)::text, ',' order by g.id) from public.groups g), '')
    || '|' || coalesce((select string_agg(to_jsonb(m)::text, ',' order by m.group_id, m.user_id)
      from public.group_members m), '')
    || '|' || coalesce((select string_agg(to_jsonb(v)::text, ',' order by v.id)
      from public.group_votes v), '')
    || '|' || coalesce((select string_agg(to_jsonb(d)::text, ',' order by d.group_id)
      from public.pack_drafts d), '')
  );
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

create function pg_temp.group_owner(p_group uuid) returns text
language sql security definer set search_path = '' as $$
  select g.owner_id from public.groups g where g.id = p_group;
$$;

create function pg_temp.vote_creator_exists(p_vote uuid, p_sub text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from public.group_votes v where v.id = p_vote and v.created_by = p_sub);
$$;

create function pg_temp.proposal(p_ids text[]) returns jsonb language sql stable as $$
  select jsonb_agg(jsonb_build_object('versionId', item, 'projectId', 'p-' || item,
    'projectTitle', 'Mod ' || item, 'versionNumber', '1.0'))
  from unnest(p_ids) item;
$$;

grant execute on function pg_temp.assert(boolean, text) to authenticated, service_role;
grant execute on function pg_temp.fp() to authenticated, service_role;
grant execute on function pg_temp.profile_exists(text) to authenticated, service_role;
grant execute on function pg_temp.group_exists(uuid) to authenticated, service_role;
grant execute on function pg_temp.membership_exists(uuid, text) to authenticated, service_role;
grant execute on function pg_temp.group_owner(uuid) to authenticated, service_role;
grant execute on function pg_temp.vote_creator_exists(uuid, text) to authenticated, service_role;
grant execute on function pg_temp.proposal(text[]) to authenticated, service_role;

-- The provider routine is unreachable for clients, and its shared helper for every role.
select ok((select prosecdef from pg_proc where oid = 'public.delete_account_for(text)'::regprocedure),
  'The provider routine runs with definer privileges');
select ok(has_function_privilege('service_role', 'public.delete_account_for(text)', 'EXECUTE'),
  'Only the service role may reconcile a provider deletion');
select ok(not has_function_privilege('authenticated', 'public.delete_account_for(text)', 'EXECUTE'),
  'An authenticated session cannot call the provider routine');
select ok(not has_function_privilege('anon', 'public.delete_account_for(text)', 'EXECUTE'),
  'An anonymous caller cannot call the provider routine');
select ok((select prosecdef from pg_proc where oid = 'public.delete_account_as(text, boolean)'::regprocedure),
  'The shared account deletion runs with definer privileges');
select ok(not has_function_privilege('authenticated', 'public.delete_account_as(text, boolean)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.delete_account_as(text, boolean)', 'EXECUTE'),
  'The shared helper is a helper, not a callable entry point');
select ok(has_function_privilege('authenticated', 'public.delete_my_account()', 'EXECUTE'),
  'The session entry point keeps its grant');

insert into public.profiles (user_id, username) values
  ('user_recowner', 'RecOwner'), ('user_recearly', 'RecEarly'), ('user_reclate', 'RecLate'),
  ('user_rectieowner', 'RecTieOwner'), ('user_rectiea', 'RecTieA'), ('user_rectieb', 'RecTieB'),
  ('user_recsolo', 'RecSolo'), ('user_recmember', 'RecMember'), ('user_recheir', 'RecHeir');

-- Case A: an owner with members is replaced by the longest-standing remaining member.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_recowner","role":"authenticated"}', true);
select public.create_group('Reconcile Probe', 'public');
select set_config('probe.group', public.my_group()->>'id', true);
select public.save_pack_draft(current_setting('probe.group')::uuid, '1.21.1', 'fabric', array['rec-main'], 0);
select set_config('request.jwt.claims', '{"sub":"user_recearly","role":"authenticated"}', true);
select public.join_public_group(current_setting('probe.group')::uuid);
select set_config('request.jwt.claims', '{"sub":"user_reclate","role":"authenticated"}', true);
select public.join_public_group(current_setting('probe.group')::uuid);
select set_config('request.jwt.claims', '{"sub":"user_recowner","role":"authenticated"}', true);
select set_config('probe.vote', public.open_group_vote(current_setting('probe.group')::uuid, '1.21.1',
  'fabric', array['rec-vote'], pg_temp.proposal(array['rec-vote']), 24, 1)->>'id', true);

reset role;
set local role service_role;
select set_config('probe.result', public.delete_account_for('user_recowner')::text, true);
reset role;
select pg_temp.assert((current_setting('probe.result')::jsonb->>'deleted')::boolean,
  'A provider deletion deletes the account');
select pg_temp.assert(current_setting('probe.result')::jsonb->>'transferredTo' = 'user_recearly',
  'Ownership passes to the longest-standing remaining member');
select pg_temp.assert((current_setting('probe.result')::jsonb->>'groupDeleted')::boolean = false,
  'The shared group is not deleted');
select pg_temp.assert(pg_temp.group_owner(current_setting('probe.group')::uuid) = 'user_recearly',
  'The stored owner is the successor');
select pg_temp.assert(not pg_temp.profile_exists('user_recowner'), 'The owner profile is deleted');
select pg_temp.assert(not pg_temp.membership_exists(current_setting('probe.group')::uuid, 'user_recowner'),
  'The owner membership is deleted');
select pg_temp.assert(pg_temp.vote_creator_exists(current_setting('probe.vote')::uuid, 'user_recowner'),
  'The vote keeps the deleted creator as a subject tombstone');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_recearly","role":"authenticated"}', true);
select set_config('probe.role', public.my_group()->>'role', true);
reset role;
select pg_temp.assert(current_setting('probe.role') = 'owner', 'The successor owns the group immediately');

-- Case B: equal join times are broken by the subject, deterministically.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_rectieowner","role":"authenticated"}', true);
select public.create_group('Reconcile Tie', 'public');
select set_config('probe.tie', public.my_group()->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_rectieb","role":"authenticated"}', true);
select public.join_public_group(current_setting('probe.tie')::uuid);
select set_config('request.jwt.claims', '{"sub":"user_rectiea","role":"authenticated"}', true);
select public.join_public_group(current_setting('probe.tie')::uuid);
reset role;
update public.group_members set joined_at = timestamptz '2026-01-01 00:00:00+00'
  where group_id = current_setting('probe.tie')::uuid and user_id in ('user_rectiea', 'user_rectieb');
set local role service_role;
select set_config('probe.result', public.delete_account_for('user_rectieowner')::text, true);
reset role;
select pg_temp.assert(current_setting('probe.result')::jsonb->>'transferredTo' = 'user_rectiea',
  'Equal join times resolve to the lower subject');
select pg_temp.assert(pg_temp.group_owner(current_setting('probe.tie')::uuid) = 'user_rectiea',
  'The tie-break is stored');

-- Case C: a member loses only the membership.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_recheir","role":"authenticated"}', true);
select public.create_group('Reconcile Member', 'public');
select set_config('probe.membergroup', public.my_group()->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_recmember","role":"authenticated"}', true);
select public.join_public_group(current_setting('probe.membergroup')::uuid);
reset role;
set local role service_role;
select set_config('probe.result', public.delete_account_for('user_recmember')::text, true);
reset role;
select pg_temp.assert((current_setting('probe.result')::jsonb->>'deleted')::boolean
  and (current_setting('probe.result')::jsonb->>'groupDeleted')::boolean = false,
  'A member reconciliation deletes only the account');
select pg_temp.assert(current_setting('probe.result')::jsonb->>'transferredTo' is null,
  'A member reconciliation transfers nothing');
select pg_temp.assert(pg_temp.group_exists(current_setting('probe.membergroup')::uuid),
  'The group survives the member reconciliation');
select pg_temp.assert(not pg_temp.membership_exists(current_setting('probe.membergroup')::uuid, 'user_recmember'),
  'The member membership is deleted');

-- Case D: the last member deletes the group.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_recsolo","role":"authenticated"}', true);
select public.create_group('Reconcile Solo', 'public');
select set_config('probe.solo', public.my_group()->>'id', true);
reset role;
set local role service_role;
select set_config('probe.result', public.delete_account_for('user_recsolo')::text, true);
reset role;
select pg_temp.assert((current_setting('probe.result')::jsonb->>'groupDeleted')::boolean,
  'The last member still deletes the group');
select pg_temp.assert(not pg_temp.group_exists(current_setting('probe.solo')::uuid),
  'The solo group is gone');
select pg_temp.assert(not pg_temp.profile_exists('user_recsolo'), 'The solo profile is gone');

-- Case E: repetition and absence are idempotent, and an invalid subject writes nothing.
set local role service_role;
select set_config('probe.again', public.delete_account_for('user_recsolo')::text, true);
select set_config('probe.none', public.delete_account_for('user_recabsent')::text, true);
reset role;
select pg_temp.assert((current_setting('probe.again')::jsonb->>'deleted')::boolean = false,
  'A repeated provider event deletes nothing');
select pg_temp.assert((current_setting('probe.none')::jsonb->>'deleted')::boolean = false,
  'An unknown subject deletes nothing');
select set_config('probe.fp_before', pg_temp.fp(), true);
set local role service_role;
select throws_ok($$select public.delete_account_for('not-a-subject')$$, 'P0001',
  'Invalid account subject.', 'An invalid subject is refused');
select throws_ok($$select public.delete_account_for(null)$$, 'P0001',
  'Invalid account subject.', 'A missing subject is refused');
reset role;
select pg_temp.assert(pg_temp.fp() = current_setting('probe.fp_before'),
  'A refused provider subject leaves every row unchanged');

-- An authenticated session cannot reach the provider routine, even with a valid subject.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_recheir","role":"authenticated"}', true);
select throws_ok($$select public.delete_account_for('user_recheir')$$, '42501', null,
  'An authenticated session cannot reconcile a provider deletion');
select throws_ok($$select public.delete_account_as('user_recheir', true)$$, '42501', null,
  'An authenticated session cannot reach the shared helper');

select * from finish();
rollback;
