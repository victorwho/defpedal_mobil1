-- City Heartbeat: "Rides started" alongside "Shared rides" (2026-09-14)
--
-- Why: every number on the heartbeat is computed from `trip_shares`, which is
-- only the rides a rider chose to share. Measured 2026-09-14: 480 shares
-- against 1,419 trips actually started — so the screen showed roughly a third
-- of real activity and read as a dead community.
--
-- This adds a SECOND, separately-labeled count sourced from `trips` (a row is
-- written at trip_start), covering every started ride INCLUDING short trial
-- starts that were later discarded. It is deliberately a COUNT ONLY:
--   * `trips` carries no distance for rides whose track never uploaded, so
--     km / CO2 / communitySeconds stay on the shared-rides basis. Deriving
--     distance here would mean inventing it for the ~880 trips with no track.
--   * It is NOT merged into `pulse.rides`. Two different populations under one
--     label is how a number stops being defensible; the client renders them as
--     two labeled stats ("Shared rides" / "Rides started").
--
-- Windows and radii mirror the pulse arguments exactly, so the honest
-- (window, scope) label the ladder resolved applies to both numbers. Trips
-- with a NULL start_location (6 of 1,419) are counted at community scope only
-- — they cannot be placed, and dropping them everywhere would undercount the
-- community rung for no gain.
--
-- NOTE: this keeps the invariant stated in 202607190001 — every number
-- rendered is computed from real rows. Nothing here is estimated, scaled or
-- extrapolated.

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

  -- Window -> first day included in the pulse. Unknown values degrade to today.
  v_pulse_since := case p_pulse_window
    when 'month' then v_today - 29
    when 'week'  then v_today - 6
    else v_today
  end;

  select jsonb_build_object(
    -- Literal today @ nearby radius (legacy shape — old clients label it "Today")
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

    -- Ladder-resolved pulse: window chosen by the API (today/week/month),
    -- radius NULL = community-wide.
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

    -- NEW: rides actually STARTED at the same (window, scope) rung, from the
    -- `trips` lifecycle table. Includes trial starts later discarded — that is
    -- the point: it is the widest honest count of "a rider set off", where
    -- `pulse.rides` is the narrower "and chose to share it". Count only; see
    -- the header note on distance.
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

    -- NEW: all-time rides started within the nearby radius, to sit beside the
    -- legacy `totals` card (which is shared-rides, nearby, all-time).
    'totalsRidesStarted', (
      select jsonb_build_object(
        'rides',        coalesce(count(*)::int, 0),
        'activeRiders', coalesce(count(distinct t.user_id)::int, 0)
      )
      from trips t
      where t.start_location is not null
        and ST_DWithin(t.start_location, v_point, radius_meters)
    ),

    -- NEW: lifetime community-wide rides started (no radius filter), to sit
    -- beside `communityTotals`. NULL-location trips are included here.
    'communityRidesStarted', (
      select jsonb_build_object(
        'rides',        coalesce(count(*)::int, 0),
        'activeRiders', coalesce(count(distinct t.user_id)::int, 0)
      )
      from trips t
    ),

    -- Daily activity for chart (legacy: nearby radius)
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

    -- Daily activity at the ladder-resolved scope (last p_days days)
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

    -- Weekly buckets (4 x 7 days ending today) at the ladder-resolved scope.
    -- Empty buckets are emitted as zeros so the client renders 4 bars.
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

    -- Cumulative totals within the nearby radius (legacy shape, unchanged)
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

    -- Lifetime community-wide totals (NO spatial filter — labeled as such in
    -- the UI; these only ever go up)
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

    -- Hazard hotspots (top 5 types in last 7 days) — DELIBERATELY stays at the
    -- nearby radius; the UI hides the section when empty instead of widening
    -- (distant hazards are noise, not warmth).
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

    -- Top 5 contributors at the ladder-resolved scope (radius NULL = all).
    -- The blank-display_name guard is new (2026-09-14): a nameless profile was
    -- rendering as an empty leaderboard row.
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

-- `trips.started_at` + `start_location` are now read on every heartbeat load.
-- Without these the new blocks sequential-scan the table; cheap insurance, and
-- the partial index keeps the spatial one small.
create index if not exists trips_started_at_idx
  on public.trips (started_at);

create index if not exists trips_start_location_gix
  on public.trips using gist (start_location)
  where start_location is not null;
