-- Saved routes: allow users to save and quickly reload frequently used routes
CREATE TABLE IF NOT EXISTS saved_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  origin JSONB NOT NULL,
  destination JSONB NOT NULL,
  waypoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  mode TEXT NOT NULL DEFAULT 'safe',
  avoid_unpaved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for listing by recency
CREATE INDEX idx_saved_routes_user_recency ON saved_routes (user_id, last_used_at DESC);

-- RLS: users can only access their own saved routes
ALTER TABLE saved_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_routes_select ON saved_routes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY saved_routes_insert ON saved_routes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY saved_routes_update ON saved_routes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY saved_routes_delete ON saved_routes
  FOR DELETE USING (auth.uid() = user_id);
