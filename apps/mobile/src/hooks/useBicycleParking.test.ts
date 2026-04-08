// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BicycleParkingLocation } from '../lib/bicycle-parking';

const mockFetchBicycleParkingNearRoute = vi.fn();

vi.mock('../lib/bicycle-parking', () => ({
  fetchBicycleParkingNearRoute: (...args: unknown[]) =>
    mockFetchBicycleParkingNearRoute(...args),
}));

import { useBicycleParking } from './useBicycleParking';

let queryClient: QueryClient;

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.clearAllMocks();
});

afterEach(() => {
  queryClient.clear();
});

describe('useBicycleParking', () => {
  const origin = { lat: 44.43, lon: 26.1 };
  const destination = { lat: 44.44, lon: 26.11 };

  it('returns empty array and not loading when both coords are null', () => {
    const { result } = renderHook(() => useBicycleParking(null, null), {
      wrapper,
    });

    expect(result.current.parkingLocations).toEqual([]);
    // Query is disabled so it should not be loading
    expect(result.current.isLoading).toBe(false);
    expect(mockFetchBicycleParkingNearRoute).not.toHaveBeenCalled();
  });

  it('does not fetch when only origin is provided', () => {
    const { result } = renderHook(() => useBicycleParking(origin, null), {
      wrapper,
    });

    expect(result.current.parkingLocations).toEqual([]);
    expect(mockFetchBicycleParkingNearRoute).not.toHaveBeenCalled();
  });

  it('does not fetch when only destination is provided', () => {
    const { result } = renderHook(() => useBicycleParking(null, destination), {
      wrapper,
    });

    expect(result.current.parkingLocations).toEqual([]);
    expect(mockFetchBicycleParkingNearRoute).not.toHaveBeenCalled();
  });

  it('fetches parking locations when both coords are provided', async () => {
    const mockLocations: BicycleParkingLocation[] = [
      { id: 'osm-1', lat: 44.435, lon: 26.105, name: 'Parking A', capacity: 10, covered: true },
      { id: 'osm-2', lat: 44.436, lon: 26.106 },
    ];
    mockFetchBicycleParkingNearRoute.mockResolvedValue(mockLocations);

    const { result } = renderHook(
      () => useBicycleParking(origin, destination),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.parkingLocations).toHaveLength(2);
    });

    expect(result.current.parkingLocations).toEqual(mockLocations);
    expect(mockFetchBicycleParkingNearRoute).toHaveBeenCalledWith(origin, destination);
  });

  it('returns empty array when fetch returns empty result', async () => {
    mockFetchBicycleParkingNearRoute.mockResolvedValue([]);

    const { result } = renderHook(
      () => useBicycleParking(origin, destination),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.parkingLocations).toEqual([]);
  });

  it('returns empty array when fetch fails', async () => {
    mockFetchBicycleParkingNearRoute.mockRejectedValue(
      new Error('Network error'),
    );

    const { result } = renderHook(
      () => useBicycleParking(origin, destination),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // TanStack Query handles the error, hook returns default empty array
    expect(result.current.parkingLocations).toEqual([]);
  });
});
