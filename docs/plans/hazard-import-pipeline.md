# Hazard Import Pipeline — external civic-report ingestion

**Status:** IMPLEMENTED (Cologne). Migrations live, code merged-ready, first
backfill run against production. Cloud Run deploy + Cloud Scheduler job NOT yet
created — see §13.
**Created:** 2026-08-27
**Last run:** 2026-08-27 — 155 Cologne hazards live, 0 pending review.
**Goal:** bootstrap the hazard layer from external civic-report sources, so the map is not empty and the community-reporting flywheel has something to start from.

---

## 0. Why this exists

Production has **11 hazards total, all expired** (newest `expires_at` 2026-08-24). The live hazard map shows **zero**. This is not "augment hazard data" — it is "bootstrap the layer".

Verified 2026-08-27 via PostgREST against `uobubaulcdcuggnetzei`.

---

## 1. Decision record

| # | Decision | Chosen |
|---|---|---|
| 1 | Legal posture | Email operators first; build only against sources needing no permission until replies land |
| 2 | bucuresti.help | Permission-gated — their API if granted, **drop** if declined/no reply in 2 weeks |
| 3 | `expires_at` bug | Fix **first**, as its own migration + deploy |
| 4 | Architecture | Open311 primary (config-driven adapter), civia as a bespoke adapter |
| 5 | Expiry model | Source status-sync primary, per-type TTL as backstop |
| 6 | LLM role | Deterministic `service_code` map first; LLM only for free text |
| 7 | Runtime | Cloud Run endpoint + Cloud Scheduler, **cursor-based** |
| 8 | Attribution | Per-source licence field + visible in-app credit |
| 9 | Schema | Staging table + `import_source`/`import_external_id` + unique index |
| 10 | v1 sources | Cologne + civia, plus a discovery probe of EU Open311 endpoints |
| 11 | Description | One EN summary in `hazards.description`; raw text kept in staging |
| 12 | Review gate | Tiered — allowlisted categories auto-publish, rest queued |
| 13 | Photos | Not surfaced in v1; `media_url` kept in staging for reviewer triage |
| 14 | Backfill | Go-forward with a ~30-day lookback |
| 15 | Success metric | Engagement (votes + sheet opens) on imports at 6 weeks |
| 16 | Alert eligibility | **Per-source flag.** Cologne `true`, civia `false` until geocodes verified |
| 17 | LLM config | `OPENAI_API_KEY` as an **optional** Cloud Run env var; small model + structured outputs |
| 18 | Sequencing | TTL fix → emails → Cologne → civia |

---

## 2. Evidence gathered (2026-08-27)

### 2.1 Cologne Open311 — the primary source

`https://sags-uns.stadt-koeln.de/georeport/v2/requests.json` — **live, paginated**.

```json
{ "service_request_id": "12504-2026",
  "lat": 50.856229364647, "long": 6.9741779565811,
  "address_string": "50997 Köln - Godorf, Amselweg 3",
  "service_name": "Defekte Oberfläche", "service_code": "3.2",
  "requested_datetime": "2026-05-29T08:29:06+02:00",
  "updated_datetime":  "2026-06-29T15:27:02+02:00",
  "status": "closed",
  "media_url": "https://sags-uns.stadt-koeln.de/system/files/2026-05/IMG_6281.jpeg" }
```

Native `lat`/`long`, native `status`, photos, stable `service_code` taxonomy. `?start_date=&end_date=&page=N` works; pages are disjoint and time-ordered, and `service_request_id` increments +100/page — a clean cursor.

**Volume:** ~100 reports per ~25 h ⇒ **~670/week**. Cycling-relevant share measured at **32%** on the 2026-08-18→19 window ⇒ **~215 relevant/week**.

Cycling-relevant categories observed: `Defekte Oberfläche`, `Straßenbaustellen`, `Gully verstopft`, `Umlaufsperren / Drängelgitter`, `Radfahrerampel defekt`, `Fußgängerampel defekt`, `Kfz-Ampel defekt`, `Zu lange Rotzeit`, `Straßenmarkierung`, `Defekte Verkehrszeichen`.

