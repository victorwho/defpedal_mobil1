import { describe, expect, it } from 'vitest';

import type { Coordinate, RiskSegment } from './contracts';
import { destinationPoint, haversineDistance } from './distance';
import {
  classifyTerrain,
  climbPerKilometre,
  DEFAULT_DETOUR_FACTOR,
  DISTANCE_TOLERANCE_RELAXED,
  DISTANCE_TOLERANCE_STRICT,
  distanceError,
  distanceToleranceFor,
  excludesUnpaved,
  headingAppliesAt,
  headingArcFor,
  highRiskMeters,
  initialRingRadiusMeters,
  isDegenerateLoop,
  isOutAndBack,
  isRingOutAndBack,
  LOLLIPOP_STEM_LEGS,
  lollipopWaypoints,
  LOOP_CANDIDATE_COUNT,
  LOOP_DISTANCE_STEPS_METERS,
  LOOP_HEADINGS,
  LOOP_RELAXATION_LADDER,
  loopBearings,
  loopRoundness,
  matchesTerrain,
  MAX_LOOP_ROUNDNESS,
  MAX_RETRACE_SHARE,
  MAX_RING_CLEARANCE_METERS,
  MAX_SPUR_SHARE,
  MIN_RING_CLEARANCE_METERS,
  MIN_SPUR_METERS,
  nextRelaxation,
  nextRingRadiusMeters,
  normalizeBearing,
  prefersUnpaved,
  rankCandidates,
  RETRACE_CEILING,
  RETRACE_RANKING_DEADBAND,
  retraceAppliesAt,
  retracedMeters,
  retracedShare,
  RING_PERIMETER_FACTOR,
  RING_WAYPOINT_CHOICES,
  RING_WAYPOINT_COUNT,
  ringClearanceMeters,
  ringCoordinates,
  ringDetourFactor,
  ringPerimeterFactor,
  ringRetracedShare,
  ringRoundness,
  ringWaypointCountFor,
  ringWaypoints,
  SCENIC_LAMBDA,
  SCENIC_SAFETY_TOLERANCE_METERS,
  scoredMeters,
  splitStemAndRing,
  SPUR_RANKING_DEADBAND,
  spurMeters,
  spurShare,
  STEM_DETOUR_FACTOR,
  terrainAppliesAt,
  terrainDistance,
  unpavedMeters,
  unpavedShare,
  usesFlatProfile,
  withinDistanceTolerance,
  withinRetraceCap,
  withinRetraceCeiling,
  withinSpurCap,
  type AnnotatedLeg,
  type LoopCandidate,
} from './loopPlan';

const BUCHAREST: Coordinate = { lat: 44.4268, lon: 26.1025 };

const candidate = (over: Partial<LoopCandidate> = {}): LoopCandidate => ({
  id: 'c1',
  bearingDegrees: 90,
  distanceMeters: 15_000,
  climbMeters: 100,
  highRiskMeters: 0,
  unpavedShare: 0,
  retracedShare: 0,
  ringRetracedShare: 0,
  spurShare: 0,
  stemMeters: 0,
  scenicScore: 0,
  relaxation: 'none',
  ...over,
});

describe('ring radius', () => {
  it('sizes the first ring so the ideal triangle plus detour hits the target', () => {
    const radius = initialRingRadiusMeters(15_000);
    expect(radius * RING_PERIMETER_FACTOR * DEFAULT_DETOUR_FACTOR).toBeCloseTo(
      15_000,
      6,
    );
  });

  it('never returns a negative radius for a nonsense target', () => {
    expect(initialRingRadiusMeters(-5_000)).toBe(0);
  });

  it('falls back to the default when handed a zero detour factor', () => {
    expect(initialRingRadiusMeters(15_000, RING_WAYPOINT_COUNT, 0)).toBe(
      initialRingRadiusMeters(15_000),
    );
  });

  it('grows the radius when the route came back short', () => {
    expect(nextRingRadiusMeters(1_000, 10_000, 15_000)).toBeGreaterThan(1_000);
  });

  it('shrinks the radius when the route came back long', () => {
    expect(nextRingRadiusMeters(1_000, 20_000, 15_000)).toBeLessThan(1_000);
  });

  it('damps the correction rather than applying it raw', () => {
    // Raw proportional would be 1000 * (15000/10000) = 1500.
    expect(nextRingRadiusMeters(1_000, 10_000, 15_000)).toBeLessThan(1_500);
  });

  it('converges towards the target over repeated corrections', () => {
    // A crude model: road distance is proportional to radius.
    const metresPerRadius = 6.4;
    let radius = initialRingRadiusMeters(20_000);
    for (let i = 0; i < 6; i += 1) {
      radius = nextRingRadiusMeters(radius, radius * metresPerRadius, 20_000);
    }
    expect(radius * metresPerRadius).toBeGreaterThan(19_000);
    expect(radius * metresPerRadius).toBeLessThan(21_000);
  });

  it('holds the radius when OSRM answers with a degenerate zero-distance route', () => {
    // Out-of-coverage requests return Ok with distance 0 rather than an error;
    // correcting off that number would send the radius to infinity.
    expect(nextRingRadiusMeters(1_000, 0, 15_000)).toBe(1_000);
    expect(nextRingRadiusMeters(1_000, -1, 15_000)).toBe(1_000);
  });
});

describe('ringWaypoints', () => {
  it('places every waypoint at the requested radius from the start', () => {
    const points = ringWaypoints(BUCHAREST, 2_000, 90);
    for (const point of points) {
      const away = haversineDistance(
        [BUCHAREST.lat, BUCHAREST.lon],
        [point.lat, point.lon],
      );
      expect(away).toBeGreaterThan(1_990);
      expect(away).toBeLessThan(2_010);
    }
  });

  it('sets off in the requested direction', () => {
    const [first] = ringWaypoints(BUCHAREST, 2_000, 90);
    // Due east: latitude barely moves, longitude increases.
    expect(first!.lon).toBeGreaterThan(BUCHAREST.lon);
    expect(Math.abs(first!.lat - BUCHAREST.lat)).toBeLessThan(0.001);
  });

  it('spaces three waypoints evenly around the circle', () => {
    const points = ringWaypoints(BUCHAREST, 3_000, 0);
    expect(points).toHaveLength(3);
    const legs = [
      haversineDistance(
        [points[0]!.lat, points[0]!.lon],
        [points[1]!.lat, points[1]!.lon],
      ),
      haversineDistance(
        [points[1]!.lat, points[1]!.lon],
        [points[2]!.lat, points[2]!.lon],
      ),
      haversineDistance(
        [points[2]!.lat, points[2]!.lon],
        [points[0]!.lat, points[0]!.lon],
      ),
    ];
    // Equilateral: side = r * sqrt(3).
    for (const leg of legs) {
      expect(leg).toBeGreaterThan(3_000 * Math.sqrt(3) * 0.98);
      expect(leg).toBeLessThan(3_000 * Math.sqrt(3) * 1.02);
    }
  });
});

describe('destinationPoint', () => {
  it('round-trips against haversineDistance', () => {
    const point = destinationPoint(BUCHAREST, 217, 5_000);
    expect(
      haversineDistance([BUCHAREST.lat, BUCHAREST.lon], [point.lat, point.lon]),
    ).toBeCloseTo(5_000, 0);
  });

  it('keeps longitude inside [-180, 180] across the antimeridian', () => {
    const point = destinationPoint({ lat: 66, lon: 179.9 }, 90, 50_000);
    expect(point.lon).toBeGreaterThanOrEqual(-180);
    expect(point.lon).toBeLessThanOrEqual(180);
  });
});

