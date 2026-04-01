-- Push notification infrastructure
-- Tables for push tokens, notification log, and user notification preferences

-- Push tokens: one per user+device, upserted on app open
CREATE TABLE IF NOT EXISTS push_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  device_id       TEXT NOT NULL,
  platform        TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_id)
);

-- RLS: users can only manage their own tokens
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own tokens"
  ON push_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tokens"
  ON push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens"
  ON push_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens"
  ON push_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Service role bypass for server-side queries
GRANT ALL ON push_tokens TO service_role;

-- Notification log: audit trail for all sent/suppressed notifications
CREATE TABLE IF NOT EXISTS notification_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  category            TEXT NOT NULL CHECK (category IN ('weather', 'hazard', 'community', 'system')),
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,
  data                JSONB,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'suppressed')),
  suppression_reason  TEXT,
  expo_ticket_id      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service role only — no client access
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON notification_log TO service_role;

-- Add notification preferences to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notify_weather        BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_hazard         BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_community      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS quiet_hours_start     TEXT DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_end       TEXT DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_timezone  TEXT DEFAULT 'Europe/Bucharest';

-- Index for fast token lookup by user
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);

-- Index for notification log queries
CREATE INDEX IF NOT EXISTS idx_notification_log_user_created ON notification_log(user_id, created_at DESC);
