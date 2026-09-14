-- City Heartbeat: riders-at-scope for the pulse orb (2026-09-14)
--
-- The orb is the one number read at a glance and it showed the pulse RIDE count
-- — which, at the ladder's old threshold of 3, could be a literal 3 while the
-- card beneath it said 232. It now shows how many riders the community actually
-- has at whatever scope the ladder resolved: a larger number, and a more stable
-- one (it does not move with the weather).
--
-- Replaces get_city_heartbeat from 202609140002; every other block is byte
-- identical to that migration.

create or replace function get_city_heartbeat(
  user_lat double precision,
  user_lon double precision,
  radius_meters double precision default 15000,
  p_days integer default 7,
  p_pulse_window text default 'today',
  p_pulse_radius_meters double precision default 15000
)
returns jsonb
language plpgsql stable
as $fn$
declare
  v_point geography;
  v_today date;
  v_since date;
  v_pulse_since date;
  v_result jsonb;
begin
  v_point := ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography;
  v_today := current_date;
  v_since := v_today - (p_days - 1);

  v_pulse_since := case p_pulse_window
    when 'month' then v_today - 29
    when 'week'  then v_today - 6
    else v_today
  end;

  select jsonb_build_object(
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
        and ts.is_hidden = false
        and ts.shared_at::date = v_today
    ),

    'pulse', (
      select jsonb_build_object(
        'rides',          coalesce(count(*)::int, 0),
        'distanceMeters', coalesce(sum(ts.distance_meters::double precision), 0),
        'co2SavedKg',     round((coalesce(sum(ts.distance_meters::double precision), 0) / 1000.0 * 0.12)::numeric, 2),
        'communitySeconds', round((coalesce(sum(ts.distance_meters::double precision), 0) / 1000.0 * 4.5)::numeric),
        'activeRiders',   coalesce(count(distinct ts.user_id)::int, 0)
      )
      from trip_shares ts
      where (p_pulse_radius_meters is null or ST_DWithin(ts.start_coordinate, v_point, p_pulse_radius_meters))
        and ts.is_hidden = false
        and ts.shared_at::date >= v_pulse_since
        and ts.shared_at::date <= v_today
    ),

    'ridesStarted', (
      select jsonb_build_object(
        'rides',        coalesce(count(*)::int, 0),
        'activeRiders', coalesce(count(distinct t.user_id)::int, 0)
      )
      from trips t
      where (
              p_pulse_radius_meters is null
              or (t.start_location is not null
                  and ST_DWithin(t.start_location, v_point, p_pulse_radius_meters))
            )
        and t.started_at::date >= v_pulse_since
        and t.started_at::date <= v_today
    ),

    'totalsRidesStarted', (
      select jsonb_build_object(
        'rides',        coalesce(count(*)::int, 0),
        'activeRiders', coalesce(count(distinct t.user_id)::int, 0)
      )
      from trips t
      where t.start_location is not null
        and ST_DWithin(t.start_location, v_point, radius_meters)
    ),

    'communityRidesStarted', (
      select jsonb_build_object(
        'rides',        coalesce(count(*)::int, 0),
        'activeRiders', coalesce(count(distinct t.user_id)::int, 0)
      )
      from trips t
    ),

    -- NEW: routes PLANNED at the resolved rung. Recording began 2026-09-14, so
    -- any window reaching further back than that is not comparable with the
    -- ride counts beside it — the client hides the cell until the count is
    -- non-zero rather than showing a structural 0 as if nobody planned.
    'routesPlanned', (
      select jsonb_build_object(
        'routes',  coalesce(count(*)::int, 0),
        'planners', coalesce(count(distinct pr.user_id)::int, 0)
      )
      from planned_routes pr
      where (p_pulse_radius_meters is null
             or ST_DWithin(pr.start_location, v_point, p_pulse_radius_meters))
        and pr.created_at::date >= v_pulse_since
        and pr.created_at::date <= v_today
    ),

    'totalsRoutesPlanned', (
      select jsonb_build_object(
        'routes',   coalesce(count(*)::int, 0),
        'planners', coalesce(count(distinct pr.user_id)::int, 0)
      )
      from planned_routes pr
      where ST_DWithin(pr.start_location, v_point, radius_meters)
    ),

    'communityRoutesPlanned', (
      select jsonb_build_object(
        'routes',   coalesce(count(*)::int, 0),
        'planners', coalesce(count(distinct pr.user_id)::int, 0)
      )
      from planned_routes pr
    ),

    -- NEW: distinct riders at the RESOLVED scope, all-time. `p_pulse_radius_meters`
    -- already carries whatever radius the ladder settled on, so this number and
    -- the header title above it can never describe different areas — the failure
    -- mode of pinning it to the nearby radius would be a city name sitting over a
    -- community-wide count. All-time and unwindowed on purpose: it answers "how
    -- big is this community", which should not shrink because last week was wet.
    'scopeRiders', (
      select jsonb_build_object(
        'riders', coalesce(count(distinct t.user_id)::int, 0)
      )
      from trips t
      where (
              p_pulse_radius_meters is null
              or (t.start_location is not null
                  and ST_DWithin(t.start_location, v_point, p_pulse_radius_meters))
            )
    ),

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
          and ts.is_hidden = false
          and ts.shared_at::date >= v_since
          and ts.shared_at::date <= v_today
        group by ts.shared_at::date
      ) d
    ),

    'chartDaily', (
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
        where (p_pulse_radius_meters is null or ST_DWithin(ts.start_coordinate, v_point, p_pulse_radius_meters))
          and ts.is_hidden = false
          and ts.shared_at::date >= v_since
          and ts.shared_at::date <= v_today
        group by ts.shared_at::date
      ) d
    ),

    'chartWeekly', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'weekStart',        w.week_start,
          'rides',            coalesce(b.rides, 0),
          'distanceMeters',   coalesce(b.distance_meters, 0),
          'co2SavedKg',       round((coalesce(b.distance_meters, 0) / 1000.0 * 0.12)::numeric, 2),
          'communitySeconds', round((coalesce(b.distance_meters, 0) / 1000.0 * 4.5)::numeric)
        ) order by w.week_start
      ), '[]'::jsonb)
      from (
        select g.idx, (v_today - (g.idx * 7 + 6))::date as week_start
        from generate_series(0, 3) as g(idx)
      ) w
      left join (
        select
          ((v_today - ts.shared_at::date) / 7)::int as idx,
          count(*)::int as rides,
          coalesce(sum(ts.distance_meters::double precision), 0) as distance_meters
        from trip_shares ts
        where (p_pulse_radius_meters is null or ST_DWithin(ts.start_coordinate, v_point, p_pulse_radius_meters))
          and ts.is_hidden = false
          and ts.shared_at::date > v_today - 28
          and ts.shared_at::date <= v_today
        group by 1
      ) b on b.idx = w.idx
    ),

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
        and ts.is_hidden = false
    ),

    'communityTotals', (
      select jsonb_build_object(
        'rides',            coalesce(count(*)::int, 0),
        'distanceMeters',   coalesce(sum(ts.distance_meters::double precision), 0),
        'durationSeconds',  coalesce(sum(ts.duration_seconds::double precision), 0),
        'co2SavedKg',       round((coalesce(sum(ts.distance_meters::double precision), 0) / 1000.0 * 0.12)::numeric, 2),
        'communitySeconds', round((coalesce(sum(ts.distance_meters::double precision), 0) / 1000.0 * 4.5)::numeric),
        'uniqueRiders',     coalesce(count(distinct ts.user_id)::int, 0)
      )
      from trip_shares ts
      where ts.is_hidden = false
    ),

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
          and hz.is_hidden = false
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
        where (p_pulse_radius_meters is null or ST_DWithin(ts.start_coordinate, v_point, p_pulse_radius_meters))
          and ts.is_hidden = false
          and p.auto_share_rides = true
          and p.is_anonymous = false
          and coalesce(trim(p.display_name), '') <> ''
        group by p.id, p.display_name, p.avatar_url
        order by ride_count desc
        limit 5
      ) c
    )
  ) into v_result;

  return v_result;
end;
$fn$;
