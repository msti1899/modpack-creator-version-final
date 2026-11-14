-- Milestone 8, second half: reconcile a provider-side account deletion.
--
-- ADR0005 decides that a verified Clerk `user.deleted` event is authoritative for the
-- identity. The application therefore deletes the account without a session, and when the
-- deleted account owns a group that still has members, ownership passes to the member who
-- has been in the group longest. Everything else reuses the rules of ADR0004: the last
-- member's group is deleted, a member loses only the membership, the profile and username
-- are released, and historical rows keep the subject as a tombstone.
--
-- The shared routine is not a client API. `delete_my_account` stays the session-authenticated
-- entry point and still refuses an owner with other members, because that person can transfer.
-- `delete_account_for` is the provider entry point and is executable by `service_role` only.

create function public.delete_account_as(p_sub text, p_allow_succession boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_group uuid;
  v_owner text;
  v_members bigint;
  v_successor text;
  v_group_deleted boolean := false;
  v_deleted boolean := false;
begin
  if not exists (select 1 from public.profiles p where p.user_id = p_sub) then
    return jsonb_build_object('deleted', false, 'groupId', null,
      'groupDeleted', false, 'transferredTo', null);
  end if;
  -- Group-first lock order matches transfer, leave, draft saves, publications and votes.
  select g.id, g.owner_id into v_group, v_owner
  from public.groups g
  join public.group_members m on m.group_id = g.id and m.user_id = p_sub
  for update of g;
  if found then
    if v_owner = p_sub then
      select count(*) into v_members from public.group_members where group_id = v_group;
      if v_members > 1 then
        if not p_allow_succession then
          raise exception using errcode = 'P0001',
            message = 'Transfers are required before leaving a group with other members.';
        end if;
        -- Longest-standing remaining member; the subject breaks ties deterministically.
        select m.user_id into v_successor
        from public.group_members m
        where m.group_id = v_group and m.user_id <> p_sub
        order by m.joined_at, m.user_id
        limit 1;
        update public.groups set owner_id = v_successor, updated_at = now() where id = v_group;
      else
        delete from public.groups where id = v_group;
        v_group_deleted := true;
      end if;
    end if;
    delete from public.group_members where group_id = v_group and user_id = p_sub;
  end if;
  delete from public.profiles where user_id = p_sub;
  v_deleted := found;
  return jsonb_build_object('deleted', v_deleted, 'groupId', v_group,
    'groupDeleted', v_group_deleted, 'transferredTo', v_successor);
end;
$$;
revoke all on function public.delete_account_as(text, boolean) from public, anon, authenticated;

create or replace function public.delete_my_account() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_result jsonb := public.delete_account_as(v_sub, false);
begin
  -- Keep the session-facing shape stable: only these three fields are contractual.
  return jsonb_build_object('deleted', v_result->'deleted', 'groupId', v_result->'groupId',
    'groupDeleted', v_result->'groupDeleted');
end;
$$;

create function public.delete_account_for(p_sub text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_sub is null or p_sub !~ '^user_[A-Za-z0-9]+$' then
    raise exception using errcode = 'P0001', message = 'Invalid account subject.';
  end if;
  return public.delete_account_as(p_sub, true);
end;
$$;
revoke all on function public.delete_account_for(text) from public, anon, authenticated;
grant execute on function public.delete_account_for(text) to service_role;
