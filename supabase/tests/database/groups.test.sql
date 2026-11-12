begin;
select no_plan();

select ok((select prosecdef from pg_proc where oid = 'public.check_group_owner_membership()'::regprocedure),
  'Deferred membership checks retain privilege at authenticated commit on PostgreSQL 17');

-- Schema and privileges: group tables are RPC-only.
select has_table('public', 'groups', 'Groups are persisted');
select has_table('public', 'group_members', 'Group memberships are persisted');
select has_table('public', 'group_invitations', 'Group invitations are persisted');
select has_table('public', 'group_join_requests', 'Group join requests are persisted');
select ok((select relrowsecurity from pg_class where oid = 'public.groups'::regclass), 'Groups enforce RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.group_members'::regclass), 'Memberships enforce RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.group_invitations'::regclass), 'Invitations enforce RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.group_join_requests'::regclass), 'Join requests enforce RLS');

select ok(not has_table_privilege('anon', 'public.groups', 'SELECT'), 'Anonymous callers cannot read groups');
select ok(not has_table_privilege('authenticated', 'public.groups', 'SELECT'), 'Users cannot read group rows directly');
select ok(not has_table_privilege('anon', 'public.group_members', 'SELECT'), 'Anonymous callers cannot read memberships');
select ok(not has_table_privilege('authenticated', 'public.group_members', 'INSERT'), 'Users cannot insert memberships directly');
select ok(not has_table_privilege('anon', 'public.group_invitations', 'SELECT'), 'Anonymous callers cannot read invitations');
select ok(not has_table_privilege('authenticated', 'public.group_invitations', 'INSERT'), 'Users cannot insert invitations directly');
select ok(not has_table_privilege('anon', 'public.group_join_requests', 'SELECT'), 'Anonymous callers cannot read requests');
select ok(not has_table_privilege('authenticated', 'public.group_join_requests', 'UPDATE'), 'Users cannot update request rows directly');

select ok(has_function_privilege('authenticated', 'public.create_group(text,text)', 'EXECUTE'), 'create_group is a client RPC');
select ok(to_regprocedure('public.list_public_groups()') is null, 'No unrequested public group-discovery RPC is exposed');
select ok(has_function_privilege('authenticated', 'public.my_group()', 'EXECUTE'), 'my_group is a client RPC');
select ok(has_function_privilege('authenticated', 'public.join_public_group(uuid)', 'EXECUTE'), 'join_public_group is a client RPC');
select ok(has_function_privilege('authenticated', 'public.create_invitation()', 'EXECUTE'), 'create_invitation is a client RPC');
select ok(has_function_privilege('authenticated', 'public.revoke_invitation()', 'EXECUTE'), 'revoke_invitation is a client RPC');
select ok(has_function_privilege('authenticated', 'public.resolve_invitation(text)', 'EXECUTE'), 'resolve_invitation is a client RPC');
select ok(has_function_privilege('authenticated', 'public.request_join(text)', 'EXECUTE'), 'request_join is a client RPC');
select ok(has_function_privilege('authenticated', 'public.approve_join_request(text)', 'EXECUTE'), 'approve_join_request is a client RPC');
select ok(has_function_privilege('authenticated', 'public.reject_join_request(text)', 'EXECUTE'), 'reject_join_request is a client RPC');
select ok(has_function_privilege('authenticated', 'public.transfer_ownership(text)', 'EXECUTE'), 'transfer_ownership is a client RPC');
select ok(has_function_privilege('authenticated', 'public.leave_group()', 'EXECUTE'), 'leave_group is a client RPC');
select ok(not has_function_privilege('anon', 'public.create_group(text,text)', 'EXECUTE'), 'Anonymous callers cannot create groups');
select ok(not has_function_privilege('anon', 'public.my_group()', 'EXECUTE'), 'Anonymous callers cannot read groups');
select ok(not has_function_privilege('authenticated', 'public.current_clerk_sub()', 'EXECUTE'), 'The subject helper is not a client RPC');
select ok(not has_function_privilege('authenticated', 'public.group_overview_for(uuid,text)', 'EXECUTE'), 'The overview helper is not a client RPC');
select ok(not has_function_privilege('authenticated', 'public.check_group_owner_membership()', 'EXECUTE'), 'The trigger is not a client RPC');

-- Profiles are written by the test role so RPC checks focus on group behavior.
insert into public.profiles (user_id, username) values
  ('user_alice', 'Alice'), ('user_bob', 'Bob'), ('user_carol', 'Carol'),
  ('user_dave', 'Dave'), ('user_erin', 'Erin'), ('user_frank', 'Frank'),
  ('user_grace', 'Grace'), ('user_henry', 'Henry');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_mallory","role":"authenticated"}', true);
