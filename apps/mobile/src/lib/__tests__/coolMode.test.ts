/**
 * Cool mode is hidden in production (product decision, 2026-08-29).
 *
 * The property that actually matters is not "the pill is hidden" — it is
 * "a production rider can never END UP in cool mode", because `avoidHeat`
 * has five entry paths and only one is the pill. These tests pin the choke
 * point rather than the UI.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadWith = async (appVariant: string, appEnv: string) => {
  vi.resetModules();
  vi.doMock('../env', () => ({ mobileEnv: { appVariant, appEnv } }));
  return import('../coolMode');
};

afterEach(() => {
  vi.doUnmock('../env');
  vi.resetModules();
});

describe('isCoolModeEnabled', () => {
  it('is OFF for a production build', async () => {
    const { isCoolModeEnabled } = await loadWith('production', 'production');
    expect(isCoolModeEnabled()).toBe(false);
  });

  it('is ON for development and preview builds', async () => {
    for (const [variant, env] of [
      ['development', 'development'],
      ['preview', 'preview'],
    ] as const) {
      const { isCoolModeEnabled } = await loadWith(variant, env);
      expect(isCoolModeEnabled()).toBe(true);
    }
  });

  it('fails safe when only ONE of variant/env says production', async () => {
    // A production APK with a mis-set env var, or a preview binary pointed at
    // production, must both land on the hidden side — matching the existing
    // dev-tool gates in devMockLocation.ts and diagnostics.tsx.
    for (const [variant, env] of [
      ['production', 'preview'],
      ['preview', 'production'],
    ] as const) {
      const { isCoolModeEnabled } = await loadWith(variant, env);
      expect(isCoolModeEnabled()).toBe(false);
    }
  });
});

describe('resolveAvoidHeat — the choke point', () => {
  it('refuses to enable cool mode in production, whatever asked for it', async () => {
    // Covers all five entry paths at once: pill, preview cycle-pill, shared
    // route claim, saved route, and rehydrated persisted state.
    const { resolveAvoidHeat } = await loadWith('production', 'production');
    expect(resolveAvoidHeat(true)).toBe(false);
    expect(resolveAvoidHeat(false)).toBe(false);
    expect(resolveAvoidHeat(undefined)).toBe(false);
  });

  it('heals a rider who already had it on before it was hidden', async () => {
    // The important one: without this, an existing avoidHeat=true rehydrates
    // into cool routing with no visible control to leave it.
    const { resolveAvoidHeat } = await loadWith('production', 'production');
    expect(resolveAvoidHeat(true)).toBe(false);
  });

  it('passes the request through untouched off production', async () => {
    const { resolveAvoidHeat } = await loadWith('preview', 'preview');
    expect(resolveAvoidHeat(true)).toBe(true);
    expect(resolveAvoidHeat(false)).toBe(false);
    expect(resolveAvoidHeat(undefined)).toBe(false);
  });
});
