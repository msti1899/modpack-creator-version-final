begin;
select no_plan();

select has_table('public', 'profiles', 'Profiles are persisted');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS is enabled');
select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'Anonymous callers cannot read profiles');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'DELETE'), 'Users cannot delete profiles');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'user_id', 'UPDATE'), 'Ownership cannot be changed');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'username_changed_at', 'INSERT'), 'Clients cannot insert a cooldown timestamp');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'username_changed_at', 'UPDATE'), 'Clients cannot update the cooldown timestamp');
select ok(not has_function_privilege('authenticated', 'public.guard_username_change()', 'EXECUTE'), 'The trigger is not a client RPC');

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select lives_ok($$insert into public.profiles (user_id, username) values (auth.uid(), 'Matias')$$, 'A user can assign their own username');
select is((select username from public.profiles), 'Matias', 'Display casing is preserved');
select is((select username_changed_at from public.profiles), null::timestamptz, 'Initial assignment does not start the rename cooldown');

select throws_ok($$insert into public.profiles (user_id, username) values ('22222222-2222-4222-8222-222222222222', 'other')$$,
  '42501', null, 'Cannot create another user profile');
select throws_ok($$update public.profiles set username_changed_at = now() - interval '30 days'$$,
  '42501', null, 'Cannot forge an old cooldown timestamp');
select throws_ok($$update public.profiles set user_id = '22222222-2222-4222-8222-222222222222'$$,
  '42501', null, 'Cannot transfer profile ownership');

select lives_ok($$update public.profiles set username = 'Mati_1899' where user_id = auth.uid()$$, 'First rename is immediate');
select is((select username_changed_at from public.profiles), now(), 'The server records the rename time');
select throws_ok($$update public.profiles set username = 'TooSoon' where user_id = auth.uid()$$,
  'P0001', 'Username can only be changed every 30 days.', 'A second immediate rename is rejected');
select is((select username from public.profiles), 'Mati_1899', 'Rejected rename leaves the username unchanged');
select is((select username_changed_at from public.profiles), now(), 'Rejected rename leaves cooldown unchanged');
select lives_ok($$update public.profiles set username = 'Mati_1899' where user_id = auth.uid()$$, 'An identical write is idempotent');

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is((select count(*) from public.profiles), 0::bigint, 'Another user cannot read the first profile');
select results_eq($$update public.profiles set username = 'Hijacked' returning user_id$$,
  $$select null::uuid where false$$, 'Another user cannot update the first profile');
select throws_ok($$insert into public.profiles (user_id, username) values (auth.uid(), 'mati_1899')$$,
  '23505', null, 'Case-insensitive duplicates are rejected');
select lives_ok($$insert into public.profiles (user_id, username) values (auth.uid(), 'matias')$$, 'The previous name is immediately reusable');

reset role;
update public.profiles set username_changed_at = now() - interval '29 days' where user_id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select throws_ok($$update public.profiles set username = 'NextName' where user_id = auth.uid()$$,
  'P0001', 'Username can only be changed every 30 days.', 'A rename at 29 days is rejected');
reset role;
update public.profiles set username_changed_at = now() - interval '30 days' where user_id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select throws_ok($$update public.profiles set username = 'MATIAS' where user_id = auth.uid()$$,
  '23505', null, 'Renames also enforce case-insensitive uniqueness');
select is((select username from public.profiles), 'Mati_1899', 'Duplicate rejection preserves the prior username');
select is((select username_changed_at from public.profiles), now() - interval '30 days', 'Duplicate rejection does not consume cooldown');
select lives_ok($$update public.profiles set username = 'NextName' where user_id = auth.uid()$$, 'A rename at exactly 30 days succeeds');
select is((select username_changed_at from public.profiles), now(), 'Successful rename restarts cooldown');

-- A third authenticated identity exercises validation without an existing row.
reset role;
insert into auth.users (id) values ('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select throws_ok(format('insert into public.profiles (user_id, username) values (auth.uid(), %L)', invalid),
  '23514', null, 'Reject invalid username: ' || description)
from (values ('ab', 'too short'), (repeat('a', 21), 'too long'), ('has space', 'space'),
  ('ábc', 'accent'), ('abc-', 'punctuation'), (E'abc\n', 'newline'), ('', 'empty')) as cases(invalid, description);
select lives_ok($$insert into public.profiles (user_id, username) values (auth.uid(), 'A_1')$$, 'Three ASCII characters are allowed');
select lives_ok($$update public.profiles set username = repeat('Z', 20) where user_id = auth.uid()$$, 'Twenty ASCII characters are allowed');

select * from finish();
rollback;
