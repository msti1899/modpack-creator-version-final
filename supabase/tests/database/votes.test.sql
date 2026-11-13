begin;
select plan(1);

-- Native assertions also run in the isolated supplemental PGlite harness.
create function pg_temp.assert(p_ok boolean, p_message text) returns void
language plpgsql as $$ begin
  if p_ok is distinct from true then raise exception 'Vote assertion failed: %', p_message; end if;
end; $$;
create function pg_temp.expect_error(p_sql text, p_message text) returns void
language plpgsql as $$ begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_message then return; end if;
    raise exception 'Expected %, received %', p_message, sqlerrm;
  end;
  raise exception 'Expected rejection: %', p_message;
end; $$;
create function pg_temp.vote_proposal(p_ids text[]) returns jsonb
language sql immutable as $$
  select jsonb_agg(jsonb_build_object(
    'versionId', id, 'projectId', 'p-' || id, 'projectTitle', 'Mod ' || id, 'versionNumber', '1.0'))
  from unnest(p_ids) id;
$$;
-- Votes created in one transaction share created_at, so never assume list order.
create function pg_temp.vote(p_id text) returns jsonb
language sql stable as $$
  select item from jsonb_array_elements(public.my_group_votes(null, 100)->'votes') item
  where item->>'id' = p_id;
$$;
grant execute on function pg_temp.assert(boolean,text) to authenticated;
grant execute on function pg_temp.expect_error(text,text) to authenticated;
grant execute on function pg_temp.vote_proposal(text[]) to authenticated;
grant execute on function pg_temp.vote(text) to authenticated;

select pg_temp.assert((select relrowsecurity from pg_class where oid = 'public.group_votes'::regclass), 'votes RLS enabled');
select pg_temp.assert((select relrowsecurity from pg_class where oid = 'public.group_vote_electorate'::regclass), 'electorate RLS enabled');
select pg_temp.assert((select relrowsecurity from pg_class where oid = 'public.group_vote_ballots'::regclass), 'ballots RLS enabled');
select pg_temp.assert(not has_table_privilege('authenticated', 'public.group_votes', 'SELECT'), 'no direct vote reads');
select pg_temp.assert(not has_table_privilege('authenticated', 'public.group_vote_ballots', 'INSERT'), 'no direct ballot writes');
select pg_temp.assert(not has_function_privilege('anon', 'public.open_group_vote(uuid,text,text,text[],jsonb,integer,integer)', 'EXECUTE'), 'no anonymous vote creation');
select pg_temp.assert(not has_function_privilege('anon', 'public.my_group_votes(text,integer)', 'EXECUTE'), 'no anonymous vote reads');

insert into public.profiles(user_id, username) values
  ('user_voteowner', 'VoteOwner'), ('user_votemember', 'VoteMember'),
  ('user_votelate', 'VoteLate'), ('user_voteother', 'VoteOther');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_voteowner","role":"authenticated"}', true);
select public.create_group('Vote group', 'public');
select set_config('test.vote_group', public.my_group()->>'id', true);
select pg_temp.assert(public.my_group_votes()->'votes' = '[]'::jsonb, 'a new group has no votes');
select pg_temp.expect_error(
  format($q$select public.open_group_vote(%L,'1.21.1','fabric',array['add-v'],pg_temp.vote_proposal(array['add-v']),24,-1)$q$, current_setting('test.vote_group')),
  'Invalid vote revision.');

select set_config('request.jwt.claims', '{"sub":"user_votemember","role":"authenticated"}', true);
select public.join_public_group(current_setting('test.vote_group')::uuid);
select set_config('request.jwt.claims', '{"sub":"user_votelate","role":"authenticated"}', true);
select public.join_public_group(current_setting('test.vote_group')::uuid);
select set_config('request.jwt.claims', '{"sub":"user_voteowner","role":"authenticated"}', true);
select public.save_pack_draft(current_setting('test.vote_group')::uuid, '1.21.1', 'fabric', array['main-v','dep-v'], 0);

-- Owner-only creation, stale revision and malformed payloads change nothing.
select set_config('request.jwt.claims', '{"sub":"user_votemember","role":"authenticated"}', true);
select pg_temp.expect_error(
  format($q$select public.open_group_vote(%L,'1.21.1','fabric',array['add-v'],pg_temp.vote_proposal(array['add-v']),24,1)$q$, current_setting('test.vote_group')),
  'Only the group owner may start votes.');
