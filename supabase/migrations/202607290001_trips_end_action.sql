-- GPS audit 2026-07-29: explicit end-action discriminator + stale-trip
-- reaper marker on trips.
--
-- Why: "ended, no track" rows conflate three very different things —
-- deliberate in-ride discards, resume-prompt discards, and genuinely lost
-- rides — which made every "are trips being tracked?" investigation start
-- from scratch (see docs/reviews/gps-tracking-audit-2026-07-29.md). The
-- client now stamps how the ride ended; the daily cron (piggybacked on
-- POST /v1/hazards/expire) stamps 'abandoned' on trips whose trip_end never
-- arrived (>48h in_progress), leaving ended_at NULL so duration analytics
-- never see a fake multi-hour "ride". A genuinely late trip_end from a
-- returning device overwrites the stamp (finishTripRecord always writes
-- end_action).
--
-- Values:
--   saved            — in-ride End Ride → Save (and arrival auto-complete)
--   discarded        — in-ride End Ride → Discard
--   prompt_saved     — resume prompt → "Save ride"
--   prompt_discarded — resume prompt → "Discard ride"
--   auto_recovered   — resume guard auto close-out (cached route missing)
--   abandoned        — server reaper: trip_end never arrived (ended_at NULL)
--   NULL             — ended by a pre-endAction client, or still in progress
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS end_action text
  CHECK (end_action IS NULL OR end_action IN (
    'saved',
    'discarded',
    'prompt_saved',
    'prompt_discarded',
    'auto_recovered',
    'abandoned'
  ));

COMMENT ON COLUMN public.trips.end_action IS
  'How the ride end was triggered: saved/discarded (in-ride End Ride), prompt_saved/prompt_discarded (resume prompt), auto_recovered (resume-guard auto close), abandoned (stale-trip reaper — trip_end never arrived, ended_at stays NULL). NULL = pre-endAction client or still in progress.';
