-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-01: Enable the `civia` hazard-import source.
--
-- The row was seeded DISABLED by 202608270002 with licence='PENDING-CONSENT',
-- because civia.ro's robots.txt carries an EU DSM Art. 4 TDM reservation and
-- `Disallow: /api/`. Consent has now been granted for their PUBLIC pages.
--
-- ⚠️ SCOPE OF CONSENT: public surfaces only — feed.xml, sitemap.xml and
-- /sesizari/<id>. `Disallow: /api/` still stands and the adapter must never
-- reach for /api/*, even though those endpoints exist and return cleaner
-- JSON. If Civia later grants API access, replace the parsing in
-- services/mobile-api/src/lib/imports/adapters/civia.ts — do not widen the
-- scrape.
--
-- alert_eligible STAYS false. Civia's coordinates are address-geocoded, not
-- reporter-pinned — the detail page's map component carries `zoom:16,
-- strada:null` (re-verified live 2026-09-01). These pins may therefore sit a
-- street away from the real defect, which is fine for a map marker and NOT
-- fine for a mid-ride proximity alert. Flip to true only after spot-checking
-- geocodes against reality:
--   UPDATE hazard_import_sources SET alert_eligible = true WHERE id = 'civia';
--
-- Rollback (stops imports; already-published hazards age out via the 30-day
-- backstop TTL and community downvotes):
--   UPDATE hazard_import_sources SET enabled = false WHERE id = 'civia';
-- ════════════════════════════════════════════════════════════════════════════

begin;

UPDATE public.hazard_import_sources
SET
  enabled = true,
  licence = 'Consent granted by civia.ro for public pages (feed.xml, sitemap.xml, /sesizari/<id>); /api/ remains out of scope per robots.txt',
  attribution_text = 'Civia.ro',
  attribution_url = 'https://civia.ro',
  -- Reset the failure counter so a pre-consent probe cannot open the source
  -- already one strike from the circuit breaker.
  consecutive_failures = 0,
  -- Clear any cursor left by an earlier attempt so the adapter starts from
  -- phase 1 (sitemap backfill) rather than resuming a stale position.
  cursor = '{}'::jsonb
WHERE id = 'civia';

commit;
