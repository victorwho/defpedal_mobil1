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

/**
 * Create a Search Box API **suggest** response item.
 * The suggest endpoint returns `{ suggestions: [...] }` — not GeoJSON.
 */
const createSuggestItem = (overrides: {
  mapboxId?: string;
  name?: string;
  fullAddress?: string;
  placeFormatted?: string;
  featureType?: string;
  maki?: string;
  poiCategory?: string[];
  countryCode?: string;
  /** Full context override — postcode suggestions carry place/locality/region. */
  context?: Record<string, unknown>;
}) => ({
  mapbox_id: overrides.mapboxId ?? 'feature.1',
  name: overrides.name ?? 'Test Place',
  full_address: overrides.fullAddress ?? '123 Test St, Test City',
  place_formatted: overrides.placeFormatted ?? 'Test City, Brazil',
  feature_type: overrides.featureType ?? 'poi',
  maki: overrides.maki,
  poi_category: overrides.poiCategory,
  context: overrides.context ?? {
    country: {
      country_code: overrides.countryCode ?? 'BR',
    },
  },
});

/**
 * Create a Search Box API **retrieve** response (GeoJSON FeatureCollection).
 * The retrieve endpoint returns `{ type: 'FeatureCollection', features: [...] }`.
 */
const createRetrieveResponse = (overrides: {
  mapboxId?: string;
  name?: string;
  fullAddress?: string;
  placeFormatted?: string;
  lon?: number;
  lat?: number;
  featureType?: string;
  maki?: string;
  poiCategory?: string[];
  countryCode?: string;
  hasGeometry?: boolean;
}) => ({
  type: 'FeatureCollection',
  features: overrides.hasGeometry === false
    ? []
    : [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [
              overrides.lon ?? -46.6333,
              overrides.lat ?? -23.5505,
            ],
          },
          properties: {
            mapbox_id: overrides.mapboxId ?? 'feature.1',
            name: overrides.name ?? 'Test Place',
            full_address:
              overrides.fullAddress ?? '123 Test St, Test City',
            place_formatted:
              overrides.placeFormatted ?? 'Test City, Brazil',
            feature_type: overrides.featureType,
            maki: overrides.maki,
            poi_category: overrides.poiCategory,
            context: {
              country: {
                country_code: overrides.countryCode ?? 'BR',
              },
            },
          },
        },
      ],
});

/**
 * Create a Geocoding API v6 response feature (for reverse geocode / coverage).
 */
