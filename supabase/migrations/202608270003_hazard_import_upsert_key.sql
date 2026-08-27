-- ---------------------------------------------------------------------------
-- 202608270003 — make the import dedup key usable by ON CONFLICT
-- ---------------------------------------------------------------------------
--
-- BUG (found by the first live Cologne run, 2026-08-27)
-- ----------------------------------------------------
-- 202608270002 created the dedup key as a PARTIAL unique index:
--
--   CREATE UNIQUE INDEX hazards_import_key_uniq
--     ON hazards (import_source, import_external_id)
--     WHERE import_source IS NOT NULL;
--
-- Postgres will only use a partial unique index to resolve
-- `ON CONFLICT (import_source, import_external_id)` if the statement carries a
-- matching WHERE predicate (an "inference predicate"). PostgREST's upsert does
-- not emit one, so every publish failed with:
--
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification
--
-- 125/125 publishes failed on the first run. Staging was unaffected — its key
-- is a plain UNIQUE constraint — so no data was lost, only unpublished.
--
-- FIX
-- ---
-- Use a full (non-partial) unique index. This is safe for rider-reported
-- hazards: they have (NULL, NULL) for these columns, and Postgres unique
-- indexes default to NULLS DISTINCT, so any number of rows may hold
-- (NULL, NULL) without collision. Only genuinely imported rows — which always
-- have both columns populated — are constrained.
--
-- The partial *non-unique* index on import_source is kept: it serves the
-- rollback/status-sync scans and stays small by excluding rider reports.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.hazards_import_key_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS hazards_import_key_uniq
  ON public.hazards (import_source, import_external_id);

COMMENT ON INDEX public.hazards_import_key_uniq IS
  'Dedup key for imported hazards. Deliberately NOT partial: a partial unique '
  'index cannot satisfy PostgREST''s ON CONFLICT inference. Rider-reported '
  'hazards hold (NULL, NULL), which NULLS DISTINCT allows to repeat freely.';
