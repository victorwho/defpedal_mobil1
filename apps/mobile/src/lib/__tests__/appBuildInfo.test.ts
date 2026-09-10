import { describe, expect, it } from 'vitest';

import { resolveAppEnvironment, resolveAppVersion } from '../appBuildInfo';

describe('resolveAppEnvironment', () => {
  it('reports the environment when both signals agree', () => {
    for (const e of ['development', 'preview', 'production'] as const) {
      expect(resolveAppEnvironment(e, e)).toBe(e);
    }
  });

  /**
   * The point of the field is keeping tester rides OUT of production numbers,
   * so an ambiguous build must never claim production. Under-counting
   * production is recoverable; polluting it is the bug being fixed.
   */
  it('takes the LEAST production value when the two disagree', () => {
    expect(resolveAppEnvironment('preview', 'production')).toBe('preview');
    expect(resolveAppEnvironment('production', 'preview')).toBe('preview');
    expect(resolveAppEnvironment('development', 'production')).toBe('development');
    expect(resolveAppEnvironment('production', 'development')).toBe('development');
    expect(resolveAppEnvironment('development', 'preview')).toBe('development');
  });

  it('falls back to whichever signal is recognisable', () => {
    expect(resolveAppEnvironment(undefined, 'production')).toBe('production');
    expect(resolveAppEnvironment('preview', undefined)).toBe('preview');
    expect(resolveAppEnvironment('nonsense', 'preview')).toBe('preview');
  });

  /**
   * Absent must stay distinguishable from a real value — the column has no
   * default for the same reason. A guess here silently relabels every row.
   */
  it('returns undefined rather than guessing', () => {
    expect(resolveAppEnvironment(undefined, undefined)).toBeUndefined();
    expect(resolveAppEnvironment('nonsense', '')).toBeUndefined();
    expect(resolveAppEnvironment('Production', 'PRODUCTION')).toBeUndefined();
  });
});

describe('resolveAppVersion', () => {
  it('accepts a real version string', () => {
    expect(resolveAppVersion('0.2.159')).toBe('0.2.159');
    expect(resolveAppVersion('  0.2.159 ')).toBe('0.2.159');
  });

  it('rejects anything that is not a usable string', () => {
    for (const bad of [undefined, null, '', '   ', 42, {}, []]) {
      expect(resolveAppVersion(bad)).toBeUndefined();
    }
  });
});
