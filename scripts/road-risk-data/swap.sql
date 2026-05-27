-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  road_risk_data — atomic rename swap template                        ║
-- ║                                                                       ║
-- ║  Swap a freshly-loaded staging table (road_risk_data_v<N>) into the  ║
-- ║  live name (road_risk_data), preserving the previous live table as   ║
-- ║  road_risk_data_v<N-1>_old for a 7-day rollback window.              ║
-- ║                                                                       ║
-- ║  All ALTER statements MUST run in a single transaction. The MCP       ║
-- ║  `apply_migration` call already wraps in a transaction; running via  ║
-- ║  psql, wrap manually with BEGIN/COMMIT.                              ║
-- ║                                                                       ║
-- ║  REPLACE the version markers below before applying:                  ║
-- ║    <N>      → current staging version (e.g., 23)                     ║
-- ║    <N-1>    → previous live version  (e.g., 22)                      ║
-- ║                                                                       ║
-- ║  All RPCs that read `road_risk_data` reference the name (not OID),   ║
-- ║  so they automatically hit the new table after this commits.        ║
-- ║                                                                       ║
-- ║  Rollback (while road_risk_data_v<N-1>_old still exists): apply the  ║
-- ║  inverse swap. The previous live table is unchanged inside it.       ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- Step 1: rename live table out of the way
alter table public.road_risk_data
  rename to road_risk_data_v<N-1>_old;

-- Step 2: rename old indexes to v<N-1>_old_* to free their names
--         IF EXISTS guards handle replays on a fresh project where the
--         duplicate `geom_geom_idx` doesn't exist.
alter index if exists public.road_risk_data_pkey
  rename to road_risk_data_v<N-1>_old_pkey;
alter index if exists public.road_risk_data_geom_idx
  rename to road_risk_data_v<N-1>_old_geom_idx;
alter index if exists public.road_risk_data_geom_geom_idx
  rename to road_risk_data_v<N-1>_old_geom_geom_idx;

-- Step 3: rename old RLS policy so v<N>'s policy can take the clean name
alter policy "Allow public read access to road_risk_data"
  on public.road_risk_data_v<N-1>_old
  rename to "Allow public read access to road_risk_data_v<N-1>_old";

-- Step 4: promote staging to live
alter table public.road_risk_data_v<N>
  rename to road_risk_data;

-- Step 5: rename new indexes to canonical names
alter index public.road_risk_data_v<N>_pkey
  rename to road_risk_data_pkey;
alter index public.road_risk_data_v<N>_geom_idx
  rename to road_risk_data_geom_idx;

-- Step 6: rename new policy to canonical name
alter policy "Allow public read access to road_risk_data_v<N>"
  on public.road_risk_data
  rename to "Allow public read access to road_risk_data";

-- Step 7: refresh the table comment with the new vintage
comment on table public.road_risk_data is
  'Pre-computed road segment risk scores (...). v<N> loaded YYYY-MM-DD. '
  'risk_score is RISK (higher = more dangerous), buckets in '
  'services/mobile-api/src/lib/risk.ts:33-42. '
  'Predecessor v<N-1>_old preserved for 7-day rollback window.';
