-- Merge replay guard (audit 2026-07-05 SEC-1 P1, + STATE-2 P3 hardening).
--
-- Problem: merge_anonymous_account moves row-level data (idempotent — a second
-- call finds nothing to move) but the final profiles step is a straight COLUMN
-- COPY of the anonymous account's totals (total_xp, total_co2_saved_kg,
-- rider_tier, ...) that never resets the source. Because the anonymous auth
-- user survives the merge, its refresh token can mint new access tokens, so
-- one real riding history's totals could be cloned onto arbitrarily many fresh
-- accounts — gaming the XP/tier/leaderboard economy.
--
-- Fix, three layers:
--   1. `profiles.merged_at` stamp on the SOURCE after a successful merge, and
--      a guard at function entry that refuses an already-merged source.
--   2. Advisory xact locks (sorted, deadlock-safe) so two concurrent merges
--      touching the same source/target serialize instead of racing the guard
--      (STATE-2: READ COMMITTED gives each statement its own snapshot).
--   3. The profile copy re-asserts target freshness in its WHERE clause, so
--      the write itself is conditioned on the row still being fresh at write
--      time, not merely at check time.
-- The API additionally deletes the anonymous auth user after a successful
-- merge (services/mobile-api/src/routes/account.ts), closing the hole at the
-- token layer; this migration is the defense-in-depth data layer.

alter table public.profiles add column if not exists merged_at timestamptz;

comment on column public.profiles.merged_at is
  'Set when this (anonymous) profile''s data was merged into another account. A non-null value permanently blocks re-use as a merge source (audit 2026-07-05 SEC-1).';

