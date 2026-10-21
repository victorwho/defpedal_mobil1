import type { RouteComparison } from '@defensivepedal/core';
import { describe, expect, it } from 'vitest';

import { translate } from '../i18n';
import { describeRouteComparison } from './routeComparisonCopy';

const t = (key: string, vars?: Record<string, string | number>) => translate('en', key, vars);
const MINE = { kmh: 18, personal: true, rideCount: 7 };

/** A safer route that the router says costs 5 min; the fast one is 5.0 km. */
const safer = (overrides: Partial<RouteComparison> = {}) => ({
  comparison: {
    against: 'fast' as const,
    verdict: 'safer' as const,
    diffPercent: 40,
    extraMinutes: 5,
    comparisonDistanceMeters: 5000,
    ...overrides,
  },
});

describe('describeRouteComparison: time cost', () => {
  it('the router’s minutes without a pace', () => {
    const copy = describeRouteComparison(safer(), t, 'metric', null, 5900);
    expect(copy?.title).toBe('+5 min for a calmer ride');
  });

  it('the extra distance at the rider’s pace, and says so', () => {
    // 900 m more at 18 km/h = 3 min.
    const copy = describeRouteComparison(safer(), t, 'metric', MINE, 5900);
    expect(copy?.title).toBe('+3 min at your pace for a calmer ride');
  });

  it('no cost to quote at the rider’s pace: the free line', () => {
    // 100 m more at 18 km/h rounds to 0.
    const copy = describeRouteComparison(safer(), t, 'metric', MINE, 5100);
    expect(copy?.title).toBe(t('preview.comparison.calmerFree'));
  });

  it('no compared length (Cool, or an older preview): the router’s figure stands', () => {
    const copy = describeRouteComparison(
      safer({ comparisonDistanceMeters: undefined, extraMinutes: undefined }),
      t,
      'metric',
      MINE,
      5900,
    );
    expect(copy?.title).toBe(t('preview.comparison.calmerFree'));
  });
});
