import Mapbox from '@rnmapbox/maps';
import React from 'react';
import { brandColors, gray } from '../../../design-system/tokens/colors';

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
          filter={['!=', ['get', 'selected'], true]}
          style={{
            lineColor: gray[400],
            lineOpacity: 0.6,
            lineWidth: 4,
            lineJoin: 'round',
            lineCap: 'round',
            lineEmissiveStrength: 1,
          }}
        />
        <Mapbox.LineLayer
          id="route-alternatives-selected"
          filter={['==', ['get', 'selected'], true]}
          style={{
            lineColor: brandColors.accent,
            lineWidth: 6,
            lineJoin: 'round',
            lineCap: 'round',
            lineEmissiveStrength: 1,
          }}
        />
      </Mapbox.ShapeSource>
    ) : null}

    {riskFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource id="risk-segments" shape={riskFeatureCollection}>
        <Mapbox.LineLayer
          id="risk-segments-layer"
          style={{
            lineColor: ['get', 'color'],
            lineWidth: 5,
            lineOpacity: 0.95,
            lineJoin: 'round',
            lineCap: 'round',
            lineEmissiveStrength: 1,
          }}
        />
      </Mapbox.ShapeSource>
    ) : null}
  </>
));

RouteLayers.displayName = 'RouteLayers';
