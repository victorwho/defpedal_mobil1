import Mapbox from '@rnmapbox/maps';
import React from 'react';
import { brandColors, gray, safetyColors } from '../../../design-system/tokens/colors';

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
        <Mapbox.CircleLayer
          id="route-marker-origin"
          filter={['==', ['get', 'kind'], 'origin']}
          style={{
            circleColor: safetyColors.safe,
            circleRadius: 6,
            circleStrokeColor: gray[50],
            circleStrokeWidth: 2,
            circleEmissiveStrength: 1,
          }}
        />
        <Mapbox.CircleLayer
          id="route-marker-destination"
          filter={['==', ['get', 'kind'], 'destination']}
          style={{
            circleColor: safetyColors.info,
            circleRadius: 6,
            circleStrokeColor: gray[50],
            circleStrokeWidth: 2,
            circleEmissiveStrength: 1,
          }}
        />
        <Mapbox.CircleLayer
          id="route-marker-user"
          filter={['==', ['get', 'kind'], 'user']}
          style={{
            circleColor: safetyColors.info,
            circleRadius: 7,
            circleStrokeColor: brandColors.textPrimary,
            circleStrokeWidth: 3,
            circleEmissiveStrength: 1,
          }}
        />
      </Mapbox.ShapeSource>
    ) : null}

    {offRouteFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource id="off-route-connector" shape={offRouteFeatureCollection}>
        <Mapbox.LineLayer
          id="off-route-connector-layer"
          style={{
            lineColor: safetyColors.caution,
            lineWidth: 3,
            lineDasharray: [1.2, 1.2],
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

MarkerLayers.displayName = 'MarkerLayers';
