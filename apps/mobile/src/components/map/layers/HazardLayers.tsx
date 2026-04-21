import type { NearbyHazard } from '@defensivepedal/core';
import Mapbox from '@rnmapbox/maps';
import React, { useCallback, useRef } from 'react';

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

/**
 * Individual hazard marker circle — only renders for features without
 * `point_count` (i.e., unclustered points).
 */
const hazardMarkerStyle = {
  circleColor: safetyColors.caution,
  circleRadius: 9,
  circleStrokeColor: brandColors.textPrimary,
  circleStrokeWidth: 2,
  circleOpacity: 0.9,
  circleEmissiveStrength: 1,
};

const hazardMarkerLabelStyle = {
  textField: '!',
  textSize: 13,
  textColor: brandColors.textPrimary,
  textAllowOverlap: true,
  textIgnorePlacement: true,
  textEmissiveStrength: 1,
};

/**
 * Cluster bubble — color by worst-case severity in the cluster
 * (`clusterProperties.max_severity`: 1 = low / 2 = medium / 3 = high),
 * size scales with `point_count`.
 */
const hazardClusterBubbleStyle = {
  circleRadius: ['step', ['get', 'point_count'], 16, 5, 22, 15, 28] as any,
  circleColor: [
    'step',
    ['get', 'max_severity'],
    safetyColors.caution, // 1 (default / low)
    2,
    '#F57C00', // 2 medium (amber-orange) — inline per team-lead decision
    3,
    safetyColors.danger, // 3 high
  ] as any,
  circleStrokeColor: brandColors.textPrimary,
  circleStrokeWidth: 2,
  circleOpacity: 0.95,
  circleEmissiveStrength: 1,
};

const hazardClusterCountStyle = {
  textField: ['get', 'point_count_abbreviated'] as any,
  textSize: 13,
  textColor: brandColors.textInverse,
  textAllowOverlap: true,
  textIgnorePlacement: true,
  textEmissiveStrength: 1,
};

const hazardHitbox = { width: 44, height: 44 };

// ---------------------------------------------------------------------------
// Cluster expression — maps hazardType to a severity tier (1/2/3). Hoisted to
// avoid re-parsing per render.
// ---------------------------------------------------------------------------

const clusterProperties = {
  max_severity: [
    'max',
    [
      'case',
      [
        'in',
        ['get', 'hazardType'],
        [
          'literal',
          ['aggressive_traffic', 'poor_surface', 'construction'],
        ],
      ],
      3,
      [
        'in',
        ['get', 'hazardType'],
        [
          'literal',
          ['pothole', 'dangerous_intersection', 'blocked_bike_lane'],
        ],
      ],
      2,
      1,
    ],
  ] as any,
};

