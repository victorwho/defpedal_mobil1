import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchBicycleRentalNearRoute } from './bicycle-rental';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const origin = { lat: 44.43, lon: 26.1 };
const destination = { lat: 44.44, lon: 26.12 };

const createRentalElement = (overrides?: Partial<{
  id: number;
  lat: number;
  lon: number;
  name: string;
  operator: string;
  capacity: string;
  network: string;
  disused: boolean;
  abandoned: boolean;
}>) => ({
  type: 'node',
  id: overrides?.id ?? 2001,
  lat: overrides?.lat ?? 44.435,
  lon: overrides?.lon ?? 26.11,
  tags: {
    amenity: 'bicycle_rental',
    ...(overrides?.name ? { name: overrides.name } : {}),
    ...(overrides?.operator ? { operator: overrides.operator } : {}),
    ...(overrides?.capacity ? { capacity: overrides.capacity } : {}),
    ...(overrides?.network ? { network: overrides.network } : {}),
    ...(overrides?.disused ? { 'disused:amenity': 'bicycle_rental' } : {}),
    ...(overrides?.abandoned ? { 'abandoned:amenity': 'bicycle_rental' } : {}),
  },
});

const mockFetchResponse = (data: unknown, ok = true) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchBicycleRentalNearRoute', () => {
  it('returns rental locations from Overpass API', async () => {
    const element = createRentalElement({
      id: 2001,
      name: 'CityBike Station',
      operator: 'CityBike',
      capacity: '15',
      network: 'CityBike Bucharest',
    });

    mockFetchResponse({ elements: [element] });

    const result = await fetchBicycleRentalNearRoute(origin, destination);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'osm-rental-2001',
      lat: 44.435,
      lon: 26.11,
      name: 'CityBike Station',
      operator: 'CityBike',
      capacity: 15,
      network: 'CityBike Bucharest',
    });
  });

  it('returns empty array on non-OK response', async () => {
    mockFetchResponse(null, false);

    const result = await fetchBicycleRentalNearRoute(origin, destination);

    expect(result).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchBicycleRentalNearRoute(origin, destination);

    expect(result).toEqual([]);
  });

  it('filters out disused rental stations', async () => {
    const active = createRentalElement({ id: 1 });
    const disused = createRentalElement({ id: 2, disused: true });

    mockFetchResponse({ elements: [active, disused] });

    const result = await fetchBicycleRentalNearRoute(origin, destination);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('osm-rental-1');
  });

  it('filters out abandoned rental stations', async () => {
    const active = createRentalElement({ id: 1 });
    const abandoned = createRentalElement({ id: 2, abandoned: true });

    mockFetchResponse({ elements: [active, abandoned] });

    const result = await fetchBicycleRentalNearRoute(origin, destination);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('osm-rental-1');
  });

  it('filters out non-node elements', async () => {
    const nodeElement = createRentalElement({ id: 1 });
    const wayElement = { ...createRentalElement({ id: 2 }), type: 'way' };

    mockFetchResponse({ elements: [nodeElement, wayElement] });

    const result = await fetchBicycleRentalNearRoute(origin, destination);

    expect(result).toHaveLength(1);
  });

  it('handles empty elements array', async () => {
    mockFetchResponse({ elements: [] });

    const result = await fetchBicycleRentalNearRoute(origin, destination);

    expect(result).toEqual([]);
  });

  it('handles missing optional fields', async () => {
    const element = createRentalElement({ id: 3001 });
    mockFetchResponse({ elements: [element] });

    const result = await fetchBicycleRentalNearRoute(origin, destination);

    expect(result[0].name).toBeUndefined();
    expect(result[0].operator).toBeUndefined();
    expect(result[0].capacity).toBeUndefined();
    expect(result[0].network).toBeUndefined();
  });

  it('sends correct Overpass query for multiple patterns', async () => {
    mockFetchResponse({ elements: [] });

    await fetchBicycleRentalNearRoute(origin, destination);

    const body = vi.mocked(fetch).mock.calls[0][1]?.body as string;
    // Should query for bicycle_rental, docking_station, and shop with rental service
    expect(body).toContain('bicycle_rental');
    expect(body).toContain('docking_station');
  });
});
