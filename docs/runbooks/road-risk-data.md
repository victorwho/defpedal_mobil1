# road_risk_data — pipeline, regeneration, recalibration runbook

> Source of truth for everything related to the `road_risk_data` PostGIS table
> in Supabase. Read this before changing risk scores, bucket thresholds, or
> the underlying data, and before adding a new country to the dataset.
>
> Last full rebuild: **2026-05-27 (v22, RO + ES, 6,155,120 rows)**.

## What this table is

`public.road_risk_data` in Supabase is a static reference dataset of road
segments with a precomputed risk score (higher = more dangerous). Two RPCs
read it:

| RPC | Used by | Reads from |
|---|---|---|
| `get_segmented_risk_route(jsonb)` | route preview / navigation risk overlay | `road_risk_data` via `ST_DWithin` 20 m nearest-neighbor |
| `get_neighborhood_safety_score(lat, lon, radius_m)` | onboarding safety-score screen | `road_risk_data` via `geom && ST_Expand(...)` bbox lookup |

The OSRM safe-routing profile (`https://osrm.defensivepedal.com`) uses the
**same underlying source data** but bakes weights into its graph during
`osrm-extract`. It does **NOT** read the Supabase table at runtime. Updating
the OSRM weights is a separate workflow on the OSRM server box — see
`docs/runbooks/osrm-safety-profile.md` (TODO if not present).

## Polarity & scale — read this before changing anything

`risk_score` is a RISK number. **Higher = more dangerous.** The bucket
boundaries are defined in `services/mobile-api/src/lib/risk.ts:33-42`:

```
 0.0  ≤ score ≤ 33.0   → "Very safe"     (green)
33.0  < score ≤ 43.5   → "Safe"
43.5  < score ≤ 51.8   → "Average"
51.8  < score ≤ 57.6   → "Elevated"
57.6  < score ≤ 69.0   → "Risky"
69.0  < score ≤ 101.8  → "Very risky"
101.8 < score          → "Extreme"
```

Score exactly `0` is reserved for "No data" — loader scripts MUST floor
real values to `0.5`. Scores above 100 are valid (Extreme tier).

The API does `displayScore = 100 - avg_score` before returning to the
client, so on the phone "higher = safer". Do NOT mistake the client-visible
number for the DB scale.

## Where the source data lives

Outside the git repo, on the OSRM build machine:

```
C:\dev\OSRM_Server\
├── risk_data_ro_v21.geojson      ← Romania source, v21 (~979k features)
├── spain_full_risk.geojson       ← Spain source, v1 (~5.18M features)
├── export_risk_geojson_v*.py     ← THE risk-scoring engine (irreplaceable)
└── risk4app\                     ← per-bulk-load workspace
    ├── convert.py                ← source → loadable parts
    ├── road_risk_data.part*.geojson ← 8 parts, ≤ 450 MB each
    ├── summary.json              ← stats from the last conversion
    ├── validate.py / smoke_test.py
    └── README.md
```

**Critical:** `export_risk_geojson_v*.py` is the risk-scoring engine. It
takes raw OSM data + traffic/incline/highway-class metadata and produces
the `risk = 50 + raw_risk` composite. **If this machine dies the engine is
gone.** Back up `C:\dev\OSRM_Server\*.py` and the source GeoJSONs to
external storage; they are too large + sensitive for git.

The loader half of the pipeline (this side of the boundary) IS git-tracked
under `scripts/road-risk-data/`.

## End-to-end pipeline

```
┌─────────────────────────────┐
│  OSM extract + risk-scoring │   (one-off per country/release)
│  C:\dev\OSRM_Server\        │   export_risk_geojson_v*.py
│  → risk_data_ro_v21.geojson │
│  → spain_full_risk.geojson  │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  Conversion                 │   risk4app\convert.py
│  → schema-conformant parts  │   - snake_case risk_factor keys
│  → 8 × FeatureCollection    │   - floor risk ≤ 0 to 0.5
│  → road_risk_data.partNN.   │   - drop non-cycling highways
│    geojson                  │   - drop duplicate geometries
└──────────────┬──────────────┘   - emit summary.json
               │
               ▼
┌─────────────────────────────┐
│  Supabase staging table     │   scripts/road-risk-data/
│  road_risk_data_vNN         │     load_to_supabase.py
│  (no index, no RLS yet)     │   psycopg COPY FROM STDIN
└──────────────┬──────────────┘   EWKB hex + SRID 4326
               │                  ~17 min for 6M rows
               ▼
┌─────────────────────────────┐
│  Index + VACUUM             │     build_index.py
│  GiST on geom               │   ~48 s GiST build
│  VACUUM ANALYZE             │   ~16 s vacuum
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  Atomic rename swap         │     swap.sql (migration)
│  road_risk_data → _vN_old   │   wrapped in one transaction
│  vNN → road_risk_data       │   all RPCs flip atomically
└─────────────────────────────┘
```

