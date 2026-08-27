// @vitest-environment happy-dom
/**
 * useSesizareAvailability / useSesizareCandidates — Unit tests
 *
 * The load-bearing case is the Chișinău one: the RO bbox in core deliberately
 * over-includes Moldova and Serbia, so gating on it would offer Romanian
 * city-hall complaints to riders in the wrong country. These tests exist to
 * stop anyone "optimizing away" the reverse geocode.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type GeocodeResult = { address: string; countryCode: string } | null;
type GeocodeFn = (lat: number, lon: number) => Promise<GeocodeResult>;

const reverseGeocodeSpy = vi.fn<GeocodeFn>();

vi.mock('../../lib/mapbox-search', () => ({
  reverseGeocodeAddressWithCountry: (lat: number, lon: number) => reverseGeocodeSpy(lat, lon),
}));

import { useSesizareAvailability, useSesizareCandidates } from '../useSesizareAvailability';
import { useAppStore } from '../../store/appStore';

const BUCHAREST = { lat: 44.4612, lon: 26.1109 };
/** Inside core's RO bounding box, but not in Romania. */
const CHISINAU = { lat: 47.0105, lon: 28.8638 };

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return createElement(QueryClientProvider, { client }, children);
};

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    sesizariConfig: { enabled: true, baseUrl: 'https://civia.ro/sesizari' },
  });
});

describe('useSesizareAvailability', () => {
  it('accepts an actionable hazard at a Romanian address', async () => {
    reverseGeocodeSpy.mockResolvedValue({
      address: 'strada Fabrica de Glucoză nr. 5, București',
      countryCode: 'RO',
    });

    const { result } = renderHook(
      () => useSesizareAvailability('pothole', BUCHAREST, 'haz-1'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.eligible).toBe(true));
    expect(result.current.address).toBe('strada Fabrica de Glucoză nr. 5, București');
  });

  it('rejects a hazard just outside Romania that the RO bbox would have accepted', async () => {
    reverseGeocodeSpy.mockResolvedValue({
      address: 'strada Ismail 33, Chișinău',
      countryCode: 'MD',
    });

    const { result } = renderHook(
      () => useSesizareAvailability('pothole', CHISINAU, 'haz-md'),
      { wrapper },
    );

    await waitFor(() => expect(reverseGeocodeSpy).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.eligible).toBe(false);
    expect(result.current.address).toBeNull();
  });

  it('never spends a geocode on a hazard type no authority can act on', async () => {
    const { result } = renderHook(
      () => useSesizareAvailability('aggressive_traffic', BUCHAREST, 'haz-2'),
      { wrapper },
    );

    expect(result.current.eligible).toBe(false);
    expect(reverseGeocodeSpy).not.toHaveBeenCalled();
  });

  it('never spends a geocode when the kill switch is off', async () => {
    useAppStore.setState({
      sesizariConfig: { enabled: false, baseUrl: 'https://civia.ro/sesizari' },
    });

    const { result } = renderHook(
      () => useSesizareAvailability('pothole', BUCHAREST, 'haz-3'),
      { wrapper },
    );

    expect(result.current.eligible).toBe(false);
    expect(reverseGeocodeSpy).not.toHaveBeenCalled();
  });

  it('treats a blank address as ineligible — a primărie cannot dispatch to a lat/lon', async () => {
    reverseGeocodeSpy.mockResolvedValue({ address: '   ', countryCode: 'RO' });

    const { result } = renderHook(
      () => useSesizareAvailability('pothole', BUCHAREST, 'haz-4'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.eligible).toBe(false);
  });

  it('stays ineligible when the geocode fails (offline)', async () => {
    reverseGeocodeSpy.mockResolvedValue(null);

    const { result } = renderHook(
      () => useSesizareAvailability('pothole', BUCHAREST, 'haz-5'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.eligible).toBe(false);
  });
});

describe('useSesizareCandidates', () => {
  it('returns only the reports that can actually become a sesizare', async () => {
    reverseGeocodeSpy.mockImplementation(async (lat) =>
      lat === BUCHAREST.lat
        ? { address: 'Bulevardul Unirii 1, București', countryCode: 'RO' }
        : { address: 'strada Ismail 33, Chișinău', countryCode: 'MD' },
    );

    const reports = [
      { hazardType: 'pothole' as const, coordinate: BUCHAREST, reportedAt: '2026-08-27T09:00:00Z' },
      { hazardType: 'pothole' as const, coordinate: CHISINAU, reportedAt: '2026-08-27T09:05:00Z' },
      // Ineligible type — filtered before any network call.
      {
        hazardType: 'narrow_street' as const,
        coordinate: BUCHAREST,
        reportedAt: '2026-08-27T09:10:00Z',
      },
    ];

    const { result } = renderHook(() => useSesizareCandidates(reports), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.candidates).toHaveLength(1);
    expect(result.current.candidates[0].address).toBe('Bulevardul Unirii 1, București');
    // Two eligible-by-type reports → two geocodes. The third never fires.
    expect(reverseGeocodeSpy).toHaveBeenCalledTimes(2);
  });

  it('returns nothing when the kill switch is off', async () => {
    useAppStore.setState({
      sesizariConfig: { enabled: false, baseUrl: 'https://civia.ro/sesizari' },
    });

    const { result } = renderHook(
      () =>
        useSesizareCandidates([
          {
            hazardType: 'pothole' as const,
            coordinate: BUCHAREST,
            reportedAt: '2026-08-27T09:00:00Z',
          },
        ]),
      { wrapper },
    );

    expect(result.current.candidates).toHaveLength(0);
    expect(reverseGeocodeSpy).not.toHaveBeenCalled();
  });
});
