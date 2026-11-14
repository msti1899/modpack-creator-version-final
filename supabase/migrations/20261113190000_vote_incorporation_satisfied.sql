-- Completion-plan M7: an approved vote whose addition is already present in full is
-- satisfied instead of permanently unincorporable. The decision is recorded in D7:
-- conflicting pending additions are resolved by the draft's atomic contract, never by
-- merging or deleting votes. A partially present addition stays a conflict, so the
-- owner can always reach a state where the addition is either absent (and therefore
-- appended) or fully present (and therefore discharged).
--
-- This replaces the function defined in 20261112233000_group_votes.sql without
-- changing any other route, message or status.

create or replace function public.incorporate_group_vote(
  p_vote_id uuid, p_expected_draft_revision integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub text := public.current_clerk_sub();
  v_group uuid;
  v_vote public.group_votes%rowtype;
  v_draft public.pack_drafts%rowtype;
  v_ids text[];
  v_satisfied boolean := false;
  v_result jsonb;
begin
  if p_expected_draft_revision is null or p_expected_draft_revision < 0
    or p_expected_draft_revision = 2147483647 then
    raise exception using errcode = 'P0001', message = 'Invalid vote revision.';
  end if;
  select group_id into v_group from public.group_votes where id = p_vote_id;
  if v_group is null then
    raise exception using errcode = 'P0001', message = 'Vote not found.';
  end if;
  -- The obligation belongs to the group: only the current owner discharges it.
  perform 1 from public.groups g where g.id = v_group and g.owner_id = v_sub for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Only the group owner may incorporate votes.';
  end if;
  select * into v_vote from public.group_votes where id = p_vote_id for update;
  if v_vote.status <> 'approved' then
    raise exception using errcode = 'P0001', message = 'Vote is not approved.';
  end if;
  if v_vote.incorporated_at is not null then
    raise exception using errcode = 'P0001', message = 'Vote is already incorporated.';
  end if;
  -- Same revision compare-and-swap as a draft save: the owner incorporates the
  -- addition they just reviewed, never a selection changed behind their back.
  select * into v_draft from public.pack_drafts where group_id = v_group;
  if coalesce(v_draft.revision, 0) <> p_expected_draft_revision then
    raise exception using errcode = 'P0001', message = 'Draft revision conflict.';
  end if;
  if v_draft.group_id is not null then
    if v_draft.game_version <> v_vote.game_version or v_draft.loader <> v_vote.loader then
      raise exception using errcode = 'P0001', message = 'Vote does not match the draft settings.';
    end if;
    if v_vote.addition <@ v_draft.version_ids then
      -- Another vote or a manual save already put this exact addition in place.
      -- Discharge the obligation without touching the draft or its revision.
      v_satisfied := true;
    elsif v_draft.version_ids && v_vote.addition then
      -- A partial overlap cannot be told apart from an ambiguous state, so it stays
      -- a conflict and writes nothing.
      raise exception using errcode = 'P0001', message = 'A proposed version is already in the draft.';
    else
      v_ids := v_draft.version_ids || v_vote.addition;
    end if;
  else
    v_ids := v_vote.addition;
  end if;
  if not v_satisfied then
    if not public.valid_pack_version_ids(v_ids) then
      raise exception using errcode = 'P0001', message = 'Invalid vote selection.';
    end if;
    insert into public.pack_drafts(group_id, game_version, loader, version_ids, revision)
      values (v_group, v_vote.game_version, v_vote.loader, v_ids, coalesce(v_draft.revision, 0) + 1)
    on conflict (group_id) do update set
      version_ids = excluded.version_ids, revision = excluded.revision, updated_at = now();
  end if;
  -- Approval never publishes or activates anything; milestone 5 owns versions.
  update public.group_votes set incorporated_at = now() where id = v_vote.id;
  select jsonb_build_object(
    'vote', public.vote_snapshot(v, v_sub),
    'draft', (select jsonb_build_object(
      'gameVersion', d.game_version, 'loader', d.loader, 'versionIds', d.version_ids,
      'revision', d.revision, 'updatedAt', d.updated_at)
      from public.pack_drafts d where d.group_id = v_group)
  ) into v_result from public.group_votes v where v.id = v_vote.id;
  return v_result;
end;
$$;

revoke all on function public.incorporate_group_vote(uuid,integer) from public, anon, authenticated;
grant execute on function public.incorporate_group_vote(uuid,integer) to authenticated;
