-- Stop serving the road-risk dataset to anyone holding the app's anon key.
--
-- Found by the 2026-09-25 external-review triage as P0-2
-- (docs/plans/external-review-triage-2026-09-25.md). NOT in the external
-- review -- found while auditing RLS policy roles live.
--
-- WHAT WAS WRONG
--   `road_risk_data` carried policy "public read b47v1" -- USING (true),
--   TO public. Verified live on 2026-09-25 with only the anon key that ships
--   inside the APK: GET /rest/v1/road_risk_data?select=risk_score&limit=1
--   returned {"risk_score":45}. That is ~68M segments of exact, UNQUANTIZED
--   scores available to anyone who unzips the app.
--
--   This directly defeats a documented, deliberate investment. Per
--   .claude/CLAUDE.md "Risk Display Bands": score cuts are "server-side only
--   (2026-04-13 risk-IP hardening)", `RISK_BUCKETS` lives in
--   services/mobile-api/src/lib/risk.ts, the API quantizes `riskScore` to
--   bucket midpoints before it ever reaches a client, and thresholds must never
--   be mirrored client-side. The raw table was handing out strictly more than
--   the API has ever exposed -- the exact values the quantization exists to hide.
--
--   `rrd_capfix_backup` / `rrd_capfix_progress` are leftover working tables from
--   a risk-data repair with RLS DISABLED entirely; both returned real rows to
--   the anon key.
--
-- SAFETY: VERIFIED BEFORE WRITING
--   * Nothing client-side reads these tables. apps/mobile's only .from() call is
--     the `avatars` storage bucket; apps/web makes no Supabase table reads.
--   * The API reads risk through the `get_segmented_risk_route` RPC under the
--     service role, and service_role BYPASSES RLS entirely -- so dropping a
--     policy cannot affect it.
--   * ripgrep finds no code reference to `rrd_capfix` or `road_risk_data_old`
--     anywhere outside docs.
--   * The loader scripts (scripts/road-risk-data/*.py) connect as the DB owner,
--     which RLS does not constrain.
--
-- ⚠️ The rrd_capfix_* tables are LOCKED, NOT DROPPED. Dropping them is
--    destructive and irreversible and needs an explicit decision about whether
--    the repair history is still wanted; enabling RLS with no policy achieves
--    the security goal today and is reversible with one statement.
--
-- ⚠️ NOT ADDRESSED HERE, on purpose: `scenic_way_scores` also carries a
--    public-read policy and is also server-derived data with no client reader.
--    Same class, but outside this fix's scope -- raise it as its own decision
--    rather than widening a security migration.

-- ── 1. The live and archived risk datasets ─────────────────────────────────

DROP POLICY IF EXISTS "public read b47v1" ON public.road_risk_data;
DROP POLICY IF EXISTS "public read" ON public.road_risk_data_old_b47v1;

-- ── 2. Leftover repair working tables: enable RLS, grant no policy ──────────
--
-- With RLS enabled and zero policies, anon/authenticated get nothing while the
-- owner and service_role still have full access.

ALTER TABLE public.rrd_capfix_backup   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rrd_capfix_progress ENABLE ROW LEVEL SECURITY;

-- ── 3. Hazards: drop the redundant blanket-read policy ─────────────────────
--
-- "Anyone can read hazards" (USING (true), TO public) sat alongside the
-- narrower "Allow public select on hazards", and because permissive policies
-- are OR-ed it defeated that policy's two filters: `is_hidden = false`
-- (moderation) and the user_blocks exclusion. So a moderated-away hazard was
-- still readable over PostgREST.
--
-- Dropping it is not a regression for legitimate readers: "Allow public select
-- on hazards" still evaluates to true for anon on any non-hidden hazard
-- (its guard is `is_hidden = false AND (auth.uid() IS NULL OR ...)`), and the
-- app reads hazards through GET /v1/hazards/nearby under the service role
-- anyway. Net effect: moderation and block lists now actually apply.

DROP POLICY IF EXISTS "Anyone can read hazards" ON public.hazards;
