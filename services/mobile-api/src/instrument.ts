/**
 * Sentry instrumentation bootstrap.
 *
 * MUST be the first import in `server.ts` so `Sentry.init()` runs before
 * Fastify and the Node `http` module are loaded — the canonical @sentry/node
 * setup. Inert when `SENTRY_DSN` is unset (see `lib/sentry.ts`).
 */
import { initSentry } from './lib/sentry';

initSentry();
