-- PostgreSQL 17 executes deferred checks after the RPC's definer context ends.
-- Elevate only the invariant trigger; keep all client table/helper access denied.
alter function public.check_group_owner_membership() security definer;
alter function public.check_group_owner_membership() set search_path = '';
revoke all on function public.check_group_owner_membership() from public, anon, authenticated;
