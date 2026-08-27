-- ---------------------------------------------------------------------------
-- 202608270002 — hazard import pipeline (docs/plans/hazard-import-pipeline.md)
-- ---------------------------------------------------------------------------
--
-- Bootstraps the hazard layer from external civic-report sources. Production
-- had 11 hazards total, all expired, so the live map showed zero.
--
-- Ships three things:
--   1. Provenance columns + dedup key on `hazards`
--   2. `hazard_import_sources` — the per-source registry (adding a city is an
--      INSERT, not a deploy)
--   3. `hazard_imports` — staging: raw payload, LLM verdict, review state
--   plus a `get_nearby_hazards` rewrite that surfaces `alert_eligible` and
--   `import_source` to the client.
--
-- Depends on 202608270001 (expires_at default dropped) — without it the
-- importer's explicitly-supplied expires_at would still be overridden by the
-- column default and every import would die after 24 h.
-- ---------------------------------------------------------------------------

-- ── 1. Provenance on hazards ───────────────────────────────────────────────
--
-- Deliberately NOT reusing the existing `source` column: it is free text in
-- the DB but typed in core as 'in_ride' | 'manual' | 'armchair'
-- (HazardReportRequest['source']). Widening that union ripples into the mobile
-- picker and the offline queue for no benefit. Imported rows keep
-- source='manual' and carry provenance here.

ALTER TABLE public.hazards
  ADD COLUMN IF NOT EXISTS import_source      text,
  ADD COLUMN IF NOT EXISTS import_external_id text,
  ADD COLUMN IF NOT EXISTS alert_eligible     boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.hazards.import_source IS
  'Registry id of the external source this hazard was imported from '
  '(hazard_import_sources.id). NULL for rider-reported hazards.';
COMMENT ON COLUMN public.hazards.import_external_id IS
  'The source system''s own identifier, e.g. an Open311 service_request_id. '
  'Used for dedup on re-runs and to join status-sync updates.';
COMMENT ON COLUMN public.hazards.alert_eligible IS
  'Whether this hazard may raise a proximity alert during navigation. Rider '
  'reports default true. Imports inherit the source registry flag: sources '
  'whose coordinates are address-geocoded rather than user-pinned ship false '
  'so a bad geocode cannot fire mid-ride haptics. Map rendering ignores this.';

-- Idempotent re-runs: a re-fetched report updates rather than duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS hazards_import_key_uniq
  ON public.hazards (import_source, import_external_id)
  WHERE import_source IS NOT NULL;

-- Rollback / status-sync scans: DELETE FROM hazards WHERE import_source = '...'
CREATE INDEX IF NOT EXISTS hazards_import_source_idx
  ON public.hazards (import_source)
  WHERE import_source IS NOT NULL;

-- ── 2. Source registry ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hazard_import_sources (
  id                   text PRIMARY KEY,
  adapter              text NOT NULL,
  endpoint             text NOT NULL,
  jurisdiction         text,
  country_code         text NOT NULL,
  enabled              boolean NOT NULL DEFAULT false,
  alert_eligible       boolean NOT NULL DEFAULT false,
  coordinate_precision text NOT NULL DEFAULT 'geocoded',
  licence              text NOT NULL,
  attribution_text     text NOT NULL,
  attribution_url      text NOT NULL,
  -- Bounding box the source is allowed to produce coordinates inside.
  -- Defence in depth against a source returning a null-island or
  -- wrong-hemisphere coordinate (see error-log #53 — a stale fix from another
  -- city awarded phantom badges).
  bbox_min_lat         double precision,
  bbox_min_lon         double precision,
  bbox_max_lat         double precision,
  bbox_max_lon         double precision,
  -- Per-type backstop expiry for this source, in days. Municipal reports are
  -- semi-permanent; hazard_baseline_ttl()'s 4h transient TTLs would kill an
  -- import six days before the next weekly run.
  backstop_ttl_days    integer NOT NULL DEFAULT 30,
  cursor               jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_run_at          timestamptz,
  last_ok_at           timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_error           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hazard_import_sources_adapter_check
    CHECK (adapter IN ('open311', 'civia')),
  CONSTRAINT hazard_import_sources_precision_check
    CHECK (coordinate_precision IN ('pin', 'geocoded'))
);

