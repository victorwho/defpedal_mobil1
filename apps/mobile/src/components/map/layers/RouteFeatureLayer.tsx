/**
 * RouteFeatureLayer — route awareness markers (tunnel, bridge, semafor,
 * unprotected left turn, railway crossing).
 *
 * Render contract: single `ShapeSource` produces every feature type; one
 * `CircleLayer` and one `SymbolLayer` cover all five via Mapbox style
 * expressions on the feature's `tier` / `type` properties. Hazard dedup
 * happens upstream in `useFeatureCollections` so this component never sees
 * a feature that should be hidden behind a hazard marker.
 *
 * Visibility: respects the `showRouteFeatures` user preference (Zustand).
 * Empty FeatureCollection mounts unconditionally so Mapbox-RN can't cache
 * stale features from a prior selection (see CLAUDE.md gotcha #12).
 */
import Mapbox from '@rnmapbox/maps';
import React, { useMemo } from 'react';

import {
  routeFeatureCircleColorExpression,
  routeFeatureLabelColor,
  routeFeatureLabelExpression,
  routeFeatureMarker,
  routeFeatureStrokeColor,
} from '../../../design-system/tokens/routeFeatureIcons';
import { useAppStore } from '../../../store/appStore';

const EMPTY_FEATURE_COLLECTION = {
  type: 'FeatureCollection' as const,
  features: [] as any[],
};

// Hoisted styles — recreated only when nothing else does (no per-feature
// theming needed because all colors are baked into Mapbox expressions).
//
// Radius scales by zoom: smaller at zoom 13–14 where the map is busier,
// fuller size at zoom 15+. We use a `step` expression so the change is
// instant rather than smoothly interpolated — keeps the icon legible at
// every zoom instead of growing through a "too small to read" middle band.
const circleStyle = {
  circleRadius: [
    'step',
    ['zoom'],
    routeFeatureMarker.mapRadiusCompact,
    routeFeatureMarker.compactZoomThreshold,
    routeFeatureMarker.mapRadius,
  ] as any,
  circleColor: routeFeatureCircleColorExpression as any,
  circleStrokeColor: routeFeatureStrokeColor,
  circleStrokeWidth: routeFeatureMarker.mapStrokeWidth,
  circleOpacity: 0.95,
  circleStrokeOpacity: 1,
  circleEmissiveStrength: 1,
};

const labelStyle = {
  textField: routeFeatureLabelExpression as any,
  textSize: routeFeatureMarker.mapLabelSize,
  textColor: routeFeatureLabelColor,
  textOpacity: 1,
  textAllowOverlap: true,
  textIgnorePlacement: true,
  textEmissiveStrength: 1,
};

export interface RouteFeatureLayerProps {
  /** GeoJSON FeatureCollection built by `useFeatureCollections`. */
  readonly featureCollection: { type: 'FeatureCollection'; features: unknown[] };
}

export const RouteFeatureLayer = React.memo(
  ({ featureCollection }: RouteFeatureLayerProps) => {
    const showRouteFeatures = useAppStore((s) => s.showRouteFeatures);

    // Empty when the user has hidden the layer, OR when there's nothing to
    // show. ShapeSource still mounts (error-log #12) so a future feature
    // toggle-on doesn't surface stale cached symbols.
    const shape = useMemo(() => {
      if (!showRouteFeatures) return EMPTY_FEATURE_COLLECTION;
      if (featureCollection.features.length === 0) return EMPTY_FEATURE_COLLECTION;
      return featureCollection;
    }, [featureCollection, showRouteFeatures]);

    return (
      <Mapbox.ShapeSource id="route-features" shape={shape as any}>
        <Mapbox.CircleLayer
          id="route-feature-circle"
          minZoomLevel={routeFeatureMarker.minZoom}
          style={circleStyle as any}
        />
        <Mapbox.SymbolLayer
          id="route-feature-label"
          minZoomLevel={routeFeatureMarker.minZoom}
          style={labelStyle as any}
        />
      </Mapbox.ShapeSource>
    );
  },
);

RouteFeatureLayer.displayName = 'RouteFeatureLayer';
