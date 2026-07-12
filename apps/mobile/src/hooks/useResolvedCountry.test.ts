// @vitest-environment happy-dom
/**
 * Search country-hint resolution — the contract behind the destination /
 * start autocomplete filter (global-availability gate follow-up):
 *
 *   1. Rider inside the RO/ES routing bboxes → hint set synchronously from
 *      the bbox resolution (pre-existing behavior, no geocoder involved).
 *   2. Rider elsewhere in a supported country (e.g. Germany) → hint resolved
 *      via the cached on-device reverse geocoder, so `mapbox-search.ts`
 *      expands their search to the full EU-27+EEA+CH list.
 *   3. Rider in an unsupported country (waitlisted, continued anyway) or
 *      unresolvable location → hint cleared → unrestricted global search.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/storage', () => ({
  zustandStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  flushPersistedWrites: vi.fn(),
}));

const { mockReverseGeocodeCountryCode } = vi.hoisted(() => ({
  mockReverseGeocodeCountryCode: vi.fn(),
}));

vi.mock('../lib/regionGate', () => ({
  reverseGeocodeCountryCode: mockReverseGeocodeCountryCode,
}));

import { useAppStore } from '../store/appStore';
import { useResolvedCountry } from './useResolvedCountry';

const setOrigin = (lat: number, lon: number) => {
  useAppStore.setState((state) => ({
    routeRequest: { ...state.routeRequest, origin: { lat, lon }, countryHint: undefined },
  }));
};

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState((state) => ({
    routeRequest: {
      ...state.routeRequest,
      origin: { lat: 0, lon: 0 },
      startOverride: undefined,
      destination: { lat: 0, lon: 0 },
      countryHint: undefined,
    },
  }));
});

describe('useResolvedCountry — search country hint', () => {
  it('sets the hint from the routing bbox for a rider in Romania (no geocoder call)', async () => {
    setOrigin(44.4268, 26.1025); // Bucharest
    renderHook(() => useResolvedCountry());

    await waitFor(() =>
      expect(useAppStore.getState().routeRequest.countryHint).toBe('RO'),
    );
    expect(mockReverseGeocodeCountryCode).not.toHaveBeenCalled();
  });

  it('sets the hint from the routing bbox for a rider in a newly covered country (no geocoder call)', async () => {
    setOrigin(52.52, 13.405); // Berlin — inside the DE coverage bbox
    renderHook(() => useResolvedCountry());

    await waitFor(() =>
      expect(useAppStore.getState().routeRequest.countryHint).toBe('DE'),
    );
    expect(mockReverseGeocodeCountryCode).not.toHaveBeenCalled();
  });

  it('resolves the hint via the geocoder for supported territory outside the coverage boxes', async () => {
    // Funchal, Madeira: Portuguese (supported country) but outside the PT
    // mainland coverage bbox — the geocoder fallback carries the search
    // filter for exactly these off-box territories.
    mockReverseGeocodeCountryCode.mockResolvedValue('PT');
    setOrigin(32.6669, -16.9241);
    renderHook(() => useResolvedCountry());

    await waitFor(() =>
      expect(useAppStore.getState().routeRequest.countryHint).toBe('PT'),
    );
    expect(mockReverseGeocodeCountryCode).toHaveBeenCalledWith(32.6669, -16.9241);
  });

  it('clears the hint for a rider in an unsupported country (global search stays open)', async () => {
    mockReverseGeocodeCountryCode.mockResolvedValue('US');
    useAppStore.setState((state) => ({
      routeRequest: {
        ...state.routeRequest,
        origin: { lat: 40.7128, lon: -74.006 }, // New York
        countryHint: 'RO', // stale hint from a previous session must be cleared
      },
    }));
    renderHook(() => useResolvedCountry());

    await waitFor(() =>
      expect(useAppStore.getState().routeRequest.countryHint).toBeUndefined(),
    );
  });

  it('clears the hint when the geocoder cannot resolve a country', async () => {
    mockReverseGeocodeCountryCode.mockResolvedValue(null);
    useAppStore.setState((state) => ({
      routeRequest: {
        ...state.routeRequest,
        origin: { lat: 30, lon: -30 }, // mid-Atlantic
        countryHint: 'ES',
      },
    }));
    renderHook(() => useResolvedCountry());

    await waitFor(() =>
      expect(useAppStore.getState().routeRequest.countryHint).toBeUndefined(),
    );
  });

  it('clears a stale hint while GPS is still pending (0,0 origin)', async () => {
    mockReverseGeocodeCountryCode.mockResolvedValue('DE');
    useAppStore.setState((state) => ({
      routeRequest: { ...state.routeRequest, countryHint: 'RO' },
    }));
    renderHook(() => useResolvedCountry());

    await waitFor(() =>
      expect(useAppStore.getState().routeRequest.countryHint).toBeUndefined(),
    );
    expect(mockReverseGeocodeCountryCode).not.toHaveBeenCalled();
  });
});