ALTER TABLE public.hazard_import_sources ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only. Anon/authenticated get nothing.
REVOKE ALL ON public.hazard_import_sources FROM anon, authenticated;
GRANT ALL ON public.hazard_import_sources TO service_role;

-- ── 3. Staging table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hazard_imports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      text NOT NULL REFERENCES public.hazard_import_sources(id) ON DELETE CASCADE,
  external_id    text NOT NULL,
  raw            jsonb NOT NULL,
  lat            double precision,
  lon            double precision,
  source_status  text,
  reported_at    timestamptz,
  updated_at_src timestamptz,
  -- Retained for reviewer triage only. Deliberately never surfaced in-app:
  -- street photos routinely contain licence plates and faces, and rehosting
  -- would make us the controller for images we did not take.
  media_url      text,
  mapped_type    text,
  llm_verdict    jsonb,
  review_state   text NOT NULL DEFAULT 'pending',
  reject_reason  text,
  hazard_id      uuid REFERENCES public.hazards(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hazard_imports_source_external_uniq UNIQUE (source_id, external_id),
  CONSTRAINT hazard_imports_review_state_check CHECK (
    review_state IN ('pending', 'auto_approved', 'approved', 'rejected', 'irrelevant')
  )
);

ALTER TABLE public.hazard_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hazard_imports FROM anon, authenticated;
GRANT ALL ON public.hazard_imports TO service_role;

CREATE INDEX IF NOT EXISTS hazard_imports_review_state_idx
  ON public.hazard_imports (review_state) WHERE review_state = 'pending';
CREATE INDEX IF NOT EXISTS hazard_imports_source_idx
  ON public.hazard_imports (source_id, created_at DESC);
-- Status-sync scan: published imports still alive.
CREATE INDEX IF NOT EXISTS hazard_imports_published_idx
  ON public.hazard_imports (source_id, external_id)
  WHERE hazard_id IS NOT NULL;

-- ── 4. Reviewer view ───────────────────────────────────────────────────────
-- The v1 review surface is this view plus an UPDATE. A Diagnostics screen is
-- only worth building if the queue proves to carry real weekly volume.

CREATE OR REPLACE VIEW public.hazard_import_review AS
SELECT
  i.id,
  i.source_id,
  i.external_id,
  i.raw ->> 'service_name'            AS source_category,
  i.raw ->> 'description'             AS source_text,
  i.raw ->> 'address_string'          AS source_address,
  i.lat,
  i.lon,
  i.media_url,
  i.mapped_type,
  i.llm_verdict ->> 'hazard_type'     AS llm_type,
  (i.llm_verdict ->> 'confidence')::numeric AS llm_confidence,
  i.llm_verdict ->> 'summary_en'      AS llm_summary,
  i.llm_verdict ->> 'reason'          AS llm_reason,
  i.review_state,
  i.created_at
FROM public.hazard_imports i
WHERE i.review_state = 'pending'
ORDER BY i.created_at DESC;

REVOKE ALL ON public.hazard_import_review FROM anon, authenticated;
GRANT SELECT ON public.hazard_import_review TO service_role;

-- ── 5. get_nearby_hazards — add alert_eligible + import_source ─────────────
--
-- CRITICAL: the ST_SetSRID(ST_MakePoint(...))::geography expression in the
-- WHERE clause is reproduced BYTE-FOR-BYTE from the live definition (read via
-- pg_get_functiondef 2026-08-27). `idx_hazards_location_geo`
-- (202607070001) is an EXPRESSION GiST index — if this expression changes
-- shape at all, the planner silently stops using it and every navigating
-- rider's 60s poll becomes a sequential scan.
--
-- RETURNS TABLE changes require DROP + CREATE; CREATE OR REPLACE cannot alter
-- a function's return type.

DROP FUNCTION IF EXISTS public.get_nearby_hazards(
  double precision, double precision, double precision, integer
);

