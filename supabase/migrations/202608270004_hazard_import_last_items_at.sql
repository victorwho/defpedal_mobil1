-- ---------------------------------------------------------------------------
-- 202608270004 — track when a source last actually yielded items
-- ---------------------------------------------------------------------------
--
-- BUG (found while verifying status-sync, 2026-08-27)
-- ---------------------------------------------------
-- The dead-endpoint detector escalated on "this run fetched 0 items", counting
-- it as a source failure and incrementing consecutive_failures. That is a
-- false positive: the cursor advances to `now` when a window is exhausted, so
-- ANY run shortly after a completed one legitimately fetches nothing. A manual
-- re-run, a catch-up run after a truncated one, or simply a quiet interval all
-- tripped it — and two in a row would have thrown a 502 and fired the GCP
-- alert for a perfectly healthy pipeline.
--
-- The genuine dead-endpoint signals are already loud and immediate:
--   * non-JSON response (a migrated Next.js endpoint) -> throws in fetchJson
--   * HTTP error                                      -> throws in fetchJson
-- What those miss is the slow case: an endpoint that keeps returning a valid
-- but permanently empty array. That is a TIME-based condition, not a
-- per-run one.
--
-- FIX
-- ---
-- Record when a source last produced items. Escalate only when a source has
-- yielded nothing for longer than `stale_after_days` (default 8 — one weekly
-- cycle plus margin), which is genuinely anomalous for a city running ~670
-- reports/week, while an empty back-to-back run stays a non-event.
-- ---------------------------------------------------------------------------

ALTER TABLE public.hazard_import_sources
  ADD COLUMN IF NOT EXISTS last_items_at    timestamptz,
  ADD COLUMN IF NOT EXISTS stale_after_days integer NOT NULL DEFAULT 8;

COMMENT ON COLUMN public.hazard_import_sources.last_items_at IS
  'When this source last returned at least one report. Drives the '
  'dead-endpoint detector: an empty run is normal, but a source silent for '
  'longer than stale_after_days is escalated to a run failure.';

COMMENT ON COLUMN public.hazard_import_sources.stale_after_days IS
  'Days a source may yield nothing before a run is treated as failed. Default '
  '8 = one weekly cycle plus margin. Raise for genuinely low-volume sources.';

-- Seed both existing sources so the detector does not fire on the first run
-- after this migration.
UPDATE public.hazard_import_sources
   SET last_items_at = coalesce(last_items_at, last_ok_at, now()),
       consecutive_failures = 0,
       last_error = NULL;
