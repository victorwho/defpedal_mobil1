-- Add avoid_hills column to saved_routes for flat routing preference
ALTER TABLE saved_routes ADD COLUMN IF NOT EXISTS avoid_hills BOOLEAN NOT NULL DEFAULT false;
