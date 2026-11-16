begin;
select plan(30);

-- Native assertions also run in the isolated supplemental PGlite harness.

select ok((select relrowsecurity from pg_class where oid = 'public.pack_drafts'::regclass), 'RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.pack_drafts', 'INSERT'), 'no direct writes');
select ok(not has_table_privilege('authenticated', 'public.pack_drafts', 'SELECT'), 'no direct reads');
select ok(not has_function_privilege('anon', 'public.my_pack_draft()', 'EXECUTE'), 'no anonymous reads');
select ok(not has_function_privilege('anon', 'public.save_pack_draft(uuid,text,text,text[],integer)', 'EXECUTE'), 'no anonymous writes');

insert into public.profiles(user_id, username) values
  ('user_draftowner', 'DraftOwner'), ('user_draftmember', 'DraftMember'), ('user_draftoutsider', 'DraftOutsider');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_draftowner","role":"authenticated"}', true);
select public.create_group('Draft group', 'public');
select set_config('test.draft_group', public.my_group()->>'id', true);
select ok(public.my_pack_draft()->'draft' = 'null'::jsonb, 'draft starts absent');
select public.save_pack_draft(current_setting('test.draft_group')::uuid, '1.21.1', 'fabric', array['main-v','dep-v'], 0);
select ok(public.my_pack_draft()->'draft'->'versionIds' = '["main-v","dep-v"]'::jsonb, 'exact ordered IDs saved');
select ok(public.my_pack_draft()->'draft'->>'revision' = '1', 'first revision');
select set_config('test.draft_snapshot', (public.my_pack_draft()->'draft')::text, true);
select throws_ok($q$select public.save_pack_draft(current_setting('test.draft_group')::uuid,'1.21.1','fabric',array['other'],0)$q$, 'Draft revision conflict.', 'Draft revision conflict.');
select throws_ok($q$select public.save_pack_draft(current_setting('test.draft_group')::uuid,'bad version','fabric',array['main-v'],1)$q$, 'Invalid draft settings.', 'Invalid draft settings.');
select throws_ok($q$select public.save_pack_draft(current_setting('test.draft_group')::uuid,'1.21.1','unknown',array['main-v'],1)$q$, 'Invalid draft settings.', 'Invalid draft settings.');
select throws_ok($q$select public.save_pack_draft(current_setting('test.draft_group')::uuid,'1.21.1','fabric',array['bad id'],1)$q$, 'Invalid draft selection.', 'Invalid draft selection.');
select throws_ok($q$select public.save_pack_draft(current_setting('test.draft_group')::uuid,'1.21.1','fabric',array['main-v','main-v'],1)$q$, 'Invalid draft selection.', 'Invalid draft selection.');
select throws_ok($q$select public.save_pack_draft(current_setting('test.draft_group')::uuid,'1.21.1','fabric',array[null::text],1)$q$, 'Invalid draft selection.', 'Invalid draft selection.');
select throws_ok($q$select public.save_pack_draft(current_setting('test.draft_group')::uuid,'1.21.1','fabric',array_fill('main-v'::text,array[51]),1)$q$, 'Invalid draft selection.', 'Invalid draft selection.');
select ok((public.my_pack_draft()->'draft')::text = current_setting('test.draft_snapshot'), 'rejected writes preserve the entire row projection');

select set_config('request.jwt.claims', '{"sub":"user_draftoutsider","role":"authenticated"}', true);
select throws_ok('select public.my_pack_draft()', 'Group required.', 'Group required.');
select public.create_group('Other group', 'private');
select ok(public.my_pack_draft()->'draft' = 'null'::jsonb, 'cross-group draft isolation');
select throws_ok($q$select public.save_pack_draft(current_setting('test.draft_group')::uuid,'1.21.1','fabric',array['other'],1)$q$, 'Only the group owner may edit the draft.', 'Only the group owner may edit the draft.');

select set_config('request.jwt.claims', '{"sub":"user_draftmember","role":"authenticated"}', true);
select public.join_public_group(current_setting('test.draft_group')::uuid);
select ok(public.my_pack_draft()->'draft'->>'revision' = '1', 'member can read own group draft');
select throws_ok($q$select public.save_pack_draft(current_setting('test.draft_group')::uuid,'1.21.1','fabric',array['other'],1)$q$, 'Only the group owner may edit the draft.', 'Only the group owner may edit the draft.');
select set_config('request.jwt.claims', '{"sub":"user_draftowner","role":"authenticated"}', true);
select ok((public.my_pack_draft()->'draft')::text = current_setting('test.draft_snapshot'), 'unauthorized writes preserve draft');
select public.transfer_ownership('user_draftmember');
select throws_ok($q$select public.save_pack_draft(current_setting('test.draft_group')::uuid,'1.21.1','fabric',array['other'],1)$q$, 'Only the group owner may edit the draft.', 'Only the group owner may edit the draft.');
select public.leave_group();
select set_config('request.jwt.claims', '{"sub":"user_draftmember","role":"authenticated"}', true);
select public.save_pack_draft(current_setting('test.draft_group')::uuid, '1.21.2', 'quilt', array['main-v','dep-v'], 1);
select ok(public.my_pack_draft()->'draft'->>'revision' = '2', 'new owner can update revision');
select ok(public.my_pack_draft()->'draft'->>'loader' = 'quilt', 'explicit new settings saved');
select public.save_pack_draft(current_setting('test.draft_group')::uuid, '1.21.2', 'quilt', array[]::text[], 2);
select ok(public.my_pack_draft()->'draft'->'versionIds' = '[]'::jsonb, 'owner may explicitly empty selection');
reset role;
update public.pack_drafts set revision = 2147483647 where group_id = current_setting('test.draft_group')::uuid;
set local role authenticated;
select set_config('test.draft_snapshot', (public.my_pack_draft()->'draft')::text, true);
select throws_ok($q$select public.save_pack_draft(current_setting('test.draft_group')::uuid,'1.21.2','quilt',array[]::text[],2147483647)$q$, 'Draft revision conflict.', 'Draft revision conflict.');
select ok((public.my_pack_draft()->'draft')::text = current_setting('test.draft_snapshot'), 'revision exhaustion rejects without overflow or mutation');
select public.leave_group();
reset role;
select ok(not exists(select 1 from public.pack_drafts where group_id = current_setting('test.draft_group')::uuid), 'sole-owner leave cascades draft deletion');
select pass('Draft permissions, revisions, exact selection, isolation and atomic failures');
select * from finish();
rollback;