const createGeocodeFeature = (overrides: {
  id?: string;
  name?: string;
  fullAddress?: string;
  placeFormatted?: string;
  lon?: number;
  lat?: number;
  countryCode?: string;
  featureType?: string;
}) => ({
  id: overrides.id ?? 'feature.1',
  type: 'Feature' as const,
  geometry: {
    type: 'Point' as const,
    coordinates: [
      overrides.lon ?? -46.6333,
      overrides.lat ?? -23.5505,
    ] as [number, number],
  },
  properties: {
    mapbox_id: overrides.id ?? 'feature.1',
    name: overrides.name ?? 'Test Place',
    full_address: overrides.fullAddress ?? '123 Test St, Test City',
    place_formatted: overrides.placeFormatted ?? 'Test City, Brazil',
    feature_type: overrides.featureType,
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

/**
 * Mock a full autocomplete flow: one suggest call + N retrieve calls.
 * Each suggest item gets its own retrieve response.
 */
const mockAutocompleteFlow = (
  suggestItems: ReturnType<typeof createSuggestItem>[],
  retrieveResponses: ReturnType<typeof createRetrieveResponse>[],
) => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  // First call: suggest
  fetchSpy.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ suggestions: suggestItems }),
    text: async () => JSON.stringify({ suggestions: suggestItems }),
  } as Response);
  // Subsequent calls: retrieve for each suggestion
  for (const resp of retrieveResponses) {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => resp,
      text: async () => JSON.stringify(resp),
    } as Response);
  }
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
  });

  it('returns empty suggestions for empty query', async () => {
    const result = await mapboxAutocomplete({ query: '   ' });

    expect(result.suggestions).toEqual([]);
  });

  it('maps Mapbox features to AutocompleteSuggestion', async () => {
    const suggestItem = createSuggestItem({
      mapboxId: 'poi.123',
      name: 'Paulista Avenue',
      fullAddress: 'Paulista Avenue, Sao Paulo, Brazil',
    });

    const retrieveResp = createRetrieveResponse({
      mapboxId: 'poi.123',
      name: 'Paulista Avenue',
      fullAddress: 'Paulista Avenue, Sao Paulo, Brazil',
      lat: -23.5614,
      lon: -46.6558,
    });

    mockAutocompleteFlow([suggestItem], [retrieveResp]);

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
        coordinates: { lat: -23.5614, lon: -46.6558 },
        featureType: 'poi',
      }),
    );
  });

  it('includes distanceMeters when proximity is provided', async () => {
    const suggestItem = createSuggestItem({});
    const retrieveResp = createRetrieveResponse({
      lat: -23.5614,
      lon: -46.6558,
    });

    mockAutocompleteFlow([suggestItem], [retrieveResp]);

    const result = await mapboxAutocomplete({
      query: 'Paulista',
      proximity: { lat: -23.5505, lon: -46.6333 },
    });

    expect(result.suggestions[0].distanceMeters).toBeDefined();
    expect(typeof result.suggestions[0].distanceMeters).toBe('number');
    expect(result.suggestions[0].distanceMeters).toBeGreaterThan(0);
  });

  it('constructs correct URL with all parameters', async () => {
    // Mock suggest returning empty to avoid needing retrieve mocks
    mockFetchResponse({ suggestions: [] });

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

  it('expands a supported-country hint to the full supported list (EU-27 + EEA + CH)', async () => {
    mockFetchResponse({ suggestions: [] });

    await mapboxAutocomplete({
      query: 'vienna',
      countryHint: 'ro',
      limit: 3,
    });

    const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
    const countries = (new URL(fetchCall).searchParams.get('country') ?? '').split(',');
    // A rider physically in RO must be able to search destinations in every
    // supported country — not just RO+ES (pre-gate behavior).
    expect(countries).toHaveLength(32);
    expect(countries).toEqual(
      expect.arrayContaining(['RO', 'ES', 'DE', 'FR', 'AT', 'CH', 'NO', 'IS', 'LI']),
    );
    // UK joined the supported set with the b47v1 routing generation
    // (2026-09-21) — a rider in Bucharest can autocomplete "Tower Bridge".
    expect(countries).toContain('GB');
  });

  // A postcode IS how an address is given in several covered countries, and
  // Britain most of all. Measured against the live API before this landed:
  // with the old type list 'SW1A 1AA' and 'EC3N 4AB' returned ZERO
  // suggestions, and 'EH1 1BE' returned a car park in a different postcode
  // (EH11) — a wrong answer with nothing to mark it wrong.
  it('asks for postcodes as a searchable type', async () => {
    mockFetchResponse({ suggestions: [] });

    await mapboxAutocomplete({ query: 'SW1A 1AA', countryHint: 'GB', limit: 3 });

    const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
    const types = (new URL(fetchCall).searchParams.get('types') ?? '').split(',');
    expect(types).toContain('postcode');
    // The pre-existing types must survive — this widened the list, it did not
    // replace it.
    expect(types).toEqual(
      expect.arrayContaining(['poi', 'address', 'place', 'street', 'locality', 'neighborhood']),
    );
  });

  it('renders a postcode suggestion as an address rather than an unknown type', async () => {
    // Shape copied from a real Search Box response for 'SW1A 1AA': no
    // full_address, maki 'marker', and place/locality/region in context.
    const suggestItem = createSuggestItem({
      mapboxId: 'postcode.1',
      name: 'SW1A 1AA',
      featureType: 'postcode',
      maki: 'marker',
      placeFormatted: 'London, Greater London, England, United Kingdom',
      context: {
        country: { country_code: 'GB', name: 'United Kingdom' },
        region: { name: 'England' },
        place: { name: 'London' },
        locality: { name: 'City of Westminster' },
      },
    });
    const retrieveResp = createRetrieveResponse({
      mapboxId: 'postcode.1',
      name: 'SW1A 1AA',
      featureType: 'postcode',
      lon: -0.141588,
      lat: 51.501009,
    });
    mockAutocompleteFlow([suggestItem], [retrieveResp]);

    const result = await mapboxAutocomplete({ query: 'SW1A 1AA', countryHint: 'GB' });

    expect(result.suggestions).toHaveLength(1);
    const [suggestion] = result.suggestions;
    // 'unknown' has no entry in the search row's icon map and takes the empty
    // default branch of buildSecondaryText, so the row would render bare.
    expect(suggestion.featureType).toBe('address');
    expect(suggestion.primaryText).toBe('SW1A 1AA');
    expect(suggestion.secondaryText).toBe('City of Westminster, London');
    expect(suggestion.coordinates).toEqual({ lat: 51.501009, lon: -0.141588 });
  });

  it('throws on non-OK response', async () => {
    mockFetchResponse({ message: 'Unauthorized' }, false, 401);

    await expect(
      mapboxAutocomplete({ query: 'test' }),
    ).rejects.toThrow('Mapbox search failed (401)');
  });

  it('skips suggestions where retrieve has no geometry', async () => {
    const goodItem = createSuggestItem({ mapboxId: 'good' });
    const badItem = createSuggestItem({ mapboxId: 'bad' });

    const goodRetrieve = createRetrieveResponse({ mapboxId: 'good' });
    const badRetrieve = createRetrieveResponse({
      mapboxId: 'bad',
      hasGeometry: false,
    });

    mockAutocompleteFlow([goodItem, badItem], [goodRetrieve, badRetrieve]);

    const result = await mapboxAutocomplete({ query: 'test' });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].id).toBe('good');
  });

  it('maps feature_type to featureType field', async () => {
    const poiItem = createSuggestItem({
      mapboxId: 'poi.1',
      featureType: 'poi',
    });
    const addressItem = createSuggestItem({
      mapboxId: 'addr.1',
      featureType: 'address',
    });
    const placeItem = createSuggestItem({
      mapboxId: 'place.1',
      featureType: 'place',
    });

    const poiRetrieve = createRetrieveResponse({ mapboxId: 'poi.1' });
    const addressRetrieve = createRetrieveResponse({ mapboxId: 'addr.1' });
    const placeRetrieve = createRetrieveResponse({ mapboxId: 'place.1' });

    mockAutocompleteFlow(
      [poiItem, addressItem, placeItem],
      [poiRetrieve, addressRetrieve, placeRetrieve],
    );

    const result = await mapboxAutocomplete({ query: 'test' });

    expect(result.suggestions[0].featureType).toBe('poi');
    expect(result.suggestions[1].featureType).toBe('address');
    expect(result.suggestions[2].featureType).toBe('place');
  });

  it('returns "unknown" for unrecognized feature types', async () => {
    const item = createSuggestItem({ featureType: 'some_new_type' });
    const retrieve = createRetrieveResponse({});

    mockAutocompleteFlow([item], [retrieve]);

    const result = await mapboxAutocomplete({ query: 'test' });

    expect(result.suggestions[0].featureType).toBe('unknown');
  });

  it('extracts category from poi_category array', async () => {
    const item = createSuggestItem({
      featureType: 'poi',
      poiCategory: ['restaurant', 'food'],
    });
    const retrieve = createRetrieveResponse({});

    mockAutocompleteFlow([item], [retrieve]);

    const result = await mapboxAutocomplete({ query: 'pizza' });

    expect(result.suggestions[0].category).toBe('restaurant');
    expect(result.suggestions[0].featureType).toBe('poi');
  });

  it('falls back to maki for category when poi_category is absent', async () => {
    const item = createSuggestItem({
      featureType: 'poi',
      maki: 'cafe',
    });
    const retrieve = createRetrieveResponse({});

    mockAutocompleteFlow([item], [retrieve]);

    const result = await mapboxAutocomplete({ query: 'coffee' });

    expect(result.suggestions[0].category).toBe('cafe');
  });

  it('omits category when no POI metadata is present', async () => {
    const item = createSuggestItem({ featureType: 'address' });
    const retrieve = createRetrieveResponse({});

    mockAutocompleteFlow([item], [retrieve]);

    const result = await mapboxAutocomplete({ query: 'main street' });

    expect(result.suggestions[0].category).toBeUndefined();
    expect(result.suggestions[0].featureType).toBe('address');
  });
});

