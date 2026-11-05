create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  username_changed_at timestamptz,
  constraint profiles_username_format check (
    char_length(username) between 3 and 20 and
    username collate "C" ~ '^[A-Za-z0-9_]+$'
  )
);

-- ASCII validation and the C collation make uniqueness independent of locale.
create unique index profiles_username_unique on public.profiles (lower(username collate "C"));
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (user_id, username), update (username) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create function public.guard_username_change() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.username is distinct from old.username then
    if old.username_changed_at is not null and
       old.username_changed_at > now() - interval '30 days' then
      raise exception using errcode = 'P0001',
        message = 'Username can only be changed every 30 days.';
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.guard_username_change() from public, anon, authenticated;
create trigger guard_username_change before update on public.profiles
  for each row execute function public.guard_username_change();
