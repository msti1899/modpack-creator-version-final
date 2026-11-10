-- Preserve existing UUID-owned rows without inventing Clerk account links.
-- Legacy owners remain as text; only signed Clerk subjects can access profiles.
drop policy profiles_select_own on public.profiles;
drop policy profiles_insert_own on public.profiles;
drop policy profiles_update_own on public.profiles;
alter table public.profiles drop constraint profiles_user_id_fkey;
alter table public.profiles alter column user_id type text using user_id::text;

create policy profiles_select_own on public.profiles for select to authenticated
  using (user_id = (select auth.jwt()->>'sub') and user_id ~ '^user_[A-Za-z0-9]+$');
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (user_id = (select auth.jwt()->>'sub') and user_id ~ '^user_[A-Za-z0-9]+$');
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.jwt()->>'sub') and user_id ~ '^user_[A-Za-z0-9]+$')
  with check (user_id = (select auth.jwt()->>'sub') and user_id ~ '^user_[A-Za-z0-9]+$');
