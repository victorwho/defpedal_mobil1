-- ═══════════════════════════════════════════════════════════════════════════
-- Route-Share Slice 3 — Ambassador Rewards + Claim-Time XP + Mia Milestone
--
-- Builds on slice 2's claim pipeline (2026041802_route_share_claims.sql) to
-- turn a claim into a rewarded event:
--
-- 1. Seed 3 Ambassador badges (bronze @ 1 conversion, silver @ 5, gold @ 25)
-- 2. Add `mia_non_cyclists_converted` counter on profiles
-- 3. Extend `claim_route_share` RPC to atomically:
--    a. Award +50 XP to the invitee (first claim ever for that user)
--    b. Award +100 XP to the inviter (capped 5/calendar month)
--    c. Evaluate Ambassador badge tier crossings for the inviter
--    d. Advance the Mia "Convince a non-cyclist" counter when the inviter
--       is on an active Mia journey
--    e. Return the reward deltas so the API can dispatch push notifications
--       and the mobile app can surface XP toast / badge unlock overlay
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Seed Ambassador badges into badge_definitions
-- ───────────────────────────────────────────────────────────────────────────
--
-- Category: 'social' (community-facing achievements), display_tab: 'social'.
-- tier_family='ambassador' lets the Trophy Case group bronze/silver/gold as a
-- single progression chip. sort_order in the 400s sits after the existing
-- social milestones (first_share=103, etc).

INSERT INTO badge_definitions
  (badge_key, category, display_tab, name, flavor_text, criteria_text,
   criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key)
VALUES
  ('ambassador_bronze', 'social', 'social', 'Ambassador',
   'Your first convert. The ripple begins.',
   'Invite 1 rider via a shared route',  'rider', 1, 'ambassador',
   false, false, 401, 'ambassador_bronze'),
  ('ambassador_silver', 'social', 'social', 'Ambassador',
   'Five riders safer because of you.',
   'Invite 5 riders via shared routes',  'riders', 2, 'ambassador',
   false, false, 402, 'ambassador_silver'),
  ('ambassador_gold',   'social', 'social', 'Ambassador',
   'You built a small peloton.',
   'Invite 25 riders via shared routes', 'riders', 3, 'ambassador',
   false, false, 403, 'ambassador_gold')
ON CONFLICT (badge_key) DO UPDATE
  SET flavor_text   = EXCLUDED.flavor_text,
      criteria_text = EXCLUDED.criteria_text,
      tier_family   = EXCLUDED.tier_family,
      sort_order    = EXCLUDED.sort_order;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Mia "Convince a non-cyclist" counter
