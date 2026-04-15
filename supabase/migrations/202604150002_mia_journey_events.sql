-- Migration: Mia Journey Events and Detection Signals tables

-- ── Journey Events ──

CREATE TABLE IF NOT EXISTS mia_journey_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  from_level INT,
  to_level INT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mia_journey_events_user_created
  ON mia_journey_events (user_id, created_at);

-- ── Detection Signals ──

CREATE TABLE IF NOT EXISTS mia_detection_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  signal_type TEXT NOT NULL,
  points INT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mia_detection_signals_user_detected
  ON mia_detection_signals (user_id, detected_at);

-- ── RLS ──

ALTER TABLE mia_journey_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mia_detection_signals ENABLE ROW LEVEL SECURITY;

-- Users can read their own journey events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mia_journey_events_select_own'
  ) THEN
    CREATE POLICY mia_journey_events_select_own
      ON mia_journey_events
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  -- Service role can insert journey events (via API)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mia_journey_events_insert_service'
  ) THEN
    CREATE POLICY mia_journey_events_insert_service
      ON mia_journey_events
      FOR INSERT
      WITH CHECK (true);
  END IF;

  -- Users can read their own detection signals
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mia_detection_signals_select_own'
  ) THEN
    CREATE POLICY mia_detection_signals_select_own
      ON mia_detection_signals
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  -- Service role can insert detection signals (via API)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'mia_detection_signals_insert_service'
  ) THEN
    CREATE POLICY mia_detection_signals_insert_service
      ON mia_detection_signals
      FOR INSERT
      WITH CHECK (true);
  END IF;
END$$;
