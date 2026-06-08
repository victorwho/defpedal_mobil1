import type { Coordinate } from '@defensivepedal/core';
import type { PoiVisibility } from './types';

export const DEFAULT_CENTER: [number, number] = [26.1025, 44.4268];

export const STANDARD_STYLE_URL = 'mapbox://styles/mapbox/standard';

export const LIGHT_REFRESH_MS = 30 * 60 * 1000; // 30 minutes

export const getLightPreset = (): string => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 8) return 'dawn';
  if (hour >= 18 && hour < 20) return 'dusk';
  if (hour >= 20 || hour < 6) return 'night';
  return 'day';
};

export const toMarkerFeature = (
  coordinate: Coordinate | undefined,
  kind: 'origin' | 'destination' | 'user' | `waypoint-${number}`,
) => {
  if (!coordinate) {
    return null;
  }

  // Waypoint kinds carry a 0-based index ("waypoint-0"); surface it as a
  // 1-based `label` so the marker renders a numbered pin ("Stop 1, 2, 3…").
  const waypointIndex =
    typeof kind === 'string' && kind.startsWith('waypoint-')
      ? Number(kind.slice('waypoint-'.length))
      : NaN;
  const label = Number.isInteger(waypointIndex) ? String(waypointIndex + 1) : undefined;

  return {
    type: 'Feature' as const,
    properties: label !== undefined ? { kind, label } : { kind },
    geometry: {
      type: 'Point' as const,
      coordinates: [coordinate.lon, coordinate.lat] as [number, number],
    },
  };
};

/** Map Mapbox maki icons to human-readable POI type labels */
export const MAKI_TO_TYPE: Record<string, string> = {
  'drinking-water': 'Water Fountain',
  'cafe': 'Cafe',
  'bicycle': 'Bike Shop',
  'toilet': 'Restroom',
  'bicycle-share': 'Bike Rental',
  'convenience': 'Convenience Store',
  'grocery': 'Grocery Store',
};

/** Map Mapbox Search category to our label letter */
export const CATEGORY_TO_LABEL: Record<string, string> = {
  fountain: 'W', cafe: 'W', coffee_shop: 'W',
  convenience_store: 'S', supermarket: 'S', grocery: 'S',
};

/** Map Mapbox Search categories to our visibility keys */
export const CATEGORY_TO_VIS_KEY: Record<string, keyof PoiVisibility> = {
  fountain: 'hydration', cafe: 'hydration', coffee_shop: 'hydration',
  convenience_store: 'supplies', supermarket: 'supplies', grocery: 'supplies',
};
