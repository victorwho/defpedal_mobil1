import Mapbox from '@rnmapbox/maps';
import React from 'react';

type HistoryLayersProps = {
  trailFeatureCollection: any | null;
  plannedRouteFeatureCollection: any | null;
  plannedRouteColor: string;
};

/**
 * Renders trip history layers: planned route (green/custom color)
 * and GPS trail (blue).
 */
export const HistoryLayers = React.memo(({
  trailFeatureCollection,
  plannedRouteFeatureCollection,
  plannedRouteColor,
}: HistoryLayersProps) => (
  <>
    {plannedRouteFeatureCollection ? (
      <Mapbox.ShapeSource id="history-planned-route" shape={plannedRouteFeatureCollection}>
        <Mapbox.LineLayer
          id="history-planned-route-layer"
          style={{
            lineColor: plannedRouteColor,
            lineWidth: 4,
            lineOpacity: 0.7,
            lineJoin: 'round',
            lineCap: 'round',
            lineEmissiveStrength: 1,
          }}
        />
      </Mapbox.ShapeSource>
    ) : null}

    {trailFeatureCollection ? (
      <Mapbox.ShapeSource id="history-trail" shape={trailFeatureCollection}>
        <Mapbox.LineLayer
          id="history-trail-layer"
          style={{
            lineColor: '#2196F3',
            lineWidth: 4,
            lineOpacity: 0.9,
            lineJoin: 'round',
            lineCap: 'round',
            lineEmissiveStrength: 1,
          }}
        />
      </Mapbox.ShapeSource>
    ) : null}
  </>
));

HistoryLayers.displayName = 'HistoryLayers';