describe('loopBearings', () => {
  it('spreads "any" evenly over the full circle', () => {
    const bearings = loopBearings('any', 8);
    expect(bearings).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  });

  it('centres a named heading on its compass bearing', () => {
    const bearings = loopBearings('E', 8, 25);
    const mean =
      bearings.reduce((sum, bearing) => sum + bearing, 0) / bearings.length;
    expect(mean).toBeCloseTo(90, 5);
  });

  it('samples the extremes of the arc, not just the middle', () => {
    const bearings = loopBearings('E', 8, 25);
    expect(Math.min(...bearings)).toBeCloseTo(65, 5);
    expect(Math.max(...bearings)).toBeCloseTo(115, 5);
  });

  it('wraps north without producing negative bearings', () => {
    const bearings = loopBearings('N', 8, 25);
    for (const bearing of bearings) {
      expect(bearing).toBeGreaterThanOrEqual(0);
      expect(bearing).toBeLessThan(360);
    }
  });

  it('returns the exact compass bearing when only one candidate is asked for', () => {
    expect(loopBearings('SW', 1)).toEqual([225]);
  });

  it('produces a bearing for every heading in the vocabulary', () => {
    for (const heading of LOOP_HEADINGS) {
      expect(loopBearings(heading, LOOP_CANDIDATE_COUNT)).toHaveLength(
        LOOP_CANDIDATE_COUNT,
      );
    }
  });
});

describe('normalizeBearing', () => {
  it('folds negatives and overflow into [0, 360)', () => {
    expect(normalizeBearing(-10)).toBe(350);
    expect(normalizeBearing(370)).toBe(10);
    expect(normalizeBearing(360)).toBe(0);
  });
});

describe('terrain', () => {
  it('reads a nearly level loop as flat', () => {
    expect(classifyTerrain(45, 24_000)).toBe('flat');
  });

  it('reads a moderately lumpy loop as rolling', () => {
    expect(classifyTerrain(210, 23_600)).toBe('rolling');
  });

  it('reads a genuinely climbing loop as hilly', () => {
    expect(classifyTerrain(480, 25_000)).toBe('hilly');
  });

  it('does not divide by zero on an empty route', () => {
    expect(climbPerKilometre(100, 0)).toBe(0);
    expect(classifyTerrain(100, 0)).toBe('flat');
  });

  it('routes only flat through the flat OSRM instance', () => {
    // The asymmetry that makes Flat a constraint and Hilly a ranking.
    expect(usesFlatProfile('flat')).toBe(true);
    expect(usesFlatProfile('rolling')).toBe(false);
    expect(usesFlatProfile('hilly')).toBe(false);
  });

  it('measures how far a result is from the terrain asked for', () => {
    expect(terrainDistance('flat', 'flat')).toBe(0);
    expect(terrainDistance('flat', 'rolling')).toBe(1);
    expect(terrainDistance('flat', 'hilly')).toBe(2);
  });

  it('never matches a terrain when the climb was not measured', () => {
    expect(matchesTerrain({ climbMeters: null, distanceMeters: 15_000 }, 'flat')).toBe(
      false,
    );
  });
});

describe('relaxation ladder', () => {
  it('gives up heading, then distance, then terrain, then the retrace cap', () => {
    // The cap is last on purpose: a loop that repeats a third of itself is a
    // worse answer than the wrong terrain.
    expect(LOOP_RELAXATION_LADDER).toEqual([
      'none',
      'heading',
      'distance',
      'terrain',
      'retrace',
    ]);
  });

  it('walks one rung at a time and stops at the end', () => {
    expect(nextRelaxation('none')).toBe('heading');
    expect(nextRelaxation('heading')).toBe('distance');
    expect(nextRelaxation('distance')).toBe('terrain');
    expect(nextRelaxation('terrain')).toBe('retrace');
    expect(nextRelaxation('retrace')).toBeNull();
  });

  it('widens the distance tolerance only once distance is the rung being given up', () => {
    expect(distanceToleranceFor('none')).toBe(DISTANCE_TOLERANCE_STRICT);
    expect(distanceToleranceFor('heading')).toBe(DISTANCE_TOLERANCE_STRICT);
    expect(distanceToleranceFor('distance')).toBe(DISTANCE_TOLERANCE_RELAXED);
    expect(distanceToleranceFor('terrain')).toBe(DISTANCE_TOLERANCE_RELAXED);
  });

  it('widens the heading arc as soon as heading is relaxed', () => {
    expect(headingArcFor('heading')).toBeGreaterThan(headingArcFor('none'));
  });

  it('keeps applying the heading until the ladder moves past it', () => {
    expect(headingAppliesAt('none')).toBe(true);
    expect(headingAppliesAt('heading')).toBe(true);
    expect(headingAppliesAt('distance')).toBe(false);
  });

  it('keeps the terrain filter until the last rung', () => {
    expect(terrainAppliesAt('none')).toBe(true);
    expect(terrainAppliesAt('distance')).toBe(true);
    expect(terrainAppliesAt('terrain')).toBe(false);
  });
});

describe('distance tolerance', () => {
  it('measures error as a fraction of the target', () => {
    expect(distanceError({ distanceMeters: 16_500 }, 15_000)).toBeCloseTo(0.1);
  });

  it('accepts a result inside the strict band and rejects one outside it', () => {
    expect(
      withinDistanceTolerance({ distanceMeters: 16_500 }, 15_000, 'none'),
    ).toBe(true);
    expect(
      withinDistanceTolerance({ distanceMeters: 18_000 }, 15_000, 'none'),
    ).toBe(false);
  });

  it('accepts the same result once distance has been relaxed', () => {
    expect(
      withinDistanceTolerance({ distanceMeters: 18_000 }, 15_000, 'distance'),
    ).toBe(true);
  });

  it('treats a zero target as always satisfied rather than dividing by zero', () => {
    expect(distanceError({ distanceMeters: 100 }, 0)).toBe(0);
  });
});

