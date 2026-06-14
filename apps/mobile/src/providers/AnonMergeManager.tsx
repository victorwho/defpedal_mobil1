/**
 * AnonMergeManager — fires the anonymous→account data merge (review P1 #10).
 *
 * When a non-anonymous session appears and a captured anonymous access token is
 * pending (written by `captureAnonForMerge` at sign-in initiation), this calls
 * POST /v1/account/merge-anonymous to re-parent the anon account's data onto the
 * new account. Authenticated as the new account; the server verifies the anon
 * token and only merges into a fresh target.
 *
 * Mounted under QueryClientProvider + AuthSessionProvider. After a successful
 * merge it invalidates queries so History / Impact / Badges refetch the
 * preserved progress (UserCacheResetBridge already cleared the cache on the
 * uid change, but that refetch ran before the merge completed).
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { clearAnonMergePending, readAnonMergePending } from '../lib/anonMerge';
import { mobileApi } from '../lib/api';
import { ApiClientError } from '../lib/apiFetch';
import { telemetry } from '../lib/telemetry';
import { useAuthSessionOptional } from './AuthSessionProvider';

export const AnonMergeManager = () => {
  const auth = useAuthSessionOptional();
  const queryClient = useQueryClient();
  const inFlightRef = useRef(false);

  const session = auth?.session ?? null;
  const isLoading = auth?.isLoading ?? true;
  const uid = session?.user?.id ?? null;
  const isAnonymous = session?.isAnonymous === true;

  useEffect(() => {
    if (isLoading || !uid || isAnonymous) return;
    if (inFlightRef.current) return;

    let cancelled = false;

    void (async () => {
      const anonToken = await readAnonMergePending();
      if (!anonToken || cancelled) return;

      inFlightRef.current = true;
      try {
        const result = await mobileApi.mergeAnonymousAccount(anonToken);
        await clearAnonMergePending();
        telemetry.capture('anon_merge_result', {
          merged: result.merged,
          reason: result.reason ?? null,
        });
        if (result.merged && !cancelled) {
          await queryClient.invalidateQueries();
        }
      } catch (err) {
        // Retry only on transient connectivity errors; a 4xx (expired/invalid
        // anon token, or an already-replaced session) won't recover, so give up.
        const retryable =
          err instanceof ApiClientError &&
          (err.kind === 'network' || err.kind === 'timeout');
        if (!retryable) {
          await clearAnonMergePending();
        }
        telemetry.captureError(err, { feature: 'anon_merge' });
      } finally {
        inFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, isAnonymous, isLoading, queryClient]);

  return null;
};
