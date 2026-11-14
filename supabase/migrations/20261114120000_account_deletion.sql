-- Milestone 8: account deletion and retention.
--
-- The account holder may delete their own application profile through one RPC.
-- Clerk keeps owning the identity and the session; this migration never calls a
-- provider and adds no webhook. Historical group records keep the Clerk subject as
-- a tombstone, so a vote, its frozen electorate, its cast ballots, an invitation's
-- creator and a request's decider survive an account deletion without a profile.
--
-- Only the four foreign keys that make a deleted profile impossible are dropped.
-- Group integrity keeps its two keys: the caller's membership is removed first, so
-- `group_members.user_id` and `groups.owner_id` still protect ownership.

alter table public.group_invitations drop constraint group_invitations_created_by_fkey;
alter table public.group_join_requests drop constraint group_join_requests_decided_by_fkey;
alter table public.group_votes drop constraint group_votes_created_by_fkey;
alter table public.group_vote_electorate drop constraint group_vote_electorate_user_id_fkey;

create function public.delete_my_account() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_owner text;
  v_members bigint;
  v_group_deleted boolean := false;
  v_deleted boolean := false;
begin
  -- An account without a profile has no application data left to delete; the
  -- requested end state already holds, so the call is idempotent and writes nothing.
  if not exists (select 1 from public.profiles p where p.user_id = v_sub) then
    return jsonb_build_object('deleted', false, 'groupId', null, 'groupDeleted', false);
  end if;
  -- Group-first lock order matches transfer, leave, draft saves, publications and
  -- vote writes, so deletion cannot deadlock against them.
  select g.id, g.owner_id into v_group, v_owner
  from public.groups g
  join public.group_members m on m.group_id = g.id and m.user_id = v_sub
  for update of g;
  if found then
    if v_owner = v_sub then
      select count(*) into v_members from public.group_members where group_id = v_group;
      if v_members > 1 then
        raise exception using errcode = 'P0001',
          message = 'Transfers are required before leaving a group with other members.';
      end if;
      -- D5: the last member's departure deletes the group and everything under it.
      delete from public.groups where id = v_group;
      v_group_deleted := true;
    else
      delete from public.group_members where group_id = v_group and user_id = v_sub;
    end if;
  end if;
  delete from public.profiles where user_id = v_sub;
  v_deleted := found;
  return jsonb_build_object('deleted', v_deleted, 'groupId', v_group, 'groupDeleted', v_group_deleted);
end;
$$;
revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
