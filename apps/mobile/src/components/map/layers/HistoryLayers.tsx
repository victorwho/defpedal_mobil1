import Mapbox from '@rnmapbox/maps';
import React, { useMemo } from 'react';

// ---------------------------------------------------------------------------
// Hoisted styles for Mapbox layer performance (avoid recreation on every render)
// ---------------------------------------------------------------------------

const SAFE_COLOR = '#22C55E';
const FAST_COLOR = '#3B82F6';

const historyOverlayStyle = {
  lineColor: ['get', 'color'] as any,
  lineWidth: 5,
  lineOpacity: 0.8,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
  lineEmissiveStrength: 1,
};

const gpsTrailStyle = {
  lineColor: '#2196F3',
  lineWidth: 4,
  lineOpacity: 0.9,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
  lineEmissiveStrength: 1,
};

// Risk-coloured planned route. Same `['get','color']` technique as
// historyOverlayStyle above — the colour travels on each feature so one
// ShapeSource can draw a multi-coloured line.
const plannedRouteRiskStyle = {
  lineColor: ['get', 'color'] as any,
  lineWidth: 4,
  lineOpacity: 0.85,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
  lineEmissiveStrength: 1,
};

// Base style for planned route (lineColor is dynamic, applied via useMemo)
const plannedRouteBaseStyle = {
  lineWidth: 4,
  lineOpacity: 0.7,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
  lineEmissiveStrength: 1,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type HistoryTrail = {
  coordinates: readonly [number, number][];
  mode: 'safe' | 'fast' | 'flat';
};

type HistoryLayersProps = {
  trailFeatureCollection: any | null;
  plannedRouteFeatureCollection: any | null;
  plannedRouteColor: string;
  /**
   * Risk-coloured stretches of the planned route. When non-empty these REPLACE
   * the flat `plannedRouteColor` line; when empty the flat line is drawn as
   * before. Empty is the honest state outside the covered countries and on any
   * fetch failure, so it must stay a supported case rather than a bug.
   */
  plannedRouteRiskCollection?: any | null;
  /** Past ride GPS trails for personal safety overlay */
  historyTrails?: readonly HistoryTrail[];
};

/**
 * Renders trip history layers: planned route (green/custom color),
 * GPS trail (blue), and optional personal history overlay.
 */
export const HistoryLayers = React.memo(({
  trailFeatureCollection,
  plannedRouteFeatureCollection,
  plannedRouteColor,
  plannedRouteRiskCollection,
  historyTrails,
}: HistoryLayersProps) => {
  const historyOverlayCollection = useMemo(() => {
    if (!historyTrails || historyTrails.length === 0) return null;
    return {
      type: 'FeatureCollection' as const,
      features: historyTrails
        .filter((t) => t.coordinates.length >= 2)
        .map((trail, i) => ({
          type: 'Feature' as const,
          id: `history-ride-${i}`,
          properties: { color: trail.mode === 'safe' ? SAFE_COLOR : FAST_COLOR },
          geometry: {
            type: 'LineString' as const,
            coordinates: trail.coordinates,
          },
        })),
    };
  }, [historyTrails]);

  // Memoize style with dynamic color to prevent recreation on every render
  const plannedRouteStyle = useMemo(
    () => ({ ...plannedRouteBaseStyle, lineColor: plannedRouteColor }),
    [plannedRouteColor],
  );

  return (
  <>
    {historyOverlayCollection && historyOverlayCollection.features.length > 0 ? (
      <Mapbox.ShapeSource id="history-overlay" shape={historyOverlayCollection as any}>
        <Mapbox.LineLayer id="history-overlay-layer" style={historyOverlayStyle} />
      </Mapbox.ShapeSource>
    ) : null}

    {/*
      Risk colouring wins when it exists, otherwise the flat line. Rendered as
      an either/or rather than stacked: drawing both would leave the flat colour
      showing through wherever risk data is missing mid-route, which reads as a
      rendering fault rather than as absent data.
    */}
    {plannedRouteRiskCollection ? (
      <Mapbox.ShapeSource id="history-planned-route-risk" shape={plannedRouteRiskCollection}>
        <Mapbox.LineLayer id="history-planned-route-risk-layer" style={plannedRouteRiskStyle} />
      </Mapbox.ShapeSource>
    ) : plannedRouteFeatureCollection ? (
      <Mapbox.ShapeSource id="history-planned-route" shape={plannedRouteFeatureCollection}>
        <Mapbox.LineLayer id="history-planned-route-layer" style={plannedRouteStyle} />
      </Mapbox.ShapeSource>
    ) : null}

    {trailFeatureCollection ? (
      <Mapbox.ShapeSource id="history-trail" shape={trailFeatureCollection}>
        <Mapbox.LineLayer id="history-trail-layer" style={gpsTrailStyle} />
      </Mapbox.ShapeSource>
    ) : null}
  </>
  );
});

HistoryLayers.displayName = 'HistoryLayers';