## Replaying the pipeline (full rebuild)

You'll typically rebuild when:

- Adding a new country (extend ES → add IT/FR/DE)
- A new OSM extract becomes meaningfully fresher
- The risk-scoring algorithm changes (e.g., new factor like "bike lane
  width" added to `export_risk_geojson_v*.py`)

Steps:

### 1. Produce source GeoJSON
Run `export_risk_geojson_v*.py` on the OSRM box for the country/release in
question. Output goes into `C:\dev\OSRM_Server\<country>_full_risk.geojson`
or a versioned name (e.g., `risk_data_ro_v22.geojson`).

### 2. Convert
```bash
cd C:\dev\OSRM_Server\risk4app
python convert.py
```
Outputs `road_risk_data.part01..NN.geojson` + `summary.json`. Inspect
`summary.json`:
- `total_features` matches expectation
- `risk_score_stats.bucket_counts` is non-degenerate (no single bucket
  holds >80%, at least 3 buckets populated)
- `source_polarity` is `"risk"` (i.e., higher = more dangerous in source)
- `dropped_count` is small relative to total

### 3. Load
```bash
cd C:\dev\defpedal\scripts\road-risk-data
$env:SUPABASE_DB_PW = '<password>'           # PowerShell
$env:RISK_PARTS_DIR = 'C:\dev\OSRM_Server\risk4app'
# (defaults to the above if unset)
python load_to_supabase.py
```

Roughly 17 min for ~6M rows on a residential connection to `us-east-1`.
The loader:
- Disables Supabase's default 2-min `statement_timeout` for the session
- Creates `road_risk_data_v<N>` if not exists (default name is read from
  `RISK_STAGING_TABLE`; defaults to `road_risk_data_v22`)
- TRUNCATEs that table at the start (safe to re-run after partial failure)
- Streams each part file via psycopg `COPY FROM STDIN`, per-file commit
- Geometry is converted GeoJSON → shapely → EWKB hex (SRID 4326 embedded)
- Skips features with no/zero `risk_score` (schema reserves 0 for "no data")

### 4. Index + vacuum
```bash
python build_index.py
```
Creates the GiST index on `geom` and runs VACUUM ANALYZE. ~1 min total.

### 5. Smoke test (recommended)
Run two queries via Supabase SQL Editor against the staging table, mirroring
the live RPC patterns:

```sql
-- Segmented risk for a known city line
SELECT jsonb_array_length(r->'features')
FROM (SELECT get_segmented_risk_route_against('public.road_risk_data_v22',
  '{"type":"LineString","coordinates":[[26.0959,44.4660],[26.1015,44.4632],
                                        [26.1063,44.4598],[26.1118,44.4570]]}'::jsonb)
  AS r) sub;

-- Neighborhood score for a known city center
SELECT * FROM get_neighborhood_safety_score_against('public.road_risk_data_v22',
  44.4660, 26.0959, 1000);
```

If you don't have those `_against` helpers, copy the live RPC source via
`pg_get_functiondef(...)` and `sed`-replace the table name. (Future
improvement: refactor the live RPCs to take the table name as a parameter.)

### 6. Atomic rename swap
Apply the swap migration. Inside one transaction:

```sql
alter table road_risk_data rename to road_risk_data_v<N-1>_old;
alter index if exists road_risk_data_pkey rename to road_risk_data_v<N-1>_old_pkey;
alter index if exists road_risk_data_geom_idx rename to road_risk_data_v<N-1>_old_geom_idx;
alter policy "Allow public read access to road_risk_data" on road_risk_data_v<N-1>_old
  rename to "Allow public read access to road_risk_data_v<N-1>_old";

alter table road_risk_data_v<N> rename to road_risk_data;
alter index road_risk_data_v<N>_pkey rename to road_risk_data_pkey;
alter index road_risk_data_v<N>_geom_idx rename to road_risk_data_geom_idx;
alter policy "Allow public read access to road_risk_data_v<N>" on road_risk_data
  rename to "Allow public read access to road_risk_data";
```

See `supabase/migrations/202605270004_road_risk_data_v22_swap.sql` for the
canonical template.

### 7. Verify live
Hit `/v1/safety-score?lat=...&lon=...&radiusKm=1` for two coordinates and
confirm HTTP 200 + sensible bucket counts.

### 8. Hold old table for 7 days, then drop
```sql
-- After 7 days of clean traffic + no rollback needs:
DROP TABLE public.road_risk_data_v<N-1>_old;
```

## Recalibration without a full rebuild

If you want to shift the score distribution without re-running the
risk-scoring engine, two cheap levers:

### Lever A: shift the buckets (no data change)
Edit `services/mobile-api/src/lib/risk.ts:33-42`. Move the `maxScore`
thresholds. **The DB doesn't care** — the buckets are pure server-side
classification. Example: if a new dataset has a lower mean and you want
the existing "Very safe" tier to encompass more segments, drop the first
boundary from 33.0 to, say, 25.0. Affects all rendered colors + category
labels client-side immediately on next API call.

### Lever B: rescale the scores in place (SQL update)
```sql
-- e.g., shift everything down by 10 (less alarming readings)
UPDATE road_risk_data SET risk_score = GREATEST(0.5, risk_score - 10);
-- or apply a multiplicative scale
UPDATE road_risk_data SET risk_score = GREATEST(0.5, risk_score * 0.85);
```
Updates ~6M rows; takes a few minutes. The GiST index doesn't need to be
rebuilt (it's on `geom`, not `risk_score`). Run inside a transaction so
you can ROLLBACK if the new distribution looks wrong.

### Lever C: re-derive from raw_risk
The `raw_risk` column is preserved per row. You can recompute `risk_score`
from `raw_risk` with whatever new formula you want:
```sql
UPDATE road_risk_data SET risk_score = GREATEST(0.5, 50 + raw_risk * 1.5);
```

Pick Lever A first — it's reversible by a code edit + redeploy. Levers B/C
mutate the data and require a backup or v_old table to roll back.

## Adding a new country

Pure data extension. Assuming the risk-scoring engine supports the country:

1. Run `export_risk_geojson_v*.py` for the new country → produces
   `<country>_full_risk.geojson`.
2. Update `risk4app/convert.py`'s input list to include the new file.
3. Re-run the full pipeline (steps 1–8 above).
4. Verify `/v1/safety-score` for two coordinates in the new country.

The schema doesn't need to change. The app degrades gracefully outside
covered countries (zero matching segments → empty risk overlay,
`total_segments: 0` from `get_neighborhood_safety_score`).

## Rollback

Within 7 days of a swap, the previous table is still present as
`road_risk_data_v<N-1>_old`. To undo a bad swap:

```sql
BEGIN;
ALTER TABLE road_risk_data RENAME TO road_risk_data_v<N>_temp;
ALTER TABLE road_risk_data_v<N-1>_old RENAME TO road_risk_data;
-- (and re-rename indexes + policy as needed)
COMMIT;
```

If you've already dropped the v_old table: restore from Supabase's
automatic backup (Dashboard → Database → Backups). PITR is continuous
on Pro plans.

## Gotchas (in chronological order of when they bit us last time)

1. **2-minute statement_timeout kills bulk COPY.** Set
   `statement_timeout = 0` for the session before COPYing 6M rows.
   `idle_in_transaction_session_timeout = 0` too, defensively.

2. **Supabase default ACL is too permissive on new tables.** `CREATE TABLE`
   grants ALL privileges to `anon`/`authenticated`/`service_role` by
   default. The live `road_risk_data` only has SELECT for those roles.
   Always `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`
   on a fresh staging table before the swap. See migration
   `202605270003_road_risk_data_v22_revoke_excess_grants.sql`.

3. **`get_neighborhood_safety_score` polarity bug.** The original migration
   had `safest_count` filter as `>= 70` (wrong — that's risk, not safety).
   The LIVE function was rewritten to use `safe_count < 43.5` and
   `very_risky_count >= 69`. Migration files are NOT the source of truth
   for RPC behavior — `pg_get_functiondef(...)` is. See memory
   `reference_supabase-rpc-drift.md`.

4. **Supabase project is in `us-east-1`**, app is on Cloud Run in
   `europe-central2`. Every prod query crosses the Atlantic. Bulk load
   from Romania over residential connection runs at ~5–6k rows/sec
   limited by network latency.

5. **Pooler connection rejects with "Tenant or user not found".** The
   direct connection at `db.<ref>.supabase.co:5432` works for one-off
   loads. The pooler is more involved (`postgres.<ref>` username,
   region-specific host). For the load script, direct is fine.

6. **Don't paste the DB password into chat.** Cloud Run uses the
   service-role JWT, not the DB password — rotating the DB password
   breaks no production traffic. After every interactive load session
   that involved typing the password into a transcript or terminal that
   logs history, rotate via Dashboard → Database → Reset password.

## Related files

- `scripts/road-risk-data/load_to_supabase.py` — the loader (this repo)
- `scripts/road-risk-data/build_index.py` — the index builder (this repo)
- `scripts/road-risk-data/swap.sql` — atomic swap template (this repo)
- `services/mobile-api/src/lib/risk.ts:33-42` — bucket thresholds
- `services/mobile-api/src/routes/v1.ts` — `/v1/safety-score` + segmented-route endpoints
- `supabase/migrations/202603010001_base_schema.sql` — original table DDL
- `supabase/migrations/202605270001..04_*.sql` — v22 swap migrations
- `C:\dev\OSRM_Server\risk4app\README.md` — convert.py details

## Memory references

- `[[road-risk-data-pipeline]]` — pointer back to this runbook
- `[[road-risk-loader-scripts]]` — script usage details
- `[[supabase-rpc-drift]]` — migration ≠ live source gotcha
