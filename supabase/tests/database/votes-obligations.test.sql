-- Verification-derived regression coverage for the M7 voting obligation.
--
-- These probes were written by an independent read-only verifier and pass unchanged.
-- They cover what the feature suite does not: a satisfied incorporation writes no draft
-- row and no publication row, a partial overlap writes nothing at all, settings are
-- checked before satisfaction, a pending obligation blocks no publication, activation,
-- membership or transfer, ordering across approved votes is the owner's choice, a
-- multi-element addition is satisfied in a different order, and the no-draft path is
-- unchanged.
begin;
select plan(1);

create function pg_temp.assert(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'PROBE FAIL: %', p_msg; end if; end $$;

create function pg_temp.expect_error(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm = p_msg then return; end if;
    raise exception 'PROBE FAIL: expected [%] got [%]', p_msg, sqlerrm;
  end;
  raise exception 'PROBE FAIL: expected rejection [%] but call succeeded', p_msg;
end $$;

create function pg_temp.fp_data() returns text language sql security definer set search_path='' as $$
  select md5(
    coalesce((select to_jsonb(d)::text || d.xmin::text from public.pack_drafts d
              where d.group_id = current_setting('probe.group')::uuid), 'no-draft')
    || '|' || coalesce((select string_agg(to_jsonb(p)::text, ',' order by p.sequence) from public.pack_publications p
              where p.group_id = current_setting('probe.group')::uuid), '')
  );
$$;

create function pg_temp.fp_all() returns text language sql security definer set search_path='' as $$
  select md5(pg_temp.fp_data() || '|' ||
    coalesce((select string_agg(to_jsonb(v)::text || v.xmin::text, ',' order by v.id) from public.group_votes v
              where v.group_id = current_setting('probe.group')::uuid), '')
    || '|' || coalesce((select string_agg(to_jsonb(b)::text, ',' order by b.vote_id, b.user_id)
              from public.group_vote_ballots b join public.group_votes v on v.id = b.vote_id
              where v.group_id = current_setting('probe.group')::uuid), '')
    || '|' || coalesce((select string_agg(to_jsonb(e)::text, ',' order by e.vote_id, e.user_id)
              from public.group_vote_electorate e join public.group_votes v on v.id = e.vote_id
              where v.group_id = current_setting('probe.group')::uuid), ''));
$$;

create function pg_temp.vote(p_id text) returns jsonb language sql stable as $$
  select item from jsonb_array_elements(public.my_group_votes(null, 100)->'votes') item
  where item->>'id' = p_id;
$$;

create function pg_temp.fp_pubs() returns text language sql security definer set search_path='' as $$
  select md5(coalesce((select string_agg(to_jsonb(p)::text, ',' order by p.sequence) from public.pack_publications p
    where p.group_id = current_setting('probe.group')::uuid), ''));
$$;
create function pg_temp.pub_count() returns bigint language sql security definer set search_path='' as $$
  select count(*) from public.pack_publications where group_id = current_setting('probe.group')::uuid;
$$;
create function pg_temp.active_pub_count() returns bigint language sql security definer set search_path='' as $$
  select count(*) from public.pack_publications where group_id = current_setting('probe.group')::uuid and is_active;
$$;
create function pg_temp.active_pub_versions() returns text[] language sql security definer set search_path='' as $$
  select version_ids from public.pack_publications where group_id = current_setting('probe.group')::uuid and is_active;
$$;

create function pg_temp.proposal(p_ids text[]) returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('versionId', id, 'projectId', 'p-' || id,
    'projectTitle', 'Mod ' || id, 'versionNumber', '1.0')) from unnest(p_ids) id;
$$;
grant execute on function pg_temp.assert(boolean,text) to authenticated;
grant execute on function pg_temp.expect_error(text,text) to authenticated;
grant execute on function pg_temp.fp_data() to authenticated;
grant execute on function pg_temp.fp_all() to authenticated;
grant execute on function pg_temp.vote(text) to authenticated;
grant execute on function pg_temp.proposal(text[]) to authenticated;
grant execute on function pg_temp.pub_count() to authenticated;
grant execute on function pg_temp.fp_pubs() to authenticated;
grant execute on function pg_temp.active_pub_count() to authenticated;
grant execute on function pg_temp.active_pub_versions() to authenticated;

create temp table probe_result (label text primary key, body jsonb);
create temp table probe_id (label text primary key, value text);
grant all on probe_result to authenticated;
grant all on probe_id to authenticated;

insert into public.profiles(user_id, username) values
  ('user_verifym7owner','VerifyOwner'), ('user_verifym7a','VerifyA'),
  ('user_verifym7b','VerifyB'), ('user_verifym7late','VerifyLate');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_verifym7owner","role":"authenticated"}', true);
select public.create_group('Verify M7 probe', 'public');
select set_config('probe.group', public.my_group()->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_verifym7a","role":"authenticated"}', true);
select public.join_public_group(current_setting('probe.group')::uuid);
select set_config('request.jwt.claims', '{"sub":"user_verifym7b","role":"authenticated"}', true);
select public.join_public_group(current_setting('probe.group')::uuid);
select set_config('request.jwt.claims', '{"sub":"user_verifym7owner","role":"authenticated"}', true);
select public.save_pack_draft(current_setting('probe.group')::uuid,'1.21.1','fabric',array['main-v','dep-v'],0);
insert into probe_result select 'pub1', public.publish_pack_draft('Pack One','1.0.0','0.16.1',1);
insert into probe_id select 'pub1', body->'publication'->>'id' from probe_result where label='pub1';
insert into probe_result select 'act1', public.activate_pack_publication((select value::uuid from probe_id where label='pub1'));
select pg_temp.assert((select body->>'activePublicationId' from probe_result where label='act1') is not null, 'publication activated');

-- CASE A: satisfied incorporation after a manual save adds the same addition.
select set_config('probe.vote1', public.open_group_vote(current_setting('probe.group')::uuid,'1.21.1','fabric',
  array['add-v'], pg_temp.proposal(array['add-v']), 24, 1)->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_verifym7a","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote1')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7b","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote1')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7owner","role":"authenticated"}', true);
select pg_temp.assert(pg_temp.vote(current_setting('probe.vote1'))->>'status' = 'approved', 'vote1 approved');
select public.save_pack_draft(current_setting('probe.group')::uuid,'1.21.1','fabric',array['main-v','dep-v','add-v'],1);
select set_config('probe.fp_data_before', pg_temp.fp_data(), true);
select pg_temp.assert(pg_temp.vote(current_setting('probe.vote1'))->>'incorporatedAt' is null, 'vote1 pending after manual save');
insert into probe_result select 'sat', public.incorporate_group_vote(current_setting('probe.vote1')::uuid,2);
select pg_temp.assert((select body->'draft'->>'revision' from probe_result where label='sat') = '2', 'CASE A satisfied response keeps revision 2');
select pg_temp.assert((select body->'draft'->'versionIds' from probe_result where label='sat') = '["main-v","dep-v","add-v"]'::jsonb, 'CASE A satisfied response keeps selection');
select pg_temp.assert((select body->'vote'->>'incorporatedAt' from probe_result where label='sat') is not null, 'CASE A satisfied response discharges vote');
select pg_temp.assert(pg_temp.fp_data() = current_setting('probe.fp_data_before'), 'CASE A satisfied writes no draft and no publication row');
select pg_temp.assert(pg_temp.vote(current_setting('probe.vote1'))->>'incorporatedAt' is not null, 'CASE A vote list shows discharged');
select pg_temp.assert(pg_temp.active_pub_count() = 1, 'CASE A one active publication');

-- CASE B: partial overlap writes nothing, then the owner can discharge it.
select set_config('probe.vote2', public.open_group_vote(current_setting('probe.group')::uuid,'1.21.1','fabric',
  array['partial-a','partial-b'], pg_temp.proposal(array['partial-a','partial-b']), 24, 2)->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_verifym7a","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote2')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7b","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote2')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7owner","role":"authenticated"}', true);
select public.save_pack_draft(current_setting('probe.group')::uuid,'1.21.1','fabric',array['main-v','dep-v','add-v','partial-a'],2);
select set_config('probe.fp_before', pg_temp.fp_all(), true);
select pg_temp.expect_error(format('select public.incorporate_group_vote(%L,3)', current_setting('probe.vote2')),
  'A proposed version is already in the draft.');
select pg_temp.assert(pg_temp.fp_all() = current_setting('probe.fp_before'), 'CASE B partial overlap wrote nothing at all');
select pg_temp.assert(pg_temp.vote(current_setting('probe.vote2'))->>'incorporatedAt' is null, 'CASE B vote stays pending');
select public.save_pack_draft(current_setting('probe.group')::uuid,'1.21.1','fabric',array['main-v','dep-v','add-v'],3);
insert into probe_result select 'partial_ok', public.incorporate_group_vote(current_setting('probe.vote2')::uuid,4);
select pg_temp.assert((select body->'draft'->'versionIds' from probe_result where label='partial_ok') =
  '["main-v","dep-v","add-v","partial-a","partial-b"]'::jsonb, 'CASE B owner discharges after removing the overlap');
select pg_temp.assert(pg_temp.vote(current_setting('probe.vote2'))->>'incorporatedAt' is not null, 'CASE B vote discharged');

-- CASE C: stale revision and changed settings keep their exact messages and write nothing.
select set_config('probe.vote3', public.open_group_vote(current_setting('probe.group')::uuid,'1.21.1','fabric',
  array['stale-v'], pg_temp.proposal(array['stale-v']), 24, 5)->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_verifym7a","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote3')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7b","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote3')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7owner","role":"authenticated"}', true);
select set_config('probe.fp_before', pg_temp.fp_all(), true);
select pg_temp.expect_error(format('select public.incorporate_group_vote(%L,4)', current_setting('probe.vote3')),
  'Draft revision conflict.');
select pg_temp.assert(pg_temp.fp_all() = current_setting('probe.fp_before'), 'CASE C stale revision wrote nothing');
select public.save_pack_draft(current_setting('probe.group')::uuid,'1.21.1','forge',array['main-v','dep-v','add-v','partial-a','partial-b'],5);
select set_config('probe.fp_before', pg_temp.fp_all(), true);
select pg_temp.expect_error(format('select public.incorporate_group_vote(%L,6)', current_setting('probe.vote3')),
  'Vote does not match the draft settings.');
select pg_temp.assert(pg_temp.fp_all() = current_setting('probe.fp_before'), 'CASE C settings mismatch wrote nothing');
select public.save_pack_draft(current_setting('probe.group')::uuid,'1.21.1','fabric',array['main-v','dep-v','add-v','partial-a','partial-b'],6);
insert into probe_result select 'settings_ok', public.incorporate_group_vote(current_setting('probe.vote3')::uuid,7);
select pg_temp.assert((select body->'draft'->>'revision' from probe_result where label='settings_ok') = '8', 'CASE C restored settings allow incorporation');

-- CASE D: previous owner refused after transfer; new owner succeeds.
select set_config('probe.vote4', public.open_group_vote(current_setting('probe.group')::uuid,'1.21.1','fabric',
  array['transfer-v'], pg_temp.proposal(array['transfer-v']), 24, 8)->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_verifym7a","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote4')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7b","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote4')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7owner","role":"authenticated"}', true);
select public.transfer_ownership('user_verifym7a');
select set_config('probe.fp_before', pg_temp.fp_all(), true);
select pg_temp.expect_error(format('select public.incorporate_group_vote(%L,8)', current_setting('probe.vote4')),
  'Only the group owner may incorporate votes.');
select pg_temp.assert(pg_temp.fp_all() = current_setting('probe.fp_before'), 'CASE D previous owner refusal wrote nothing');
select set_config('request.jwt.claims', '{"sub":"user_verifym7a","role":"authenticated"}', true);
insert into probe_result select 'transfer_ok', public.incorporate_group_vote(current_setting('probe.vote4')::uuid,8);
select pg_temp.assert((select body->'draft'->>'revision' from probe_result where label='transfer_ok') = '9', 'CASE D new owner discharges and bumps revision');
select pg_temp.assert((select body->'vote'->>'incorporatedAt' from probe_result where label='transfer_ok') is not null, 'CASE D transferred vote discharged');

-- CASE E: an approved vote stays pending across an unrelated draft save.
select set_config('probe.vote5', public.open_group_vote(current_setting('probe.group')::uuid,'1.21.1','fabric',
  array['unrelated-v'], pg_temp.proposal(array['unrelated-v']), 24, 9)->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_verifym7b","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote5')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7owner","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote5')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7a","role":"authenticated"}', true);
select public.save_pack_draft(current_setting('probe.group')::uuid,'1.21.1','fabric',
  array['main-v','dep-v','add-v','partial-a','partial-b','stale-v','transfer-v','other-v'],9);
select pg_temp.assert(pg_temp.vote(current_setting('probe.vote5'))->>'status' = 'approved'
  and pg_temp.vote(current_setting('probe.vote5'))->>'incorporatedAt' is null,
  'CASE E approved vote remains a pending obligation across an unrelated save');
select set_config('request.jwt.claims', '{"sub":"user_verifym7a","role":"authenticated"}', true);
insert into probe_result select 'unrelated_ok', public.incorporate_group_vote(current_setting('probe.vote5')::uuid,10);
select pg_temp.assert((select body->'draft'->>'revision' from probe_result where label='unrelated_ok') = '11', 'CASE E unrelated vote incorporated');

-- CASE F: exact refusal messages and no writes for every remaining rejection.
select set_config('probe.vote6', public.open_group_vote(current_setting('probe.group')::uuid,'1.21.1','fabric',
  array['open-v'], pg_temp.proposal(array['open-v']), 24, 11)->>'id', true);
select set_config('probe.fp_before', pg_temp.fp_all(), true);
select pg_temp.expect_error(format('select public.incorporate_group_vote(%L,11)', current_setting('probe.vote6')),
  'Vote is not approved.');
select pg_temp.assert(pg_temp.fp_all() = current_setting('probe.fp_before'), 'CASE F not-approved wrote nothing');
select pg_temp.expect_error(format('select public.incorporate_group_vote(%L,11)', current_setting('probe.vote1')),
  'Vote is already incorporated.');
select pg_temp.assert(pg_temp.fp_all() = current_setting('probe.fp_before'), 'CASE F already-incorporated wrote nothing');
select pg_temp.expect_error(format('select public.incorporate_group_vote(%L,null)', current_setting('probe.vote6')),
  'Invalid vote revision.');
select pg_temp.expect_error(format('select public.incorporate_group_vote(%L,-1)', current_setting('probe.vote6')),
  'Invalid vote revision.');
select pg_temp.expect_error('select public.incorporate_group_vote(''00000000-0000-4000-8000-000000000000''::uuid,11)',
  'Vote not found.');
select set_config('request.jwt.claims', '{"sub":"user_verifym7late","role":"authenticated"}', true);
select pg_temp.expect_error(format('select public.incorporate_group_vote(%L,11)', current_setting('probe.vote6')),
  'Only the group owner may incorporate votes.');
select pg_temp.assert(pg_temp.fp_all() = current_setting('probe.fp_before'), 'CASE F non-owner and not-found wrote nothing');

-- CASE G: a pending obligation blocks no publication, activation, membership or transfer.
select set_config('request.jwt.claims', '{"sub":"user_verifym7a","role":"authenticated"}', true);
select set_config('probe.vote7', public.open_group_vote(current_setting('probe.group')::uuid,'1.21.1','fabric',
  array['block-v'], pg_temp.proposal(array['block-v']), 24, 11)->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_verifym7b","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote7')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7owner","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote7')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7a","role":"authenticated"}', true);
select public.save_pack_draft(current_setting('probe.group')::uuid,'1.21.1','fabric',
  array['main-v','dep-v','add-v','partial-a','partial-b','stale-v','transfer-v','other-v','blockless-v'],11);
insert into probe_result select 'pub3', public.publish_pack_draft('Pack Two','2.0.0','0.16.1',12);
insert into probe_id select 'pub3', body->'publication'->>'id' from probe_result where label='pub3';
insert into probe_result select 'act3', public.activate_pack_publication((select value::uuid from probe_id where label='pub3'));
select pg_temp.assert((select body->>'activePublicationId' from probe_result where label='act3') is not null, 'CASE G publication activated while pending');
select set_config('request.jwt.claims', '{"sub":"user_verifym7late","role":"authenticated"}', true);
select public.join_public_group(current_setting('probe.group')::uuid);
select set_config('request.jwt.claims', '{"sub":"user_verifym7a","role":"authenticated"}', true);
select public.transfer_ownership('user_verifym7b');
select set_config('request.jwt.claims', '{"sub":"user_verifym7b","role":"authenticated"}', true);
select pg_temp.assert(pg_temp.vote(current_setting('probe.vote7'))->>'incorporatedAt' is null, 'CASE G transfer keeps obligation pending');
select set_config('probe.fp_data_before', pg_temp.fp_data(), true);
select set_config('probe.fp_pubs_before', pg_temp.fp_pubs(), true);
insert into probe_result select 'block_ok', public.incorporate_group_vote(current_setting('probe.vote7')::uuid,12);
select pg_temp.assert((select body->'draft'->>'revision' from probe_result where label='block_ok') = '13', 'CASE G new owner discharges pending vote');
select pg_temp.assert(pg_temp.active_pub_count() = 1, 'CASE G exactly one active publication after all incorporations');
select pg_temp.assert(pg_temp.active_pub_versions() = array['main-v','dep-v','add-v','partial-a','partial-b','stale-v','transfer-v','other-v','blockless-v']::text[], 'CASE G active publication snapshot is the pre-vote publication');
select pg_temp.assert(pg_temp.pub_count() = 2, 'CASE G publication rows untouched by votes');
select pg_temp.assert(pg_temp.fp_pubs() = current_setting('probe.fp_pubs_before'), 'CASE G incorporation wrote no publication row');

-- CASE H: ordering across several approved votes is the owner's choice, no queue.
select set_config('request.jwt.claims', '{"sub":"user_verifym7b","role":"authenticated"}', true);
select set_config('probe.vote8', public.open_group_vote(current_setting('probe.group')::uuid,'1.21.1','fabric',
  array['order-a'], pg_temp.proposal(array['order-a']), 24, 13)->>'id', true);
select set_config('probe.vote9', public.open_group_vote(current_setting('probe.group')::uuid,'1.21.1','fabric',
  array['order-b'], pg_temp.proposal(array['order-b']), 24, 13)->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_verifym7a","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote8')::uuid,'approve');
select public.cast_group_vote(current_setting('probe.vote9')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7owner","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote8')::uuid,'approve');
select public.cast_group_vote(current_setting('probe.vote9')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7late","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote8')::uuid,'approve');
select public.cast_group_vote(current_setting('probe.vote9')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7b","role":"authenticated"}', true);
select pg_temp.assert(pg_temp.vote(current_setting('probe.vote8'))->>'status' = 'approved'
  and pg_temp.vote(current_setting('probe.vote9'))->>'status' = 'approved', 'CASE H both independent votes approved');
insert into probe_result select 'order_b', public.incorporate_group_vote(current_setting('probe.vote9')::uuid,13);
select pg_temp.assert((select body->'draft'->>'revision' from probe_result where label='order_b') = '14', 'CASE H second-created vote incorporated first');
insert into probe_result select 'order_a', public.incorporate_group_vote(current_setting('probe.vote8')::uuid,14);
select pg_temp.assert((select body->'draft'->>'revision' from probe_result where label='order_a') = '15', 'CASE H first-created vote incorporated second');
select pg_temp.assert(pg_temp.vote(current_setting('probe.vote8'))->>'incorporatedAt' is not null
  and pg_temp.vote(current_setting('probe.vote9'))->>'incorporatedAt' is not null, 'CASE H both obligations discharged without a queue');

-- CASE I: a multi-element addition present in full, in a different order, is satisfied.
select set_config('request.jwt.claims', '{"sub":"user_verifym7b","role":"authenticated"}', true);
select set_config('probe.vote10', public.open_group_vote(current_setting('probe.group')::uuid,'1.21.1','fabric',
  array['x1','x2'], pg_temp.proposal(array['x1','x2']), 24, 15)->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_verifym7a","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote10')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7owner","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote10')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7late","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote10')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7b","role":"authenticated"}', true);
select public.save_pack_draft(current_setting('probe.group')::uuid,'1.21.1','fabric',
  array['main-v','dep-v','add-v','partial-a','partial-b','stale-v','transfer-v','other-v','blockless-v','block-v','order-b','order-a','x2','x1'],15);
select set_config('probe.fp_data_before', pg_temp.fp_data(), true);
insert into probe_result select 'multi_sat', public.incorporate_group_vote(current_setting('probe.vote10')::uuid,16);
select pg_temp.assert((select body->'draft'->>'revision' from probe_result where label='multi_sat') = '16', 'CASE I multi-element satisfied keeps revision');
select pg_temp.assert((select body->'draft'->'versionIds' from probe_result where label='multi_sat') =
  '["main-v","dep-v","add-v","partial-a","partial-b","stale-v","transfer-v","other-v","blockless-v","block-v","order-b","order-a","x2","x1"]'::jsonb, 'CASE I multi-element satisfied keeps selection');
select pg_temp.assert(pg_temp.fp_data() = current_setting('probe.fp_data_before'), 'CASE I multi-element satisfied wrote nothing');
select pg_temp.assert(pg_temp.vote(current_setting('probe.vote10'))->>'incorporatedAt' is not null, 'CASE I multi-element vote discharged');

-- CASE J: settings are checked before satisfaction, so a present addition with changed settings is refused.
select set_config('probe.vote11', public.open_group_vote(current_setting('probe.group')::uuid,'1.21.1','fabric',
  array['y1'], pg_temp.proposal(array['y1']), 24, 16)->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_verifym7a","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote11')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7owner","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote11')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7late","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote11')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7b","role":"authenticated"}', true);
select public.save_pack_draft(current_setting('probe.group')::uuid,'1.21.1','forge',
  array['main-v','dep-v','add-v','partial-a','partial-b','stale-v','transfer-v','other-v','blockless-v','block-v','order-b','order-a','x2','x1','y1'],16);
select set_config('probe.fp_before', pg_temp.fp_all(), true);
select pg_temp.expect_error(format('select public.incorporate_group_vote(%L,17)', current_setting('probe.vote11')),
  'Vote does not match the draft settings.');
select pg_temp.assert(pg_temp.fp_all() = current_setting('probe.fp_before'), 'CASE J present addition with changed settings wrote nothing');
select pg_temp.assert(pg_temp.vote(current_setting('probe.vote11'))->>'incorporatedAt' is null, 'CASE J present addition with changed settings stays pending');

-- CASE K: the no-draft incorporation path is unchanged (creates the draft, revision 1).
reset role;
insert into public.profiles(user_id, username) values
  ('user_verifym7new','VerifyNew'), ('user_verifym7new2','VerifyNew2');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_verifym7new","role":"authenticated"}', true);
select public.create_group('Verify M7 empty', 'public');
select set_config('probe.group2', public.my_group()->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_verifym7new2","role":"authenticated"}', true);
select public.join_public_group(current_setting('probe.group2')::uuid);
select set_config('request.jwt.claims', '{"sub":"user_verifym7new","role":"authenticated"}', true);
select set_config('probe.vote12', public.open_group_vote(current_setting('probe.group2')::uuid,'1.21.1','fabric',
  array['first-v'], pg_temp.proposal(array['first-v']), 24, 0)->>'id', true);
select set_config('request.jwt.claims', '{"sub":"user_verifym7new2","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote12')::uuid,'approve');
select set_config('request.jwt.claims', '{"sub":"user_verifym7new","role":"authenticated"}', true);
select public.cast_group_vote(current_setting('probe.vote12')::uuid,'approve');
insert into probe_result select 'empty_draft', public.incorporate_group_vote(current_setting('probe.vote12')::uuid,0);
select pg_temp.assert((select body->'draft'->>'revision' from probe_result where label='empty_draft') = '1', 'CASE K no-draft incorporation creates revision 1');
select pg_temp.assert((select body->'draft'->'versionIds' from probe_result where label='empty_draft') = '["first-v"]'::jsonb, 'CASE K no-draft incorporation stores the addition');
select pg_temp.assert((select body->'vote'->>'incorporatedAt' from probe_result where label='empty_draft') is not null, 'CASE K no-draft incorporation discharges the vote');

select pass('Voting obligation: satisfied, partial, stale, settings, transfer, pending-read and ordering contracts');
select * from finish();
rollback;
