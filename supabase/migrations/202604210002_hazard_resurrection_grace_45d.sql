-- Improved Hazard System — widen the resurrection-guard window from 7 to 45 days.
--
-- Background: 202604210001 installed a resurrection guard in
-- extend_hazard_on_confirm() so that a vote draining off the offline queue
-- more than 7 days past expires_at would still record the counter bump
-- (for audit) but would NOT rewind expires_at back into the future.
--
-- We're widening the window to 45 days to be more forgiving of long offline
-- gaps (touring, poor coverage, app left in the background for weeks) while
-- still preventing indefinite resurrection. The paired 7-day grace window in
-- the /v1/hazards/expire cron also moves to 45 days — they stay aligned so a
-- hazard can never be hard-deleted while still inside the resurrection
-- window.
--
-- Only the resurrection-guard branch changes. Flip-guard, halving, and
-- baseline-TTL logic are untouched. CREATE OR REPLACE keeps the existing
-- trigger binding on hazard_validations intact.

CREATE OR REPLACE FUNCTION extend_hazard_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  v_baseline    interval;
  v_type        text;
  v_expires_at  timestamptz;
BEGIN
  -- Flip-guard: if this is a vote change (UPDATE where response differs),
  -- undo the previous vote's counter contribution before applying the new
  -- one. Without this the aggregate counters double-count on flips (e.g.
  -- upvotes stays at 1 instead of decrementing to 0 when the user flips to
  -- down). score is a generated column so it follows the counters.
  IF TG_OP = 'UPDATE' AND OLD.response IS DISTINCT FROM NEW.response THEN
    IF OLD.response = 'confirm' THEN
      UPDATE hazards SET confirm_count = GREATEST(confirm_count - 1, 0) WHERE id = NEW.hazard_id;
    ELSIF OLD.response = 'deny' THEN
      UPDATE hazards SET deny_count = GREATEST(deny_count - 1, 0) WHERE id = NEW.hazard_id;
    ELSIF OLD.response = 'pass' THEN
      UPDATE hazards SET pass_count = GREATEST(pass_count - 1, 0) WHERE id = NEW.hazard_id;
    END IF;
  END IF;

  SELECT hazard_type, expires_at
    INTO v_type, v_expires_at
    FROM hazards
   WHERE id = NEW.hazard_id;

  -- Resurrection guard: a vote queued offline >45d ago that drains now must
  -- not rewind expires_at into the future for an effectively dead hazard.
  -- Counts still update for audit; only the TTL extension is skipped.
  IF v_expires_at < now() - interval '45 days' THEN
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
