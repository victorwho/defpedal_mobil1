import Mapbox from '@rnmapbox/maps';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useReducedMotion } from '../../../design-system/hooks/useReducedMotion';
import { brandColors, gray, safetyColors } from '../../../design-system/tokens/colors';
import { useAppStore } from '../../../store/appStore';

// ---------------------------------------------------------------------------
// Hoisted constants for non-animated layers
// ---------------------------------------------------------------------------

const RADIUS_TRANSITION = { duration: 200, delay: 0 };

// Origin: small green dot — "you are here" (understated)
const originMarkerStyle = {
  circleColor: safetyColors.safe,
  circleRadius: 6,
  circleStrokeColor: gray[50],
  circleStrokeWidth: 2,
  circleEmissiveStrength: 1,
};

const waypointMarkerStyle = {
  circleColor: brandColors.accent,
  circleRadius: 10,
  circleStrokeColor: gray[50],
  circleStrokeWidth: 2,
  circleEmissiveStrength: 1,
};

// Numbered "Stop N" label centered in the waypoint pin. Dark text on the
// yellow accent disc (mirrors the SearchedPoi / Overpass POI label pattern).
const waypointLabelStyle = {
  textField: ['get', 'label'] as any,
  textSize: 12,
  textColor: '#1A1A1A',
  textAllowOverlap: true,
  textIgnorePlacement: true,
  textEmissiveStrength: 1,
};

const userMarkerStyle = {
  circleColor: safetyColors.info,
  circleRadius: 7,
  circleStrokeColor: brandColors.textPrimary,
  circleStrokeWidth: 3,
  circleEmissiveStrength: 1,
};

const offRouteConnectorStyle = {
  lineColor: safetyColors.caution,
  lineWidth: 3,
  lineDasharray: [1.2, 1.2],
  lineOpacity: 0.95,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
  lineEmissiveStrength: 1,
};

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

const originFilter: any = ['==', ['get', 'kind'], 'origin'];
const destinationFilter: any = ['==', ['get', 'kind'], 'destination'];
const waypointFilter: any = ['all', ['has', 'kind'], ['!=', ['get', 'kind'], 'origin'], ['!=', ['get', 'kind'], 'destination'], ['!=', ['get', 'kind'], 'user']];
const userFilter: any = ['==', ['get', 'kind'], 'user'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type MarkerLayersProps = {
  markerFeatureCollection: any;
  offRouteFeatureCollection: any;
};

/**
 * Renders origin (green dot), destination (red bullseye), waypoints (yellow),
 * and user (blue with border) circle markers, plus the off-route dashed connector line.
 *
 * Motion: when a NEW destination appears (coordinate key changes), the
 * destination bullseye scales from 0 → 1.25 → 1.0 via Mapbox native
 * circleRadiusTransition (200ms each phase). Replays only on coordinate
 * change. Suppressed during NAVIGATING and reduced motion.
 */
const MarkerLayersInner = ({
  markerFeatureCollection,
  offRouteFeatureCollection,
}: MarkerLayersProps) => {
  const reducedMotion = useReducedMotion();
  const isNavigating = useAppStore((s) => s.appState === 'NAVIGATING');
  const skipDrop = reducedMotion || isNavigating;

  // Drop phase — drives the destination radius multiplier.
  // 'pre' = 0× (invisible) | 'overshoot' = 1.25× | 'rest' = 1×
  const [dropPhase, setDropPhase] = useState<'pre' | 'overshoot' | 'rest'>(
    skipDrop ? 'rest' : 'rest',
  );
  const lastDestKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const destFeat: any = markerFeatureCollection.features.find(
      (f: any) => f?.properties?.kind === 'destination',
    );
    if (!destFeat) {
      lastDestKeyRef.current = null;
      return;
    }
    const coords = destFeat.geometry?.coordinates;
    const key = Array.isArray(coords) && coords.length >= 2
      ? `${coords[0].toFixed(5)},${coords[1].toFixed(5)}`
      : null;
    if (!key || key === lastDestKeyRef.current) return;
    lastDestKeyRef.current = key;

    if (skipDrop) {
      setDropPhase('rest');
      return;
    }
    setDropPhase('pre');
    const t1 = setTimeout(() => setDropPhase('overshoot'), 16);
    const t2 = setTimeout(() => setDropPhase('rest'), 16 + 200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [markerFeatureCollection, skipDrop]);

  const dropMultiplier =
    dropPhase === 'pre' ? 0 : dropPhase === 'overshoot' ? 1.25 : 1;

  // Destination layers — radius animated via state * RADIUS_TRANSITION.
  const destinationOuterStyle = useMemo(
    () => ({
      circleColor: '#EF4444',
      circleRadius: 11 * dropMultiplier,
      circleRadiusTransition: RADIUS_TRANSITION,
      circleStrokeColor: gray[50],
      circleStrokeWidth: 2,
      circleEmissiveStrength: 1,
    }),
    [dropMultiplier],
  );

  const destinationInnerStyle = useMemo(
    () => ({
      circleColor: '#FFFFFF',
      circleRadius: 4 * dropMultiplier,
      circleRadiusTransition: RADIUS_TRANSITION,
      circleEmissiveStrength: 1,
    }),
    [dropMultiplier],
  );

  return (
    <>
      {markerFeatureCollection.features.length > 0 ? (
        <Mapbox.ShapeSource id="route-markers" shape={markerFeatureCollection}>
          <Mapbox.CircleLayer id="route-marker-origin" existing filter={originFilter} style={originMarkerStyle} />
          {/* Destination: outer red ring + inner white dot = bullseye target. Radius animates on drop. */}
          <Mapbox.CircleLayer id="route-marker-destination-outer" existing filter={destinationFilter} style={destinationOuterStyle} />
          <Mapbox.CircleLayer id="route-marker-destination-inner" existing filter={destinationFilter} style={destinationInnerStyle} />
          <Mapbox.CircleLayer id="route-marker-waypoint" existing filter={waypointFilter} style={waypointMarkerStyle} />
          <Mapbox.SymbolLayer id="route-marker-waypoint-label" existing filter={waypointFilter} style={waypointLabelStyle} />
          <Mapbox.CircleLayer id="route-marker-user" existing filter={userFilter} style={userMarkerStyle} />
        </Mapbox.ShapeSource>
      ) : null}

      {offRouteFeatureCollection.features.length > 0 ? (
        <Mapbox.ShapeSource id="off-route-connector" shape={offRouteFeatureCollection}>
          <Mapbox.LineLayer id="off-route-connector-layer" existing style={offRouteConnectorStyle} />
        </Mapbox.ShapeSource>
      ) : null}
    </>
  );
};

export const MarkerLayers = React.memo(MarkerLayersInner);

MarkerLayers.displayName = 'MarkerLayers';
