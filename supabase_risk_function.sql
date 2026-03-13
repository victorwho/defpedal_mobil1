-- 0. Ensure spatial index exists for lightning-fast queries
CREATE INDEX IF NOT EXISTS road_risk_data_geom_idx ON road_risk_data USING GIST (geom);

-- Function: get_segmented_risk_route
-- Description: Takes a GeoJSON LineString (OSRM route), breaks it into segments,
-- finds the closest risk score for each segment, and returns a FeatureCollection.

CREATE OR REPLACE FUNCTION get_segmented_risk_route(route_geojson jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    osrm_geom geometry;
    result_geojson jsonb;
BEGIN
    -- 1. Convert the input GeoJSON into a PostGIS geometry (SRID 4326)
    osrm_geom := ST_SetSRID(ST_GeomFromGeoJSON(route_geojson), 4326);

    -- 2. Break route into simple 2-point segments and find nearest risk score
    WITH route_segments AS (
        SELECT (ST_DumpSegments(osrm_geom)).geom AS segment_geom
    ),
    scored_segments AS (
        SELECT 
            s.segment_geom AS geom,
            (
                SELECT r.risk_score 
                FROM road_risk_data r 
                WHERE ST_DWithin(s.segment_geom, r.geom, 0.0002) -- ~20 meters
                ORDER BY ST_Distance(s.segment_geom, r.geom) ASC 
                LIMIT 1
            ) AS risk_score
        FROM route_segments s
    ),
    filtered_segments AS (
        SELECT geom, risk_score
        FROM scored_segments
        WHERE risk_score IS NOT NULL
    )
    -- 3. Aggregate into a GeoJSON FeatureCollection
    SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(jsonb_agg(
            jsonb_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(geom)::jsonb,
                'properties', jsonb_build_object('risk_score', risk_score)
            )
        ), '[]'::jsonb)
    )
    INTO result_geojson
    FROM filtered_segments;

    RETURN result_geojson;
END;
$$;
