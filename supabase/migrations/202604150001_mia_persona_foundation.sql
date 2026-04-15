-- Migration: Mia Persona Foundation
-- Adds persona and journey tracking columns to profiles table.

-- ── Profile columns for Mia persona journey ──

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS persona TEXT NOT NULL DEFAULT 'alex',
  ADD COLUMN IF NOT EXISTS mia_journey_level INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS mia_journey_status TEXT,
  ADD COLUMN IF NOT EXISTS mia_journey_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mia_journey_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mia_detection_source TEXT,
  ADD COLUMN IF NOT EXISTS mia_detection_score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mia_prompt_shown BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mia_prompt_queued BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mia_total_rides INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mia_rides_with_destination INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mia_rides_over_5km INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mia_moderate_segments_completed INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mia_testimonial TEXT,
  ADD COLUMN IF NOT EXISTS notify_mia BOOLEAN NOT NULL DEFAULT true;

-- ── CHECK constraints ──
-- Use DO block with IF NOT EXISTS pattern for safety.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_persona_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_persona_check
      CHECK (persona IN ('alex', 'mia'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_mia_journey_level_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_mia_journey_level_check
      CHECK (mia_journey_level BETWEEN 1 AND 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_mia_journey_status_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_mia_journey_status_check
      CHECK (mia_journey_status IS NULL OR mia_journey_status IN ('active', 'completed', 'opted_out'));
  END IF;
END$$;
