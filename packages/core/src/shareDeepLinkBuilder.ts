/**
 * Share deep-link builder.
 *
 * Builds the canonical universal-link URL for a given share code. The app
 * scheme and the web URL are identical on purpose — Android App Links and
 * iOS Universal Links both route `https://routes.defensivepedal.com/r/<code>`
 * to the installed app, falling back to the web viewer otherwise. No
 * separate `defensivepedal://` link is handed out; the universal link IS
 * the single share surface.
 */

import { isValidShareCode } from './shareCodeGenerator';

export const SHARE_HOST = 'routes.defensivepedal.com';
export const SHARE_PATH_PREFIX = '/r/';

export interface ShareDeepLinks {
  /** Universal link opened by the installed app (or web fallback). */
  appUrl: string;
  /** Web viewer URL — identical to appUrl in this slice. */
  webUrl: string;
}

export interface BuildShareDeepLinksOptions {
  /**
   * Override the host (e.g. for staging environments). Defaults to
   * `routes.defensivepedal.com`. Must NOT include a protocol or path.
   */
  host?: string;
}

export class InvalidShareCodeError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`Invalid share code: "${code}" (expected 8-char base62).`);
    this.name = 'InvalidShareCodeError';
    this.code = code;
  }
}

export function buildShareDeepLinks(
  code: string,
  options: BuildShareDeepLinksOptions = {},
): ShareDeepLinks {
  if (!isValidShareCode(code)) {
    throw new InvalidShareCodeError(code);
  }

  const host = options.host ?? SHARE_HOST;
  const url = `https://${host}${SHARE_PATH_PREFIX}${code}`;

  return {
    appUrl: url,
    webUrl: url,
  };
}