create or replace function public.merge_anonymous_account(
  p_anon_id uuid,
  p_target_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_trip_count int;
  v_target_xp int;
  v_source_merged_at timestamptz;
begin
  if p_anon_id is null or p_target_id is null or p_anon_id = p_target_id then
    return jsonb_build_object('merged', false, 'reason', 'invalid_ids');
  end if;

  -- Serialize concurrent merges touching either account. Locks taken in
  -- sorted order so two merges with overlapping ids cannot deadlock.
  perform pg_advisory_xact_lock(hashtext(least(p_anon_id::text, p_target_id::text)));
  perform pg_advisory_xact_lock(hashtext(greatest(p_anon_id::text, p_target_id::text)));

  -- Replay guard: a source that has already been merged is consumed forever.
  select merged_at into v_source_merged_at from profiles where id = p_anon_id;
  if v_source_merged_at is not null then
    return jsonb_build_object('merged', false, 'reason', 'source_already_merged');
  end if;

  -- Fresh-target guard: only merge into an account with no rides and no XP.
  select count(*) into v_target_trip_count from trip_tracks where user_id = p_target_id;
  select coalesce(total_xp, 0) into v_target_xp from profiles where id = p_target_id;

  if coalesce(v_target_trip_count, 0) > 0 or coalesce(v_target_xp, 0) > 0 then
    return jsonb_build_object('merged', false, 'reason', 'target_not_empty');
  end if;

  -- Re-parent simple user-keyed rows A -> B.
  update trips                set user_id = p_target_id where user_id = p_anon_id;
  update trip_tracks          set user_id = p_target_id where user_id = p_anon_id;
  update trip_shares          set user_id = p_target_id where user_id = p_anon_id;
  update trip_loves           set user_id = p_target_id where user_id = p_anon_id;
  update hazards              set user_id = p_target_id where user_id = p_anon_id;
  update hazard_validations   set user_id = p_target_id where user_id = p_anon_id;
  update navigation_feedback  set user_id = p_target_id where user_id = p_anon_id;
  update navigation_history   set user_id = p_target_id where user_id = p_anon_id;
  update ride_impacts         set user_id = p_target_id where user_id = p_anon_id;
  update ride_microlives      set user_id = p_target_id where user_id = p_anon_id;
  update saved_routes         set user_id = p_target_id where user_id = p_anon_id;
  update route_shares         set user_id = p_target_id where user_id = p_anon_id;
  update city_suggestions     set user_id = p_target_id where user_id = p_anon_id;
  update quiz_answers         set user_id = p_target_id where user_id = p_anon_id;
  update user_quiz_history    set user_id = p_target_id where user_id = p_anon_id;
  update xp_events            set user_id = p_target_id where user_id = p_anon_id;
  update user_badges          set user_id = p_target_id where user_id = p_anon_id;
  update feed_likes           set user_id = p_target_id where user_id = p_anon_id;
  update feed_comments        set user_id = p_target_id where user_id = p_anon_id;
  update activity_feed        set user_id = p_target_id where user_id = p_anon_id;
  update activity_comments    set user_id = p_target_id where user_id = p_anon_id;
  update activity_reactions   set user_id = p_target_id where user_id = p_anon_id;
  update leaderboard_snapshots set user_id = p_target_id where user_id = p_anon_id;
  update nudge_log            set user_id = p_target_id where user_id = p_anon_id;

  -- 1:1 tables: a fresh target shouldn't have these rows, but clear defensively
  -- so a stale/partial row can't block the re-parent (unique on user_id).
  delete from streak_state      where user_id = p_target_id;
  update streak_state           set user_id = p_target_id where user_id = p_anon_id;
  delete from user_ride_pattern where user_id = p_target_id;
  update user_ride_pattern      set user_id = p_target_id where user_id = p_anon_id;

  -- Follows: re-parent both directions.
  update user_follows set follower_id  = p_target_id where follower_id  = p_anon_id;
  update user_follows set following_id = p_target_id where following_id = p_anon_id;

  -- Copy the anonymous profile's progress + preferences onto the fresh target,
  -- preserving the target's real identity (id / display_name / username /
  -- avatar / created_at / is_anonymous). The WHERE re-asserts freshness at
  -- write time (belt-and-suspenders vs concurrent XP awards).
  update profiles t set
    total_co2_saved_kg          = a.total_co2_saved_kg,
    total_money_saved_eur       = a.total_money_saved_eur,
    total_hazards_reported      = a.total_hazards_reported,
    total_riders_protected      = a.total_riders_protected,
    total_microlives            = a.total_microlives,
    total_community_seconds     = a.total_community_seconds,
    total_xp                    = a.total_xp,
    rider_tier                  = a.rider_tier,
    guardian_tier               = a.guardian_tier,
    cycling_goal                = coalesce(a.cycling_goal, t.cycling_goal),
    onboarding_completed_at     = coalesce(t.onboarding_completed_at, a.onboarding_completed_at),
    auto_share_rides            = a.auto_share_rides,
    trim_route_endpoints        = a.trim_route_endpoints,
    keep_full_gps_history       = a.keep_full_gps_history,
    notify_weather              = a.notify_weather,
    notify_hazard               = a.notify_hazard,
    notify_community            = a.notify_community,
    notify_streak               = a.notify_streak,
    notify_impact_summary       = a.notify_impact_summary,
    quiet_hours_start           = a.quiet_hours_start,
    quiet_hours_end             = a.quiet_hours_end,
    quiet_hours_timezone        = a.quiet_hours_timezone,
    pedal_voice_sassy           = a.pedal_voice_sassy,
    is_private                  = a.is_private,
    share_conversion_feed_optin = a.share_conversion_feed_optin
  from profiles a
  where t.id = p_target_id and a.id = p_anon_id
    and coalesce(t.total_xp, 0) = 0;

  -- Consume the source: any future merge attempt from this anon id is refused.
  update profiles set merged_at = now() where id = p_anon_id;

  return jsonb_build_object('merged', true);
end;
$$;

-- Re-assert the service-role-only ACL (CREATE OR REPLACE preserves grants, but
-- keep the migration self-contained and safe to re-run).
revoke all on function public.merge_anonymous_account(uuid, uuid) from public;
revoke all on function public.merge_anonymous_account(uuid, uuid) from anon;
revoke all on function public.merge_anonymous_account(uuid, uuid) from authenticated;
grant execute on function public.merge_anonymous_account(uuid, uuid) to service_role;