Non-relevant (must be excluded): `Wilder Müll`, `Schrott-Kfz`, `Schrottfahrräder`, `Kölner Grün`, `Graffiti`, `Altkleidercontainer-Standort vermüllt`, `Brunnen`.

### 2.2 civia.ro — the Romanian source

- `/feed.xml` — RSS, **50 items**, ~4.2/day nationwide (~29/week), **66% Bucharest**. Carries title, link, `guid`, `pubDate`, `<category>`, and a description prefixed with status (`[INREGISTRATA]`, `[TRIMIS]`) and suffixed with an address string. **No coordinates.**
- `/sesizari/NNNNN` detail pages **do** carry coords, inside the RSC flight payload: `"coords":[44.4082779,26.1217357]` with `zoom:16`, `strada:null` — consistent with **geocoded-from-address**, not a user pin. Hence `alert_eligible = false` initially.
- `/sesizari-rezolvate` exists ⇒ a resolution signal is available.
- ~268 reports total since 2026-04-06.
- Categories seen (n=50): `stalpisori` 14, `gunoi` 6, `altele` 5, `parcare` 4, `ocupare_domeniu` 4, `groapa` 4, `spatiu_verde` 3, `mediu` 3, `trecere_pietoni` 2, `transport` 2, `semafor` 1, `mobilier` 1, `iluminat` 1.

**robots.txt constraints:** `Disallow: /api/`; all major AI crawler UAs blocked (GPTBot, ClaudeBot, CCBot, Google-Extended, Applebot-Extended, Bytespider, meta-externalagent, Amazonbot); `Content-Signal: search=yes,ai-train=no,use=reference`; explicit **EU DSM Art. 4 TDM reservation**. → permission email required before build.

### 2.3 bucuresti.help

`/map` is fully client-rendered; all data behind `/api/`, which their robots.txt disallows, as are `/report/` pages. **No compliant public surface.** Permission-gated.

### 2.4 Rejected alternatives (measured, not assumed)

- **OSM/Overpass** — Bucharest: 221 `highway=construction` ways, 1,457 bad-surface ways, 1,878 barrier nodes, 296 cycleways. **Rejected: already ingested.** `C:\dev\OSRM_Server\bicycle19.lua` scores surface, `surface:condition=damaged`, `metal_grid`, unpaved etc. into `raw_risk` → `road_risk_data` (67.9M segments, live EU-wide). Importing as markers double-counts and would bury the community layer.
- **data.gov.ro** — CKAN API returns **1** result for `sesizari` (unrelated) and no pothole/complaint/works dataset. **Dead end.**
- **Open311 endpoint rot** — of 7 published German endpoints, **only Cologne lives**. Bonn, Gießen, Siegburg, Brühl migrated to Next.js apps and dropped the API; Annaberg-Buchholz, Turku, Helsinki unreachable. Sources are perishable — the registry must health-check.

### 2.5 Leads not yet probed

- **BikeMaps.org** — cycling-native (collisions, near-misses, hazards), global. All guessed API paths 404. Needs an email, not a scraper.
- **DATEX II / EU National Access Points** — EU ITS Directive mandates every member state publish roadworks + incidents in a standard format. Covers 27 of 31 countries legally and free. Motorway-biased; cycling yield unknown. **Highest-upside unknown.**

---

## 3. Phase 0 — fix the `expires_at` bug (ships alone, first)

### The bug

`hazards.expires_at` has column `DEFAULT (now() + interval '24 hours')` (`202603010001_base_schema.sql:97`). The `hazard_set_expiry` BEFORE-INSERT trigger only assigns a per-type TTL `IF NEW.expires_at IS NULL`. **Postgres applies column defaults before BEFORE-INSERT triggers**, so that branch never runs.

