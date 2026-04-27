import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { mobileApi } from '../lib/api';

export const BLOCKED_USERS_KEY = 'blocked-users';

export type BlockedUser = {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  blockedAt: string;
};

/**
 * Block / unblock another user. The server cascades the change into all
 * feed reads via RLS, but the local feed cache won't reflect the change
 * until the next refetch — so we invalidate the community-feed and
 * blocked-users caches on success.
 */
export const useBlockUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => mobileApi.blockUser(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BLOCKED_USERS_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['community-feed'] });
      void queryClient.invalidateQueries({ queryKey: ['feed-comments'] });
    },
  });
};

export const useUnblockUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => mobileApi.unblockUser(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BLOCKED_USERS_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['community-feed'] });
      void queryClient.invalidateQueries({ queryKey: ['feed-comments'] });
    },
  });
};

export const useBlockedUsersQuery = () =>
  useQuery({
    queryKey: [BLOCKED_USERS_KEY],
    queryFn: () => mobileApi.getBlockedUsers().then((r) => r.blocked as BlockedUser[]),
    staleTime: 60_000,
  });
