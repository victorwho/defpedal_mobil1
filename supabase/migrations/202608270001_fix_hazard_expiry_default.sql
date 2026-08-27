-- ---------------------------------------------------------------------------
-- 202608270001 — fix hazards.expires_at: per-type TTL never applied
-- ---------------------------------------------------------------------------
--
-- BUG
-- ---
-- `hazards.expires_at` was created with a column DEFAULT:
--
--     202603010001_base_schema.sql:97
--       expires_at timestamptz default (now() + interval '24 hours')
--
-- and `hazard_set_expiry` (BEFORE INSERT, 202603270001) only assigns the
-- per-type baseline when the value is null:
--
--       IF NEW.expires_at IS NULL THEN
--         NEW.expires_at := now() + hazard_baseline_ttl(NEW.hazard_type);
--       END IF;
--
-- Postgres applies column DEFAULTs *before* BEFORE-INSERT triggers fire, so on
-- any insert that omits the column NEW.expires_at is already populated and the
-- guard never passes. Every hazard has therefore received a flat 24 h TTL since
-- the table was created, and the whole `hazard_baseline_ttl()` table added in
-- 202604210001 / 202604210003 has been dead code.
--
-- EVIDENCE (production, 2026-08-27)
-- ---------------------------------
-- All 11 rows in `hazards` had exactly created_at + 24h, including a `pothole`
-- (baseline 14 days). Confirmed again by live probe inserts:
--     pothole        -> 24.0 h   (expected 336 h)
--     narrow_street  -> 24.0 h   (expected 720 h)
--     poor_surface   -> 24.0 h   (expected   4 h)
--
-- FIX
-- ---
-- Drop the column default. The trigger's IS NULL guard then behaves as
-- designed:
--   * caller omits expires_at        -> per-type hazard_baseline_ttl()
--   * caller supplies expires_at     -> respected verbatim
--
-- The second case is required by the hazard import pipeline
-- (docs/plans/hazard-import-pipeline.md), which derives expiry from the source
-- system's own resolution status rather than from a guessed TTL.
--
-- REJECTED ALTERNATIVES
-- ---------------------
--   * Make the trigger unconditional — would stomp an explicitly supplied
--     expires_at, breaking import status-sync.
--   * Move the per-type expression into the column DEFAULT — impossible;
--     Postgres column defaults cannot reference other columns of the row.
--
-- Rollback:
--   ALTER TABLE public.hazards
--     ALTER COLUMN expires_at SET DEFAULT (now() + interval '24 hours');
-- ---------------------------------------------------------------------------

ALTER TABLE public.hazards ALTER COLUMN expires_at DROP DEFAULT;

COMMENT ON COLUMN public.hazards.expires_at IS
  'Expiry timestamp. Deliberately has NO column default: the hazard_set_expiry '
  'BEFORE INSERT trigger fills it from hazard_baseline_ttl(hazard_type) when '
  'omitted. Re-adding a default would silently disable that trigger again '
  '(migration 202608270001).';
