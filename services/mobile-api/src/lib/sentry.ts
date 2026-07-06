/**
 * Sentry error tracking for the Fastify API (review 2026-06-12 P2).
 *
 * Before this, server 500s were only visible in Cloud Run logs — no alerting,
 * no grouping, no release health. This wires `@sentry/node` for error capture.
 *
 * Entirely inert when `SENTRY_DSN` is unset: `initSentry()` skips init and
 * `captureServerException()` is a no-op (the SDK no-ops capture calls before
 * init). Safe to ship before the secret is configured on Cloud Run.
 *
 * Errors-only by default (`tracesSampleRate: 0`). Sentry's default Node
 * integrations also auto-capture uncaught exceptions and unhandled rejections
 * once initialized — covering the fire-and-forget background paths (nudge P0,
 * push sends) that never flow through a request lifecycle.
 *
 * `instrument.ts` calls `initSentry()` as the very first thing `server.ts`
 * imports, so Sentry initializes before Fastify/http are loaded (the canonical
 * setup that avoids the "initialized after instrumented modules" warning).
 */
import * as Sentry from '@sentry/node';

import { config } from '../config';

let initialized = false;

/** Strips the querystring from a URL-ish string. */
const stripQuery = (url: string): string => url.split('?')[0] ?? url;

/**
 * PII scrub (audit 2026-07-05 SEC-5): several GET endpoints carry rider GPS
 * in the querystring (`/hazards/nearby?lat=..&lon=..`, `/risk-map`,
 * `/neighborhood-safety-score`). A 5xx on one of those must not ship raw
 * coordinates into Sentry, so every outgoing event has querystrings removed
 * from its request URL and any `extra.url` context. Exported for unit tests.
 */
export const scrubEventPii = <
  T extends {
    request?: { url?: string; query_string?: unknown };
    extra?: Record<string, unknown>;
  },
>(
  event: T,
): T => {
  if (event.request?.url) {
    event.request.url = stripQuery(event.request.url);
  }
  if (event.request && 'query_string' in event.request) {
    delete event.request.query_string;
  }
  if (event.extra && typeof event.extra.url === 'string') {
    event.extra.url = stripQuery(event.extra.url);
  }
  return event;
};

/** Initializes Sentry if a DSN is configured. Idempotent. */
export const initSentry = (): boolean => {
  if (initialized) return true;
  if (!config.sentry.dsn) return false;

  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.sentry.environment,
    release: config.sentry.release || undefined,
    tracesSampleRate: config.sentry.tracesSampleRate,
    // Explicit, not just the SDK default — never attach ip/user headers.
    sendDefaultPii: false,
    beforeSend: (event) => scrubEventPii(event),
  });

  initialized = true;
  return true;
};

export const isSentryEnabled = (): boolean => initialized;

/**
 * Captures an exception with optional structured context. No-op when Sentry
 * isn't initialized, so call sites stay clean regardless of DSN configuration.
 */
export const captureServerException = (
  error: unknown,
  context?: Record<string, unknown>,
): void => {
  if (!initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
};

/** Flushes buffered events before shutdown. Resolves immediately when disabled. */
export const flushSentry = async (timeoutMs = 2000): Promise<void> => {
  if (!initialized) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Best-effort on shutdown — never block the exit path.
  }
};
