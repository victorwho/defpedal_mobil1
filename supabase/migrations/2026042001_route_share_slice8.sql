-- ═══════════════════════════════════════════════════════════════════════════
-- Route-Share Slice 8 — Ambassador observability + control
--
-- Four changes:
--   1. Extend `activity_feed.type` CHECK to allow 'route_share_signup'
--   2. Add `profiles.share_conversion_feed_optin BOOLEAN DEFAULT TRUE`
--   3. New RPC `revoke_route_share(p_id, p_user_id)` — owner-checked revoke
--   4. New RPC `record_route_share_view(p_code, p_ua)` — UA-filtered view
--      beacon with atomic 0→1 detection (returns `firstView` flag used by
--      the API to decide whether to dispatch a first-view push)
--   5. Replace `claim_route_share` RPC — identical to slice 4 except it
--      also inserts an activity_feed row of type 'route_share_signup' when
--      the sharer has opted in to the conversion feed
--
-- Idempotent: all DDL uses IF NOT EXISTS / DROP+CREATE / CREATE OR REPLACE.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. activity_feed.type — add 'route_share_signup'
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE activity_feed
  DROP CONSTRAINT IF EXISTS activity_feed_type_check;

ALTER TABLE activity_feed
  ADD CONSTRAINT activity_feed_type_check
  CHECK (type IN (
    'ride',
    'hazard_batch',
    'hazard_standalone',
    'tier_up',
    'badge_unlock',
    'route_share_signup'
  ));


-- ───────────────────────────────────────────────────────────────────────────
-- 2. profiles.share_conversion_feed_optin
--
-- Default TRUE per PRD ("default ON"). Sharers who dislike the feed fork
-- can turn it off in Profile → Display → Share activity feed.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS share_conversion_feed_optin BOOLEAN NOT NULL DEFAULT TRUE;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. revoke_route_share(p_id, p_user_id) RPC
--
-- Ownership-enforced revoke. Returns JSONB { status: 'ok' | 'not_found' }.
-- A non-owner or unknown id both yield 'not_found' so the API doesn't leak
-- the existence of other users' share ids.
-- Idempotent on already-revoked: returns 'ok' without touching revoked_at.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION revoke_route_share(
  p_id      UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share  route_shares%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT * INTO v_share
    FROM route_shares
   WHERE id = p_id
     AND user_id = p_user_id;

  IF NOT FOUND THEN
    -- Unknown id OR owned by another user — collapse to not_found to avoid
    -- existence-leak on brute-force id enumeration.
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_share.revoked_at IS NULL THEN
    UPDATE route_shares
       SET revoked_at = now()
     WHERE id = p_id;
  END IF;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

GRANT EXECUTE ON FUNCTION revoke_route_share(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_route_share(UUID, UUID) TO service_role;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. record_route_share_view(p_code) RPC
--
-- Bot-filtering happens in the API (user-agent regex). This RPC only
-- enforces:
--   - Unknown code → raises SHARE_NOT_FOUND
--   - Revoked     → raises SHARE_REVOKED
--   - Expired     → raises SHARE_EXPIRED
--   - Active      → atomically bumps view_count via UPDATE ... RETURNING.
--     `firstView` is exactly when the post-update count equals 1. Under
--     concurrent beacons, Postgres serializes the UPDATE via the row lock,
--     so at most one caller can observe view_count=1 for a given share —
--     which guarantees exactly-once first-view push dispatch without a
--     separate lock.
--
-- Returns JSONB { bumped, firstView, shortCode, sharerUserId, shareId }.
-- The API uses sharerUserId to target the first-view push without needing
-- a separate lookup.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_route_share_view(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row  route_shares%ROWTYPE;
BEGIN
  UPDATE route_shares
     SET view_count = view_count + 1
   WHERE short_code = p_code
     AND revoked_at IS NULL
     AND expires_at > now()
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM route_shares WHERE short_code = p_code;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SHARE_NOT_FOUND' USING ERRCODE = 'P0002';
    ELSIF v_row.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'SHARE_REVOKED' USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'SHARE_EXPIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'bumped',       TRUE,
    'firstView',    v_row.view_count = 1,
    'shortCode',    v_row.short_code,
    'sharerUserId', v_row.user_id,
    'shareId',      v_row.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION record_route_share_view(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION record_route_share_view(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION record_route_share_view(TEXT) TO service_role;


-- ───────────────────────────────────────────────────────────────────────────
-- 5. Replace claim_route_share — slice 4 body + activity_feed fork on
--    sharer opt-in. All other side effects are identical to slice 4.
--
-- Delta vs slice 4:
--   After signup_count bump (and before XP/badge blocks), SELECT the
--   sharer's share_conversion_feed_optin and — when TRUE — insert an
--   activity_feed row of type 'route_share_signup' owned by the sharer
--   with payload {sharerUserId, inviteeUserId, shareId,
--   routePreviewPolylineTrimmed}. The feed row is mounted on the sharer
--   (user_id=sharer) so followers of the sharer see it in their feed —
--   consistent with how ride/tier_up/badge_unlock entries are owned.
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
  -- Slice 8 additions
  v_sharer_feed_optin         BOOLEAN := TRUE;
  v_trimmed_polyline          TEXT;
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

    INSERT INTO saved_routes (
      user_id, name, origin, destination, waypoints,
      mode, avoid_unpaved, avoid_hills
    )
    VALUES (
      p_invitee_id,
      v_saved_route_name,
      v_share.payload->'origin',
      v_share.payload->'destination',
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

  v_route := (v_share.payload - 'trimmedGeometryPolyline6')
           || jsonb_build_object('geometryPolyline6', v_polyline)
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

GRANT EXECUTE ON FUNCTION claim_route_share(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_route_share(TEXT, UUID) TO service_role;


COMMENT ON FUNCTION revoke_route_share(UUID, UUID) IS
  'Owner-enforced revoke for route_shares. Non-owner/unknown-id collapse to '
  'not_found (anti-enumeration). Idempotent on already-revoked.';

COMMENT ON FUNCTION record_route_share_view(TEXT) IS
  'View-beacon RPC fired by the web viewer. Atomic UPDATE ... RETURNING '
  'guarantees exactly one caller observes firstView=true under concurrent '
  'beacons — used by the API to dispatch the first-view push.';
