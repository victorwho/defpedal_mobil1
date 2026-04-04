import Mapbox from '@rnmapbox/maps';
import React from 'react';

type HazardLayersProps = {
  hazardZoneFeatureCollection: any;
  hazardFeatureCollection: any;
  onHazardPress?: (properties: { id: string; type: string; confirmCount: number; denyCount: number }) => void;
};

/**
 * Renders hazard zones along the route with a subtle striped
 * warning pattern (semi-transparent dark-red base + lighter red
 * dashes) and orange hazard marker dots with "!" labels.
 */
export const HazardLayers = React.memo(({
  hazardZoneFeatureCollection,
  hazardFeatureCollection,
  onHazardPress,
}: HazardLayersProps) => (
  <>
    {hazardZoneFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource id="hazard-zones" shape={hazardZoneFeatureCollection}>
        <Mapbox.LineLayer
          id="hazard-zone-base"
          style={{
            lineColor: '#7F1D1D',
            lineWidth: 7,
            lineOpacity: 0.55,
            lineCap: 'round',
            lineJoin: 'round',
            lineEmissiveStrength: 1,
          }}
        />
        <Mapbox.LineLayer
          id="hazard-zone-stripe"
          style={{
            lineColor: '#EF4444',
            lineWidth: 5,
            lineDasharray: [1, 2],
            lineOpacity: 0.7,
            lineCap: 'butt',
            lineJoin: 'round',
            lineEmissiveStrength: 1,
          }}
        />
      </Mapbox.ShapeSource>
    ) : null}

    {hazardFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource
        id="hazards"
        shape={hazardFeatureCollection}
        onPress={onHazardPress ? (event: any) => {
          const feature = event?.features?.[0];
          if (feature?.properties) {
            onHazardPress({
              id: feature.properties.id ?? '',
              type: feature.properties.type ?? 'other',
              confirmCount: Number(feature.properties.confirmCount ?? 0),
              denyCount: Number(feature.properties.denyCount ?? 0),
            });
          }
        } : undefined}
        hitbox={{ width: 30, height: 30 }}
      >
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
