-- User trip stats aggregate (for CO2 savings feature)
CREATE OR REPLACE FUNCTION get_user_trip_stats(requesting_user_id UUID)
RETURNS TABLE(
  total_trips BIGINT,
  total_distance_meters DOUBLE PRECISION,
  total_duration_seconds DOUBLE PRECISION
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COUNT(*),
    COALESCE(SUM(planned_route_distance_meters), 0),
    COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at::timestamp - started_at::timestamp))), 0)
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason = 'completed';
$$;
