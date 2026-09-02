-- ---------------------------------------------------------------------------
-- 202609020001 — permanent hazards
-- ---------------------------------------------------------------------------
--
-- FEATURE
-- -------
-- A reporter may optionally mark a hazard as PERMANENT (a missing bike lane, a
-- dangerous intersection, a road that is always hostile). A permanent hazard
-- has no time-to-live at all: the ONLY thing that expires it is the community
-- saying it is gone, at `hazard_permanent_deny_threshold()` (10) downvotes.
--
-- WHY expires_at IS NOT SET NULL FOR THESE ROWS
-- ---------------------------------------------
-- `expiresAt` is a REQUIRED, non-nullable string in the wire contract
-- (`nearbyHazardItemSchema`), and every fielded client hard-filters hazards
-- client-side with
--
--     const expiresMs = hazard.expiresAt ? Date.parse(hazard.expiresAt) : 0;
--     if (!expiresMs || expiresMs <= now) return acc;   // useNearbyHazards.ts
--
-- so a NULL (or `'infinity'`, which serialises as the unparseable string
-- "infinity") would make every permanent hazard INVISIBLE on every build in the
-- field — the fleet is v0.2.123. Permanent rows therefore carry a far-future
-- sentinel instead: old clients see a hazard that simply never expires, new
-- clients read `is_permanent` and render the badge. `is_permanent` — not the
-- timestamp — is the source of truth; the sentinel is derived from it and is
-- re-derived on every vote, so the two can never drift.
--
-- WHAT IS DELIBERATELY *NOT* CHANGED
-- ----------------------------------
-- The `score > -3` gate in get_nearby_hazards still applies to permanent
-- hazards. That gate HIDES, it does not expire: it is fully reversible, and a
-- permanent hazard whose score recovers comes straight back. Keeping it means a
-- bogus permanent report is off the map after 3 net downvotes even though it
-- takes 10 to expire it.
--
-- The daily cron's hard-purge of `score <= -3` IS changed (in the API layer,
-- not here) to skip permanent hazards — that DELETE is irreversible and would
-- otherwise be expiry by another name, at a threshold lower than the one the
-- feature promises. Permanent rows still hard-delete via the ordinary 45-day
-- post-expiry grace window once the downvote threshold has expired them.
--
-- Rollback:
--   ALTER TABLE public.hazards DROP COLUMN is_permanent;
--   -- then restore the pre-change bodies. Do NOT re-apply 202604210001 /
--   -- 202605040001 blind: both had drifted from live (45-day guard, and
--   -- get_nearby_hazards was last redefined by 202608270002). The live
--   -- definitions as of 2026-09-02 are recorded in the session scratchpad;
--   -- re-read with pg_get_functiondef before rolling back.
-- ---------------------------------------------------------------------------

-- ── 1. The flag ─────────────────────────────────────────────────────────────

ALTER TABLE public.hazards
  ADD COLUMN IF NOT EXISTS is_permanent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hazards.is_permanent IS
  'Reporter marked this hazard as permanent: it has no TTL, and the only thing '
  'that expires it is reaching hazard_permanent_deny_threshold() downvotes. '
  'Source of truth for permanence — expires_at carries a far-future sentinel '
  'derived from this flag (see migration 202609020001).';

-- ── 2. Tunables, so the threshold and the sentinel live in exactly one place ─

CREATE OR REPLACE FUNCTION public.hazard_permanent_deny_threshold()
RETURNS integer AS $$
  SELECT 10;
$$ LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.hazard_permanent_deny_threshold() IS
  'Downvotes required to expire a permanent hazard. The single tuning point — '
  'the API and the mobile client mirror it as PERMANENT_HAZARD_DENY_THRESHOLD '
  'in packages/core/src/contracts.ts; change both together.';

CREATE OR REPLACE FUNCTION public.hazard_permanent_expiry()
RETURNS timestamptz AS $$
  SELECT now() + interval '100 years';
