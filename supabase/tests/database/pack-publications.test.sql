begin;
select plan(1);

-- Native assertions also run in the isolated supplemental PGlite harness.
create function pg_temp.assert(p_ok boolean, p_message text) returns void
language plpgsql as $$ begin
  if p_ok is distinct from true then raise exception 'Publication assertion failed: %', p_message; end if;
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
grant execute on function pg_temp.assert(boolean,text) to authenticated;
grant execute on function pg_temp.expect_error(text,text) to authenticated;

select pg_temp.assert((select relrowsecurity from pg_class where oid = 'public.pack_publications'::regclass), 'RLS enabled');
select pg_temp.assert(not has_table_privilege('authenticated', 'public.pack_publications', 'SELECT'), 'no direct reads');
select pg_temp.assert(not has_table_privilege('authenticated', 'public.pack_publications', 'INSERT'), 'no direct writes');
select pg_temp.assert(not has_table_privilege('authenticated', 'public.pack_publications', 'UPDATE'), 'no direct updates');
select pg_temp.assert(not has_function_privilege('anon', 'public.my_pack_publications(integer,integer)', 'EXECUTE'), 'no anonymous reads');
select pg_temp.assert(not has_function_privilege('anon', 'public.my_pack_publication(uuid)', 'EXECUTE'), 'no anonymous detail reads');
select pg_temp.assert(not has_function_privilege('anon', 'public.publish_pack_draft(text,text,text,integer)', 'EXECUTE'), 'no anonymous publishing');
select pg_temp.assert(not has_function_privilege('anon', 'public.activate_pack_publication(uuid)', 'EXECUTE'), 'no anonymous activation');
select pg_temp.assert(not has_function_privilege('authenticated', 'public.pack_publication_json(public.pack_publications)', 'EXECUTE'), 'the projection is not a client RPC');
select pg_temp.assert(not has_function_privilege('authenticated', 'public.current_clerk_sub()', 'EXECUTE'), 'the subject helper is not a client RPC');

insert into public.profiles(user_id, username) values
  ('user_pubowner', 'PubOwner'), ('user_pubmember', 'PubMember'), ('user_puboutsider', 'PubOutsider');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_pubowner","role":"authenticated"}', true);
select public.create_group('Publish group', 'public');
select set_config('test.pub_group', public.my_group()->>'id', true);
select pg_temp.assert(public.my_pack_publications(20, null)->'publications' = '[]'::jsonb, 'a new group has no publications');
select pg_temp.expect_error($q$select public.publish_pack_draft('Friends','1.0.0','0.16.0',1)$q$, 'Draft not found.');

select public.save_pack_draft(current_setting('test.pub_group')::uuid, '1.21.1', 'fabric', array['main-v','dep-v'], 0);
select set_config('test.pub_first', (public.publish_pack_draft('Friends','1.0.0','0.16.0',1))::text, true);
select pg_temp.assert((current_setting('test.pub_first')::jsonb->'publication'->>'sequence') = '1', 'first publication sequence');
select pg_temp.assert((current_setting('test.pub_first')::jsonb->'publication'->>'active') = 'false', 'publishing never activates');
select pg_temp.assert((current_setting('test.pub_first')::jsonb->'publication'->'versionIds') = '["main-v","dep-v"]'::jsonb, 'exact approved versions are frozen');
select pg_temp.assert((current_setting('test.pub_first')::jsonb->'publication'->>'name') = 'Friends', 'presentation metadata is frozen');
select set_config('test.pub_first_id', current_setting('test.pub_first')::jsonb->'publication'->>'id', true);

select set_config('test.pub_second', (public.publish_pack_draft('Friends','1.0.1','0.16.0',1))::text, true);
select pg_temp.assert((current_setting('test.pub_second')::jsonb->'publication'->>'sequence') = '2', 'republishing increments the sequence');
select set_config('test.pub_second_id', current_setting('test.pub_second')::jsonb->'publication'->>'id', true);
select pg_temp.assert(public.my_pack_publications(20, null)->'publications'->0->>'sequence' = '2', 'newest publication first');
select pg_temp.assert(public.my_pack_publications(20, null)->'publications'->1->>'sequence' = '1', 'earlier publications are preserved');
select pg_temp.assert(public.my_pack_publications(20, null)->>'activePublicationId' is null, 'nothing is active after publishing');
select pg_temp.assert(public.my_pack_publications(1, null)->>'nextBeforeSequence' = '2', 'a full page returns a keyset cursor');
select pg_temp.assert(public.my_pack_publications(1, 2)->'publications'->0->>'sequence' = '1', 'the cursor resumes the next page');
select pg_temp.assert(public.my_pack_publications(1, 2)->'nextBeforeSequence' = 'null'::jsonb, 'the last page has no cursor');
select pg_temp.assert(jsonb_array_length(public.my_pack_publications(2, 3)->'publications') = 2, 'an exactly-full final page keeps both rows');
select pg_temp.assert(public.my_pack_publications(2, 3)->'nextBeforeSequence' = 'null'::jsonb, 'an exactly-full final page has no cursor');
select pg_temp.expect_error($q$select public.my_pack_publications(0, null)$q$, 'Invalid page request.');
select pg_temp.expect_error($q$select public.my_pack_publications(51, null)$q$, 'Invalid page request.');
select pg_temp.expect_error($q$select public.my_pack_publications(20, 0)$q$, 'Invalid page request.');

