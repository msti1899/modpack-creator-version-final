-- D-F2 chose link-only group discovery: a public join link has to name its group before the
-- person joins, without exposing the member list. A private group stays invisible to anyone
-- who neither belongs to it nor has a pending request, so the read cannot confirm it exists.
create function public.group_summary(p_group_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'visibility', g.visibility,
    'ownerUsername', owner.username,
    'memberCount', (select count(*) from public.group_members m where m.group_id = g.id),
    'membership', case
      when exists (select 1 from public.group_members m
        where m.group_id = g.id and m.user_id = public.current_clerk_sub()) then 'member'
      when exists (select 1 from public.group_join_requests r
        where r.group_id = g.id and r.user_id = public.current_clerk_sub()
          and r.status = 'pending') then 'requested'
      else null
    end
  )
  from public.groups g
  join public.profiles owner on owner.user_id = g.owner_id
  where g.id = p_group_id
    and (g.visibility = 'public'
      or exists (select 1 from public.group_members m
        where m.group_id = g.id and m.user_id = public.current_clerk_sub())
      or exists (select 1 from public.group_join_requests r
        where r.group_id = g.id and r.user_id = public.current_clerk_sub()
          and r.status = 'pending'));
$$;

revoke all on function public.group_summary(uuid) from public, anon;
grant execute on function public.group_summary(uuid) to authenticated;
