import type { Coordinate } from '@defensivepedal/core';

import { createOverpassPointClient, type OverpassElement } from './overpassClient';

export interface BikeShopLocation {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly name?: string;
  readonly repairService?: boolean;
  readonly rentalService?: boolean;
}

const parseElement = (element: OverpassElement): BikeShopLocation => ({
  id: `osm-shop-${element.id}`,
  lat: element.lat,
  lon: element.lon,
  name: element.tags?.name ?? undefined,
  repairService: element.tags?.['service:bicycle:repair'] === 'yes',
  rentalService: element.tags?.['service:bicycle:rental'] === 'yes',
});

/**
 * Fetch bicycle shops and repair stations from OpenStreetMap via Overpass.
 * Queries: shop=bicycle OR craft=bicycle OR amenity=bicycle_repair_station.
 * Fails gracefully — returns empty array on error or rate limit.
 */
export const fetchBikeShopsNearRoute: (
  origin: Coordinate,
  destination: Coordinate,
) => Promise<BikeShopLocation[]> = createOverpassPointClient<BikeShopLocation>({
  buildQuery: (bbox) => {
    const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
    return `[out:json][timeout:10];(node["shop"="bicycle"](${b});node["craft"="bicycle"](${b});node["amenity"="bicycle_repair_station"](${b}););out body;`;
  },
  parseElement,
});