select public.activate_pack_publication(current_setting('test.pub_first_id')::uuid);
select pg_temp.assert(public.my_pack_publications(20, null)->>'activePublicationId' = current_setting('test.pub_first_id'), 'the owner activates an older version');
select public.activate_pack_publication(current_setting('test.pub_second_id')::uuid);
select pg_temp.assert(public.my_pack_publications(20, null)->>'activePublicationId' = current_setting('test.pub_second_id'), 'activation replaces the previous active version');
select pg_temp.assert((select count(*) from jsonb_array_elements(public.my_pack_publications(20, null)->'publications') e
  where e->>'active' = 'true') = 1, 'exactly one version stays active');
select pg_temp.expect_error($q$select public.activate_pack_publication('00000000-0000-4000-8000-000000000000')$q$, 'Publication not found.');

-- A later draft edit and a later publication never rewrite history or activation.
select set_config('test.pub_active_snapshot', (public.my_pack_publications(20, null))::text, true);
select public.save_pack_draft(current_setting('test.pub_group')::uuid, '1.21.1', 'fabric', array['main-v'], 1);
select pg_temp.assert(public.my_pack_draft()->'draft'->>'revision' = '2', 'the draft changed after publishing');
select pg_temp.assert((public.my_pack_publications(20, null))::text = current_setting('test.pub_active_snapshot'), 'a draft edit preserves every frozen publication and the active version');
select pg_temp.assert(public.my_pack_publication(current_setting('test.pub_first_id')::uuid)->'publication'->'versionIds' = '["main-v","dep-v"]'::jsonb, 'an earlier publication keeps its frozen selection after a draft edit');
select set_config('test.pub_revised', (public.publish_pack_draft('Friends','1.1.0','0.16.0',2))::text, true);
select pg_temp.assert((current_setting('test.pub_revised')::jsonb->'publication'->>'sequence') = '3', 'a later publication gets the next sequence');
select pg_temp.assert(public.my_pack_publications(20, null)->>'activePublicationId' = current_setting('test.pub_second_id'), 'publishing again leaves the active version untouched');
select pg_temp.assert(public.my_pack_publication(current_setting('test.pub_first_id')::uuid)->'publication'->'versionIds' = '["main-v","dep-v"]'::jsonb, 'the first publication is still unchanged');
select pg_temp.assert(public.my_pack_publication(current_setting('test.pub_first_id')::uuid)->'publication'->>'name' = 'Friends', 'a later publication preserves the first name');
select pg_temp.assert(public.my_pack_publication(current_setting('test.pub_first_id')::uuid)->'publication'->>'version' = '1.0.0', 'a later publication preserves the first version');
select pg_temp.assert(public.my_pack_publication(current_setting('test.pub_first_id')::uuid)->'publication'->>'loaderVersion' = '0.16.0', 'a later publication preserves the first loader version');
select pg_temp.assert((current_setting('test.pub_revised')::jsonb->'publication'->>'active') = 'false', 'a later publication is never active');

select set_config('test.pub_snapshot', (public.my_pack_publications(20, null))::text, true);
select pg_temp.expect_error($q$select public.publish_pack_draft('','1.0.0','0.16.0',1)$q$, 'Invalid publication details.');
select pg_temp.expect_error($q$select public.publish_pack_draft(' Friends','1.0.0','0.16.0',1)$q$, 'Invalid publication details.');
select pg_temp.expect_error($q$select public.publish_pack_draft('Fr'||chr(65279)||'iends','1.0.0','0.16.0',1)$q$, 'Invalid publication details.');
select pg_temp.expect_error('select public.publish_pack_draft(' || quote_literal('A'||chr(129)||'B') || ',' || quote_literal('1.0.0') || ',' || quote_literal('0.16.0') || ',1)', 'Invalid publication details.');
select pg_temp.expect_error('select public.publish_pack_draft(' || quote_literal(chr(133)) || ',' || quote_literal('1.0.0') || ',' || quote_literal('0.16.0') || ',1)', 'Invalid publication details.');
select pg_temp.expect_error($q$select public.publish_pack_draft('Friends','','0.16.0',1)$q$, 'Invalid publication details.');
select pg_temp.expect_error($q$select public.publish_pack_draft('Friends','1.0.0','bad version',1)$q$, 'Invalid publication details.');
select pg_temp.expect_error($q$select public.publish_pack_draft('Friends','1.0.0','0.16.0',0)$q$, 'Draft revision conflict.');
select pg_temp.expect_error($q$select public.publish_pack_draft('Friends','1.0.0','0.16.0',99)$q$, 'Draft revision conflict.');
select pg_temp.assert((public.my_pack_publications(20, null))::text = current_setting('test.pub_snapshot'), 'rejected writes preserve every publication and the active version');

