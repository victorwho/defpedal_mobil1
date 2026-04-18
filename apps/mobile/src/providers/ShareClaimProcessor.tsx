/**
 * ShareClaimProcessor — drains `pendingShareClaim` into the claim API.
 *
 * Mounted inside AppProviders ABOVE auth-session consumers (session is
 * available from the auth context; this provider reads it via the hook).
 * When a share code lands in Zustand (from the deep-link handler, or in
 * future from the install-referrer + clipboard fallbacks):
 *
 *   1. Wait for auth-session to resolve (anonymous or real).
 *   2. POST /v1/route-shares/:code/claim.
 *   3. Success → clear state, Toast "Route claimed", done. (Route is now
 *      in the invitee's saved_routes; they can open it from Saved.)
 *   4. 404 / 410 → clear state, Toast "This shared route is no longer
 *      available" — no retry.
 *   5. 422 self-referral → clear state, Toast "You can't claim your own
 *      shared route." — defensive; shouldn't happen in real use.
 *   6. Network error / 5xx → increment attempts, exponential backoff
 *      (1s, 2s, 4s). After 3 attempts: clear + "Couldn't load shared
 *      route. Please try again later."
 *
 * Navigation intentionally skipped in slice 2 — the RPC has already
 * seeded `saved_routes` + `user_follows` so the invitee gets both
 * benefits without us mapping the claim's routePayload into the richer
 * `RoutePreviewResponse` shape. Slice 3 / 5 can add the navigation step.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { mobileApi } from '../lib/api';
import { mapShareClaimToPreview } from '../lib/shareClaimToPreview';
import { Toast } from '../design-system/molecules/Toast';
import { space } from '../design-system/tokens/spacing';
import { zIndex } from '../design-system/tokens/zIndex';
import { useAppStore } from '../store/appStore';
import { useAuthSessionOptional } from './AuthSessionProvider';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CLAIM_ATTEMPTS = 3;

// Exponential backoff: 1s, 2s, 4s. Indexed by the *current* attempt count
// AFTER incrementing — i.e. backoffMs[1] is the delay before the second try.
const RETRY_BACKOFF_MS: Record<number, number> = {
  1: 1_000,
  2: 2_000,
};

const TOAST_MESSAGES = {
  ok: 'Shared route added to your saved routes.',
  gone: 'This shared route is no longer available.',
  selfReferral: 'You can\u2019t claim your own shared route.',
  exhausted: 'Couldn\u2019t load shared route. Please try again later.',
} as const;

type ToastState = {
  message: string;
  variant: 'info' | 'success' | 'warning' | 'error';
} | null;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ShareClaimProcessor = () => {
  const auth = useAuthSessionOptional();
  const userId = auth?.user?.id ?? null;
  const isAuthLoading = auth?.isLoading ?? true;

  const pendingShareClaim = useAppStore((s) => s.pendingShareClaim);
  const pendingShareClaimAttempts = useAppStore(
    (s) => s.pendingShareClaimAttempts,
  );
  const clearPendingShareClaim = useAppStore((s) => s.clearPendingShareClaim);
  const incrementClaimAttempts = useAppStore((s) => s.incrementClaimAttempts);
  const setRouteRequest = useAppStore((s) => s.setRouteRequest);
  const setRoutePreview = useAppStore((s) => s.setRoutePreview);
  const appState = useAppStore((s) => s.appState);

  const [toast, setToast] = useState<ToastState>(null);
  // Track "is this particular (code + attempts) run already flying" so we
  // don't double-fire the claim when multiple state updates land.
  const isProcessingRef = useRef(false);
  // Retry timer handle so unmount can cancel it.
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const consumeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    // Don't process until we have a code AND auth has resolved (even to
    // null — anonymous Supabase sessions are fine).
    if (!pendingShareClaim) return;
    if (isAuthLoading) return;
    if (!userId) return; // auth resolved but no user — wait for session
    if (isProcessingRef.current) return;

    if (pendingShareClaimAttempts >= MAX_CLAIM_ATTEMPTS) {
      // Exhausted: surface the generic error toast and hard-clear so the
      // processor is idle again.
      clearPendingShareClaim();
      setToast({ message: TOAST_MESSAGES.exhausted, variant: 'error' });
      return;
    }

    isProcessingRef.current = true;
    const code = pendingShareClaim;
    const currentAttempt = pendingShareClaimAttempts;

    // Apply exponential backoff before the 2nd+ attempt. First attempt
    // (attempts === 0) fires immediately.
    const delayMs = RETRY_BACKOFF_MS[currentAttempt] ?? 0;

    const runClaim = async () => {
      try {
        const result = await mobileApi.claimRouteShare(code);

        switch (result.status) {
          case 'ok': {
            clearPendingShareClaim();
            // Seed store with the claimed route + navigate to route-preview
            // so the user lands directly on the map (PRD E2E AC). Suppress
            // navigation if the user is already NAVIGATING a different ride —
            // don't hijack an in-progress trip.
            if (appState !== 'NAVIGATING') {
              const mapped = mapShareClaimToPreview(result.data);
              setRouteRequest(mapped.request);
              setRoutePreview(mapped.response, {
                preferredRouteId: mapped.selectedRouteId,
              });
              router.push('/route-preview');
            }
            setToast({ message: TOAST_MESSAGES.ok, variant: 'success' });
            break;
          }

          case 'not_found':
          case 'gone':
            clearPendingShareClaim();
            setToast({ message: TOAST_MESSAGES.gone, variant: 'warning' });
            break;

          case 'invalid':
            // Only reason so far: self_referral
            clearPendingShareClaim();
            setToast({
              message: TOAST_MESSAGES.selfReferral,
              variant: 'warning',
            });
            break;

          case 'auth_required':
            // Auth refresh didn't succeed — hard-clear so we don't
            // retry-loop. User can tap the share link again after
            // re-signing-in.
            clearPendingShareClaim();
            break;

          case 'network_error':
            // Retry with backoff. Increment then fall through to re-run
            // via the attempts dep.
            incrementClaimAttempts();
            break;
        }
      } catch {
        // Defensive — claimRouteShare maps everything to ClaimRouteShareResult
        // already, but a throw here means an unexpected bug. Treat as
        // network error so the retry kicks in.
        incrementClaimAttempts();
      } finally {
        isProcessingRef.current = false;
      }
    };

    if (delayMs > 0) {
      retryTimerRef.current = setTimeout(runClaim, delayMs);
    } else {
      void runClaim();
    }

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [
    pendingShareClaim,
    pendingShareClaimAttempts,
    userId,
    isAuthLoading,
    appState,
    clearPendingShareClaim,
    incrementClaimAttempts,
    setRouteRequest,
    setRoutePreview,
  ]);

  if (!toast) return null;

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 100,
        left: 0,
        right: 0,
        paddingHorizontal: space[4],
        zIndex: zIndex.toast,
      }}
      pointerEvents="box-none"
    >
      <Toast
        message={toast.message}
        variant={toast.variant}
        onDismiss={consumeToast}
      />
    </View>
  );
};
