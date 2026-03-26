-- Trip GPS trail and planned route recording
-- Stores the actual GPS breadcrumbs from each ride alongside the planned route

CREATE TABLE IF NOT EXISTS trip_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  routing_mode TEXT NOT NULL CHECK (routing_mode IN ('safe', 'fast')),
  planned_route_polyline6 TEXT,
  planned_route_distance_meters REAL,
  gps_trail JSONB NOT NULL DEFAULT '[]',
  end_reason TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (end_reason IN ('completed', 'stopped', 'app_killed', 'in_progress')),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trip_tracks_trip_id ON trip_tracks (trip_id);
CREATE INDEX idx_trip_tracks_user_id ON trip_tracks (user_id);

ALTER TABLE trip_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own tracks"
  ON trip_tracks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own tracks"
  ON trip_tracks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON trip_tracks FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grant service_role access
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_tracks TO service_role;
GRANT SELECT, INSERT ON trip_tracks TO authenticated;
