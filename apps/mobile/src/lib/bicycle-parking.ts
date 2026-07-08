import type { Coordinate } from '@defensivepedal/core';

import { createOverpassPointClient, type OverpassElement } from './overpassClient';

export interface BicycleParkingLocation {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly name?: string;
  readonly capacity?: number;
  readonly covered?: boolean;
}

const parseElement = (element: OverpassElement): BicycleParkingLocation => ({
  id: `osm-${element.id}`,
  lat: element.lat,
  lon: element.lon,
  name: element.tags?.name ?? undefined,
  capacity: element.tags?.capacity ? Number(element.tags.capacity) : undefined,
  covered: element.tags?.covered === 'yes' ? true : element.tags?.covered === 'no' ? false : undefined,
});

/**
 * Fetch bicycle parking locations from OpenStreetMap via the Overpass API.
 * Returns locations within a bounding box around the route.
 * Fails gracefully — returns an empty array on any error.
 */
export const fetchBicycleParkingNearRoute: (
  origin: Coordinate,
  destination: Coordinate,
) => Promise<BicycleParkingLocation[]> = createOverpassPointClient<BicycleParkingLocation>({
  buildQuery: (bbox) =>
    `[out:json][timeout:10];node["amenity"="bicycle_parking"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});out body;`,
  parseElement,
});
