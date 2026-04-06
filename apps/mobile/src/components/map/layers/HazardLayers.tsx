import Mapbox from '@rnmapbox/maps';
import React, { useCallback } from 'react';

import { brandColors, safetyColors } from '../../../design-system/tokens/colors';

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
}: HazardLayersProps) => {
  const handlePress = useCallback(
    (event: any) => {
      const feature = event?.features?.[0];
      if (feature?.properties && onHazardPress) {
        onHazardPress({
          id: feature.properties.id ?? '',
          type: feature.properties.type ?? 'other',
          confirmCount: Number(feature.properties.confirmCount ?? 0),
          denyCount: Number(feature.properties.denyCount ?? 0),
        });
      }
    },
    [onHazardPress],
  );

  return (
  <>
    {hazardZoneFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource id="hazard-zones" shape={hazardZoneFeatureCollection}>
        <Mapbox.LineLayer
          id="hazard-zone-base"
          style={{
            lineColor: safetyColors.dangerText, // #991B1B — safetyColors.dangerText
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
            lineColor: safetyColors.danger, // #EF4444 — safetyColors.danger
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
        onPress={onHazardPress ? handlePress : undefined}
        hitbox={{ width: 44, height: 44 }}
      >
        <Mapbox.CircleLayer
          id="hazards-bg"
          style={{
            circleColor: safetyColors.caution, // safetyColors.caution — hazard marker
            circleRadius: 9,
            circleStrokeColor: brandColors.textPrimary,
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
            textColor: brandColors.textPrimary,
            textAllowOverlap: true,
            textIgnorePlacement: true,
            textEmissiveStrength: 1,
          }}
        />
      </Mapbox.ShapeSource>
    ) : null}
  </>
  );
});

HazardLayers.displayName = 'HazardLayers';
