-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1 security hardening (full-app review 2026-06-12, P1 #6/#7 + P2s)
--
-- 1. activity_comments: add is_hidden (auto-moderation flag, mirrors
--    feed_comments) and close the moderation bypass — direct INSERT via the
--    anon key skipped the API's sanitise/filter pipeline entirely. All app
--    comment writes go through the API (service role); no client code
--    queries these tables directly (verified by grep across apps/).
-- 2. feed_comments: same direct-INSERT bypass closed; SELECT policies on
--    both tables now exclude is_hidden rows so hidden comments can't be
--    read around the API either.
-- 3. quiz_answers: created with NO RLS and Supabase default grants — any
--    anon-key holder could read/write every user's quiz history. No TS code
--    references the table at all (only badge-eval SQL functions, which are
--    SECURITY DEFINER and unaffected by RLS). Locked down completely.
-- 4. User-stats SECURITY DEFINER RPCs (get_trip_stats_dashboard,
--    get_user_trip_stats, get_impact_dashboard, get_hazard_reporter_impact):
--    they take a caller-supplied target user id with no ownership check and
--    default EXECUTE was granted to PUBLIC — any anon JWT could pull any
--    user's stats. They are invoked exclusively by the API via the service
--    role (verified: only supabaseAdmin.rpc callers), so EXECUTE is revoked
--    from client roles instead of adding per-function auth.uid() guards.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. activity_comments: is_hidden + moderation-bypass closure ────────────

ALTER TABLE activity_comments
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- Comments must flow through the API (rate limit + sanitise + filter).
DROP POLICY IF EXISTS "activity_comments_insert_own" ON activity_comments;
REVOKE INSERT ON activity_comments FROM authenticated;
REVOKE INSERT ON activity_comments FROM anon;

-- Hidden rows are moderator-only (service role bypasses RLS).
DROP POLICY IF EXISTS "activity_comments_select_authenticated" ON activity_comments;
CREATE POLICY "activity_comments_select_visible"
  ON activity_comments FOR SELECT
  TO authenticated
  USING (NOT is_hidden);

-- ── 2. feed_comments: same bypass closure ──────────────────────────────────

DROP POLICY IF EXISTS "feed_comments_insert_own" ON feed_comments;
REVOKE INSERT ON feed_comments FROM authenticated;
REVOKE INSERT ON feed_comments FROM anon;

DROP POLICY IF EXISTS "feed_comments_select_authenticated" ON feed_comments;
CREATE POLICY "feed_comments_select_visible"
  ON feed_comments FOR SELECT
  TO authenticated
  USING (NOT is_hidden);

-- ── 3. quiz_answers: full client lockdown ──────────────────────────────────

ALTER TABLE quiz_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quiz_answers FROM anon;
REVOKE ALL ON quiz_answers FROM authenticated;

-- ── 4. Stats RPCs: service-role only ───────────────────────────────────────

REVOKE EXECUTE ON FUNCTION get_trip_stats_dashboard(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_user_trip_stats(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_impact_dashboard(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_hazard_reporter_impact(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION get_trip_stats_dashboard(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION get_user_trip_stats(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_impact_dashboard(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION get_hazard_reporter_impact(uuid) TO service_role;
