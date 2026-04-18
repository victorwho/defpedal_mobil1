/**
 * Share deep-link parser.
 *
 * Pure module — extracted from the inline helper in `app/_layout.tsx` so
 * the URL-matching logic can be unit-tested and reused by the Play Store
 * install-referrer + iOS clipboard fallbacks (slice 2.5).
 *
 * Handles two URL shapes, both of which encode a share code:
 *   - Universal link:   `https://routes.defensivepedal.com/r/<code>`
 *   - App-scheme link:  `defensivepedal*://route-share/<code>`
 *     (the scheme varies by build variant: `defensivepedal-dev`,
 *     `defensivepedal-preview`, `defensivepedal`; we only match on the
 *     host segment `route-share`, not the scheme).
 *
 * Returns `null` for anything else, including:
 *   - Wrong host (e.g. `defensivepedal.com/r/<code>`)
 *   - Wrong path prefix (e.g. `.../x/<code>`)
 *   - Non-base62 code (validated via core's `isValidShareCode`)
 *   - Malformed URLs that throw during `Linking.parse`
 */

import * as Linking from 'expo-linking';
import { isValidShareCode } from '@defensivepedal/core';

export const ROUTE_SHARE_WEB_HOST = 'routes.defensivepedal.com';
export const ROUTE_SHARE_APP_HOST = 'route-share';

/**
 * Extract the 8-char base62 share code from a URL if it matches one of the
 * recognised route-share shapes AND the code itself is syntactically valid.
 * Returns `null` otherwise.
 */
export const extractRouteShareCode = (url: string): string | null => {
  let parsed: ReturnType<typeof Linking.parse>;
  try {
    parsed = Linking.parse(url);
  } catch {
    return null;
  }

  const hostname = parsed.hostname ?? '';
  const path = parsed.path ?? '';

  let candidate: string | null = null;

  if (hostname === ROUTE_SHARE_WEB_HOST) {
    // `https://routes.defensivepedal.com/r/<code>` (query params ignored)
    const match = path.match(/^\/?r\/([^/?#]+)\/?$/);
    candidate = match ? match[1] : null;
  } else if (hostname === ROUTE_SHARE_APP_HOST) {
    // `defensivepedal*://route-share/<code>` (path is just "<code>")
    const match = path.match(/^\/?([^/?#]+)\/?$/);
    candidate = match ? match[1] : null;
  }

  if (!candidate) return null;

  // Gate on the canonical 8-char base62 shape so the claim pipeline never
  // sees a garbage code. `isValidShareCode` is the single source of truth
  // (same regex core uses for share-code generation).
  return isValidShareCode(candidate) ? candidate : null;
};