select throws_ok($$select public.create_group('NoProfile', 'public')$$,
  'P0001', 'Profile required.', 'Creating a group requires a profile');

select set_config('request.jwt.claims', '{"sub":"user_alice","role":"authenticated"}', true);
select throws_ok($$select public.create_group('', 'public')$$,
  'P0001', 'Invalid group name.', 'Blank group names are rejected');
select throws_ok($$select public.create_group('   ', 'public')$$,
  'P0001', 'Invalid group name.', 'Whitespace-only group names are rejected');
select throws_ok($$select public.create_group('bad' || chr(10) || 'name', 'public')$$,
  'P0001', 'Invalid group name.', 'Control characters are rejected');
select throws_ok($$select public.create_group(repeat('a', 61), 'public')$$,
  'P0001', 'Invalid group name.', 'Group names longer than 60 characters are rejected');
select throws_ok($$select public.create_group(chr(160), 'public')$$,
  'P0001', 'Invalid group name.', 'A non-breaking-space-only name is rejected');
select throws_ok($$select public.create_group('bad' || chr(65279) || 'name', 'public')$$,
  'P0001', 'Invalid group name.', 'A zero-width no-break space is rejected');
select throws_ok($$select public.create_group('Valid', 'secret')$$,
  'P0001', 'Invalid group visibility.', 'Unknown visibility is rejected');
select lives_ok($$select public.create_group('  Alpha  ', 'public')$$,
  'A user with a profile creates a group');
select lives_ok('set constraints all immediate', 'Authenticated callers can flush deferred membership checks');
set constraints all deferred;
select is((select public.my_group()->>'name'), 'Alpha', 'The stored name is trimmed');
select is((select public.my_group()->>'visibility'), 'public', 'The visibility is stored');
select is((select public.my_group()->>'role'), 'owner', 'The creator is the owner');
select is((select public.my_group()->>'ownerId'), 'user_alice', 'The creator is the owner in the response');
select is((select jsonb_array_length(public.my_group()->'members')), 1, 'The creator is the first member');
select is((select public.my_group()->'members'->0->>'role'), 'owner', 'The creator membership is the owner');
select throws_ok($$select public.create_group('Second', 'public')$$,
  'P0001', 'Already in a group.', 'A second group is rejected');

reset role;
select is((select count(*) from public.groups), 1::bigint, 'A rejected creation leaves no group row');
select set_config('test.alpha', (select id::text from public.groups where name = 'Alpha'), true);
set local role authenticated;

-- Public admission.
select set_config('request.jwt.claims', '{"sub":"user_bob","role":"authenticated"}', true);
select lives_ok(format('select public.join_public_group(%L)', current_setting('test.alpha')),
  'A user joins a public group directly');
select is((select jsonb_array_length(public.my_group()->'members')), 2, 'The join adds one member');
select is((select public.my_group()->>'role'), 'member', 'A joiner reads the member role');
select lives_ok(format('select public.join_public_group(%L)', current_setting('test.alpha')),
  'Joining the same group is idempotent');
select is((select jsonb_array_length(public.my_group()->'members')), 2, 'An idempotent join adds no member');
select is((select public.my_group()->>'invitation'), null::text, 'A non-owner never receives the invitation');
select is((select public.my_group()->>'requests'), null::text, 'A non-owner never receives pending requests');
select throws_ok($$select * from public.group_members$$,
  '42501', null, 'A member cannot read membership rows directly');
select throws_ok(format('select public.group_overview_for(%L, %L)', current_setting('test.alpha'), 'user_bob'),
  '42501', null, 'The overview helper is not callable by clients');

select set_config('request.jwt.claims', '{"sub":"user_henry","role":"authenticated"}', true);
select lives_ok(format('select public.join_public_group(%L)', current_setting('test.alpha')),
  'A third member joins the public group');

select set_config('request.jwt.claims', '{"sub":"user_bob","role":"authenticated"}', true);
select is((select jsonb_array_length(public.group_members_page(null, 2)->'members')), 2,
  'The first member page is bounded by the requested limit');
select set_config('test.member_cursor', (select public.group_members_page(null, 2)->>'nextCursor'), true);
select is((select jsonb_array_length(public.group_members_page(current_setting('test.member_cursor'), 2)->'members')), 1,
  'The next member page continues after the cursor');