describe('rankCandidates', () => {
  const request = { targetDistanceMeters: 15_000, terrain: 'hilly' as const };

  it('puts the loop with less busy-road exposure first', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'busy', highRiskMeters: 2_000 }),
        candidate({ id: 'quiet', highRiskMeters: 100 }),
      ],
      request,
    );
    expect(ranked[0]!.id).toBe('quiet');
  });

  it('breaks a safety tie on distance accuracy', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'far', distanceMeters: 17_000 }),
        candidate({ id: 'near', distanceMeters: 15_200 }),
      ],
      request,
    );
    expect(ranked[0]!.id).toBe('near');
  });

  it('breaks a distance tie on terrain match', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'flat', climbMeters: 30 }),
        candidate({ id: 'hilly', climbMeters: 400 }),
      ],
      request,
    );
    expect(ranked[0]!.id).toBe('hilly');
  });

  it('does not demote a candidate whose climb was never measured', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'flat', climbMeters: 30 }),
        candidate({ id: 'unmeasured', climbMeters: null }),
      ],
      request,
    );
    expect(ranked[0]!.id).toBe('unmeasured');
  });

  it('prefers safety over an exact distance match', () => {
    // Safety leads the sort even on a purely recreational ride.
    const ranked = rankCandidates(
      [
        candidate({ id: 'exact-but-busy', distanceMeters: 15_000, highRiskMeters: 3_000 }),
        candidate({ id: 'loose-but-quiet', distanceMeters: 16_400, highRiskMeters: 0 }),
      ],
      request,
    );
    expect(ranked[0]!.id).toBe('loose-but-quiet');
  });

  it('does not mutate the input array', () => {
    const input = [
      candidate({ id: 'a', highRiskMeters: 500 }),
      candidate({ id: 'b', highRiskMeters: 0 }),
    ];
    rankCandidates(input, request);
    expect(input.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('risk aggregation', () => {
  const segment = (category: string, coords: [number, number][]): RiskSegment => ({
    id: `s-${category}-${coords[0]![0]}`,
    riskScore: 50,
    riskCategory: category,
    color: '#000000',
    geometry: { type: 'LineString', coordinates: coords },
  });

  it('counts only the busy tier towards high-risk metres', () => {
    const segments = [
      segment('Safer', [
        [26.1, 44.43],
        [26.11, 44.43],
      ]),
      segment('High risk', [
        [26.11, 44.43],
        [26.12, 44.43],
      ]),
    ];
    const busy = highRiskMeters(segments);
    const total = scoredMeters(segments);
    expect(busy).toBeGreaterThan(0);
    expect(busy).toBeLessThan(total);
  });

  it('returns zero busy metres for a route with none', () => {
    expect(
      highRiskMeters([
        segment('Typical', [
          [26.1, 44.43],
          [26.11, 44.43],
        ]),
      ]),
    ).toBe(0);
  });

  it('returns zero for an unscored route rather than throwing', () => {
    expect(highRiskMeters([])).toBe(0);
    expect(scoredMeters([])).toBe(0);
  });
});

describe('degenerate loop rejection', () => {
  it('rejects a route that collapsed to nothing', () => {
    expect(isDegenerateLoop(0, 15_000)).toBe(true);
  });

  it('rejects a ring that partially collapsed', () => {
    // Looks like a valid short loop to every other check.
    expect(isDegenerateLoop(2_000, 15_000)).toBe(true);
  });

  it('keeps a loop that merely undershot the target', () => {
    expect(isDegenerateLoop(12_000, 15_000)).toBe(false);
  });

  it('does not reject anything when there is no target to compare against', () => {
    expect(isDegenerateLoop(500, 0)).toBe(false);
  });
});

describe('out-and-back detection', () => {
  /** Points evenly spaced on a circle of `radius` metres around `centre`. */
  const circle = (
    centre: Coordinate,
    radiusMeters: number,
    steps = 72,
  ): [number, number][] =>
    Array.from({ length: steps }, (_, i) => {
      const point = destinationPoint(centre, (360 / steps) * i, radiusMeters);
      return [point.lon, point.lat] as [number, number];
    });

  it('scores a true circle at about 1', () => {
    const radius = 2_000;
    const circumference = 2 * Math.PI * radius;
    expect(
      loopRoundness(BUCHAREST, circle(BUCHAREST, radius), circumference),
    ).toBeCloseTo(1, 1);
  });

  it('accepts a circular loop', () => {
    const radius = 2_000;
    expect(
      isOutAndBack(BUCHAREST, circle(BUCHAREST, radius), 2 * Math.PI * radius),
    ).toBe(false);
  });

  it('rejects a there-and-back that closes perfectly but is not a loop', () => {
    const far = destinationPoint(BUCHAREST, 90, 7_000);
    const out: [number, number][] = Array.from({ length: 20 }, (_, i) => {
      const point = destinationPoint(BUCHAREST, 90, (7_000 / 19) * i);
      return [point.lon, point.lat];
    });
    const there = [...out, [far.lon, far.lat] as [number, number], ...out.reverse()];
    expect(isOutAndBack(BUCHAREST, there, 14_000)).toBe(true);
  });

  it('tolerates a lobed city loop that is nowhere near circular', () => {
    // Squashed ellipse: twice as long east-west as north-south.
    const points: [number, number][] = Array.from({ length: 72 }, (_, i) => {
      const angle = (360 / 72) * i;
      const radius = 2_000 * (1 + 0.45 * Math.cos((angle * Math.PI) / 180));
      const point = destinationPoint(BUCHAREST, angle, radius);
      return [point.lon, point.lat];
    });
    expect(isOutAndBack(BUCHAREST, points, 2 * Math.PI * 2_000)).toBe(false);
  });

  it('returns zero roundness rather than dividing by zero', () => {
    expect(loopRoundness(BUCHAREST, [], 15_000)).toBe(0);
    expect(loopRoundness(BUCHAREST, [[26.1, 44.43]], 0)).toBe(0);
  });
});

describe('distance steps', () => {
  it('are strictly ascending so the picker cannot render out of order', () => {
    for (let i = 1; i < LOOP_DISTANCE_STEPS_METERS.length; i += 1) {
      expect(LOOP_DISTANCE_STEPS_METERS[i]!).toBeGreaterThan(
        LOOP_DISTANCE_STEPS_METERS[i - 1]!,
      );
    }
  });

  it('are spaced wider than the strict tolerance, so no two steps overlap', () => {
    // Offering a finer step than the generator can resolve invites every
    // result to read as a near miss.
    for (let i = 1; i < LOOP_DISTANCE_STEPS_METERS.length; i += 1) {
      const previous = LOOP_DISTANCE_STEPS_METERS[i - 1]!;
      const gap = LOOP_DISTANCE_STEPS_METERS[i]! - previous;
      expect(gap).toBeGreaterThan(previous * DISTANCE_TOLERANCE_STRICT);
    }
  });
});

describe('surface appetite', () => {
  it('forbids unpaved only for paved-only', () => {
    expect(excludesUnpaved('paved')).toBe(true);
    expect(excludesUnpaved('any')).toBe(false);
    // Offroad must NOT exclude — that would forbid the thing it is asking for.
    expect(excludesUnpaved('offroad')).toBe(false);
  });

  it('ranks by unpaved share only when offroad is asked for', () => {
    expect(prefersUnpaved('offroad')).toBe(true);
    expect(prefersUnpaved('any')).toBe(false);
    expect(prefersUnpaved('paved')).toBe(false);
  });
});

describe('unpaved measurement', () => {
  /**
   * A leg in the shape OSRM actually returns: classes on
   * `steps[].intersections[].classes`, never on the annotation.
   *
   * The tests this replaces built `annotation.classes` fixtures and asserted
   * the parse. The parse was right; the ADDRESS was wrong, so they passed
   * while every route in the app reported 100% paved.
   */
  const leg = (steps: { meters: number; classes?: string[] }[]) => ({
    steps: steps.map((step) => ({
      distance: step.meters,
      intersections: [
        {
          location: [26, 44] as [number, number],
          ...(step.classes ? { classes: step.classes } : {}),
        },
      ],
    })),
  });

  it('sums the metres on unpaved steps', () => {
    const result = unpavedMeters([
      leg([
        { meters: 100, classes: ['unpaved'] },
        { meters: 50, classes: ['tunnel'] },
        { meters: 150, classes: ['unpaved'] },
      ]),
    ]);
    expect(result.unpavedMeters).toBe(250);
    expect(result.classifiedMeters).toBe(300);
  });

  it('reports the share of what it could classify', () => {
    expect(
      unpavedShare([
        leg([
          { meters: 250, classes: ['unpaved'] },
          { meters: 750, classes: ['x'] },
        ]),
      ]),
    ).toBeCloseTo(0.25);
  });

  it('accepts several classes on one intersection', () => {
    expect(
      unpavedShare([leg([{ meters: 100, classes: ['unpaved', 'bridge'] }])]),
    ).toBe(1);
  });

  it('returns zero rather than NaN when nothing can be classified', () => {
    expect(unpavedShare([])).toBe(0);
    expect(unpavedShare([{ steps: [{ distance: 100 }] }])).toBe(0);
    expect(unpavedShare([{}])).toBe(0);
  });

  it('REGRESSION: ignores annotation.classes, which OSRM never sends', () => {
    // A leg carrying the field the old readers expected, and nothing else.
    // It must report zero rather than appearing to work, so nobody restores
    // the wrong address and sees a plausible number.
    const wrongAddress = {
      annotation: { distance: [100, 100], nodes: [1, 2, 3] },
    } as never;
    expect(unpavedShare([wrongAddress])).toBe(0);
  });

  it('never reports a share above 1', () => {
    expect(unpavedShare([leg([{ meters: 500, classes: ['unpaved'] }])])).toBe(1);
  });
});

describe('ranking with an offroad preference', () => {
  const offroad = {
    targetDistanceMeters: 15_000,
    terrain: 'rolling' as const,
    surface: 'offroad' as const,
  };

  it('prefers the loop with more unpaved', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'tarmac', unpavedShare: 0.05 }),
        candidate({ id: 'gravel', unpavedShare: 0.6 }),
      ],
      offroad,
    );
    expect(ranked[0]!.id).toBe('gravel');
  });

  it('still puts safety first', () => {
    // A recreational preference must not override the thing the app is for.
    const ranked = rankCandidates(
      [
        candidate({ id: 'gravel-but-busy', unpavedShare: 0.9, highRiskMeters: 2_000 }),
        candidate({ id: 'quiet-tarmac', unpavedShare: 0.0, highRiskMeters: 0 }),
      ],
      offroad,
    );
    expect(ranked[0]!.id).toBe('quiet-tarmac');
  });

  it('ignores a difference of under a percentage point', () => {
    // Below that it is noise, and letting it decide would scramble distance.
    const ranked = rankCandidates(
      [
        candidate({ id: 'near', unpavedShare: 0.5, distanceMeters: 15_100 }),
        candidate({ id: 'far', unpavedShare: 0.505, distanceMeters: 17_000 }),
      ],
      offroad,
    );
    expect(ranked[0]!.id).toBe('near');
  });

  it('does not reorder when the rider did not ask for offroad', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'near', unpavedShare: 0, distanceMeters: 15_100 }),
        candidate({ id: 'far', unpavedShare: 0.9, distanceMeters: 17_000 }),
      ],
      { targetDistanceMeters: 15_000, terrain: 'rolling', surface: 'any' },
    );
    expect(ranked[0]!.id).toBe('near');
  });

  it('does not reorder when no surface is supplied at all', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'near', unpavedShare: 0, distanceMeters: 15_100 }),
        candidate({ id: 'far', unpavedShare: 0.9, distanceMeters: 17_000 }),
      ],
      { targetDistanceMeters: 15_000, terrain: 'rolling' },
    );
    expect(ranked[0]!.id).toBe('near');
  });
});

