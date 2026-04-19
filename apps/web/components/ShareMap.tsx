'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
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

function computeBounds(coords: Array<[number, number]>): mapboxgl.LngLatBounds {
  const bounds = new mapboxgl.LngLatBounds(coords[0], coords[0]);
  for (const c of coords) bounds.extend(c);
  return bounds;
}

function buildSegmentFeatures(
  coords: Array<[number, number]>,
  riskSegments: RouteSharePublicView['route']['riskSegments'],
): GeoJSON.Feature[] {
  if (riskSegments.length === 0) {
    return [
      {
        type: 'Feature',
        properties: { riskCategory: 'safe' satisfies RouteShareRiskCategory },
        geometry: { type: 'LineString', coordinates: coords },
      },
    ];
  }
  const features: GeoJSON.Feature[] = [];
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
    const features = buildSegmentFeatures(coords, riskSegments);

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
          'line-color': [
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

      // Origin (green) and destination (yellow) markers — coords from contract are {lat, lon}
      // objects. When endpointsHidden=true the server has already trimmed them, so these are
      // the visible endpoints, not the true ride start/finish.
      new mapboxgl.Marker({ color: '#22C55E' })
        .setLngLat([origin.lon, origin.lat])
        .addTo(map);
      new mapboxgl.Marker({ color: '#FACC15' })
        .setLngLat([destination.lon, destination.lat])
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
