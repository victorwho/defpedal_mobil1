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

/** Initializes Sentry if a DSN is configured. Idempotent. */
export const initSentry = (): boolean => {
  if (initialized) return true;
  if (!config.sentry.dsn) return false;

  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.sentry.environment,
    release: config.sentry.release || undefined,
    tracesSampleRate: config.sentry.tracesSampleRate,
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
