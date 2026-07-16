/**
 * Persist-migration upgrade-path tests (2026-07-16, consent screen removed
 * from onboarding). The hard requirement: existing users' explicit telemetry
 * choices survive the upgrade — anyone who turned Sentry OFF stays OFF,
 * anyone who opted PostHog ON stays ON. The stored shape did NOT change, so
 * the version stays at 5 (no new migration step); these tests lock the
 * preservation behavior of the existing chain plus rehydration semantics.
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

  it('flips ONLY the never-chose bundled default (capturedAt null + sentry false) to sentry ON', () => {
    const persisted = {
      analyticsConsent: { sentry: false, posthog: false, capturedAt: null },
    };

    const result = migratePersistedAppState(persisted, 0) as MigratedConsent;

    expect(result.analyticsConsent?.sentry).toBe(true);
    expect(result.analyticsConsent?.posthog).toBe(false);
    expect(result.analyticsConsent?.capturedAt).toBeNull();
  });

  it('a current-version (v5) state passes through untouched — no migration step runs', () => {
    const persisted = {
      analyticsConsent: {
        sentry: false,
        posthog: true,
        capturedAt: '2026-07-01T12:00:00.000Z',
      },
    };

    const result = migratePersistedAppState(persisted, 5) as MigratedConsent;

    expect(result).toEqual(persisted);
  });
});
