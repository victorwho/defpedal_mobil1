import Mapbox from '@rnmapbox/maps';
import React from 'react';
import { brandColors, gray, safetyColors } from '../../../design-system/tokens/colors';

// ---------------------------------------------------------------------------
// Hoisted styles for Mapbox layer performance (avoid recreation on every render)
// ---------------------------------------------------------------------------

const originMarkerStyle = {
  circleColor: safetyColors.safe,
  circleRadius: 6,
  circleStrokeColor: gray[50],
  circleStrokeWidth: 2,
  circleEmissiveStrength: 1,
};

const destinationMarkerStyle = {
  circleColor: safetyColors.info,
  circleRadius: 6,
  circleStrokeColor: gray[50],
  circleStrokeWidth: 2,
  circleEmissiveStrength: 1,
};

const waypointMarkerStyle = {
  circleColor: brandColors.accent,
  circleRadius: 5,
  circleStrokeColor: gray[50],
  circleStrokeWidth: 2,
  circleEmissiveStrength: 1,
};

const userMarkerStyle = {
  circleColor: safetyColors.info,
  circleRadius: 7,
  circleStrokeColor: brandColors.textPrimary,
  circleStrokeWidth: 3,
  circleEmissiveStrength: 1,
};

const offRouteConnectorStyle = {
  lineColor: safetyColors.caution,
  lineWidth: 3,
  lineDasharray: [1.2, 1.2],
  lineOpacity: 0.95,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
  lineEmissiveStrength: 1,
};

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

const originFilter: any = ['==', ['get', 'kind'], 'origin'];
const destinationFilter: any = ['==', ['get', 'kind'], 'destination'];
const waypointFilter: any = ['all', ['has', 'kind'], ['!=', ['get', 'kind'], 'origin'], ['!=', ['get', 'kind'], 'destination'], ['!=', ['get', 'kind'], 'user']];
const userFilter: any = ['==', ['get', 'kind'], 'user'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type MarkerLayersProps = {
  markerFeatureCollection: any;
  offRouteFeatureCollection: any;
};

/**
 * Renders origin (green), destination (blue), and user (blue with border)
 * circle markers, plus the off-route dashed connector line.
 */
export const MarkerLayers = React.memo(({
  markerFeatureCollection,
  offRouteFeatureCollection,
}: MarkerLayersProps) => (
  <>
    {markerFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource id="route-markers" shape={markerFeatureCollection}>
        <Mapbox.CircleLayer id="route-marker-origin" filter={originFilter} style={originMarkerStyle} />
        <Mapbox.CircleLayer id="route-marker-destination" filter={destinationFilter} style={destinationMarkerStyle} />
        <Mapbox.CircleLayer id="route-marker-waypoint" filter={waypointFilter} style={waypointMarkerStyle} />
        <Mapbox.CircleLayer id="route-marker-user" filter={userFilter} style={userMarkerStyle} />
      </Mapbox.ShapeSource>
    ) : null}

    {offRouteFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource id="off-route-connector" shape={offRouteFeatureCollection}>
        <Mapbox.LineLayer id="off-route-connector-layer" style={offRouteConnectorStyle} />
      </Mapbox.ShapeSource>
    ) : null}
  </>
));

MarkerLayers.displayName = 'MarkerLayers';
