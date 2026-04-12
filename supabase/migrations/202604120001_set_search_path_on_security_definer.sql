-- Harden all SECURITY DEFINER functions by setting search_path = public.
-- Without an explicit search_path, a SECURITY DEFINER function executes with
-- the caller's search_path, which opens a search-path hijacking vector:
-- an attacker who can CREATE objects in a schema that precedes "public"
-- in search_path could shadow tables/functions used inside these RPCs.
--
-- award_xp was already fixed in 202604110003_secure_award_xp.sql.
-- promote_guardian_tier() was dropped in 202604090002_rider_tier_xp_system.sql.

-- ── get_user_trip_stats (202604020002) ──
ALTER FUNCTION get_user_trip_stats(UUID)
  SET search_path = public;

-- ── get_trip_stats_dashboard (202604020003) ──
ALTER FUNCTION get_trip_stats_dashboard(UUID, TEXT)
  SET search_path = public;

-- ── qualify_streak_action (202604030001) ──
ALTER FUNCTION qualify_streak_action(UUID, TEXT, TEXT)
  SET search_path = public;

-- ── record_ride_impact (202604050004 — extended signature) ──
ALTER FUNCTION record_ride_impact(UUID, UUID, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, INTEGER, NUMERIC)
  SET search_path = public;

-- ── get_impact_dashboard (202604090002 — latest version with XP fields) ──
ALTER FUNCTION get_impact_dashboard(UUID, TEXT)
  SET search_path = public;

-- ── get_hazard_reporter_impact (202604030002) ──
ALTER FUNCTION get_hazard_reporter_impact(UUID)
  SET search_path = public;

-- ── record_ride_microlives (202604050001) ──
ALTER FUNCTION record_ride_microlives(UUID, UUID, NUMERIC, TEXT, SMALLINT, BOOLEAN)
  SET search_path = public;

-- ── check_and_award_badges (202604060001 — latest version with trip count) ──
ALTER FUNCTION check_and_award_badges(UUID)
  SET search_path = public;
