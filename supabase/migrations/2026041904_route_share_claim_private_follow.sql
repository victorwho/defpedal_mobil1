-- ═══════════════════════════════════════════════════════════════════════════
-- Route-Share Slice 4 — Private-Profile Pending Follow
--
-- Builds on slice 3's `claim_route_share` RPC. Only the follow-insert step
-- changes: when the sharer's profile is private, the follow relationship is
-- created as `pending` instead of `accepted`. All other side effects
-- (saved_routes, signup_count, XP, badges, Mia milestone) are unchanged —
-- the PRD explicitly says route access is NOT gated on follow approval.
--
-- Also adds a `source` column on `user_follows` so the Follow Requests UI
-- can render contextual copy ("<name> signed up via your shared route and
-- wants to follow you") without introducing a cross-table join at read time.
--
-- Return-payload change: `rewards.followPending` boolean added, driven by
-- the branch taken.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add `source` column to user_follows.
--
-- Nullable + no default so existing rows stay untagged (NULL = follow created
-- via the standard follow-user flow). Slice 4 sets 'route_share_claim' when
-- the follow row is inserted inside claim_route_share.
ALTER TABLE user_follows
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT NULL;

-- Optional CHECK so future sources are explicit and typos get caught early.
-- Null is allowed for pre-slice-4 rows and for the standard follow flow.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_follows_source_check'
  ) THEN
    ALTER TABLE user_follows
      ADD CONSTRAINT user_follows_source_check
      CHECK (source IS NULL OR source IN ('route_share_claim'));
  END IF;
END $$;

-- 2. Replace claim_route_share RPC (slice 3 + slice 4 changes inlined).
--
-- Delta vs slice 3:
--   * SELECT sharer's is_private flag before the user_follows insert
--   * INSERT user_follows (..., status, source) using CASE on is_private:
--       - true  → status='pending', source='route_share_claim'
--       - false → status='accepted', source='route_share_claim'
--   * v_follow_pending local tracks the branch; surfaced in the rewards JSON
--
-- Everything else is identical to the slice-3 body so reviewers can diff
-- cleanly. The single additional SELECT is cheap — sharer id is already
-- known, the row is already hot from step (3.1) in most cases.

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
  -- Slice 4 additions
  v_sharer_is_private         BOOLEAN := FALSE;
  v_follow_pending            BOOLEAN := FALSE;
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
    SELECT COALESCE(p.username, p.display_name, 'Rider'),
           COALESCE(p.is_private, FALSE)
      INTO v_display, v_sharer_is_private
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

    -- Slice 4: follow status branches on sharer.is_private. `source` tag lets
    -- the Follow Requests UI render share-attributed context without a join.
    -- Pre-existing follow rows are respected via ON CONFLICT DO NOTHING — if
    -- the invitee already followed the sharer (manually or from an earlier
    -- claim), the status is not downgraded.
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

    -- 3.4 Invitee +50 XP (slice 3, unchanged)
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

    -- 3.5 Inviter +100 XP (slice 3, unchanged)
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

    -- 3.6 Ambassador badges (slice 3, unchanged)
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

    -- 3.7 Mia milestone (slice 3, unchanged)
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

  -- Route payload assembly (slice 1/2, unchanged)
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
