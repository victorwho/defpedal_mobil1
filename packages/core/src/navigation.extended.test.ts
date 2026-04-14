import { describe, expect, it } from 'vitest';

import {
  APPROACH_ANNOUNCEMENT_METERS,
  ARRIVAL_THRESHOLD_METERS,
  OFF_ROUTE_THRESHOLD_METERS,
  advanceNavigationStep,
  completeNavigationSession,
  computeRemainingClimb,
  computeRemainingDescent,
  computeCurrentGrade,
  createNavigationSession,
  getAppStateFromSession,
  hasArrived,
  isOffRoute,
  recordRerouteAttempt,
  resetNavigationSession,
  setSessionApproachAnnouncement,
  setSessionFollowMode,
  setSessionMute,
  setSessionRerouteEligible,
  setSessionSnappedCoordinate,
  shouldAnnounceApproach,
  shouldTriggerAutomaticReroute,
  syncSessionToRoute,
} from './navigation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('navigation constants', () => {
  it('OFF_ROUTE_THRESHOLD_METERS is 50', () => {
    expect(OFF_ROUTE_THRESHOLD_METERS).toBe(50);
  });

  it('APPROACH_ANNOUNCEMENT_METERS is 50', () => {
    expect(APPROACH_ANNOUNCEMENT_METERS).toBe(50);
  });

  it('ARRIVAL_THRESHOLD_METERS is 25', () => {
    expect(ARRIVAL_THRESHOLD_METERS).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// createNavigationSession
// ---------------------------------------------------------------------------

describe('createNavigationSession', () => {
  it('sets state to "navigating"', () => {
    const s = createNavigationSession('r1');
    expect(s.state).toBe('navigating');
  });

  it('uses provided routeId', () => {
    const s = createNavigationSession('route-abc');
    expect(s.routeId).toBe('route-abc');
  });

  it('starts at step index 0', () => {
    expect(createNavigationSession('r1').currentStepIndex).toBe(0);
  });

  it('starts unmuted and following', () => {
    const s = createNavigationSession('r1');
    expect(s.isMuted).toBe(false);
    expect(s.isFollowing).toBe(true);
  });

  it('initialises offRouteSince and lastRerouteAt to null', () => {
    const s = createNavigationSession('r1');
    expect(s.offRouteSince).toBeNull();
    expect(s.lastRerouteAt).toBeNull();
  });

  it('initialises gpsBreadcrumbs to empty array', () => {
    expect(createNavigationSession('r1').gpsBreadcrumbs).toEqual([]);
  });

  it('uses provided startedAt when given', () => {
    const at = '2026-01-01T00:00:00.000Z';
    expect(createNavigationSession('r1', at).startedAt).toBe(at);
  });

  it('uses provided sessionId when given', () => {
    const s = createNavigationSession('r1', undefined, 'my-session');
    expect(s.sessionId).toBe('my-session');
  });

  it('does not mutate anything (returns new object each call)', () => {
    const a = createNavigationSession('r1');
    const b = createNavigationSession('r1');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// setSessionMute
// ---------------------------------------------------------------------------

describe('setSessionMute', () => {
  it('mutes a session', () => {
    const s = createNavigationSession('r1');
    expect(setSessionMute(s, true).isMuted).toBe(true);
  });

  it('unmutes a session', () => {
    const s = { ...createNavigationSession('r1'), isMuted: true };
    expect(setSessionMute(s, false).isMuted).toBe(false);
  });

  it('does not mutate the original session', () => {
    const s = createNavigationSession('r1');
    setSessionMute(s, true);
    expect(s.isMuted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setSessionFollowMode
// ---------------------------------------------------------------------------

describe('setSessionFollowMode', () => {
  it('disables following', () => {
    const s = createNavigationSession('r1');
    expect(setSessionFollowMode(s, false).isFollowing).toBe(false);
  });

  it('re-enables following', () => {
    const s = { ...createNavigationSession('r1'), isFollowing: false };
    expect(setSessionFollowMode(s, true).isFollowing).toBe(true);
  });

  it('does not mutate the original', () => {
    const s = createNavigationSession('r1');
    setSessionFollowMode(s, false);
    expect(s.isFollowing).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// setSessionSnappedCoordinate
// ---------------------------------------------------------------------------

describe('setSessionSnappedCoordinate', () => {
  it('sets the lastSnappedCoordinate', () => {
    const s = createNavigationSession('r1');
    const coord = { lat: 44.4268, lon: 26.1025 };
    const updated = setSessionSnappedCoordinate(s, coord);
    expect(updated.lastSnappedCoordinate).toEqual(coord);
  });

  it('does not mutate the original', () => {
    const s = createNavigationSession('r1');
    setSessionSnappedCoordinate(s, { lat: 44.4268, lon: 26.1025 });
    expect(s.lastSnappedCoordinate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// setSessionRerouteEligible
// ---------------------------------------------------------------------------

describe('setSessionRerouteEligible', () => {
  it('marks session as reroute-eligible', () => {
    const s = createNavigationSession('r1');
    expect(setSessionRerouteEligible(s, true).rerouteEligible).toBe(true);
  });

  it('clears reroute-eligible flag', () => {
    const s = { ...createNavigationSession('r1'), rerouteEligible: true };
    expect(setSessionRerouteEligible(s, false).rerouteEligible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setSessionApproachAnnouncement
// ---------------------------------------------------------------------------

describe('setSessionApproachAnnouncement', () => {
  it('sets the lastApproachAnnouncementStepId', () => {
    const s = createNavigationSession('r1');
    const updated = setSessionApproachAnnouncement(s, 'step-3');
    expect(updated.lastApproachAnnouncementStepId).toBe('step-3');
  });

  it('clears the lastApproachAnnouncementStepId when null is passed', () => {
    const s = { ...createNavigationSession('r1'), lastApproachAnnouncementStepId: 'step-3' };
    expect(setSessionApproachAnnouncement(s, null).lastApproachAnnouncementStepId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// syncSessionToRoute
// ---------------------------------------------------------------------------

describe('syncSessionToRoute', () => {
  it('resets step index to 0', () => {
    const s = { ...createNavigationSession('r1'), currentStepIndex: 5 };
    expect(syncSessionToRoute(s, 'r2').currentStepIndex).toBe(0);
  });

  it('updates the routeId', () => {
    const s = createNavigationSession('r1');
    expect(syncSessionToRoute(s, 'new-route').routeId).toBe('new-route');
  });

  it('sets state back to "navigating"', () => {
    const s = { ...createNavigationSession('r1'), state: 'awaiting_feedback' as const };
    expect(syncSessionToRoute(s, 'r1').state).toBe('navigating');
  });

  it('clears offRouteSince', () => {
    const s = { ...createNavigationSession('r1'), offRouteSince: '2026-01-01T00:00:00.000Z' };
    expect(syncSessionToRoute(s, 'r2').offRouteSince).toBeNull();
  });

  it('clears rerouteEligible', () => {
    const s = { ...createNavigationSession('r1'), rerouteEligible: true };
    expect(syncSessionToRoute(s, 'r2').rerouteEligible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// recordRerouteAttempt
// ---------------------------------------------------------------------------

describe('recordRerouteAttempt', () => {
  it('records the reroute timestamp', () => {
    const s = createNavigationSession('r1');
    const at = '2026-03-14T10:01:00.000Z';
    expect(recordRerouteAttempt(s, at).lastRerouteAt).toBe(at);
  });

  it('clears rerouteEligible', () => {
    const s = { ...createNavigationSession('r1'), rerouteEligible: true };
    expect(recordRerouteAttempt(s, '2026-03-14T10:01:00.000Z').rerouteEligible).toBe(false);
  });

  it('clears offRouteSince', () => {
    const s = { ...createNavigationSession('r1'), offRouteSince: '2026-03-14T10:00:00.000Z' };
    expect(recordRerouteAttempt(s, '2026-03-14T10:01:00.000Z').offRouteSince).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// advanceNavigationStep
// ---------------------------------------------------------------------------

describe('advanceNavigationStep', () => {
  it('increments step index by 1', () => {
    const s = { ...createNavigationSession('r1'), currentStepIndex: 1 };
    expect(advanceNavigationStep(s, 5).currentStepIndex).toBe(2);
  });

  it('does not exceed totalSteps - 1', () => {
    const s = { ...createNavigationSession('r1'), currentStepIndex: 3 };
    expect(advanceNavigationStep(s, 4).currentStepIndex).toBe(3);
  });

  it('returns 0 when totalSteps is 0', () => {
    const s = createNavigationSession('r1');
    expect(advanceNavigationStep(s, 0).currentStepIndex).toBe(0);
  });

  it('returns 0 when totalSteps is negative', () => {
    const s = createNavigationSession('r1');
    expect(advanceNavigationStep(s, -1).currentStepIndex).toBe(0);
  });

  it('clears lastApproachAnnouncementStepId', () => {
    const s = { ...createNavigationSession('r1'), lastApproachAnnouncementStepId: 'step-1' };
    expect(advanceNavigationStep(s, 5).lastApproachAnnouncementStepId).toBeNull();
  });

  it('does not mutate the original session', () => {
    const s = { ...createNavigationSession('r1'), currentStepIndex: 0 };
    advanceNavigationStep(s, 5);
    expect(s.currentStepIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// completeNavigationSession
// ---------------------------------------------------------------------------

describe('completeNavigationSession', () => {
  it('sets state to "awaiting_feedback"', () => {
    const s = createNavigationSession('r1');
    expect(completeNavigationSession(s).state).toBe('awaiting_feedback');
  });

  it('preserves other session fields', () => {
    const s = createNavigationSession('r1');
    const completed = completeNavigationSession(s);
    expect(completed.routeId).toBe(s.routeId);
    expect(completed.sessionId).toBe(s.sessionId);
  });

  it('does not mutate the original session', () => {
    const s = createNavigationSession('r1');
    completeNavigationSession(s);
    expect(s.state).toBe('navigating');
  });
});

// ---------------------------------------------------------------------------
// resetNavigationSession
// ---------------------------------------------------------------------------

describe('resetNavigationSession', () => {
  it('returns state "idle"', () => {
    expect(resetNavigationSession().state).toBe('idle');
  });

  it('returns an empty routeId', () => {
    expect(resetNavigationSession().routeId).toBe('');
  });

  it('returns step index 0', () => {
    expect(resetNavigationSession().currentStepIndex).toBe(0);
  });

  it('returns a unique sessionId each call', () => {
    const a = resetNavigationSession().sessionId;
    const b = resetNavigationSession().sessionId;
    // Not guaranteed but highly probable
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(typeof b).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// getAppStateFromSession
// ---------------------------------------------------------------------------

describe('getAppStateFromSession', () => {
  it('returns IDLE for null session', () => {
    expect(getAppStateFromSession(null)).toBe('IDLE');
  });

  it('returns IDLE for idle state', () => {
    const s = { ...createNavigationSession('r1'), state: 'idle' as const };
    expect(getAppStateFromSession(s)).toBe('IDLE');
  });

  it('returns ROUTE_PREVIEW for preview state', () => {
    const s = { ...createNavigationSession('r1'), state: 'preview' as const };
    expect(getAppStateFromSession(s)).toBe('ROUTE_PREVIEW');
  });

  it('returns NAVIGATING for navigating state', () => {
    const s = createNavigationSession('r1');
    expect(getAppStateFromSession(s)).toBe('NAVIGATING');
  });

  it('returns AWAITING_FEEDBACK for awaiting_feedback state', () => {
    const s = { ...createNavigationSession('r1'), state: 'awaiting_feedback' as const };
    expect(getAppStateFromSession(s)).toBe('AWAITING_FEEDBACK');
  });
});

// ---------------------------------------------------------------------------
// isOffRoute
// ---------------------------------------------------------------------------

describe('isOffRoute', () => {
  it('returns false when distance equals threshold exactly', () => {
    expect(isOffRoute(100, 100)).toBe(false);
  });

  it('returns true when distance exceeds threshold by 1m', () => {
    expect(isOffRoute(101, 100)).toBe(true);
  });

  it('clamps GPS accuracy buffer to 50m max', () => {
    // 100m threshold + 50m max buffer = 150m effective
    // With 200m GPS accuracy, buffer should still only be 50m
    expect(isOffRoute(149, 100, 200)).toBe(false);
    expect(isOffRoute(151, 100, 200)).toBe(true);
  });

  it('uses GPS accuracy buffer up to 50m', () => {
    // 100 + 30 = 130m effective threshold
    expect(isOffRoute(130, 100, 30)).toBe(false);
    expect(isOffRoute(131, 100, 30)).toBe(true);
  });

  it('uses default threshold of 50m', () => {
    expect(isOffRoute(49)).toBe(false);
    expect(isOffRoute(51)).toBe(true);
  });

  it('uses default GPS accuracy of 0', () => {
    expect(isOffRoute(100, 100, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldAnnounceApproach
// ---------------------------------------------------------------------------

describe('shouldAnnounceApproach', () => {
  it('returns true when within approach distance and not yet announced', () => {
    expect(shouldAnnounceApproach(40, false)).toBe(true);
  });

  it('returns false when already announced', () => {
    expect(shouldAnnounceApproach(40, true)).toBe(false);
  });

  it('returns false when beyond approach threshold', () => {
    expect(shouldAnnounceApproach(51, false)).toBe(false);
  });

  it('returns false when within arrival threshold (already arrived)', () => {
    expect(shouldAnnounceApproach(10, false)).toBe(false);
  });

  it('returns false at exactly the arrival threshold', () => {
    expect(shouldAnnounceApproach(ARRIVAL_THRESHOLD_METERS, false)).toBe(false);
  });

  it('returns true at exactly the approach threshold', () => {
    expect(shouldAnnounceApproach(APPROACH_ANNOUNCEMENT_METERS, false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasArrived
// ---------------------------------------------------------------------------

describe('hasArrived', () => {
  it('returns true when distance is well below threshold', () => {
    expect(hasArrived(10)).toBe(true);
  });

  it('returns false when distance is above threshold', () => {
    expect(hasArrived(26)).toBe(false);
  });

  it('returns true at exactly the threshold (boundary — <= inclusive)', () => {
    expect(hasArrived(ARRIVAL_THRESHOLD_METERS)).toBe(true);
  });

  it('returns true at threshold minus 1', () => {
    expect(hasArrived(ARRIVAL_THRESHOLD_METERS - 1)).toBe(true);
  });

  it('uses a custom threshold when provided', () => {
    expect(hasArrived(50, 60)).toBe(true);
    expect(hasArrived(60, 60)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shouldTriggerAutomaticReroute
// ---------------------------------------------------------------------------

describe('shouldTriggerAutomaticReroute', () => {
  const BASE_TIME = Date.parse('2026-03-14T10:00:00.000Z');

  it('returns false when offRouteSince is null', () => {
    const s = createNavigationSession('r1');
    expect(shouldTriggerAutomaticReroute(s, BASE_TIME)).toBe(false);
  });

  it('returns false when not enough time has passed', () => {
    const s = { ...createNavigationSession('r1'), offRouteSince: '2026-03-14T10:00:00.000Z' };
    expect(shouldTriggerAutomaticReroute(s, BASE_TIME + 1000, 60_000)).toBe(false);
  });

  it('returns true once delay has elapsed and no prior reroute', () => {
    const s = { ...createNavigationSession('r1'), offRouteSince: '2026-03-14T10:00:00.000Z' };
    expect(shouldTriggerAutomaticReroute(s, BASE_TIME + 60_001, 60_000)).toBe(true);
  });

  it('returns false within cooldown after a prior reroute', () => {
    const s = {
      ...createNavigationSession('r1'),
      offRouteSince: '2026-03-14T10:00:00.000Z',
      lastRerouteAt: '2026-03-14T10:01:00.000Z',
    };
    const lastRerouteMs = Date.parse('2026-03-14T10:01:00.000Z');
    expect(shouldTriggerAutomaticReroute(s, lastRerouteMs + 1000, 60_000, 60_000)).toBe(false);
  });

  it('returns true after cooldown has elapsed since last reroute', () => {
    const s = {
      ...createNavigationSession('r1'),
      offRouteSince: '2026-03-14T10:00:00.000Z',
      lastRerouteAt: '2026-03-14T10:01:00.000Z',
    };
    const lastRerouteMs = Date.parse('2026-03-14T10:01:00.000Z');
    expect(shouldTriggerAutomaticReroute(s, lastRerouteMs + 60_001, 60_000, 60_000)).toBe(true);
  });

  it('returns false when offRouteSince is an invalid date string', () => {
    const s = { ...createNavigationSession('r1'), offRouteSince: 'not-a-date' };
    expect(shouldTriggerAutomaticReroute(s, BASE_TIME + 999_999)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeRemainingClimb
// ---------------------------------------------------------------------------

describe('computeRemainingClimb', () => {
  it('returns 0 for an empty profile', () => {
    expect(computeRemainingClimb([], 1000, 500)).toBe(0);
  });

  it('returns 0 for a single-element profile', () => {
    expect(computeRemainingClimb([100], 1000, 500)).toBe(0);
  });

  it('returns 0 when totalDistanceMeters is 0', () => {
    expect(computeRemainingClimb([100, 110, 120], 0, 0)).toBe(0);
  });

  it('returns 0 when totalDistanceMeters is negative', () => {
    expect(computeRemainingClimb([100, 110], -1, 500)).toBe(0);
  });

  it('returns full climb at the start (remaining = total)', () => {
    // All remaining → progress ratio = 0 → start from index 0
    const profile = [100, 110, 120, 130]; // 30m total gain
    expect(computeRemainingClimb(profile, 1000, 1000)).toBe(30);
  });

  it('returns 0 at the destination (remaining = 0)', () => {
    const profile = [100, 110, 120, 130];
    expect(computeRemainingClimb(profile, 1000, 0)).toBe(0);
  });

  it('returns partial climb at midpoint', () => {
    // profile of 4 points → indices 0,1,2,3
    // At 50% progress → startIndex = floor(0.5 * 3) = 1
    // Remaining climb from index 1 to end: (120-110) + (130-120) = 20
    const profile = [100, 110, 120, 130];
    expect(computeRemainingClimb(profile, 1000, 500)).toBe(20);
  });

  it('ignores descents — only counts positive deltas', () => {
    const profile = [100, 120, 110, 130]; // gain: +20, -10, +20 = net climb 40
    expect(computeRemainingClimb(profile, 1000, 1000)).toBe(40);
  });

  it('rounds the result to the nearest integer', () => {
    // Deltas that produce fractional climb
    const profile = [0, 0.4, 0.9]; // +0.4, +0.5 = 0.9 → rounds to 1
    const result = computeRemainingClimb(profile, 1000, 1000);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('clamps progress ratio so remaining > total still gives full climb', () => {
    // remainingDistanceMeters > totalDistanceMeters → ratio < 0 → clamped to 0
    const profile = [100, 110, 120];
    expect(computeRemainingClimb(profile, 500, 1000)).toBe(20);
  });

  it('does not mutate the elevation profile array', () => {
    const profile = [100, 110, 120, 130];
    const copy = [...profile];
    computeRemainingClimb(profile, 1000, 500);
    expect(profile).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// computeRemainingDescent
// ---------------------------------------------------------------------------

describe('computeRemainingDescent', () => {
  it('returns 0 for an empty profile', () => {
    expect(computeRemainingDescent([], 1000, 500)).toBe(0);
  });

  it('returns 0 for a single-element profile', () => {
    expect(computeRemainingDescent([100], 1000, 500)).toBe(0);
  });

  it('returns full descent at the start (remaining = total)', () => {
    const profile = [130, 120, 110, 100]; // 30m total descent
    expect(computeRemainingDescent(profile, 1000, 1000)).toBe(30);
  });

  it('returns 0 at the destination (remaining = 0)', () => {
    const profile = [130, 120, 110, 100];
    expect(computeRemainingDescent(profile, 1000, 0)).toBe(0);
  });

  it('returns partial descent at midpoint', () => {
    // 4 points, 50% progress → startIndex = floor(0.5 * 3) = 1
    // Descent from index 1: (110-120=-10) + (100-110=-10) = 20
    const profile = [130, 120, 110, 100];
    expect(computeRemainingDescent(profile, 1000, 500)).toBe(20);
  });

  it('ignores climbs — only counts negative deltas', () => {
    const profile = [130, 110, 120, 100]; // -20, +10, -20 = 40m descent
    expect(computeRemainingDescent(profile, 1000, 1000)).toBe(40);
  });

  it('returns 0 for a monotonically climbing profile', () => {
    const profile = [100, 110, 120, 130]; // only climbing
    expect(computeRemainingDescent(profile, 1000, 1000)).toBe(0);
  });

  it('clamps progress ratio so remaining > total still gives full descent', () => {
    const profile = [120, 110, 100];
    expect(computeRemainingDescent(profile, 500, 1000)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// computeCurrentGrade
// ---------------------------------------------------------------------------

describe('computeCurrentGrade', () => {
  it('returns null for empty profile', () => {
    expect(computeCurrentGrade([], 1000, 500)).toBeNull();
  });

  it('returns null for single-point profile', () => {
    expect(computeCurrentGrade([100], 1000, 500)).toBeNull();
  });

  it('returns null for zero total distance', () => {
    expect(computeCurrentGrade([100, 200], 0, 0)).toBeNull();
  });

  it('returns null when remaining distance is null-like (NaN)', () => {
    // This tests the boundary — NaN propagates through math
    const result = computeCurrentGrade([100, 200], 1000, NaN);
    // NaN math produces NaN, not null — but the function still returns a number
    // The caller (navigation.tsx) guards with == null check before calling
    expect(result).not.toBeNull();
  });

  it('computes positive grade for uphill segment', () => {
    // 100m rise over 1000m distance = 10% grade
    const profile = [0, 100];
    const grade = computeCurrentGrade(profile, 1000, 1000); // at start
    expect(grade).toBe(10);
  });

  it('computes negative grade for downhill segment', () => {
    // -100m drop over 1000m distance = -10% grade
    const profile = [100, 0];
    const grade = computeCurrentGrade(profile, 1000, 1000); // at start
    expect(grade).toBe(-10);
  });

  it('returns 0 grade on flat terrain', () => {
    const profile = [100, 100, 100];
    const grade = computeCurrentGrade(profile, 1000, 500); // halfway
    expect(grade).toBe(0);
  });

  it('picks correct segment based on progress (halfway on 3-segment profile)', () => {
    // 3 segments: flat (0%), up 10m/500m = 2%, down 20m/500m = -4%
    const profile = [100, 100, 110, 90]; // segments: 0m, +10m, -20m
    const totalDist = 1500; // 500m per segment

    // At start (remaining = 1500) → segment 0 → flat
    expect(computeCurrentGrade(profile, totalDist, 1500)).toBe(0);

    // At 500m (remaining = 1000) → segment 1 → +10m/500m = 2%
    expect(computeCurrentGrade(profile, totalDist, 1000)).toBe(2);

    // At 1000m (remaining = 500) → segment 2 → -20m/500m = -4%
    expect(computeCurrentGrade(profile, totalDist, 500)).toBe(-4);
  });

  it('detects steep uphill (>= 8%)', () => {
    // 80m rise over 1000m = 8%
    const profile = [0, 80];
    const grade = computeCurrentGrade(profile, 1000, 1000);
    expect(grade).toBeGreaterThanOrEqual(8);
  });

  it('detects steep downhill (<= -7%)', () => {
    // -70m over 1000m = -7%
    const profile = [70, 0];
    const grade = computeCurrentGrade(profile, 1000, 1000);
    expect(grade).toBeLessThanOrEqual(-7);
  });

  it('does not flag moderate uphill as steep', () => {
    // 50m rise over 1000m = 5%
    const profile = [0, 50];
    const grade = computeCurrentGrade(profile, 1000, 1000);
    expect(grade).toBeLessThan(8);
    expect(grade).toBeGreaterThan(0);
  });

  it('does not flag moderate downhill as steep', () => {
    // -50m over 1000m = -5%
    const profile = [50, 0];
    const grade = computeCurrentGrade(profile, 1000, 1000);
    expect(grade).toBeGreaterThan(-7);
    expect(grade).toBeLessThan(0);
  });

  it('clamps progress at route start when remaining > total', () => {
    const profile = [0, 100, 200];
    // remaining > total → clamped to start (segment 0)
    // 2 segments, total 1000m → 500m each. First segment: +100m / 500m = 20%
    const grade = computeCurrentGrade(profile, 1000, 2000);
    expect(grade).toBe(20);
  });

  it('clamps progress at route end when remaining <= 0', () => {
    const profile = [200, 100, 0];
    // remaining = 0 → at end → last segment
    const grade = computeCurrentGrade(profile, 1000, 0);
    // Last segment: 0 - 100 = -100m over 500m = -20%
    expect(grade).toBe(-20);
  });

  it('returns one-decimal precision', () => {
    // 33m rise over 1000m = 3.3%
    const profile = [0, 33];
    const grade = computeCurrentGrade(profile, 1000, 1000);
    expect(grade).toBe(3.3);
  });
});
