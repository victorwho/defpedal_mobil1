/**
 * apiFetch — typed fetch wrapper for the mobile API.
 *
 * Day-1 deliverable from P3b (error-reduction plan, see sentryfix.md).
 *
 * Wraps `fetch` with three concerns the existing `requestJson` does NOT
 * uniformly handle:
 *   1. Per-request timeout via AbortController (no XHR fallback in this
 *      iteration — added during the Day-2 migration if needed).
 *   2. Up-to-N retries with exponential backoff + jitter on retryable
 *      failures only: network errors, HTTP 5xx, 408, 429.
 *      Timeouts and 4xx (except 408/429) do NOT retry — see the rationale
 *      on `isRetryableStatus`.
 *   3. A typed error envelope (`ApiClientError`) with a discriminator
 *      (`kind`) so Sentry breadcrumbs and offline-sync classification can
 *      collapse the two "Network request failed" issues that exist today
 *      (MOBILE-5 / MOBILE-6 in Sentry).
 *
 * Day-1 is intentionally additive — `requestJson` in api.ts is unchanged.
 * Day-2 migrates the 4 endpoints that already have Zod response validation;
 * Day-3 migrates the rest and removes `requestJson`.
 */

export type ApiErrorKind = 'timeout' | 'network' | 'http';

export interface ApiClientErrorInit {
  kind: ApiErrorKind;
  message: string;
  /** HTTP status code; present iff `kind === 'http'`. */
  status?: number;
  /** Truncated response body; present iff `kind === 'http'`. */
  body?: string;
  /** Original thrown value, kept for Sentry context. */
  cause?: unknown;
}

export class ApiClientError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly body?: string;
  readonly originalError?: unknown;

  constructor(init: ApiClientErrorInit) {
    super(init.message);
    this.name = 'ApiClientError';
    this.kind = init.kind;
    this.status = init.status;
    this.body = init.body;
    this.originalError = init.cause;
  }
}

export const isApiClientError = (error: unknown): error is ApiClientError =>
  error instanceof ApiClientError;

export interface ApiFetchOptions extends RequestInit {
  /** Timeout for receiving response HEADERS, in milliseconds. Default 8000. */
  timeoutMs?: number;
  /**
   * Timeout for reading the response BODY once headers have arrived, in
   * milliseconds. Default 30000 — deliberately generous, because this exists to
   * bound a hang rather than to police transfer time (see `performFetch`).
   */
  bodyTimeoutMs?: number;
  /** Retry attempts after the initial request. Default 2 (so 3 total tries). */
  maxRetries?: number;
  /** Base backoff in ms; doubles per attempt with ±20% jitter. Default 250. */
  backoffBaseMs?: number;
  /** Random source for jitter. Tests inject a deterministic value. */
  random?: () => number;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_BODY_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BACKOFF_BASE_MS = 250;
const RESPONSE_BODY_TRUNCATE = 500;

/**
 * Retry policy for HTTP responses.
 *
 * - 5xx: server-side transient failure → retry.
 * - 408 Request Timeout: server signalling "try again" → retry.
 * - 429 Too Many Requests: rate limited; the server may have headers we
 *   don't honour yet, but the backoff is at least a token gesture → retry.
 * - 4xx (everything else): validation/auth/not-found/conflict — retrying
 *   will never succeed; fail fast so the UI surfaces the real error.
 */
const isRetryableStatus = (status: number): boolean =>
  status >= 500 || status === 408 || status === 429;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const computeBackoff = (
  attempt: number,
  baseMs: number,
  random: () => number,
): number => {
  const base = baseMs * Math.pow(2, attempt - 1);
  const jitter = (random() * 0.4 - 0.2) * base;
  return Math.max(0, Math.round(base + jitter));
};

/** One completed attempt: the response plus its body, already read as text. */
interface FetchAttempt {
  response: Response;
  bodyText: string;
}

/**
 * Single fetch attempt. Reads the body as text INSIDE the abort window and
 * returns it alongside the response; only throws on timeout / network failure
 * (wrapped in ApiClientError), or re-throws the caller's own AbortError so
 * consumers can detect their own abort separately from our internal timeout.
 *
 * ⚠️ The body read must happen here, not in the caller. Until 2026-09-25 this
 * function returned the bare `Response` and cleared its timeout in `finally`,
 * which fires as soon as `fetch` resolves — i.e. when the HEADERS arrive. The
 * caller then did `await response.json()` / `.text()` with no timer armed and
 * the AbortController already disarmed, so a server that sent headers and then
 * stalled the body hung FOREVER: no timeout, no retry, across every one of the
 * ~80 `mobileApiFetch` call sites. See
 * docs/plans/external-review-triage-2026-09-25.md P1-2.
 *
 * The body gets its OWN generous budget rather than sharing the header timeout.
 * The defect is that it was unbounded, and the fix is to bound it — not to
 * impose a tight SLA on transfer time. `GET /v1/trips/history` still ships full
 * GPS trails for every ride (TODO.md PERF-3 / SCALE-14), so a multi-megabyte
 * body on a slow link is normal and must not start failing at the 8s header
 * budget. Tightening that is a separate product decision.
 *
 * Reading once as text and parsing afterwards is also the pattern
 * `packages/core/src/osrmResponse.ts` already uses, for the related reason that
 * a body can only be consumed once.
 */
const performFetch = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
  bodyTimeoutMs: number,
): Promise<FetchAttempt> => {
  const controller = new AbortController();
  const callerSignal = init.signal ?? null;

  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', onCallerAbort);
    }
  }

  let timedOut = false;
  let timeoutHandle = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (timedOut) {
        throw new ApiClientError({
          kind: 'timeout',
          message: `Request timed out after ${timeoutMs}ms`,
          cause: error,
        });
      }
      if (callerSignal?.aborted) {
        // Caller-initiated abort — propagate so the caller's signal contract
        // (AbortError) is preserved. Not wrapped as ApiClientError.
        throw error;
      }
      throw new ApiClientError({
        kind: 'network',
        message: error instanceof Error ? error.message : 'Network request failed',
        cause: error,
      });
    }

    // Re-arm before touching the body. This is the line whose absence was the bug.
    clearTimeout(timeoutHandle);
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, bodyTimeoutMs);

    try {
      const bodyText = await response.text();
      return { response, bodyText };
    } catch (error) {
      if (timedOut) {
        throw new ApiClientError({
          kind: 'timeout',
          message: `Response body stalled after ${bodyTimeoutMs}ms`,
          status: response.status,
          cause: error,
        });
      }
      if (callerSignal?.aborted) {
        throw error;
      }
      // Deliberately 'http', not 'network': a body failure is NOT retried
      // today (it surfaced as "Response body was not valid JSON"), and making
      // it retryable would re-send non-idempotent POSTs whose request already
      // reached the server — `hazard` submissions still have no idempotency
      // key (triage P1-12). Preserving the existing retry semantics keeps this
      // change to exactly one behavioural difference: a stalled body now aborts.
      throw new ApiClientError({
        kind: 'http',
        message: 'Response body could not be read',
        status: response.status,
        body: '',
        cause: error,
      });
    }
  } finally {
    clearTimeout(timeoutHandle);
    if (callerSignal) {
      callerSignal.removeEventListener('abort', onCallerAbort);
    }
  }
};