describe('doubling back', () => {
  /** A leg from a node path, with every edge the same length. */
  const leg = (nodes: number[], edgeMeters = 100) => ({
    annotation: {
      nodes,
      distance: new Array(Math.max(0, nodes.length - 1)).fill(edgeMeters),
    },
  });

  it('reports nothing for a clean loop', () => {
    // 1-2-3-4-1: every edge distinct.
    expect(retracedShare([leg([1, 2, 3, 4, 1])])).toBe(0);
  });

  it('reports a there-and-back as fully retraced', () => {
    // 1-2-3-2-1: every edge ridden twice.
    expect(retracedShare([leg([1, 2, 3, 2, 1])])).toBe(1);
  });

  it('counts both passes of a spur, not just the second', () => {
    // Loop 1-2-3-4-1 with a spur out to 9 and back: 4 clean edges, 2 retraced.
    const share = retracedShare([leg([1, 2, 9, 2, 3, 4, 1])]);
    expect(share).toBeCloseTo(2 / 6, 5);
  });

  it('ignores direction — up and back down one road is one edge', () => {
    // The node pair is reversed on the return, and must still match.
    const { retracedMeters: retraced } = retracedMeters([leg([5, 7, 5])]);
    expect(retraced).toBe(200);
  });

  it('accumulates across the legs of a waypoint ring', () => {
    // A ring is four legs; node ids are global, so a stretch shared between
    // two legs still counts.
    expect(retracedShare([leg([1, 2]), leg([2, 1])])).toBe(1);
  });

  it('returns zero rather than penalising a route it cannot measure', () => {
    expect(retracedShare([])).toBe(0);
    expect(retracedShare([{}])).toBe(0);
    expect(retracedShare([{ annotation: { nodes: [1, 2] } }])).toBe(0);
    expect(retracedShare([{ annotation: { distance: [100] } }])).toBe(0);
  });

  it('skips edges with no length rather than counting them as retraced', () => {
    const result = retracedMeters([
      { annotation: { nodes: [1, 2, 1], distance: [0, 0] } },
    ]);
    expect(result.retracedMeters).toBe(0);
    expect(result.totalMeters).toBe(0);
  });

  it('caps a loop at a tenth of itself repeated', () => {
    // Measured, not chosen for strictness: at a tenth exactly one of 40
    // candidates passed against the live router, so the filter never bound
    // and the note fired on nearly every loop.
    expect(MAX_RETRACE_SHARE).toBe(0.35);
  });
});

describe('ranking by doubling back', () => {
  const req = {
    targetDistanceMeters: 15_000,
    terrain: 'rolling' as const,
    surface: 'any' as const,
  };

  it('prefers the loop that comes back a different way', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'there-and-back', retracedShare: 0.5, ringRetracedShare: 0.5 }),
        candidate({ id: 'clean', retracedShare: 0.0, ringRetracedShare: 0.0 }),
      ],
      req,
    );
    expect(ranked[0]!.id).toBe('clean');
  });

  it('outranks distance accuracy', () => {
    // Coming back a different way is what makes a loop a loop.
    const ranked = rankCandidates(
      [
        candidate({ id: 'exact-but-doubles', distanceMeters: 15_000, retracedShare: 0.4, ringRetracedShare: 0.4 }),
        candidate({ id: 'loose-but-clean', distanceMeters: 16_400, retracedShare: 0, ringRetracedShare: 0 }),
      ],
      req,
    );
    expect(ranked[0]!.id).toBe('loose-but-clean');
  });

  it('still ranks below safety', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'clean-but-busy', retracedShare: 0, ringRetracedShare: 0, highRiskMeters: 3_000 }),
        candidate({ id: 'quiet-but-doubles', retracedShare: 0.5, ringRetracedShare: 0.5, highRiskMeters: 0 }),
      ],
      req,
    );
    expect(ranked[0]!.id).toBe('quiet-but-doubles');
  });

  it('outranks the offroad preference', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'gravel-but-doubles', unpavedShare: 0.9, retracedShare: 0.5, ringRetracedShare: 0.5 }),
        candidate({ id: 'tarmac-but-clean', unpavedShare: 0, retracedShare: 0, ringRetracedShare: 0 }),
      ],
      { ...req, surface: 'offroad' },
    );
    expect(ranked[0]!.id).toBe('tarmac-but-clean');
  });

  it('ignores overlaps inside the deadband', () => {
    // Sharing the starting junction is normal and must not reorder anything.
    const ranked = rankCandidates(
      [
        candidate({ id: 'near', retracedShare: 0.02, ringRetracedShare: 0.02, distanceMeters: 15_100 }),
        candidate({ id: 'far', retracedShare: 0.0, ringRetracedShare: 0.0, distanceMeters: 17_000 }),
      ],
      req,
    );
    expect(ranked[0]!.id).toBe('near');
    expect(RETRACE_RANKING_DEADBAND).toBeGreaterThan(0.02);
  });

  it('does not bury a lollipop under every plain ring', () => {
    // The whole point of the stem exemption. A lollipop retraces its approach
    // by construction, so on the whole-route figure it loses this comparison
    // outright — which is what shipped, and why riders asking to ride out of
    // town and loop there kept being handed a ring around their own street.
    const ranked = rankCandidates(
      [
        candidate({
          id: 'ring-round-the-houses',
          retracedShare: 0.05,
          ringRetracedShare: 0.05,
        }),
        candidate({
          id: 'lollipop-out-of-town',
          retracedShare: 0.45,
          ringRetracedShare: 0.01,
        }),
      ],
      req,
    );
    expect(ranked[0]!.id).toBe('lollipop-out-of-town');
  });
});