select set_config('request.jwt.claims', '{"sub":"user_voteowner","role":"authenticated"}', true);
select pg_temp.expect_error(
  format($q$select public.open_group_vote(%L,'1.21.1','fabric',array['add-v'],pg_temp.vote_proposal(array['add-v']),24,0)$q$, current_setting('test.vote_group')),
  'Draft revision conflict.');
select pg_temp.expect_error(
  format($q$select public.open_group_vote(%L,'1.21.1','fabric',array['add-v'],pg_temp.vote_proposal(array['add-v']),0,1)$q$, current_setting('test.vote_group')),
  'Invalid vote duration.');
select pg_temp.expect_error(
  format($q$select public.open_group_vote(%L,'1.21.1','fabric',array['add-v'],pg_temp.vote_proposal(array['add-v']),721,1)$q$, current_setting('test.vote_group')),
  'Invalid vote duration.');
select pg_temp.expect_error(
  format($q$select public.open_group_vote(%L,'1.21.1','forge',array['add-v'],pg_temp.vote_proposal(array['add-v']),24,1)$q$, current_setting('test.vote_group')),
  'Vote does not match the draft settings.');
select pg_temp.expect_error(
  format($q$select public.open_group_vote(%L,'1.21.1','fabric',array['dep-v'],pg_temp.vote_proposal(array['dep-v']),24,1)$q$, current_setting('test.vote_group')),
  'A proposed version is already in the draft.');
select pg_temp.expect_error(
  format($q$select public.open_group_vote(%L,'1.21.1','fabric',array[]::text[],'[]'::jsonb,24,1)$q$, current_setting('test.vote_group')),
  'Invalid vote selection.');
select pg_temp.expect_error(
  format($q$select public.open_group_vote(%L,'1.21.1','fabric',array['add-v','add-v'],pg_temp.vote_proposal(array['add-v','add-v']),24,1)$q$, current_setting('test.vote_group')),
  'Invalid vote selection.');
select pg_temp.expect_error(
  format($q$select public.open_group_vote(%L,'1.21.1','fabric',array['add-v'],'[{"versionId":"add-v"}]'::jsonb,24,1)$q$, current_setting('test.vote_group')),
  'Invalid vote proposal.');
select pg_temp.assert(public.my_group_votes()->'votes' = '[]'::jsonb, 'rejected creations store no vote');

-- Fixed electorate includes the owner; a vote opens open and unresolved.
select set_config('test.vote_one', public.open_group_vote(current_setting('test.vote_group')::uuid, '1.21.1', 'fabric',
  array['add-v'], pg_temp.vote_proposal(array['add-v']), 24, 1)->>'id', true);
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_one'))->>'status' = 'open', 'new vote is open');
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_one'))->>'electorateSize' = '3', 'electorate frozen at creation');
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_one'))->>'myBallot' is null, 'owner has not voted');
select pg_temp.assert((pg_temp.vote(current_setting('test.vote_one'))->'proposal'->0->>'projectTitle') = 'Mod add-v', 'proposal snapshot stored');
reset role;
select pg_temp.assert((select count(*) from public.group_vote_electorate where vote_id = current_setting('test.vote_one')::uuid) = 3, 'three electorate rows');
set local role authenticated;

