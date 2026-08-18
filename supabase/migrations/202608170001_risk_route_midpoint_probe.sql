-- get_segmented_risk_route: deterministic midpoint probe + KNN ordering
--
-- Audit finding SCALE-13 (docs/reviews/full-app-audit-2026-07-05.md) flagged this
-- RPC as "a per-segment correlated KNN over the whole road_risk_data table". The
-- perf half turned out to be mostly planner fiction (the GiST index was already
-- doing its job; measured 73 ms for a 629-segment Bucharest route). Measuring it
-- surfaced a much more serious CORRECTNESS bug, which is the real reason for this
-- migration.
--
-- THE BUG
-- The old body probed with the 2-point route SEGMENT itself:
--
--     where ST_DWithin(s.segment_geom, r.geom, 0.0002)
--     order by ST_Distance(s.segment_geom, r.geom) asc
--     limit 1
--
-- A route segment whose endpoint sits on an intersection node is at distance
-- EXACTLY 0 from every road meeting at that node — the one it runs along and
-- every road it merely crosses. `limit 1` then picks one arbitrarily.
--
-- Measured on the live table (2026-08-17, b36v1 generation, 67.9M rows):
--   * Bucharest 15.3 km route: 351 of 629 segments (56%) had >= 2 candidates at
--     distance 0; average risk_score spread among the tied candidates 31.2 points,
--     max 126.5.
--   * Berlin 8.6 km route: 488 of 620 segments (79%) tied, average spread 20.9.
--   * 1223 of 1225 tied rows were at distance exactly 0, and in every tied segment
--     the tied geometries were DIFFERENT roads (not duplicate rows) — confirming
--     the intersection-node mechanism rather than an export duplication artefact.
--
-- Because RISK_BUCKETS in services/mobile-api/src/lib/risk.ts are narrow through
-- the middle (Safe <= 43.5, Average <= 51.8, Elevated <= 57.6, Risky <= 69), a
-- ~20-30 point arbitrary swing routinely crossed two or more colour bands. A quiet
-- cycleway could be painted with the score of the boulevard it crosses, and the
-- pick was not even stable between identical requests.
--
-- THE FIX
-- Probe with the segment's MIDPOINT instead of the segment. A midpoint is not on
-- the intersection node, so it discriminates the road the rider travels ALONG from
-- the roads they merely cross. Ordering moves to the KNN operator (`<->`), which
-- lets GiST return nearest-first instead of sorting the candidate set, and gives
-- the planner a sane cost estimate (347M -> 53k).
--
-- The COALESCE fallback re-probes with the full segment when the midpoint finds
-- nothing within ~20 m, so coverage can never regress relative to the old body.
--
-- MEASURED (live, EXPLAIN ANALYZE, warm cache, 2026-08-17)
--   Bucharest 629 segments: 73.2 ms / 10212 buffers  ->  61.2 ms / 6610 buffers
--   Berlin    620 segments: 166.3 ms / 14463 buffers ->  59.9 ms / 6722 buffers
--   Tied segments: 351 -> 0 (Bucharest), 488 -> 0 (Berlin)
--   Segments still scored: unchanged (629/629 and 620/620)
--
-- USER-VISIBLE EFFECT: 28% (Bucharest) / 34% (Berlin) of segments now report a
-- different risk_score than before, average absolute change 26.9 / 19.1 points.
-- That is the arbitrary-tie noise being replaced with the score of the road the
-- rider is actually on. Affects everything fed by /v1/risk-segments: the on-map
-- risk colouring, the Risk Score card and the route risk distribution. NOT the
-- neighbourhood safety score — get_neighborhood_safety_score aggregates
-- road_risk_data directly and never calls this function.
--
-- APPLIED to the live DB 2026-08-18 via the Management API /database/query endpoint.
-- Pre-change body verified byte-identical to 202603170001_get_segmented_risk_route.sql
-- (no live drift), so rollback is a straight re-apply of that file.
-- Post-apply verification on the Piata Timpuri Noi -> IKEA Baneasa route (563 segments):
--   563/563 features returned (no coverage loss); the Aleea Somesul Rece segment
--   reads 32.0 (was 146.8, the boulevard it merely touches) and the Piata Unirii
--   segment reads 145.2 (was 37.0, a service road beside it).
--   Full-RPC A/B on the same route: old body 164.3 ms -> new body 144.6 ms.
--
-- Signature, parameter name and output shape are unchanged, so no API or client
-- change is required. Rollback = re-apply the previous body (git history of this
-- file's predecessor, 202603170001_get_segmented_risk_route.sql).

CREATE OR REPLACE FUNCTION public.get_segmented_risk_route(route_geojson jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
    osrm_geom geometry;
    result_geojson jsonb;
begin
    -- 1. Convert the input GeoJSON into a PostGIS geometry (SRID 4326)
    osrm_geom := ST_SetSRID(ST_GeomFromGeoJSON(route_geojson), 4326);

    -- 2. Break route into simple 2-point segments, then score each one from the
    --    road nearest its MIDPOINT (see header: probing with the segment itself
    --    ties at distance 0 against every road at an intersection node).
    with route_segments as (
        select (ST_DumpSegments(osrm_geom)).geom as segment_geom
    ),
    probed as (
        select
            s.segment_geom as geom,
            ST_LineInterpolatePoint(s.segment_geom, 0.5) as midpoint
        from route_segments s
    ),
    scored_segments as (
        select
            p.geom,
            coalesce(
                -- Primary: nearest road to the segment midpoint (~20 m window).
                (
                    select r.risk_score
                    from road_risk_data r
                    where ST_DWithin(p.midpoint, r.geom, 0.0002)
                    order by r.geom <-> p.midpoint
                    limit 1
                ),
                -- Fallback: nothing within ~20 m of the midpoint, so widen to the
                -- whole segment. Preserves the old body's coverage exactly.
                (
                    select r.risk_score
                    from road_risk_data r
                    where ST_DWithin(p.geom, r.geom, 0.0002)
                    order by r.geom <-> p.geom
                    limit 1
                )
            ) as risk_score
        from probed p
    ),
    filtered_segments as (
        select geom, risk_score
        from scored_segments
        where risk_score is not null
    )
    -- 3. Aggregate into a GeoJSON FeatureCollection (shape unchanged)
    select jsonb_build_object(
        'type', 'FeatureCollection',
        'features', coalesce(jsonb_agg(
            jsonb_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(geom)::jsonb,
                'properties', jsonb_build_object('risk_score', risk_score)
            )
        ), '[]'::jsonb)
    )
    into result_geojson
    from filtered_segments;

    return result_geojson;
end;
$function$;