describe('the doubling-back cap', () => {
  // The cap tests the RING figure, with any deliberate stem excluded.
  const at = (share: number) =>
    candidate({ retracedShare: share, ringRetracedShare: share });

  it('accepts a loop at or under a tenth', () => {
    expect(withinRetraceCap(at(0), 'none')).toBe(true);
    expect(withinRetraceCap(at(0.35), 'none')).toBe(true);
    // A typical clean loop out of a dense grid, which used to be rejected.
    expect(withinRetraceCap(at(0.2), 'none')).toBe(true);
  });

  it('rejects a loop over a tenth', () => {
    expect(withinRetraceCap(at(0.36), 'none')).toBe(false);
    expect(withinRetraceCap(at(0.5), 'none')).toBe(false);
    // A pure out-and-back has no ring at all, so it scores 1 by construction
    // and cannot pass any threshold below it.
    expect(withinRetraceCap(at(1), 'none')).toBe(false);
  });

  it('keeps enforcing through every earlier rung', () => {
    // The cap outlives heading, distance AND terrain — a loop that repeats a
    // third of itself is worse than the wrong terrain.
    for (const rung of ['none', 'heading', 'distance', 'terrain'] as const) {
      expect(retraceAppliesAt(rung)).toBe(true);
      expect(withinRetraceCap(at(0.6), rung)).toBe(false);
    }
  });

  it('gives up only at the last rung', () => {
    expect(retraceAppliesAt('retrace')).toBe(false);
    expect(withinRetraceCap(at(0.4), 'retrace')).toBe(true);
  });

  it('passes a loop whose retracing could not be measured', () => {
    // retracedShare reads 0 when nodes are absent; rejecting on a guess would
    // discard a perfectly good loop.
    expect(withinRetraceCap(at(0), 'none')).toBe(true);
  });

  it('is the last rung of the ladder', () => {
    expect(LOOP_RELAXATION_LADDER[LOOP_RELAXATION_LADDER.length - 1]).toBe('retrace');
    expect(nextRelaxation('terrain')).toBe('retrace');
    expect(nextRelaxation('retrace')).toBeNull();
  });

  it('keeps the widened distance tolerance once past the distance rung', () => {
    expect(distanceToleranceFor('retrace')).toBe(DISTANCE_TOLERANCE_RELAXED);
  });

  it('stops filtering on terrain at the retrace rung too', () => {
    // By then terrain has already been given up; re-applying it would make the
    // last resort unreachable.
    expect(terrainAppliesAt('retrace')).toBe(false);
  });

  it('uses a deadband narrow enough to still rank inside the cap', () => {
    // With everything compressed into 0-10%, an 8-point deadband would have
    // swallowed nearly every real difference.
    expect(RETRACE_RANKING_DEADBAND).toBeLessThan(MAX_RETRACE_SHARE / 2);
  });

  it('still prefers the cleaner of two capped loops', () => {
    const ranked = rankCandidates(
      [at(0.09), { ...at(0.01), id: 'cleanest' }],
      { targetDistanceMeters: 15_000, terrain: 'rolling', surface: 'any' },
    );
    expect(ranked[0]!.id).toBe('cleanest');
  });
});

describe('the cap is defensive about unmeasurable loops', () => {
  it('passes a candidate whose share is missing entirely', () => {
    // `undefined <= 0.1` is false, which would silently fail EVERY candidate
    // and drive the ladder to its last resort on every search.
    const noShare = { ringRetracedShare: undefined as unknown as number };
    expect(withinRetraceCap(noShare, 'none')).toBe(true);
  });

  it('passes a candidate whose share is NaN', () => {
    expect(withinRetraceCap({ ringRetracedShare: Number.NaN }, 'none')).toBe(true);
  });

  it('still rejects a real measurement over the cap', () => {
    expect(withinRetraceCap({ ringRetracedShare: 0.5 }, 'none')).toBe(false);
  });
});

describe('ring shape sampling', () => {
  it('sizes a hexagon differently from a triangle', () => {
    // 2n*sin(pi/n): 5.196 for three points, 6.0 for six. Using the triangle
    // factor for a hexagon would size the ring wrong and come back long.
    expect(ringPerimeterFactor(3)).toBeCloseTo(3 * Math.sqrt(3), 6);
    expect(ringPerimeterFactor(6)).toBeCloseTo(6, 6);
    expect(ringPerimeterFactor(3)).toBeLessThan(ringPerimeterFactor(6));
  });

  it('approaches a circle as the ring gains points', () => {
    expect(ringPerimeterFactor(360)).toBeCloseTo(2 * Math.PI, 3);
  });

  it('never divides by a degenerate shape', () => {
    expect(ringPerimeterFactor(0)).toBeGreaterThan(0);
    expect(ringPerimeterFactor(1)).toBeGreaterThan(0);
    expect(ringPerimeterFactor(-5)).toBeGreaterThan(0);
  });

  it('gives a smaller radius for a rounder ring at the same target', () => {
    // A hexagon encloses more perimeter per unit radius, so it needs less.
    expect(initialRingRadiusMeters(15_000, 6)).toBeLessThan(
      initialRingRadiusMeters(15_000, 3),
    );
  });

  it('alternates shape across a batch', () => {
    // Neither 3 nor 6 wins everywhere — measured against live OSRM, a triangle
    // found three compliant loops in eight around Brasov and none around
    // Bucharest, while a hexagon did the opposite.
    expect(ringWaypointCountFor(0)).toBe(RING_WAYPOINT_CHOICES[0]);
    expect(ringWaypointCountFor(1)).toBe(RING_WAYPOINT_CHOICES[1]);
    expect(ringWaypointCountFor(2)).toBe(RING_WAYPOINT_CHOICES[0]);
  });

  it('handles a negative or fractional index without throwing', () => {
    expect(RING_WAYPOINT_CHOICES).toContain(ringWaypointCountFor(-1));
    expect(RING_WAYPOINT_CHOICES).toContain(ringWaypointCountFor(2.7));
  });

  it('builds the requested number of waypoints', () => {
    expect(ringWaypoints(BUCHAREST, 2_000, 0, 6)).toHaveLength(6);
    expect(ringWaypoints(BUCHAREST, 2_000, 0)).toHaveLength(RING_WAYPOINT_COUNT);
  });
});

describe('stem and ring', () => {
  const leg = (nodes: number[], m = 100) => ({
    annotation: { nodes, distance: new Array(Math.max(0, nodes.length - 1)).fill(m) },
  });

  // A lollipop is built with the anchor as a waypoint before and after the
  // ring, so it arrives as three legs: out, round, home.
  const lollipop = () => [leg([1, 2, 3]), leg([3, 4, 5, 3]), leg([3, 2, 1])];

  it('finds no stem on a plain loop', () => {
    const r = splitStemAndRing([leg([1, 2, 3, 4, 1])]);
    expect(r.stemMeters).toBe(0);
    expect(r.ringMeters).toBe(400);
  });

  it('takes the stem from the legs we asked for, not from the shape', () => {
    const r = splitStemAndRing(lollipop(), LOLLIPOP_STEM_LEGS);
    expect(r.stemMeters).toBe(400);
    expect(r.ringMeters).toBe(300);
  });

  it('exempts the stem so a lollipop can pass the cap', () => {
    const legs = lollipop();
    // The honest whole-route figure still shows the approach.
    expect(retracedShare(legs)).toBeCloseTo(0.571, 2);
    expect(ringRetracedShare(legs, LOLLIPOP_STEM_LEGS)).toBe(0);
    expect(
      withinRetraceCap(
        { ringRetracedShare: ringRetracedShare(legs, LOLLIPOP_STEM_LEGS) },
        'none',
      ),
    ).toBe(true);
  });

  it('REGRESSION: an approach on a different road home is still a stem', () => {
    // The detector this replaced matched a mirrored prefix of edges, which
    // assumed the way home reuses the way out. Live OSRM shares only about
    // half its edges between the two directions of a literal out-and-back, so
    // the mirror broke on the first edge and every lollipop measured a 0 m
    // stem — the exemption shipped, passed its tests, and never once fired.
    const asymmetric = [leg([1, 2, 3]), leg([3, 4, 5, 3]), leg([3, 7, 1])];
    const r = splitStemAndRing(asymmetric, LOLLIPOP_STEM_LEGS);
    expect(r.stemMeters).toBe(400);
    expect(r.ringMeters).toBe(300);
    expect(ringRetracedShare(asymmetric, LOLLIPOP_STEM_LEGS)).toBe(0);
  });

  it('still catches doubling back INSIDE the ring', () => {
    // A spur 4-9-4 within the ring: not the approach, so not exempt.
    const legs = [leg([1, 2, 3]), leg([3, 4, 9, 4, 5, 3]), leg([3, 2, 1])];
    const r = splitStemAndRing(legs, LOLLIPOP_STEM_LEGS);
    expect(r.stemMeters).toBe(400);
    expect(ringRetracedShare(legs, LOLLIPOP_STEM_LEGS)).toBeGreaterThan(0);
  });

  it('fails a pure out-and-back, which has no ring at all', () => {
    const legs = [leg([1, 2, 3]), leg([3, 2, 1])];
    // Two legs and a stem of one at each end leaves no middle: judged whole.
    expect(ringRetracedShare(legs, LOLLIPOP_STEM_LEGS)).toBe(1);
    expect(withinRetraceCap({ ringRetracedShare: 1 }, 'none')).toBe(false);
  });

  it('judges an unexpected shape whole rather than waving it through', () => {
    // Too few legs to hold a stem AND a ring: no silent exemption.
    const legs = [leg([1, 2, 3, 2, 1])];
    expect(splitStemAndRing(legs, LOLLIPOP_STEM_LEGS).stemMeters).toBe(0);
    expect(ringRetracedShare(legs, LOLLIPOP_STEM_LEGS)).toBe(1);
  });

  it('does not divide by zero on an empty route', () => {
    expect(splitStemAndRing([])).toEqual({
      stemMeters: 0,
      ringMeters: 0,
      ringRetracedMeters: 0,
    });
    expect(ringRetracedShare([])).toBe(1);
  });
});

