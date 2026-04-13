/**
 * Regression tests for navigation fixes (2026-04-13 session).
 *
 * Covers three fixes:
 *   1. Remaining distance/ETA off-by-one (missing currentStep.distanceMeters)
 *   2. Remaining climb/descent: `!0` falsy check + static vs live descent
 *   3. computeRemainingDescent symmetry with computeRemainingClimb
 *
 * Each section stress-tests edge cases the original bugs would fail.
 */
import { describe, expect, it } from 'vitest';

import {
  computeRemainingClimb,
  computeRemainingDescent,
  createNavigationSession,
  encodePolyline,
  getNavigationProgress,
} from './index';

// ---------------------------------------------------------------------------
// Helper: build a straight east-west route with evenly spaced polyline points
// ---------------------------------------------------------------------------

const BASE_LAT = 44.4300;
const LON_STEP = 0.0010; // ~80m at this latitude

/** Create a polyline with `n` points heading east from a base longitude. */
const buildEastPolyline = (n: number, baseLon = 26.1000) =>
  Array.from({ length: n }, (_, i) => [baseLon + i * LON_STEP, BASE_LAT] as [number, number]);

/** Shorthand route builder for navigation tests. */
const buildRoute = (opts: {
  id: string;
  polyline: [number, number][];
  steps: Array<{
    id: string;
    distanceMeters: number;
    durationSeconds: number;
    maneuverLon: number;
    type?: string;
    modifier?: string;
  }>;
  totalDistance?: number;
  totalDuration?: number;
  elevationProfile?: number[];
}) => ({
  id: opts.id,
  source: 'custom_osrm' as const,
  routingEngineVersion: 'v1',
  routingProfileVersion: 'v1',
  mapDataVersion: 'v1',
  riskModelVersion: 'v1',
  geometryPolyline6: encodePolyline(opts.polyline),
  distanceMeters: opts.totalDistance ?? opts.steps.reduce((s, st) => s + st.distanceMeters, 0),
  durationSeconds: opts.totalDuration ?? opts.steps.reduce((s, st) => s + st.durationSeconds, 0),
  adjustedDurationSeconds: opts.totalDuration ?? opts.steps.reduce((s, st) => s + st.durationSeconds, 0),
  totalClimbMeters: 0,
  elevationProfile: opts.elevationProfile,
  riskSegments: [],
  warnings: [],
  steps: opts.steps.map((s) => ({
    id: s.id,
    instruction: s.type === 'arrive' ? 'Arrive' : `Step ${s.id}`,
    streetName: 'Test Street',
    distanceMeters: s.distanceMeters,
    durationSeconds: s.durationSeconds,
    maneuver: {
      bearing_after: s.type === 'arrive' ? 0 : 90,
      bearing_before: 90,
      location: [s.maneuverLon, BASE_LAT] as [number, number],
      type: s.type ?? 'new name',
      ...(s.modifier ? { modifier: s.modifier } : {}),
    },
    mode: 'cycling',
  })),
});

// ============================================================================
// FIX 1: Remaining distance/ETA includes currentStep.distanceMeters
// ============================================================================