**Result:** every hazard gets exactly 24 h regardless of type. The entire `hazard_baseline_ttl()` table in `202604210001_hazard_score_index.sql` is dead code.

**Empirically confirmed:** all 11 production rows are exactly `created_at + 24h`, including a `pothole` that should live 14 days.

### The fix

```sql
-- supabase/migrations/2026XXXX0001_fix_hazard_expiry_default.sql
ALTER TABLE public.hazards ALTER COLUMN expires_at DROP DEFAULT;
```

The trigger's `IS NULL` guard then works as designed:
- omitted → per-type `hazard_baseline_ttl()`
- explicitly supplied (the importer) → respected

Do **not** make the trigger unconditional — that would stomp the importer's status-sync-derived expiry. Do **not** try a per-type column default — Postgres column defaults cannot reference other columns of the row.

### Verification (required before moving on)

Apply by hand via the Management API (`supabase db push` is unusable — history diverged). Then insert one row per `hazard_type` and assert `expires_at - created_at` matches `hazard_baseline_ttl()`; delete the probes. Per error-prevention rule #25, a migration file is not evidence the change is live.

Also re-check `apps/mobile` and any test asserting 24 h expiry.

---

## 4. Phase 1 — permission emails (day one, parallel to everything)

Send on the same day the TTL fix ships, so replies arrive during the build.

| Recipient | Ask | If declined / no reply in 14 days |
|---|---|---|
| civia.ro | Permission to ingest sesizări (offer reciprocal attribution + a link back); ask about API access and licence terms | Do **not** build the adapter. Re-evaluate. |
| bucuresti.help | API access | **Drop from scope.** No headless-browser fallback. |
| BikeMaps.org | Data access / API docs for EU reports | Park as a future adapter. |

Frame honestly: a cycling-safety app that wants to surface their reports to riders, with credit and a link back. All three are aligned civic projects; the downside of asking is a fortnight, the downside of not asking is reputational in a small scene.

**Cologne needs no email** — public municipal open data, but **confirm the licence** (the portal references CC BY 4.0) and record it in the registry before enabling.

---

## 5. Phase 2 — schema

### 5.1 Columns on `hazards`

```sql
ALTER TABLE public.hazards
  ADD COLUMN IF NOT EXISTS import_source      text,
  ADD COLUMN IF NOT EXISTS import_external_id text,
  ADD COLUMN IF NOT EXISTS alert_eligible     boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS hazards_import_key_uniq
  ON public.hazards (import_source, import_external_id)
  WHERE import_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS hazards_import_source_idx
  ON public.hazards (import_source) WHERE import_source IS NOT NULL;
```

Do **not** overload the existing `source` column — it is free-text with no CHECK but is typed in core as `'in_ride' | 'manual' | 'armchair'` (`packages/core/src/contracts.ts`, `HazardReportRequest['source']`). Widening that union ripples into the mobile picker and the offline queue. Imported rows keep `source = 'manual'` (or a new `'import'` member if the union is widened deliberately) and carry provenance in the new columns.

Rollback for the whole experiment is then one statement: `DELETE FROM hazards WHERE import_source IS NOT NULL;`

### 5.2 Source registry

```sql
CREATE TABLE public.hazard_import_sources (
  id                   text PRIMARY KEY,           -- 'open311:koln', 'civia'
  adapter              text NOT NULL,              -- 'open311' | 'civia'
  endpoint             text NOT NULL,
  jurisdiction         text,
  country_code         text NOT NULL,              -- must be in the 31 supported
  enabled              boolean NOT NULL DEFAULT false,
  alert_eligible       boolean NOT NULL DEFAULT false,
  coordinate_precision text NOT NULL,              -- 'pin' | 'geocoded'
  licence              text NOT NULL,              -- 'CC-BY-4.0', ...
  attribution_text     text NOT NULL,              -- 'Sags uns Köln'
  attribution_url      text NOT NULL,
  cursor               jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_run_at          timestamptz,
  last_ok_at           timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hazard_import_sources ENABLE ROW LEVEL SECURITY;
-- service-role only; no policies.
```

