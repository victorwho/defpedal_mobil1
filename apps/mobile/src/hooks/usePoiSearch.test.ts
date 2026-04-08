// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SearchedPoi } from '../lib/poi-search';

const mockFetchPoiSearchResults = vi.fn();

vi.mock('../lib/poi-search', () => ({
  fetchPoiSearchResults: (...args: unknown[]) =>
    mockFetchPoiSearchResults(...args),
}));

import { usePoiSearch } from './usePoiSearch';

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

describe('usePoiSearch', () => {
  const origin = { lat: 44.43, lon: 26.1 };
  const destination = { lat: 44.44, lon: 26.11 };

  const noVisibility = {
    hydration: false,
    repair: false,
    restroom: false,
    bikeRental: false,
    bikeParking: false,
    supplies: false,
  };

  it('does not fetch when all categories are disabled', () => {
    const { result } = renderHook(
      () => usePoiSearch(origin, destination, noVisibility),
      { wrapper },
    );

    expect(result.current.searchedPois).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockFetchPoiSearchResults).not.toHaveBeenCalled();
  });

  it('does not fetch when visibility is undefined', () => {
    const { result } = renderHook(
      () => usePoiSearch(origin, destination, undefined),
      { wrapper },
    );

    expect(result.current.searchedPois).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockFetchPoiSearchResults).not.toHaveBeenCalled();
  });

  it('fetches hydration POIs when hydration is enabled', async () => {
    const mockPois: SearchedPoi[] = [
      { id: 'mbx-1', lat: 44.435, lon: 26.105, name: 'Water Fountain', category: 'fountain' },
    ];
    mockFetchPoiSearchResults.mockResolvedValue(mockPois);

    const visibility = { ...noVisibility, hydration: true };

    const { result } = renderHook(
      () => usePoiSearch(origin, destination, visibility),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.searchedPois).toHaveLength(1);
    });

    expect(result.current.searchedPois).toEqual(mockPois);
    expect(mockFetchPoiSearchResults).toHaveBeenCalledWith('hydration', origin, destination);
  });

  it('fetches supplies POIs when supplies is enabled', async () => {
    const mockPois: SearchedPoi[] = [
      { id: 'mbx-2', lat: 44.436, lon: 26.106, name: 'Mini Market', category: 'convenience_store' },
    ];
    mockFetchPoiSearchResults.mockResolvedValue(mockPois);

    const visibility = { ...noVisibility, supplies: true };

    const { result } = renderHook(
      () => usePoiSearch(origin, destination, visibility),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.searchedPois).toHaveLength(1);
    });

    expect(mockFetchPoiSearchResults).toHaveBeenCalledWith('supplies', origin, destination);
  });

  it('combines results from multiple enabled categories', async () => {
    const hydrationPois: SearchedPoi[] = [
      { id: 'mbx-1', lat: 44.435, lon: 26.105, name: 'Fountain', category: 'fountain' },
    ];
    const suppliesPois: SearchedPoi[] = [
      { id: 'mbx-2', lat: 44.436, lon: 26.106, name: 'Store', category: 'supermarket' },
    ];

    mockFetchPoiSearchResults.mockImplementation((category: string) => {
      if (category === 'hydration') return Promise.resolve(hydrationPois);
      if (category === 'supplies') return Promise.resolve(suppliesPois);
      return Promise.resolve([]);
    });

    const visibility = { ...noVisibility, hydration: true, supplies: true };

    const { result } = renderHook(
      () => usePoiSearch(origin, destination, visibility),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.searchedPois).toHaveLength(2);
    });

    expect(result.current.searchedPois).toEqual([...hydrationPois, ...suppliesPois]);
  });

  it('returns empty array when fetch fails', async () => {
    mockFetchPoiSearchResults.mockRejectedValue(new Error('API error'));

    const visibility = { ...noVisibility, hydration: true };

    const { result } = renderHook(
      () => usePoiSearch(origin, destination, visibility),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.searchedPois).toEqual([]);
  });
});
