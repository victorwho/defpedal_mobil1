import type {
  HazardVoteDirection,
  HazardVoteResponse,
  NearbyHazard,
  QueuedMutation,
} from '@defensivepedal/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { mobileApi } from '../lib/api';
import { castHazardVote } from '../lib/offlineQueue';
import { useAuthSessionOptional } from '../providers/AuthSessionProvider';
import { useConnectivity } from '../providers/ConnectivityMonitor';
import { useAppStore } from '../store/appStore';

type VoteArgs = {
  readonly hazardId: string;
  readonly direction: HazardVoteDirection;
};

type RollbackContext = {
  readonly previousVote: HazardVoteDirection | null;
  readonly patchedHazards: ReadonlyArray<{
    readonly queryKey: readonly unknown[];
    readonly previousData: readonly NearbyHazard[] | undefined;
  }>;
};

const applyOptimisticPatch = (
  hazard: NearbyHazard,
  direction: HazardVoteDirection,
): NearbyHazard => {
  const prev = hazard.userVote;
  let confirmCount = hazard.confirmCount;
  let denyCount = hazard.denyCount;

  // Roll back the prior vote's contribution first, then apply the new one.
  // The server's trigger does the same on UPDATE (see migration 202604210001
  // §2 BLOCKER M1). Without this we'd produce score swings of ±2 on flips.
  if (prev === 'up') confirmCount = Math.max(confirmCount - 1, 0);
  if (prev === 'down') denyCount = Math.max(denyCount - 1, 0);

  if (direction === 'up') confirmCount += 1;
  else denyCount += 1;

  return {
    ...hazard,
    confirmCount,
    denyCount,
    score: confirmCount - denyCount,
    userVote: direction,
  };
};

const synthesizeOfflineResponse = (
  hazardId: string,
  direction: HazardVoteDirection,
  patched: NearbyHazard | null,
): HazardVoteResponse => ({
  hazardId,
  score: patched?.score ?? (direction === 'up' ? 1 : -1),
  confirmCount: patched?.confirmCount ?? (direction === 'up' ? 1 : 0),
  denyCount: patched?.denyCount ?? (direction === 'down' ? 1 : 0),
  userVote: direction,
  expiresAt: patched?.expiresAt ?? new Date().toISOString(),
  lastConfirmedAt: patched?.lastConfirmedAt ?? null,
});

export interface UseHazardVoteResult {
  readonly vote: (args: VoteArgs) => Promise<HazardVoteResponse>;
  readonly upvote: (hazardId: string) => Promise<HazardVoteResponse>;
  readonly downvote: (hazardId: string) => Promise<HazardVoteResponse>;
  readonly isVoting: boolean;
}

export const useHazardVote = (): UseHazardVoteResult => {
  const queryClient = useQueryClient();
  const auth = useAuthSessionOptional();
  const userId = auth?.user?.id ?? null;
  const { isOnline } = useConnectivity();

  const mutation = useMutation<HazardVoteResponse, Error, VoteArgs, RollbackContext>({
    mutationFn: async ({ hazardId, direction }) => {
      if (!isOnline) {
        // Snapshot the optimistic view for the synthesized response.
        const cache = queryClient.getQueryCache();
        let patched: NearbyHazard | null = null;
        for (const entry of cache.getAll()) {
          const key = entry.queryKey;
          if (!Array.isArray(key) || key[0] !== 'nearby-hazards') continue;
          const data = entry.state.data as readonly NearbyHazard[] | undefined;
          if (!data) continue;
          const hit = data.find((h) => h.id === hazardId);
          if (hit) {
            patched = hit;
            break;
          }
        }

        // Collapse + enqueue in a single immutable store transaction.
        useAppStore.setState((state) => ({
          queuedMutations: castHazardVote(state.queuedMutations, hazardId, direction),
        }));

        return synthesizeOfflineResponse(hazardId, direction, patched);
      }

      return mobileApi.voteHazard(hazardId, direction);
    },

    onMutate: async ({ hazardId, direction }): Promise<RollbackContext> => {
      const previousVote = useAppStore.getState().userHazardVotes[hazardId] ?? null;

      // Apply local-store highlight immediately.
      useAppStore.getState().setUserHazardVote(hazardId, direction);

      // Cancel outbound refetches so they don't clobber the optimistic patch.
      await queryClient.cancelQueries({ queryKey: ['nearby-hazards', userId] });

      const snapshots: RollbackContext['patchedHazards'] = queryClient
        .getQueryCache()
        .findAll({ queryKey: ['nearby-hazards', userId] })
        .map((entry) => {
          const key = entry.queryKey;
          const prev = entry.state.data as readonly NearbyHazard[] | undefined;
          if (prev) {
            const next = prev.map((h) =>
              h.id === hazardId ? applyOptimisticPatch(h, direction) : h,
            );
            queryClient.setQueryData(key, next);
          }
          return { queryKey: key, previousData: prev };
        });

      return { previousVote, patchedHazards: snapshots };
    },

    onError: (_err, { hazardId }, context) => {
      if (!context) return;
      // Restore the prior local-store highlight.
      if (context.previousVote) {
        useAppStore.getState().setUserHazardVote(hazardId, context.previousVote);
      } else {
        useAppStore.getState().clearUserHazardVote(hazardId);
      }
      // Restore each cache snapshot we patched.
      for (const snap of context.patchedHazards) {
        queryClient.setQueryData(snap.queryKey, snap.previousData);
      }
    },

    onSuccess: (_data, _vars, _context) => {
      // Only pull server truth when we actually hit the server. On the offline
      // branch the synthesized response is the truth until the queue drains —
      // an invalidate here would trigger a refetch that races the drain and
      // reverts the optimistic state.
      if (!isOnline) return;
      queryClient.invalidateQueries({ queryKey: ['nearby-hazards', userId] });
    },
  });

  const vote = useCallback(
    (args: VoteArgs) => mutation.mutateAsync(args),
    [mutation],
  );

  const upvote = useCallback(
    (hazardId: string) => mutation.mutateAsync({ hazardId, direction: 'up' }),
    [mutation],
  );

  const downvote = useCallback(
    (hazardId: string) => mutation.mutateAsync({ hazardId, direction: 'down' }),
    [mutation],
  );

  return {
    vote,
    upvote,
    downvote,
    isVoting: mutation.isPending,
  };
};

// Types re-exported so tests and consumers don't need to reach into this file.
export type { VoteArgs, RollbackContext, QueuedMutation };
