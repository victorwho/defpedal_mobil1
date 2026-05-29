-- Migration: Backfill navigation_feedback.user_id from matching trips.
--
-- Context: prior to the fix in services/mobile-api/src/lib/submissions.ts
-- (commit <pending>), submitNavigationFeedback inserted rows without
-- populating user_id, even though the column existed and the function
-- received the userId argument. Every row in production therefore has
-- user_id = NULL, which makes the RLS SELECT policy (added in
-- 202604110002, "Owner can read own feedback" using auth.uid() = user_id)
-- block riders from ever reading back their own safety ratings.
--
-- Strategy: correlate feedback to trips using:
--
--   - Start point: navigation_feedback.start_location holds a bare
--     "lat.4, lon.4" string written by formatCoordinateLabel in
--     feedback.tsx. trips.start_location_text is wrapped as
--     "Current rider location (lat, lon)" or "Custom start (lat, lon)"
--     by route-preview.tsx, which is why a plain text equality join
--     finds zero matches. Use the geography column trips.start_location
--     and compare against the parsed feedback point spatially.
--
--   - Destination: both tables share the bare "lat.4, lon.4" format,
--     but we still spatial-match against trips.destination_location for
--     consistency with the start join (and to absorb the 4-decimal
--     rounding without an exact-string comparison).
--
--   - Distance: navigation_feedback.distance_km vs trips.distance_meters
--     (tolerance: max of 100 m and 2%, accommodates mid-ride route swaps).
--
--   - Time: trips.ended_at must precede navigation_feedback.created_at
--     by no more than 7 days. Feedback is enqueued at ride end but may
--     be drained later if the device was offline; 7 days is generous
--     enough for any realistic offline window.
--
-- Spatial tolerance: 30 m. The feedback text carries 4-decimal-degree
-- precision (~11 m at the equator). 30 m absorbs the rounding without
-- inviting cross-trip collisions from genuinely different start/dest
-- points.
--
-- Safety gate: a row is backfilled ONLY when the candidate set resolves
-- to exactly one distinct user_id. If two riders' trips happen to land
-- in the same 30 m radius at both endpoints within the same week
-- (commuter overlap on a shared corridor), the row is LEFT NULL rather
-- than mis-attributed. Better to lose attribution than to hand stranger
-- A's safety rating to stranger B.
--
-- Idempotent: re-running is a no-op for any row already backfilled
-- (the WHERE clause filters on user_id IS NULL).

DO $$
DECLARE
  backfilled_count integer;
BEGIN
  WITH parsed_feedback AS (
    SELECT
      nf.id,
      nf.created_at,
      nf.distance_km,
      -- "lat, lon" or "lat,lon" → POINT(lon lat). Two formats exist in
      -- production data: the current 4-decimal "lat, lon" written by
      -- formatCoordinateLabel and an older full-precision "lat,lon"
      -- (no space) from pre-2026 builds. Stripping whitespace before the
      -- split absorbs both. Rows whose text doesn't match the expected
      -- shape are filtered out by the regex check below.
      ST_SetSRID(
        ST_MakePoint(
          split_part(replace(nf.start_location, ' ', ''), ',', 2)::double precision,
          split_part(replace(nf.start_location, ' ', ''), ',', 1)::double precision
        ),
        4326
      )::geography AS start_point,
      ST_SetSRID(
        ST_MakePoint(
          split_part(replace(nf.destination, ' ', ''), ',', 2)::double precision,
          split_part(replace(nf.destination, ' ', ''), ',', 1)::double precision
        ),
        4326
      )::geography AS dest_point
    FROM navigation_feedback nf
    WHERE nf.user_id IS NULL
      AND nf.start_location ~ '^-?\d+\.\d+,\s*-?\d+\.\d+$'
      AND nf.destination    ~ '^-?\d+\.\d+,\s*-?\d+\.\d+$'
      AND nf.distance_km    IS NOT NULL
  ),
  candidates AS (
    SELECT
      pf.id AS feedback_id,
      t.user_id AS candidate_user_id
    FROM parsed_feedback pf
    JOIN trips t
      ON t.user_id              IS NOT NULL
     AND t.ended_at             IS NOT NULL
     AND t.ended_at            <= pf.created_at
     AND t.ended_at            >= pf.created_at - interval '7 days'
     AND t.start_location       IS NOT NULL
     AND t.destination_location IS NOT NULL
     AND ST_DWithin(t.start_location,       pf.start_point, 30)
     AND ST_DWithin(t.destination_location, pf.dest_point,  30)
     AND t.distance_meters     IS NOT NULL
     AND abs((t.distance_meters / 1000.0) - pf.distance_km)
           <= greatest(0.1, pf.distance_km * 0.02)
  ),
  unique_attribution AS (
    -- Postgres has no built-in min(uuid); since the HAVING clause already
    -- restricts the group to exactly one distinct candidate_user_id, picking
    -- any element of the distinct array is safe and equivalent.
    SELECT
      feedback_id,
      (array_agg(DISTINCT candidate_user_id))[1] AS user_id
    FROM candidates
    GROUP BY feedback_id
    HAVING count(DISTINCT candidate_user_id) = 1
  ),
  updated AS (
    UPDATE navigation_feedback nf
    SET user_id = ua.user_id
    FROM unique_attribution ua
    WHERE nf.id = ua.feedback_id
      AND nf.user_id IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO backfilled_count FROM updated;

  RAISE NOTICE 'navigation_feedback.user_id backfill: % rows attributed.',
    backfilled_count;
END $$;