describe('remaining distance includes current step distance', () => {
  // 5-step route: depart(100m) → turn(200m) → turn(150m) → turn(50m) → arrive(0m)
  // Total = 500m
  const polyline = buildEastPolyline(11); // 11 points, ~80m apart
  const route = buildRoute({
    id: 'five-step',
    polyline,
    steps: [
      { id: 's0', distanceMeters: 100, durationSeconds: 30, maneuverLon: 26.1000, type: 'depart' },
      { id: 's1', distanceMeters: 200, durationSeconds: 60, maneuverLon: 26.1010 },
      { id: 's2', distanceMeters: 150, durationSeconds: 45, maneuverLon: 26.1030 },
      { id: 's3', distanceMeters: 50,  durationSeconds: 15, maneuverLon: 26.1060 },
      { id: 's4', distanceMeters: 0,   durationSeconds: 0,  maneuverLon: 26.1100, type: 'arrive' },
    ],
  });

  it('at the start of the route, remaining ≈ total route distance', () => {
    // After depart step auto-advances, currentStepIndex = 1.
    // User at origin → remaining should be close to 500m.
    const session = { ...createNavigationSession(route.id), currentStepIndex: 1 };
    const progress = getNavigationProgress(route, session, { lat: BASE_LAT, lon: 26.1000 });

    // Must be at least: distToManeuver + step1(200) + step2(150) + step3(50) + step4(0) = distToManeuver + 400
    expect(progress.remainingDistanceMeters).toBeGreaterThan(400);
  });

  it('mid-route, remaining includes all downstream step distances', () => {
    // User between step 1 and step 2 maneuvers, currentStepIndex = 2
    const session = { ...createNavigationSession(route.id), currentStepIndex: 2 };
    const progress = getNavigationProgress(route, session, { lat: BASE_LAT, lon: 26.1020 });

    // distToManeuver(s2 at 26.1030) + s2.distance(150) + s3(50) + s4(0)
    expect(progress.remainingDistanceMeters).toBeGreaterThan(150 + 50);
    // Must include s2's 150m — old buggy code would give only distToManeuver + 50
    expect(progress.remainingDistanceMeters).toBeGreaterThan(
      progress.distanceToManeuverMeters! + 150,
    );
  });

  it('on the last real step, remaining = distToManeuver + step distance', () => {
    // currentStepIndex = 3, approaching step 3's maneuver, then just the arrive
    const session = { ...createNavigationSession(route.id), currentStepIndex: 3 };
    const progress = getNavigationProgress(route, session, { lat: BASE_LAT, lon: 26.1050 });

    // remaining = distToManeuver(to s3) + s3.distance(50) + s4(0)
    expect(progress.remainingDistanceMeters).toBeGreaterThanOrEqual(
      progress.distanceToManeuverMeters! + 50 - 5,
    );
  });

  it('remaining distance never exceeds route total by more than GPS tolerance', () => {
    const session = { ...createNavigationSession(route.id), currentStepIndex: 1 };
    const progress = getNavigationProgress(route, session, { lat: BASE_LAT, lon: 26.1000 });

    // Allow some tolerance for GPS snap to a slightly earlier polyline point
    expect(progress.remainingDistanceMeters).toBeLessThanOrEqual(route.distanceMeters + 100);
  });

  it('remaining duration includes time for current step', () => {
    // User at start, currentStepIndex = 1
    const session = { ...createNavigationSession(route.id), currentStepIndex: 1 };
    const progress = getNavigationProgress(route, session, { lat: BASE_LAT, lon: 26.1000 });

    // Duration must include s1(60) + s2(45) + s3(15) + s4(0) = 120s
    // Plus time-to-maneuver estimate based on s0's pace
    expect(progress.remainingDurationSeconds).toBeGreaterThanOrEqual(120);
  });

  it('remaining duration estimate uses previous step pace for pre-maneuver portion', () => {
    // currentStepIndex = 2 (approaching step 2), prevStep = step 1 (200m, 60s → 3.33 m/s)
    const session = { ...createNavigationSession(route.id), currentStepIndex: 2 };
    const progress = getNavigationProgress(route, session, { lat: BASE_LAT, lon: 26.1020 });

    // Current step duration (45) + future steps (15) = 60s minimum
    // Plus time to maneuver from previous step's pace
    expect(progress.remainingDurationSeconds).toBeGreaterThanOrEqual(60);
    // Should NOT exceed total route duration
    expect(progress.remainingDurationSeconds).toBeLessThanOrEqual(
      route.durationSeconds + 30, // tolerance
    );
  });

  it('walk-through: remaining decreases at every waypoint along the route', () => {
    // Simulate the rider moving east using exact polyline point positions
    // (avoids lateral offset exceeding the 30m hasPassedCurrentManeuver guard).
    // Use currentStepIndex = 0 — the function auto-recalculates via
    // hasPassedCurrentManeuver since the user is exactly on the route.
    const positions = [26.1000, 26.1010, 26.1030, 26.1060];

    let prevRemaining = Infinity;
    for (const lon of positions) {
      const session = { ...createNavigationSession(route.id), currentStepIndex: 0 };
      const p = getNavigationProgress(route, session, { lat: BASE_LAT, lon });

      expect(p.remainingDistanceMeters).toBeLessThan(prevRemaining);
      prevRemaining = p.remainingDistanceMeters;
    }
  });

  it('step advance from second-to-last to last does not jump remaining upward', () => {
    // Use a simple 3-step route where step distances match the polyline geometry.
    // 3 points ~80m apart → 2 segments of ~80m each.
    const simplePolyline = buildEastPolyline(3);
    const simpleRoute = buildRoute({
      id: 'advance-test',
      polyline: simplePolyline,
      steps: [
        { id: 'a0', distanceMeters: 80, durationSeconds: 24, maneuverLon: 26.1000, type: 'depart' },
        { id: 'a1', distanceMeters: 80, durationSeconds: 24, maneuverLon: 26.1010 },
        { id: 'a2', distanceMeters: 0, durationSeconds: 0, maneuverLon: 26.1020, type: 'arrive' },
      ],
    });

    // Before advance: approaching step a1's maneuver, session at step 1
    const beforeSession = { ...createNavigationSession(simpleRoute.id), currentStepIndex: 1 };
    const beforeP = getNavigationProgress(simpleRoute, beforeSession, {
      lat: BASE_LAT, lon: 26.10095, // just before step a1 maneuver at 26.1010
    });

    // After advance: approaching arrive step, session at step 2
    const afterSession = { ...createNavigationSession(simpleRoute.id), currentStepIndex: 2 };
    const afterP = getNavigationProgress(simpleRoute, afterSession, {
      lat: BASE_LAT, lon: 26.10105, // just past step a1 maneuver
    });

    expect(afterP.remainingDistanceMeters).toBeLessThanOrEqual(
      beforeP.remainingDistanceMeters + 10, // GPS snap tolerance
    );
  });
});

