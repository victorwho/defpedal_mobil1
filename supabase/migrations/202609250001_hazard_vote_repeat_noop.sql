-- Hazard votes: a repeat of an IDENTICAL vote must be a no-op.
--
-- Found by the 2026-09-25 external-review triage as P0-3
-- (docs/plans/external-review-triage-2026-09-25.md).
--
-- The bug, and why it was reachable from the shipped UI:
--
--   1. `extend_hazard_on_confirm` reversed the previous vote only when
--      `TG_OP = 'UPDATE' AND OLD.response IS DISTINCT FROM NEW.response`, but
--      the counting branches below that ran UNCONDITIONALLY on INSERT and
--      UPDATE -- including when OLD.response = NEW.response.
--   2. `POST /v1/hazards/:id/vote` upserts `hazard_validations` with a fresh
--      `responded_at` on every call (services/mobile-api/src/routes/v1.ts:1406),
--      so pressing the same button twice always produces a real UPDATE that
--      fires the trigger.
--   3. `HazardDetailSheet` computes `downActive` but uses it only for styling
--      and accessibilityState; `handleDownvote` guards on `isPending` alone.
--
-- Net effect: three taps on thumbs-down drove `score`
-- (generated confirm_count - deny_count) to -3, which hides the hazard from
-- every rider via /hazards/nearby, and the 3 AM cron then HARD-DELETED it ~24 h
-- later, irreversibly. Each deny tap also halved the remaining TTL. The
-- `UNIQUE (hazard_id, user_id)` constraint whose documented purpose
-- (v1.ts:1366-1368) is to stop vote-stuffing was defeated by pressing one
-- button twice.
--
-- The fix is a single early return, deliberately chosen over restructuring the
-- counting branches: it leaves every other path byte-identical (flip still does
-- reversal + delta-1, INSERT still counts) and is therefore the smallest change
-- that can be reasoned about against the live body.
--
-- A repeat vote is a FULL no-op -- no count change and no TTL change. Allowing a
-- repeat `confirm` to keep extending expires_at would be the same abuse in the
-- opposite direction (one rider keeping a stale hazard alive indefinitely);
-- TTL extension is meant to reflect DISTINCT community confirmations, which is
-- what the per-user UNIQUE constraint encodes.
--
-- DB-only: no API deploy and no client release, so it protects the entire
-- fielded fleet at once (which matters -- the fleet trails main by several
-- versions).
--
-- Verified before writing: the live body returned by pg_get_functiondef was
-- identical in logic to 202609020001, so this replaces a known state.

CREATE OR REPLACE FUNCTION public.extend_hazard_on_confirm()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_baseline     interval;
  v_type         text;
  v_expires_at   timestamptz;
  v_is_permanent boolean;
  v_deny_count   integer;
BEGIN
  -- Repeat of an identical vote: no-op. The server upsert rewrites
  -- responded_at on every call, so tapping the same button twice arrives here
  -- as an UPDATE with OLD.response = NEW.response. Counting it again let a
  -- single rider drive any hazard to the hide-and-delete threshold.
  IF TG_OP = 'UPDATE' AND OLD.response IS NOT DISTINCT FROM NEW.response THEN
    RETURN NEW;
  END IF;

  -- Vote-flip reversal: on UPDATE where the response changed, undo the old
  -- one first so the new branch below applies a net delta-1 change.
  IF TG_OP = 'UPDATE' AND OLD.response IS DISTINCT FROM NEW.response THEN
    IF OLD.response = 'confirm' THEN
      UPDATE hazards SET confirm_count = GREATEST(confirm_count - 1, 0) WHERE id = NEW.hazard_id;
    ELSIF OLD.response = 'deny' THEN
      UPDATE hazards SET deny_count = GREATEST(deny_count - 1, 0) WHERE id = NEW.hazard_id;
    ELSIF OLD.response = 'pass' THEN
      UPDATE hazards SET pass_count = GREATEST(pass_count - 1, 0) WHERE id = NEW.hazard_id;
    END IF;
  END IF;

  SELECT hazard_type, expires_at, is_permanent
    INTO v_type, v_expires_at, v_is_permanent
    FROM hazards
   WHERE id = NEW.hazard_id;

  -- Permanent hazards: no TTL arithmetic at all.
  IF coalesce(v_is_permanent, false) THEN
    IF NEW.response = 'confirm' THEN
      UPDATE hazards
         SET confirm_count     = confirm_count + 1,
             last_confirmed_at = now()
       WHERE id = NEW.hazard_id
      RETURNING deny_count INTO v_deny_count;
    ELSIF NEW.response = 'deny' THEN
      UPDATE hazards
         SET deny_count = deny_count + 1
       WHERE id = NEW.hazard_id
      RETURNING deny_count INTO v_deny_count;
    ELSE
      UPDATE hazards
         SET pass_count = pass_count + 1
       WHERE id = NEW.hazard_id
      RETURNING deny_count INTO v_deny_count;
    END IF;

    UPDATE hazards
       SET expires_at = CASE
             WHEN v_deny_count >= hazard_permanent_deny_threshold()
               THEN LEAST(expires_at, now())
             ELSE hazard_permanent_expiry()
           END
     WHERE id = NEW.hazard_id;

    RETURN NEW;
  END IF;

  -- Resurrection guard: a vote queued offline long ago that drains now must
  -- not rewind expires_at into the future for an effectively dead hazard.
  -- Counts still update (for audit); only the TTL extension is skipped.
  -- 45 days, aligned with the /v1/hazards/expire cron (202604210002).
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
$function$;
