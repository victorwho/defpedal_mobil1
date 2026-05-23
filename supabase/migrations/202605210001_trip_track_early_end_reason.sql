-- Capture why a rider ended turn-by-turn guidance before reaching the destination.
-- Optional, single-choice. NULL when the ride completed naturally or the rider
-- skipped the question. Written by the trip_track upsert (services/mobile-api).

ALTER TABLE trip_tracks
  ADD COLUMN IF NOT EXISTS early_end_reason TEXT
    CHECK (
      early_end_reason IS NULL
      OR early_end_reason IN (
        'reached_destination',
        'found_better_route',
        'felt_unsafe',
        'no_longer_needed'
      )
    );