/**
 * Issue an API request, returning the JSON-parsed body typed as `TResponse`.
 *
 * Throws `ApiClientError` for any failure path. Use `isApiClientError(err)`
 * + `err.kind` to discriminate in the catch block.
 *
 * Does NOT inject auth headers or base URLs — callers are responsible for
 * the full URL and any Authorization. This wrapper is intentionally generic
 * so it can wrap Supabase RPCs, Mapbox, and our own Cloud Run API alike.
 */
export const apiFetch = async <TResponse = unknown>(
  url: string,
  options: ApiFetchOptions = {},
): Promise<TResponse> => {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    bodyTimeoutMs = DEFAULT_BODY_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    backoffBaseMs = DEFAULT_BACKOFF_BASE_MS,
    random = Math.random,
    ...init
  } = options;

  const totalAttempts = maxRetries + 1;
  let lastError: ApiClientError | null = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    let attemptResult: FetchAttempt;
    try {
      attemptResult = await performFetch(url, init, timeoutMs, bodyTimeoutMs);
    } catch (error) {
      if (error instanceof ApiClientError) {
        // Network errors retry; timeouts do NOT (see file header).
        if (error.kind === 'network' && attempt < totalAttempts) {
          lastError = error;
          await sleep(computeBackoff(attempt, backoffBaseMs, random));
          continue;
        }
        throw error;
      }
      // AbortError from the caller's own signal — propagate as-is.
      throw error;
    }

    const { response, bodyText } = attemptResult;

    if (response.ok) {
      try {
        return JSON.parse(bodyText) as TResponse;
      } catch (error) {
        throw new ApiClientError({
          kind: 'http',
          message: 'Response body was not valid JSON',
          status: response.status,
          // Now that the body is already in hand, include it — an HTML error
          // page or a proxy notice is the usual cause and was previously
          // discarded, leaving nothing to diagnose from.
          body: bodyText.slice(0, RESPONSE_BODY_TRUNCATE),
          cause: error,
        });
      }
    }

    const httpError = new ApiClientError({
      kind: 'http',
      message: `HTTP ${response.status}`,
      status: response.status,
      body: bodyText.slice(0, RESPONSE_BODY_TRUNCATE),
    });

    if (isRetryableStatus(response.status) && attempt < totalAttempts) {
      lastError = httpError;
      await sleep(computeBackoff(attempt, backoffBaseMs, random));
      continue;
    }
    throw httpError;
  }

  // The loop always returns or throws — this is a defensive fallback.
  throw (
    lastError ??
    new ApiClientError({
      kind: 'network',
      message: 'apiFetch exhausted retries without a recorded error',
    })
  );
};