CREATE FUNCTION public.get_nearby_hazards(
  p_user_lat DOUBLE PRECISION,
  p_user_lon DOUBLE PRECISION,
  p_radius_meters DOUBLE PRECISION,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  id UUID,
  location JSONB,
  hazard_type TEXT,
  created_at TIMESTAMPTZ,
  confirm_count INTEGER,
  deny_count INTEGER,
  score INTEGER,
  expires_at TIMESTAMPTZ,
  last_confirmed_at TIMESTAMPTZ,
  description TEXT,
  alert_eligible BOOLEAN,
  import_source TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_point geography;
BEGIN
  v_point := ST_SetSRID(ST_MakePoint(p_user_lon, p_user_lat), 4326)::geography;

  RETURN QUERY
  SELECT
    h.id,
    h.location,
    h.hazard_type,
    h.created_at,
    h.confirm_count,
    h.deny_count,
    h.score,
    h.expires_at,
    h.last_confirmed_at,
    h.description,
    h.alert_eligible,
    h.import_source
  FROM hazards h
  WHERE h.is_hidden = false
    AND h.expires_at > now()
    AND h.score > -3
    AND h.location IS NOT NULL
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(
        (h.location->>'longitude')::double precision,
        (h.location->>'latitude')::double precision
      ), 4326)::geography,
      v_point,
      p_radius_meters
    )
  ORDER BY h.created_at DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nearby_hazards TO service_role;
GRANT EXECUTE ON FUNCTION public.get_nearby_hazards TO authenticated;

-- ── 6. Seed: Cologne ───────────────────────────────────────────────────────
--
-- Licence verified 2026-08-27: the "Sag's uns" Anliegenmanagement dataset is
-- published on offenedaten-koeln.de under **Datenlizenz Deutschland – Zero –
-- Version 2.0** (public-domain-equivalent: no attribution obligation, no
-- commercial restriction), and the Open311 API at the endpoint below is a
-- listed resource OF that dataset. The blanket copyright notice in the site
-- impressum covers website content generally, not this released dataset.
-- Attribution is still shown in-app as a courtesy and for rider transparency.
--
-- alert_eligible = true: Open311 coordinates are reporter-pinned (12-decimal
-- values paired with house-number addresses), not address-geocoded.

INSERT INTO public.hazard_import_sources (
  id, adapter, endpoint, jurisdiction, country_code,
  enabled, alert_eligible, coordinate_precision,
  licence, attribution_text, attribution_url,
  bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon,
  backstop_ttl_days
) VALUES (
  'open311:koln',
  'open311',
  'https://sags-uns.stadt-koeln.de/georeport/v2',
  'stadt-koeln.de',
  'DE',
  true,
  true,
  'pin',
  'DL-DE-Zero-2.0',
  'Sag''s uns – Stadt Köln',
  'https://offenedaten-koeln.de/dataset/sags-uns-anliegenmanagement-koeln',
  50.80, 6.75, 51.10, 7.20,   -- Cologne metro bbox
  30
)
ON CONFLICT (id) DO NOTHING;

-- ── 7. civia (Romania) — registered but DISABLED pending consent ───────────
--
-- civia.ro's robots.txt blocks every AI-crawler UA, disallows /api/, sets
-- Content-Signal ai-train=no, and files an explicit EU DSM Art. 4 TDM
-- reservation. A permission email is outstanding.
--
-- Seeded disabled so that granting consent is a one-line config change:
--   UPDATE hazard_import_sources SET enabled = true WHERE id = 'civia';
-- The adapter itself is not implemented yet (adapter='civia' is registered in
-- the CHECK constraint so the row is valid ahead of time).
--
-- alert_eligible = false: civia coordinates are address-geocoded
-- (zoom:16, strada:null), not reporter-pinned. Flip to true only after
-- spot-checking geocodes against reality.

INSERT INTO public.hazard_import_sources (
  id, adapter, endpoint, jurisdiction, country_code,
  enabled, alert_eligible, coordinate_precision,
  licence, attribution_text, attribution_url,
  bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon,
  backstop_ttl_days
) VALUES (
  'civia',
  'civia',
  'https://civia.ro',
  'civia.ro',
  'RO',
  false,
  false,
  'geocoded',
  'PENDING-CONSENT',
  'Civia.ro',
  'https://civia.ro',
  43.60, 20.20, 48.30, 29.75,  -- Romania bbox
  30
)
ON CONFLICT (id) DO NOTHING;
