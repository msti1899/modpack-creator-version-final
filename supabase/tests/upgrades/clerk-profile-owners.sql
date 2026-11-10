-- Run only through db:test:upgrade in its new disposable PostgreSQL container.
-- Minimal Auth helpers reproduce the claim access used by these migrations;
-- this is a SQL upgrade regression, not hosted Supabase/Clerk integration proof.
create role anon;
create role authenticated;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select current_setting('request.jwt.claims', true)::jsonb $$;
grant usage on schema public, auth to authenticated;

\ir ../../migrations/20261104000000_explicit_function_execution.sql
\ir ../../migrations/20261105000000_account_profiles.sql
insert into auth.users values ('11111111-1111-4111-8111-111111111111');
insert into public.profiles values
  ('11111111-1111-4111-8111-111111111111', 'Legacy_Name', '2026-10-01T12:34:56Z');
create temporary table original_profile as
  select user_id::text, username, username_changed_at from public.profiles;

\ir ../../migrations/20261107000000_clerk_profile_owners.sql

do $$ begin
  if exists ((select * from original_profile except select * from public.profiles)
    union all (select * from public.profiles except select * from original_profile)) then
    raise exception 'Upgrade changed legacy owner, username or cooldown';
  end if;
  if (select data_type from information_schema.columns
      where table_schema='public' and table_name='profiles' and column_name='user_id') <> 'text' then
    raise exception 'Profile owner was not converted to text';
  end if;
end $$;

-- No auth.users row exists for this Clerk subject. Ownership must not require one.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_new","role":"authenticated"}', false);
do $$ begin
  if exists (select from public.profiles) then raise exception 'Clerk can read legacy row'; end if;
  begin
    insert into public.profiles (user_id, username) values ('user_new', 'legacy_name');
    raise exception 'Legacy name was not reserved';
  exception when unique_violation then null;
  end;
  insert into public.profiles (user_id, username) values ('user_new', 'NewPlayer');
  begin
    insert into public.profiles (user_id, username) values ('user_other', 'Hijacked');
    raise exception 'Cross-owner insertion succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', false);
do $$ begin
  if exists (select from public.profiles) then raise exception 'Legacy subject still has access'; end if;
  begin
    insert into public.profiles (user_id, username) values
      ('11111111-1111-4111-8111-111111111111', 'LegacyNew');
    raise exception 'Legacy subject could insert';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  if not exists (select from public.profiles p join original_profile o using (user_id)
      where p.username=o.username and p.username_changed_at=o.username_changed_at) then
    raise exception 'Rejected operations changed legacy data';
  end if;
  if (select count(*) from public.profiles) <> 2 then
    raise exception 'Rejected operations left unexpected records';
  end if;
end $$;
\echo Profile upgrade regression passed.
