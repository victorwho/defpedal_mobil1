/**
 * ShareFallbackBootstrap — deferred deep-link fallback driver.
 *
 * Fires ONCE on first mount after Zustand hydration:
 *   - On Android: reads the Play Store install-referrer and extracts
 *     `share=<code>` (only for production Play Store installs).
 *   - On iOS: reads the system clipboard for a `{dp_share, ts}` JSON
 *     payload written by the web viewer.
 *
 * Either fallback calls `setPendingShareClaim(code)` so the existing
 * `ShareClaimProcessor` picks up the claim via its useEffect watcher.
 *
 * Gated by `hasCheckedInstallReferrer` (non-persisted) so a single app
 * lifetime only runs the checks once. Skipped entirely when a code is
 * already queued (deep-link handler fired first) — the processor is
 * already working on that code.
 *
 * Fire-and-forget — no UI rendered. Returns null.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';

import {
  checkClipboardShareFallback,
} from '../lib/clipboardShareFallback';
import { readInstallReferrer } from '../lib/installReferrer';
import { useAppStore } from '../store/appStore';

export const ShareFallbackBootstrap = () => {
  const hasChecked = useAppStore((s) => s.hasCheckedInstallReferrer);
  const pendingShareClaim = useAppStore((s) => s.pendingShareClaim);
  const markChecked = useAppStore((s) => s.markInstallReferrerChecked);
  const setPendingShareClaim = useAppStore((s) => s.setPendingShareClaim);

  useEffect(() => {
    if (hasChecked) return;

    // If a code is already queued (e.g. the deep-link handler fired before
    // this provider mounted), mark us as "checked" so we don't compete
    // with the in-flight claim, and bail. The existing code wins.
    if (pendingShareClaim) {
      markChecked();
      return;
    }

    let cancelled = false;

    const run = async () => {
      let code: string | null = null;

      try {
        if (Platform.OS === 'android') {
          code = await readInstallReferrer();
        } else if (Platform.OS === 'ios') {
          // Skip clipboard if something landed in pendingShareClaim while
          // we were in-flight (e.g. a universal-link arrived).
          const latestPending = useAppStore.getState().pendingShareClaim;
          code = await checkClipboardShareFallback({
            skip: latestPending != null,
          });
        }
      } catch {
        // Defensive — both helpers already swallow their errors, but if
        // something unexpected escapes we still want to mark as checked
        // so we don't retry in an infinite loop.
        code = null;
      }

      if (cancelled) return;

      if (code) {
        // Re-check pendingShareClaim in case the deep-link handler fired
        // during our async read. If something's already queued, the
        // processor is already working on it; don't clobber.
        const latestPending = useAppStore.getState().pendingShareClaim;
        if (!latestPending) {
          setPendingShareClaim(code);
        }
      }

      markChecked();
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [hasChecked, pendingShareClaim, markChecked, setPendingShareClaim]);

  return null;
};
