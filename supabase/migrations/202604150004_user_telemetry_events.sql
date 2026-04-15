-- Migration: User Telemetry Events table
-- Stores client-side behavioral events for Mia detection scoring.

CREATE TABLE IF NOT EXISTS user_telemetry_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Constrain event types to known telemetry events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_telemetry_events_event_type_check'
  ) THEN
    ALTER TABLE user_telemetry_events
      ADD CONSTRAINT user_telemetry_events_event_type_check
      CHECK (event_type IN ('app_open', 'route_generated_not_started', 'map_browse_session'));
  END IF;
END$$;

-- Composite index for detection queries
CREATE INDEX IF NOT EXISTS idx_user_telemetry_events_user_type_created
  ON user_telemetry_events (user_id, event_type, created_at);

-- RLS
ALTER TABLE user_telemetry_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Users can insert their own telemetry events
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'user_telemetry_events_insert_own'
  ) THEN
    CREATE POLICY user_telemetry_events_insert_own
      ON user_telemetry_events
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- Service role can select all rows (for detection scoring cron)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'user_telemetry_events_select_service'
  ) THEN
    CREATE POLICY user_telemetry_events_select_own
      ON user_telemetry_events
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END$$;
