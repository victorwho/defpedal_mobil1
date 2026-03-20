import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../env', () => ({
  mobileEnv: {
    mapboxPublicToken: 'pk.test_token_12345',
  },
}));

import {
  mapboxAutocomplete,
  mapboxReverseGeocode,
  mapboxGetCoverage,
} from '../mapbox-search';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createMapboxFeature = (overrides: {
  id?: string;
  name?: string;
  fullAddress?: string;
  placeFormatted?: string;
  lon?: number;
  lat?: number;
  countryCode?: string;
  featureType?: string;
  maki?: string;
  poiCategory?: string[];
}) => ({
  id: overrides.id ?? 'feature.1',
  type: 'Feature' as const,
  geometry: {
    type: 'Point' as const,
    coordinates: [overrides.lon ?? -46.6333, overrides.lat ?? -23.5505] as [number, number],
  },
  properties: {
    mapbox_id: overrides.id ?? 'feature.1',
    name: overrides.name ?? 'Test Place',
    full_address: overrides.fullAddress ?? '123 Test St, Test City',
    place_formatted: overrides.placeFormatted ?? 'Test City, Brazil',
    feature_type: overrides.featureType,
    maki: overrides.maki,
    poi_category: overrides.poiCategory,
    context: {
      country: {
        country_code: overrides.countryCode ?? 'BR',
      },
    },
  },
});

const mockFetchResponse = (data: unknown, ok = true, status = 200) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok,
    status,
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

describe('mapboxAutocomplete', () => {
  it('returns empty suggestions for short queries', async () => {
    const result = await mapboxAutocomplete({ query: 'a' });

    expect(result.suggestions).toEqual([]);
    expect(result.generatedAt).toBeDefined();
    expect(globalThis.fetch).not.toBeDefined;
  });

  it('returns empty suggestions for empty query', async () => {
    const result = await mapboxAutocomplete({ query: '   ' });

    expect(result.suggestions).toEqual([]);
  });

  it('maps Mapbox features to AutocompleteSuggestion', async () => {
    const feature = createMapboxFeature({
      id: 'poi.123',
      name: 'Paulista Avenue',
      fullAddress: 'Paulista Avenue, Sao Paulo, Brazil',
      lat: -23.5614,
      lon: -46.6558,
    });

    mockFetchResponse({ type: 'FeatureCollection', features: [feature] });

    const result = await mapboxAutocomplete({
      query: 'Paulista',
      locale: 'pt',
      countryHint: 'BR',
      limit: 5,
    });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toEqual(
      expect.objectContaining({
        id: 'poi.123',
        primaryText: 'Paulista Avenue',
        label: 'Paulista Avenue, Sao Paulo, Brazil',
        coordinates: { lat: -23.5614, lon: -46.6558 },
        featureType: 'unknown',
      }),
    );
  });

  it('includes distanceMeters when proximity is provided', async () => {
    const feature = createMapboxFeature({ lat: -23.5614, lon: -46.6558 });
    mockFetchResponse({ type: 'FeatureCollection', features: [feature] });

    const result = await mapboxAutocomplete({
      query: 'Paulista',
      proximity: { lat: -23.5505, lon: -46.6333 },
    });

    expect(result.suggestions[0].distanceMeters).toBeDefined();
    expect(typeof result.suggestions[0].distanceMeters).toBe('number');
    expect(result.suggestions[0].distanceMeters).toBeGreaterThan(0);
  });

  it('constructs correct URL with all parameters', async () => {
    mockFetchResponse({ type: 'FeatureCollection', features: [] });

    await mapboxAutocomplete({
      query: 'test place',
      proximity: { lat: -23.55, lon: -46.63 },
      locale: 'pt',
      countryHint: 'BR',
      limit: 3,
    });

    const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(fetchCall).toContain('q=test+place');
    expect(fetchCall).toContain('access_token=pk.test_token_12345');
    expect(fetchCall).toContain('proximity=-46.63%2C-23.55');
    expect(fetchCall).toContain('language=pt');
    expect(fetchCall).toContain('country=BR');
    expect(fetchCall).toContain('limit=3');
  });

  it('throws on non-OK response', async () => {
    mockFetchResponse({ message: 'Unauthorized' }, false, 401);

    await expect(
      mapboxAutocomplete({ query: 'test' }),
    ).rejects.toThrow('Mapbox geocoding failed (401)');
  });

  it('skips features without geometry', async () => {
    const goodFeature = createMapboxFeature({ id: 'good' });
    const badFeature = { ...createMapboxFeature({ id: 'bad' }), geometry: undefined };

    mockFetchResponse({
      type: 'FeatureCollection',
      features: [goodFeature, badFeature],
    });

    const result = await mapboxAutocomplete({ query: 'test' });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].id).toBe('good');
  });

  it('maps feature_type to featureType field', async () => {
    const poiFeature = createMapboxFeature({ id: 'poi.1', featureType: 'poi' });
    const addressFeature = createMapboxFeature({ id: 'addr.1', featureType: 'address' });
    const placeFeature = createMapboxFeature({ id: 'place.1', featureType: 'place' });

    mockFetchResponse({
      type: 'FeatureCollection',
      features: [poiFeature, addressFeature, placeFeature],
    });

    const result = await mapboxAutocomplete({ query: 'test' });

    expect(result.suggestions[0].featureType).toBe('poi');
    expect(result.suggestions[1].featureType).toBe('address');
    expect(result.suggestions[2].featureType).toBe('place');
  });

  it('returns "unknown" for unrecognized feature types', async () => {
    const feature = createMapboxFeature({ featureType: 'some_new_type' });
    mockFetchResponse({ type: 'FeatureCollection', features: [feature] });

    const result = await mapboxAutocomplete({ query: 'test' });

    expect(result.suggestions[0].featureType).toBe('unknown');
  });

  it('extracts category from poi_category array', async () => {
    const feature = createMapboxFeature({
      featureType: 'poi',
      poiCategory: ['restaurant', 'food'],
    });
    mockFetchResponse({ type: 'FeatureCollection', features: [feature] });

    const result = await mapboxAutocomplete({ query: 'pizza' });

    expect(result.suggestions[0].category).toBe('restaurant');
    expect(result.suggestions[0].featureType).toBe('poi');
  });

  it('falls back to maki for category when poi_category is absent', async () => {
    const feature = createMapboxFeature({
      featureType: 'poi',
      maki: 'cafe',
    });
    mockFetchResponse({ type: 'FeatureCollection', features: [feature] });

    const result = await mapboxAutocomplete({ query: 'coffee' });

    expect(result.suggestions[0].category).toBe('cafe');
  });

  it('omits category when no POI metadata is present', async () => {
    const feature = createMapboxFeature({ featureType: 'address' });
    mockFetchResponse({ type: 'FeatureCollection', features: [feature] });

    const result = await mapboxAutocomplete({ query: 'main street' });

    expect(result.suggestions[0].category).toBeUndefined();
    expect(result.suggestions[0].featureType).toBe('address');
  });
});

