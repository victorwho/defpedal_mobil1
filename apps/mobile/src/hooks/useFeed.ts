import type {
  FeedComment,
  FeedCommentRequest,
  FeedItem,
  FeedResponse,
  ProfileResponse,
  ProfileUpdateRequest,
  ShareTripRequest,
} from '@defensivepedal/core';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { mobileApi } from '../lib/api';

const FEED_KEY = 'community-feed';
const COMMENTS_KEY = 'feed-comments';
const PROFILE_KEY = 'user-profile';

// ---------------------------------------------------------------------------
// Feed (infinite scroll)
// ---------------------------------------------------------------------------

/**
 * Page param carries both the cursor and the ladder scope the server
 * resolved on the first page, so every subsequent page stays within one
 * consistent radius (Change 2 — see feed routes).
 */
interface FeedPageParam {
  readonly cursor: string;
  readonly scope?: FeedResponse['scopeUsed'];
}

export const useFeedQuery = (lat: number | null, lon: number | null) =>
  useInfiniteQuery<FeedResponse>({
    queryKey: [FEED_KEY, lat, lon],
    queryFn: ({ pageParam }) => {
      const page = pageParam as FeedPageParam | undefined;
      return mobileApi.getFeed(lat!, lon!, page?.cursor, undefined, page?.scope);
    },
    initialPageParam: undefined as FeedPageParam | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.cursor
        ? ({ cursor: lastPage.cursor, scope: lastPage.scopeUsed } satisfies FeedPageParam)
        : undefined,
    enabled: lat != null && lon != null,
    staleTime: 60_000,
  });

/**
 * Look up a feed item by id across ALL cached feed pages, regardless of
 * which `[FEED_KEY, lat, lon]` cache key holds them.
 *
 * Why we need this: `useCurrentLocation` reads fresh GPS on every screen
 * mount, so navigating from `/community-feed` to `/community-trip?id=…`
 * usually produces a slightly different lat/lon and therefore a fresh
 * `useFeedQuery` cache entry that doesn't yet contain the item the user
 * just tapped. Searching the full feed-cache space lets the destination
 * screen render immediately from cached data instead of stalling on
 * "Loading trip details..." while the new query refetches (and possibly
 * paginates past the requested item).
 */
export const useFeedItemFromCache = (id: string | null): FeedItem | null => {
  const queryClient = useQueryClient();

  if (!id) return null;

  const cached = queryClient.getQueriesData<{ pages: FeedResponse[] }>({
    queryKey: [FEED_KEY],
  });

  for (const [, data] of cached) {
    if (!data?.pages) continue;
    for (const page of data.pages) {
      const match = page.items.find((entry) => entry.id === id);
      if (match) return match;
    }
  }

  return null;
};

// ---------------------------------------------------------------------------
// Share trip
// ---------------------------------------------------------------------------

export const useShareTrip = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ShareTripRequest) => mobileApi.shareTripToFeed(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [FEED_KEY] });
    },
  });
};

// ---------------------------------------------------------------------------
// Like toggle (optimistic)
// ---------------------------------------------------------------------------

export const useLikeToggle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, liked }: { id: string; liked: boolean }) => {
      if (liked) {
        return mobileApi.unlikeFeedItem(id);
      }
      return mobileApi.likeFeedItem(id);
    },
    onMutate: async ({ id, liked }) => {
      await queryClient.cancelQueries({ queryKey: [FEED_KEY] });

      const previousData = queryClient.getQueriesData<{ pages: FeedResponse[] }>({
        queryKey: [FEED_KEY],
      });

      queryClient.setQueriesData<{ pages: FeedResponse[]; pageParams: unknown[] }>(
        { queryKey: [FEED_KEY] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item: FeedItem) =>
                item.id === id
                  ? {
                      ...item,
                      likedByMe: !liked,
                      likeCount: item.likeCount + (liked ? -1 : 1),
                    }
                  : item,
              ),
            })),
          };
        },
      );

      return { previousData };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        context.previousData.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
    },
    onSettled: () => {
      // Delay invalidation to let the server process the like before refetching
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: [FEED_KEY] });
      }, 3000);
    },
  });
};

// ---------------------------------------------------------------------------
// Love toggle (optimistic)
// ---------------------------------------------------------------------------

export const useLoveToggle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, loved }: { id: string; loved: boolean }) => {
      if (loved) {
        return mobileApi.unloveFeedItem(id);
      }
      return mobileApi.loveFeedItem(id);
    },
    onMutate: async ({ id, loved }) => {
      await queryClient.cancelQueries({ queryKey: [FEED_KEY] });

      const previousData = queryClient.getQueriesData<{ pages: FeedResponse[] }>({
        queryKey: [FEED_KEY],
      });

      queryClient.setQueriesData<{ pages: FeedResponse[]; pageParams: unknown[] }>(
        { queryKey: [FEED_KEY] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item: FeedItem) =>
                item.id === id
                  ? {
                      ...item,
                      lovedByMe: !loved,
                      loveCount: (item.loveCount ?? 0) + (loved ? -1 : 1),
                    }
                  : item,
              ),
            })),
          };
        },
      );

      return { previousData };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        context.previousData.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
    },
    onSettled: () => {
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: [FEED_KEY] });
      }, 3000);
    },
  });
};

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export const useComments = (tripShareId: string | null) =>
  useQuery<{ comments: FeedComment[] }>({
    queryKey: [COMMENTS_KEY, tripShareId],
    queryFn: () => mobileApi.getFeedComments(tripShareId!),
    enabled: tripShareId != null,
  });

export const usePostComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      tripShareId,
      body,
    }: {
      tripShareId: string;
      body: string;
    }) => mobileApi.postFeedComment(tripShareId, { body } as FeedCommentRequest),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: [COMMENTS_KEY, vars.tripShareId],
      });
      // Optimistically increment commentCount in the feed cache so the feed
      // card shows the updated count without waiting for a full refetch.
      queryClient.setQueriesData<{ pages: FeedResponse[]; pageParams: unknown[] }>(
        { queryKey: [FEED_KEY] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === vars.tripShareId
                  ? { ...item, commentCount: item.commentCount + 1 }
                  : item,
              ),
            })),
          };
        },
      );
    },
  });
};

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const useProfile = () =>
  useQuery<ProfileResponse>({
    queryKey: [PROFILE_KEY],
    queryFn: () => mobileApi.getProfile(),
    staleTime: 5 * 60_000,
  });

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ProfileUpdateRequest) => mobileApi.updateProfile(payload),
    onSuccess: (data) => {
      queryClient.setQueryData([PROFILE_KEY], data);
    },
  });
};
