-- ---------------------------------------------------------------------------
-- 202610130001 — register the FixMyStreet (UK) import source
-- ---------------------------------------------------------------------------
--
-- FixMyStreet (mySociety) takes street-problem reports for every UK council
-- and publishes them through a public Open311 feed:
--   GET https://www.fixmystreet.com/open311/v2/requests.json
--       ?jurisdiction_id=fixmystreet&start_date=..&end_date=..
--
-- Measured 2026-10-12/13 over two months (193,988 reports): ~3,100 reports a
-- day UK-wide, of which the category rules publish ~1,300 a week directly
-- (road potholes and surface defects) and send ~930 a week to the model.
-- Councils that close reports close 76% of relevant ones within 4 weeks, so
-- closures drive expiry; see adapters/fixmystreet.ts and mappings/fixmystreet.ts.
--
-- LICENCE: NOT CONFIRMED. The feed's documentation states no licence or reuse
-- terms. Enabled by explicit product-owner direction on 2026-10-13, after the
-- gap was raised — recorded as an override, not a licence, so nobody later
-- mistakes it for settled (same convention as signalen:amsterdam). If mySociety
-- objects, rollback is:
--   UPDATE hazard_import_sources SET enabled = false WHERE id = 'fixmystreet:uk';
--   DELETE FROM hazards WHERE import_source = 'fixmystreet:uk';
--
-- alert_eligible = true: reporters place the pin on a map (coordinate
-- precision 'pin'), as for Cologne and Amsterdam.
--
-- This row ships DISABLED: the API must be deployed first, because the adapter
-- name is unknown to older revisions and the runner fails a source loudly when
-- its adapter is missing. Enable after the deploy:
--   UPDATE hazard_import_sources SET enabled = true WHERE id = 'fixmystreet:uk';
-- ---------------------------------------------------------------------------

-- 1. Allow the new adapter value.
ALTER TABLE public.hazard_import_sources
  DROP CONSTRAINT IF EXISTS hazard_import_sources_adapter_check;

ALTER TABLE public.hazard_import_sources
  ADD CONSTRAINT hazard_import_sources_adapter_check
  CHECK (adapter IN ('open311', 'civia', 'signalen', 'fixmystreet'));

-- 2. Seed FixMyStreet.
--
-- backstop_ttl_days = 28 applies only to a report with no usable date; every
-- other report gets a per-report expiry from its report date (8 weeks at
-- councils that close reports, 4 weeks elsewhere).
--
-- bbox: the United Kingdom including Northern Ireland and Shetland.
--
-- stale_after_days = 3: the feed carries thousands of reports a day, so three
-- days of nothing means the endpoint changed, not that the UK went quiet.
INSERT INTO public.hazard_import_sources (
  id, adapter, endpoint, jurisdiction, country_code,
  enabled, alert_eligible, coordinate_precision,
  licence, attribution_text, attribution_url,
  bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon,
  backstop_ttl_days, stale_after_days
) VALUES (
  'fixmystreet:uk',
  'fixmystreet',
  'https://www.fixmystreet.com/open311/v2',
  'fixmystreet',
  'GB',
  false,
  true,
  'pin',
  'UNCONFIRMED-OWNER-OVERRIDE-2026-10-13',
  'FixMyStreet',
  'https://www.fixmystreet.com',
  49.8, -8.7, 60.9, 1.8,
  28,
  3
)
ON CONFLICT (id) DO NOTHING;
