'use client';

/**
 * ShareViewBeacon — POSTs /v1/route-shares/:code/view on mount — slice 8b.
 *
 * Fires a single beacon request to the mobile API's public view endpoint,
 * which:
 *   - UA-filters bots (scrapers bounce silently via 200 bumped:false)
 *   - Per-IP throttles (repeat hits from the same viewer also bounce)
 *   - Atomically increments view_count and dispatches a first-view push
 *     to the sharer on the 0 → 1 transition
 *
 * Sent once per mount with a sessionStorage de-dupe so React Strict Mode
 * double-renders or client-side re-mounts don't double-bump the counter.
 * Fire-and-forget: the beacon's response shape {bumped, firstView} isn't
 * surfaced to the viewer — the UX doesn't change either way.
 *
 * Graceful no-op: when NEXT_PUBLIC_MOBILE_API_URL is absent, the component
 * renders nothing and never fires. The page still works — PostHog and the
 * server-side view_count increment in get_public_route_share both still
 * happen independently.
 */
import { useEffect } from 'react';

export interface ShareViewBeaconProps {
  shareCode: string;
}

const SESSION_KEY_PREFIX = 'dp_share_view_beacon:';

export function ShareViewBeacon({ shareCode }: ShareViewBeaconProps) {
  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_MOBILE_API_URL;
    if (!apiBase) return;

    // Per-session de-dupe. A viewer who refreshes the page re-fires; one
    // who just tabs away and back does not.
    const sessionKey = `${SESSION_KEY_PREFIX}${shareCode}`;
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        if (window.sessionStorage.getItem(sessionKey)) return;
        window.sessionStorage.setItem(sessionKey, '1');
      }
    } catch {
      // sessionStorage unavailable (private mode, sandboxed iframe) —
      // proceed with the beacon; worst case we double-fire which the
      // server-side per-IP throttle catches anyway.
    }

    const url = `${apiBase.replace(/\/$/, '')}/v1/route-shares/${encodeURIComponent(shareCode)}/view`;
    const controller = new AbortController();

    // fire-and-forget; explicit Content-Type so Fastify's JSON parser
    // accepts the empty body (the wildcard parser on app.ts also covers
    // missing headers, but this is belt-and-suspenders).
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: controller.signal,
    }).catch(() => {
      /* swallow network errors — the beacon is best-effort */
    });

    return () => controller.abort();
  }, [shareCode]);

  return null;
}
