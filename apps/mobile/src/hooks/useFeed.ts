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

export const useFeedQuery = (lat: number | null, lon: number | null) =>
  useInfiniteQuery<FeedResponse>({
    queryKey: [FEED_KEY, lat, lon],
    queryFn: ({ pageParam }) =>
      mobileApi.getFeed(lat!, lon!, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    enabled: lat != null && lon != null,
    staleTime: 60_000,
  });

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
