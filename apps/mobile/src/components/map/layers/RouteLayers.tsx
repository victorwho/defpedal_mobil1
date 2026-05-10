import Mapbox from '@rnmapbox/maps';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useReducedMotion } from '../../../design-system/hooks/useReducedMotion';
import { brandColors, gray } from '../../../design-system/tokens/colors';

// ---------------------------------------------------------------------------
// Hoisted constants for Mapbox layer performance
// ---------------------------------------------------------------------------

const LINE_TRANSITION = { duration: 500, delay: 0 };
const lineCommon = {
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
  lineEmissiveStrength: 1,
};

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

const unselectedFilter: any = ['!=', ['get', 'selected'], true];
const selectedFilter: any = ['==', ['get', 'selected'], true];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type RouteLayersProps = {
  routeFeatureCollection: any;
  riskFeatureCollection: any;
};

/**
 * Renders route alternative lines (unselected gray, selected accent) and
 * risk-colored segments on the selected route.
 *
 * Motion: on first appearance of a non-empty route, the line opacity ramps
 * from 0 → its target via Mapbox's native `lineOpacityTransition` (500ms).
 * Subsequent route changes (alternative selection, reroute) don't replay
 * the fade — the gate is set on first paint and never reset for the
 * lifetime of this component instance. Reduced motion: snaps opaque.
 */
const RouteLayersInner = ({
  routeFeatureCollection,
  riskFeatureCollection,
}: RouteLayersProps) => {
  const reducedMotion = useReducedMotion();
  const [opacityRamp, setOpacityRamp] = useState(reducedMotion ? 1 : 0);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (reducedMotion) {
      setOpacityRamp(1);
      hasAnimatedRef.current = true;
      return;
    }
    if (
      routeFeatureCollection.features.length > 0 &&
      !hasAnimatedRef.current
    ) {
      hasAnimatedRef.current = true;
      // Render at 0 this frame, then bump to 1 next frame so Mapbox sees the
      // change and animates via lineOpacityTransition.
      requestAnimationFrame(() => setOpacityRamp(1));
    }
  }, [routeFeatureCollection, reducedMotion]);

  const unselectedRouteStyle = useMemo(
    () => ({
      ...lineCommon,
      lineColor: gray[400],
      lineOpacity: opacityRamp * 0.6,
      lineOpacityTransition: LINE_TRANSITION,
      lineWidth: 4,
    }),
    [opacityRamp],
  );

  const selectedRouteStyle = useMemo(
    () => ({
      ...lineCommon,
      lineColor: brandColors.accent,
      lineOpacity: opacityRamp,
      lineOpacityTransition: LINE_TRANSITION,
      lineWidth: 6,
    }),
    [opacityRamp],
  );

  const riskSegmentStyle = useMemo(
    () => ({
      ...lineCommon,
      lineColor: ['get', 'color'] as any,
      lineWidth: 5,
      lineOpacity: opacityRamp * 0.95,
      lineOpacityTransition: LINE_TRANSITION,
    }),
    [opacityRamp],
  );

  return (
    <>
      {routeFeatureCollection.features.length > 0 ? (
        <Mapbox.ShapeSource id="route-alternatives" shape={routeFeatureCollection}>
          <Mapbox.LineLayer
            id="route-alternatives-unselected"
            filter={unselectedFilter}
            style={unselectedRouteStyle}
          />
          <Mapbox.LineLayer
            id="route-alternatives-selected"
            filter={selectedFilter}
            style={selectedRouteStyle}
          />
        </Mapbox.ShapeSource>
      ) : null}

      {riskFeatureCollection.features.length > 0 ? (
        <Mapbox.ShapeSource id="risk-segments" shape={riskFeatureCollection}>
          <Mapbox.LineLayer id="risk-segments-layer" style={riskSegmentStyle} />
        </Mapbox.ShapeSource>
      ) : null}
    </>
  );
};

export const RouteLayers = React.memo(RouteLayersInner);

RouteLayers.displayName = 'RouteLayers';
