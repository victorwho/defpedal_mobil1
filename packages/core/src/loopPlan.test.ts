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
  headingAppliesAt,
  headingArcFor,
  highRiskMeters,
  initialRingRadiusMeters,
  isDegenerateLoop,
  isOutAndBack,
  LOOP_CANDIDATE_COUNT,
  LOOP_DISTANCE_STEPS_METERS,
  LOOP_HEADINGS,
  LOOP_RELAXATION_LADDER,
  loopBearings,
  loopRoundness,
  matchesTerrain,
  nextRelaxation,
  nextRingRadiusMeters,
  normalizeBearing,
  rankCandidates,
  RING_PERIMETER_FACTOR,
  SCENIC_LAMBDA,
  SCENIC_SAFETY_TOLERANCE_METERS,
  RING_WAYPOINT_CHOICES,
  RING_WAYPOINT_COUNT,
  ringPerimeterFactor,
  ringWaypointCountFor,
  ringWaypoints,
  scoredMeters,
  terrainAppliesAt,
  terrainDistance,
  excludesUnpaved,
  MAX_RETRACE_SHARE,
  retraceAppliesAt,
  withinRetraceCap,
  prefersUnpaved,
  retracedMeters,
  retracedShare,
  ringRetracedShare,
  splitStemAndRing,
  lollipopWaypoints,
  DEFAULT_STEM_FRACTION,
  RETRACE_RANKING_DEADBAND,
  unpavedMeters,
  unpavedShare,
  usesFlatProfile,
  withinDistanceTolerance,
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
  const leg = (classes: string[], distance: number[]) => ({
    annotation: { classes, distance },
  });

  it('sums the metres on unpaved edges', () => {
    const result = unpavedMeters([
      leg(['unpaved', 'tunnel', 'unpaved'], [100, 50, 150]),
    ]);
    expect(result.unpavedMeters).toBe(250);
    expect(result.classifiedMeters).toBe(300);
  });

  it('reports the share of what it could classify', () => {
    expect(unpavedShare([leg(['unpaved', 'x'], [250, 750])])).toBeCloseTo(0.25);
  });

  it('accepts several classes on one edge', () => {
    // OSRM may report one class or several; the shipped tunnel reader assumes
    // a plain string, so both shapes have to work.
    expect(unpavedShare([leg(['unpaved,bridge'], [100])])).toBe(1);
  });

  it('returns zero rather than NaN when nothing can be classified', () => {
    expect(unpavedShare([])).toBe(0);
    expect(unpavedShare([{ annotation: { distance: [100] } }])).toBe(0);
    expect(unpavedShare([{}])).toBe(0);
  });

  it('does not count an edge whose length is missing', () => {
    expect(unpavedMeters([leg(['unpaved', 'unpaved'], [100])]).unpavedMeters).toBe(100);
  });

  it('never reports a share above 1', () => {
    expect(unpavedShare([leg(['unpaved'], [500])])).toBe(1);
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
    expect(MAX_RETRACE_SHARE).toBe(0.1);
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
        candidate({ id: 'there-and-back', retracedShare: 0.5 }),
        candidate({ id: 'clean', retracedShare: 0.0 }),
      ],
      req,
    );
    expect(ranked[0]!.id).toBe('clean');
  });

  it('outranks distance accuracy', () => {
    // Coming back a different way is what makes a loop a loop.
    const ranked = rankCandidates(
      [
        candidate({ id: 'exact-but-doubles', distanceMeters: 15_000, retracedShare: 0.4 }),
        candidate({ id: 'loose-but-clean', distanceMeters: 16_400, retracedShare: 0 }),
      ],
      req,
    );
    expect(ranked[0]!.id).toBe('loose-but-clean');
  });

  it('still ranks below safety', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'clean-but-busy', retracedShare: 0, highRiskMeters: 3_000 }),
        candidate({ id: 'quiet-but-doubles', retracedShare: 0.5, highRiskMeters: 0 }),
      ],
      req,
    );
    expect(ranked[0]!.id).toBe('quiet-but-doubles');
  });

  it('outranks the offroad preference', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'gravel-but-doubles', unpavedShare: 0.9, retracedShare: 0.5 }),
        candidate({ id: 'tarmac-but-clean', unpavedShare: 0, retracedShare: 0 }),
      ],
      { ...req, surface: 'offroad' },
    );
    expect(ranked[0]!.id).toBe('tarmac-but-clean');
  });

  it('ignores overlaps inside the deadband', () => {
    // Sharing the starting junction is normal and must not reorder anything.
    const ranked = rankCandidates(
      [
        candidate({ id: 'near', retracedShare: 0.02, distanceMeters: 15_100 }),
        candidate({ id: 'far', retracedShare: 0.0, distanceMeters: 17_000 }),
      ],
      req,
    );
    expect(ranked[0]!.id).toBe('near');
    expect(RETRACE_RANKING_DEADBAND).toBeGreaterThan(0.02);
  });
});

