-- ════════════════════════════════════════════════════════════════════════════
-- 2026-05-10: Deprecate Mia persona / journey columns on `profiles`.
--
-- The multi-level Mia journey was retired in v0.2.43. App code no longer
-- reads or writes `persona`, `mia_journey_level`, `mia_journey_status`,
-- `mia_detection_source`, `mia_journey_started_at`, `mia_journey_completed_at`,
-- `mia_total_rides`, `mia_rides_with_destination`, or `mia_prompt_shown`.
--
-- Columns are NOT dropped here because older app versions in the wild
-- (Open Testing rollout v0.2.31 → v0.2.42) still query against them.
-- Drop in a follow-up migration once Play Store production rollout
-- reaches 100% of v0.2.43+ and observability confirms zero reads.
--
-- `notify_mia` and `mia_journey_events` are intentionally kept active —
-- the surviving notification cron (`/v1/notifications/firstride/evaluate`)
-- still uses `notify_mia` as its opt-in flag, and `mia_journey_events`
-- is preserved as historical analytics data.
-- ════════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN profiles.persona                    IS 'Deprecated 2026-05-10 (v0.2.43). App no longer reads or writes. Drop after Play Store rollout completes.';
COMMENT ON COLUMN profiles.mia_journey_level          IS 'Deprecated 2026-05-10 (v0.2.43). Multi-level Mia journey retired. Drop after rollout completes.';
COMMENT ON COLUMN profiles.mia_journey_status         IS 'Deprecated 2026-05-10 (v0.2.43). Drop after rollout completes.';
COMMENT ON COLUMN profiles.mia_detection_source       IS 'Deprecated 2026-05-10 (v0.2.43). Drop after rollout completes.';
COMMENT ON COLUMN profiles.mia_journey_started_at     IS 'Deprecated 2026-05-10 (v0.2.43). Drop after rollout completes.';
COMMENT ON COLUMN profiles.mia_journey_completed_at   IS 'Deprecated 2026-05-10 (v0.2.43). Drop after rollout completes.';
COMMENT ON COLUMN profiles.mia_total_rides            IS 'Deprecated 2026-05-10 (v0.2.43). Use trip count instead. Drop after rollout completes.';
COMMENT ON COLUMN profiles.mia_rides_with_destination IS 'Deprecated 2026-05-10 (v0.2.43). Drop after rollout completes.';
COMMENT ON COLUMN profiles.mia_prompt_shown           IS 'Deprecated 2026-05-10 (v0.2.43). Mia invitation prompt removed. Drop after rollout completes.';
