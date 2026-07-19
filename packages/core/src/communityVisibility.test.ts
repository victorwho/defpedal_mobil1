import { describe, expect, it } from 'vitest';

import {
  COMMUNITY_CHART_MIN_WEEKLY_RIDES,
  COMMUNITY_FEED_MAX_AGE_DAYS,
  COMMUNITY_FEED_NEARBY_RADIUS_KM,
  COMMUNITY_MIN_FEED_ITEMS,
  COMMUNITY_MIN_RIDES_PER_WINDOW,
  COMMUNITY_NEARBY_RADIUS_KM,
  COMMUNITY_REGION_RADIUS_KM,
  kmToMeters,
  pickCommunityChartMode,
  pickCommunityFeedScope,
  pickCommunityPulseRung,
  type CommunityPulseCounts,
} from './communityVisibility';

const counts = (
  partial: Partial<Record<'today' | 'week' | 'month', Partial<Record<'nearby' | 'region' | 'community', number>>>>,
): CommunityPulseCounts => ({
  today: { nearby: 0, region: 0, community: 0, ...partial.today },
  week: { nearby: 0, region: 0, community: 0, ...partial.week },
  month: { nearby: 0, region: 0, community: 0, ...partial.month },
});

describe('constants', () => {
  it('exposes sane, product-approved thresholds', () => {
    expect(COMMUNITY_MIN_RIDES_PER_WINDOW).toBe(3);
    expect(COMMUNITY_MIN_FEED_ITEMS).toBe(3);
    expect(COMMUNITY_NEARBY_RADIUS_KM).toBe(15);
    expect(COMMUNITY_REGION_RADIUS_KM).toBe(100);
    expect(COMMUNITY_CHART_MIN_WEEKLY_RIDES).toBe(7);
    expect(COMMUNITY_FEED_MAX_AGE_DAYS).toBe(365);
    // The ranked feed has always queried at 50 km — the ladder must never
    // narrow what users already saw.
    expect(COMMUNITY_FEED_NEARBY_RADIUS_KM).toBe(50);
  });

  it('kmToMeters converts', () => {
    expect(kmToMeters(15)).toBe(15000);
    expect(kmToMeters(100)).toBe(100000);
  });
});

describe('pickCommunityPulseRung', () => {
  it('keeps (today, nearby) when today has enough local rides', () => {
    const rung = pickCommunityPulseRung(counts({ today: { nearby: 3 } }));
    expect(rung).toEqual({ window: 'today', scope: 'nearby' });
  });

  it('widens the window before the radius', () => {
    // Today-nearby is empty but this week nearby has rides → week, still nearby.
    const rung = pickCommunityPulseRung(
      counts({ week: { nearby: 5 }, today: { region: 50, community: 50 } }),
    );
    expect(rung).toEqual({ window: 'week', scope: 'nearby' });
  });

  it('falls to (month, nearby) before touching region', () => {
    const rung = pickCommunityPulseRung(
      counts({ month: { nearby: 4 }, today: { region: 10 } }),
    );
    expect(rung).toEqual({ window: 'month', scope: 'nearby' });
  });

  it('widens radius after exhausting all windows nearby', () => {
    const rung = pickCommunityPulseRung(counts({ today: { region: 3 } }));
    expect(rung).toEqual({ window: 'today', scope: 'region' });
  });

  it('reaches (month, community) as the last qualifying rung', () => {
    const rung = pickCommunityPulseRung(counts({ month: { community: 5 } }));
    expect(rung).toEqual({ window: 'month', scope: 'community' });
  });

  it('falls back to the widest rung when nothing qualifies (true empty state)', () => {
    const rung = pickCommunityPulseRung(counts({}));
    expect(rung).toEqual({ window: 'month', scope: 'community' });
  });

  it('respects a custom threshold', () => {
    const rung = pickCommunityPulseRung(counts({ today: { nearby: 1 } }), 1);
    expect(rung).toEqual({ window: 'today', scope: 'nearby' });
  });

  it('a rung exactly at the threshold qualifies', () => {
    const rung = pickCommunityPulseRung(
      counts({ week: { region: COMMUNITY_MIN_RIDES_PER_WINDOW } }),
    );
    expect(rung).toEqual({ window: 'week', scope: 'region' });
  });
});

describe('pickCommunityFeedScope', () => {
  it('stays nearby with enough local items', () => {
    expect(pickCommunityFeedScope({ nearby: 3, region: 10, community: 20 })).toBe('nearby');
  });

  it('widens to region when nearby is sparse', () => {
    expect(pickCommunityFeedScope({ nearby: 2, region: 5, community: 20 })).toBe('region');
  });

  it('widens to community when region is sparse too', () => {
    expect(pickCommunityFeedScope({ nearby: 0, region: 1, community: 8 })).toBe('community');
  });

  it('falls back to community even when everything is empty', () => {
    expect(pickCommunityFeedScope({ nearby: 0, region: 0, community: 0 })).toBe('community');
  });

  it('respects a custom threshold', () => {
    expect(pickCommunityFeedScope({ nearby: 1, region: 0, community: 0 }, 1)).toBe('nearby');
  });
});

describe('pickCommunityChartMode', () => {
  it('shows the daily chart when the week is busy enough', () => {
    expect(pickCommunityChartMode(COMMUNITY_CHART_MIN_WEEKLY_RIDES)).toBe('daily');
    expect(pickCommunityChartMode(20)).toBe('daily');
  });

  it('switches to the 4-week view for sparse weeks', () => {
    expect(pickCommunityChartMode(COMMUNITY_CHART_MIN_WEEKLY_RIDES - 1)).toBe('weekly');
    expect(pickCommunityChartMode(0)).toBe('weekly');
  });
});
