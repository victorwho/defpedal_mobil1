-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  ATOMIC RENAME SWAP: road_risk_data v21 (RO-only, ~974k) → v22       ║
-- ║  (RO+ES, ~6.15M). Wrapped in a single transaction by apply_migration ║
-- ║  so any failure aborts the whole thing and the live table keeps      ║
-- ║  serving.                                                            ║
-- ║                                                                       ║
-- ║  All RPCs (get_segmented_risk_route, get_neighborhood_safety_score,  ║
-- ║  get_road_risk_geojson, etc.) reference road_risk_data BY NAME, so   ║
-- ║  they automatically hit the new table after this commits.           ║
-- ║                                                                       ║
-- ║  Index + policy renames are needed because object names are unique   ║
-- ║  per schema, not per table — without renaming the old objects first   ║
-- ║  we'd collide when renaming the new ones to clean names.            ║
-- ║                                                                       ║
-- ║  Rollback (within 7 days, while v21_old still exists): apply the     ║
-- ║  inverse rename swap. Both tables retain their data.                ║
-- ║                                                                       ║
-- ║  Note: the IF EXISTS guards on the v21 index renames make this safe  ║
-- ║  to replay on a fresh project where the duplicate                    ║
-- ║  `road_risk_data_geom_geom_idx` index doesn't exist.                ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- Step 1: rename the live table out of the way
alter table public.road_risk_data
  rename to road_risk_data_v21_old;

-- Step 2: rename old indexes to v21_old_* to free their names for v22
alter index if exists public.road_risk_data_pkey
  rename to road_risk_data_v21_old_pkey;
alter index if exists public.road_risk_data_geom_idx
  rename to road_risk_data_v21_old_geom_idx;
alter index if exists public.road_risk_data_geom_geom_idx
  rename to road_risk_data_v21_old_geom_geom_idx;

-- Step 3: rename old RLS policy so v22's policy can take the clean name
alter policy "Allow public read access to road_risk_data"
  on public.road_risk_data_v21_old
  rename to "Allow public read access to road_risk_data_v21_old";

-- Step 4: promote staging to live
alter table public.road_risk_data_v22
  rename to road_risk_data;

-- Step 5: rename new indexes to canonical names
alter index public.road_risk_data_v22_pkey
  rename to road_risk_data_pkey;
alter index public.road_risk_data_v22_geom_idx
  rename to road_risk_data_geom_idx;

-- Step 6: rename new policy to canonical name
alter policy "Allow public read access to road_risk_data_v22"
  on public.road_risk_data
  rename to "Allow public read access to road_risk_data";

-- Step 7: refresh the table comment with the new vintage
comment on table public.road_risk_data is
  'Pre-computed road segment risk scores (RO + ES, ~6.15M segments). '
  'v22 loaded 2026-05-27 from C:/dev/OSRM_Server/risk4app/road_risk_data.part*.geojson. '
  'risk_score is RISK (higher = more dangerous), buckets defined server-side in '
  'services/mobile-api/src/lib/risk.ts:33-42. '
  'Predecessor v21_old preserved for 7-day rollback window.';
