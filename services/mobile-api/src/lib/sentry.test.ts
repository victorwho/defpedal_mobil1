import { describe, expect, it } from 'vitest';

import {
  captureServerException,
  flushSentry,
  initSentry,
  isSentryEnabled,
  scrubEventPii,
} from './sentry';

// In the test environment SENTRY_DSN is unset, so Sentry stays disabled. The
// critical contract for the shipped default is that every entry point is a
// safe no-op — call sites must never throw or block regardless of DSN config.
describe('sentry helper (disabled — no DSN)', () => {
  it('initSentry returns false without a DSN', () => {
    expect(initSentry()).toBe(false);
    expect(isSentryEnabled()).toBe(false);
  });

  it('captureServerException is a no-op and never throws', () => {
    expect(() => captureServerException(new Error('boom'))).not.toThrow();
    expect(() =>
      captureServerException(new Error('boom'), { route: 'test', statusCode: 500 }),
    ).not.toThrow();
    expect(() => captureServerException('a non-error value')).not.toThrow();
  });

  it('flushSentry resolves immediately when disabled', async () => {
    await expect(flushSentry()).resolves.toBeUndefined();
  });
});

// Audit 2026-07-05 SEC-5: GPS querystrings must never reach Sentry.
describe('scrubEventPii', () => {
  it('strips the querystring from request.url and drops query_string', () => {
    const event = scrubEventPii({
      request: {
        url: 'https://api.test/v1/hazards/nearby?lat=44.4268&lon=26.1025&radiusMeters=500',
        query_string: 'lat=44.4268&lon=26.1025',
      },
    });
    expect(event.request?.url).toBe('https://api.test/v1/hazards/nearby');
    expect(event.request && 'query_string' in event.request).toBe(false);
  });

  it('strips the querystring from extra.url context', () => {
    const event = scrubEventPii({
      extra: { url: '/v1/risk-map?lat=44.4&lon=26.1', statusCode: 500 },
    });
    expect(event.extra?.url).toBe('/v1/risk-map');
    expect(event.extra?.statusCode).toBe(500);
  });

  it('leaves events without URLs untouched', () => {
    const event = scrubEventPii({ extra: { code: 'INTERNAL_ERROR' } });
    expect(event.extra?.code).toBe('INTERNAL_ERROR');
  });
});
