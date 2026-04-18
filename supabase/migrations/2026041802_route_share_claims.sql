-- ═══════════════════════════════════════════════════════════════════════════
-- Route-share PRD — Slice 2 (claim flow)
--
-- 1. route_share_claims table — tracks "invitee claimed this share" events
--    (one row per (share, invitee) pair; UNIQUE prevents double-claim).
-- 2. RLS policies — invitees can SELECT their own claim rows. No direct
--    INSERT/UPDATE/DELETE from authenticated role; all mutation flows
--    through the claim_route_share RPC below (which runs SECURITY DEFINER
--    and thus bypasses RLS).
-- 3. claim_route_share(p_code, p_invitee_id) RPC — atomic transaction that:
--      (a) resolves the share code → raises SHARE_NOT_FOUND / SHARE_REVOKED
--          / SHARE_EXPIRED / SELF_REFERRAL;
--      (b) attempts to INSERT route_share_claims (ON CONFLICT DO NOTHING)
--          — a conflict means the invitee already claimed; flips the
--          alreadyClaimed flag and skips side effects (2-8 below);
--      (c) INSERT a new saved_routes row for the invitee seeded from the
--          share's payload so the route lands in the invitee's "Saved" list;
--      (d) INSERT user_follows (invitee → share owner, status='accepted')
--          ON CONFLICT DO NOTHING so idempotent re-claims don't dup follows;
--      (e) increments route_shares.signup_count ONLY on first-time claim;
--      (f) returns jsonb { routePayload, sharerDisplayName, sharerAvatarUrl,
--          alreadyClaimed }.
--
-- Starter XP (+50) is deferred to slice 3 per plan §4 / implementation-plan.md §3.
-- Idempotent re-claim returns alreadyClaimed=true without duplicate rewards.
--
-- Idempotent DDL: all CREATE TABLE / INDEX / POLICY use IF NOT EXISTS;
-- CREATE OR REPLACE on the function.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. route_share_claims
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS route_share_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL REFERENCES route_shares(id) ON DELETE CASCADE,
  invitee_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (share_id, invitee_user_id)
);

-- Secondary index for "did invitee X claim any share?" lookups (slice 8 uses
-- this to check whether a user has already been onboarded via referral).
CREATE INDEX IF NOT EXISTS idx_route_share_claims_invitee
  ON route_share_claims(invitee_user_id, claimed_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Row-Level Security
--
-- Invitees can read their own claim rows (useful for "am I already claimed
-- on this share?" UI checks from the client). All mutation flows through the
-- SECURITY DEFINER RPC below, which bypasses RLS entirely. Therefore:
--   - SELECT policy: invitee OR share owner can see their rows.
--   - No INSERT/UPDATE/DELETE policies for authenticated → default-deny.
-- service_role gets full access for server-side reporting.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE route_share_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invitee reads own claims"       ON route_share_claims;
DROP POLICY IF EXISTS "Sharer reads claims on owned shares" ON route_share_claims;

CREATE POLICY "Invitee reads own claims"
  ON route_share_claims FOR SELECT
  USING (auth.uid() = invitee_user_id);

-- Share owners can see who claimed their shares — slice 8 "My Shares" needs
-- this for the Ambassador impact card.
CREATE POLICY "Sharer reads claims on owned shares"
  ON route_share_claims FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM route_shares rs
       WHERE rs.id = route_share_claims.share_id
         AND rs.user_id = auth.uid()
    )
  );

