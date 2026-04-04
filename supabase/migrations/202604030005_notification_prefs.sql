-- Habit engine notification preferences
-- Adds streak and impact notification toggles to profiles

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_streak BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_impact_summary BOOLEAN NOT NULL DEFAULT TRUE;
