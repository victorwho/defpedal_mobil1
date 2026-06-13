/**
 * ShareFallbackBootstrap — deferred deep-link fallback driver.
 *
 * Fires ONCE per install after Zustand hydration:
 *   - On Android: reads the Play Store install-referrer and extracts
 *     `share=<code>` (only for production Play Store installs).
 *   - iOS clipboard fallback is currently disabled (see note below).
 *
 * The fallback calls `setPendingShareClaim(code)` so the existing
 * `ShareClaimProcessor` picks up the claim via its useEffect watcher.
 *
 * Gated by `hasCheckedInstallReferrer` (PERSISTED as of review 2026-06-12)
 * so a single INSTALL only runs the check once — the Play Install Referrer
 * API returns the same referrer for ~90 days, so a non-persisted guard
 * re-fired the claim on every cold start. Skipped entirely when a code is
 * already queued (deep-link handler fired first).
 *
 * Fire-and-forget — no UI rendered. Returns null.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';

// NOTE: the iOS clipboard fallback (checkClipboardShareFallback) is
// intentionally NOT wired here. Reading the system clipboard on every iOS
// cold start triggers iOS 14+'s "pasted from …" banner, and the web viewer
// (apps/web) never actually writes the {dp_share, ts} payload the reader
// expects — so the read was a pure privacy-cost no-op (review 2026-06-12 P1).
// The reader + its parser tests are kept in lib/clipboardShareFallback.ts so
// re-enabling is a one-line change once apps/web writes the payload on a user
// gesture.
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
        }
        // iOS clipboard fallback disabled — see the import-level note.
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
