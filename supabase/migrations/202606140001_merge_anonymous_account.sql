-- Anonymous → account data merge (review P1 #10, "fresh-signup-only" scope).
--
-- The app's signup flow (native Google signInWithIdToken / email signUp) creates
-- a NEW auth user and abandons the anonymous uid, orphaning the anonymous
-- account's rides/XP/badges/streak. This function re-parents that data to the
-- new account — but ONLY when the new account is "fresh" (no rides, no XP), the
-- dominant first-signup case. If the target already has data (a returning user
-- signing into a pre-existing account), the merge is skipped so an established
-- account can never be overwritten.
--
-- SECURITY: callable by service_role only. The API endpoint
-- (POST /v1/account/merge-anonymous) verifies BOTH the caller's JWT (target)
-- AND the supplied anonymous access token (proving ownership of the anon uid)
-- BEFORE invoking this with two already-verified uids. The whole body runs in
-- one transaction, so a failure leaves all data untouched.
--
-- NOT re-parented (intentional): push_tokens (the target re-registers its own
-- device token post-sign-in), notification_log / nudge_log / user_telemetry_events
-- (analytics/dedup logs), and the deprecated mia_* tables.

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
begin
  if p_anon_id is null or p_target_id is null or p_anon_id = p_target_id then
    return jsonb_build_object('merged', false, 'reason', 'invalid_ids');
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
  -- avatar / created_at / is_anonymous).
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
  where t.id = p_target_id and a.id = p_anon_id;

  return jsonb_build_object('merged', true);
end;
$$;

-- Service-role only: the API (supabaseAdmin, which executes as service_role)
-- verifies both tokens before calling this. Revoke the default PUBLIC execute
-- grant, then grant ONLY service_role so anon/authenticated JWTs cannot invoke
-- it directly (an unguarded re-parent would be a data-theft vector).
revoke all on function public.merge_anonymous_account(uuid, uuid) from public;
revoke all on function public.merge_anonymous_account(uuid, uuid) from anon;
revoke all on function public.merge_anonymous_account(uuid, uuid) from authenticated;
grant execute on function public.merge_anonymous_account(uuid, uuid) to service_role;
