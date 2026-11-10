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

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_player","role":"authenticated"}', true);
select lives_ok($$insert into public.profiles (user_id, username) values ((auth.jwt()->>'sub'), 'Matias')$$, 'A user can assign their own username');
select is((select username from public.profiles), 'Matias', 'Display casing is preserved');
select is((select username_changed_at from public.profiles), null::timestamptz, 'Initial assignment does not start the rename cooldown');

select throws_ok($$insert into public.profiles (user_id, username) values ('user_other', 'other')$$,
  '42501', null, 'Cannot create another user profile');
select throws_ok($$update public.profiles set username_changed_at = now() - interval '30 days'$$,
  '42501', null, 'Cannot forge an old cooldown timestamp');
select throws_ok($$update public.profiles set user_id = 'user_other'$$,
  '42501', null, 'Cannot transfer profile ownership');

select lives_ok($$update public.profiles set username = 'Mati_1899' where user_id = (auth.jwt()->>'sub')$$, 'First rename is immediate');
select is((select username_changed_at from public.profiles), now(), 'The server records the rename time');
select throws_ok($$update public.profiles set username = 'TooSoon' where user_id = (auth.jwt()->>'sub')$$,
  'P0001', 'Username can only be changed every 30 days.', 'A second immediate rename is rejected');
select is((select username from public.profiles), 'Mati_1899', 'Rejected rename leaves the username unchanged');
select is((select username_changed_at from public.profiles), now(), 'Rejected rename leaves cooldown unchanged');
select lives_ok($$update public.profiles set username = 'Mati_1899' where user_id = (auth.jwt()->>'sub')$$, 'An identical write is idempotent');

select set_config('request.jwt.claims', '{"sub":"user_other","role":"authenticated"}', true);
select is((select count(*) from public.profiles), 0::bigint, 'Another user cannot read the first profile');
select results_eq($$update public.profiles set username = 'Hijacked' returning user_id$$,
  $$select null::text where false$$, 'Another user cannot update the first profile');
select throws_ok($$insert into public.profiles (user_id, username) values ((auth.jwt()->>'sub'), 'mati_1899')$$,
  '23505', null, 'Case-insensitive duplicates are rejected');
select lives_ok($$insert into public.profiles (user_id, username) values ((auth.jwt()->>'sub'), 'matias')$$, 'The previous name is immediately reusable');

reset role;
update public.profiles set username_changed_at = now() - interval '29 days' where user_id = 'user_player';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_player","role":"authenticated"}', true);
select throws_ok($$update public.profiles set username = 'NextName' where user_id = (auth.jwt()->>'sub')$$,
  'P0001', 'Username can only be changed every 30 days.', 'A rename at 29 days is rejected');
reset role;
update public.profiles set username_changed_at = now() - interval '30 days' where user_id = 'user_player';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_player","role":"authenticated"}', true);
select throws_ok($$update public.profiles set username = 'MATIAS' where user_id = (auth.jwt()->>'sub')$$,
  '23505', null, 'Renames also enforce case-insensitive uniqueness');
select is((select username from public.profiles), 'Mati_1899', 'Duplicate rejection preserves the prior username');
select is((select username_changed_at from public.profiles), now() - interval '30 days', 'Duplicate rejection does not consume cooldown');
select lives_ok($$update public.profiles set username = 'NextName' where user_id = (auth.jwt()->>'sub')$$, 'A rename at exactly 30 days succeeds');
select is((select username_changed_at from public.profiles), now(), 'Successful rename restarts cooldown');

-- A third authenticated identity exercises validation without an existing row.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_third","role":"authenticated"}', true);
select throws_ok(format('insert into public.profiles (user_id, username) values ((auth.jwt()->>''sub''), %L)', invalid),
  '23514', null, 'Reject invalid username: ' || description)
from (values ('ab', 'too short'), (repeat('a', 21), 'too long'), ('has space', 'space'),
  ('ábc', 'accent'), ('abc-', 'punctuation'), (E'abc\n', 'newline'), ('', 'empty')) as cases(invalid, description);
select lives_ok($$insert into public.profiles (user_id, username) values ((auth.jwt()->>'sub'), 'A_1')$$, 'Three ASCII characters are allowed');
select lives_ok($$update public.profiles set username = repeat('Z', 20) where user_id = (auth.jwt()->>'sub')$$, 'Twenty ASCII characters are allowed');

-- A legacy Supabase subject cannot access or create profiles after cutover.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is((select count(*) from public.profiles), 0::bigint, 'Legacy Auth subjects do not gain Clerk access');
select throws_ok($$insert into public.profiles (user_id, username) values ((auth.jwt()->>'sub'), 'LegacyNew')$$,
  '42501', null, 'Legacy subjects cannot create new profiles');
select set_config('request.jwt.claims', '{}', true);
select is((select count(*) from public.profiles), 0::bigint, 'Missing subject reveals no profiles');

select * from finish();
rollback;
