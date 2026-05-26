/**
 * mobileApiFetch — auth-aware adapter on top of `apiFetch`.
 *
 * P3b Day-2 deliverable (error-reduction plan, see sentryfix.md).
 *
 * Adds the project-specific concerns that `apiFetch` deliberately stays
 * agnostic of:
 *   1. Base URL resolution from `EXPO_PUBLIC_MOBILE_API_URL` (with fail-fast
 *      if unset, matching the existing `requestJson` behaviour).
 *   2. Default headers: `Content-Type: application/json`, ngrok skip-warning
 *      when tunnelled, and `Authorization: Bearer <supabase-jwt>` from
 *      `getAccessToken()`.
 *   3. 401 → refresh-and-retry-once. The refresh runs OUTSIDE the apiFetch
 *      retry loop because 4xx is not retryable in apiFetch (intentional —
 *      retrying a bare 401 with the same stale token is pointless). A 401
 *      from apiFetch surfaces here as `ApiClientError(kind:'http', status:401)`,
 *      we mint a fresh token, and re-issue the whole call (which may itself
 *      retry 5xx).
 *
 * Used today by the 4 endpoints that already carry Zod boundary validation
 * (P3c): `/v1/feed`, `/v1/tiers`, `/v1/v2/feed`, `/v1/leaderboard`. Day 3
 * migrates the rest and retires `requestJson` from api.ts.
 */

import { apiFetch, ApiClientError, type ApiFetchOptions } from './apiFetch';
import { mobileEnv } from './env';
import { getAccessToken, refreshAccessToken } from './supabase';

const ensureBaseUrl = (): string => {
  if (!mobileEnv.mobileApiUrl) {
    throw new Error(
      'EXPO_PUBLIC_MOBILE_API_URL is not configured. Set it before using mobile API calls.',
    );
  }
  return mobileEnv.mobileApiUrl.replace(/\/$/, '');
};

const normalizeHeaders = (headers?: HeadersInit): Record<string, string> => {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return Object.entries(headers).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value === 'string') acc[key] = value;
    return acc;
  }, {});
};

const buildHeaders = (
  accessToken: string | null,
  extra?: HeadersInit,
): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (mobileEnv.usesNgrokTunnel) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  // Caller-supplied headers win on collision — same precedence as the
  // legacy requestJson path so behaviour parity holds during migration.
  Object.assign(headers, normalizeHeaders(extra));
  return headers;
};

export interface MobileApiFetchOptions extends Omit<ApiFetchOptions, 'headers'> {
  headers?: HeadersInit;
}

/**
 * Issue an authenticated request to the Defensive Pedal mobile API.
 *
 * `path` is appended to the configured base URL (no leading slash required,
 * but conventional). Returns the JSON-parsed body typed as `TResponse`.
 *
 * Errors are `ApiClientError` from `apiFetch`. Discriminate via `err.kind`:
 *   - `'http'` with `status` → server returned a non-2xx; `err.body` carries
 *     the (truncated) response body.
 *   - `'network'` → fetch rejected before getting a response (retries already
 *     exhausted upstream).
 *   - `'timeout'` → AbortController timeout (no retry on timeout, see
 *     apiFetch).
 */
export const mobileApiFetch = async <TResponse = unknown>(
  path: string,
  options: MobileApiFetchOptions = {},
): Promise<TResponse> => {
  const url = `${ensureBaseUrl()}${path}`;
  const { headers: callerHeaders, ...rest } = options;

  const initialToken = await getAccessToken();

  try {
    return await apiFetch<TResponse>(url, {
      ...rest,
      headers: buildHeaders(initialToken, callerHeaders),
    });
  } catch (error) {
    if (
      error instanceof ApiClientError &&
      error.kind === 'http' &&
      error.status === 401
    ) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return apiFetch<TResponse>(url, {
          ...rest,
          headers: buildHeaders(refreshed, callerHeaders),
        });
      }
    }
    throw error;
  }
};
