-- ---------------------------------------------------------------------------
-- 202608270005 — register the Amsterdam "Signalen" import source
-- ---------------------------------------------------------------------------
--
-- Second live source after Cologne. Amsterdam is arguably the highest-value
-- cycling city in the 31 supported countries, and its municipal reporting
-- platform is far more road-focused than Cologne's: roughly 1,800 of a
-- 4,000-feature sample are road/traffic categories (vs Cologne's ~32%),
-- including a dedicated `onderhoud-fietspad` (cycle-path maintenance) class.
--
-- Verified live 2026-08-27: newest feature timestamped 2026-08-27T11:28, i.e.
-- minutes old. Endpoint:
--   GET /signals/v1/public/signals/geography?bbox=minLon,minLat,maxLon,maxLat
--
-- Why the adapter is 'signalen' and not 'amsterdam': Signalen
-- (https://signalen.org) is open-source and shared by several Dutch
-- municipalities, so the adapter is reusable — a second Dutch city should be a
-- registry row, not new code.
--
-- alert_eligible = true: coordinates are reporter-placed map pins at ~9
-- decimal places, not address-geocoded centroids. If the first batch looks
-- misplaced on the map, one statement demotes it to map-only:
--   UPDATE hazard_import_sources SET alert_eligible = false
--    WHERE id = 'signalen:amsterdam';
--
-- LICENCE: NOT YET CONFIRMED, so this row ships DISABLED. Amsterdam is an
-- established open-data publisher and the endpoint is explicitly namespaced
-- `/public/`, but "publicly reachable" is not a licence grant. Enable only
-- after confirming terms:
--   UPDATE hazard_import_sources SET enabled = true, licence = '<confirmed>'
--    WHERE id = 'signalen:amsterdam';
-- ---------------------------------------------------------------------------

-- 1. Allow the new adapter value.
ALTER TABLE public.hazard_import_sources
  DROP CONSTRAINT IF EXISTS hazard_import_sources_adapter_check;

ALTER TABLE public.hazard_import_sources
  ADD CONSTRAINT hazard_import_sources_adapter_check
  CHECK (adapter IN ('open311', 'civia', 'signalen'));

-- 2. Seed Amsterdam.
--
-- backstop_ttl_days = 21: this feed has NO status field, so expiry is TTL-only
-- with no way to learn that the city fixed something. Shorter than Cologne's
-- 30 (which does get status-sync) so a repaired surface stops being advertised
-- sooner. Community downvotes remain the other correction path.
--
-- bbox covers the municipality generously; the adapter quadtree-subdivides it
-- because Signalen caps every response at 4,000 features with no paging.
INSERT INTO public.hazard_import_sources (
  id, adapter, endpoint, jurisdiction, country_code,
  enabled, alert_eligible, coordinate_precision,
  licence, attribution_text, attribution_url,
  bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon,
  backstop_ttl_days, stale_after_days
) VALUES (
  'signalen:amsterdam',
  'signalen',
  'https://api.meldingen.amsterdam.nl',
  'amsterdam.nl',
  'NL',
  false,                      -- pending licence confirmation
  true,
  'pin',
  'PENDING-CONFIRMATION',
  'Meldingen — Gemeente Amsterdam',
  'https://meldingen.amsterdam.nl',
  52.28, 4.72, 52.43, 5.07,   -- Amsterdam municipality
  21,
  8
)
ON CONFLICT (id) DO NOTHING;