describe('mapboxReverseGeocode', () => {
  it('returns label from first feature', async () => {
    const feature = createGeocodeFeature({
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
  it('returns supported for a newly covered country hint (DE)', async () => {
    const result = await mapboxGetCoverage(52.52, 13.405, 'DE');

    expect(result.matched?.status).toBe('supported');
    expect(result.matched?.safeRouting).toBe(true);
    expect(result.matched?.countryCode).toBe('DE');
    expect(result.regions).toHaveLength(1);
  });

  it('returns supported for RO country hint', async () => {
    const result = await mapboxGetCoverage(44.43, 26.10, 'RO');

    expect(result.matched?.status).toBe('supported');
    expect(result.matched?.countryCode).toBe('RO');
  });

  it('returns supported for GB (b47v1 routing generation, 2026-09-21)', async () => {
    const gb = await mapboxGetCoverage(51.5, -0.12, 'GB');
    expect(gb.matched?.status).toBe('supported');
    expect(gb.matched?.safeRouting).toBe(true);
  });

  it('returns unsupported for countries outside the supported set (UA, BR)', async () => {
    // BR was in the legacy hardcoded set (Pedala Defensiva origins) — the
    // set now derives from SUPPORTED_APP_COUNTRIES, which excludes it.
    const ua = await mapboxGetCoverage(50.45, 30.52, 'UA');
    expect(ua.matched?.status).toBe('unsupported');
    expect(ua.matched?.safeRouting).toBe(false);

    const br = await mapboxGetCoverage(-23.55, -46.63, 'BR');
    expect(br.matched?.status).toBe('unsupported');
  });

  it('falls back to reverse geocode when no hint provided', async () => {
    const feature = createGeocodeFeature({ countryCode: 'FR' });
    mockFetchResponse({ type: 'FeatureCollection', features: [feature] });

    const result = await mapboxGetCoverage(48.85, 2.35);

    expect(result.matched?.status).toBe('supported');
    expect(result.matched?.countryCode).toBe('FR');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns UNKNOWN when reverse geocode yields no country', async () => {
    mockFetchResponse({ type: 'FeatureCollection', features: [] });

    const result = await mapboxGetCoverage(0, 0);

    expect(result.matched?.countryCode).toBe('UNKNOWN');
    expect(result.matched?.status).toBe('unsupported');
  });

  it('has generatedAt timestamp', async () => {
    const result = await mapboxGetCoverage(44.43, 26.10, 'RO');

    expect(result.generatedAt).toBeDefined();
    expect(() => new Date(result.generatedAt)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Stalled response body
//
// Regression cover for the P1-2/P1-3 defect in this file's `fetchWithTimeout`
// (docs/plans/external-review-triage-2026-09-25.md). It cleared its timer in
// `finally`, which fires when the HEADERS arrive, so all eight callers parsed
// the body with no timer armed and the AbortController disarmed — and this is
// the destination autocomplete, so the search spinner never resolved.
//
// The mock captures the internal AbortSignal handed to `fetch` and settles the
// body only when it aborts, which is how real `fetch` behaves.
// ---------------------------------------------------------------------------

describe('mapbox-search — stalled response body', () => {
  it('aborts a suggest body that never arrives instead of hanging forever', async () => {
    let capturedSignal: AbortSignal | undefined;

    vi.spyOn(globalThis, 'fetch').mockImplementation(((_url: string, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ suggestions: [] }),
        text: () =>
          new Promise<string>((_resolve, reject) => {
            capturedSignal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      } as unknown as Response);
    }) as unknown as typeof fetch);

    // Without the re-arm this promise never settles and the test times out.
    await expect(
      mapboxAutocomplete({ query: 'Bucharest', proximity: { lat: 44.43, lon: 26.1 } }),
    ).rejects.toThrow(/timed out/i);
  }, 20_000);
});
