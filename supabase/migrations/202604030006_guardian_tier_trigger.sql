-- Auto-promote guardian_tier when total_hazards_reported crosses thresholds.
-- Fires BEFORE UPDATE OF total_hazards_reported on profiles.
-- Thresholds: 0-4 = reporter, 5-14 = watchdog, 15-49 = sentinel, 50+ = guardian_angel

CREATE OR REPLACE FUNCTION promote_guardian_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.total_hazards_reported >= 50 THEN
    NEW.guardian_tier := 'guardian_angel';
  ELSIF NEW.total_hazards_reported >= 15 THEN
    NEW.guardian_tier := 'sentinel';
  ELSIF NEW.total_hazards_reported >= 5 THEN
    NEW.guardian_tier := 'watchdog';
  ELSE
    NEW.guardian_tier := 'reporter';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guardian_tier_promotion ON profiles;
DROP TRIGGER IF EXISTS trigger_promote_guardian_tier ON profiles;
CREATE TRIGGER trigger_promote_guardian_tier
  BEFORE UPDATE OF total_hazards_reported ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION promote_guardian_tier();