Adding a city is an INSERT, not a code change. `enabled = false` until licence is confirmed. `consecutive_failures` drives the health check that catches endpoint rot.

### 5.3 Staging table

```sql
CREATE TABLE public.hazard_imports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      text NOT NULL REFERENCES public.hazard_import_sources(id),
  external_id    text NOT NULL,
  raw            jsonb NOT NULL,          -- verbatim source payload
  lat            double precision,
  lon            double precision,
  source_status  text,                    -- 'open' | 'closed' | civia status
  reported_at    timestamptz,
  updated_at_src timestamptz,
  media_url      text,                    -- retained for reviewer triage only
  mapped_type    text,                    -- deterministic service_code -> hazard_type
  llm_verdict    jsonb,                   -- {relevant, hazard_type, confidence, summary_en, reason}
  review_state   text NOT NULL DEFAULT 'pending',
      -- 'pending' | 'auto_approved' | 'approved' | 'rejected' | 'irrelevant'
  hazard_id      uuid REFERENCES public.hazards(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id)
);
ALTER TABLE public.hazard_imports ENABLE ROW LEVEL SECURITY;
-- service-role only.
```

`UNIQUE (source_id, external_id)` makes re-runs idempotent at the *staging* layer, so a re-fetched item is never re-sent to the LLM.

### 5.4 RPC change for `alert_eligible`

`get_nearby_hazards` must return `alert_eligible` so the client can gate proximity alerts. **Critical:** the `ST_SetSRID(ST_MakePoint(...))::geography` expression in the WHERE clause must keep its **exact current shape** — `idx_hazards_location_geo` is an expression GiST index and the planner stops using it if the expression changes (`202607070001_spatial_indexes_trips_hazards.sql`). Add the column to the `RETURNS TABLE` and the SELECT list only.

Downstream, per Gotcha #9 (Fastify strips unknown response fields):
- add `alertEligible` to `hazardSchemas.ts`
- add to `NearbyHazard` in `packages/core/src/contracts.ts`
- gate the proximity-alert stack (not the map layer) on it in the mobile client

---

## 6. Phase 3 — adapters

```ts
interface HazardSourceAdapter {
  readonly id: string;
  fetchPage(cursor: Cursor, signal: AbortSignal): Promise<{
    items: RawReport[];
    nextCursor: Cursor | null;
  }>;
  fetchStatuses(externalIds: string[]): Promise<Map<string, SourceStatus>>;
}
```

### 6.1 `open311` adapter (config-driven)

- `GET {endpoint}/requests.json?start_date=&end_date=&page=N`
- Cursor: `{ lastRequestedDatetime, lastServiceRequestId, page }`
- First run: 30-day lookback. Subsequent: since `last_ok_at`.
- Stop when a page returns `< 100` rows or crosses `end_date`.
- Reject rows with missing/zero `lat`/`long`, or coordinates outside the source's country bbox (reuse `COUNTRY_BBOXES` from `packages/core/src/countryCoverage.ts`).

Adding any surviving EU Open311 city = one registry row.

### 6.2 `civia` adapter (bespoke, gated on permission)

- `GET /feed.xml` → 50 items. Parse `guid` → external id (`00268`), `<category>`, `<pubDate>`, and split `<description>` on ` — ` into body + address.
- Strip the `[STATUS]` prefix → `source_status`.
- For each **new** id, `GET /sesizari/NNNNN`, extract `"coords":[lat,lon]` from the RSC payload. **Brittle by nature** — an RSC format change breaks it, so failure must be loud (see §9), never a silent zero-result run.
- Identify honestly: UA `DefensivePedalBot/1.0 (+https://defensivepedal.com/bot; contact@...)`, ≥2 s between detail fetches, respect `/api/` disallow.
- **RSS holds only ~12 days.** A weekly cadence has margin; two consecutive missed runs lose data. The health check must treat a skipped run as an incident.

