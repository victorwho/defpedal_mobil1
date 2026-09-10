/**
 * Which loop generator a build uses.
 *
 * The rules that matter: it fails closed, and the build-time override is
 * ignored on production builds whichever of the two production signals is set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = {
  appVariant: 'development',
  appEnv: 'development',
};

vi.mock('./env', () => ({
  get mobileEnv() {
    return mockEnv;
  },
}));

import { isLoopServerEnabled } from './loopServerFlag';

const setOverride = (value: string | undefined) => {
  if (value === undefined) delete process.env.EXPO_PUBLIC_LOOP_GENERATION_SERVER;
  else process.env.EXPO_PUBLIC_LOOP_GENERATION_SERVER = value;
};

describe('isLoopServerEnabled', () => {
  beforeEach(() => {
    mockEnv.appVariant = 'development';
    mockEnv.appEnv = 'development';
    setOverride(undefined);
  });
  afterEach(() => {
    setOverride(undefined);
  });

  it('is OFF when the server has said nothing', () => {
    // Every other switch in this codebase fails open. This one must not: an
    // older server, a failed profile read and a fresh install all have to land
    // on the generator riders have been running for months.
    expect(isLoopServerEnabled(false)).toBe(false);
  });

  it('follows the server once it has answered', () => {
    expect(isLoopServerEnabled(true)).toBe(true);
    expect(isLoopServerEnabled(false)).toBe(false);
  });

  it('lets a dev build force it on before any rollout', () => {
    setOverride('true');
    expect(isLoopServerEnabled(false)).toBe(true);
  });

  it('lets a dev build force it OFF while the server says on', () => {
    // Both directions, so a developer chasing a difference between the two
    // paths can pin either one without touching the server.
    setOverride('false');
    expect(isLoopServerEnabled(true)).toBe(false);
  });

  it.each([
    ['a production variant', { appVariant: 'production', appEnv: 'development' }],
    ['a production env', { appVariant: 'preview', appEnv: 'production' }],
    ['both', { appVariant: 'production', appEnv: 'production' }],
  ])('ignores the override on %s', (_name, env) => {
    Object.assign(mockEnv, env);
    setOverride('true');
    // A production APK with a mis-set env var, and a preview binary pointed at
    // production, both have to land on the safe side — the same double gate
    // the cool-mode and diagnostics tools use.
    expect(isLoopServerEnabled(false)).toBe(false);
  });

  it('still follows the server on a production build', () => {
    Object.assign(mockEnv, { appVariant: 'production', appEnv: 'production' });
    expect(isLoopServerEnabled(true)).toBe(true);
  });

  it('treats an unparseable override as no opinion', () => {
    setOverride('maybe');
    expect(isLoopServerEnabled(false)).toBe(false);
    expect(isLoopServerEnabled(true)).toBe(true);
  });
});
