// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchBadges = vi.fn();

vi.mock('../lib/api', () => ({
  mobileApi: {
    fetchBadges: (...args: unknown[]) => mockFetchBadges(...args),
  },
}));

import { useBadges } from './useBadges';

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

describe('useBadges', () => {
  it('fetches badges from the API', async () => {
    const badgeResponse = {
      definitions: [
        {
          id: 'first-ride',
          name: 'First Ride',
          description: 'Complete your first ride',
          category: 'milestones',
          iconName: 'bicycle',
          tier: 'bronze',
        },
      ],
      earned: [
        {
          badgeId: 'first-ride',
          earnedAt: '2026-04-01T08:00:00Z',
        },
      ],
      progress: [
        {
          badgeId: 'first-ride',
          currentValue: 1,
          targetValue: 1,
          progressPercent: 100,
        },
      ],
    };
    mockFetchBadges.mockResolvedValue(badgeResponse);

    const { result } = renderHook(() => useBadges(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data).toEqual(badgeResponse);
    expect(result.current.data?.definitions).toHaveLength(1);
    expect(result.current.data?.earned).toHaveLength(1);
    expect(result.current.data?.progress).toHaveLength(1);
    expect(mockFetchBadges).toHaveBeenCalledTimes(1);
  });

  it('handles API failure gracefully', async () => {
    mockFetchBadges.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useBadges(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('returns loading state initially', () => {
    mockFetchBadges.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useBadges(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns empty arrays when API returns empty badge data', async () => {
    const emptyBadgeResponse = {
      definitions: [],
      earned: [],
      progress: [],
    };
    mockFetchBadges.mockResolvedValue(emptyBadgeResponse);

    const { result } = renderHook(() => useBadges(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data?.definitions).toEqual([]);
    expect(result.current.data?.earned).toEqual([]);
    expect(result.current.data?.progress).toEqual([]);
  });
});
