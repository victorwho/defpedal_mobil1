import Mapbox from '@rnmapbox/maps';
import React from 'react';
import { brandColors, gray, safetyColors } from '../../../design-system/tokens/colors';

// ---------------------------------------------------------------------------
// Hoisted styles for Mapbox layer performance (avoid recreation on every render)
// ---------------------------------------------------------------------------

// Origin: small green dot — "you are here" (understated)
const originMarkerStyle = {
  circleColor: safetyColors.safe,
  circleRadius: 6,
  circleStrokeColor: gray[50],
  circleStrokeWidth: 2,
  circleEmissiveStrength: 1,
};

// Destination: larger red outer ring — "go here" (prominent, Google Maps convention)
const destinationOuterStyle = {
  circleColor: '#EF4444',
  circleRadius: 11,
  circleStrokeColor: gray[50],
  circleStrokeWidth: 2,
  circleEmissiveStrength: 1,
};

// Destination: white inner dot for target/bullseye effect
const destinationInnerStyle = {
  circleColor: '#FFFFFF',
  circleRadius: 4,
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
 * Renders origin (green dot), destination (red bullseye), waypoints (yellow),
 * and user (blue with border) circle markers, plus the off-route dashed connector line.
 */
export const MarkerLayers = React.memo(({
  markerFeatureCollection,
  offRouteFeatureCollection,
}: MarkerLayersProps) => (
  <>
    {markerFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource id="route-markers" shape={markerFeatureCollection}>
        <Mapbox.CircleLayer id="route-marker-origin" existing filter={originFilter} style={originMarkerStyle} />
        {/* Destination: outer red ring + inner white dot = bullseye target */}
        <Mapbox.CircleLayer id="route-marker-destination-outer" existing filter={destinationFilter} style={destinationOuterStyle} />
        <Mapbox.CircleLayer id="route-marker-destination-inner" existing filter={destinationFilter} style={destinationInnerStyle} />
        <Mapbox.CircleLayer id="route-marker-waypoint" existing filter={waypointFilter} style={waypointMarkerStyle} />
        <Mapbox.CircleLayer id="route-marker-user" existing filter={userFilter} style={userMarkerStyle} />
      </Mapbox.ShapeSource>
    ) : null}

    {offRouteFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource id="off-route-connector" shape={offRouteFeatureCollection}>
        <Mapbox.LineLayer id="off-route-connector-layer" existing style={offRouteConnectorStyle} />
      </Mapbox.ShapeSource>
    ) : null}
  </>
));

MarkerLayers.displayName = 'MarkerLayers';
