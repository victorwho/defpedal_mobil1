-- P2 . The route-share RPCs failed OPEN on their privacy fallbacks.
--
-- Both `get_public_route_share` and `claim_route_share` resolved every
-- privacy-trimmed value as `COALESCE(trimmed, raw)`. So for a share whose owner
-- had asked for hidden endpoints, a missing trimmed variant did not fail: it
-- quietly served the FULL route and the REAL origin, which for most rides is
-- the rider's home. The DIRECTION of that fallback is the whole defect -- the
-- safe answer to "I cannot serve this privately" is not "serve it anyway".
--
-- Unreachable today, and verified rather than assumed: of 47 route_shares rows,
-- 27 have hide_endpoints = true, and ALL 27 carry trimmedGeometryPolyline6,
-- trimmedOrigin and trimmedDestination. Trimming runs unconditionally at create
-- time, and the legacy rows that predate it expired on 2026-07-12. So this
-- closes a latent leak; it does not repair an active one.
--
-- claim_route_share is the sharper of the two even so, because it writes copies
-- into saved_routes and activity_feed that OUTLIVE the 30-day share expiry. A
-- fallback there is permanent, not transient -- and one field it wrote is named
-- `routePreviewPolylineTrimmed`, which could hold the untrimmed polyline while
-- asserting otherwise.
--
-- The three fallbacks in claim_route_share are also collapsed into ONE
-- resolution at the top, so the claim and the feed card can no longer disagree
-- about what "trimmed" meant.
--
-- Bodies below are the LIVE definitions with only these branches changed.

CREATE OR REPLACE FUNCTION public.get_public_route_share(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row        route_shares%ROWTYPE;
  v_route      JSONB;
  v_polyline   TEXT;
  v_full_len   NUMERIC;
  v_display    TEXT;
  v_avatar     TEXT;
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
      RAISE EXCEPTION 'SHARE_REVOKED'   USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'SHARE_EXPIRED'   USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_row.hide_endpoints THEN
    -- Fail CLOSED. This was COALESCE(trimmed, raw): a share whose owner asked
    -- for hidden endpoints, but whose trimmed variant was missing for any
    -- reason, published the FULL route instead -- silently, and publicly.
    -- A share we cannot serve privately is a share we do not serve.
    v_polyline := v_row.payload->>'trimmedGeometryPolyline6';
    IF v_polyline IS NULL THEN
      RAISE EXCEPTION 'SHARE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_polyline := v_row.payload->>'geometryPolyline6';
  END IF;

  -- P0-2 fix: strip trimmed-variant keys; when hide_endpoints, overwrite
  -- origin/destination with the privacy-trimmed endpoints.
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
    -- Same inversion as the geometry above. The raw origin is where the rider
    -- actually set off from, which is very often their home.
    IF NULLIF(v_row.payload->'trimmedOrigin', 'null'::jsonb) IS NULL
       OR NULLIF(v_row.payload->'trimmedDestination', 'null'::jsonb) IS NULL THEN
      RAISE EXCEPTION 'SHARE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    v_route := v_route || jsonb_build_object(
      'origin',      v_row.payload->'trimmedOrigin',
      'destination', v_row.payload->'trimmedDestination'
    );
  END IF;

  v_full_len := COALESCE((v_row.payload->>'distanceMeters')::NUMERIC, 0);

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
$function$;

CREATE OR REPLACE FUNCTION public.claim_route_share(p_code text, p_invitee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Every privacy-trimmed variant is resolved ONCE, here, and validated
  -- together. This used to be three separate COALESCE(trimmed, raw) fallbacks
  -- in three places in this function, each able to substitute the rider's real
  -- route or real start point on its own. Resolving once also means the feed
  -- card below cannot disagree with the claim about what "trimmed" meant.
  IF v_share.hide_endpoints THEN
    v_safe_origin      := NULLIF(v_share.payload->'trimmedOrigin', 'null'::jsonb);
    v_safe_destination := NULLIF(v_share.payload->'trimmedDestination', 'null'::jsonb);
    v_trimmed_polyline := v_share.payload->>'trimmedGeometryPolyline6';

    -- Fail CLOSED, and fail HERE rather than part-way through: this function
    -- writes copies into saved_routes and activity_feed that OUTLIVE the
    -- 30-day share expiry, so falling back to raw data is not a transient leak,
    -- it is a permanent one.
    IF v_safe_origin IS NULL
       OR v_safe_destination IS NULL
       OR v_trimmed_polyline IS NULL THEN
      RAISE EXCEPTION 'SHARE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_safe_origin      := v_share.payload->'origin';
    v_safe_destination := v_share.payload->'destination';
    v_trimmed_polyline := v_share.payload->>'geometryPolyline6';
  END IF;

  INSERT INTO route_share_claims (share_id, invitee_user_id)
  VALUES (v_share.id, p_invitee_id)
  ON CONFLICT (share_id, invitee_user_id) DO NOTHING
  RETURNING id INTO v_inserted_claim_id;

  v_already_claimed := (v_inserted_claim_id IS NULL);

  IF NOT v_already_claimed THEN
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
      mode, avoid_unpaved, avoid_hills, avoid_heat, is_ebike
    )
    VALUES (
      p_invitee_id,
      v_saved_route_name,
      v_safe_origin,
      v_safe_destination,
      '[]'::jsonb,
      CASE WHEN v_share.payload->>'routingMode' = 'fast' THEN 'fast' ELSE 'safe' END,
      false,
      (v_share.payload->>'routingMode') = 'flat',
      (v_share.payload->>'routingMode') = 'cool',
      (v_share.payload->>'routingMode') = 'ebike'
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

    IF v_sharer_feed_optin THEN
      -- v_trimmed_polyline was resolved and validated above. The field this
      -- writes is called `routePreviewPolylineTrimmed`, and before this it
      -- could hold the UNTRIMMED polyline while carrying that name.
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

  IF v_share.hide_endpoints THEN
    v_polyline := v_trimmed_polyline;  -- validated non-NULL above
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
$function$;
