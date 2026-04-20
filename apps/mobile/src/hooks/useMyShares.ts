/**
 * useMyShares — TanStack Query wrapper for GET /v1/route-shares/mine.
 *
 * Exposes:
 *   - `query`: the TanStack `useQuery` result (data / isLoading / refetch / ...)
 *   - `revoke`: mutation helper that optimistically removes the share row
 *     from the cached list and rolls back on failure.
 *
 * Cache key: ['my-shares']. Stale time: 30s — shares don't change that
 * often; longer stale helps when the user toggles between the screen and
 * its back destination.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  mobileApi,
  type MySharesResult,
  type RevokeRouteShareResult,
} from '../lib/api';

const QUERY_KEY = ['my-shares'] as const;

export function useMyShares() {
  const queryClient = useQueryClient();

  const query = useQuery<MySharesResult>({
    queryKey: QUERY_KEY,
    queryFn: () => mobileApi.listMyShares(),
    staleTime: 30_000,
  });

  const revoke = useMutation<
    RevokeRouteShareResult,
    Error,
    { id: string },
    { previous: MySharesResult | undefined }
  >({
    mutationFn: async ({ id }) => mobileApi.revokeMyShare(id),
    // Optimistic: remove the row from the cached list immediately.
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<MySharesResult>(QUERY_KEY);

      if (previous) {
        // Mark revokedAt locally so the UI can show the "revoked" badge
        // without hiding the row outright — matches the spec (list still
        // shows revoked shares, just styled differently).
        const nowIso = new Date().toISOString();
        const next: MySharesResult = {
          ...previous,
          shares: previous.shares.map((row) =>
            row.id === id && row.revokedAt === null
              ? { ...row, revokedAt: nowIso }
              : row,
          ),
          ambassadorStats: {
            ...previous.ambassadorStats,
            // sharesSent counts active-only (see server aggregate logic).
            sharesSent: Math.max(0, previous.ambassadorStats.sharesSent - 1),
          },
        };
        queryClient.setQueryData<MySharesResult>(QUERY_KEY, next);
      }

      return { previous };
    },
    // Rollback on failure. `ok` and `not_found` are both success-ish for
    // the UI (the row is gone either way); only `network_error` / `auth_required`
    // warrant reverting.
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData<MySharesResult>(QUERY_KEY, context.previous);
      }
    },
    onSuccess: (result, _vars, context) => {
      if (result.status === 'ok' || result.status === 'not_found') {
        return;
      }
      if (context?.previous !== undefined) {
        queryClient.setQueryData<MySharesResult>(QUERY_KEY, context.previous);
      }
    },
    // Always refetch after the dust settles so the server is the source
    // of truth (especially for ambassadorStats which are aggregate-derived).
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  return { query, revoke };
}
