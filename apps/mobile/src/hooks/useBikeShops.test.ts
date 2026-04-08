// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BikeShopLocation } from '../lib/bicycle-shops';

const mockFetchBikeShopsNearRoute = vi.fn();

vi.mock('../lib/bicycle-shops', () => ({
  fetchBikeShopsNearRoute: (...args: unknown[]) =>
    mockFetchBikeShopsNearRoute(...args),
}));

import { useBikeShops } from './useBikeShops';

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

describe('useBikeShops', () => {
  const origin = { lat: 44.43, lon: 26.1 };
  const destination = { lat: 44.44, lon: 26.11 };

  it('does not fetch when enabled is false', () => {
    const { result } = renderHook(
      () => useBikeShops(origin, destination, false),
      { wrapper },
    );

    expect(result.current.shops).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockFetchBikeShopsNearRoute).not.toHaveBeenCalled();
  });

  it('does not fetch when coords are null even if enabled', () => {
    const { result } = renderHook(
      () => useBikeShops(null, null, true),
      { wrapper },
    );

    expect(result.current.shops).toEqual([]);
    expect(mockFetchBikeShopsNearRoute).not.toHaveBeenCalled();
  });

  it('does not fetch when origin is at 0,0 (default coordinates)', () => {
    const zeroOrigin = { lat: 0, lon: 0 };
    const { result } = renderHook(
      () => useBikeShops(zeroOrigin, destination, true),
      { wrapper },
    );

    expect(result.current.shops).toEqual([]);
    expect(mockFetchBikeShopsNearRoute).not.toHaveBeenCalled();
  });

  it('does not fetch when origin.lat is 0', () => {
    const partialZeroOrigin = { lat: 0, lon: 26.1 };
    const { result } = renderHook(
      () => useBikeShops(partialZeroOrigin, destination, true),
      { wrapper },
    );

    expect(result.current.shops).toEqual([]);
    expect(mockFetchBikeShopsNearRoute).not.toHaveBeenCalled();
  });

  it('fetches shops when enabled and coords are valid', async () => {
    const mockShops: BikeShopLocation[] = [
      { id: 'osm-shop-1', lat: 44.435, lon: 26.105, name: 'Bike World', repairService: true, rentalService: false },
      { id: 'osm-shop-2', lat: 44.436, lon: 26.106, name: 'Repair Station', repairService: true, rentalService: true },
    ];
    mockFetchBikeShopsNearRoute.mockResolvedValue(mockShops);

    const { result } = renderHook(
      () => useBikeShops(origin, destination, true),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.shops).toHaveLength(2);
    });

    expect(result.current.shops).toEqual(mockShops);
    expect(mockFetchBikeShopsNearRoute).toHaveBeenCalledWith(origin, destination);
  });

  it('returns empty array when fetch returns empty', async () => {
    mockFetchBikeShopsNearRoute.mockResolvedValue([]);

    const { result } = renderHook(
      () => useBikeShops(origin, destination, true),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.shops).toEqual([]);
  });

  it('returns empty array on fetch failure', async () => {
    mockFetchBikeShopsNearRoute.mockRejectedValue(new Error('Overpass down'));

    const { result } = renderHook(
      () => useBikeShops(origin, destination, true),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.shops).toEqual([]);
  });
});
