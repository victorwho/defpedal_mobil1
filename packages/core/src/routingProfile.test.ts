import { describe, expect, it } from 'vitest';

import {
  ROUTING_DISPLAY_MODES,
  fromRoutingDisplayMode,
  isRoutingDisplayMode,
  resolveSafeRoutingProfile,
  toRoutingDisplayMode,
} from './routingProfile';

describe('resolveSafeRoutingProfile', () => {
  it('uses the standard graph with no profile flags', () => {
    expect(resolveSafeRoutingProfile({}, true)).toBe('standard');
  });

  it('maps each single flag to its own graph', () => {
    expect(resolveSafeRoutingProfile({ avoidHills: true }, true)).toBe('flat');
    expect(resolveSafeRoutingProfile({ isEbike: true }, true)).toBe('ebike');
    expect(resolveSafeRoutingProfile({ avoidHeat: true }, true)).toBe('cool');
  });

  it('e-bike wins over flat — there is no e-bike flat graph', () => {
    expect(resolveSafeRoutingProfile({ isEbike: true, avoidHills: true }, true)).toBe('ebike');
  });

  it('cool wins over e-bike inside heat coverage', () => {
    expect(resolveSafeRoutingProfile({ avoidHeat: true, isEbike: true }, true)).toBe('cool');
  });

  it('outside heat coverage cool falls through to the next flag, not to failure', () => {
    expect(resolveSafeRoutingProfile({ avoidHeat: true }, false)).toBe('standard');
    expect(resolveSafeRoutingProfile({ avoidHeat: true, isEbike: true }, false)).toBe('ebike');
    expect(resolveSafeRoutingProfile({ avoidHeat: true, avoidHills: true }, false)).toBe('flat');
  });
});

describe('toRoutingDisplayMode', () => {
  it('fast ignores every profile flag', () => {
    expect(
      toRoutingDisplayMode('fast', { avoidHills: true, avoidHeat: true, isEbike: true }),
    ).toBe('fast');
  });

  it('names safe-family requests with the dispatch precedence', () => {
    expect(toRoutingDisplayMode('safe', {})).toBe('safe');
    expect(toRoutingDisplayMode('safe', { avoidHills: true })).toBe('flat');
    expect(toRoutingDisplayMode('safe', { isEbike: true })).toBe('ebike');
    expect(toRoutingDisplayMode('safe', { isEbike: true, avoidHills: true })).toBe('ebike');
    expect(toRoutingDisplayMode('safe', { avoidHeat: true, isEbike: true })).toBe('cool');
  });
});

describe('fromRoutingDisplayMode', () => {
  it('round-trips every mode', () => {
    for (const mode of ROUTING_DISPLAY_MODES) {
      const selection = fromRoutingDisplayMode(mode);
      expect(toRoutingDisplayMode(selection.mode, selection)).toBe(mode);
    }
  });

  it('never sets more than one profile flag', () => {
    for (const mode of ROUTING_DISPLAY_MODES) {
      const { avoidHills, avoidHeat, isEbike } = fromRoutingDisplayMode(mode);
      expect([avoidHills, avoidHeat, isEbike].filter(Boolean).length).toBeLessThanOrEqual(1);
    }
  });

  it('expands e-bike to a safe request with only the e-bike flag', () => {
    expect(fromRoutingDisplayMode('ebike')).toEqual({
      mode: 'safe',
      avoidHills: false,
      avoidHeat: false,
      isEbike: true,
    });
  });
});

describe('isRoutingDisplayMode', () => {
  it('accepts the five modes and rejects anything else', () => {
    expect(isRoutingDisplayMode('ebike')).toBe(true);
    expect(isRoutingDisplayMode('cool')).toBe(true);
    expect(isRoutingDisplayMode('e-bike')).toBe(false);
    expect(isRoutingDisplayMode(undefined)).toBe(false);
  });
});
