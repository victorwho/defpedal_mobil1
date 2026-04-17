-- ═══════════════════════════════════════════════════════════════════════════
-- Fix get_user_public_profile RPC
-- 1. Fix jsonb_agg ORDER BY bug (t was not a FROM-clause entry)
-- 2. Use activity_feed instead of archived trip_shares
-- 3. Replace guardian_tier with rider_tier
-- 4. Add followStatus and isPrivate fields
-- 5. Compute CO2 and hazards from actual data
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_user_public_profile(p_user_id UUID, p_requesting_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  result JSONB;
  v_profile RECORD;
  v_trip_count INT;
  v_total_distance NUMERIC;
  v_followers INT;
  v_following INT;
  v_follow_status TEXT;
  v_is_private BOOLEAN;
  v_trips JSONB;
  v_total_co2 NUMERIC;
  v_total_hazards INT;
BEGIN
  SELECT display_name, username, avatar_url, rider_tier, is_private
  INTO v_profile FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  v_is_private := COALESCE(v_profile.is_private, false);

  SELECT COUNT(*)::INT, COALESCE(SUM(actual_distance_meters), 0)::NUMERIC
  INTO v_trip_count, v_total_distance
  FROM trip_tracks WHERE user_id = p_user_id AND end_reason = 'completed';

  v_total_co2 := ROUND((v_total_distance * 0.00012)::numeric, 2);

  SELECT COUNT(*)::INT INTO v_total_hazards FROM hazards WHERE user_id = p_user_id;

  SELECT COUNT(*)::INT INTO v_followers FROM user_follows WHERE following_id = p_user_id AND status = 'accepted';
  SELECT COUNT(*)::INT INTO v_following FROM user_follows WHERE follower_id = p_user_id AND status = 'accepted';

  SELECT COALESCE(uf.status, 'none') INTO v_follow_status
  FROM (SELECT 'none' AS status) d
  LEFT JOIN user_follows uf ON uf.follower_id = p_requesting_user_id AND uf.following_id = p_user_id;

  SELECT COALESCE(jsonb_agg(item ORDER BY item_created DESC), '[]'::jsonb) INTO v_trips
  FROM (
    SELECT
      jsonb_build_object(
        'id', af.id,
        'title', af.payload->>'title',
        'distanceMeters', (af.payload->>'distanceMeters')::numeric,
        'durationSeconds', (af.payload->>'durationSeconds')::numeric,
        'safetyRating', (af.payload->>'safetyRating')::int,
        'sharedAt', af.created_at,
        'geometryPolyline6', af.payload->>'geometryPolyline6'
      ) AS item,
      af.created_at AS item_created
    FROM activity_feed af
    WHERE af.user_id = p_user_id AND af.type = 'ride'
    ORDER BY af.created_at DESC
    LIMIT 20
  ) sub;

  result := jsonb_build_object(
    'id', p_user_id,
    'displayName', COALESCE(v_profile.display_name, 'Rider'),
    'username', v_profile.username,
    'avatarUrl', v_profile.avatar_url,
    'riderTier', COALESCE(v_profile.rider_tier, 'kickstand'),
    'totalTrips', v_trip_count,
    'totalDistanceMeters', v_total_distance,
    'totalCo2SavedKg', v_total_co2,
    'totalHazardsReported', v_total_hazards,
    'followersCount', v_followers,
    'followingCount', v_following,
    'isFollowedByMe', (v_follow_status = 'accepted'),
    'followStatus', v_follow_status,
    'isPrivate', v_is_private,
    'recentTrips', v_trips
  );

  RETURN result;
END;
$function$;
