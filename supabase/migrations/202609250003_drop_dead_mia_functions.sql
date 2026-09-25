-- Drop the two dead Mia SECURITY DEFINER functions.
--
-- Found by the 2026-09-25 external-review triage as part of P0-1
-- (docs/plans/external-review-triage-2026-09-25.md).
--
-- The Mia Persona Journey was RETIRED in v0.2.43 (2026-05-10):
-- `services/mobile-api/src/routes/mia.ts` was deleted, the
-- `/v1/mia/detection/evaluate` endpoint is gone, and the `mia-detection-cron`
-- Cloud Scheduler job was deleted (see .claude/CLAUDE.md
-- "Mia Persona Journey RETIRED"). These two functions outlived all of that and
-- were still EXECUTE-able by `anon` -- dead code that was also live attack
-- surface.
--
-- Verified safe before dropping: a catalog scan of every SECURITY DEFINER
-- function body in `public` found ZERO references to either name
-- (`prosrc ILIKE '%evaluate_mia_detection%'` / `%evaluate_mia_level_up%` were
-- false for all of them), so no other function or trigger calls them.
--
-- Separated from 202609250002 deliberately: that migration only changes
-- privileges and is trivially revertible, whereas this one removes objects.
-- The definitions remain recoverable from the migration history if ever needed
-- (202604150001 and the Mia-era migrations).
--
-- NOTE: the deprecated `mia_*` COLUMNS on `profiles` and the `mia_journey_events`
-- / `mia_detection_signals` TABLES are deliberately NOT touched here -- dropping
-- those is a separate data decision already noted in CLAUDE.md as a follow-up
-- after Play rollout reaches 100% of v0.2.43+.

DROP FUNCTION IF EXISTS public.evaluate_mia_detection(uuid);
DROP FUNCTION IF EXISTS public.evaluate_mia_level_up(uuid, numeric, boolean);
