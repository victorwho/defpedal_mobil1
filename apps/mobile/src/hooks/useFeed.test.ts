// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted so mocks are available at vi.mock hoist time
const mockMobileApi = vi.hoisted(() => ({
  getFeed: vi.fn(),
  shareTripToFeed: vi.fn(),
  likeFeedItem: vi.fn(),
  unlikeFeedItem: vi.fn(),
  loveFeedItem: vi.fn(),
  unloveFeedItem: vi.fn(),
  getFeedComments: vi.fn(),
  postFeedComment: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  mobileApi: mockMobileApi,
}));

import {
  useComments,
  useFeedQuery,
  useLikeToggle,
  useLoveToggle,
  usePostComment,
  useProfile,
  useShareTrip,
  useUpdateProfile,
} from './useFeed';

let queryClient: QueryClient;

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  vi.clearAllMocks();
});

afterEach(() => {
  queryClient.clear();
});

// ---------------------------------------------------------------------------
// useFeedQuery
// ---------------------------------------------------------------------------

describe('useFeedQuery', () => {
  it('does not fetch when lat is null', () => {
    const { result } = renderHook(() => useFeedQuery(null, 26.1), {
      wrapper,
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockMobileApi.getFeed).not.toHaveBeenCalled();
  });

  it('does not fetch when lon is null', () => {
    const { result } = renderHook(() => useFeedQuery(44.43, null), {
      wrapper,
    });

    expect(result.current.data).toBeUndefined();
    expect(mockMobileApi.getFeed).not.toHaveBeenCalled();
  });

  it('fetches feed when both coords are provided', async () => {
    const feedResponse = {
      items: [
        {
          id: 'trip-1',
          user: { id: 'u1', displayName: 'Rider', username: null, avatarUrl: null },
          title: 'Morning ride',
          startLocationText: 'Home',
          destinationText: 'Office',
          distanceMeters: 5000,
          durationSeconds: 1200,
          elevationGainMeters: 50,
          averageSpeedMps: 4.2,
          safetyRating: 8,
          safetyTags: [],
          geometryPolyline6: 'encoded',
          note: null,
          sharedAt: '2026-04-01T08:00:00Z',
          likeCount: 3,
          loveCount: 1,
          co2SavedKg: 0.6,
          commentCount: 0,
          likedByMe: false,
          lovedByMe: false,
        },
      ],
      cursor: null,
    };
    mockMobileApi.getFeed.mockResolvedValue(feedResponse);

    const { result } = renderHook(() => useFeedQuery(44.43, 26.1), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.data?.pages[0].items).toHaveLength(1);
    expect(mockMobileApi.getFeed).toHaveBeenCalledWith(44.43, 26.1, undefined);
  });
});

// ---------------------------------------------------------------------------
// useShareTrip
// ---------------------------------------------------------------------------

describe('useShareTrip', () => {
  it('calls shareTripToFeed and invalidates feed cache on success', async () => {
    mockMobileApi.shareTripToFeed.mockResolvedValue({
      id: 'share-1',
      sharedAt: '2026-04-01T09:00:00Z',
    });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useShareTrip(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        startLocationText: 'Home',
        destinationText: 'Park',
        distanceMeters: 3000,
        durationSeconds: 900,
        geometryPolyline6: 'encoded',
        startCoordinate: { lat: 44.43, lon: 26.1 },
      });
    });

    expect(mockMobileApi.shareTripToFeed).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['community-feed'] }),
    );
  });
});

// ---------------------------------------------------------------------------
// useLikeToggle
// ---------------------------------------------------------------------------

describe('useLikeToggle', () => {
  it('calls likeFeedItem when item is not liked', async () => {
    mockMobileApi.likeFeedItem.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useLikeToggle(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 'trip-1', liked: false });
    });

    expect(mockMobileApi.likeFeedItem).toHaveBeenCalledWith('trip-1');
    expect(mockMobileApi.unlikeFeedItem).not.toHaveBeenCalled();
  });

  it('calls unlikeFeedItem when item is already liked', async () => {
    mockMobileApi.unlikeFeedItem.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useLikeToggle(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 'trip-1', liked: true });
    });

    expect(mockMobileApi.unlikeFeedItem).toHaveBeenCalledWith('trip-1');
    expect(mockMobileApi.likeFeedItem).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useLoveToggle
