/**
 * Persist-migration upgrade-path tests. The hard requirement: existing
 * users' EXPLICIT telemetry choices survive every upgrade — anyone who
 * turned Sentry OFF stays OFF, anyone who opted PostHog ON stays ON, and
 * anyone who explicitly turned PostHog OFF stays OFF.
 *
 * History:
 *   - 2026-07-16: consent screen removed from onboarding; these tests
 *     locked preservation across the v0→v5 chain (PostHog default OFF).
 *   - 2026-07-19 (v6): PostHog default flipped to ON by product-owner
 *     decision, overriding the opt-in design. The v5→v6 step flips ONLY
 *     the never-chose bundled default (capturedAt === null); it must never
 *     touch an explicit choice and never stamp capturedAt (that field
 *     records a USER act only — defaults don't count).
 */
import { describe, expect, it } from 'vitest';

import { migratePersistedAppState } from './appStore';

type MigratedConsent = {
  analyticsConsent?: { sentry?: boolean; posthog?: boolean; capturedAt?: string | null };
};

describe('migratePersistedAppState — telemetry choice preservation', () => {
  it('preserves an explicit Sentry OFF (objection) across the full chain', () => {
    const persisted = {
      analyticsConsent: {
        sentry: false,
        posthog: false,
        capturedAt: '2026-06-01T09:00:00.000Z',
      },
      routeRequest: { mode: 'fast' },
      locale: 'ro',
      weightKg: 82,
    };

    const result = migratePersistedAppState(persisted, 0) as MigratedConsent;

    expect(result.analyticsConsent).toEqual({
      sentry: false,
      posthog: false,
      capturedAt: '2026-06-01T09:00:00.000Z',
    });
  });

  it('preserves an explicit PostHog ON (opt-in) across the full chain', () => {
    const persisted = {
      analyticsConsent: {
        sentry: true,
        posthog: true,
        capturedAt: '2026-06-01T09:00:00.000Z',
      },
      routeRequest: { mode: 'safe' },
      locale: 'en',
      weightKg: 70,
    };

    const result = migratePersistedAppState(persisted, 0) as MigratedConsent;

    expect(result.analyticsConsent).toEqual({
      sentry: true,
      posthog: true,
      capturedAt: '2026-06-01T09:00:00.000Z',
    });
  });

  it('preserves an explicit PostHog OFF (opt-out) across the v5→v6 default flip', () => {
    const persisted = {
      analyticsConsent: {
        sentry: true,
        posthog: false,
        capturedAt: '2026-07-01T12:00:00.000Z',
      },
    };

    const result = migratePersistedAppState(persisted, 5) as MigratedConsent;

    expect(result.analyticsConsent).toEqual({
      sentry: true,
      posthog: false,
      capturedAt: '2026-07-01T12:00:00.000Z',
    });
  });

  it('flips the never-chose bundled defaults (capturedAt null) to sentry ON and posthog ON', () => {
    const persisted = {
      analyticsConsent: { sentry: false, posthog: false, capturedAt: null },
    };

    const result = migratePersistedAppState(persisted, 0) as MigratedConsent;

    expect(result.analyticsConsent?.sentry).toBe(true);
    // v5→v6 (2026-07-19 default flip): never-chose users adopt the new
    // product-analytics default...
    expect(result.analyticsConsent?.posthog).toBe(true);
    // ...but the flip is a DEFAULT, not a consent record — capturedAt must
    // stay null (it is stamped only by a real user act in Settings).
    expect(result.analyticsConsent?.capturedAt).toBeNull();
  });

  it('v5→v6 alone flips a never-chose posthog default without touching sentry', () => {
    const persisted = {
      analyticsConsent: { sentry: false, posthog: false, capturedAt: null },
    };

    // Starting AT version 5: only the v6 step runs — the v0→v1 sentry flip
    // must not re-run, so an old explicit-looking sentry:false persisted at
    // v5 stays as-is while posthog adopts the new default.
    const result = migratePersistedAppState(persisted, 5) as MigratedConsent;

    expect(result.analyticsConsent?.sentry).toBe(false);
    expect(result.analyticsConsent?.posthog).toBe(true);
    expect(result.analyticsConsent?.capturedAt).toBeNull();
  });

  it('a current-version (v6) state passes through untouched — no migration step runs', () => {
    const persisted = {
      analyticsConsent: {
        sentry: false,
        posthog: true,
        capturedAt: '2026-07-01T12:00:00.000Z',
      },
    };

    const result = migratePersistedAppState(persisted, 6) as MigratedConsent;

    expect(result).toEqual(persisted);
  });
});
