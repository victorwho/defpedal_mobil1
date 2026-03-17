-- 0. Ensure spatial index exists for lightning-fast queries
create index if not exists road_risk_data_geom_idx on road_risk_data using gist (geom);

-- Function: get_segmented_risk_route
-- Description: Takes a GeoJSON LineString (OSRM route), breaks it into segments,
-- finds the closest risk score for each segment, and returns a FeatureCollection.

create or replace function get_segmented_risk_route(route_geojson jsonb)
returns jsonb
language plpgsql
as $$
declare
    osrm_geom geometry;
    result_geojson jsonb;
begin
    -- 1. Convert the input GeoJSON into a PostGIS geometry (SRID 4326)
    osrm_geom := ST_SetSRID(ST_GeomFromGeoJSON(route_geojson), 4326);

    -- 2. Break route into simple 2-point segments and find nearest risk score
    with route_segments as (
        select (ST_DumpSegments(osrm_geom)).geom as segment_geom
    ),
    scored_segments as (
        select
            s.segment_geom as geom,
            (
                select r.risk_score
                from road_risk_data r
                where ST_DWithin(s.segment_geom, r.geom, 0.0002) -- ~20 meters
                order by ST_Distance(s.segment_geom, r.geom) asc
                limit 1
            ) as risk_score
        from route_segments s
    ),
    filtered_segments as (
        select geom, risk_score
        from scored_segments
        where risk_score is not null
    )
    -- 3. Aggregate into a GeoJSON FeatureCollection
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
$$;
