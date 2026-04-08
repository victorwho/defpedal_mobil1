-- City Heartbeat RPC: community pulse dashboard with daily activity, hazard
-- hotspots, and top contributors within a geographic radius.
-- Uses the same PostGIS spatial pattern as get_community_stats / get_nearby_feed.

create or replace function get_city_heartbeat(
  user_lat double precision,
  user_lon double precision,
  radius_meters double precision default 15000,
  p_days integer default 7
)
returns jsonb
language plpgsql stable
as $$
declare
  v_point geography;
  v_today date;
  v_since date;
  v_result jsonb;
begin
  v_point := ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography;
  v_today := current_date;
  v_since := v_today - (p_days - 1);

  select jsonb_build_object(
    -- Today's pulse
    'today', (
      select jsonb_build_object(
        'rides',          coalesce(count(*)::int, 0),
        'distanceMeters', coalesce(sum(ts.distance_meters::double precision), 0),
        'co2SavedKg',     round((coalesce(sum(ts.distance_meters::double precision), 0) / 1000.0 * 0.12)::numeric, 2),
        'communitySeconds', round((coalesce(sum(ts.distance_meters::double precision), 0) / 1000.0 * 4.5)::numeric),
        'activeRiders',   coalesce(count(distinct ts.user_id)::int, 0)
      )
      from trip_shares ts
      where ST_DWithin(ts.start_coordinate, v_point, radius_meters)
        and ts.shared_at::date = v_today
    ),

    -- Daily activity for chart
    'daily', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'day',              d.day,
          'rides',            d.rides,
          'distanceMeters',   d.distance_meters,
          'co2SavedKg',       round((d.distance_meters / 1000.0 * 0.12)::numeric, 2),
          'communitySeconds', round((d.distance_meters / 1000.0 * 4.5)::numeric)
        ) order by d.day
      ), '[]'::jsonb)
      from (
        select
          ts.shared_at::date as day,
          count(*)::int as rides,
          coalesce(sum(ts.distance_meters::double precision), 0) as distance_meters
        from trip_shares ts
        where ST_DWithin(ts.start_coordinate, v_point, radius_meters)
          and ts.shared_at::date >= v_since
          and ts.shared_at::date <= v_today
        group by ts.shared_at::date
      ) d
    ),

    -- Cumulative totals
    'totals', (
      select jsonb_build_object(
        'rides',            coalesce(count(*)::int, 0),
        'distanceMeters',   coalesce(sum(ts.distance_meters::double precision), 0),
        'durationSeconds',  coalesce(sum(ts.duration_seconds::double precision), 0),
        'co2SavedKg',       round((coalesce(sum(ts.distance_meters::double precision), 0) / 1000.0 * 0.12)::numeric, 2),
        'communitySeconds', round((coalesce(sum(ts.distance_meters::double precision), 0) / 1000.0 * 4.5)::numeric),
        'uniqueRiders',     coalesce(count(distinct ts.user_id)::int, 0)
      )
      from trip_shares ts
      where ST_DWithin(ts.start_coordinate, v_point, radius_meters)
    ),

    -- Hazard hotspots (top 5 types in last 7 days)
    'hazardHotspots', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'hazardType', h.hazard_type,
          'count',      h.cnt,
          'lat',        h.avg_lat,
          'lon',        h.avg_lon
        ) order by h.cnt desc
      ), '[]'::jsonb)
      from (
        select
          hz.hazard_type,
          count(*)::int as cnt,
          round(avg((hz.location->>'lat')::double precision)::numeric, 5) as avg_lat,
          round(avg((hz.location->>'lon')::double precision)::numeric, 5) as avg_lon
        from hazards hz
        where hz.hazard_type is not null
          and hz.created_at >= (now() - interval '7 days')
          and ST_DWithin(
            ST_SetSRID(ST_MakePoint(
              (hz.location->>'lon')::double precision,
              (hz.location->>'lat')::double precision
            ), 4326)::geography,
            v_point,
            radius_meters
          )
        group by hz.hazard_type
        order by cnt desc
        limit 5
      ) h
    ),

    -- Top 5 contributors (only users who share publicly)
    'topContributors', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'displayName', c.display_name,
          'avatarUrl',   c.avatar_url,
          'rideCount',   c.ride_count,
          'distanceKm',  round((c.total_distance_m / 1000.0)::numeric, 1)
        ) order by c.ride_count desc
      ), '[]'::jsonb)
      from (
        select
          p.display_name,
          p.avatar_url,
          count(*)::int as ride_count,
          coalesce(sum(ts.distance_meters::double precision), 0) as total_distance_m
        from trip_shares ts
        join profiles p on p.id = ts.user_id
        where ST_DWithin(ts.start_coordinate, v_point, radius_meters)
          and p.auto_share_rides = true
        group by p.id, p.display_name, p.avatar_url
        order by ride_count desc
        limit 5
      ) c
    )
  ) into v_result;

  return v_result;
end;
$$;
