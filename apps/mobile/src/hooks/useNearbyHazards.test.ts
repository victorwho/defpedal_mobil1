// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetNearbyHazards = vi.fn();

vi.mock('../lib/api', () => ({
  mobileApi: {
    getNearbyHazards: (...args: unknown[]) => mockGetNearbyHazards(...args),
  },
}));

vi.mock('../providers/AuthSessionProvider', () => ({
  useAuthSessionOptional: () => ({ user: { id: 'test-user' } }),
}));

import { useNearbyHazards } from './useNearbyHazards';

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

describe('useNearbyHazards', () => {
  const userCoordinate = { lat: 44.43, lon: 26.1 };

  it('does not fetch when disabled', () => {
    const { result } = renderHook(
      () => useNearbyHazards(userCoordinate, false),
      { wrapper },
    );

    expect(result.current.hazards).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockGetNearbyHazards).not.toHaveBeenCalled();
  });

  it('does not fetch when coordinate is null', () => {
    const { result } = renderHook(
      () => useNearbyHazards(null, true),
      { wrapper },
    );

    expect(result.current.hazards).toEqual([]);
    expect(mockGetNearbyHazards).not.toHaveBeenCalled();
  });

  it('does not fetch when both disabled and coordinate is null', () => {
    const { result } = renderHook(
      () => useNearbyHazards(null, false),
      { wrapper },
    );

    expect(result.current.hazards).toEqual([]);
    expect(mockGetNearbyHazards).not.toHaveBeenCalled();
  });

  it('fetches hazards when enabled and coordinate is provided', async () => {
    const futureExpiry = new Date(Date.now() + 86_400_000).toISOString();
    const mockHazards = [
      {
        id: 'hz-1',
        lat: 44.431,
        lon: 26.101,
        hazardType: 'pothole',
        createdAt: '2026-04-01T10:00:00Z',
        confirmCount: 3,
        denyCount: 0,
        score: 3,
        userVote: null,
        expiresAt: futureExpiry,
        lastConfirmedAt: null,
        distanceMeters: 150,
      },
      {
        id: 'hz-2',
        lat: 44.432,
        lon: 26.102,
        hazardType: 'aggro_dogs',
        createdAt: '2026-04-02T10:00:00Z',
        confirmCount: 1,
        denyCount: 0,
        score: 1,
        userVote: null,
        expiresAt: futureExpiry,
        lastConfirmedAt: null,
      },
    ];
    mockGetNearbyHazards.mockResolvedValue(mockHazards);

    const { result } = renderHook(
      () => useNearbyHazards(userCoordinate, true),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.hazards).toHaveLength(2);
    });

    expect(result.current.hazards).toEqual(mockHazards);
    expect(mockGetNearbyHazards).toHaveBeenCalledWith(44.43, 26.1, 1000);
  });

  it('client-side filters out expired hazards even when the server returns them', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    mockGetNearbyHazards.mockResolvedValue([
      {
        id: 'hz-expired',
        lat: 44.431, lon: 26.101, hazardType: 'pothole',
        createdAt: '2026-04-01T10:00:00Z',
        confirmCount: 1, denyCount: 0, score: 1,
        userVote: null, expiresAt: past, lastConfirmedAt: null,
      },
      {
        id: 'hz-live',
        lat: 44.432, lon: 26.102, hazardType: 'pothole',
        createdAt: '2026-04-01T10:00:00Z',
        confirmCount: 1, denyCount: 0, score: 1,
        userVote: null, expiresAt: future, lastConfirmedAt: null,
      },
    ]);

    const { result } = renderHook(
      () => useNearbyHazards(userCoordinate, true),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.hazards).toHaveLength(1);
    });
    expect(result.current.hazards[0].id).toBe('hz-live');
  });

  it('uses custom radius when provided', async () => {
    mockGetNearbyHazards.mockResolvedValue([]);

    const { result } = renderHook(
      () => useNearbyHazards(userCoordinate, true, 2000),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetNearbyHazards).toHaveBeenCalledWith(44.43, 26.1, 2000);
  });

  it('returns empty array when API returns empty list', async () => {
    mockGetNearbyHazards.mockResolvedValue([]);

    const { result } = renderHook(
      () => useNearbyHazards(userCoordinate, true),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hazards).toEqual([]);
  });

  it('returns empty array on API failure', async () => {
    mockGetNearbyHazards.mockRejectedValue(new Error('API error'));

    const { result } = renderHook(
      () => useNearbyHazards(userCoordinate, true),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hazards).toEqual([]);
  });
});
