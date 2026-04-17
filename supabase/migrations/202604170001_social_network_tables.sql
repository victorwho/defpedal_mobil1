-- ═══════════════════════════════════════════════════════════════════════════
-- Social Network Expansion — Tables
-- 1. activity_feed (unified feed with 5 activity types)
-- 2. activity_reactions (replaces feed_likes + trip_loves)
-- 3. activity_comments (replaces feed_comments)
-- 4. user_follows (follow system with pending/accepted)
-- 5. Profile changes (is_private, default changes)
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. activity_feed — unified activity feed
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('ride', 'hazard_batch', 'hazard_standalone', 'tier_up', 'badge_unlock')),
  payload JSONB NOT NULL DEFAULT '{}',
  location GEOGRAPHY(Point, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_activity_feed_created_at
  ON activity_feed (created_at DESC);
CREATE INDEX idx_activity_feed_user_created
  ON activity_feed (user_id, created_at DESC);
CREATE INDEX idx_activity_feed_location
  ON activity_feed USING GIST (location);
CREATE INDEX idx_activity_feed_type
  ON activity_feed (type);

-- RLS
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_feed_select_authenticated"
  ON activity_feed FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "activity_feed_insert_own"
  ON activity_feed FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "activity_feed_delete_own"
  ON activity_feed FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON activity_feed TO authenticated;
GRANT ALL ON activity_feed TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. activity_reactions — unified reactions (replaces feed_likes + trip_loves)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE activity_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activity_feed(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'love')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_id, user_id, reaction_type)
);

CREATE INDEX idx_activity_reactions_activity
  ON activity_reactions (activity_id);
CREATE INDEX idx_activity_reactions_user
  ON activity_reactions (user_id);

ALTER TABLE activity_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_reactions_select_authenticated"
  ON activity_reactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "activity_reactions_insert_own"
  ON activity_reactions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "activity_reactions_delete_own"
  ON activity_reactions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON activity_reactions TO authenticated;
GRANT ALL ON activity_reactions TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. activity_comments — unified comments (replaces feed_comments)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE activity_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activity_feed(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_comments_activity
  ON activity_comments (activity_id);

ALTER TABLE activity_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_comments_select_authenticated"
  ON activity_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "activity_comments_insert_own"
  ON activity_comments FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT ON activity_comments TO authenticated;
GRANT ALL ON activity_comments TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. user_follows — follow system with pending/accepted status
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE user_follows (
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX idx_user_follows_following_status
  ON user_follows (following_id, status);
CREATE INDEX idx_user_follows_follower_status
  ON user_follows (follower_id, status);

ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

-- Users can see their own follow relationships and public accepted follows
CREATE POLICY "user_follows_select_own"
  ON user_follows FOR SELECT
  TO authenticated
  USING (
    follower_id = auth.uid()
    OR following_id = auth.uid()
    OR status = 'accepted'
  );

CREATE POLICY "user_follows_insert_own"
  ON user_follows FOR INSERT
  TO authenticated
  WITH CHECK (follower_id = auth.uid());

CREATE POLICY "user_follows_delete_own"
  ON user_follows FOR DELETE
  TO authenticated
  USING (follower_id = auth.uid() OR following_id = auth.uid());

-- Allow the followed user to update status (approve pending → accepted)
CREATE POLICY "user_follows_update_target"
  ON user_follows FOR UPDATE
  TO authenticated
  USING (following_id = auth.uid())
  WITH CHECK (following_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON user_follows TO authenticated;
GRANT ALL ON user_follows TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Profile changes
-- ═══════════════════════════════════════════════════════════════════════════

-- Add is_private column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;

-- Change defaults for new users (does not affect existing rows)
ALTER TABLE profiles ALTER COLUMN auto_share_rides SET DEFAULT true;
ALTER TABLE profiles ALTER COLUMN trim_route_endpoints SET DEFAULT true;

-- Update handle_new_user trigger to set new defaults
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, display_name, auto_share_rides, trim_route_endpoints)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    true,   -- auto_share_rides defaults to true for new users
    true    -- trim_route_endpoints defaults to true for new users
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