$$ LANGUAGE sql STABLE SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.hazard_permanent_expiry() IS
  'Far-future sentinel written to hazards.expires_at for permanent hazards. A '
  'real timestamp rather than NULL/infinity because the wire contract requires '
  'a parseable date-time and fielded clients drop anything else.';

-- ── 3. Insert trigger: permanent rows get the sentinel, not a per-type TTL ───
--
-- Unchanged for every other case, including the import pipeline's explicitly
-- supplied expires_at (that still wins — imports never set is_permanent).

CREATE OR REPLACE FUNCTION set_hazard_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    IF coalesce(NEW.is_permanent, false) THEN
      NEW.expires_at := hazard_permanent_expiry();
    ELSE
      NEW.expires_at := now() + hazard_baseline_ttl(NEW.hazard_type);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- ── 4. Vote trigger ─────────────────────────────────────────────────────────
--
-- Base body captured from the LIVE function via pg_get_functiondef, NOT from
-- 202604210001 — the two had drifted: live runs the flip-reversal BEFORE the
-- SELECT, and its resurrection guard is 45 days (widened by 202604210002),
-- where the repo file still says 7. Rewriting from the repo copy would have
-- silently reverted that window. See memory `supabase-rpc-drift`.
--
-- The permanent branch RE-DERIVES expires_at from the current deny_count on
-- every vote rather than mutating it incrementally, which buys three things:
--   * a withdrawn downvote (flip down→up drops deny_count back to 9) brings the
--     hazard back — the rule is a live predicate, not a one-way latch;
--   * it is inherently resurrection-safe, so the 45d stale-vote guard below is
--     not needed here: a stale upvote draining late cannot revive a hazard that
--     is still sitting at 10 downvotes;
--   * LEAST(expires_at, now()) stamps the FIRST crossing and keeps it stable,
--     so later votes cannot keep pushing the row out of the cron's 45-day
--     hard-delete window.

CREATE OR REPLACE FUNCTION extend_hazard_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  v_baseline     interval;
  v_type         text;
  v_expires_at   timestamptz;
  v_is_permanent boolean;
  v_deny_count   integer;
BEGIN
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
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- ── 5. Surface is_permanent through the read path ───────────────────────────
--
-- CREATE OR REPLACE cannot widen a function's RETURNS TABLE, so the old
-- signature is dropped first. Body is otherwise identical to 202605040001 —
-- the `expires_at > now()` gate needs no special case because permanent rows
-- carry the far-future sentinel.

DROP FUNCTION IF EXISTS public.get_nearby_hazards(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER
);

CREATE FUNCTION public.get_nearby_hazards(
  p_user_lat DOUBLE PRECISION,
  p_user_lon DOUBLE PRECISION,
  p_radius_meters DOUBLE PRECISION,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  id UUID,
  location JSONB,
  hazard_type TEXT,
  created_at TIMESTAMPTZ,
  confirm_count INTEGER,
  deny_count INTEGER,
  score INTEGER,
  expires_at TIMESTAMPTZ,
  last_confirmed_at TIMESTAMPTZ,
  description TEXT,
  alert_eligible BOOLEAN,
  import_source TEXT,
  is_permanent BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_point geography;
BEGIN
  v_point := ST_SetSRID(ST_MakePoint(p_user_lon, p_user_lat), 4326)::geography;

  RETURN QUERY
  SELECT
    h.id,
    h.location,
    h.hazard_type,
    h.created_at,
    h.confirm_count,
    h.deny_count,
    h.score,
    h.expires_at,
    h.last_confirmed_at,
    h.description,
    h.alert_eligible,
    h.import_source,
    h.is_permanent
  FROM hazards h
  WHERE h.is_hidden = false
    AND h.expires_at > now()
    AND h.score > -3
    AND h.location IS NOT NULL
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(
        (h.location->>'longitude')::double precision,
        (h.location->>'latitude')::double precision
      ), 4326)::geography,
      v_point,
      p_radius_meters
    )
  ORDER BY h.created_at DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nearby_hazards TO service_role;
GRANT EXECUTE ON FUNCTION public.get_nearby_hazards TO authenticated;
