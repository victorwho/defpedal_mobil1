'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
// Explicit module import instead of the global `GeoJSON` namespace: the
// namespace only exists while @types/mapbox-gl (a deprecated stub since
// mapbox-gl ships its own types) transitively pulls @types/geojson — a
// mapbox-gl bump removes it and breaks the build (Dependabot PR #41,
// 2026-07-06). @types/geojson is now a direct devDependency.
import type { Feature } from 'geojson';
import { decodePolyline, type RouteShareRiskCategory } from '@defensivepedal/core';
import type { RouteSharePublicView } from '../lib/routeShareTypes';

interface ShareMapProps {
  share: RouteSharePublicView;
}

// Safety-colored polyline per PRD user story 29. Colors match the mobile design-system
// safetyColors + riskDistribution category scheme: green=safe, amber=moderate, red=dangerous,
// black=extreme. Category labels themselves are not sensitive (they're user-facing on the
// mobile map during route preview) — the numeric score thresholds remain server-side only.
const RISK_COLORS: Record<RouteShareRiskCategory, string> = {
  very_safe: '#22C55E',
  safe: '#22C55E',
  moderate: '#F59E0B',
  dangerous: '#EF4444',
  extreme: '#000000',
};
const FALLBACK_ROUTE_COLOR = '#22C55E';

/**
 * Stretches with no risk rating. Deliberately the "no data" blue rather than a
 * risk colour: absence of a rating is not a level, and a trimmed share genuinely
 * has no data for the stretches the privacy trim removed.
 */
const NO_DATA_COLOR = '#3B82F6';

/**
 * Features from server-supplied colour ranges, filling the gaps between them
 * with NO_DATA_COLOR.
 *
 * Gaps are filled rather than left undrawn: a privacy-trimmed share has no risk
 * data for its cut head and tail, and an undrawn gap would read as a broken map
 * rather than as missing data. The colours come from the payload and are never
 * derived here — the score cuts behind them are server-side IP.
 */
function buildColorRangeFeatures(
  coords: Array<[number, number]>,
  ranges: RouteSharePublicView['route']['riskColorSegments'],
): Feature[] {
  const features: Feature[] = [];
  let cursor = 0;

  const push = (from: number, to: number, color: string) => {
    const slice = coords.slice(from, to + 1);
    if (slice.length < 2) return;
    features.push({
      type: 'Feature',
      properties: { color },
      geometry: { type: 'LineString', coordinates: slice },
    });
  };

  for (const range of ranges) {
    const start = Math.max(0, Math.min(range.startIndex, coords.length - 1));
    const end = Math.max(0, Math.min(range.endIndex, coords.length - 1));
    if (end <= start) continue;

    // Overlapping ranges would double-draw; keep the first that covers a stretch.
    if (start > cursor) push(cursor, start, NO_DATA_COLOR);
    if (end > cursor) {
      push(Math.max(cursor, start), end, range.color);
      cursor = end;
    }
  }

  if (cursor < coords.length - 1) push(cursor, coords.length - 1, NO_DATA_COLOR);
  return features;
}

function computeBounds(coords: Array<[number, number]>): mapboxgl.LngLatBounds {
  const bounds = new mapboxgl.LngLatBounds(coords[0], coords[0]);
  for (const c of coords) bounds.extend(c);
  return bounds;
}

function buildSegmentFeatures(
  coords: Array<[number, number]>,
  riskSegments: RouteSharePublicView['route']['riskSegments'],
): Feature[] {
  if (riskSegments.length === 0) {
    return [
      {
        type: 'Feature',
        properties: { riskCategory: 'safe' satisfies RouteShareRiskCategory },
        geometry: { type: 'LineString', coordinates: coords },
      },
    ];
  }
  const features: Feature[] = [];
  for (const seg of riskSegments) {
    const slice = coords.slice(
      Math.max(0, seg.startIndex),
      Math.min(coords.length, seg.endIndex + 1),
    );
    if (slice.length < 2) continue;
    features.push({
      type: 'Feature',
      properties: { riskCategory: seg.riskCategory },
      geometry: { type: 'LineString', coordinates: slice },
    });
  }
  return features;
}

export function ShareMap({ share }: ShareMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      containerRef.current.innerHTML =
        '<div style="padding:24px;color:#EF4444">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN is not configured.</div>';
      return;
    }
    mapboxgl.accessToken = token;

    const { origin, destination, geometryPolyline6, riskSegments } = share.route;
    // Core's decoder already returns [lon, lat] at the default precision 1e6 — matches the
    // "polyline6" naming (6 decimal digits). Passing `6` as precision divides coordinates by 6,
    // producing latitudes in the millions that LngLat rejects.
    const coords: Array<[number, number]> = decodePolyline(geometryPolyline6);
    const bounds = computeBounds(coords);
    /*
     * Prefer the colour ranges when the payload carries them.
     *
     * They index the polyline AS SERVED, so the set must match what we actually
     * received: the RPC serves the TRIMMED polyline when endpoints are hidden,
     * and applying full-line indices to it would paint real colours onto the
     * wrong roads. `endpointsHidden` is the discriminator.
     *
     * `riskSegments` (the older five-level category shape) stays as the fallback
     * so shares created before this existed keep rendering exactly as they did.
     */
    const colorRanges = share.endpointsHidden
      ? share.route.trimmedRiskColorSegments
      : share.route.riskColorSegments;

    const features =
      colorRanges.length > 0
        ? buildColorRangeFeatures(coords, colorRanges)
        : buildSegmentFeatures(coords, riskSegments);
    const usingColorRanges = colorRanges.length > 0;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/standard',
      bounds,
      fitBoundsOptions: { padding: 48 },
      attributionControl: true,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-width': 6,
          'line-color': usingColorRanges
            ? ['get', 'color']
            : [
                'match',
                ['get', 'riskCategory'],
                'very_safe', RISK_COLORS.very_safe,
                'safe', RISK_COLORS.safe,
                'moderate', RISK_COLORS.moderate,
                'dangerous', RISK_COLORS.dangerous,
                'extreme', RISK_COLORS.extreme,
                FALLBACK_ROUTE_COLOR,
              ],
          // Matches mobile overlay convention — immune to day/night basemap lighting.
          'line-emissive-strength': 1,
        },
      });

      // Slice 6: when the public view hides endpoints, derive the start/end
      // marker positions from the first and last points of the trimmed
      // polyline rather than from the raw origin/destination. The raw
      // origin/destination are the sharer's actual home/work coordinates —
      // pinning them on the map would defeat the whole privacy trim.
      //
      // When endpointsHidden=false (public-sharer opt-out, short-route
      // fallback where no trim happened, or slice-1 grandfathered shares
      // with the flag off), the original origin/destination is the correct
      // position and matches the polyline endpoints exactly.
      const [startLonLat, endLonLat] = share.endpointsHidden
        ? [coords[0], coords[coords.length - 1]]
        : [
            [origin.lon, origin.lat] as [number, number],
            [destination.lon, destination.lat] as [number, number],
          ];
      new mapboxgl.Marker({ color: '#22C55E' })
        .setLngLat(startLonLat)
        .addTo(map);
      new mapboxgl.Marker({ color: '#FACC15' })
        .setLngLat(endLonLat)
        .addTo(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [share]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Shared cycling route map with safety-colored segments"
      style={{ width: '100%', height: '100%', minHeight: 280, background: '#111827' }}
    />
  );
}