---

## 7. Phase 4 — classification

### 7.1 Deterministic first

A reviewed `service_code → hazard_type` table per source, stored in the repo (not the DB) so it is code-reviewed and diffable:

```ts
// services/mobile-api/src/lib/imports/mappings/koln.ts
export const KOLN_MAP: Record<string, HazardType | 'irrelevant' | 'llm'> = {
  'Defekte Oberfläche':              'poor_surface',
  'Gully verstopft':                 'poor_surface',
  'Straßenbaustellen':               'construction',
  'Umlaufsperren / Drängelgitter':   'narrow_street',
  'Radfahrerampel defekt':           'dangerous_intersection',
  'Fußgängerampel defekt':           'dangerous_intersection',
  'Kfz-Ampel defekt':                'dangerous_intersection',
  'Zu lange Rotzeit':                'irrelevant',
  'Wilder Müll':                     'irrelevant',
  'Schrott-Kfz':                     'irrelevant',
  'Schrottfahrräder':                'irrelevant',
  'Kölner Grün':                     'irrelevant',
  'Graffiti':                        'irrelevant',
  // generic buckets -> let the LLM read the text
  'Sonstiges':                       'llm',
};
```

Three outcomes: a `HazardType` (auto-publish candidate), `'irrelevant'` (dropped before the LLM — saves cost and review time), or `'llm'` (needs free-text reading).

`hazard_type` values must be in the DB CHECK list: `illegally_parked_car`, `blocked_bike_lane`, `missing_bike_lane`, `pothole`, `poor_surface`, `narrow_street`, `dangerous_intersection`, `construction`, `aggressive_traffic`, `aggro_dogs`, `other`.

### 7.2 LLM, narrowly scoped

Runs **only** on `'llm'`-mapped items and on mapped items whose text may contradict the category. Structured outputs against a JSON schema — never free-form:

```jsonc
{ "relevant": true,
  "hazard_type": "poor_surface",
  "confidence": 0.0,          // 0..1
  "summary_en": "",           // <=280 chars, neutral, no source branding
  "reason": "" }              // one line, for the reviewer
```

Hard rules:
- **The model never produces coordinates.** Coordinates come only from the source.
- The model never chooses `expires_at`.
- Output `hazard_type` is validated against the CHECK list; anything else → `pending`.
- Input is title + description + category + address only. No photos in v1.
- On API error/timeout, the item lands `pending` — never dropped, never auto-published.

`OPENAI_API_KEY` is an **optional** var in `validateConfig()`. Missing key ⇒ imports disabled with a structured log; it must **never** `exit(1)` and take the API down — required vars do that, and hazard imports are not required for the app to serve riders.

### 7.3 Review routing

| Condition | Route |
|---|---|
| Deterministic map → concrete `hazard_type`, source allowlisted | `auto_approved` → publish |
| Deterministic map → `'irrelevant'` | `irrelevant`, never published, counted |
| LLM `relevant && confidence >= threshold` | `auto_approved` → publish |
| LLM low confidence, or type not in CHECK list, or LLM errored | `pending` → review queue |

Expected steady state: the large majority of Cologne auto-approves (its categories are unambiguous), leaving a handful of genuinely uncertain items per week. **The allowlist is what gets reviewed — once, in code review — not the weekly stream.**

Review surface: start with a SQL view + `UPDATE ... SET review_state='approved'`. Promote to a Diagnostics screen only if the queue proves to have real weekly volume.

---

## 8. Phase 5 — publish, status-sync, expiry

### 8.1 Publish

Write via `submitHazardReport(req, null)` or directly to the table. **Do not** loop through `POST /v1/hazards` with a service account: every side effect there is gated on `if (user?.id)` (`v1.ts:843-866`) — XP `award_xp`, `qualifyStreakAsync`, `fireP0Event('post_hazard_thanks')`, and `autoPublishHazardStandalone` to the social feed. `user_id = NULL` correctly suppresses all four. A service user would re-enable them and spam the activity feed with hazards nobody reported.

