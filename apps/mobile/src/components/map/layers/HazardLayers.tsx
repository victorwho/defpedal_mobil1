import Mapbox from '@rnmapbox/maps';
import React from 'react';

type HazardLayersProps = {
  hazardZoneFeatureCollection: any;
  hazardFeatureCollection: any;
};

/**
 * Renders striped red/black hazard zones along the route
 * and orange hazard marker dots with "!" labels.
 */
export const HazardLayers = React.memo(({
  hazardZoneFeatureCollection,
  hazardFeatureCollection,
}: HazardLayersProps) => (
  <>
    {hazardZoneFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource id="hazard-zones" shape={hazardZoneFeatureCollection}>
        <Mapbox.LineLayer
          id="hazard-zone-black"
          style={{
            lineColor: '#000000',
            lineWidth: 8,
            lineOpacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
            lineEmissiveStrength: 1,
          }}
        />
        <Mapbox.LineLayer
          id="hazard-zone-red"
          style={{
            lineColor: '#DC2626',
            lineWidth: 6,
            lineDasharray: [1, 1.5],
            lineOpacity: 0.95,
            lineCap: 'butt',
            lineJoin: 'round',
            lineEmissiveStrength: 1,
          }}
        />
      </Mapbox.ShapeSource>
    ) : null}

    {hazardFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource id="hazards" shape={hazardFeatureCollection}>
        <Mapbox.CircleLayer
          id="hazards-bg"
          style={{
            circleColor: '#FF6B00',
            circleRadius: 9,
            circleStrokeColor: '#FFFFFF',
            circleStrokeWidth: 2,
            circleOpacity: 0.9,
            circleEmissiveStrength: 1,
          }}
        />
        <Mapbox.SymbolLayer
          id="hazards-label"
          style={{
            textField: '!',
            textSize: 13,
            textColor: '#FFFFFF',
            textAllowOverlap: true,
            textIgnorePlacement: true,
            textEmissiveStrength: 1,
          }}
        />
      </Mapbox.ShapeSource>
    ) : null}
  </>
));

HazardLayers.displayName = 'HazardLayers';