describe('lollipopWaypoints', () => {
  it('anchors the ring so the router has to ride out to it', () => {
    const wps = lollipopWaypoints(BUCHAREST, 90, 30_000, 3);
    // First and last waypoint are the same anchor: that is what makes the
    // approach a leg boundary, and therefore exactly measurable.
    expect(wps[0]).toEqual(wps[wps.length - 1]);
    expect(wps).toHaveLength(3 + 2);
  });

  it('puts the ring out along the bearing, not around the start', () => {
    const wps = lollipopWaypoints(BUCHAREST, 90, 30_000);
    const away = wps.map((w) =>
      haversineDistance([BUCHAREST.lat, BUCHAREST.lon], [w.lat, w.lon]),
    );
    expect(Math.min(...away)).toBeGreaterThan(0);
    expect(wps.filter((w) => w.lon > BUCHAREST.lon).length).toBeGreaterThan(0);
  });

  it('clears the start by the clearance asked for', () => {
    // The near edge of the ring is what decides whether the loop happens out
    // of town or round the rider's own streets — the complaint that a fixed
    // stem fraction produced, because at a third of a 20 km ride the ring came
    // back to within 1.3 km of the start.
    const clearance = 3_000;
    const wps = lollipopWaypoints(BUCHAREST, 0, 30_000, 6, clearance);
    const ring = wps.slice(1, -1);
    const nearest = Math.min(
      ...ring.map((w) =>
        haversineDistance([BUCHAREST.lat, BUCHAREST.lon], [w.lat, w.lon]),
      ),
    );
    expect(nearest).toBeGreaterThan(clearance * 0.8);
  });

  it('builds the requested ring shape, plus the anchor at each end', () => {
    expect(lollipopWaypoints(BUCHAREST, 0, 30_000, 6)).toHaveLength(8);
  });

  it('clamps an absurd clearance rather than inverting the ring', () => {
    expect(() => lollipopWaypoints(BUCHAREST, 0, 30_000, 3, 500_000)).not.toThrow();
    expect(() => lollipopWaypoints(BUCHAREST, 0, 30_000, 3, -1)).not.toThrow();
    const wps = lollipopWaypoints(BUCHAREST, 0, 30_000, 3, 500_000);
    for (const w of wps) {
      expect(Number.isFinite(w.lat)).toBe(true);
      expect(Number.isFinite(w.lon)).toBe(true);
    }
  });

  it('scales clearance with the ride, within sane bounds', () => {
    expect(ringClearanceMeters(5_000)).toBe(MIN_RING_CLEARANCE_METERS);
    expect(ringClearanceMeters(500_000)).toBe(MAX_RING_CLEARANCE_METERS);
    expect(ringClearanceMeters(40_000)).toBeGreaterThan(MIN_RING_CLEARANCE_METERS);
    expect(ringClearanceMeters(40_000)).toBeLessThan(MAX_RING_CLEARANCE_METERS);
  });
});


describe('scenic ranking', () => {
  const req = {
    targetDistanceMeters: 15_000,
    terrain: 'rolling' as const,
    surface: 'any' as const,
  };

  it('prefers the more scenic of two equally safe, equally long loops', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'dull', scenicScore: -0.2 }),
        candidate({ id: 'pretty', scenicScore: 0.8 }),
      ],
      req,
    );
    expect(ranked[0]!.id).toBe('pretty');
  });

  it('NEVER prefers a prettier loop over a materially safer one', () => {
    // The whole safety argument. A gap wider than the tolerance is decided on
    // safety alone and scenic is not consulted at all.
    const ranked = rankCandidates(
      [
        candidate({ id: 'pretty-but-busy', scenicScore: 1, highRiskMeters: 2_000 }),
        candidate({ id: 'dull-but-quiet', scenicScore: -1, highRiskMeters: 0 }),
      ],
      req,
    );
    expect(ranked[0]!.id).toBe('dull-but-quiet');
  });

  it('only breaks ties inside the safety tolerance', () => {
    const withinTolerance = SCENIC_SAFETY_TOLERANCE_METERS - 1;
    const ranked = rankCandidates(
      [
        candidate({ id: 'slightly-busier-but-pretty', scenicScore: 1, highRiskMeters: withinTolerance }),
        candidate({ id: 'quieter-but-dull', scenicScore: -1, highRiskMeters: 0 }),
      ],
      req,
    );
    expect(ranked[0]!.id).toBe('slightly-busier-but-pretty');
  });

  it('does not let scenery outrank a large distance error', () => {
    // lambda * full scenic swing must be smaller than a gross length miss.
    const ranked = rankCandidates(
      [
        candidate({ id: 'pretty-but-wrong-length', scenicScore: 1, distanceMeters: 30_000 }),
        candidate({ id: 'right-length', scenicScore: -1, distanceMeters: 15_000 }),
      ],
      req,
    );
    expect(ranked[0]!.id).toBe('right-length');
  });

  it('leaves ordering untouched in an unscored area', () => {
    // Every candidate scores 0, so the result must match the pre-scenic order.
    const withScenic = rankCandidates(
      [
        candidate({ id: 'far', distanceMeters: 17_000 }),
        candidate({ id: 'near', distanceMeters: 15_100 }),
      ],
      req,
    );
    expect(withScenic[0]!.id).toBe('near');
  });

  it('keeps lambda small enough to stay a tie-breaker', () => {
    // A full -1..+1 scenic swing is worth 2*lambda of distance error, which
    // must stay under the RELAXED tolerance so scenery can never rescue a
    // grossly wrong length. It deliberately exceeds the STRICT tolerance:
    // a measured sweep showed anything smaller reorders nothing at all.
    expect(2 * SCENIC_LAMBDA).toBeLessThan(DISTANCE_TOLERANCE_RELAXED);
    expect(2 * SCENIC_LAMBDA).toBeGreaterThan(DISTANCE_TOLERANCE_STRICT);
    expect(SCENIC_SAFETY_TOLERANCE_METERS).toBeGreaterThan(0);
  });
});

