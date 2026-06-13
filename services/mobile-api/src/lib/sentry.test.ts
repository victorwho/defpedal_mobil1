import { describe, expect, it } from 'vitest';

import {
  captureServerException,
  flushSentry,
  initSentry,
  isSentryEnabled,
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
