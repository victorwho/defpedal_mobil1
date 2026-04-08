import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./env', () => ({
  mobileEnv: {
    mapboxPublicToken: 'pk.test_token_12345',
  },
}));

import { fetchPoiSearchResults } from './poi-search';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createMapboxPoiFeature = (overrides?: Partial<{
  id: string;
  name: string;
  lat: number;
  lon: number;
  address: string;
  website: string;
}>) => ({
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates: [overrides?.lon ?? 26.11, overrides?.lat ?? 44.435],
  },
  properties: {
    mapbox_id: overrides?.id ?? 'poi.1234',
    name: overrides?.name ?? 'Test POI',
    place_formatted: overrides?.address ?? '123 Test St',
    full_address: overrides?.address ?? '123 Test St, City',
    metadata: {
      website: overrides?.website ?? undefined,
    },
  },
});

const mockFetchResponse = (data: unknown, ok = true) => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
    ok,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response));
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

describe('fetchPoiSearchResults', () => {
  it('returns POIs for hydration category', async () => {
    const feature = createMapboxPoiFeature({
      id: 'poi.fountain1',
      name: 'Park Fountain',
      lat: 44.435,
      lon: 26.11,
    });

    mockFetchResponse({ features: [feature] });

    const result = await fetchPoiSearchResults(
      'hydration',
      { lat: 44.43, lon: 26.1 },
      { lat: 44.44, lon: 26.12 },
    );

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toBe('Park Fountain');
    expect(result[0].lat).toBe(44.435);
    expect(result[0].lon).toBe(26.11);
  });

  it('returns POIs for supplies category', async () => {
    const feature = createMapboxPoiFeature({ name: 'Mega Store' });
    mockFetchResponse({ features: [feature] });

    const result = await fetchPoiSearchResults(
      'supplies',
      { lat: 44.43, lon: 26.1 },
      null,
    );

    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty array for categories handled by Overpass', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await fetchPoiSearchResults(
      'repair',
      { lat: 44.43, lon: 26.1 },
      { lat: 44.44, lon: 26.12 },
    );

    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns empty for bikeRental category (Overpass-handled)', async () => {
    const result = await fetchPoiSearchResults(
      'bikeRental',
      { lat: 44.43, lon: 26.1 },
      { lat: 44.44, lon: 26.12 },
    );

    expect(result).toEqual([]);
  });

  it('returns empty for bikeParking category (Overpass-handled)', async () => {
    const result = await fetchPoiSearchResults(
      'bikeParking',
      { lat: 44.43, lon: 26.1 },
      { lat: 44.44, lon: 26.12 },
    );

    expect(result).toEqual([]);
  });

  it('returns empty for restroom category (no Mapbox mapping)', async () => {
    const result = await fetchPoiSearchResults(
      'restroom',
      { lat: 44.43, lon: 26.1 },
      { lat: 44.44, lon: 26.12 },
    );

    expect(result).toEqual([]);
  });

  it('returns empty when both locations are null', async () => {
    const result = await fetchPoiSearchResults('hydration', null, null);

    expect(result).toEqual([]);
  });

  it('returns empty when locations have 0,0 coordinates', async () => {
    const result = await fetchPoiSearchResults(
      'hydration',
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0 },
    );

    expect(result).toEqual([]);
  });

  it('deduplicates results with same name and coordinates', async () => {
    const feature1 = createMapboxPoiFeature({ id: 'poi.1', name: 'Cafe X', lat: 44.435, lon: 26.11 });
    const feature2 = createMapboxPoiFeature({ id: 'poi.2', name: 'Cafe X', lat: 44.435, lon: 26.11 });

    mockFetchResponse({ features: [feature1, feature2] });

    const result = await fetchPoiSearchResults(
      'hydration',
      { lat: 44.43, lon: 26.1 },
      null,
    );

    // Should deduplicate since name and rounded coords match
    const cafeCount = result.filter((p) => p.name === 'Cafe X').length;
    expect(cafeCount).toBe(1);
  });

  it('returns empty array on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await fetchPoiSearchResults(
      'hydration',
      { lat: 44.43, lon: 26.1 },
      null,
    );

    expect(result).toEqual([]);
  });

  it('returns empty array on non-OK response', async () => {
    mockFetchResponse(null, false);

    const result = await fetchPoiSearchResults(
      'hydration',
      { lat: 44.43, lon: 26.1 },
      null,
    );

    expect(result).toEqual([]);
  });

  it('searches both origin and destination when both provided', async () => {
    mockFetchResponse({ features: [] });

    await fetchPoiSearchResults(
      'hydration',
      { lat: 44.43, lon: 26.1 },
      { lat: 44.44, lon: 26.12 },
    );

    // hydration has 3 queries (fountain, cafe, coffee_shop) * 2 locations = 6 fetches
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it('handles missing features gracefully', async () => {
    mockFetchResponse({});

    const result = await fetchPoiSearchResults(
      'hydration',
      { lat: 44.43, lon: 26.1 },
      null,
    );

    expect(result).toEqual([]);
  });
});
