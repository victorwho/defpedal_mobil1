-- Saved loops: a generated loop kept on the rider's account.
--
-- Deliberately its own table rather than columns on `saved_routes`. That table
-- stores origin, destination and waypoints and RE-ROUTES on open — it never
-- stores geometry. A loop cannot survive that: its destination IS its origin,
-- so the re-route asks for the shortest way from a point to itself. A loop has
-- to keep its line.
--
-- `route` holds the RouteOption minus the two fields that are cheap to
-- re-derive: `riskSegments` and `elevationProfile` both come back from
-- /v1/risk-segments and /v1/elevation-profile, which take a bare coordinate
-- array. Keeping them out holds a row to roughly a hundred kilobytes instead
-- of several hundred, and matches how an imported course is re-enriched on
-- open. What must be stored is the geometry and the turn steps: OSRM produced
-- those with real street names, and re-deriving them would silently downgrade
-- the instructions.

CREATE TABLE IF NOT EXISTS saved_loops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Both ends of the ride. One point, because that is what a loop is.
  start_point JSONB NOT NULL,
  -- The RouteOption itself, carrying `source: 'generated_loop'` — the marker
  -- that stops navigation rerouting the rider home mid-loop.
  route JSONB NOT NULL,
  distance_meters INTEGER NOT NULL,
  climb_meters INTEGER,
  unpaved_share REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Listing is always "mine, most recently used first".
CREATE INDEX IF NOT EXISTS idx_saved_loops_user_recency
  ON saved_loops (user_id, last_used_at DESC);

-- RLS: a rider sees only their own loops. Same four policies as saved_routes.
ALTER TABLE saved_loops ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_loops_select ON saved_loops
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY saved_loops_insert ON saved_loops
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY saved_loops_update ON saved_loops
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY saved_loops_delete ON saved_loops
  FOR DELETE USING (auth.uid() = user_id);
