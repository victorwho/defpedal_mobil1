import type {
  ActivityFeedItem,
  ActivityFeedResponse,
  FeedComment,
} from '@defensivepedal/core';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { mobileApi } from '../lib/api';

const ACTIVITY_FEED_KEY = 'activity-feed';
const ACTIVITY_COMMENTS_KEY = 'activity-comments';

// ---------------------------------------------------------------------------
// Activity Feed (infinite scroll, ranked)
// ---------------------------------------------------------------------------

export const useActivityFeedQuery = (lat: number | null, lon: number | null) =>
  useInfiniteQuery<ActivityFeedResponse>({
    queryKey: [ACTIVITY_FEED_KEY, lat, lon],
    queryFn: ({ pageParam }) => {
      const cursor = pageParam as string | undefined;
      let cursorScore: number | undefined;
      let cursorId: string | undefined;

      if (cursor) {
        const colonIndex = cursor.indexOf(':');
        if (colonIndex > 0) {
          cursorScore = Number(cursor.slice(0, colonIndex));
          cursorId = cursor.slice(colonIndex + 1);
        }
      }

      return mobileApi.getActivityFeed(lat!, lon!, cursorScore, cursorId);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    enabled: lat != null && lon != null,
    staleTime: 60_000,
  });

// ---------------------------------------------------------------------------
// React (like/love) toggle — optimistic
// ---------------------------------------------------------------------------

export const useActivityReaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      type,
      active,
    }: {
      id: string;
      type: 'like' | 'love';
      active: boolean;
    }) => {
      if (active) {
        return mobileApi.unreactToActivity(id, type);
      }
      return mobileApi.reactToActivity(id, type);
    },
    onMutate: async ({ id, type, active }) => {
      await queryClient.cancelQueries({ queryKey: [ACTIVITY_FEED_KEY] });

      const previousData = queryClient.getQueriesData<{ pages: ActivityFeedResponse[] }>({
        queryKey: [ACTIVITY_FEED_KEY],
      });

      queryClient.setQueriesData<{ pages: ActivityFeedResponse[]; pageParams: unknown[] }>(
        { queryKey: [ACTIVITY_FEED_KEY] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item: ActivityFeedItem) => {
                if (item.id !== id) return item;
                if (type === 'like') {
                  return {
                    ...item,
                    likedByMe: !active,
                    likeCount: item.likeCount + (active ? -1 : 1),
                  };
                }
                return {
                  ...item,
                  lovedByMe: !active,
                  loveCount: item.loveCount + (active ? -1 : 1),
                };
              }),
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
        void queryClient.invalidateQueries({ queryKey: [ACTIVITY_FEED_KEY] });
      }, 3000);
    },
  });
};

/**
 * Look up an activity-feed item by id across ALL cached
 * `[ACTIVITY_FEED_KEY, lat, lon]` pages, not just the current screen's
 * location-keyed query. Same motivation as `useFeedItemFromCache`:
 * `useCurrentLocation` re-reads GPS on every screen mount, producing a
 * fresh cache key that may not yet contain the item the caller's feed
 * already had.
 */
export const useActivityFeedItemFromCache = (
  id: string | null,
): ActivityFeedItem | null => {
  const queryClient = useQueryClient();

  if (!id) return null;

  const cached = queryClient.getQueriesData<{ pages: ActivityFeedResponse[] }>({
    queryKey: [ACTIVITY_FEED_KEY],
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
// Comments
// ---------------------------------------------------------------------------

export const useActivityComments = (activityId: string | null) =>
  useQuery<{ comments: FeedComment[] }>({
    queryKey: [ACTIVITY_COMMENTS_KEY, activityId],
    queryFn: () => mobileApi.getActivityComments(activityId!),
    enabled: activityId != null,
    // 60s tolerance — the inline-on-card preview hits the same cache as
    // the comment sheet, so dozens of cards may subscribe to this query
    // simultaneously while scrolling. Without staleTime, every card mount
    // fires a refetch.
    staleTime: 60_000,
  });

/**
 * Hook input for `usePostActivityComment` — needs the current user so the
 * optimistic comment row can render with the right author. Pulled from the
 * AuthSession context at the call site.
 */
export interface PostActivityCommentVars {
  activityId: string;
  body: string;
  optimisticAuthor: { id: string; displayName: string; avatarUrl: string | null };
}

export const usePostActivityComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ activityId, body }: PostActivityCommentVars) =>
      mobileApi.postActivityComment(activityId, body),
    // Optimistic update — push the comment into the comments list immediately
    // so it shows up in the sheet without waiting for refetch. Roll back if
    // the server rejects.
    onMutate: async (vars) => {
      const commentsKey = [ACTIVITY_COMMENTS_KEY, vars.activityId];
      await queryClient.cancelQueries({ queryKey: commentsKey });
      const previousComments = queryClient.getQueryData<{ comments: FeedComment[] }>(commentsKey);

      const tempComment: FeedComment = {
        id: `optimistic-${Date.now()}`,
        user: {
          id: vars.optimisticAuthor.id,
          displayName: vars.optimisticAuthor.displayName,
          avatarUrl: vars.optimisticAuthor.avatarUrl,
        },
        body: vars.body,
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData<{ comments: FeedComment[] }>(commentsKey, (old) => ({
        comments: [...(old?.comments ?? []), tempComment],
      }));

      // Bump commentCount on the feed card too.
      queryClient.setQueriesData<{ pages: ActivityFeedResponse[]; pageParams: unknown[] }>(
        { queryKey: [ACTIVITY_FEED_KEY] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === vars.activityId
                  ? { ...item, commentCount: item.commentCount + 1 }
                  : item,
              ),
            })),
          };
        },
      );

      return { previousComments, commentsKey };
    },
    onError: (_err, vars, context) => {
      if (context?.previousComments !== undefined) {
        queryClient.setQueryData(context.commentsKey, context.previousComments);
      }
      // Roll back commentCount.
      queryClient.setQueriesData<{ pages: ActivityFeedResponse[]; pageParams: unknown[] }>(
        { queryKey: [ACTIVITY_FEED_KEY] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === vars.activityId
                  ? { ...item, commentCount: Math.max(0, item.commentCount - 1) }
                  : item,
              ),
            })),
          };
        },
      );
    },
    onSettled: (_data, _err, vars) => {
      // Refetch the authoritative comments list (replaces the optimistic
      // entry with the server-issued row + real id).
      void queryClient.invalidateQueries({
        queryKey: [ACTIVITY_COMMENTS_KEY, vars.activityId],
      });
    },
  });
};