Set on insert: `location` jsonb `{latitude, longitude}` (the shape the RPC and the GiST index expect), `hazard_type`, `description` = `summary_en`, `import_source`, `import_external_id`, `alert_eligible` from the registry, and an explicit `expires_at`.

### 8.2 Status-sync — the real expiry signal

Each run, for every published import still `expires_at > now()`, re-fetch source status:
- source says **closed/resolved** → `UPDATE hazards SET expires_at = now()`
- source still **open** → extend to `now() + backstop_ttl`
- source **no longer returns the id** → let the backstop TTL run out (do not resurrect)

This is strictly better than a guessed TTL: you learn when the pothole is actually fixed. It is the single strongest argument for Open311 over civia.

### 8.3 Backstop TTL

Generous per-type (weeks, not `hazard_baseline_ttl`'s hours) so a dead source can never strand a permanent phantom hazard. Municipal reports are semi-permanent by nature — a 4 h `poor_surface` TTL would kill every import six days before the next weekly run.

### 8.4 Community interaction

Imported hazards participate normally in voting. Downvotes halve remaining lifetime; `score <= -3` hides them from `get_nearby_hazards` and the daily expire cron purges them after 24 h. **The community can self-clean bad imports without any new mechanism** — this is the mitigation for the geocode-accuracy risk on alert-eligible sources.

---

## 9. Phase 6 — cron, monitoring, attribution

### 9.1 Endpoint

`POST /v1/imports/run` behind `verifyCronAuth` (Bearer `CRON_SECRET`), matching the 14 existing jobs. Cloud Scheduler weekly.

**Cursor-based from day one** (error-log #82): the attempt deadline is 300 s, and a cron that times out is *truncated, not just slow* — without a cursor it re-grinds the same prefix every run and the tail is never processed, silently, because it still writes rows before dying. Persist `cursor` per source after **every page**, not at the end of the run.

Round-trip budget: Supabase is `us-east-1`, Cloud Run `europe-central2` (~100 ms each). Batch staging upserts with chunked `in (...)`; do not do per-item round-trips.

### 9.2 Failure surfacing

The existing GCP *Cloud Scheduler job failed* policy (`10278737109769293908`) covers all jobs, so a hard failure already alerts. It does **not** catch the dangerous case: a run that succeeds while importing **zero** items because a source silently changed shape (civia's RSC payload is exactly this risk).

Therefore the endpoint must **throw** — not warn — when:
- an enabled source returns 0 items two runs running, or
- `consecutive_failures >= 2`, or
- a run is skipped such that civia's 50-item RSS window (~12 days) could have rolled

Log every drop reason with counts (`irrelevant`, `bad_coords`, `out_of_country`, `llm_error`, `duplicate`). Per error-prevention guidance, silent truncation reads as "covered everything" when it didn't.

### 9.3 Attribution (licence condition, not courtesy)

`HazardDetailSheet` shows a small "Reported via {attribution_text}" line, linked to `attribution_url`, **only** when `import_source is not null`. This satisfies CC BY, is honest to riders about provenance, and is goodwill toward the projects being emailed. A source whose licence cannot be confirmed stays `enabled = false`.

---

## 10. Success criteria (decide at 6 weeks)

**Keep** if imported hazards receive community votes at a rate comparable to rider-reported ones, and riders open their detail sheets.
**Kill** if they are ignored — that means a populated map does not prime the flywheel and the maintenance is not worth it.

Instrument in PostHog: hazard-sheet opens and vote events, **split by `import_source`**. Baseline is rider-reported hazards over the same window.

Secondary guardrail: imports' downvote rate vs rider-reported baseline — this directly tests the geocode-accuracy risk accepted by making Cologne alert-eligible.

**Kill switch:** `UPDATE hazard_import_sources SET enabled = false;` stops ingestion. `DELETE FROM hazards WHERE import_source IS NOT NULL;` removes every trace.

---

## 11. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| civia declines permission | Med | Cologne carries v1 alone; nothing is blocked on the reply |
| civia RSC payload changes | Med | Adapter fails loudly (§9.2); coords are the only thing needing it |
| Open311 endpoint dies | Med | Measured: 6/7 already have. `consecutive_failures` + health check |
| Alert-eligible import at a bad geocode | **High** | Per-source flag; civia starts map-only; community downvotes halve TTL |
| LLM misclassifies | Med | Deterministic map carries the bulk; low confidence → review; type validated against CHECK |
| Imports drown rider reports | Low | ~215/wk across a city is sparse on a map; monitor the vote-rate split |
| Weekly run misses civia's 12-day window | Med | Treat a skipped run as an incident, not a warning |
| First LLM dependency destabilises the API | Med | `OPENAI_API_KEY` optional in `validateConfig()`; import failure never affects rider paths |

---

## 12. Open items

1. ~~Confirm Cologne's data licence~~ **DONE.** The "Sag's uns" Anliegenmanagement
   dataset is published on offenedaten-koeln.de under **Datenlizenz Deutschland –
   Zero – Version 2.0** (public-domain-equivalent: no attribution obligation, no
   commercial restriction), and the Open311 API is a listed resource OF that
   dataset. The `CC BY 4.0` string on the site is **BKG basemap tile
   attribution**, not the data. The impressum's "prior written permission"
   clause covers site content generally, not the released dataset. Attribution
   is shown in-app anyway, for rider transparency.
2. **Probe EU Open311 endpoints** across the 31 supported countries. 6/7 German ones are dead; the real EU map is unknown. ~30 minutes of scripted probing.
3. **Probe DATEX II / National Access Points** — the only legally-mandated, all-member-state source. Highest upside, unknown cycling yield.
4. **BikeMaps.org** — cycling-native and global; needs an email, no public API found.
5. Decide whether to widen `HazardReportRequest['source']` with `'import'`, or leave provenance entirely in `import_source`.


---

## 13. Implementation record (2026-08-27)

### Shipped

| Piece | Location |
|---|---|
| TTL fix | `supabase/migrations/202608270001_fix_hazard_expiry_default.sql` |
| Schema + registry + staging + RPC | `…202608270002_hazard_import_pipeline.sql` |
| Upsert-key fix | `…202608270003_hazard_import_upsert_key.sql` |
| Staleness tracking | `…202608270004_hazard_import_last_items_at.sql` |
| Types / adapter seam | `services/mobile-api/src/lib/imports/types.ts` |
| Open311 adapter | `…/imports/adapters/open311.ts` |
| Cologne mapping | `…/imports/mappings/koln.ts` |
| Classification | `…/imports/classify.ts` |
| Runner | `…/imports/run.ts` |
| Cron route | `services/mobile-api/src/routes/imports.ts` |
| Attribution registry | `packages/core/src/hazardImportSources.ts` |
| Alert gating | `apps/mobile/app/navigation.tsx` |
| Provenance line | `…/organisms/HazardDetailSheet.tsx` + `hazard.importedFrom` ×3 locales |

All four migrations are **applied to production and verified**. 45 new tests;
full suite green (mobile-api 899, core 940, mobile 1573); typecheck clean; lint
ratchet clean; bundle check HTTP 200.

### First production backfill

2,420 Cologne reports staged over a 30-day lookback:

| Outcome | n |
|---|---|
| Dropped by the deterministic map | 1,458 |
| Dropped by the model as not cycling-relevant | 110 |
| Auto-approved | 852 |
| → of those, published (source still `open`) | **155** |
| → not published (city had already closed them) | 697 |
| Pending human review | **0** |

Live hazard map went from **0 active hazards to 155**.

### Five bugs the live run exposed (all fixed)

1. **Partial unique index broke every upsert.** `ON CONFLICT` cannot use a
   partial unique index without a matching inference predicate, which PostgREST
   does not emit → 125/125 publishes failed. Now a full unique index
   (rider rows hold `(NULL, NULL)`, which NULLS DISTINCT permits to repeat).
2. **A stale machine-level `OPENAI_API_KEY` shadowed `.env`** — `resolveConfigValue`
   checks `process.env` first. All 352 model calls returned 401. See §14.
3. **German descriptions leaking the city's ticket number.** The deterministic
   path derived text from the source, and Cologne's `title` is
   `#<id> <service_name>` → `"Kfz-Ampel defekt — #19078-2026 Kfz-Ampel defekt"`.
   Now every mapped category carries a reviewed, rider-facing English phrase.
4. **`service_request_id` filter is silently ignored by Cologne** — asking for
   3 known ids returned 100 unrelated rows. Status-sync matched nothing while
   reporting a healthy `statusChecked: 100`. Now uses the spec's per-id
   endpoint `GET /requests/{id}.json`, with a self-identification guard.
5. **Two of my own safeguards were wrong.**
   (a) The "0 items = dead endpoint" escalation false-positived on any run
   after a completed one (the cursor advances to `now`), and would have thrown
   a 502 and fired the GCP alert on a healthy pipeline — replaced with a
   time-based `last_items_at` / `stale_after_days` check.
   (b) Items parked as `pending` by the run-budget guard were treated as
   duplicates forever and never re-classified — added `reprocessStalled()`,
   which retries only transient reasons and routes them through the same gates.

Also added after measuring: **bounded-concurrency classification** (6) plus an
in-loop deadline check. 352 sequential model calls would have taken ~6-12 min
against a 240s budget and a 300s Scheduler deadline; the 401s returned
instantly and hid it.

### Not done / next

1. **Cloud Run deploy + Cloud Scheduler job** — the endpoint exists and is
   verified locally against production data, but is not deployed. Weekly:
   `POST /v1/imports/run`, Bearer `CRON_SECRET`.
   Set `OPENAI_API_KEY` on the service at the same time.
2. **civia** — registered and disabled. On consent:
   `UPDATE hazard_import_sources SET enabled = true, licence = '<agreed>' WHERE id = 'civia';`
   then write `adapters/civia.ts` and register it in `adapters/index.ts`
   (the runner fails loudly if a source is enabled without its adapter).
3. **EU Open311 discovery probe** — 6 of 7 published German endpoints are dead;
   the real EU map is unknown.
4. **DATEX II / National Access Points** — highest-upside unprobed source.
5. **BikeMaps.org** — needs an email; no public API found.
6. The model occasionally includes a street name in `summary_en` despite the
   prompt forbidding addresses (e.g. "…blocking the bike lane on Eschweilerstr."). 
   Harmless and arguably useful; decide whether to loosen the instruction or
   enforce it with a post-filter.

### Rollback

```sql
UPDATE hazard_import_sources SET enabled = false;            -- stop ingestion
DELETE FROM hazards WHERE import_source IS NOT NULL;         -- remove all imports
```
The TTL fix (202608270001) should NOT be rolled back with them — it fixes a
pre-existing bug affecting rider-reported hazards.

---

## 14. Local dev gotchas

- **`CRON_SECRET` must be exported, not just in `.env`.** `verifyCronAuth` reads
  `process.env.CRON_SECRET` directly, while `.env` is only merged into
  `resolveConfigValue`'s local map. Every cron endpoint behaves this way; on
  Cloud Run it is a real env var so the distinction never shows.
- **A machine-level `OPENAI_API_KEY` (User scope) overrides `.env`**, because
  `resolveConfigValue` checks `process.env` first. There is a stale 51-char
  legacy key set on this machine that returns 401. Run local imports with the
  key exported explicitly, or clear the User-scope variable.
