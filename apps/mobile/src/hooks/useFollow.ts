import type { FollowRequest, FollowStatus, SuggestedUser } from '@defensivepedal/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { mobileApi } from '../lib/api';

const FOLLOW_REQUESTS_KEY = 'follow-requests';
const SUGGESTED_USERS_KEY = 'suggested-users';
const USER_PROFILE_KEY = 'user-public-profile';

// ---------------------------------------------------------------------------
// Follow / Unfollow
// ---------------------------------------------------------------------------

export const useFollowUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => mobileApi.followUser(userId),
    onSuccess: (_data, userId) => {
      // Invalidate the target user's profile to refresh follow status
      void queryClient.invalidateQueries({ queryKey: [USER_PROFILE_KEY, userId] });
      void queryClient.invalidateQueries({ queryKey: [SUGGESTED_USERS_KEY] });
    },
  });
};

export const useUnfollowUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => mobileApi.unfollowUser(userId),
    onSuccess: (_data, userId) => {
      void queryClient.invalidateQueries({ queryKey: [USER_PROFILE_KEY, userId] });
    },
  });
};

// ---------------------------------------------------------------------------
// Follow Request Approval / Decline
// ---------------------------------------------------------------------------

export const useApproveFollowRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requesterId: string) => mobileApi.approveFollowRequest(requesterId),
    onMutate: async (requesterId) => {
      await queryClient.cancelQueries({ queryKey: [FOLLOW_REQUESTS_KEY] });

      const previous = queryClient.getQueryData<{ requests: FollowRequest[] }>([FOLLOW_REQUESTS_KEY]);

      // Optimistically remove the approved request from the list
      queryClient.setQueryData<{ requests: FollowRequest[] }>(
        [FOLLOW_REQUESTS_KEY],
        (old) => {
          if (!old) return old;
          return {
            requests: old.requests.filter((r) => r.id !== requesterId),
          };
        },
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData([FOLLOW_REQUESTS_KEY], context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [FOLLOW_REQUESTS_KEY] });
    },
  });
};

export const useDeclineFollowRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requesterId: string) => mobileApi.declineFollowRequest(requesterId),
    onMutate: async (requesterId) => {
      await queryClient.cancelQueries({ queryKey: [FOLLOW_REQUESTS_KEY] });

      const previous = queryClient.getQueryData<{ requests: FollowRequest[] }>([FOLLOW_REQUESTS_KEY]);

      queryClient.setQueryData<{ requests: FollowRequest[] }>(
        [FOLLOW_REQUESTS_KEY],
        (old) => {
          if (!old) return old;
          return {
            requests: old.requests.filter((r) => r.id !== requesterId),
          };
        },
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData([FOLLOW_REQUESTS_KEY], context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [FOLLOW_REQUESTS_KEY] });
    },
  });
};

// ---------------------------------------------------------------------------
// Follow Requests (incoming pending)
// ---------------------------------------------------------------------------

export const useFollowRequests = () =>
  useQuery<{ requests: FollowRequest[] }>({
    queryKey: [FOLLOW_REQUESTS_KEY],
    queryFn: () => mobileApi.getFollowRequests(),
    staleTime: 60_000,
  });

// ---------------------------------------------------------------------------
// Suggested Users
// ---------------------------------------------------------------------------

export const useSuggestedUsers = (lat: number | null, lon: number | null) =>
  useQuery<{ users: SuggestedUser[] }>({
    queryKey: [SUGGESTED_USERS_KEY, lat, lon],
    queryFn: () => mobileApi.getSuggestedUsers(lat!, lon!, 10),
    enabled: lat != null && lon != null,
    staleTime: 5 * 60_000,
  });
