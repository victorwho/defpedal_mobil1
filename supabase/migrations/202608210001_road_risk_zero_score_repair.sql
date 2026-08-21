-- road_risk_data: repair sentinel-colliding risk_score = 0 rows (b36v1 floor gap)
--
-- THE BUG (diagnosed 2026-08-21, defpedal error-log #83)
-- The app reserves risk_score = 0 as the "no data" sentinel: RISK_BUCKETS in
-- services/mobile-api/src/lib/risk.ts maps score <= 0 to label 'No data'
-- (blue #3b82f6). The v22 loader honoured that contract by flooring real
-- values to 0.5. The b36v1 EU-wide export (export_risk_eu.py in the
-- OSRM_Server project, swapped live 2026-08-01) writes the v31 model's
-- shifted score risk_score = raw_risk + 50.0 with NO floor — and the model's
-- dedicated-infrastructure bonus puts cycleways at raw_risk = exactly -50,
-- i.e. stored score exactly 0.
--
-- Measured live (2026-08-21): every zero-score row sampled in Bucharest,
-- Cluj, Berlin and Madrid bboxes carried raw_risk = -50.0 (cycleways
-- dominant; a few footway/residential/living_street rows) — i.e. NOT ONE was
-- a genuine no-data row; all were the safest infrastructure in the dataset.
-- Bucharest bbox: 173 zero rows totalling 55.5 km (avg 321 m vs 118 m for
-- scored rows). Berlin bbox: 4,081 cycleway zero rows / 244.6 km.
--
-- Because the SAFE profile deliberately rides cycleways, safe routes maximise
-- exposure: Unirii -> Herastrau read 59% "No data" segments through the live
-- RPC (the 2026-08-18 midpoint-probe fix, migration 202608170001, made the
-- matching honest and lifted that from 39% — correct matching unmasked the
-- data gap). Full ride-through: the app understated the safety of exactly its
-- best routes.
--
-- THE REPAIR
-- Floor every real-data score at 0.5, which lands in the 'Very safe' band
-- (<= 33) — matching the model's intent for a -50 bonus. raw_risk keeps the
-- unfloored value. Score 0 stays reserved for genuinely absent data.
--
-- APPLIED LIVE 2026-08-21 via the Management API /database/query endpoint in
-- 68 id-range batches of 1M ids (the API gateway 524s on full-table
-- statements; id ranges ride the rrd_b36v1r2_pkey btree). Affected ids were
-- captured into public.road_risk_zero_repair_20260821 (RLS on, no policies,
-- revoked from anon/authenticated) for exact rollback.
--
-- PIPELINE HALF OF THE FIX: export_risk_eu.py (OSRM_Server repo) now floors
-- the exported risk_score at max(0.5, raw + 50) so the next generation cannot
-- reintroduce the collision. Documented in that repo's CLAUDE.md and
-- EU Routing/eu-risk-data-pipeline.md.
--
-- ROLLBACK (restores the pre-repair stored values exactly):
--   update road_risk_data r set risk_score = 0
--   from road_risk_zero_repair_20260821 b where r.id = b.id;
-- (safe because every repaired row previously stored risk_score <= 0 and the
--  only value observed live was exactly 0)
--
-- CLEANUP (after a stability window, e.g. 2026-09-21):
--   drop table public.road_risk_zero_repair_20260821;

create table if not exists public.road_risk_zero_repair_20260821 (
    id bigint primary key
);
alter table public.road_risk_zero_repair_20260821 enable row level security;
revoke all on public.road_risk_zero_repair_20260821 from anon, authenticated;

-- Canonical form of the batched statement (live application chunked this by
-- id range: id >= N and id < N + 1_000_000, N in 1..67_816_370):
with upd as (
    update road_risk_data
    set risk_score = 0.5
    where risk_score <= 0
      and raw_risk is not null
    returning id
)
insert into public.road_risk_zero_repair_20260821 (id)
select id from upd
on conflict do nothing;
