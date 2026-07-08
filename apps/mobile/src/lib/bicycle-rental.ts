import type { Coordinate } from '@defensivepedal/core';

import { createOverpassPointClient, type OverpassElement } from './overpassClient';

export interface BicycleRentalLocation {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly name?: string;
  readonly operator?: string;
  readonly capacity?: number;
  readonly network?: string;
}

/**
 * Check if an element is disused/abandoned and should be excluded.
 */
const isDisused = (tags?: Record<string, string>): boolean => {
  if (!tags) return false;
  return (
    tags['disused:amenity'] === 'bicycle_rental' ||
    tags['abandoned:amenity'] === 'bicycle_rental'
  );
};

const parseElement = (element: OverpassElement): BicycleRentalLocation => ({
  id: `osm-rental-${element.id}`,
  lat: element.lat,
  lon: element.lon,
  name: element.tags?.name ?? undefined,
  operator: element.tags?.operator ?? undefined,
  capacity: element.tags?.capacity ? Number(element.tags.capacity) : undefined,
  network: element.tags?.network ?? undefined,
});

/**
 * Fetch bicycle rental locations from OpenStreetMap via the Overpass API.
 *
 * Matches:
 *   - amenity=bicycle_rental
 *   - bicycle_rental=docking_station
 *   - shop=bicycle + service:bicycle:rental=yes
 *
 * Excludes:
 *   - disused:amenity=bicycle_rental
 *   - abandoned:amenity=bicycle_rental
 *
 * Fails gracefully — returns an empty array on any error.
 */
export const fetchBicycleRentalNearRoute: (
  origin: Coordinate,
  destination: Coordinate,
) => Promise<BicycleRentalLocation[]> = createOverpassPointClient<BicycleRentalLocation>({
  buildQuery: (bbox) => {
    const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
    // All three OSM rental patterns in one request.
    return `[out:json][timeout:10];(node["amenity"="bicycle_rental"](${b});node["bicycle_rental"="docking_station"](${b});node["shop"="bicycle"]["service:bicycle:rental"="yes"](${b}););out body;`;
  },
  filterElement: (el) => !isDisused(el.tags),
  parseElement,
});
