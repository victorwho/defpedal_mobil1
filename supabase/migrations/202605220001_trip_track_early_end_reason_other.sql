-- Allow an 'other' early-end reason plus a free-text note the rider can type.
-- Extends 202605210001. The note is only meaningful when early_end_reason = 'other'.

ALTER TABLE trip_tracks
  DROP CONSTRAINT IF EXISTS trip_tracks_early_end_reason_check;

ALTER TABLE trip_tracks
  ADD CONSTRAINT trip_tracks_early_end_reason_check
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

ALTER TABLE trip_tracks
  ADD COLUMN IF NOT EXISTS early_end_reason_note TEXT;
