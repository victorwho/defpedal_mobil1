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

  it('a current-version (v7) state passes through untouched — no migration step runs', () => {
    const persisted = {
      analyticsConsent: {
        sentry: false,
        posthog: true,
        capturedAt: '2026-07-01T12:00:00.000Z',
      },
    };

    const result = migratePersistedAppState(persisted, 7) as MigratedConsent;

    expect(result).toEqual(persisted);
  });
});

describe('importedCourses hydration safety', () => {
  it('leaves a pre-existing blob without importedCourses untouched', () => {
    // Every rider upgrading into this feature has a persisted blob with no
    // `importedCourses` key. The migration must not invent one — zustand's
    // shallow merge keeps the store's `[]` default for absent keys, and the
    // routes modal maps over it on open. A `null` written here would be
    // indistinguishable from `[]` until `.map` threw on a real device.
    const legacy = { appState: 'IDLE', voiceGuidanceEnabled: true };

    const migrated = migratePersistedAppState(legacy, 0) as Record<string, unknown>;

    expect('importedCourses' in migrated).toBe(false);
  });

  it('preserves saved courses across a migration', () => {
    const course = {
      id: 'course-1',
      name: 'Sunday loop',
      distanceMeters: 12000,
      climbMeters: 140,
      busyStretchCount: 2,
      pointCount: 900,
      createdAt: '2026-09-04T08:00:00.000Z',
    };

    const migrated = migratePersistedAppState(
      { appState: 'IDLE', importedCourses: [course] },
      0,
    ) as Record<string, unknown>;

    expect(migrated.importedCourses).toEqual([course]);
  });
  // ── v6 → v7: bike type becomes a stable id ────────────────────────────
  describe('v6 -> v7 bike type id migration', () => {
    it('maps a localized label to its stable id in every locale', () => {
      const cases: ReadonlyArray<readonly [string, string]> = [
        ['Road bike', 'road'],
        ['Bicicletă de cursă', 'road'],
        ['Bicicleta de carretera', 'road'],
        ['Mountain bike', 'mountain'],
        ['Bicicletă de munte', 'mountain'],
        ['Bicicleta de montaña', 'mountain'],
        ['E-bike', 'ebike'],
        ['Bicicletă electrică', 'ebike'],
        ['Bicicleta eléctrica', 'ebike'],
      ];

      for (const [label, id] of cases) {
        const migrated = migratePersistedAppState(
          { appState: 'IDLE', bikeType: label },
          6,
        ) as Record<string, unknown>;
        expect(migrated.bikeTypeId, `${label} -> ${id}`).toBe(id);
        expect('bikeType' in migrated).toBe(false);
      }
    });

    it('does NOT retroactively change avoidUnpaved', () => {
      // The rider's current value is an existing choice (or an existing
      // default). Flipping a routing setting during an app update is not
      // ours to do — the new default only applies to new selections.
      const migrated = migratePersistedAppState(
        { appState: 'IDLE', bikeType: 'Road bike', avoidUnpaved: false },
        6,
      ) as Record<string, unknown>;

      expect(migrated.bikeTypeId).toBe('road');
      expect(migrated.avoidUnpaved).toBe(false);
    });

    it('marks the onboarding prompt seen only for devices that already onboarded', () => {
      const done = migratePersistedAppState(
        { appState: 'IDLE', onboardingCompleted: true },
        6,
      ) as Record<string, unknown>;
      expect(done.bikeTypePromptSeen).toBe(true);

      const midFlow = migratePersistedAppState(
        { appState: 'IDLE', onboardingCompleted: false },
        6,
      ) as Record<string, unknown>;
      expect(midFlow.bikeTypePromptSeen).toBe(false);
    });

    it('leaves bikeTypeId null when no bike type was ever stored', () => {
      const migrated = migratePersistedAppState(
        { appState: 'IDLE', onboardingCompleted: true },
        6,
      ) as Record<string, unknown>;
      expect(migrated.bikeTypeId).toBeNull();
    });
  });
});
