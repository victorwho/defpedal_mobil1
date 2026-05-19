/**
 * RouteFeatureLayer — route awareness markers (tunnel, bridge, semafor,
 * unprotected left turn, railway crossing).
 *
 * Render contract: single `ShapeSource` produces every feature type; one
 * `CircleLayer` renders the tier-colored disc, one `SymbolLayer` renders
 * the SDF glyph on top. Glyphs are loaded as **SDF sprites** via
 * `<Mapbox.Images>` so they can be recolored at render time — the
 * 96×96 black-on-alpha PNGs from `assets/map-icons/` get tinted white via
 * `iconColor` so they stay legible against every tier background.
 *
 * Hazard dedup happens upstream in `useFeatureCollections` so this
 * component never sees a feature that should be hidden behind a hazard
 * marker.
 *
 * Visibility: respects the `showRouteFeatures` user preference (Zustand).
 * Empty FeatureCollection mounts unconditionally so Mapbox-RN can't cache
 * stale features from a prior selection (CLAUDE.md gotcha #12).
 */
import Mapbox from '@rnmapbox/maps';
import React, { useMemo } from 'react';

import {
  routeFeatureCircleColorExpression,
  routeFeatureIconImageExpression,
  routeFeatureIcons,
  routeFeatureLabelColor,
  routeFeatureMarker,
  routeFeatureStrokeColor,
} from '../../../design-system/tokens/routeFeatureIcons';
import { useAppStore } from '../../../store/appStore';

const EMPTY_FEATURE_COLLECTION = {
  type: 'FeatureCollection' as const,
  features: [] as any[],
};

// Hoisted images map — `<Mapbox.Images>` expects an object keyed by the
// sprite name used in iconImage expressions. `sdf: true` tells the native
// side to treat the alpha channel as the SDF mask so `iconColor` tinting
// works.
const SDF_IMAGES = {
  [routeFeatureIcons.tunnel.spriteName]: {
    image: routeFeatureIcons.tunnel.iconImage,
    sdf: true,
  },
  [routeFeatureIcons.bridge.spriteName]: {
    image: routeFeatureIcons.bridge.iconImage,
    sdf: true,
  },
  [routeFeatureIcons.semafor.spriteName]: {
    image: routeFeatureIcons.semafor.iconImage,
    sdf: true,
  },
  [routeFeatureIcons.left_turn_no_intersection.spriteName]: {
    image: routeFeatureIcons.left_turn_no_intersection.iconImage,
    sdf: true,
  },
  [routeFeatureIcons.railway_crossing.spriteName]: {
    image: routeFeatureIcons.railway_crossing.iconImage,
    sdf: true,
  },
};

// Zoom-stepped radius: smaller at zoom 13–14 where the map is busier,
// fuller size at zoom 15+. Step expression for instant change at the
// threshold instead of a smeary interpolation through "too small to read".
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

const iconStyle = {
  iconImage: routeFeatureIconImageExpression as any,
  iconColor: routeFeatureLabelColor,
  iconSize: [
    'step',
    ['zoom'],
    routeFeatureMarker.mapIconSizeCompact,
    routeFeatureMarker.compactZoomThreshold,
    routeFeatureMarker.mapIconSize,
  ] as any,
  iconAllowOverlap: true,
  iconIgnorePlacement: true,
  iconOpacity: 1,
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
      <>
        {/*
          SDF sprite registration. Mounted alongside the source so Mapbox
          resolves iconImage references on the same render tick. `sdf:true`
          per-image enables the `iconColor` tint path; without it the icon
          renders as raw black on the tier-colored disc.
        */}
        <Mapbox.Images images={SDF_IMAGES as any} />

        <Mapbox.ShapeSource id="route-features" shape={shape as any}>
          <Mapbox.CircleLayer
            id="route-feature-circle"
            minZoomLevel={routeFeatureMarker.minZoom}
            style={circleStyle as any}
          />
          <Mapbox.SymbolLayer
            id="route-feature-icon"
            minZoomLevel={routeFeatureMarker.minZoom}
            style={iconStyle as any}
          />
        </Mapbox.ShapeSource>
      </>
    );
  },
);

RouteFeatureLayer.displayName = 'RouteFeatureLayer';
