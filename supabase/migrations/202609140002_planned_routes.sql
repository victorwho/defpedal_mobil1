-- Planned-route recording (2026-09-14)
--
-- Why: City Heartbeat could count rides SHARED (`trip_shares`, 480) and rides
-- STARTED (`trips`, 1,419), but nothing recorded a route a rider planned and
-- then did not ride. A `trips` row is only written at trip_start and a route
-- preview writes nothing at all, so "routes planned" was unanswerable — the
-- widest signal of intent the app produces was going entirely unrecorded.
--
-- ⚠️ PRIVACY — read before adding a column.
-- This table is NOT `user_telemetry_events` and deliberately so: that table's
-- legitimate-interest basis holds precisely because it carries no location and
-- no behaviour, and widening it was ruled out (see lib/deviceTelemetry.ts).
-- This is ride data, already disclosed in the Privacy Policy under
-- "Ride data: planned routes, ...", and it is minimised to match:
--
--   * ORIGIN ONLY. The destination is deliberately NOT stored. The heartbeat
--     needs a coordinate solely to answer "is this near the viewer", which the
--     origin satisfies; the destination is the more revealing half (where a
--     person intends to go, including places they never went) and buys nothing.
--   * No geometry, no waypoints, no free text, no search terms.
--   * `distance_meters` is the planned route's length — a scalar about the
--     route, not about the rider.
--   * Retention is 180 days (`prune_planned_routes`). These rows exist to be
--     counted, and a count does not need history; minimisation is part of the
--     basis, not housekeeping.
--
-- If you are here to add the destination, the geometry, or anything naming a
-- place, that is a privacy decision and needs the Privacy Policy updated in the
-- same change.

create table if not exists public.planned_routes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- Origin of the planned route. Same shape as `trips.start_location` so the
  -- heartbeat can apply an identical ST_DWithin filter.
  start_location geography(Point, 4326) not null,
  -- 'safe' | 'fast' | 'flat' | 'loop' | 'course' — free text rather than an
  -- enum because the routing modes change more often than this table should.
  routing_mode  text,
  distance_meters double precision,
  -- Client-supplied stable key for one planning intent, HASHED on device
  -- (16 hex chars, mode-independent). Compared for equality only, never
  -- parsed or displayed.
  -- ⚠️ The hash is load-bearing, not cosmetic: the key must encode the
  -- destination to tell two intents apart, so sending it as readable text
  -- would put the destination in this table after all — in a text column
  -- instead of a geography one — and make the origin-only claim above false.
  -- The first device test produced exactly that row
  -- ('45.5857,25.4566>45.6514,25.6102') before the hash was added.
  dedupe_key    text,
  created_at    timestamptz not null default now()
);

comment on table public.planned_routes is
  'Routes a rider planned, whether or not they then rode. Origin only — the destination is deliberately not stored (migration 202609140002). Retention 180 days via prune_planned_routes().';

-- Service-role only. No client ever reads or writes this table directly: the
-- app posts to /v1/telemetry/route-plan and the heartbeat reads it through a
-- SECURITY DEFINER RPC. RLS on with zero policies = deny-all for anon and
-- authenticated, which is the intent (same posture as city_suggestions' writes).
alter table public.planned_routes enable row level security;

revoke all on public.planned_routes from anon, authenticated;

-- Heartbeat filters are (start_location, created_at); the prune is created_at.
create index if not exists planned_routes_created_at_idx
  on public.planned_routes (created_at);

create index if not exists planned_routes_start_location_gix
  on public.planned_routes using gist (start_location);

-- Dedupe lookups are (user_id, dedupe_key) newest-first inside a short window.
create index if not exists planned_routes_user_dedupe_idx
  on public.planned_routes (user_id, dedupe_key, created_at desc);

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------
--
-- ⚠️ Must be wired to the daily cron. `prune_user_telemetry_events()` shipped
-- unwired and is still an open item months later — do not repeat that here.

create or replace function public.prune_planned_routes()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_deleted integer;
begin
  delete from public.planned_routes
  where created_at < now() - interval '180 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- City Heartbeat: routesPlanned counts
-- ---------------------------------------------------------------------------
--
-- Mirrors the ridesStarted blocks added in 202609140001 — same (window, scope)
-- rung as the pulse, so the one honest label the ladder resolved covers every
-- number on the card. Count only, for the same reason: this table holds no
-- shareable distance aggregate worth surfacing, and km/CO2 must keep meaning
-- "from rides actually shared".

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
