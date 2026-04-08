import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchBikeShopsNearRoute } from './bicycle-shops';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const origin = { lat: 44.43, lon: 26.1 };
const destination = { lat: 44.44, lon: 26.12 };

const createShopElement = (overrides?: Partial<{
  id: number;
  lat: number;
  lon: number;
  name: string;
  repair: boolean;
  rental: boolean;
}>) => ({
  type: 'node',
  id: overrides?.id ?? 3001,
  lat: overrides?.lat ?? 44.435,
  lon: overrides?.lon ?? 26.11,
  tags: {
    shop: 'bicycle',
    ...(overrides?.name ? { name: overrides.name } : {}),
    ...(overrides?.repair ? { 'service:bicycle:repair': 'yes' } : {}),
    ...(overrides?.rental ? { 'service:bicycle:rental': 'yes' } : {}),
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

describe('fetchBikeShopsNearRoute', () => {
  it('returns bike shop locations from Overpass API', async () => {
    const element = createShopElement({
      id: 3001,
      name: 'Bike Fix Pro',
      repair: true,
      rental: true,
    });

    mockFetchResponse({ elements: [element] });

    const result = await fetchBikeShopsNearRoute(origin, destination);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'osm-shop-3001',
      lat: 44.435,
      lon: 26.11,
      name: 'Bike Fix Pro',
      repairService: true,
      rentalService: true,
    });
  });

  it('returns empty array on non-OK response', async () => {
    mockFetchResponse(null, false);

    const result = await fetchBikeShopsNearRoute(origin, destination);

    expect(result).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchBikeShopsNearRoute(origin, destination);

    expect(result).toEqual([]);
  });

  it('sets repairService to false when tag is absent', async () => {
    const element = createShopElement({ id: 1, name: 'Just Bikes' });
    mockFetchResponse({ elements: [element] });

    const result = await fetchBikeShopsNearRoute(origin, destination);

    expect(result[0].repairService).toBe(false);
    expect(result[0].rentalService).toBe(false);
  });

  it('handles multiple shop types in one response', async () => {
    const elements = [
      createShopElement({ id: 1, name: 'Shop A', repair: true }),
      createShopElement({ id: 2, name: 'Shop B', rental: true }),
      createShopElement({ id: 3, name: 'Shop C' }),
    ];

    mockFetchResponse({ elements });

    const result = await fetchBikeShopsNearRoute(origin, destination);

    expect(result).toHaveLength(3);
    expect(result[0].repairService).toBe(true);
    expect(result[1].rentalService).toBe(true);
    expect(result[2].repairService).toBe(false);
  });

  it('filters out non-node elements', async () => {
    const nodeElement = createShopElement({ id: 1 });
    const wayElement = { ...createShopElement({ id: 2 }), type: 'way' };

    mockFetchResponse({ elements: [nodeElement, wayElement] });

    const result = await fetchBikeShopsNearRoute(origin, destination);

    expect(result).toHaveLength(1);
  });

  it('handles empty elements', async () => {
    mockFetchResponse({ elements: [] });

    const result = await fetchBikeShopsNearRoute(origin, destination);

    expect(result).toEqual([]);
  });

  it('sends query for all three shop/craft/repair types', async () => {
    mockFetchResponse({ elements: [] });

    await fetchBikeShopsNearRoute(origin, destination);

    const body = vi.mocked(fetch).mock.calls[0][1]?.body as string;
    expect(body).toContain('shop');
    expect(body).toContain('bicycle');
    expect(body).toContain('craft');
    expect(body).toContain('bicycle_repair_station');
  });
});