describe('mapboxReverseGeocode', () => {
  it('returns label from first feature', async () => {
    const feature = createMapboxFeature({
      fullAddress: 'Rua Augusta 100, Sao Paulo',
    });
    mockFetchResponse({ type: 'FeatureCollection', features: [feature] });

    const result = await mapboxReverseGeocode({
      coordinate: { lat: -23.55, lon: -46.63 },
    });

    expect(result).toEqual({
      coordinate: { lat: -23.55, lon: -46.63 },
      label: 'Rua Augusta 100, Sao Paulo',
    });
  });

  it('returns null label when no features found', async () => {
    mockFetchResponse({ type: 'FeatureCollection', features: [] });

    const result = await mapboxReverseGeocode({
      coordinate: { lat: 0, lon: 0 },
    });

    expect(result.label).toBeNull();
  });

  it('throws on invalid coordinates', async () => {
    await expect(
      mapboxReverseGeocode({ coordinate: { lat: 91, lon: 0 } }),
    ).rejects.toThrow('Invalid coordinates');

    await expect(
      mapboxReverseGeocode({ coordinate: { lat: 0, lon: 181 } }),
    ).rejects.toThrow('Invalid coordinates');
  });

  it('passes locale and countryHint to URL', async () => {
    mockFetchResponse({ type: 'FeatureCollection', features: [] });

    await mapboxReverseGeocode({
      coordinate: { lat: -23.55, lon: -46.63 },
      locale: 'pt',
      countryHint: 'br',
    });

    const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(fetchCall).toContain('language=pt');
    expect(fetchCall).toContain('country=BR');
  });
});

describe('mapboxGetCoverage', () => {
  it('returns supported for known country hint', async () => {
    const result = await mapboxGetCoverage(-23.55, -46.63, 'BR');

    expect(result.matched?.status).toBe('supported');
    expect(result.matched?.safeRouting).toBe(true);
    expect(result.matched?.countryCode).toBe('BR');
    expect(result.regions).toHaveLength(1);
  });

  it('returns supported for RO country hint', async () => {
    const result = await mapboxGetCoverage(44.43, 26.10, 'RO');

    expect(result.matched?.status).toBe('supported');
    expect(result.matched?.countryCode).toBe('RO');
  });

  it('returns unsupported for unknown country', async () => {
    const result = await mapboxGetCoverage(51.5, -0.12, 'GB');

    expect(result.matched?.status).toBe('unsupported');
    expect(result.matched?.safeRouting).toBe(false);
  });

  it('falls back to reverse geocode when no hint provided', async () => {
    const feature = createMapboxFeature({ countryCode: 'BR' });
    mockFetchResponse({ type: 'FeatureCollection', features: [feature] });

    const result = await mapboxGetCoverage(-23.55, -46.63);

    expect(result.matched?.status).toBe('supported');
    expect(result.matched?.countryCode).toBe('BR');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns UNKNOWN when reverse geocode yields no country', async () => {
    mockFetchResponse({ type: 'FeatureCollection', features: [] });

    const result = await mapboxGetCoverage(0, 0);

    expect(result.matched?.countryCode).toBe('UNKNOWN');
    expect(result.matched?.status).toBe('unsupported');
  });

  it('has generatedAt timestamp', async () => {
    const result = await mapboxGetCoverage(-23.55, -46.63, 'BR');

    expect(result.generatedAt).toBeDefined();
    expect(() => new Date(result.generatedAt)).not.toThrow();
  });
});
