-- Capture the rider's early-end reason on the trips parent row as well.
-- The trips row is written by every trip_end (save AND discard), so this is
-- where the reason needs to live to cover both paths. The existing
-- trip_tracks.early_end_reason column is kept for saved rides (trip_tracks
-- is only written on save); the trips column is the authoritative source
-- for analytics across both Save and Discard outcomes.

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS early_end_reason TEXT
    CHECK (
      early_end_reason IS NULL
      OR early_end_reason IN (
        'reached_destination',
        'found_better_route',
        'felt_unsafe',
        'no_longer_needed',
        'other'
      )
    );

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS early_end_reason_note TEXT;