// ============================================================================
// FIX 1 EDGE CASES: Single-step route, 2-step route, arrive with distance
// ============================================================================

describe('remaining distance edge cases', () => {
  it('2-step route (depart + arrive): remaining = distance to destination', () => {
    const polyline = buildEastPolyline(3);
    const route = buildRoute({
      id: 'two-step',
      polyline,
      steps: [
        { id: 's0', distanceMeters: 160, durationSeconds: 60, maneuverLon: 26.1000, type: 'depart' },
        { id: 's1', distanceMeters: 0, durationSeconds: 0, maneuverLon: 26.1020, type: 'arrive' },
      ],
    });

    // After depart advances, currentStepIndex = 1 (arrive)
    const session = { ...createNavigationSession(route.id), currentStepIndex: 1 };
    const progress = getNavigationProgress(route, session, { lat: BASE_LAT, lon: 26.1005 });

    // remaining = distToDestination + arrive.distance(0) = ~120m
    expect(progress.remainingDistanceMeters).toBeGreaterThan(50);
    expect(progress.remainingDistanceMeters).toBeLessThan(200);
  });

  it('depart step (index 0) at origin: remaining ≈ total', () => {
    const polyline = buildEastPolyline(5);
    const route = buildRoute({
      id: 'at-depart',
      polyline,
      steps: [
        { id: 's0', distanceMeters: 160, durationSeconds: 60, maneuverLon: 26.1000, type: 'depart' },
        { id: 's1', distanceMeters: 160, durationSeconds: 60, maneuverLon: 26.1020 },
        { id: 's2', distanceMeters: 0, durationSeconds: 0, maneuverLon: 26.1040, type: 'arrive' },
      ],
    });

    // At origin, step 0 auto-advances. But let's test with step 0 explicitly.
    const session = { ...createNavigationSession(route.id), currentStepIndex: 0 };
    const progress = getNavigationProgress(route, session, { lat: BASE_LAT, lon: 26.1000 });

    // At origin with step 0, user is AT the depart maneuver.
    // arrivedAtManeuver = true, shouldAdvanceStep = true.
    // remaining = 0 (distToManeuver) + s0(160) + s1(160) + s2(0) = 320m
    expect(progress.remainingDistanceMeters).toBeGreaterThanOrEqual(300);
  });

  it('arrival at final destination: remaining forced to 0', () => {
    const polyline = buildEastPolyline(3);
    const route = buildRoute({
      id: 'at-dest',
      polyline,
      steps: [
        { id: 's0', distanceMeters: 160, durationSeconds: 60, maneuverLon: 26.1000, type: 'depart' },
        { id: 's1', distanceMeters: 0, durationSeconds: 0, maneuverLon: 26.1020, type: 'arrive' },
      ],
    });

    const session = { ...createNavigationSession(route.id), currentStepIndex: 1 };
    const progress = getNavigationProgress(route, session, { lat: BASE_LAT, lon: 26.1020 });

    expect(progress.shouldCompleteNavigation).toBe(true);
    expect(progress.remainingDistanceMeters).toBe(0);
    expect(progress.remainingDurationSeconds).toBe(0);
  });

  it('empty polyline returns route-level defaults safely', () => {
    const route = buildRoute({
      id: 'empty-polyline',
      polyline: [],
      steps: [
        { id: 's0', distanceMeters: 500, durationSeconds: 120, maneuverLon: 26.1000, type: 'depart' },
        { id: 's1', distanceMeters: 0, durationSeconds: 0, maneuverLon: 26.1050, type: 'arrive' },
      ],
      totalDistance: 500,
      totalDuration: 120,
    });

    const session = createNavigationSession(route.id);
    const progress = getNavigationProgress(route, session, { lat: BASE_LAT, lon: 26.1000 });

    expect(progress.remainingDistanceMeters).toBe(500);
    expect(progress.remainingDurationSeconds).toBe(120);
    expect(progress.isOffRoute).toBe(true);
  });
});

