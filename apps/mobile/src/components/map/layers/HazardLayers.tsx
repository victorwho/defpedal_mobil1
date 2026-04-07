import Mapbox from '@rnmapbox/maps';
import React, { useCallback } from 'react';

import { brandColors, safetyColors } from '../../../design-system/tokens/colors';

// ---------------------------------------------------------------------------
// Hoisted styles for Mapbox layer performance (avoid recreation on every render)
// ---------------------------------------------------------------------------

const hazardZoneBaseStyle = {
  lineColor: safetyColors.dangerText, // #991B1B
  lineWidth: 7,
  lineOpacity: 0.55,
  lineCap: 'round' as const,
  lineJoin: 'round' as const,
  lineEmissiveStrength: 1,
};

const hazardZoneStripeStyle = {
  lineColor: safetyColors.danger, // #EF4444
  lineWidth: 5,
  lineDasharray: [1, 2],
  lineOpacity: 0.7,
  lineCap: 'butt' as const,
  lineJoin: 'round' as const,
  lineEmissiveStrength: 1,
};

const hazardMarkerStyle = {
  circleColor: safetyColors.caution,
  circleRadius: 9,
  circleStrokeColor: brandColors.textPrimary,
  circleStrokeWidth: 2,
  circleOpacity: 0.9,
  circleEmissiveStrength: 1,
};

const hazardLabelStyle = {
  textField: '!',
  textSize: 13,
  textColor: brandColors.textPrimary,
  textAllowOverlap: true,
  textIgnorePlacement: true,
  textEmissiveStrength: 1,
};

const hazardHitbox = { width: 44, height: 44 };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
        <Mapbox.LineLayer id="hazard-zone-base" style={hazardZoneBaseStyle} />
        <Mapbox.LineLayer id="hazard-zone-stripe" style={hazardZoneStripeStyle} />
      </Mapbox.ShapeSource>
    ) : null}

    {hazardFeatureCollection.features.length > 0 ? (
      <Mapbox.ShapeSource
        id="hazards"
        shape={hazardFeatureCollection}
        onPress={onHazardPress ? handlePress : undefined}
        hitbox={hazardHitbox}
      >
        <Mapbox.CircleLayer id="hazards-bg" style={hazardMarkerStyle} />
        <Mapbox.SymbolLayer id="hazards-label" style={hazardLabelStyle} />
      </Mapbox.ShapeSource>
    ) : null}
  </>
  );
});

HazardLayers.displayName = 'HazardLayers';
