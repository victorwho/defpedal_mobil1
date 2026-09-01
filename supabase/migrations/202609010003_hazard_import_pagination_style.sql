-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-01: Per-source Open311 pagination dialect.
--
-- GeoReport v2 does not standardise paging, and the two live implementations
-- disagree (verified 2026-09-01):
--
--   Cologne   `page=N`   honoured.
--   Zaragoza  `page=N`   SILENTLY IGNORED — returns page 1 every time.
--             `start=N`  honoured (Solr-style row offset; start=1000 reaches
--                        2026-08-02, start=5000 returns empty).
--
-- Sending the wrong parameter is not an error, which is what makes it
-- dangerous: the run looks healthy and re-reads the first page until the page
-- cap, importing nothing new and never reaching older data.
--
-- Default 'page' preserves Cologne's behaviour; only Zaragoza is switched.
-- ════════════════════════════════════════════════════════════════════════════

begin;

ALTER TABLE public.hazard_import_sources
  ADD COLUMN IF NOT EXISTS pagination_style text NOT NULL DEFAULT 'page';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hazard_import_sources_pagination_style_check'
  ) THEN
    ALTER TABLE public.hazard_import_sources
      ADD CONSTRAINT hazard_import_sources_pagination_style_check
      CHECK (pagination_style IN ('page', 'offset'));
  END IF;
END $$;

UPDATE public.hazard_import_sources
SET pagination_style = 'offset'
WHERE id = 'open311:zaragoza';

-- Clear the cursor: the failed first run may have left a page position that
-- means nothing under the new dialect.
UPDATE public.hazard_import_sources
SET cursor = '{}'::jsonb, consecutive_failures = 0
WHERE id = 'open311:zaragoza';

COMMENT ON COLUMN public.hazard_import_sources.pagination_style IS
  'Open311 paging dialect: page=N (Cologne) or start=N row offset (Zaragoza). GeoReport v2 does not standardise this.';

commit;
