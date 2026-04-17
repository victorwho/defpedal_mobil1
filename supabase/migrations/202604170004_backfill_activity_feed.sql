-- ═══════════════════════════════════════════════════════════════════════════
-- Social Network — Backfill Migration
-- Migrates existing data from old tables to new unified tables:
--   trip_shares → activity_feed (type = 'ride')
--   feed_likes → activity_reactions (reaction_type = 'like')
--   trip_loves → activity_reactions (reaction_type = 'love')
--   feed_comments → activity_comments
-- Preserves original timestamps. Old tables kept as archive.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Backfill trip_shares → activity_feed
-- ─────────────────────────────────────────────────────────────────────────

-- Temporary mapping table to link old trip_share IDs to new activity_feed IDs
CREATE TEMP TABLE trip_share_mapping (
  old_id UUID NOT NULL,
  new_id UUID NOT NULL
);

INSERT INTO activity_feed (id, user_id, type, payload, location, created_at)
SELECT
  gen_random_uuid() AS id,
  ts.user_id,
  'ride' AS type,
  jsonb_build_object(
    'title', ts.title,
    'startLocationText', ts.start_location_text,
    'destinationText', ts.destination_text,
    'distanceMeters', ts.distance_meters,
    'durationSeconds', ts.duration_seconds,
    'elevationGainMeters', ts.elevation_gain_meters,
    'averageSpeedMps', ts.average_speed_mps,
    'safetyRating', ts.safety_rating,
    'safetyTags', to_jsonb(ts.safety_tags),
    'geometryPolyline6', ts.geometry_polyline6,
    'note', ts.note,
    'tripId', ts.trip_id,
    'co2SavedKg', ROUND((ts.distance_meters * 0.00012)::numeric, 3)
  ) AS payload,
  ts.start_coordinate AS location,
  ts.shared_at AS created_at
FROM trip_shares ts;

-- Build the mapping for reaction/comment migration
INSERT INTO trip_share_mapping (old_id, new_id)
SELECT ts.id, af.id
FROM trip_shares ts
JOIN activity_feed af ON af.user_id = ts.user_id
  AND af.type = 'ride'
  AND af.created_at = ts.shared_at
  AND (af.payload->>'tripId')::text = ts.trip_id::text;

-- Also match shares without trip_id (NULL tripId)
INSERT INTO trip_share_mapping (old_id, new_id)
SELECT ts.id, af.id
FROM trip_shares ts
JOIN activity_feed af ON af.user_id = ts.user_id
  AND af.type = 'ride'
  AND af.created_at = ts.shared_at
  AND ts.trip_id IS NULL
  AND af.payload->>'tripId' IS NULL
WHERE ts.id NOT IN (SELECT old_id FROM trip_share_mapping);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Backfill feed_likes → activity_reactions (like)
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO activity_reactions (activity_id, user_id, reaction_type, created_at)
SELECT
  m.new_id AS activity_id,
  fl.user_id,
  'like' AS reaction_type,
  fl.created_at
FROM feed_likes fl
JOIN trip_share_mapping m ON m.old_id = fl.trip_share_id
ON CONFLICT (activity_id, user_id, reaction_type) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Backfill trip_loves → activity_reactions (love)
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO activity_reactions (activity_id, user_id, reaction_type, created_at)
SELECT
  m.new_id AS activity_id,
  tl.user_id,
  'love' AS reaction_type,
  tl.created_at
FROM trip_loves tl
JOIN trip_share_mapping m ON m.old_id = tl.trip_share_id
ON CONFLICT (activity_id, user_id, reaction_type) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Backfill feed_comments → activity_comments
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO activity_comments (activity_id, user_id, body, created_at)
SELECT
  m.new_id AS activity_id,
  fc.user_id,
  fc.body,
  fc.created_at
FROM feed_comments fc
JOIN trip_share_mapping m ON m.old_id = fc.trip_share_id;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Cleanup
-- ─────────────────────────────────────────────────────────────────────────

-- Drop temp mapping table
DROP TABLE trip_share_mapping;

-- Old tables (trip_shares, feed_likes, trip_loves, feed_comments) are
-- intentionally NOT dropped. They remain as archive until migration
-- integrity is verified. A future migration will drop them.

-- Add a comment for tracking
COMMENT ON TABLE trip_shares IS 'ARCHIVED: Migrated to activity_feed (type=ride) in 202604170004. Do not insert new rows.';
COMMENT ON TABLE feed_likes IS 'ARCHIVED: Migrated to activity_reactions in 202604170004. Do not insert new rows.';
COMMENT ON TABLE feed_comments IS 'ARCHIVED: Migrated to activity_comments in 202604170004. Do not insert new rows.';
