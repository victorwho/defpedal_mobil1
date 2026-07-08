-- Spatial + retention indexes (audit 2026-07-05 SCALE-7, SCALE-8, SCALE-11).
--
-- SCALE-7: `get_neighborhood_leaderboard`'s CO2 metric runs
-- ST_DWithin(t.start_location, v_point, radius) over ALL trips per view —
-- trips.start_location (geography) had no spatial index, so every leaderboard
-- open was a sequential scan. geography ST_DWithin is GiST-index-aware, so an
-- index alone fixes it (no RPC change). The 'all' period also has no date
-- bound, so started_at gets a btree for the windowed periods.
--
-- SCALE-8: hazards.location is JSONB; `get_nearby_hazards` (polled every 60s
-- by every active navigator) and the leaderboard hazards branch both build
--   ST_SetSRID(ST_MakePoint((location->>'longitude')::double precision,
--                           (location->>'latitude')::double precision),
--              4326)::geography
-- in their WHERE — un-indexable as a column, but indexable as an EXPRESSION.
-- Both live RPCs use this exact expression (verified via pg_get_functiondef
-- 2026-07-07), so one expression GiST index serves both with ZERO RPC
-- rewrites. (get_city_heartbeat does not touch this expression.) If a future
-- RPC edit changes the expression, it must keep this exact shape or the
-- planner stops using the index.
--
-- SCALE-11 support: partial index so truncate_old_gps_trails' candidate scan
-- (created_at < cutoff AND jsonb_array_length(gps_trail) > 0) stays cheap as
-- trip_tracks grows.
--
-- NOTE: plain CREATE INDEX (not CONCURRENTLY — the migration runner wraps
-- files in a transaction). Fine at current table sizes (thousands of rows,
-- millisecond locks). If this ever needs re-running against a large live
-- table, run the CONCURRENTLY variants via the SQL editor instead.

create index if not exists idx_trips_start_location
  on trips using gist (start_location);

create index if not exists idx_trips_started_at
  on trips (started_at);

create index if not exists idx_hazards_location_geo
  on hazards using gist (
    (ST_SetSRID(
      ST_MakePoint(
        (location->>'longitude')::double precision,
        (location->>'latitude')::double precision
      ),
      4326
    )::geography)
  )
  where location is not null;

create index if not exists idx_trip_tracks_created_at_with_trail
  on trip_tracks (created_at)
  where jsonb_array_length(gps_trail) > 0;
