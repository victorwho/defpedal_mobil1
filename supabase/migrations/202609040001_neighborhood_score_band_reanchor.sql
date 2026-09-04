-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  get_neighborhood_safety_score — band re-anchoring for the b46v1     ║
-- ║  risk-score generation (2026-09-04).                                 ║
-- ║                                                                      ║
-- ║  The b46v1 generation (live since 2026-09-01) sits ~13 pts higher    ║
-- ║  and wider than b36v1, so the old bucket cuts (43.5 / 51.8 / 69)     ║
-- ║  over-count the risky buckets. Re-anchored to the validated tier     ║
-- ║  scheme (OSRM_Server repo, BAND_REANCHOR_B46V1.md):                  ║
-- ║    safe_count       = Safer tier        (< 42)                       ║
-- ║    average_count    = Typical tier      (42–80)                      ║
-- ║    risky_count      = High tier shades  (80–130)                     ║
-- ║    very_risky_count = High tier extreme (> 130)                      ║
-- ║  Output shape unchanged — the mobile-api /v1/safety-score contract   ║
-- ║  keeps its four counts. NOTE: scores <= 0 mean "no data" and are     ║
-- ║  excluded from the counts (they were previously lumped into safe).   ║
-- ║                                                                      ║
-- ║  Display bands are generation-specific: re-run the OSRM repo's       ║
-- ║  validation/rescore_reanchor_b46.py and re-cut here at every         ║
-- ║  scale-shifting model generation.                                    ║
-- ╚══════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.get_neighborhood_safety_score(
  p_lat double precision,
  p_lon double precision,
  p_radius_meters double precision DEFAULT 1000
)
RETURNS TABLE (
  avg_score double precision,
  total_segments integer,
  safe_count integer,
  average_count integer,
  risky_count integer,
  very_risky_count integer
)
LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(AVG(rrd.risk_score) FILTER (WHERE rrd.risk_score > 0), 0)::DOUBLE PRECISION AS avg_score,
    COUNT(*) FILTER (WHERE rrd.risk_score > 0)::INT AS total_segments,
    COUNT(*) FILTER (WHERE rrd.risk_score > 0 AND rrd.risk_score < 42)::INT AS safe_count,
    COUNT(*) FILTER (WHERE rrd.risk_score >= 42 AND rrd.risk_score < 80)::INT AS average_count,
    COUNT(*) FILTER (WHERE rrd.risk_score >= 80 AND rrd.risk_score < 130)::INT AS risky_count,
    COUNT(*) FILTER (WHERE rrd.risk_score >= 130)::INT AS very_risky_count
  FROM road_risk_data rrd
  WHERE rrd.geom && ST_Expand(
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326),
    p_radius_meters / 111320.0
  );
$$;
