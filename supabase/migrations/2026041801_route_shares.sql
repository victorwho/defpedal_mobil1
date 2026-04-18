-- ═══════════════════════════════════════════════════════════════════════════
-- Route-share PRD — Slice 1 (tracer bullet)
--
-- 1. route_shares table — owner-created shareable route records
-- 2. RLS policies — owner CRUD with UPDATE restricted to revoked_at only,
--    public SELECT blocked (only the RPC below exposes public data)
-- 3. get_public_route_share(p_code) — public-read RPC that enforces
--    expiry/revocation, atomically increments view_count, and returns a
--    payload whose polyline is ALREADY trimmed 200m on both ends when
--    hide_endpoints=true (trim is computed by the API at share-create time
--    and stored in payload.trimmedGeometryPolyline6; this RPC just picks
--    which key to return — see implementation-plan.md §5, risk 1 mitigation)
--
-- Idempotent: all DDL uses IF NOT EXISTS / CREATE OR REPLACE.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. route_shares table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS route_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Discriminator for the source of the shared route. Slice 1 only writes
  -- 'planned'; 'saved' and 'past_ride' reserved for slice 5.
  source TEXT NOT NULL DEFAULT 'planned'
    CHECK (source IN ('planned', 'saved', 'past_ride')),

  -- FK-style reference into either saved_routes.id or trips.id when source
  -- is 'saved' or 'past_ride'. NULL for 'planned'. Stored as text so both
  -- UUID and non-UUID internal IDs are accommodated.
  source_ref_id TEXT NULL,

  -- Denormalized route snapshot. Required shape (enforced by the API, not
  -- by SQL — this is a JSONB for forward compat with slice 5/6 fields):
  --   {
  --     "origin": { "lat": number, "lon": number },
  --     "destination": { "lat": number, "lon": number },
  --     "geometryPolyline6": "<full encoded polyline>",
  --     "trimmedGeometryPolyline6": "<endpoints trimmed 200m>",  -- set at create
  --     "distanceMeters": number,
  --     "durationSeconds": number,
  --     "routingMode": "safe" | "fast" | "flat"
  --   }
  --
  -- The API MUST populate trimmedGeometryPolyline6 at insert time using
  -- packages/core's trimPrivacyZone (200m both ends, no-op when
  -- totalLength < 400m — polyline6 decoding in Postgres is impractical, so
  -- we do the trim in Node and store both forms).
  payload JSONB NOT NULL,

  -- 8-char base62 code enforced at app layer (packages/core shareCodeGenerator).
  -- UNIQUE index serves collision detection for the generator's isCodeUnique.
  short_code TEXT NOT NULL UNIQUE,

  hide_endpoints BOOLEAN NOT NULL DEFAULT true,
  view_count INTEGER NOT NULL DEFAULT 0,
  signup_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at TIMESTAMPTZ NULL
);