// ============================================================================
// FIX 2 + 3: computeRemainingClimb / computeRemainingDescent edge cases
// ============================================================================

describe('climb/descent calculation edge cases', () => {
  it('climb and descent sum to gross totals from a mixed profile', () => {
    // Profile: 100 → 150(+50) → 120(-30) → 180(+60) → 130(-50)
    // Total climb = 50 + 60 = 110, total descent = 30 + 50 = 80
    const profile = [100, 150, 120, 180, 130];
    const totalDist = 1000;

    const climb = computeRemainingClimb(profile, totalDist, totalDist);
    const descent = computeRemainingDescent(profile, totalDist, totalDist);

    expect(climb).toBe(110);
    expect(descent).toBe(80);
  });

  it('climb + descent at midpoint are consistent partials', () => {
    const profile = [100, 150, 120, 180, 130];
    const totalDist = 1000;

    // At 50% progress, startIndex = floor(0.5 * 4) = 2 → profile[2]=120
    // Remaining: 120→180(+60), 180→130(-50)
    const climb = computeRemainingClimb(profile, totalDist, 500);
    const descent = computeRemainingDescent(profile, totalDist, 500);

    expect(climb).toBe(60);
    expect(descent).toBe(50);
  });

  it('climb decreases as progress increases (monotonically non-increasing)', () => {
    const profile = [100, 120, 115, 130, 125, 140]; // mixed climb/descent
    const totalDist = 1000;

    let prevClimb = Infinity;
    for (let remaining = totalDist; remaining >= 0; remaining -= 100) {
      const c = computeRemainingClimb(profile, totalDist, remaining);
      expect(c).toBeLessThanOrEqual(prevClimb);
      prevClimb = c;
    }
  });

  it('descent decreases as progress increases (monotonically non-increasing)', () => {
    const profile = [140, 120, 130, 110, 115, 100]; // mixed
    const totalDist = 1000;

    let prevDescent = Infinity;
    for (let remaining = totalDist; remaining >= 0; remaining -= 100) {
      const d = computeRemainingDescent(profile, totalDist, remaining);
      expect(d).toBeLessThanOrEqual(prevDescent);
      prevDescent = d;
    }
  });

  it('remaining = 0 gives 0 climb and 0 descent', () => {
    const profile = [100, 200, 50, 150];
    expect(computeRemainingClimb(profile, 1000, 0)).toBe(0);
    expect(computeRemainingDescent(profile, 1000, 0)).toBe(0);
  });

  it('remaining slightly above 0 gives small values', () => {
    const profile = [100, 200, 150]; // last segment: 200→150 = -50 descent
    // remaining = 1 → progress = 1 - 1/1000 = 0.999 → startIndex = floor(0.999*2) = 1
    // From index 1: 200→150 = 50m descent, 0 climb
    const climb = computeRemainingClimb(profile, 1000, 1);
    const descent = computeRemainingDescent(profile, 1000, 1);
    expect(climb).toBe(0);
    expect(descent).toBe(50);
  });

  it('handles a flat profile (all same elevation)', () => {
    const profile = [100, 100, 100, 100];
    expect(computeRemainingClimb(profile, 1000, 1000)).toBe(0);
    expect(computeRemainingDescent(profile, 1000, 1000)).toBe(0);
    expect(computeRemainingClimb(profile, 1000, 500)).toBe(0);
    expect(computeRemainingDescent(profile, 1000, 500)).toBe(0);
  });

  it('handles very large profile (100 points)', () => {
    // Sine wave: alternating climb and descent
    const profile = Array.from({ length: 100 }, (_, i) => 100 + 50 * Math.sin(i * 0.2));
    const totalDist = 10000;

    const fullClimb = computeRemainingClimb(profile, totalDist, totalDist);
    const fullDescent = computeRemainingDescent(profile, totalDist, totalDist);

    expect(fullClimb).toBeGreaterThan(0);
    expect(fullDescent).toBeGreaterThan(0);

    // Halfway should have roughly half
    const halfClimb = computeRemainingClimb(profile, totalDist, totalDist / 2);
    expect(halfClimb).toBeLessThan(fullClimb);
    expect(halfClimb).toBeGreaterThan(0);
  });

  it('negative remaining (GPS overshoot) clamps to full climb/descent', () => {
    const profile = [100, 150, 120]; // climb=50, descent=30
    expect(computeRemainingClimb(profile, 500, 600)).toBe(50); // remaining > total
    expect(computeRemainingDescent(profile, 500, 600)).toBe(30);
  });
});