// ---------------------------------------------------------------------------

describe('useLoveToggle', () => {
  it('calls loveFeedItem when item is not loved', async () => {
    mockMobileApi.loveFeedItem.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useLoveToggle(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 'trip-1', loved: false });
    });

    expect(mockMobileApi.loveFeedItem).toHaveBeenCalledWith('trip-1');
    expect(mockMobileApi.unloveFeedItem).not.toHaveBeenCalled();
  });

  it('calls unloveFeedItem when item is already loved', async () => {
    mockMobileApi.unloveFeedItem.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useLoveToggle(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 'trip-1', loved: true });
    });

    expect(mockMobileApi.unloveFeedItem).toHaveBeenCalledWith('trip-1');
    expect(mockMobileApi.loveFeedItem).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useComments
// ---------------------------------------------------------------------------

describe('useComments', () => {
  it('does not fetch when tripShareId is null', () => {
    const { result } = renderHook(() => useComments(null), { wrapper });

    expect(result.current.data).toBeUndefined();
    expect(mockMobileApi.getFeedComments).not.toHaveBeenCalled();
  });

  it('fetches comments when tripShareId is provided', async () => {
    const commentsData = {
      comments: [
        {
          id: 'c1',
          user: { id: 'u1', displayName: 'Rider', username: null, avatarUrl: null },
          body: 'Nice route!',
          createdAt: '2026-04-01T09:00:00Z',
        },
      ],
    };
    mockMobileApi.getFeedComments.mockResolvedValue(commentsData);

    const { result } = renderHook(() => useComments('trip-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data?.comments).toHaveLength(1);
    expect(mockMobileApi.getFeedComments).toHaveBeenCalledWith('trip-1');
  });
});

// ---------------------------------------------------------------------------
// usePostComment
// ---------------------------------------------------------------------------

describe('usePostComment', () => {
  it('posts a comment and invalidates comments cache', async () => {
    mockMobileApi.postFeedComment.mockResolvedValue({ ok: true });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => usePostComment(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        tripShareId: 'trip-1',
        body: 'Great ride!',
      });
    });

    expect(mockMobileApi.postFeedComment).toHaveBeenCalledWith('trip-1', {
      body: 'Great ride!',
    });
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['feed-comments', 'trip-1'] }),
    );
  });
});

// ---------------------------------------------------------------------------
// useProfile
// ---------------------------------------------------------------------------

describe('useProfile', () => {
  it('fetches user profile', async () => {
    const profileData = {
      id: 'u1',
      displayName: 'Rider',
      username: 'rider123',
      avatarUrl: null,
      autoShareRides: false,
      trimRouteEndpoints: false,
      cyclingGoal: 'commute',
    };
    mockMobileApi.getProfile.mockResolvedValue(profileData);

    const { result } = renderHook(() => useProfile(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data).toEqual(profileData);
    expect(mockMobileApi.getProfile).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// useUpdateProfile
// ---------------------------------------------------------------------------

describe('useUpdateProfile', () => {
  it('updates profile and sets cache data on success', async () => {
    const updatedProfile = {
      id: 'u1',
      displayName: 'New Name',
      username: 'rider123',
      avatarUrl: null,
      autoShareRides: true,
      trimRouteEndpoints: false,
      cyclingGoal: 'explore',
    };
    mockMobileApi.updateProfile.mockResolvedValue(updatedProfile);

    const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');

    const { result } = renderHook(() => useUpdateProfile(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        displayName: 'New Name',
        autoShareRides: true,
      });
    });

    expect(mockMobileApi.updateProfile).toHaveBeenCalledWith({
      displayName: 'New Name',
      autoShareRides: true,
    });
    expect(setQueryDataSpy).toHaveBeenCalledWith(
      ['user-profile'],
      updatedProfile,
    );
  });
});
