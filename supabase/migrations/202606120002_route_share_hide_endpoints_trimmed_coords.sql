-- ═══════════════════════════════════════════════════════════════════════════
-- P0 security fix (full-app review 2026-06-12, finding P0-2):
-- hide_endpoints privacy trim was defeated by raw origin/destination passthrough.
--
-- Both get_public_route_share and claim_route_share assembled the returned
-- route as `payload - 'trimmedGeometryPolyline6'` — swapping in the trimmed
-- POLYLINE when hide_endpoints=true, but leaving the raw `origin` and
-- `destination` lat/lon keys (the sharer's exact home/work coordinates)
-- untouched in the payload. Both RPCs are EXECUTE-granted to anon /
-- authenticated, so any holder of the public anon key could read the exact
-- coordinates the trim exists to hide. claim_route_share additionally copied
-- the raw coordinates into the invitee's saved_routes row.
--
-- Fix:
--   * createShare (services/mobile-api/src/lib/routeShareService.ts) now
--     stores `trimmedOrigin` / `trimmedDestination` ({lat, lon} = first/last
--     points of the 200m-trimmed polyline) in the payload.
--   * Both RPCs now, when hide_endpoints=true, overwrite origin/destination
--     in the returned route with the trimmed endpoints, and claim_route_share
--     uses them for the invitee's saved_routes insert.
--   * Both RPCs strip trimmedOrigin/trimmedDestination (alongside
--     trimmedGeometryPolyline6) from the returned payload so the response
--     shape is unchanged for consumers.
--
-- Legacy rows (created before this migration) lack trimmedOrigin/Destination;
-- the NULLIF+COALESCE falls back to the raw coordinates for them. route_shares
-- expire 30 days after creation (DEFAULT now() + interval '30 days'), so the
-- legacy exposure window closes by itself ~30 days after this deploys.
-- NULLIF guards matter: the API stores JSON null (not absent) for degenerate
-- geometry, and jsonb 'null' is NOT SQL NULL, so bare COALESCE would not fall
-- back.
--
-- Function bodies are otherwise verbatim copies of the latest definitions:
--   get_public_route_share — 2026041801_route_shares.sql
--   claim_route_share      — 2026042001_route_share_slice8.sql
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. get_public_route_share — privacy-safe endpoints when hide_endpoints
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_public_route_share(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
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
  IF v_row.hide_endpoints THEN
    v_polyline := COALESCE(
      v_row.payload->>'trimmedGeometryPolyline6',
      v_row.payload->>'geometryPolyline6'
    );
  ELSE
    v_polyline := v_row.payload->>'geometryPolyline6';
  END IF;

  -- Rebuild the route payload with the chosen polyline swapped into
  -- geometryPolyline6, and strip the trimmed-variant keys so the response
  -- shape is stable regardless of hide_endpoints. Backfill `riskSegments`
  -- ([]) and `safetyScore` (null) for legacy rows.
  --
  -- P0-2 fix: when hide_endpoints, origin/destination are overwritten with
  -- the privacy-trimmed endpoints so the sharer's exact home/work
  -- coordinates never leave the row. NULLIF guards JSON-null payload values.
  v_route := (v_row.payload - 'trimmedGeometryPolyline6'
                            - 'trimmedOrigin'
                            - 'trimmedDestination')
           || jsonb_build_object('geometryPolyline6', v_polyline)
           || jsonb_build_object(
                'riskSegments',
                COALESCE(v_row.payload->'riskSegments', '[]'::jsonb)
              )
           || jsonb_build_object(
                'safetyScore',
                COALESCE(v_row.payload->'safetyScore', 'null'::jsonb)
              );

  IF v_row.hide_endpoints THEN
    v_route := v_route || jsonb_build_object(
      'origin', COALESCE(
        NULLIF(v_row.payload->'trimmedOrigin', 'null'::jsonb),
        v_row.payload->'origin'
      ),
      'destination', COALESCE(
        NULLIF(v_row.payload->'trimmedDestination', 'null'::jsonb),
        v_row.payload->'destination'
      )
    );
  END IF;

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

COMMENT ON FUNCTION get_public_route_share(TEXT) IS
  'Public-read RPC for /r/<code> consumers. Atomically increments view_count, '
  'enforces expiry/revocation (raises SHARE_EXPIRED / SHARE_REVOKED / '
  'SHARE_NOT_FOUND), and returns a payload whose polyline AND '
  'origin/destination are already privacy-trimmed when hide_endpoints=true '
  '(trim computed API-side at share creation via packages/core '
  'trimPrivacyZone; endpoints substituted from payload.trimmedOrigin/'
  'trimmedDestination — review 2026-06-12 P0-2).';


-- ───────────────────────────────────────────────────────────────────────────
-- 2. claim_route_share — privacy-safe endpoints in returned payload AND in
--    the invitee saved_routes insert. Body otherwise verbatim slice 8.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION claim_route_share(
  p_code       TEXT,
  p_invitee_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
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
  v_invitee_xp                INT := NULL;
  v_inviter_xp                INT := NULL;
  v_inviter_new_badges        JSONB := '[]'::jsonb;
  v_invitee_new_badges        JSONB := '[]'::jsonb;
  v_mia_milestone_advanced    BOOLEAN := FALSE;
  v_invitee_existing_welcome  INT;
  v_inviter_monthly_count     INT;
  v_inviter_total_conversions INT;
  v_inviter_persona           TEXT;
  v_inviter_mia_status        TEXT;
  v_tier_row                  RECORD;
  v_new_tier                  TEXT;
  v_old_tier                  TEXT;
  v_scratch_total_xp          INT;
  v_sharer_is_private         BOOLEAN := FALSE;
  v_follow_pending            BOOLEAN := FALSE;
  v_sharer_feed_optin         BOOLEAN := TRUE;
  v_trimmed_polyline          TEXT;
  -- P0-2: privacy-safe endpoints (trimmed when hide_endpoints, else raw)
  v_safe_origin               JSONB;
  v_safe_destination          JSONB;
  AMBASSADOR_BRONZE_AT CONSTANT INT := 1;
  AMBASSADOR_SILVER_AT CONSTANT INT := 5;
  AMBASSADOR_GOLD_AT   CONSTANT INT := 25;
  INVITEE_WELCOME_XP   CONSTANT INT := 50;
  INVITER_REFERRAL_XP  CONSTANT INT := 100;
  INVITER_MONTHLY_CAP  CONSTANT INT := 5;
BEGIN
  IF p_invitee_id IS NULL THEN
    RAISE EXCEPTION 'SHARE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

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

  -- P0-2: resolve the endpoints every downstream consumer is allowed to see.
  -- hide_endpoints=true → trimmed endpoints (NULLIF guards JSON-null values
  -- written by the API for degenerate geometry; falls back to raw for legacy
  -- rows that predate trimmedOrigin/trimmedDestination — those age out with
  -- the 30-day share expiry).
  IF v_share.hide_endpoints THEN
    v_safe_origin := COALESCE(
      NULLIF(v_share.payload->'trimmedOrigin', 'null'::jsonb),
      v_share.payload->'origin'
    );
    v_safe_destination := COALESCE(
      NULLIF(v_share.payload->'trimmedDestination', 'null'::jsonb),
      v_share.payload->'destination'
    );
  ELSE
    v_safe_origin := v_share.payload->'origin';
    v_safe_destination := v_share.payload->'destination';
  END IF;

  INSERT INTO route_share_claims (share_id, invitee_user_id)
  VALUES (v_share.id, p_invitee_id)
  ON CONFLICT (share_id, invitee_user_id) DO NOTHING
  RETURNING id INTO v_inserted_claim_id;

  v_already_claimed := (v_inserted_claim_id IS NULL);

  IF NOT v_already_claimed THEN
    -- Slice 8: pull is_private AND feed-optin in the same single row read.
    SELECT COALESCE(p.username, p.display_name, 'Rider'),
           COALESCE(p.is_private, FALSE),
           COALESCE(p.share_conversion_feed_optin, TRUE)
      INTO v_display, v_sharer_is_private, v_sharer_feed_optin
      FROM profiles p
     WHERE p.id = v_share.user_id;

    v_saved_route_name := format('Route from %s', COALESCE(v_display, 'friend'));

    -- P0-2: the invitee's saved route gets the privacy-safe endpoints, not
    -- the sharer's raw home/work coordinates.
    INSERT INTO saved_routes (
      user_id, name, origin, destination, waypoints,
      mode, avoid_unpaved, avoid_hills
    )
    VALUES (
      p_invitee_id,
      v_saved_route_name,
      v_safe_origin,
      v_safe_destination,
      '[]'::jsonb,
      CASE WHEN v_share.payload->>'routingMode' = 'fast' THEN 'fast' ELSE 'safe' END,
      false,
      (v_share.payload->>'routingMode') = 'flat'
    );

    v_follow_pending := v_sharer_is_private;
    INSERT INTO user_follows (follower_id, following_id, status, source)
    VALUES (
      p_invitee_id,
      v_share.user_id,
      CASE WHEN v_sharer_is_private THEN 'pending' ELSE 'accepted' END,
      'route_share_claim'
    )
    ON CONFLICT (follower_id, following_id) DO NOTHING;

    UPDATE route_shares
       SET signup_count = signup_count + 1
     WHERE id = v_share.id;

    -- Slice 8: activity_feed fork — only when sharer opted in.
    -- The feed row is owned by the sharer so followers see it in their
    -- own feed; the invitee is referenced in the payload.
    -- `routePreviewPolylineTrimmed` uses the stored trimmed polyline (or
    -- the full polyline fallback if trimmed is missing), so feed viewers
    -- never get the sharer's home/work addresses.
    IF v_sharer_feed_optin THEN
      v_trimmed_polyline := COALESCE(
        v_share.payload->>'trimmedGeometryPolyline6',
        v_share.payload->>'geometryPolyline6'
      );
      INSERT INTO activity_feed (user_id, type, payload)
      VALUES (
        v_share.user_id,
        'route_share_signup',
        jsonb_build_object(
          'sharerUserId',                 v_share.user_id,
          'inviteeUserId',                p_invitee_id,
          'shareId',                      v_share.id,
          'routePreviewPolylineTrimmed',  v_trimmed_polyline
        )
      );
    END IF;

    -- 3.4 Invitee +50 XP
    SELECT COUNT(*) INTO v_invitee_existing_welcome
      FROM xp_events
     WHERE user_id = p_invitee_id
       AND action  = 'referral_welcome';

    IF v_invitee_existing_welcome = 0 THEN
      INSERT INTO xp_events (user_id, action, base_xp, multiplier, final_xp, source_id)
      VALUES (p_invitee_id, 'referral_welcome', INVITEE_WELCOME_XP, 1.0, INVITEE_WELCOME_XP, p_code);

      UPDATE profiles
         SET total_xp = COALESCE(total_xp, 0) + INVITEE_WELCOME_XP
       WHERE id = p_invitee_id
       RETURNING total_xp, rider_tier INTO v_scratch_total_xp, v_old_tier;

      SELECT name INTO v_new_tier
        FROM rider_tier_definitions
       WHERE xp_required <= v_scratch_total_xp
       ORDER BY xp_required DESC
       LIMIT 1;

      IF v_new_tier IS DISTINCT FROM v_old_tier THEN
        UPDATE profiles SET rider_tier = v_new_tier WHERE id = p_invitee_id;
      END IF;

      v_invitee_xp := INVITEE_WELCOME_XP;
    END IF;

    -- 3.5 Inviter +100 XP
    SELECT COUNT(*) INTO v_inviter_monthly_count
      FROM xp_events
     WHERE user_id = v_share.user_id
       AND action  = 'referral'
       AND created_at >= date_trunc('month', now());

    IF v_inviter_monthly_count < INVITER_MONTHLY_CAP THEN
      INSERT INTO xp_events (user_id, action, base_xp, multiplier, final_xp, source_id)
      VALUES (v_share.user_id, 'referral', INVITER_REFERRAL_XP, 1.0, INVITER_REFERRAL_XP, p_code);

      UPDATE profiles
         SET total_xp = COALESCE(total_xp, 0) + INVITER_REFERRAL_XP
       WHERE id = v_share.user_id
       RETURNING total_xp, rider_tier INTO v_scratch_total_xp, v_old_tier;

      SELECT name INTO v_new_tier
        FROM rider_tier_definitions
       WHERE xp_required <= v_scratch_total_xp
       ORDER BY xp_required DESC
       LIMIT 1;

      IF v_new_tier IS DISTINCT FROM v_old_tier THEN
        UPDATE profiles SET rider_tier = v_new_tier WHERE id = v_share.user_id;
      END IF;

      v_inviter_xp := INVITER_REFERRAL_XP;
    END IF;

    -- 3.6 Ambassador badges
    SELECT COUNT(DISTINCT rsc.invitee_user_id)
      INTO v_inviter_total_conversions
      FROM route_share_claims rsc
      JOIN route_shares rs ON rs.id = rsc.share_id
     WHERE rs.user_id = v_share.user_id;

    IF v_inviter_total_conversions >= AMBASSADOR_BRONZE_AT THEN
      WITH ins AS (
        INSERT INTO user_badges (user_id, badge_key)
        VALUES (v_share.user_id, 'ambassador_bronze')
        ON CONFLICT (user_id, badge_key) DO NOTHING
        RETURNING badge_key
      )
      SELECT bd.badge_key, bd.name, bd.flavor_text, bd.icon_key, bd.tier
        INTO v_tier_row
        FROM ins JOIN badge_definitions bd USING (badge_key);

      IF v_tier_row.badge_key IS NOT NULL THEN
        v_inviter_new_badges := v_inviter_new_badges || jsonb_build_object(
          'badgeKey', v_tier_row.badge_key, 'name', v_tier_row.name,
          'flavorText', v_tier_row.flavor_text, 'iconKey', v_tier_row.icon_key,
          'tier', v_tier_row.tier
        );
      END IF;
    END IF;

    IF v_inviter_total_conversions >= AMBASSADOR_SILVER_AT THEN
      v_tier_row := NULL;
      WITH ins AS (
        INSERT INTO user_badges (user_id, badge_key)
        VALUES (v_share.user_id, 'ambassador_silver')
        ON CONFLICT (user_id, badge_key) DO NOTHING
        RETURNING badge_key
      )
      SELECT bd.badge_key, bd.name, bd.flavor_text, bd.icon_key, bd.tier
        INTO v_tier_row
        FROM ins JOIN badge_definitions bd USING (badge_key);

      IF v_tier_row.badge_key IS NOT NULL THEN
        v_inviter_new_badges := v_inviter_new_badges || jsonb_build_object(
          'badgeKey', v_tier_row.badge_key, 'name', v_tier_row.name,
          'flavorText', v_tier_row.flavor_text, 'iconKey', v_tier_row.icon_key,
          'tier', v_tier_row.tier
        );
      END IF;
    END IF;

    IF v_inviter_total_conversions >= AMBASSADOR_GOLD_AT THEN
      v_tier_row := NULL;
      WITH ins AS (
        INSERT INTO user_badges (user_id, badge_key)
        VALUES (v_share.user_id, 'ambassador_gold')
        ON CONFLICT (user_id, badge_key) DO NOTHING
        RETURNING badge_key
      )
      SELECT bd.badge_key, bd.name, bd.flavor_text, bd.icon_key, bd.tier
        INTO v_tier_row
        FROM ins JOIN badge_definitions bd USING (badge_key);

      IF v_tier_row.badge_key IS NOT NULL THEN
        v_inviter_new_badges := v_inviter_new_badges || jsonb_build_object(
          'badgeKey', v_tier_row.badge_key, 'name', v_tier_row.name,
          'flavorText', v_tier_row.flavor_text, 'iconKey', v_tier_row.icon_key,
          'tier', v_tier_row.tier
        );
      END IF;
    END IF;

    -- 3.7 Mia milestone
    SELECT persona, mia_journey_status
      INTO v_inviter_persona, v_inviter_mia_status
      FROM profiles
     WHERE id = v_share.user_id;

    IF v_inviter_persona = 'mia' AND v_inviter_mia_status = 'active' THEN
      UPDATE profiles
         SET mia_non_cyclists_converted = COALESCE(mia_non_cyclists_converted, 0) + 1
       WHERE id = v_share.user_id;
      v_mia_milestone_advanced := TRUE;
    END IF;
  END IF;

  -- Route payload assembly
  IF v_share.hide_endpoints THEN
    v_polyline := COALESCE(
      v_share.payload->>'trimmedGeometryPolyline6',
      v_share.payload->>'geometryPolyline6'
    );
  ELSE
    v_polyline := v_share.payload->>'geometryPolyline6';
  END IF;

  -- P0-2: strip the trimmed-variant keys and overwrite origin/destination
  -- with the privacy-safe endpoints resolved above.
  v_route := (v_share.payload - 'trimmedGeometryPolyline6'
                              - 'trimmedOrigin'
                              - 'trimmedDestination')
           || jsonb_build_object('geometryPolyline6', v_polyline)
           || jsonb_build_object('origin', v_safe_origin)
           || jsonb_build_object('destination', v_safe_destination)
           || jsonb_build_object('riskSegments',
                COALESCE(v_share.payload->'riskSegments', '[]'::jsonb))
           || jsonb_build_object('safetyScore',
                COALESCE(v_share.payload->'safetyScore', 'null'::jsonb));

  SELECT COALESCE(p.username, p.display_name), p.avatar_url
    INTO v_display, v_avatar
    FROM profiles p
   WHERE p.id = v_share.user_id;

  RETURN jsonb_build_object(
    'routePayload',      v_route,
    'sharerDisplayName', v_display,
    'sharerAvatarUrl',   v_avatar,
    'alreadyClaimed',    v_already_claimed,
    'rewards',           jsonb_build_object(
      'inviteeXpAwarded',     v_invitee_xp,
      'inviteeNewBadges',     v_invitee_new_badges,
      'inviterXpAwarded',     v_inviter_xp,
      'inviterNewBadges',     v_inviter_new_badges,
      'inviterUserId',        v_share.user_id,
      'miaMilestoneAdvanced', v_mia_milestone_advanced,
      'followPending',        v_follow_pending
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_route_share(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_public_route_share(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_public_route_share(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION claim_route_share(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_route_share(TEXT, UUID) TO service_role;

COMMENT ON FUNCTION claim_route_share(TEXT, UUID) IS
  'Claim a route share: idempotent per (share, invitee), inserts saved_route '
  '+ follow + XP + Ambassador badges + optional activity_feed row. As of '
  '2026-06-12 (review P0-2), the returned payload AND the invitee saved_route '
  'use privacy-trimmed origin/destination when hide_endpoints=true.';
