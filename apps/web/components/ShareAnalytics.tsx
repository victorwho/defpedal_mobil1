'use client';

/**
 * ShareAnalytics — PostHog instrumentation for /r/[code] — slice 7c.
 *
 * Three events captured with `{ share_code }` property so funnels stitch
 * to the mobile-side `share_claim_success` event (same share_code):
 *
 *   - share_view         — fired on mount when the viewer renders
 *   - install_cta_click  — fired when the Google Play CTA is tapped
 *   - app_open_intent    — fired when the Open-in-app universal link is tapped
 *
 * CTA wiring uses event delegation on `data-share-cta="<event_name>"`
 * attributes so ShareCtas stays a Server Component (no onClick props
 * allowed on DOM elements there). Each click bubbles up, the delegated
 * listener reads the attribute, and fires the matching PostHog event.
 *
 * Graceful degradation: when NEXT_PUBLIC_POSTHOG_API_KEY is absent
 * (preview branches, local dev without an .env), the component is a
 * no-op — the page still renders and the CTAs still work.
 *
 * No `posthog.identify()` call — viewers are anonymous on the web. The
 * mobile-side `telemetry.identify(user)` on the invitee device does the
 * user identification at claim time, and the `share_code` property on
 * both sides lets PostHog join the funnel without a distinct_id bridge.
 *
 * Scraper protection: `person_profiles: 'identified_only'` so OG-preview
 * scrapers (WhatsApp, Twitter, Slack, etc.) that render the page don't
 * create anonymous profiles that bill against our PostHog quota.
 */
import { useEffect } from 'react';

export interface ShareAnalyticsProps {
  shareCode: string;
}

const POSTHOG_HOST_DEFAULT = 'https://eu.i.posthog.com';

export function ShareAnalytics({ shareCode }: ShareAnalyticsProps) {
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
    if (!apiKey) return; // graceful no-op when the key isn't configured

    let cancelled = false;
    let listener: ((e: MouseEvent) => void) | null = null;

    (async () => {
      // Dynamic import keeps posthog-js out of the initial SSR bundle —
      // it's browser-only, and the /r/[code] SSR pass must not pull it in.
      const posthogMod = await import('posthog-js');
      if (cancelled) return;
      const posthog = posthogMod.default;

      // `has_opted_in_capturing` is PostHog's idempotency signal.
      // Calling init() twice (e.g. React Strict Mode double-invoke in
      // dev) just returns the existing instance silently.
      posthog.init(apiKey, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || POSTHOG_HOST_DEFAULT,
        person_profiles: 'identified_only',
        capture_pageview: false, // we fire share_view manually with share_code
        autocapture: false, // we only care about the 3 explicit events
        loaded: () => {
          if (cancelled) return;
          posthog.capture('share_view', { share_code: shareCode });
        },
      });

      // If posthog was already loaded from a prior mount (SPA navigation),
      // the `loaded` callback above won't fire — capture share_view now.
      if (posthog.__loaded) {
        posthog.capture('share_view', { share_code: shareCode });
      }

      // Delegated click listener for CTAs. `data-share-cta="install_cta_click"`
      // on an anchor fires exactly that event name with the share_code.
      // Closest() walks up the DOM so clicks on inner spans/icons still
      // match the outer <a data-share-cta>.
      listener = (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const cta = target.closest('[data-share-cta]');
        if (!cta) return;
        const eventName = cta.getAttribute('data-share-cta');
        if (!eventName) return;
        posthog.capture(eventName, { share_code: shareCode });
      };
      document.addEventListener('click', listener);
    })();

    return () => {
      cancelled = true;
      if (listener) document.removeEventListener('click', listener);
    };
  }, [shareCode]);

  return null;
}
