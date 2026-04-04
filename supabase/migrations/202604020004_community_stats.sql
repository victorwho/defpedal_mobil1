-- Community stats RPC: aggregate trip stats within a geographic radius
-- Same PostGIS pattern as get_nearby_feed (ST_DWithin on trip_shares.start_coordinate)

create or replace function get_community_stats(
  user_lat double precision,
  user_lon double precision,
  radius_meters double precision
)
returns table (
  total_trips bigint,
  total_distance_meters double precision,
  total_duration_seconds double precision,
  unique_riders bigint
)
language sql stable
as $$
  select
    count(*)::bigint as total_trips,
    coalesce(sum(ts.distance_meters::double precision), 0) as total_distance_meters,
    coalesce(sum(ts.duration_seconds::double precision), 0) as total_duration_seconds,
    count(distinct ts.user_id)::bigint as unique_riders
  from trip_shares ts
  where ST_DWithin(
    ts.start_coordinate,
    ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography,
    radius_meters
  );
$$;