describe('the doubling-back cap', () => {
  // The cap tests the RING figure, with any deliberate stem excluded.
  const at = (share: number) =>
    candidate({ retracedShare: share, ringRetracedShare: share });

  it('accepts a loop at or under a tenth', () => {
    expect(withinRetraceCap(at(0), 'none')).toBe(true);
    expect(withinRetraceCap(at(0.1), 'none')).toBe(true);
  });

  it('rejects a loop over a tenth', () => {
    expect(withinRetraceCap(at(0.11), 'none')).toBe(false);
    expect(withinRetraceCap(at(0.5), 'none')).toBe(false);
  });

  it('keeps enforcing through every earlier rung', () => {
    // The cap outlives heading, distance AND terrain — a loop that repeats a
    // third of itself is worse than the wrong terrain.
    for (const rung of ['none', 'heading', 'distance', 'terrain'] as const) {
      expect(retraceAppliesAt(rung)).toBe(true);
      expect(withinRetraceCap(at(0.4), rung)).toBe(false);
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
    expect(withinRetraceCap({ ringRetracedShare: 0.2 }, 'none')).toBe(false);
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

  it('finds no stem on a plain loop', () => {
    const r = splitStemAndRing([leg([1, 2, 3, 4, 1])]);
    expect(r.stemMeters).toBe(0);
    expect(r.ringMeters).toBe(400);
  });

  it('separates an out-and-back stem from the loop at the end', () => {
    // 1-2 out, ring 2-3-4-2, then 2-1 home: one stem edge each way.
    const r = splitStemAndRing([leg([1, 2, 3, 4, 2, 1])]);
    expect(r.stemMeters).toBe(200);
    expect(r.ringMeters).toBe(300);
  });

  it('exempts the stem so a lollipop can pass the cap', () => {
    // Without the exemption this reads 2/5 = 40% and is rejected outright.
    const legs = [leg([1, 2, 3, 4, 2, 1])];
    expect(retracedShare(legs)).toBeCloseTo(0.4, 5);
    expect(ringRetracedShare(legs)).toBe(0);
    expect(withinRetraceCap({ ringRetracedShare: ringRetracedShare(legs) }, 'none')).toBe(true);
  });

  it('still catches doubling back INSIDE the ring', () => {
    // Stem 1-2, then a spur 3-9-3 within the ring.
    const legs = [leg([1, 2, 3, 9, 3, 4, 2, 1])];
    const r = splitStemAndRing(legs);
    expect(r.stemMeters).toBe(200);
    expect(ringRetracedShare(legs)).toBeGreaterThan(0);
  });

  it('fails a pure out-and-back, which has no ring at all', () => {
    const legs = [leg([1, 2, 3, 2, 1])];
    expect(ringRetracedShare(legs)).toBe(1);
    expect(withinRetraceCap({ ringRetracedShare: 1 }, 'none')).toBe(false);
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
  it('centres the ring away from the start', () => {
    const wps = lollipopWaypoints(BUCHAREST, 90, 30_000);
    const distances = wps.map((w) =>
      haversineDistance([BUCHAREST.lat, BUCHAREST.lon], [w.lat, w.lon]),
    );
    // Every ring point is out along the bearing, not around the start.
    expect(Math.min(...distances)).toBeGreaterThan(0);
    const east = wps.filter((w) => w.lon > BUCHAREST.lon);
    expect(east.length).toBeGreaterThan(0);
  });

  it('spends the stem budget getting there, out and back', () => {
    const target = 30_000;
    const wps = lollipopWaypoints(BUCHAREST, 0, target, 3, 0.4);
    // Centre sits at half the stem budget; ring points straddle it.
    const mean =
      wps.reduce(
        (sum, w) => sum + haversineDistance([BUCHAREST.lat, BUCHAREST.lon], [w.lat, w.lon]),
        0,
      ) / wps.length;
    expect(mean).toBeGreaterThan(1_000);
    expect(mean).toBeLessThan(target);
  });

  it('builds the requested ring shape', () => {
    expect(lollipopWaypoints(BUCHAREST, 0, 30_000, 6)).toHaveLength(6);
  });

  it('clamps an absurd stem fraction rather than inverting the ring', () => {
    expect(() => lollipopWaypoints(BUCHAREST, 0, 30_000, 3, 5)).not.toThrow();
    expect(() => lollipopWaypoints(BUCHAREST, 0, 30_000, 3, -1)).not.toThrow();
  });

  it('leaves most of the ride as actual loop by default', () => {
    expect(DEFAULT_STEM_FRACTION).toBeLessThan(0.5);
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
