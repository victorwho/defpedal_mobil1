-- P2 · Whole-table SELECT on the social tables, and a latent moderation bypass
-- on hazards.
--
-- Five tables carried `USING (true) TO authenticated`. The bare anon key returns
-- nothing, which is what made this look contained — but Supabase ANONYMOUS
-- SIGN-IN mints `role = authenticated`, and this app performs one on every new
-- install. So the cost of a full dump was a single free, unauthenticated API
-- call.
--
-- MEASURED LIVE before this migration, by simulating an ordinary signed-in
-- rider (`SET LOCAL ROLE authenticated` + a jwt claim, inside a rolled-back
-- transaction — no production user row was written to find this out):
--
--     profiles            3,485 rows
--     activity_feed         783 rows
--     user_follows           23 rows
--     feed_likes              4 rows
--     activity_reactions     81 rows
--
-- `activity_feed.payload` is the sharp one: 396 of those rows carry
-- `geometryPolyline6` alongside `startLocationText` and `destinationText` —
-- 396 riders' full routes, with where they set off from and where they were
-- going, available to anyone who can sign up.
--
-- ⚠️ Why narrowing these is safe, established rather than assumed:
--   * `service_role` has `rolbypassrls = true` (verified in `pg_roles`), and
--     every rider-facing read goes through the API on that key, so no endpoint
--     is affected by any policy here.
--   * Neither client reads these tables directly. The only `.from(` in the
--     mobile app is `.from('avatars')`, which is Storage, not a table; the web
--     app has none.
--   * No Realtime subscription exists on them — Realtime WOULD enforce RLS.
--   * The API's anon-key client is used solely for `auth.getUser(token)`, never
--     a table read.
--   * The one edge function that touches `profiles` (`inactive-warning`) builds
--     its client with `SUPABASE_SERVICE_ROLE_KEY`.
--
-- ⚠️ Consequence worth knowing: the Supabase Table Editor runs as
-- `authenticated`, so these tables will now look EMPTY there. Read them in the
-- SQL editor, or switch the Table Editor role to `service_role`. This repo
-- already documents that same surprise for `city_suggestions`.

-- ── profiles ────────────────────────────────────────────────────────────────
-- Own row only. Another rider's profile reaches the app through the API, which
-- selects exactly the public columns; the table itself carries quiet hours,
-- consent timestamps, locale, push preferences and every lifetime total.
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- ── activity_feed ───────────────────────────────────────────────────────────
-- Own rows only. The social feed is assembled by `get_ranked_feed`, called by
-- the API on the service role, so scoping direct reads costs no feature.
DROP POLICY IF EXISTS activity_feed_select_authenticated ON public.activity_feed;
CREATE POLICY activity_feed_select_own ON public.activity_feed
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── user_follows ────────────────────────────────────────────────────────────
-- Either side of the edge: a rider may see who they follow and who follows
-- them, which is what the graph means to them, without being able to walk
-- everyone else's.
DROP POLICY IF EXISTS user_follows_select_all ON public.user_follows;
CREATE POLICY user_follows_select_own_edges ON public.user_follows
  FOR SELECT TO authenticated
  USING (follower_id = auth.uid() OR following_id = auth.uid());

-- ── feed_likes / activity_reactions ─────────────────────────────────────────
-- Own reactions only. Counts and "did I react" both arrive through the API.
DROP POLICY IF EXISTS feed_likes_select_authenticated ON public.feed_likes;
CREATE POLICY feed_likes_select_own ON public.feed_likes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS activity_reactions_select_authenticated ON public.activity_reactions;
CREATE POLICY activity_reactions_select_own ON public.activity_reactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── hazards ─────────────────────────────────────────────────────────────────
-- `hazards_select_own` read `(auth.uid() = user_id) OR (user_id IS NULL)`.
-- RLS policies are OR'd, so that second branch made EVERY imported hazard
-- (user_id IS NULL — the entire import pipeline) readable without the
-- `is_hidden = false` and block-list conditions the public policy carries: a
-- moderation bypass, for the majority of the table.
--
-- The branch is also redundant. `Allow public select on hazards` already admits
-- `user_id IS NULL`, and does it WITH `is_hidden = false`. So the only thing
-- lost here is the ability to read a HIDDEN imported hazard; a reporter can
-- still see their own hidden report, which is deliberate.
--
-- ⚠️ This exposes nothing today — `is_hidden = true` currently matches 0 rows,
-- so it is a latent defect that would have started leaking the first time
-- anyone moderated an imported hazard. Recorded as latent rather than dressed
-- up as an active leak.
DROP POLICY IF EXISTS hazards_select_own ON public.hazards;
CREATE POLICY hazards_select_own ON public.hazards
  FOR SELECT
  USING (auth.uid() = user_id);
