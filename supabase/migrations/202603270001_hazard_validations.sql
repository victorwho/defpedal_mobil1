-- Add community validation tracking columns to hazards table
ALTER TABLE hazards ADD COLUMN IF NOT EXISTS confirm_count integer NOT NULL DEFAULT 0;
ALTER TABLE hazards ADD COLUMN IF NOT EXISTS deny_count integer NOT NULL DEFAULT 0;
ALTER TABLE hazards ADD COLUMN IF NOT EXISTS pass_count integer NOT NULL DEFAULT 0;
ALTER TABLE hazards ADD COLUMN IF NOT EXISTS last_confirmed_at timestamptz;
ALTER TABLE hazards ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + interval '24 hours');

-- Create hazard_validations table to track per-user votes
CREATE TABLE IF NOT EXISTS hazard_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hazard_id uuid NOT NULL REFERENCES hazards(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  response text NOT NULL CHECK (response IN ('confirm', 'deny', 'pass')),
  responded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hazard_id, user_id)
);

-- Enable RLS on hazard_validations
ALTER TABLE hazard_validations ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their own validations
CREATE POLICY "Users can insert their own validations"
  ON hazard_validations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow service_role full access
GRANT ALL ON hazard_validations TO service_role;

-- Set default expires_at on new hazard inserts
CREATE OR REPLACE FUNCTION set_hazard_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := now() + interval '24 hours';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hazard_set_expiry ON hazards;
CREATE TRIGGER hazard_set_expiry
  BEFORE INSERT ON hazards
  FOR EACH ROW
  EXECUTE FUNCTION set_hazard_expiry();

-- Extend expiry by 12 hours when a hazard is confirmed
CREATE OR REPLACE FUNCTION extend_hazard_on_confirm()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.response = 'confirm' THEN
    UPDATE hazards
    SET confirm_count = confirm_count + 1,
        last_confirmed_at = now(),
        expires_at = GREATEST(expires_at, now() + interval '12 hours')
    WHERE id = NEW.hazard_id;
  ELSIF NEW.response = 'deny' THEN
    UPDATE hazards
    SET deny_count = deny_count + 1
    WHERE id = NEW.hazard_id;
  ELSIF NEW.response = 'pass' THEN
    UPDATE hazards
    SET pass_count = pass_count + 1
    WHERE id = NEW.hazard_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hazard_validation_counter ON hazard_validations;
CREATE TRIGGER hazard_validation_counter
  AFTER INSERT OR UPDATE ON hazard_validations
  FOR EACH ROW
  EXECUTE FUNCTION extend_hazard_on_confirm();