-- Latest ballot wins, and the majority closes the vote immediately.
select set_config('request.jwt.claims', '{"sub":"user_votemember","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('test.vote_one')::uuid, 'approve');
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_one'))->>'approveCount' = '1', 'first approval counted');
select public.cast_group_vote(current_setting('test.vote_one')::uuid, 'reject');
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_one'))->>'approveCount' = '0', 'changed ballot replaces approval');
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_one'))->>'rejectCount' = '1', 'changed ballot counted once');
select public.cast_group_vote(current_setting('test.vote_one')::uuid, 'approve');
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_one'))->>'approveCount' = '1', 'restored approval replaces rejection');
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_one'))->>'status' = 'open', 'one approval of three stays open');
select set_config('request.jwt.claims', '{"sub":"user_votelate","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('test.vote_one')::uuid, 'approve');
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_one'))->>'status' = 'approved', 'absolute majority approves early');
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_one'))->>'resolvedAt' is not null, 'approval records resolution');
select set_config('request.jwt.claims', '{"sub":"user_voteowner","role":"authenticated"}', true);
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_one'))->>'myBallot' is null, 'owner is not forced to vote');
select set_config('request.jwt.claims', '{"sub":"user_votemember","role":"authenticated"}', true);
select pg_temp.expect_error(
  format($q$select public.cast_group_vote(%L,'reject')$q$, current_setting('test.vote_one')),
  'This vote is already closed.');

-- Approval alone never edits the draft; incorporation is owner-only and guarded.
select set_config('request.jwt.claims', '{"sub":"user_voteowner","role":"authenticated"}', true);
select pg_temp.assert(public.my_pack_draft()->'draft'->'versionIds' = '["main-v","dep-v"]'::jsonb, 'approval leaves the draft intact');
select set_config('request.jwt.claims', '{"sub":"user_votemember","role":"authenticated"}', true);
select pg_temp.expect_error(
  format($q$select public.incorporate_group_vote(%L,1)$q$, current_setting('test.vote_one')),
  'Only the group owner may incorporate votes.');
select set_config('request.jwt.claims', '{"sub":"user_voteowner","role":"authenticated"}', true);
select pg_temp.expect_error(
  format($q$select public.incorporate_group_vote(%L,0)$q$, current_setting('test.vote_one')),
  'Draft revision conflict.');
select public.incorporate_group_vote(current_setting('test.vote_one')::uuid, 1);
select pg_temp.assert(public.my_pack_draft()->'draft'->'versionIds' = '["main-v","dep-v","add-v"]'::jsonb, 'incorporation appends the pinned addition');
select pg_temp.assert(public.my_pack_draft()->'draft'->>'revision' = '2', 'incorporation bumps the draft revision');
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_one'))->>'incorporatedAt' is not null, 'incorporation recorded');
select pg_temp.expect_error(
  format($q$select public.incorporate_group_vote(%L,2)$q$, current_setting('test.vote_one')),
  'Vote is already incorporated.');

-- Cancellation is terminal and binds nothing.
select set_config('test.vote_two', public.open_group_vote(current_setting('test.vote_group')::uuid, '1.21.1', 'fabric',
  array['next-v'], pg_temp.vote_proposal(array['next-v']), 1, 2)->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_votemember","role":"authenticated"}', true);
select pg_temp.expect_error(
  format($q$select public.cancel_group_vote(%L)$q$, current_setting('test.vote_two')),
  'Only the group owner may cancel votes.');
select set_config('request.jwt.claims', '{"sub":"user_voteowner","role":"authenticated"}', true);
select public.cancel_group_vote(current_setting('test.vote_two')::uuid);
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_two'))->>'status' = 'cancelled', 'owner cancels an open vote');
select pg_temp.expect_error(
  format($q$select public.incorporate_group_vote(%L,2)$q$, current_setting('test.vote_two')),
  'Vote is not approved.');
select set_config('request.jwt.claims', '{"sub":"user_votemember","role":"authenticated"}', true);
select pg_temp.expect_error(
  format($q$select public.cast_group_vote(%L,'approve')$q$, current_setting('test.vote_two')),
  'This vote is already closed.');

-- Expiry without the majority reads as rejected and refuses every write.
select set_config('request.jwt.claims', '{"sub":"user_voteowner","role":"authenticated"}', true);
select set_config('test.vote_three', public.open_group_vote(current_setting('test.vote_group')::uuid, '1.21.1', 'fabric',
  array['late-v'], pg_temp.vote_proposal(array['late-v']), 2, 2)->>'id', true);
reset role;
-- Move the whole window into the past; the table keeps closes_at after created_at.
update public.group_votes
  set created_at = now() - interval '3 hours', closes_at = now() - interval '1 minute'
  where id = current_setting('test.vote_three')::uuid;
set local role authenticated;
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_three'))->>'status' = 'rejected', 'expired vote reads rejected');
select set_config('request.jwt.claims', '{"sub":"user_votemember","role":"authenticated"}', true);
select pg_temp.expect_error(
  format($q$select public.cast_group_vote(%L,'approve')$q$, current_setting('test.vote_three')),
  'This vote is already closed.');
select set_config('request.jwt.claims', '{"sub":"user_voteowner","role":"authenticated"}', true);
select pg_temp.expect_error(
  format($q$select public.cancel_group_vote(%L)$q$, current_setting('test.vote_three')),
  'This vote is already closed.');

-- A departure does not change the frozen electorate or the threshold.
select set_config('test.vote_four', public.open_group_vote(current_setting('test.vote_group')::uuid, '1.21.1', 'fabric',
  array['extra-v'], pg_temp.vote_proposal(array['extra-v']), 24, 2)->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_votemember","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('test.vote_four')::uuid, 'approve');
select public.leave_group();
select set_config('request.jwt.claims', '{"sub":"user_votelate","role":"authenticated"}', true);
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_four'))->>'approveCount' = '1', 'departed ballot stays counted');
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_four'))->>'electorateSize' = '3', 'departure keeps the electorate size');
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_four'))->>'status' = 'open', 'one approval of three is not a majority');
select public.cast_group_vote(current_setting('test.vote_four')::uuid, 'approve');
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_four'))->>'status' = 'approved', 'majority uses the frozen electorate');

-- Later joiners read but never vote in a vote opened before they joined.
select set_config('request.jwt.claims', '{"sub":"user_voteowner","role":"authenticated"}', true);
select set_config('test.vote_five', public.open_group_vote(current_setting('test.vote_group')::uuid, '1.21.1', 'fabric',
  array['five-v'], pg_temp.vote_proposal(array['five-v']), 24, 2)->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_votemember","role":"authenticated"}', true);
select public.join_public_group(current_setting('test.vote_group')::uuid);
select pg_temp.assert(pg_temp.vote(current_setting('test.vote_five'))->>'electorateSize' = '2', 'electorate stays at its creation size');
select pg_temp.expect_error(
  format($q$select public.cast_group_vote(%L,'approve')$q$, current_setting('test.vote_five')),
  'Only the fixed electorate may vote.');

-- Ballot reads expose the frozen electorate and reject outsiders.
select pg_temp.assert(public.group_vote_ballots(current_setting('test.vote_five')::uuid)->'ballots'->0 ? 'username', 'ballots carry a username');
select pg_temp.assert(jsonb_array_length(public.group_vote_ballots(current_setting('test.vote_five')::uuid)->'ballots') = 2, 'ballot page lists the whole electorate');
select set_config('request.jwt.claims', '{"sub":"user_voteother","role":"authenticated"}', true);
select public.create_group('Other vote group', 'public');
select set_config('test.other_group', public.my_group()->>'id', true);
select pg_temp.assert(public.my_group_votes()->'votes' = '[]'::jsonb, 'cross-group vote isolation');
select pg_temp.expect_error(
  format($q$select public.group_vote_ballots(%L)$q$, current_setting('test.vote_five')),
  'Vote not found.');
select pg_temp.expect_error(
  format($q$select public.cast_group_vote(%L,'approve')$q$, current_setting('test.vote_five')),
  'Vote not found.');
select pg_temp.expect_error(
  format($q$select public.incorporate_group_vote(%L,0)$q$, current_setting('test.vote_one')),
  'Only the group owner may incorporate votes.');

-- Keyset pagination over several votes, then cascade deletion with the group.
select public.open_group_vote(current_setting('test.other_group')::uuid, '1.21.1', 'fabric', array['one-v'], pg_temp.vote_proposal(array['one-v']), 24, 0);
select public.open_group_vote(current_setting('test.other_group')::uuid, '1.21.1', 'fabric', array['two-v'], pg_temp.vote_proposal(array['two-v']), 24, 0);
select public.open_group_vote(current_setting('test.other_group')::uuid, '1.21.1', 'fabric', array['three-v'], pg_temp.vote_proposal(array['three-v']), 24, 0);
select pg_temp.assert(jsonb_array_length(public.my_group_votes(null, 2)->'votes') = 2, 'page returns the requested size');
select set_config('test.vote_cursor', public.my_group_votes(null, 2)->>'nextCursor', true);
select pg_temp.assert(jsonb_array_length(public.my_group_votes(current_setting('test.vote_cursor'), 2)->'votes') = 1, 'cursor returns the remainder');
select pg_temp.assert(public.my_group_votes(current_setting('test.vote_cursor'), 2)->>'nextCursor' is null, 'last page has no cursor');
select public.leave_group();
reset role;
select pg_temp.assert(not exists(select 1 from public.group_votes where group_id = current_setting('test.other_group')::uuid), 'sole-owner leave cascades votes');
select pg_temp.assert(not exists(select 1 from public.group_vote_electorate e join public.group_votes v on v.id = e.vote_id where v.group_id = current_setting('test.other_group')::uuid), 'electorate cascades');
select pass('Vote creation, frozen electorate, ballots, majority, cancellation, expiry, incorporation, isolation and pagination');
select * from finish();
rollback;