REVOKE ALL ON route_share_claims FROM authenticated;
GRANT SELECT ON route_share_claims TO authenticated;
GRANT ALL    ON route_share_claims TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. claim_route_share(p_code, p_invitee_id) RPC
--
-- Returns:
--   {
--     "routePayload": {
--       "origin", "destination",
--       "geometryPolyline6" (trimmed when hide_endpoints=true),
--       "distanceMeters", "durationSeconds", "routingMode",
--       "riskSegments", "safetyScore"
--     },
--     "sharerDisplayName": "Jane" | null,
--     "sharerAvatarUrl":   "https://..." | null,
--     "alreadyClaimed":    true | false
--   }
--
-- Error codes (raised as PG exceptions so the API can map to HTTP):
--   SHARE_NOT_FOUND → 404
--   SHARE_EXPIRED   → 410
--   SHARE_REVOKED   → 410
--   SELF_REFERRAL   → 422
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION claim_route_share(
  p_code       TEXT,
  p_invitee_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE               -- writes: claims + saved_routes + follows + signup_count
SECURITY DEFINER       -- bypasses RLS; callable by any authenticated user
SET search_path = public
AS $$
DECLARE
  v_share              route_shares%ROWTYPE;
  v_polyline           TEXT;
  v_route              JSONB;
  v_display            TEXT;
  v_avatar             TEXT;
  v_saved_route_name   TEXT;
  v_inserted_claim_id  UUID;
  v_already_claimed    BOOLEAN;
BEGIN
  -- Require a non-null invitee; defensive against bad API calls.
  IF p_invitee_id IS NULL THEN
    RAISE EXCEPTION 'SHARE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 1. Resolve the share + disambiguate failure modes. FOR UPDATE prevents
  --    a concurrent revoke/expire mutation from racing the claim.
  SELECT * INTO v_share
    FROM route_shares
   WHERE short_code = p_code
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHARE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_share.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'SHARE_REVOKED' USING ERRCODE = 'P0001';
  END IF;

  IF v_share.expires_at <= now() THEN
    RAISE EXCEPTION 'SHARE_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  IF v_share.user_id = p_invitee_id THEN
    RAISE EXCEPTION 'SELF_REFERRAL' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Attempt to insert the claim row. If the (share_id, invitee_user_id)
  --    UNIQUE key fires, the insert returns no rows — flip alreadyClaimed
  --    and skip the side effects so re-claim is idempotent.
  INSERT INTO route_share_claims (share_id, invitee_user_id)
  VALUES (v_share.id, p_invitee_id)
  ON CONFLICT (share_id, invitee_user_id) DO NOTHING
  RETURNING id INTO v_inserted_claim_id;

  v_already_claimed := (v_inserted_claim_id IS NULL);

  -- 3-5. Side effects fire ONLY on first-time claim. Each downstream write
  --      is independently idempotent (ON CONFLICT DO NOTHING on saved_routes
  --      + user_follows), so a partially-completed previous transaction
  --      doesn't leave the system wedged.
  IF NOT v_already_claimed THEN
    -- 3. Seed a saved_routes row from the share payload. Name is best-effort
    --    — derived from sharer display or falls back to "Shared route".
    SELECT COALESCE(p.username, p.display_name, 'Rider')
      INTO v_display
      FROM profiles p
     WHERE p.id = v_share.user_id;

    v_saved_route_name := format('Route from %s', COALESCE(v_display, 'friend'));

    -- Shape matches saved_routes schema: origin/destination JSONB,
    -- waypoints default '[]', mode TEXT, avoid_unpaved + avoid_hills BOOLEAN.
    -- Map share's `routingMode` ('safe'|'fast'|'flat') to saved_routes' mode
    -- ('safe'|'fast') + avoid_hills flag.
    INSERT INTO saved_routes (
      user_id,
      name,
      origin,
      destination,
      waypoints,
      mode,
      avoid_unpaved,
      avoid_hills
    )
    VALUES (
      p_invitee_id,
      v_saved_route_name,
      v_share.payload->'origin',
      v_share.payload->'destination',
      '[]'::jsonb,
      CASE
        WHEN v_share.payload->>'routingMode' = 'fast' THEN 'fast'
        ELSE 'safe'
      END,
      false,
      (v_share.payload->>'routingMode') = 'flat'
    );

    -- 4. Auto-follow the sharer on behalf of the invitee. status='accepted'
    --    means the follow is live (not a follow request). ON CONFLICT is
    --    scoped to (follower_id, following_id) — the composite PK.
    INSERT INTO user_follows (follower_id, following_id, status)
    VALUES (p_invitee_id, v_share.user_id, 'accepted')
    ON CONFLICT (follower_id, following_id) DO NOTHING;

    -- 5. Bump the sharer's signup_count for the Ambassador impact card.
    UPDATE route_shares
       SET signup_count = signup_count + 1
     WHERE id = v_share.id;
  END IF;

  -- 6. Build the response payload. Apply the same polyline selection that
  --    get_public_route_share uses: trimmed when hide_endpoints=true, full
  --    otherwise; strip the trimmed variant so the shape is stable.
  IF v_share.hide_endpoints THEN
    v_polyline := COALESCE(
      v_share.payload->>'trimmedGeometryPolyline6',
      v_share.payload->>'geometryPolyline6'
    );
  ELSE
    v_polyline := v_share.payload->>'geometryPolyline6';
  END IF;

  v_route := (v_share.payload - 'trimmedGeometryPolyline6')
           || jsonb_build_object('geometryPolyline6', v_polyline)
           || jsonb_build_object(
                'riskSegments',
                COALESCE(v_share.payload->'riskSegments', '[]'::jsonb)
              )
           || jsonb_build_object(
                'safetyScore',
                COALESCE(v_share.payload->'safetyScore', 'null'::jsonb)
              );

  -- Sharer display + avatar (re-query in case v_display was not set above
  -- because the fast-path already-claimed branch skipped it).
  SELECT COALESCE(p.username, p.display_name), p.avatar_url
    INTO v_display, v_avatar
    FROM profiles p
   WHERE p.id = v_share.user_id;

  RETURN jsonb_build_object(
    'routePayload',      v_route,
    'sharerDisplayName', v_display,
    'sharerAvatarUrl',   v_avatar,
    'alreadyClaimed',    v_already_claimed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION claim_route_share(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_route_share(TEXT, UUID) TO service_role;

COMMENT ON FUNCTION claim_route_share(TEXT, UUID) IS
  'Claim a route share on behalf of the invitee. Atomic — inserts claim + '
  'saved_route + follow + increments signup_count, or flips alreadyClaimed on '
  're-claim without side effects. Raises SHARE_NOT_FOUND / SHARE_EXPIRED / '
  'SHARE_REVOKED / SELF_REFERRAL for the API to map to HTTP 404 / 410 / 422. '
  'Starter XP (+50) is deferred to slice 3.';
