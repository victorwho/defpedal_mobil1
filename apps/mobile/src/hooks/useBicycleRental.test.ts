// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BicycleRentalLocation } from '../lib/bicycle-rental';

const mockFetchBicycleRentalNearRoute = vi.fn();

vi.mock('../lib/bicycle-rental', () => ({
  fetchBicycleRentalNearRoute: (...args: unknown[]) =>
    mockFetchBicycleRentalNearRoute(...args),
}));

import { useBicycleRental } from './useBicycleRental';

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

describe('useBicycleRental', () => {
  const origin = { lat: 44.43, lon: 26.1 };
  const destination = { lat: 44.44, lon: 26.11 };

  it('returns empty array when coords are null', () => {
    const { result } = renderHook(() => useBicycleRental(null, null), {
      wrapper,
    });

    expect(result.current.rentalLocations).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockFetchBicycleRentalNearRoute).not.toHaveBeenCalled();
  });

  it('does not fetch when only origin is provided', () => {
    const { result } = renderHook(() => useBicycleRental(origin, null), {
      wrapper,
    });

    expect(result.current.rentalLocations).toEqual([]);
    expect(mockFetchBicycleRentalNearRoute).not.toHaveBeenCalled();
  });

  it('fetches rental locations when both coords are provided', async () => {
    const mockLocations: BicycleRentalLocation[] = [
      { id: 'osm-rental-1', lat: 44.435, lon: 26.105, name: 'CityBike Station', operator: 'CityBike', capacity: 20, network: 'CityBike' },
    ];
    mockFetchBicycleRentalNearRoute.mockResolvedValue(mockLocations);

    const { result } = renderHook(
      () => useBicycleRental(origin, destination),
      { wrapper },
    );

    // The hook has a 1500ms delay in queryFn; waitFor with a longer timeout
    await waitFor(
      () => {
        expect(result.current.rentalLocations).toHaveLength(1);
      },
      { timeout: 5000 },
    );

    expect(result.current.rentalLocations).toEqual(mockLocations);
    expect(mockFetchBicycleRentalNearRoute).toHaveBeenCalledWith(origin, destination);
  });

  it(
    'returns empty array when fetch fails',
    async () => {
      mockFetchBicycleRentalNearRoute.mockRejectedValue(
        new Error('Rate limited'),
      );

      const { result } = renderHook(
        () => useBicycleRental(origin, destination),
        { wrapper },
      );

      // The hook has retry: 2, so allow enough time for all retries + 1500ms delays each
      await waitFor(
        () => {
          expect(result.current.isLoading).toBe(false);
        },
        { timeout: 15000 },
      );

      expect(result.current.rentalLocations).toEqual([]);
    },
    20000,
  );
});
