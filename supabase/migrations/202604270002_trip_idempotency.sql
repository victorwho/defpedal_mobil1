-- Make trip writes idempotent so client retries (sync timeouts, kill-recovery,
-- network drops on the response leg) don't create duplicate trip rows.
--
-- Without these constraints, `POST /trips/start` and `POST /trips/track` were
-- plain inserts: a 10s mutation timeout that exceeded server commit time, or
-- an app kill mid-sync, would re-enqueue the request and create a second
-- copy of the same logical trip. trip_tracks duplicates were the user-visible
-- symptom — `getTripHistory` reads from trip_tracks.
--
-- Strategy:
--   1. Dedupe existing trip_tracks rows (one trip → one track invariant).
--   2. UNIQUE(trip_id) on trip_tracks so saveTripTrack can upsert.
--   3. trips.client_trip_id + partial UNIQUE(user_id, client_trip_id) so
--      startTripRecord can upsert. Partial index keeps legacy NULL rows valid.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Dedupe existing trip_tracks. Keep the row with the longest GPS trail
--    per trip_id; tie-break on created_at DESC, then id DESC for stability.
-- ---------------------------------------------------------------------------
DELETE FROM trip_tracks
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY trip_id
        ORDER BY jsonb_array_length(gps_trail) DESC, created_at DESC, id DESC
      ) AS rn
    FROM trip_tracks
  ) ranked
  WHERE ranked.rn > 1
);

-- ---------------------------------------------------------------------------
-- 2. UNIQUE(trip_id) on trip_tracks — enables INSERT ... ON CONFLICT (trip_id)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS trip_tracks_trip_id_unique
  ON trip_tracks (trip_id);

-- ---------------------------------------------------------------------------
-- 3. trips.client_trip_id + partial UNIQUE(user_id, client_trip_id)
--    Partial WHERE clause lets legacy rows (NULL) coexist; new writes from
--    the API will populate it.
-- ---------------------------------------------------------------------------
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS client_trip_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS trips_user_client_trip_id_unique
  ON trips (user_id, client_trip_id)
  WHERE client_trip_id IS NOT NULL;

COMMIT;
