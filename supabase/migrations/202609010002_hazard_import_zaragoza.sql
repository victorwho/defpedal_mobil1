-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-01: Add Zaragoza as a hazard-import source (Spain).
--
-- Open311 GeoReport v2, so the existing config-driven `open311` adapter serves
-- it — this is a registry row, not new code. Swept and verified live
-- 2026-09-01; see docs/plans/hazard-import-pipeline.md §18.
--
-- ⚠️ ENDPOINT MUST NOT END IN A SLASH and the adapter appends `/requests.json`.
-- The bare `/requests` path returns HTML DOCUMENTATION with HTTP 200 — the
-- "dead endpoints do not 404, they 200 with HTML" trap. The adapter's non-JSON
-- guard catches it, but only the `.json` form actually works.
--
-- ONLY REQUESTS WITH COORDINATES ARE IMPORTED. This needs no configuration:
-- `mapOpen311Request` returns null when lat/long are absent, and the runner has
-- a second `badCoords` gate. Only 46% of Zaragoza requests carry coordinates
-- (93/200 sampled), so expect roughly half the raw volume — the rest are
-- address-only and are dropped, counted, and never published.
--
-- alert_eligible = false, coordinate_precision = 'geocoded'. Zaragoza rows
-- carry `address_id` and `district` alongside lat/long, which reads as
-- address-derived rather than reporter-pinned. Unlike Cologne and Amsterdam
-- (both true/'pin'), start conservative and flip only after spot-checking
-- geocodes against reality:
--   UPDATE hazard_import_sources SET alert_eligible = true WHERE id = 'open311:zaragoza';
--
-- ⚠️ LICENCE IS UNVERIFIED. Zaragoza's open-data terms could not be confirmed:
-- the portal's legal page 404s and the datos.gob.es catalogue returns a null
-- `license` field for its datasets (publisher L01502973). Aragón's regional
-- portal uses CC-BY 4.0 and Spanish municipal portals commonly follow, but
-- "commonly" is not verification. Attribution is rendered either way via
-- HAZARD_IMPORT_SOURCE_DISPLAY. Settle this before any public redistribution
-- of the derived data — the same question §15 raised for Paris's ODbL.
--
-- Rollback (stops imports; published hazards age out via the backstop TTL):
--   UPDATE hazard_import_sources SET enabled = false WHERE id = 'open311:zaragoza';
-- ════════════════════════════════════════════════════════════════════════════

begin;

INSERT INTO public.hazard_import_sources (
  id, adapter, endpoint, jurisdiction, country_code,
  enabled, alert_eligible, coordinate_precision,
  licence, attribution_text, attribution_url,
  bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon,
  backstop_ttl_days
) VALUES (
  'open311:zaragoza',
  'open311',
  'https://www.zaragoza.es/api/recurso/open311',
  'Zaragoza',
  'ES',
  true,
  false,
  'geocoded',
  'UNVERIFIED — portal legal page 404s, datos.gob.es reports null licence; confirm before public redistribution',
  'Ayuntamiento de Zaragoza',
  'https://www.zaragoza.es/sede/portal/datos-abiertos/',
  -- Zaragoza municipality, generously bounded.
  41.55, -1.05, 41.75, -0.75,
  30
)
ON CONFLICT (id) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  endpoint = EXCLUDED.endpoint,
  alert_eligible = EXCLUDED.alert_eligible,
  coordinate_precision = EXCLUDED.coordinate_precision,
  licence = EXCLUDED.licence;

commit;
