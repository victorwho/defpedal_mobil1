import type { CSSProperties } from 'react';
import { headers } from 'next/headers';
import { SUPPORTED_APP_COUNTRIES, appStoreUrl } from '@defensivepedal/core';

interface ShareCtasProps {
  code: string;
}

/**
 * The visitor's App Store storefront.
 *
 * ⚠️ A country segment is not optional here. The app is deliberately not sold in
 * the United States, which is exactly where a country-less Apple URL resolves —
 * so `https://apps.apple.com/app/id<id>` 404s for EVERY visitor, not just
 * American ones (verified against Apple's iTunes lookup and by following the
 * redirects, 2026-09-26). Vercel gives us the visitor's country for free, so use
 * it and fall back to a supported English-language storefront.
 */
const resolveStorefront = (country: string | null): string => {
  const code = country?.trim().toUpperCase();
  if (code && SUPPORTED_APP_COUNTRIES.has(code)) return code.toLowerCase();
  return 'gb';
};

/**
 * Whether the request came from a phone or tablet that could actually open the
 * app. Deliberately coarse: the only decision it drives is whether the primary
 * CTA is a universal link (which the OS intercepts) or a plain web link.
 * Guessing wrong on an exotic UA costs a redundant navigation, not a broken page.
 */
const isMobileUserAgent = (ua: string | null): boolean =>
  /android|iphone|ipad|ipod|windows phone|mobile safari/i.test(ua ?? '');

const COLORS = {
  bgSurface: 'rgba(31, 41, 55, 0.92)',
  border: '#374151',
  accent: '#FACC15',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B8C1',
  bgDeep: '#111827',
} as const;

// Live Play Store listing for the production package.
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.defensivepedal.mobile';

const styles: Record<string, CSSProperties> = {
  nav: {
    background: COLORS.bgSurface,
    borderTop: `1px solid ${COLORS.border}`,
    padding: '16px 24px 24px',
  },
  primary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 48,
    background: COLORS.accent,
    color: COLORS.bgDeep,
    border: 'none',
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 16,
    textDecoration: 'none',
    marginBottom: 12,
    letterSpacing: '-0.01em',
  },
  downloadRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  downloadBtn: {
    flex: '1 1 160px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    padding: '10px 14px',
    background: 'transparent',
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 14,
    textDecoration: 'none',
  },
  helpText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 12,
    marginBottom: 0,
    textAlign: 'center',
    lineHeight: 1.4,
  },
};

export async function ShareCtas({ code }: ShareCtasProps) {
  const requestHeaders = await headers();
  const isMobile = isMobileUserAgent(requestHeaders.get('user-agent'));
  const storefront = resolveStorefront(requestHeaders.get('x-vercel-ip-country'));

  /*
   * On a phone this is a self-referencing universal link: the OS intercepts it
   * and opens the app if installed.
   *
   * On a DESKTOP there is no app to intercept it, so the old behaviour was to
   * reload the very page the visitor was already looking at — a button that
   * visibly did nothing. Desktop now goes to the site instead.
   */
  const appUrl = isMobile
    ? `https://routes.defensivepedal.com/r/${encodeURIComponent(code)}`
    : 'https://routes.defensivepedal.com/';
  // Play Store CTA carries two distinct attribution params:
  //   - utm_source/medium/campaign: consumed by PostHog/web analytics (slice 7)
  //   - referrer: the Play Store's native com.android.installreferrer pickup value,
  //     read by the Android app at first launch to restore the share context post-install.
  //     Must be `share=<code>` (URL-encoded as `share%3D<code>`) — the mobile parser in
  //     installReferrer.ts feeds the install-referrer string directly into URLSearchParams
  //     and calls `params.get('share')`. Using `share_<code>` would produce a keyless entry
  //     and the code would never be extracted. Don't change without updating both sides.
  const encodedCode = encodeURIComponent(code);
  const playUrl =
    `${PLAY_STORE_URL}` +
    `&utm_source=share&utm_medium=web&utm_campaign=r_${encodedCode}` +
    `&referrer=${encodeURIComponent(`share=${code}`)}`;

  return (
    <nav style={styles.nav} aria-label="Route sharing actions">
      {/*
        data-share-cta attributes (slice 7c) hook into ShareAnalytics's
        delegated click listener. Keeping the logic declarative avoids
        turning this Server Component into a Client Component, which
        would break server-rendered HTML and add a hydration boundary
        we don't need (Next.js 15 forbids event-handler props on
        Server-Component DOM elements anyway — see slice-1 Vercel
        repair notes for the onClick incident).
      */}
      <a href={appUrl} style={styles.primary} data-share-cta="app_open_intent">
        Open in Defensive Pedal
      </a>
      <div style={styles.downloadRow}>
        <a
          href={playUrl}
          style={styles.downloadBtn}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download Defensive Pedal on Google Play"
          data-share-cta="install_cta_click"
        >
          Get it on Google Play
        </a>
        {/* Live since iOS 1.17 (2026-08-29); the placeholder that used to sit
            here outlived the release by a month. The storefront segment is
            load-bearing — see `resolveStorefront`. */}
        <a
          href={appStoreUrl(storefront)}
          style={styles.downloadBtn}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download Defensive Pedal on the App Store"
          data-share-cta="install_cta_click_ios"
        >
          Get it on iOS
        </a>
      </div>
      <p style={styles.helpText}>
        Already have the app? The button above opens the route directly. No app yet? Install from
        Google Play or the App Store — on Android the route loads on first launch.
      </p>
    </nav>
  );
}
