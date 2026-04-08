import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock expo-constants before importing env
vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

describe('mobileEnv', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('reads environment variables with fallbacks', async () => {
    const { mobileEnv } = await import('./env');

    // Should have default values when env vars are not set
    expect(mobileEnv.appEnv).toBeDefined();
    expect(mobileEnv.appVariant).toBe('development');
    expect(typeof mobileEnv.sentryTracesSampleRate).toBe('number');
    expect(mobileEnv.posthogHost).toBe('https://eu.i.posthog.com');
  });

  it('detects ngrok tunnel URLs', async () => {
    const { mobileEnv } = await import('./env');

    // Default URL is not an ngrok tunnel
    expect(mobileEnv.usesNgrokTunnel).toBe(false);
  });

  it('parseBoolean returns false for empty/undefined values', async () => {
    const { mobileEnv } = await import('./env');

    // devAuthBypassEnabled should be false by default
    expect(mobileEnv.devAuthBypassEnabled).toBe(false);
  });

  it('sentryTracesSampleRate is a number', async () => {
    const { mobileEnv } = await import('./env');

    expect(mobileEnv.sentryTracesSampleRate).toBe(0.2);
  });
});