select is((select public.group_members_page(current_setting('test.member_cursor'), 2)->>'nextCursor'), null::text,
  'The final member page has no next cursor');
select throws_ok($$select public.group_members_page('bad', 2)$$,
  'P0001', 'Invalid page cursor.', 'A malformed member cursor is rejected');

select set_config('request.jwt.claims', '{"sub":"user_frank","role":"authenticated"}', true);
select throws_ok($$select public.group_members_page(null, 2)$$,
  'P0001', 'Membership required.', 'A user outside any group cannot read members');

select set_config('request.jwt.claims', '{"sub":"user_carol","role":"authenticated"}', true);
select lives_ok($$select public.create_group('Beta', 'public')$$, 'Another user creates a second public group');
select throws_ok(format('select public.join_public_group(%L)', current_setting('test.alpha')),
  'P0001', 'Already in a group.', 'A user already in a group cannot join another');
select throws_ok($$select public.join_public_group('00000000-0000-4000-8000-000000000000')$$,
  'P0001', 'Group not found.', 'A missing group is reported');

reset role;
select set_config('test.beta', (select id::text from public.groups where name = 'Beta'), true);
set local role authenticated;

-- Private invitation and approval.
select set_config('request.jwt.claims', '{"sub":"user_dave","role":"authenticated"}', true);
select lives_ok($$select public.create_group('Delta', 'private')$$, 'A private group is created');
select is((select public.my_group()->>'visibility'), 'private', 'Private visibility is stored');
select is((select public.my_group()->>'invitation'), null::text, 'A new group has no invitation');
select is((select public.my_group()->>'requests'), '[]', 'A new group has no pending requests');

select set_config('request.jwt.claims', '{"sub":"user_alice","role":"authenticated"}', true);
select throws_ok($$select public.create_invitation()$$,
  'P0001', 'Invitations require a private group.', 'A public group cannot issue invitations');

select set_config('request.jwt.claims', '{"sub":"user_bob","role":"authenticated"}', true);
select throws_ok($$select public.create_invitation()$$,
  'P0001', 'Only the owner can perform this action.', 'A member cannot create an invitation');
select throws_ok($$select public.approve_join_request('user_erin')$$,
  'P0001', 'Only the owner can perform this action.', 'A non-owner cannot approve a request');

select set_config('request.jwt.claims', '{"sub":"user_dave","role":"authenticated"}', true);
select lives_ok($$select public.create_invitation()$$, 'The owner creates an invitation');
select is((select public.my_group()->'invitation'->>'token') ~ '^[a-f0-9]{64}$', true,
  'The invitation token is 64 lowercase hex characters');
select set_config('test.token', (select public.my_group()->'invitation'->>'token'), true);

reset role;
select set_config('test.delta', (select id::text from public.groups where name = 'Delta'), true);
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"user_erin","role":"authenticated"}', true);
select is((select public.resolve_invitation(current_setting('test.token'))->>'name'), 'Delta',
  'The token holder resolves the group name');
select is((select public.resolve_invitation(current_setting('test.token'))->>'ownerUsername'), 'Dave',
  'The token holder resolves the owner username');
select is((select (public.resolve_invitation(current_setting('test.token'))->>'member')::boolean), false,
  'Token possession alone grants no membership');
select is((select public.my_group()), null::jsonb, 'The token holder has no group');
select lives_ok(format('select public.request_join(%L)', current_setting('test.token')),
  'The token holder creates a pending request');
select is((select (public.resolve_invitation(current_setting('test.token'))->>'requested')::boolean), true,
  'The pending request is visible to its requester');
select lives_ok(format('select public.request_join(%L)', current_setting('test.token')),
  'A repeated request is idempotent');

reset role;
select is((select count(*) from public.group_join_requests
  where group_id = current_setting('test.delta')::uuid and user_id = 'user_erin' and status = 'pending'),
  1::bigint, 'Only one pending request exists');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"user_dave","role":"authenticated"}', true);
select is((select public.my_group()->'requests'->0->>'userId'), 'user_erin', 'The owner sees the pending requester');
select is((select jsonb_array_length(public.group_requests_page(null, 1)->'requests')), 1,
  'The owner reads a bounded request page');
select is((select public.group_requests_page(null, 1)->>'nextCursor'), null::text,
  'A single request page has no next cursor');

select set_config('request.jwt.claims', '{"sub":"user_erin","role":"authenticated"}', true);
select throws_ok($$select public.group_requests_page(null, 1)$$,
  'P0001', 'Only the owner can perform this action.', 'A requester cannot read the owner request page');

