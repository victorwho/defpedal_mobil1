/**
 * Walk-the-bike sections on the selected route (2026-10-10, core walkSections.ts).
 *
 * A white dashed line over the route line — the risk colours stay visible
 * between the dashes, so the base line is never hidden — and a dismount marker
 * at the start of each section longer than a crossing. Short crossings get the
 * dashes only: a Bucharest route can carry twenty of them, and twenty markers
 * would bury the map.
 *
 * Both sources always mount and are emptied instead (error-log #12: unmounting
 * a ShapeSource leaves ghost features).
 */
import React, { useMemo } from 'react';
import Mapbox from '@rnmapbox/maps';
import { SHORT_WALK_MAX_METERS, type WalkSection } from '@defensivepedal/core';

import walkIcon from '../../../../assets/map-icons/walk.png';
import { gray } from '../../../design-system/tokens/colors';
import { routeFeatureMarker } from '../../../design-system/tokens/routeFeatureIcons';

const WALK_SPRITE = 'dp-walk-the-bike';
const SDF_IMAGES = { [WALK_SPRITE]: { image: walkIcon, sdf: true } };

const lineStyle = {
  lineColor: gray[50],
  lineWidth: 3,
  // In line-width units: short dashes read as "on foot", not as a second route.
  lineDasharray: [1.2, 1.4],
  lineCap: 'butt' as const,
  lineJoin: 'round' as const,
  lineEmissiveStrength: 1,
};

const circleStyle = {
  circleRadius: [
    'step',
    ['zoom'],
    routeFeatureMarker.mapRadiusCompact,
    routeFeatureMarker.compactZoomThreshold,
    routeFeatureMarker.mapRadius,
  ] as any,
  circleColor: gray[800],
  circleStrokeColor: gray[50],
  circleStrokeWidth: 2,
  circleEmissiveStrength: 1,
};

const iconStyle = {
  iconImage: WALK_SPRITE,
  iconColor: gray[50],
  iconSize: [
    'step',
    ['zoom'],
    routeFeatureMarker.mapIconSizeCompact,
    routeFeatureMarker.compactZoomThreshold,
    routeFeatureMarker.mapIconSize,
  ] as any,
  iconAllowOverlap: true,
  iconIgnorePlacement: true,
};

export interface WalkSectionLayerProps {
  /** Walk sections of the SELECTED route only; undefined or empty draws nothing. */
  readonly walkSections: readonly WalkSection[] | undefined;
}

export const WalkSectionLayer = React.memo(({ walkSections }: WalkSectionLayerProps) => {
  const sections = walkSections ?? [];

  const lines = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: sections
        .filter((section) => section.coordinates.length >= 2)
        .map((section) => ({
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: section.coordinates },
        })),
    }),
    [sections],
  );

  const markers = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: sections
        .filter((section) => section.distanceMeters >= SHORT_WALK_MAX_METERS && section.coordinates.length > 0)
        .map((section) => ({
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Point' as const, coordinates: section.coordinates[0] },
        })),
    }),
    [sections],
  );

  return (
    <>
      <Mapbox.Images images={SDF_IMAGES as any} />
      <Mapbox.ShapeSource id="walk-sections" shape={lines as any}>
        <Mapbox.LineLayer id="walk-sections-dash" style={lineStyle as any} />
      </Mapbox.ShapeSource>
      <Mapbox.ShapeSource id="walk-section-markers" shape={markers as any}>
        <Mapbox.CircleLayer
          id="walk-section-marker-circle"
          minZoomLevel={routeFeatureMarker.minZoom}
          style={circleStyle as any}
        />
        <Mapbox.SymbolLayer
          id="walk-section-marker-icon"
          minZoomLevel={routeFeatureMarker.minZoom}
          style={iconStyle as any}
        />
      </Mapbox.ShapeSource>
    </>
  );
});

WalkSectionLayer.displayName = 'WalkSectionLayer';