-- Helpful secondary indexes
CREATE INDEX IF NOT EXISTS idx_route_shares_user
  ON route_shares(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_shares_expires
  ON route_shares(expires_at)
  WHERE revoked_at IS NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Row-Level Security
--
-- Model:
--   - SELECT: owners only (authenticated role).
--   - INSERT: owner only; service_role bypasses RLS anyway for server writes.
--   - UPDATE: owner, and restricted via trigger below to the revoked_at column
--     only — everything else stays immutable.
--   - DELETE: owner only.
--   - Public unauth reads go ONLY through get_public_route_share() which
--     runs SECURITY DEFINER, so no public SELECT policy is needed. The
--     table stays closed to anon.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE route_shares ENABLE ROW LEVEL SECURITY;

-- Drop-and-recreate so the migration is idempotent on policies.
DROP POLICY IF EXISTS "Owners can read their route_shares"   ON route_shares;
DROP POLICY IF EXISTS "Owners can insert their route_shares" ON route_shares;
DROP POLICY IF EXISTS "Owners can update their route_shares" ON route_shares;
DROP POLICY IF EXISTS "Owners can delete their route_shares" ON route_shares;

CREATE POLICY "Owners can read their route_shares"
  ON route_shares FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Owners can insert their route_shares"
  ON route_shares FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update their route_shares"
  ON route_shares FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can delete their route_shares"
  ON route_shares FOR DELETE
  USING (auth.uid() = user_id);

-- Column-level UPDATE lockdown: owners may only touch revoked_at.
-- Postgres's column-level GRANTs apply to authenticated roles that come
-- through RLS, so grant UPDATE only on revoked_at and deny elsewhere.
-- This is the cleanest way to enforce "UPDATE restricted to revoked_at"
-- without a trigger dance.
REVOKE ALL ON route_shares FROM authenticated;
GRANT SELECT, INSERT, DELETE ON route_shares TO authenticated;
GRANT UPDATE (revoked_at) ON route_shares TO authenticated;

-- service_role gets full access for server-side logic.
GRANT ALL ON route_shares TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. get_public_route_share(p_code) RPC
--
-- Signed out / anonymous callers resolve /r/<code> through this RPC. It:
--   - Raises 'SHARE_NOT_FOUND' when the code is unknown.
--   - Raises 'SHARE_REVOKED' when revoked_at IS NOT NULL.
--   - Raises 'SHARE_EXPIRED' when expires_at <= now().
--   - Atomically increments view_count in ONE statement (UPDATE ... RETURNING).
--   - Returns a JSONB payload with trimmed polyline when hide_endpoints=true.
--
-- Returns:
--   {
--     "code": "...",
--     "source": "planned" | ...,
--     "sharerDisplayName": "Jane" | null,
--     "sharerAvatarUrl":   "https://..." | null,
--     "route": { ...payload with geometryPolyline6 chosen per hide_endpoints;
--                always includes riskSegments[] and safetyScore:number|null
--                (backfilled to [] / null for legacy rows) },
--     "endpointsHidden": true | false,
--     "fullLengthMeters": number,
--     "viewCount": integer,    -- post-increment value from the UPDATE RETURNING
--     "createdAt": "...",
--     "expiresAt": "..."
--   }
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_public_route_share(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE                  -- writes view_count; not STABLE
SECURITY DEFINER          -- callable by anon; executes as function owner
SET search_path = public
AS $$
DECLARE
  v_row        route_shares%ROWTYPE;
  v_route      JSONB;
  v_polyline   TEXT;
  v_full_len   NUMERIC;
  v_display    TEXT;
  v_avatar     TEXT;
BEGIN
  -- Atomic check + increment. UPDATE ... RETURNING gives us the full row
  -- after the bump; we filter on active state here so we only increment
  -- counts on successful retrievals. Separate error-discriminating SELECT
  -- below handles the revoked/expired/not-found branches.
  UPDATE route_shares
     SET view_count = view_count + 1
   WHERE short_code = p_code
     AND revoked_at IS NULL
     AND expires_at > now()
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    -- Disambiguate the failure mode so the API can map to 404/410.
    SELECT * INTO v_row FROM route_shares WHERE short_code = p_code;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SHARE_NOT_FOUND' USING ERRCODE = 'P0002';
    ELSIF v_row.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'SHARE_REVOKED'   USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'SHARE_EXPIRED'   USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Polyline selection:
  --   hide_endpoints=true  → payload.trimmedGeometryPolyline6 (API-computed 200m trim)
  --   hide_endpoints=false → payload.geometryPolyline6        (full path)
  --
  -- If trimmedGeometryPolyline6 is missing (should never happen; API is
  -- required to populate it), fall back to the full polyline so we never
  -- return an empty geometry.
  IF v_row.hide_endpoints THEN
    v_polyline := COALESCE(
      v_row.payload->>'trimmedGeometryPolyline6',
      v_row.payload->>'geometryPolyline6'
    );
  ELSE
    v_polyline := v_row.payload->>'geometryPolyline6';
  END IF;

  -- Rebuild the route payload with the chosen polyline swapped into
  -- geometryPolyline6, and strip the trimmed variant so the response shape
  -- is stable regardless of hide_endpoints. Backfill `riskSegments` ([]) and
  -- `safetyScore` (null) for legacy rows that predate the contract extension;
  -- COALESCE on the jsonb value ensures well-formed output either way.
  v_route := (v_row.payload - 'trimmedGeometryPolyline6')
           || jsonb_build_object('geometryPolyline6', v_polyline)
           || jsonb_build_object(
                'riskSegments',
                COALESCE(v_row.payload->'riskSegments', '[]'::jsonb)
              )
           || jsonb_build_object(
                'safetyScore',
                COALESCE(v_row.payload->'safetyScore', 'null'::jsonb)
              );

  v_full_len := COALESCE((v_row.payload->>'distanceMeters')::NUMERIC, 0);

  -- Owner display name + avatar are best-effort: username > display_name > NULL.
  SELECT COALESCE(p.username, p.display_name), p.avatar_url
    INTO v_display, v_avatar
    FROM profiles p
   WHERE p.id = v_row.user_id;

  RETURN jsonb_build_object(
    'code',              v_row.short_code,
    'source',            v_row.source,
    'sharerDisplayName', v_display,
    'sharerAvatarUrl',   v_avatar,
    'route',             v_route,
    'endpointsHidden',   v_row.hide_endpoints,
    'fullLengthMeters',  v_full_len,
    'viewCount',         v_row.view_count,
    'createdAt',         v_row.created_at,
    'expiresAt',         v_row.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_route_share(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_public_route_share(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_public_route_share(TEXT) TO service_role;

COMMENT ON FUNCTION get_public_route_share(TEXT) IS
  'Public-read RPC for /r/<code> consumers. Atomically increments view_count, '
  'enforces expiry/revocation (raises SHARE_EXPIRED / SHARE_REVOKED / '
  'SHARE_NOT_FOUND), and returns a payload whose polyline is already trimmed '
  '200m on both ends when hide_endpoints=true (trim computed API-side at '
  'share creation via packages/core trimPrivacyZone).';