describe('sizing model', () => {
  it('is shape-aware: a six-point ring detours more than a triangle', () => {
    // Measured, not assumed: 120 rings routed in five cities gave a median of
    // 2.11 for three points and 2.54 for six. More waypoints means more forced
    // turns, so one constant cannot serve both.
    expect(ringDetourFactor(3)).toBeCloseTo(2.11, 2);
    expect(ringDetourFactor(6)).toBeCloseTo(2.54, 2);
    expect(ringDetourFactor(6)).toBeGreaterThan(ringDetourFactor(3));
  });

  it('clamps a nonsense waypoint count instead of inverting the ring', () => {
    expect(ringDetourFactor(0)).toBeGreaterThan(1);
    expect(ringDetourFactor(100)).toBeLessThanOrEqual(3);
    expect(Number.isFinite(ringDetourFactor(-5))).toBe(true);
  });

  it('REGRESSION: predicts a ring close to the length asked for', () => {
    // The old factor was 1.25 against a measured 2.11, so every first attempt
    // came back about 86% too long. One damped correction only reached ~26%
    // off and the tolerance is 12%, so with a two-attempt budget almost no
    // candidate ever landed — the search relaxed its distance filter on
    // essentially every run.
    for (const count of [3, 6]) {
      const target = 30_000;
      const radius = initialRingRadiusMeters(target, count);
      const predicted = ringPerimeterFactor(count) * radius * ringDetourFactor(count);
      expect(Math.abs(predicted - target) / target).toBeLessThan(0.01);
    }
  });

  it('sizes a lollipop with the stem’s own detour, not the ring’s', () => {
    // A stem is a point-to-point ride that can take the direct road; a ring is
    // dragged through waypoints no single road serves. Measured 1.86 vs
    // 2.11/2.54. Using one factor for both skewed how far out the loop sits.
    expect(STEM_DETOUR_FACTOR).toBeLessThan(ringDetourFactor(3));
    const wps = lollipopWaypoints(BUCHAREST, 0, 30_000, 3, 3_000);
    expect(wps[0]).toEqual(wps[wps.length - 1]);
    for (const w of wps) {
      expect(Number.isFinite(w.lat)).toBe(true);
      expect(Number.isFinite(w.lon)).toBe(true);
    }
  });
});

describe('spurs versus a shared corridor', () => {
  const leg = (nodes: number[], m = 100) => ({
    annotation: { nodes, distance: new Array(Math.max(0, nodes.length - 1)).fill(m) },
  });

  it('finds an out-and-back detour hanging off the loop', () => {
    // Ride 1-2-3, turn round at 3, back to 2, then on round the loop. The
    // U-turn makes edge 2-3 appear twice in a row.
    const legs = [leg([1, 2, 3, 2, 4, 5, 6, 1], 300)];
    expect(spurMeters(legs)).toBeGreaterThan(0);
    expect(spurShare(legs)).toBeGreaterThan(0);
  });

  it('does NOT count the one road out of a valley as a detour', () => {
    // Leave on 1-2-3, loop round 3-4-5-6-3, come home on 3-2-1. Every edge of
    // the corridor is ridden twice — but at opposite ends of the ride, never
    // adjacent, so it is not a detour and still reads as a loop.
    const legs = [leg([1, 2, 3, 4, 5, 6, 3, 2, 1], 300)];
    expect(spurMeters(legs)).toBe(0);
    // The aggregate figure DOES see it, which is the whole point of having
    // both: they are different complaints.
    expect(retracedShare(legs)).toBeGreaterThan(0);
  });

  it('ignores a U-turn too short to be a detour', () => {
    // 40 m out and back at a junction is how roads work, not an excursion.
    const legs = [leg([1, 2, 3, 2, 4, 5, 1], 20)];
    expect(spurMeters(legs)).toBe(0);
    expect(MIN_SPUR_METERS).toBe(200);
  });

  it('measures the whole mirrored excursion, not just the turnaround', () => {
    // Out along 1-2-3-4, turn at 4, back 4-3-2-1: all four edges mirror.
    const legs = [leg([9, 1, 2, 3, 4, 3, 2, 1, 9], 400)];
    // Six mirrored edges at 400 m plus the pair either side.
    expect(spurMeters(legs)).toBeGreaterThan(1_500);
  });

  it('excludes a lollipop’s approach, like the retrace figures do', () => {
    const lollipop = [leg([1, 2, 3], 300), leg([3, 4, 5, 3], 300), leg([3, 2, 1], 300)];
    expect(spurMeters(lollipop, LOLLIPOP_STEM_LEGS)).toBe(0);
  });

  it('does not divide by zero on an empty route', () => {
    expect(spurMeters([])).toBe(0);
    expect(spurShare([])).toBe(0);
  });
});

describe('the spur cap', () => {
  const at = (share: number) => candidate({ spurShare: share });

  it('accepts a loop whose detours are negligible', () => {
    // Measured: loops that read as one ride cluster at 0.00-0.03.
    expect(withinSpurCap(at(0), 'none')).toBe(true);
    expect(withinSpurCap(at(0.03), 'none')).toBe(true);
    expect(withinSpurCap(at(MAX_SPUR_SHARE), 'none')).toBe(true);
  });

  it('rejects a loop that is a loop plus errands', () => {
    // Measured: 0.15-0.34 around Rasnov, with individual spurs of 4-7 km.
    expect(withinSpurCap(at(0.15), 'none')).toBe(false);
    expect(withinSpurCap(at(0.34), 'none')).toBe(false);
  });

  it('bends only at the last rung, like the doubling-back cap', () => {
    expect(withinSpurCap(at(0.5), 'retrace')).toBe(true);
    expect(withinSpurCap(at(0.5), 'terrain')).toBe(false);
  });

  it('passes an unmeasurable loop rather than guessing against it', () => {
    expect(withinSpurCap({ spurShare: Number.NaN }, 'none')).toBe(true);
  });
});

describe('ranking prefers one ride over a ride plus errands', () => {
  const req = { targetDistanceMeters: 15_000, terrain: 'rolling' as const };

  it('puts a spur-free loop above one with detours, even if it repeats more', () => {
    // The two are different complaints. A loop that repeats a third of itself
    // on the one road out of a valley still reads as a loop; one with two
    // kilometres of spur does not, whatever its aggregate says.
    const ranked = rankCandidates(
      [
        candidate({ id: 'detours', spurShare: 0.15, ringRetracedShare: 0.15 }),
        candidate({ id: 'one-ride', spurShare: 0.0, ringRetracedShare: 0.3 }),
      ],
      req,
    );
    expect(ranked[0]!.id).toBe('one-ride');
  });

  it('still ranks below safety', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'clean-but-busy', spurShare: 0, highRiskMeters: 3_000 }),
        candidate({ id: 'quiet-with-spur', spurShare: 0.2, highRiskMeters: 0 }),
      ],
      req,
    );
    expect(ranked[0]!.id).toBe('quiet-with-spur');
  });
});

// ---------------------------------------------------------------------------
// The out-and-back guard, scoped to the loop
// ---------------------------------------------------------------------------

/**
 * Build a leg whose annotation AGREES with its geometry.
 *
 * Edge lengths are derived from the points rather than invented, then scaled by
 * a detour factor, because that is what a road is: a longer path between the
 * same two points. Inventing the two independently is how a synthetic fixture
 * ends up measuring something production never sees — an earlier version of
 * these tests set a per-edge length by hand and produced a "lobed city loop"
 * scoring 6.2, which is not a shape any router returns.
 *
 * 2.11 is the measured ring detour against the live safety profile. It matters
 * here rather than being cosmetic: `loopRoundness` divides by the ROAD
 * distance, so the detour is most of what separates a real loop from the
 * geometric ideal. A circle through its own start scores 2.0 with no detour at
 * all and 0.95 with this one, and only the second is a number the threshold
 * was calibrated against.
 */
const legFrom = (
  nodes: number[],
  points: [number, number][],
  detour = 2.11,
): AnnotatedLeg => {
  const distance: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const [lon0, lat0] = points[i - 1]!;
    const [lon1, lat1] = points[i]!;
    distance.push(haversineDistance([lat0, lon0], [lat1, lon1]) * detour);
  }
  return {
    annotation: { nodes, distance },
    steps: [{ geometry: { coordinates: points } }],
  };
};

