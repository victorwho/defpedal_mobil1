-- Revoke client-role EXECUTE on SECURITY DEFINER functions that trust a
-- caller-supplied identity, or that perform maintenance/destructive work.
--
-- Found by the 2026-09-25 external-review triage as P0-1
-- (docs/plans/external-review-triage-2026-09-25.md).
--
-- WHY THIS IS REACHABLE AT ALL
--   The anon key ships inside the APK (EXPO_PUBLIC_SUPABASE_ANON_KEY), and
--   Supabase anonymous sign-in mints a `role=authenticated` JWT. PostgREST
--   exposes every function in `public` that the caller's role may EXECUTE, and
--   Postgres grants EXECUTE to PUBLIC by default for every new function. So
--   "the app never calls this RPC" is not a defence -- the GRANT is.
--
--   Proven live on 2026-09-25: POST /rest/v1/rpc/get_suggested_users with only
--   the anon key and a fabricated p_viewer_id returned HTTP 200 and a real
--   rider's display name, tier and activity count. A control call to a
--   non-granted function returned 401, so that 200 was a genuine grant.
--
-- WHY REVOCATION RATHER THAN auth.uid() GUARDS
--   This is the strategy 202606120003:20-22 already chose, because every
--   legitimate caller is the API's service role. Measured 2026-09-25: of the
--   17 uuid-taking definer functions, exactly ONE (`award_xp`) carries an
--   identity guard -- and even that one still permits self-awarding an
--   arbitrary p_base_xp. The other 16 contain no auth.uid() reference at all.
--   16 hand-written guards are 16 chances to miss one; one revocation
--   invariant is checkable in a single query (see the runbook check below).
--
-- WHY IT REGRESSED BEFORE (both mechanisms are in this file's blast radius)
--   * 202606120003:62-70 revoked four dashboard RPCs. 202606290001:184 -- a
--     migration about CALORIES, 17 days later -- re-granted
--     get_impact_dashboard to `authenticated` without mentioning the revoke.
--   * 202607190001:378 dropped the 6-arg get_ranked_feed (destroying its ACL)
--     and created an 8-arg one with no grant statement, so it fell to the
--     PUBLIC default.
--   Enforcement is therefore NOT complete until query A-1 from the triage doc
--   is a monitoring-runbook health check. Add it.
--
-- SAFETY: VERIFIED BEFORE WRITING
--   * apps/mobile makes ZERO supabase.rpc() calls (grep incl. tests); its only
--     .from() is the `avatars` storage bucket.
--   * apps/web makes ZERO .rpc() calls.
--   * The only edge function calling an RPC uses the service-role key
--     (supabase/functions/inactive-warning/index.ts:207,223).
--   So every legitimate caller is service_role and this breaks nothing.
--
-- ⚠️ service_role inherits EXECUTE *via PUBLIC*. Revoking from PUBLIC without
--    an explicit GRANT TO service_role would break the API. Every REVOKE below
--    is therefore paired with a GRANT, exactly as 202606120003:67-70 does.
--
-- DELIBERATELY LEFT GRANTED (do not "tidy" these away):
--   * get_public_route_share(text)  -- the public /r/<code> web page reads a
--     share with no session; granted to anon on purpose at 2026041801:247.
--   * record_route_share_view(text) -- that same page's view beacon.
--   * st_estimatedextent(...)       -- PostGIS extension-owned.

-- ── 1. Identity-trusting functions (take a caller-supplied user id) ─────────

REVOKE EXECUTE ON FUNCTION public.award_xp(uuid, text, integer, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.award_xp(uuid, text, integer, numeric, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_and_award_badges(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_and_award_badges(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_champion_repeat_badges(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_champion_repeat_badges(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_route_share(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_route_share(text, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.clear_inactive_warning(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.clear_inactive_warning(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_impact_dashboard(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_impact_dashboard(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_neighborhood_leaderboard(double precision, double precision, integer, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_neighborhood_leaderboard(double precision, double precision, integer, text, text, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_ranked_feed(uuid, double precision, double precision, double precision, uuid, integer, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_ranked_feed(uuid, double precision, double precision, double precision, uuid, integer, double precision, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_sesizare_counts(uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_sesizare_counts(uuid[], uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_suggested_users(uuid, double precision, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_suggested_users(uuid, double precision, double precision, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_public_profile(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_user_public_profile(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.qualify_streak_action(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qualify_streak_action(uuid, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_ride_impact(uuid, uuid, numeric, numeric, text, numeric, numeric, text, integer, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_ride_impact(uuid, uuid, numeric, numeric, text, numeric, numeric, text, integer, numeric, numeric) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_ride_microlives(uuid, uuid, numeric, text, smallint, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_ride_microlives(uuid, uuid, numeric, text, smallint, boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.revoke_route_share(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.revoke_route_share(uuid, uuid) TO service_role;

-- get_nearby_hazards: no caller-supplied identity, but no client caller either
-- (the app reads hazards through GET /v1/hazards/nearby, which is service-role).
REVOKE EXECUTE ON FUNCTION public.get_nearby_hazards(double precision, double precision, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_nearby_hazards(double precision, double precision, double precision, integer) TO service_role;

-- ── 2. Maintenance / DESTRUCTIVE functions ─────────────────────────────────
--
-- These were all anon-executable. truncate_old_gps_trails() and
-- prune_planned_routes() DELETE rider data; select_purgeable_inactive_users()
-- enumerates accounts eligible for deletion. They are cron-only, invoked by
-- POST /v1/retention endpoints under the service role.

REVOKE EXECUTE ON FUNCTION public.truncate_old_gps_trails() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.truncate_old_gps_trails() TO service_role;

REVOKE EXECUTE ON FUNCTION public.prune_planned_routes() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.prune_planned_routes() TO service_role;

REVOKE EXECUTE ON FUNCTION public.flag_inactive_users() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.flag_inactive_users() TO service_role;

REVOKE EXECUTE ON FUNCTION public.select_purgeable_inactive_users() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.select_purgeable_inactive_users() TO service_role;

-- ── 3. Trigger functions (hygiene) ─────────────────────────────────────────
--
-- Calling these over PostgREST errors ("can only be called as a trigger"), so
-- the exposure is theoretical -- but trigger execution does NOT consult EXECUTE
-- privileges, so revoking is free and removes them from the audit surface.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_hazard_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_is_anonymous() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.propagate_trip_share_hidden_to_activity_feed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.anonymise_trips_on_user_delete() FROM PUBLIC, anon, authenticated;