// ============================================================================
// INTEGRATION: remaining distance feeds into computeRemainingClimb correctly
// ============================================================================

describe('navigation progress feeds correct remaining into climb calculation', () => {
  it('climb computed from live remaining distance matches profile segment', () => {
    // Route with elevation: 100m → 150m → 120m → 180m
    // 4 polyline points, 3 segments
    const polyline = buildEastPolyline(4);
    const elevationProfile = [100, 150, 120, 180];
    const route = buildRoute({
      id: 'climb-integration',
      polyline,
      elevationProfile,
      steps: [
        { id: 's0', distanceMeters: 80, durationSeconds: 30, maneuverLon: 26.1000, type: 'depart' },
        { id: 's1', distanceMeters: 80, durationSeconds: 30, maneuverLon: 26.1010 },
        { id: 's2', distanceMeters: 0, durationSeconds: 0, maneuverLon: 26.1030, type: 'arrive' },
      ],
    });

    // User at start, approaching step 1
    const session = { ...createNavigationSession(route.id), currentStepIndex: 1 };
    const progress = getNavigationProgress(route, session, { lat: BASE_LAT, lon: 26.1000 });

    // Use the live remaining distance to compute climb
    const climb = computeRemainingClimb(
      elevationProfile,
      route.distanceMeters,
      progress.remainingDistanceMeters,
    );

    // Full profile climb = (150-100) + (180-120) = 50+60 = 110
    // User is near start → climb should be close to full
    expect(climb).toBeGreaterThanOrEqual(80); // at least most of the total
    expect(climb).toBeLessThanOrEqual(110);
  });
});

// ============================================================================
// INTEGRATION: simulate a full ride from start to destination
// ============================================================================

describe('full ride simulation: remaining distance + climb + descent', () => {
  it('remaining distance, climb, and descent all reach 0 at destination', () => {
    const polyline = buildEastPolyline(6);
    const elevationProfile = [100, 130, 120, 150, 140, 110]; // mixed climbing
    const route = buildRoute({
      id: 'full-ride',
      polyline,
      elevationProfile,
      steps: [
        { id: 's0', distanceMeters: 80, durationSeconds: 24, maneuverLon: 26.1000, type: 'depart' },
        { id: 's1', distanceMeters: 80, durationSeconds: 24, maneuverLon: 26.1010 },
        { id: 's2', distanceMeters: 80, durationSeconds: 24, maneuverLon: 26.1020 },
        { id: 's3', distanceMeters: 80, durationSeconds: 24, maneuverLon: 26.1030 },
        { id: 's4', distanceMeters: 0, durationSeconds: 0, maneuverLon: 26.1050, type: 'arrive' },
      ],
    });

    // Simulate advancing through each step
    const positions = [26.1000, 26.1010, 26.1020, 26.1030, 26.1050];
    const stepIndices = [1, 2, 3, 4, 4]; // after auto-advancing from depart

    for (let i = 0; i < positions.length; i++) {
      const session = { ...createNavigationSession(route.id), currentStepIndex: stepIndices[i] };
      const progress = getNavigationProgress(route, session, {
        lat: BASE_LAT, lon: positions[i],
      });

      const climb = computeRemainingClimb(
        elevationProfile,
        route.distanceMeters,
        progress.remainingDistanceMeters,
      );
      const descent = computeRemainingDescent(
        elevationProfile,
        route.distanceMeters,
        progress.remainingDistanceMeters,
      );

      // All values must be non-negative
      expect(progress.remainingDistanceMeters).toBeGreaterThanOrEqual(0);
      expect(progress.remainingDurationSeconds).toBeGreaterThanOrEqual(0);
      expect(climb).toBeGreaterThanOrEqual(0);
      expect(descent).toBeGreaterThanOrEqual(0);
    }

    // At destination (last position)
    const finalSession = { ...createNavigationSession(route.id), currentStepIndex: 4 };
    const finalP = getNavigationProgress(route, finalSession, {
      lat: BASE_LAT, lon: 26.1050,
    });

    expect(finalP.remainingDistanceMeters).toBe(0);
    expect(finalP.remainingDurationSeconds).toBe(0);
    expect(computeRemainingClimb(elevationProfile, route.distanceMeters, 0)).toBe(0);
    expect(computeRemainingDescent(elevationProfile, route.distanceMeters, 0)).toBe(0);
  });
});
