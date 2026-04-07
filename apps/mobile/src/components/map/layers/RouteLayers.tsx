import Mapbox from '@rnmapbox/maps';
import React from 'react';
import { brandColors, gray } from '../../../design-system/tokens/colors';

// ---------------------------------------------------------------------------
// Hoisted styles for Mapbox layer performance (avoid recreation on every render)
// ---------------------------------------------------------------------------

const unselectedRouteStyle = {
  lineColor: gray[400],
  lineOpacity: 0.6,
  lineWidth: 4,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
  lineEmissiveStrength: 1,
};

const selectedRouteStyle = {
  lineColor: brandColors.accent,
  lineWidth: 6,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
  lineEmissiveStrength: 1,
};

const riskSegmentStyle = {
  lineColor: ['get', 'color'] as any,
  lineWidth: 5,
  lineOpacity: 0.95,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
  lineEmissiveStrength: 1,
};

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

const unselectedFilter: any = ['!=', ['get', 'selected'], true];
const selectedFilter: any = ['==', ['get', 'selected'], true];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type RouteLayersProps = {
  routeFeatureCollection: any;
  riskFeatureCollection: any;
};

/**
 * Renders route alternative lines (unselected gray, selected accent)
 * and risk-colored segments on the selected route.
 */
export const RouteLayers = React.memo(({
  routeFeatureCollection,
  riskFeatureCollection,
}: RouteLayersProps) => (
  <>
    {routeFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource id="route-alternatives" shape={routeFeatureCollection}>
        <Mapbox.LineLayer
          id="route-alternatives-unselected"
          filter={unselectedFilter}
          style={unselectedRouteStyle}
        />
        <Mapbox.LineLayer
          id="route-alternatives-selected"
          filter={selectedFilter}
          style={selectedRouteStyle}
        />
      </Mapbox.ShapeSource>
    ) : null}

    {riskFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource id="risk-segments" shape={riskFeatureCollection}>
        <Mapbox.LineLayer
          id="risk-segments-layer"
          style={riskSegmentStyle}
        />
      </Mapbox.ShapeSource>
    ) : null}
  </>
));

RouteLayers.displayName = 'RouteLayers';