select set_config('request.jwt.claims', '{"sub":"user_pubmember","role":"authenticated"}', true);
select public.join_public_group(current_setting('test.pub_group')::uuid);
select pg_temp.assert(public.my_pack_publication(current_setting('test.pub_first_id')::uuid)->'publication'->>'sequence' = '1', 'a member reads a published version');
select pg_temp.assert(public.my_pack_publication(current_setting('test.pub_first_id')::uuid)->>'role' = 'member', 'a member is not reported as owner');
select pg_temp.expect_error($q$select public.publish_pack_draft('Friends','2.0.0','0.16.0',1)$q$, 'Only the group owner may manage published versions.');
select pg_temp.expect_error($q$select public.activate_pack_publication(current_setting('test.pub_first_id')::uuid)$q$, 'Only the group owner may manage published versions.');

select set_config('request.jwt.claims', '{"sub":"user_puboutsider","role":"authenticated"}', true);
select pg_temp.expect_error('select public.my_pack_publications(20, null)', 'Group required.');
select public.create_group('Other publish group', 'private');
select set_config('test.pub_other_group', public.my_group()->>'id', true);
select pg_temp.assert(public.my_pack_publications(20, null)->'publications' = '[]'::jsonb, 'another group never sees foreign publications');
select pg_temp.expect_error($q$select public.my_pack_publication(current_setting('test.pub_first_id')::uuid)$q$, 'Publication not found.');

select set_config('request.jwt.claims', '{"sub":"user_pubowner","role":"authenticated"}', true);
select public.transfer_ownership('user_pubmember');
select pg_temp.expect_error($q$select public.publish_pack_draft('Friends','3.0.0','0.16.0',1)$q$, 'Only the group owner may manage published versions.');
select pg_temp.expect_error($q$select public.activate_pack_publication(current_setting('test.pub_first_id')::uuid)$q$, 'Only the group owner may manage published versions.');
select pg_temp.assert(public.my_pack_publication(current_setting('test.pub_first_id')::uuid) is not null, 'a former owner still reads the history');
select public.leave_group();

select set_config('request.jwt.claims', '{"sub":"user_pubmember","role":"authenticated"}', true);
select set_config('test.pub_third', (public.publish_pack_draft('Friends','3.0.0','0.16.0',2))::text, true);
select pg_temp.assert((current_setting('test.pub_third')::jsonb->'publication'->>'sequence') = '4', 'the new owner publishes the next sequence');
select public.leave_group();
reset role;

select pg_temp.assert(not exists(select 1 from public.pack_publications where group_id = current_setting('test.pub_group')::uuid), 'sole-owner leave cascades publication deletion');
select pg_temp.assert(not exists(select 1 from public.pack_drafts where group_id = current_setting('test.pub_group')::uuid), 'the draft cascades with the group');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_puboutsider","role":"authenticated"}', true);
select public.save_pack_draft(current_setting('test.pub_other_group')::uuid, '1.21.1', 'fabric', array['main-v','dep-v'], 0);
select public.publish_pack_draft('Other','1.0.0','0.16.0',1);
select public.save_pack_draft(current_setting('test.pub_other_group')::uuid, '1.21.1', 'fabric', array[]::text[], 1);
select pg_temp.expect_error($q$select public.publish_pack_draft('Other','1.0.1','0.16.0',2)$q$, 'Cannot publish an empty draft.');
reset role;
update public.pack_publications set sequence = 2147483647 where group_id = current_setting('test.pub_other_group')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_puboutsider","role":"authenticated"}', true);
select public.save_pack_draft(current_setting('test.pub_other_group')::uuid, '1.21.1', 'fabric', array['main-v','dep-v'], 2);
select pg_temp.expect_error($q$select public.publish_pack_draft('Other','1.0.1','0.16.0',3)$q$, 'Publication limit reached.');
select pass('Publication snapshots, activation, paging, isolation and atomic failures');
select * from finish();
rollback;