const EMPTY_FEATURE_COLLECTION = {
  type: 'FeatureCollection' as const,
  features: [] as any[],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Hazard marker payload delivered on tap. Widened from the pre-vote
 * `{ id, type, confirmCount, denyCount }` shape to the full `NearbyHazard`
 * so the detail sheet can render `score`, `userVote`, `expiresAt`,
 * `lastConfirmedAt` without an extra fetch.
 */
export type HazardPressPayload = NearbyHazard;

export interface HazardLayersProps {
  hazardZoneFeatureCollection: { type: 'FeatureCollection'; features: unknown[] };
  hazardFeatureCollection: { type: 'FeatureCollection'; features: unknown[] };
  onHazardPress?: (hazard: HazardPressPayload) => void;
  /** Camera ref used to zoom in when a cluster is tapped. */
  cameraRef?: React.RefObject<Mapbox.Camera | null>;
  /**
   * When true, cluster taps are ignored (used during NAVIGATING so the 3D
   * follow camera isn't broken by an accidental tap). Individual marker taps
   * are always delivered.
   */
  suppressClusterTaps?: boolean;
}

export const HazardLayers = React.memo(
  ({
    hazardZoneFeatureCollection,
    hazardFeatureCollection,
    onHazardPress,
    cameraRef,
    suppressClusterTaps = false,
  }: HazardLayersProps) => {
    const clusterSourceRef = useRef<Mapbox.ShapeSource | null>(null);

    const handlePress = useCallback(
      (event: any) => {
        const feature = event?.features?.[0];
        if (!feature?.properties) return;

        const isCluster = Boolean(feature.properties.cluster);
        if (isCluster) {
          if (suppressClusterTaps) return;
          const clusterId = feature.properties.cluster_id;
          const centerCoords = feature.geometry?.coordinates;
          const source = clusterSourceRef.current as any;
          if (source?.getClusterExpansionZoom && clusterId != null) {
            source
              .getClusterExpansionZoom(clusterId)
              .then((zoom: number) => {
                if (
                  Array.isArray(centerCoords) &&
                  centerCoords.length >= 2 &&
                  cameraRef?.current
                ) {
                  cameraRef.current.setCamera({
                    centerCoordinate: centerCoords as [number, number],
                    zoomLevel: zoom,
                    animationDuration: 400,
                  });
                }
              })
              .catch(() => {});
          }
          return;
        }

        if (!onHazardPress) return;
        const p = feature.properties;
        const coords = Array.isArray(feature.geometry?.coordinates)
          ? feature.geometry.coordinates
          : [0, 0];
        const confirmCount = Number(p.confirmCount ?? 0);
        const denyCount = Number(p.denyCount ?? 0);
        const payload: NearbyHazard = {
          id: String(p.id ?? ''),
          lat: Number(coords[1] ?? 0),
          lon: Number(coords[0] ?? 0),
          hazardType: (p.hazardType ?? p.type ?? 'other') as NearbyHazard['hazardType'],
          createdAt: String(p.createdAt ?? p.reportedAt ?? ''),
          confirmCount,
          denyCount,
          score: Number(p.score ?? confirmCount - denyCount),
          userVote: (p.userVote ?? null) as NearbyHazard['userVote'],
          expiresAt: String(p.expiresAt ?? ''),
          lastConfirmedAt: (p.lastConfirmedAt ?? null) as NearbyHazard['lastConfirmedAt'],
        };
        onHazardPress(payload);
      },
      [onHazardPress, cameraRef, suppressClusterTaps],
    );

    // error-log #12: ShapeSources render unconditionally so Mapbox RN can't
    // cache stale features from a prior mount. An empty FeatureCollection
    // renders zero symbols; do NOT reintroduce the old conditional-mount guard.
    const zoneShape =
      hazardZoneFeatureCollection.features.length > 0
        ? hazardZoneFeatureCollection
        : EMPTY_FEATURE_COLLECTION;
    const hazardShape =
      hazardFeatureCollection.features.length > 0
        ? hazardFeatureCollection
        : EMPTY_FEATURE_COLLECTION;

    return (
      <>
        <Mapbox.ShapeSource id="hazard-zones" shape={zoneShape as any}>
          <Mapbox.LineLayer id="hazard-zone-base" style={hazardZoneBaseStyle} />
          <Mapbox.LineLayer id="hazard-zone-stripe" style={hazardZoneStripeStyle} />
        </Mapbox.ShapeSource>

        <Mapbox.ShapeSource
          id="hazards"
          ref={clusterSourceRef as any}
          shape={hazardShape as any}
          cluster
          clusterRadius={50}
          clusterMaxZoomLevel={14}
          clusterProperties={clusterProperties as any}
          onPress={onHazardPress || cameraRef ? handlePress : undefined}
          hitbox={hazardHitbox}
        >
          {/* Cluster bubble + count (filter split on point_count per error-log #13 no-emoji rule). */}
          <Mapbox.CircleLayer
            id="hazard-cluster-bubble"
            filter={['has', 'point_count'] as any}
            style={hazardClusterBubbleStyle as any}
          />
          <Mapbox.SymbolLayer
            id="hazard-cluster-count"
            filter={['has', 'point_count'] as any}
            style={hazardClusterCountStyle as any}
          />

          {/* Individual marker (unclustered). */}
          <Mapbox.CircleLayer
            id="hazard-marker"
            filter={['!', ['has', 'point_count']] as any}
            style={hazardMarkerStyle}
          />
          <Mapbox.SymbolLayer
            id="hazard-marker-label"
            filter={['!', ['has', 'point_count']] as any}
            style={hazardMarkerLabelStyle}
          />
        </Mapbox.ShapeSource>
      </>
    );
  },
);

HazardLayers.displayName = 'HazardLayers';