-- ───────────────────────────────────────────────────────────────────────────
--
-- Adds a lightweight counter on profiles (co-located with existing
-- `mia_total_rides` / `mia_rides_with_destination` counters from
-- 202604150001_mia_persona_foundation.sql). The level-up RPC at
-- 202604150003 is unchanged — this milestone is surfaced on the Mia Journey
-- Tracker card as an auxiliary stat, not a level-up gate.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS mia_non_cyclists_converted INT NOT NULL DEFAULT 0;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Extend claim_route_share RPC
-- ───────────────────────────────────────────────────────────────────────────
--
-- Replaces the slice-2 function in full. Behavior delta vs slice 2:
--
--   * On the first-time-claim branch (v_already_claimed = false), append four
--     new side effects after the existing saved_routes / follow / signup_count
--     writes, all inside the same SECURITY DEFINER transaction so partial
--     failures roll back cleanly:
--
--     4a. INSERT xp_events (invitee, 'referral_welcome', 50) — guarded by a
--         "this invitee already got their welcome bonus" lookup so repeated
--         claims against different share codes can't stack the +50.
--         Updates profiles.total_xp + rider_tier inline (same math as
--         award_xp). We can't reuse award_xp directly because its SECURITY
--         DEFINER body rejects caller≠target when auth.uid() is set; this
--         RPC runs as the invitee so awarding the *inviter* would trip that
--         guard.
--
--     4b. INSERT xp_events (inviter, 'referral', 100) — guarded by a monthly
--         cap (< 5 entries in the current calendar month). If the cap is
--         reached, skip silently and set v_inviter_xp := NULL so the API
--         layer knows to omit the "+100 XP" line from the push notification.
--         Same inline tier-promotion logic as 4a.
--
--     4c. Ambassador badge evaluation — COUNT distinct invitee_user_id across
--         all of the inviter's shares and award bronze/silver/gold if the
--         threshold is newly crossed. Uses ON CONFLICT DO NOTHING on
--         user_badges so re-claims or out-of-order claims never double-award.
--         Returns the list of newly-earned badge definitions so the API can
--         embed them in the push notification payload and the mobile
--         BadgeUnlockOverlay has something to celebrate on the sharer's next
--         Trophy Case visit.
--
--     4d. Mia milestone — if the inviter has persona='mia' and
--         mia_journey_status='active', bump mia_non_cyclists_converted.
--         Returns v_mia_milestone_advanced=true so the API can surface this
--         on the Mia Journey Tracker or in a dedicated Mia notification
--         template (slice 3 scope: counter only; promotion rule tweak
--         stays a later Mia slice).
--
--   * Extend the RETURN JSONB with a `rewards` sub-object:
--       inviteeXpAwarded    — 50 | null
--       inviteeNewBadges    — [] (reserved; slice 3 doesn't award invitee badges)
--       inviterXpAwarded    — 100 | null
--       inviterNewBadges    — [{ badge_key, name, flavor_text, icon_key, tier }]
--       inviterUserId       — uuid (the API needs this to dispatch push)
--       miaMilestoneAdvanced — boolean
--
--     The API strips inviter* fields before forwarding to the mobile client
--     (invitee-facing surface). The mobile contract in packages/core exposes
--     only invitee-relevant fields.
--
--   * On the already_claimed branch, all reward fields are null/empty/false —
--     replay protection.
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

  -- Slice 3 additions
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

  -- Ambassador thresholds — keep in lockstep with badge_definitions seed above
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
    -- 3.1 saved_routes (slice 2, unchanged) -------------------------------
    SELECT COALESCE(p.username, p.display_name, 'Rider')
      INTO v_display
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

    -- 3.2 follow (slice 2, unchanged) ------------------------------------
    INSERT INTO user_follows (follower_id, following_id, status)
    VALUES (p_invitee_id, v_share.user_id, 'accepted')
    ON CONFLICT (follower_id, following_id) DO NOTHING;

    -- 3.3 signup_count (slice 2, unchanged) ------------------------------
    UPDATE route_shares
       SET signup_count = signup_count + 1
     WHERE id = v_share.id;

    -- ─────────────────────────────────────────────────────────────────
    -- 3.4 Invitee +50 XP (slice 3)
    --
    -- Only award once per invitee lifetime — the 'referral_welcome' action
    -- label in xp_events is the uniqueness source of truth.
    -- ─────────────────────────────────────────────────────────────────
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

    -- ─────────────────────────────────────────────────────────────────
    -- 3.5 Inviter +100 XP (slice 3), capped 5/calendar month
    -- ─────────────────────────────────────────────────────────────────
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

    -- ─────────────────────────────────────────────────────────────────
    -- 3.6 Ambassador badge evaluation for the inviter
    --
    -- Count distinct invitees across all of the inviter's shares. Because
    -- this claim row was just inserted, the fresh count already reflects
    -- it. Award whichever tier the count >= threshold, and newly.
    -- ─────────────────────────────────────────────────────────────────
    SELECT COUNT(DISTINCT rsc.invitee_user_id)
      INTO v_inviter_total_conversions
      FROM route_share_claims rsc
      JOIN route_shares rs ON rs.id = rsc.share_id
     WHERE rs.user_id = v_share.user_id;

    -- Each tier check inserts ON CONFLICT DO NOTHING; if the badge already
    -- exists the insert silently no-ops and v_tier_row stays NULL.
    IF v_inviter_total_conversions >= AMBASSADOR_BRONZE_AT THEN
      WITH ins AS (
        INSERT INTO user_badges (user_id, badge_key)
        VALUES (v_share.user_id, 'ambassador_bronze')
        ON CONFLICT (user_id, badge_key) DO NOTHING
        RETURNING badge_key
      )
      SELECT bd.badge_key, bd.name, bd.flavor_text, bd.icon_key, bd.tier
        INTO v_tier_row
        FROM ins
        JOIN badge_definitions bd USING (badge_key);

      IF v_tier_row.badge_key IS NOT NULL THEN
        v_inviter_new_badges := v_inviter_new_badges || jsonb_build_object(
          'badgeKey',    v_tier_row.badge_key,
          'name',        v_tier_row.name,
          'flavorText',  v_tier_row.flavor_text,
          'iconKey',     v_tier_row.icon_key,
          'tier',        v_tier_row.tier
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
        FROM ins
        JOIN badge_definitions bd USING (badge_key);

      IF v_tier_row.badge_key IS NOT NULL THEN
        v_inviter_new_badges := v_inviter_new_badges || jsonb_build_object(
          'badgeKey',    v_tier_row.badge_key,
          'name',        v_tier_row.name,
          'flavorText',  v_tier_row.flavor_text,
          'iconKey',     v_tier_row.icon_key,
          'tier',        v_tier_row.tier
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
        FROM ins
        JOIN badge_definitions bd USING (badge_key);

      IF v_tier_row.badge_key IS NOT NULL THEN
        v_inviter_new_badges := v_inviter_new_badges || jsonb_build_object(
          'badgeKey',    v_tier_row.badge_key,
          'name',        v_tier_row.name,
          'flavorText',  v_tier_row.flavor_text,
          'iconKey',     v_tier_row.icon_key,
          'tier',        v_tier_row.tier
        );
      END IF;
    END IF;

    -- ─────────────────────────────────────────────────────────────────
    -- 3.7 Mia milestone advance
    -- ─────────────────────────────────────────────────────────────────
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

  -- ─────────────────────────────────────────────────────────────────────
  -- Route payload assembly (slice 1/2, unchanged)
  -- ─────────────────────────────────────────────────────────────────────
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
      'miaMilestoneAdvanced', v_mia_milestone_advanced
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION claim_route_share(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_route_share(TEXT, UUID) TO service_role;