describe('ringCoordinates', () => {
  it('returns the whole route when there is no stem', () => {
    const legs = [
      legFrom([1, 2], [[0, 0], [0, 0.01]]),
      legFrom([2, 3], [[0, 0.01], [0.01, 0.01]]),
    ];
    expect(ringCoordinates(legs, 0)).toHaveLength(4);
  });

  it('drops one leg at EACH end for a lollipop', () => {
    const legs = [
      legFrom([1, 2], [[0, 0], [0, 0.01]]),
      legFrom([2, 3], [[0, 0.01], [0.01, 0.01]]),
      legFrom([3, 4], [[0.01, 0.01], [0.01, 0]]),
      legFrom([4, 1], [[0.01, 0], [0, 0]]),
    ];
    expect(ringCoordinates(legs, 1)).toEqual([
      [0, 0.01],
      [0.01, 0.01],
      [0.01, 0.01],
      [0.01, 0],
    ]);
  });

  it('treats a route with too few legs to split as all ring', () => {
    // Rather than waving an unexpected shape through, judge it on its whole
    // self. Same rule `splitStemAndRing` follows.
    const legs = [legFrom([1, 2], [[0, 0], [0, 0.01]])];
    expect(ringCoordinates(legs, 1)).toHaveLength(2);
  });

  it('returns nothing when the steps carry no geometry', () => {
    expect(
      ringCoordinates([{ annotation: { nodes: [1, 2], distance: [10] } }], 0),
    ).toEqual([]);
  });
});

describe('ringRoundness', () => {
  const square: [number, number][] = [
    [0, 0],
    [0, 0.02],
    [0.02, 0.02],
    [0.02, 0],
    [0, 0],
  ];

  it('matches the whole-route measurement when there is no stem', () => {
    // A plain ring must not move. With `stemLegs` 0 the ring IS the route, and
    // the only difference is that the reference point is read from the
    // geometry rather than passed in. Across 300 live candidates that flipped
    // no verdict.
    const legs = [legFrom([1, 2, 3, 4, 5], square)];
    const roadMeters = legs[0]!.annotation!.distance!.reduce((a, b) => a + b, 0);
    expect(ringRoundness(legs, 0)).toBeCloseTo(
      loopRoundness({ lat: 0, lon: 0 }, square, roadMeters),
      6,
    );
  });

  it('ignores the ride out, which is what a lollipop is made of', () => {
    // A long stem due north, a small loop at the top, then the stem home.
    // Measured whole, the excursion is dominated by the approach; measured on
    // the ring, it is just a loop.
    const legs = [
      legFrom([1, 2], [[0, 0], [0, 0.09]], 1.86),
      legFrom(
        [2, 3, 4, 5, 2],
        [
          [0, 0.09],
          [0.005, 0.095],
          [0, 0.1],
          [-0.005, 0.095],
          [0, 0.09],
        ],
      ),
      legFrom([2, 1], [[0, 0.09], [0, 0]], 1.86),
    ];

    const whole = ringRoundness(legs, 0);
    const scoped = ringRoundness(legs, 1);

    // 1.59 whole against 1.05 on the ring: the approach inflates the figure by
    // about half again, and that inflation is the defect the scope change
    // removes. Against the live router the same effect measured 1.23 whole
    // versus 0.82 scoped as medians over 150 real lollipops.
    expect(whole).toBeCloseTo(1.59, 1);
    expect(scoped).toBeCloseTo(1.05, 1);
    expect(whole).toBeGreaterThan(scoped);
    expect(scoped).toBeLessThan(MAX_LOOP_ROUNDNESS);
  });

  it('passes an unmeasurable route rather than rejecting it on a guess', () => {
    expect(ringRoundness([], 0)).toBe(0);
    expect(ringRoundness([{ annotation: { nodes: [1, 2], distance: [5] } }], 0)).toBe(0);
  });

  it('leaves a zero-length ring to the retrace measurement', () => {
    // Two checks answering the same question differently is how a route slips
    // between them, so this one declines and `ringRetracedShare` reports 1.
    const legs = [
      legFrom([1, 2], [[0, 0], [0, 0.01]], 0),
      legFrom([2, 3], [[0, 0.01], [0, 0.02]], 0),
      legFrom([3, 4], [[0, 0.02], [0, 0.01]], 0),
      legFrom([4, 1], [[0, 0.01], [0, 0]], 0),
    ];
    expect(ringRoundness(legs, 1)).toBe(0);
    expect(ringRetracedShare(legs, 1)).toBe(1);
  });
});

describe('isRingOutAndBack', () => {
  it('rejects a straight ride out and straight back', () => {
    // Out and back along the same line reaches half its own length from the
    // start, which is pi times the radius of a circle that long. Independent
    // of scale, so this is the one absolute the shape guarantees.
    const line: [number, number][] = [
      [0, 0],
      [0, 0.05],
      [0, 0.1],
      [0, 0.05],
      [0, 0],
    ];
    const legs = [legFrom([1, 2, 3, 2, 1], line, 1)];
    expect(ringRoundness(legs, 0)).toBeCloseTo(Math.PI, 1);
    expect(isRingOutAndBack(legs, 0)).toBe(true);
  });

  it('accepts a loop whose road distance carries a real detour', () => {
    // The threshold was calibrated against road distances, not geometric ones,
    // and the difference is the whole reason a real ring scores 0.41 to 1.20
    // where the same shape with no detour would score about 2.
    const square: [number, number][] = [
      [0, 0],
      [0, 0.02],
      [0.02, 0.02],
      [0.02, 0],
      [0, 0],
    ];
    const legs = [legFrom([1, 2, 3, 4, 1], square)];
    expect(isRingOutAndBack(legs, 0)).toBe(false);
  });

  it('accepts a lollipop that the whole-route measurement would reject', () => {
    // The defect, in one assertion. Same route, two scopes, opposite answers.
    const legs = [
      legFrom([1, 2], [[0, 0], [0, 0.09]], 1.4),
      legFrom(
        [2, 3, 4, 5, 2],
        [
          [0, 0.09],
          [0.005, 0.095],
          [0, 0.1],
          [-0.005, 0.095],
          [0, 0.09],
        ],
      ),
      legFrom([2, 1], [[0, 0.09], [0, 0]], 1.4),
    ];
    expect(ringRoundness(legs, 0)).toBeGreaterThan(MAX_LOOP_ROUNDNESS);
    expect(isRingOutAndBack(legs, 1)).toBe(false);
  });
});

describe('the never-relaxed doubling-back ceiling', () => {
  it('sits above the relaxable cap, in the gap the measurement found', () => {
    // 300 real candidates across five cities: the share tails off smoothly
    // with one visible gap, 0.893 to 0.930, and 30 sit at exactly 1.0.
    expect(RETRACE_CEILING).toBeGreaterThan(0.893);
    expect(RETRACE_CEILING).toBeLessThan(0.93);
    expect(RETRACE_CEILING).toBeGreaterThan(MAX_RETRACE_SHARE);
  });

  it('refuses a route that repeats effectively all of itself', () => {
    expect(withinRetraceCeiling({ ringRetracedShare: 1 })).toBe(false);
    expect(withinRetraceCeiling({ ringRetracedShare: 0.95 })).toBe(false);
  });

  it('allows everything the ordinary cap already governs', () => {
    // This is what makes the ceiling free. Every share above MAX_RETRACE_SHARE
    // already fails `withinRetraceCap` at every rung except the last, so the
    // ceiling can only ever change the answer where nothing else was looking.
    for (const share of [0, 0.1, MAX_RETRACE_SHARE, 0.5, 0.7, 0.89]) {
      expect(withinRetraceCeiling({ ringRetracedShare: share })).toBe(true);
    }
  });

  it('takes no relaxation argument, because no rung changes the answer', () => {
    // The shape of the function IS the promise. If a relaxation parameter ever
    // appears here, the ceiling has quietly become another cap.
    expect(withinRetraceCeiling).toHaveLength(1);
  });

  it('passes an unmeasurable share, like every other cap here', () => {
    expect(withinRetraceCeiling({ ringRetracedShare: NaN })).toBe(true);
    expect(
      withinRetraceCeiling({ ringRetracedShare: undefined as unknown as number }),
    ).toBe(true);
  });
});