select set_config('request.jwt.claims', '{"sub":"user_bob","role":"authenticated"}', true);
select throws_ok($$select public.approve_join_request('user_erin')$$,
  'P0001', 'Only the owner can perform this action.', 'Another user cannot approve the request');

reset role;
select is((select status from public.group_join_requests
  where group_id = current_setting('test.delta')::uuid and user_id = 'user_erin'),
  'pending', 'A rejected approval leaves the request pending');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"user_dave","role":"authenticated"}', true);
select lives_ok($$select public.approve_join_request('user_erin')$$, 'The owner approves the request');
select is((select jsonb_array_length(public.my_group()->'members')), 2, 'Approval adds the requested member');
select is((select public.my_group()->'requests'), '[]'::jsonb, 'An approved request leaves the pending list');

reset role;
select is((select status from public.group_join_requests
  where group_id = current_setting('test.delta')::uuid and user_id = 'user_erin'),
  'approved', 'The request is marked approved');
select is((select decided_by from public.group_join_requests
  where group_id = current_setting('test.delta')::uuid and user_id = 'user_erin'),
  'user_dave', 'The approving owner is recorded');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"user_erin","role":"authenticated"}', true);
select is((select public.my_group()->>'role'), 'member', 'The approved user reads the member role');
select is((select public.my_group()->>'invitation'), null::text, 'The approved member never sees the invitation');
select is((select public.my_group()->>'requests'), null::text, 'The approved member never sees pending requests');

select set_config('request.jwt.claims', '{"sub":"user_frank","role":"authenticated"}', true);
select lives_ok(format('select public.request_join(%L)', current_setting('test.token')),
  'A second user requests the private group');
select set_config('request.jwt.claims', '{"sub":"user_dave","role":"authenticated"}', true);
select lives_ok($$select public.reject_join_request('user_frank')$$, 'The owner rejects the request');
select throws_ok($$select public.reject_join_request('user_frank')$$,
  'P0001', 'Request not found.', 'A decided request cannot be rejected twice');

reset role;
select is((select status from public.group_join_requests
  where group_id = current_setting('test.delta')::uuid and user_id = 'user_frank'),
  'rejected', 'The request is marked rejected');
select is((select count(*) from public.group_members
  where group_id = current_setting('test.delta')::uuid and user_id = 'user_frank'),
  0::bigint, 'A rejected user gains no membership');
set local role authenticated;

-- Rotation, revocation and atomic approval failure.
select set_config('request.jwt.claims', '{"sub":"user_dave","role":"authenticated"}', true);
select lives_ok($$select public.create_invitation()$$, 'The owner rotates the invitation');
select throws_ok(format('select public.resolve_invitation(%L)', current_setting('test.token')),
  'P0001', 'Invitation is invalid.', 'The rotated token stops resolving');
select set_config('test.token', (select public.my_group()->'invitation'->>'token'), true);

select set_config('request.jwt.claims', '{"sub":"user_bob","role":"authenticated"}', true);
select throws_ok($$select public.revoke_invitation()$$,
  'P0001', 'Only the owner can perform this action.', 'A member cannot revoke the invitation');

select set_config('request.jwt.claims', '{"sub":"user_dave","role":"authenticated"}', true);
select lives_ok($$select public.revoke_invitation()$$, 'The owner revokes the invitation');
select throws_ok(format('select public.resolve_invitation(%L)', current_setting('test.token')),
  'P0001', 'Invitation is invalid.', 'A revoked token stops resolving');
select lives_ok($$select public.create_invitation()$$, 'The owner creates a fresh invitation');
select set_config('test.token', (select public.my_group()->'invitation'->>'token'), true);

select set_config('request.jwt.claims', '{"sub":"user_grace","role":"authenticated"}', true);
select lives_ok(format('select public.request_join(%L)', current_setting('test.token')),
  'A third user requests the private group');
select lives_ok(format('select public.join_public_group(%L)', current_setting('test.beta')),
  'The requester joins a public group instead');

select set_config('request.jwt.claims', '{"sub":"user_dave","role":"authenticated"}', true);
select throws_ok($$select public.approve_join_request('user_grace')$$,
  'P0001', 'Target user is already in a group.',
  'Approval fails when the requester joined another group');

reset role;
select is((select status from public.group_join_requests
  where group_id = current_setting('test.delta')::uuid and user_id = 'user_grace'),
  'pending', 'A failed approval leaves the request pending');
select is((select count(*) from public.group_members
  where group_id = current_setting('test.delta')::uuid and user_id = 'user_grace'),
  0::bigint, 'A failed approval adds no membership');
