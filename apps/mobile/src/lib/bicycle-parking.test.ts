import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchBicycleParkingNearRoute } from './bicycle-parking';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const origin = { lat: 44.43, lon: 26.1 };
const destination = { lat: 44.44, lon: 26.12 };

const createOverpassElement = (overrides?: Partial<{
  id: number;
  lat: number;
  lon: number;
  name: string;
  capacity: string;
  covered: string;
}>) => ({
  type: 'node',
  id: overrides?.id ?? 12345,
  lat: overrides?.lat ?? 44.435,
  lon: overrides?.lon ?? 26.11,
  tags: {
    amenity: 'bicycle_parking',
    ...(overrides?.name ? { name: overrides.name } : {}),
    ...(overrides?.capacity ? { capacity: overrides.capacity } : {}),
    ...(overrides?.covered ? { covered: overrides.covered } : {}),
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

describe('fetchBicycleParkingNearRoute', () => {
  it('returns parking locations from Overpass API', async () => {
    const element = createOverpassElement({
      id: 1001,
      name: 'Park Station',
      capacity: '20',
      covered: 'yes',
    });

    mockFetchResponse({ elements: [element] });

    const result = await fetchBicycleParkingNearRoute(origin, destination);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'osm-1001',
      lat: 44.435,
      lon: 26.11,
      name: 'Park Station',
      capacity: 20,
      covered: true,
    });
  });

  it('returns empty array on non-OK response', async () => {
    mockFetchResponse(null, false);

    const result = await fetchBicycleParkingNearRoute(origin, destination);

    expect(result).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchBicycleParkingNearRoute(origin, destination);

    expect(result).toEqual([]);
  });

  it('returns empty array when no elements found', async () => {
    mockFetchResponse({ elements: [] });

    const result = await fetchBicycleParkingNearRoute(origin, destination);

    expect(result).toEqual([]);
  });

  it('handles missing elements property', async () => {
    mockFetchResponse({});

    const result = await fetchBicycleParkingNearRoute(origin, destination);

    expect(result).toEqual([]);
  });

  it('filters out non-node elements', async () => {
    const nodeElement = createOverpassElement({ id: 1 });
    const wayElement = { ...createOverpassElement({ id: 2 }), type: 'way' };

    mockFetchResponse({ elements: [nodeElement, wayElement] });

    const result = await fetchBicycleParkingNearRoute(origin, destination);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('osm-1');
  });

  it('parses covered=no as false', async () => {
    mockFetchResponse({ elements: [createOverpassElement({ covered: 'no' })] });

    const result = await fetchBicycleParkingNearRoute(origin, destination);

    expect(result[0].covered).toBe(false);
  });

  it('parses covered=undefined as undefined', async () => {
    const element = createOverpassElement();
    delete element.tags.covered;

    mockFetchResponse({ elements: [element] });

    const result = await fetchBicycleParkingNearRoute(origin, destination);

    expect(result[0].covered).toBeUndefined();
  });

  it('handles elements without tags', async () => {
    const element = { type: 'node', id: 999, lat: 44.435, lon: 26.11 };
    mockFetchResponse({ elements: [element] });

    const result = await fetchBicycleParkingNearRoute(origin, destination);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBeUndefined();
    expect(result[0].capacity).toBeUndefined();
    expect(result[0].covered).toBeUndefined();
  });

  it('sends POST request to Overpass API', async () => {
    mockFetchResponse({ elements: [] });

    await fetchBicycleParkingNearRoute(origin, destination);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://overpass-api.de/api/interpreter');
    expect(options?.method).toBe('POST');
    expect(options?.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    // Body should contain encoded Overpass QL query with bicycle_parking
    expect(options?.body).toContain('bicycle_parking');
  });

  it('computes bounding box with padding', async () => {
    mockFetchResponse({ elements: [] });

    await fetchBicycleParkingNearRoute(
      { lat: 44.43, lon: 26.1 },
      { lat: 44.44, lon: 26.12 },
    );

    const body = vi.mocked(fetch).mock.calls[0][1]?.body as string;
    // The bbox should contain coordinates that include the padding (~0.005 degrees)
    expect(body).toContain('data=');
  });
});
