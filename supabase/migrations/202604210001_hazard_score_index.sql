-- Improved Hazard System: generated score column, per-type TTL, vote-flip +
-- resurrection guards on the existing extend_hazard_on_confirm trigger, and
-- supporting indexes for the daily expiry cron.
--
-- Reuses existing columns from 202603270001_hazard_validations.sql:
--   hazards.confirm_count, hazards.deny_count, hazards.pass_count,
--   hazards.last_confirmed_at, hazards.expires_at,
--   hazard_validations.response CHECK ('confirm','deny','pass'),
--   hazard_validations UNIQUE (hazard_id, user_id).
--
-- Product mapping (kept in the API layer, not the DB):
--   upvote   -> response='confirm'
--   downvote -> response='deny'

-- 1. Generated score column on hazards so it can be indexed and filtered
--    on without repeatedly computing (confirm_count - deny_count).
ALTER TABLE hazards
  ADD COLUMN IF NOT EXISTS score integer
  GENERATED ALWAYS AS (confirm_count - deny_count) STORED;

-- 2. Per-type baseline TTL helper. Transient hazards in hours,
--    semi-permanent hazards in days/weeks.
CREATE OR REPLACE FUNCTION hazard_baseline_ttl(p_type text)
RETURNS interval AS $$
BEGIN
  RETURN CASE p_type
    WHEN 'poor_surface'           THEN interval '4 hours'    -- transient
    WHEN 'aggressive_traffic'     THEN interval '4 hours'
    WHEN 'illegally_parked_car'   THEN interval '6 hours'
    WHEN 'blocked_bike_lane'      THEN interval '12 hours'
    WHEN 'narrow_street'          THEN interval '30 days'    -- semi-permanent
    WHEN 'missing_bike_lane'      THEN interval '30 days'
    WHEN 'dangerous_intersection' THEN interval '30 days'
    WHEN 'pothole'                THEN interval '14 days'
    WHEN 'construction'           THEN interval '21 days'
    ELSE                               interval '24 hours'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp;

-- 3. Refine the EXISTING extend_hazard_on_confirm() trigger body.
--    The function name, the binding trigger (hazard_validation_counter),
--    and the hazard_validations CHECK / UNIQUE constraints are unchanged.
--    Behavior changes:
--      (a) confirm uses the per-type baseline TTL instead of a flat +12h
--      (b) deny halves the REMAINING lifetime
--      (c) resurrection guard prevents a stale offline vote from rewinding
--          a hard-expired hazard's expires_at
--      (d) on UPDATE where the response flipped, decrement the OLD counter
--          BEFORE applying NEW, so net change across one flip is delta-1
CREATE OR REPLACE FUNCTION extend_hazard_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  v_baseline    interval;
  v_type        text;
  v_expires_at  timestamptz;
BEGIN
  SELECT hazard_type, expires_at
    INTO v_type, v_expires_at
    FROM hazards
   WHERE id = NEW.hazard_id;

  -- Vote-flip reversal: on UPDATE where the response changed, undo the old
  -- one first so the new branch below applies a net delta-1 change.
  IF TG_OP = 'UPDATE' AND OLD.response IS DISTINCT FROM NEW.response THEN
    IF OLD.response = 'confirm' THEN
      UPDATE hazards SET confirm_count = GREATEST(confirm_count - 1, 0) WHERE id = NEW.hazard_id;
    ELSIF OLD.response = 'deny' THEN
      UPDATE hazards SET deny_count    = GREATEST(deny_count    - 1, 0) WHERE id = NEW.hazard_id;
    ELSIF OLD.response = 'pass' THEN
      UPDATE hazards SET pass_count    = GREATEST(pass_count    - 1, 0) WHERE id = NEW.hazard_id;
    END IF;
  END IF;

  -- Resurrection guard: a vote queued offline >7d ago that drains now must
  -- not rewind expires_at into the future for an effectively dead hazard.
  -- Counts still update (for audit); only the TTL extension is skipped.
  IF v_expires_at < now() - interval '7 days' THEN
    IF NEW.response = 'confirm' THEN
      UPDATE hazards SET confirm_count = confirm_count + 1 WHERE id = NEW.hazard_id;
    ELSIF NEW.response = 'deny' THEN
      UPDATE hazards SET deny_count    = deny_count    + 1 WHERE id = NEW.hazard_id;
    ELSIF NEW.response = 'pass' THEN
      UPDATE hazards SET pass_count    = pass_count    + 1 WHERE id = NEW.hazard_id;
    END IF;
    RETURN NEW;
  END IF;

  v_baseline := hazard_baseline_ttl(v_type);

  IF NEW.response = 'confirm' THEN            -- product: UPVOTE
    UPDATE hazards
       SET confirm_count     = confirm_count + 1,
           last_confirmed_at = now(),
           expires_at        = GREATEST(expires_at, now() + v_baseline)
     WHERE id = NEW.hazard_id;
  ELSIF NEW.response = 'deny' THEN            -- product: DOWNVOTE
    UPDATE hazards
       SET deny_count  = deny_count + 1,
           expires_at  = now() + GREATEST((expires_at - now()) / 2, interval '1 minute')
     WHERE id = NEW.hazard_id;
  ELSIF NEW.response = 'pass' THEN
    UPDATE hazards SET pass_count = pass_count + 1 WHERE id = NEW.hazard_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- 4. Update the hazard insert trigger to use the per-type baseline.
CREATE OR REPLACE FUNCTION set_hazard_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := now() + hazard_baseline_ttl(NEW.hazard_type);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- 5. Indexes for cron + map + hide-threshold queries.
CREATE INDEX IF NOT EXISTS hazards_expires_at_idx ON hazards (expires_at);
CREATE INDEX IF NOT EXISTS hazards_score_idx      ON hazards (score);