set local role authenticated;

-- Ownership transfer and departure.
select set_config('request.jwt.claims', '{"sub":"user_alice","role":"authenticated"}', true);
select throws_ok($$select public.transfer_ownership('user_mallory')$$,
  'P0001', 'Target user is not a member.', 'Transfer requires a member target');
select throws_ok($$select public.transfer_ownership('not-a-sub')$$,
  'P0001', 'Target user is not a member.', 'Transfer rejects a malformed subject');
select lives_ok($$select public.transfer_ownership('user_bob')$$, 'The owner transfers ownership');

reset role;
select is((select owner_id from public.groups where id = current_setting('test.alpha')::uuid),
  'user_bob', 'Ownership changes immediately in storage');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"user_bob","role":"authenticated"}', true);
select is((select public.my_group()->>'role'), 'owner', 'The new owner reads the owner role');
select throws_ok($$select public.leave_group()$$,
  'P0001', 'Transfers are required before leaving a group with other members.',
  'An owner with members cannot leave');

select set_config('request.jwt.claims', '{"sub":"user_alice","role":"authenticated"}', true);
select is((select public.my_group()->>'role'), 'member', 'The previous owner reads the member role');
select lives_ok($$select public.leave_group()$$, 'The previous owner leaves as a member');
select is((select public.my_group()), null::jsonb, 'The leaver has no group');

select set_config('request.jwt.claims', '{"sub":"user_bob","role":"authenticated"}', true);
select lives_ok($$select public.transfer_ownership('user_henry')$$, 'The owner transfers to the remaining member');
select lives_ok($$select public.leave_group()$$, 'The previous owner leaves after transferring');

select set_config('request.jwt.claims', '{"sub":"user_henry","role":"authenticated"}', true);
select lives_ok($$select public.leave_group()$$, 'The sole owner leaving deletes the group');
select throws_ok($$select public.leave_group()$$,
  'P0001', 'Membership required.', 'A non-member cannot leave a group');

reset role;
select is((select count(*) from public.groups where id = current_setting('test.alpha')::uuid),
  0::bigint, 'The deleted group row is gone');
select is((select count(*) from public.group_members where group_id = current_setting('test.alpha')::uuid),
  0::bigint, 'Deleted group memberships are cascaded');

-- Constraint guards. Deferred events must be forced before checking the trigger.
set constraints all immediate;
select throws_ok($$insert into public.groups (name, visibility, owner_id)
  values ('Orphan', 'public', 'user_alice')$$,
  'P0001', 'Group owner must be a member.', 'A group owner without membership is rejected');
select throws_ok($$insert into public.groups (name, visibility, owner_id)
  values ('', 'public', 'user_alice')$$,
  '23514', null, 'The name check rejects an empty name');
select throws_ok($$insert into public.groups (name, visibility, owner_id)
  values ('  padded  ', 'public', 'user_alice')$$,
  '23514', null, 'The name check rejects untrimmed names');
select throws_ok($$insert into public.groups (name, visibility, owner_id)
  values (repeat('a', 61), 'public', 'user_alice')$$,
  '23514', null, 'The name check rejects names longer than 60 characters');
select throws_ok($$insert into public.groups (name, visibility, owner_id)
  values ('bad' || chr(10) || 'name', 'public', 'user_alice')$$,
  '23514', null, 'The name check rejects control characters');
select throws_ok($$insert into public.groups (name, visibility, owner_id)
  values ('Valid', 'secret', 'user_alice')$$,
  '23514', null, 'The visibility check rejects unknown values');
select throws_ok(format('insert into public.group_invitations (group_id, token, created_by)
  values (%L, %L, %L)', current_setting('test.delta'), 'xyz', 'user_dave'),
  '23514', null, 'The token check rejects malformed tokens');
select throws_ok(format('insert into public.group_join_requests (group_id, user_id, status)
  values (%L, %L, %L)', current_setting('test.delta'), 'user_erin', 'maybe'),
  '23514', null, 'The status check rejects unknown statuses');
set constraints all deferred;

-- Group names do not inherit the separate ASCII-only username rule.
reset role;
insert into public.profiles(user_id, username) values ('user_unicode', 'Unicode');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_unicode","role":"authenticated"}', true);
select lives_ok($$select public.create_group('Café 🎮', 'private')$$, 'Unicode group names are preserved');
select is(public.my_group()->>'name', 'Café 🎮', 'Group names retain accents and supplementary characters');

select * from finish();
rollback;
