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

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export const useActivityComments = (activityId: string | null) =>
  useQuery<{ comments: FeedComment[] }>({
    queryKey: [ACTIVITY_COMMENTS_KEY, activityId],
    queryFn: () => mobileApi.getActivityComments(activityId!),
    enabled: activityId != null,
  });

export const usePostActivityComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ activityId, body }: { activityId: string; body: string }) =>
      mobileApi.postActivityComment(activityId, body),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: [ACTIVITY_COMMENTS_KEY, vars.activityId],
      });
      // Optimistically increment commentCount
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
    },
  });
};
