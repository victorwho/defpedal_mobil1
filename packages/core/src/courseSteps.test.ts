import { describe, expect, it } from 'vitest';

import {
  bearingDegrees,
  buildCourseSteps,
  classifyTurnModifier,
  courseDistanceMeters,
  detectCourseManeuvers,
  isCourseRoute,
  normalizeBearingDelta,
  DEFAULT_COURSE_SPEED_MPS,
} from './courseSteps';

// ---------------------------------------------------------------------------
// Fixture helpers — build synthetic tracks in meters so the intent is legible.
// ---------------------------------------------------------------------------

const ORIGIN_LON = 26.1025;
const ORIGIN_LAT = 44.4268; // Bucharest

// Meters per degree on the same sphere the implementation measures against
// (R = 6371 km). Using a different earth model here would make every
// distance assertion off by ~0.5%, which reads as an implementation bug.
const LAT_METERS = (6371e3 * Math.PI) / 180;
const LON_METERS = LAT_METERS * Math.cos((ORIGIN_LAT * Math.PI) / 180);

/** A point `east`/`north` meters from the fixture origin, as [lon, lat]. */
const at = (east: number, north: number): [number, number] => [
  ORIGIN_LON + east / LON_METERS,
  ORIGIN_LAT + north / LAT_METERS,
];

/** Straight line of `count` points spaced `spacing` meters along a bearing. */
const line = (
  count: number,
  spacing: number,
  headingDegrees: number,
  startEast = 0,
  startNorth = 0,
): [number, number][] => {
  const rad = (headingDegrees * Math.PI) / 180;
  return Array.from({ length: count }, (_, i) =>
    at(startEast + Math.sin(rad) * spacing * i, startNorth + Math.cos(rad) * spacing * i),
  );
};

describe('bearingDegrees', () => {
  it('reads 0 for due north and 90 for due east', () => {
    expect(bearingDegrees(at(0, 0), at(0, 100))).toBeCloseTo(0, 1);
    expect(bearingDegrees(at(0, 0), at(100, 0))).toBeCloseTo(90, 1);
    expect(bearingDegrees(at(0, 0), at(0, -100))).toBeCloseTo(180, 1);
    expect(bearingDegrees(at(0, 0), at(-100, 0))).toBeCloseTo(270, 1);
  });
});

describe('normalizeBearingDelta', () => {
  it('keeps small deltas untouched', () => {
    expect(normalizeBearingDelta(45)).toBe(45);
    expect(normalizeBearingDelta(-45)).toBe(-45);
  });

  it('wraps the long way round to the short way', () => {
    expect(normalizeBearingDelta(350)).toBe(-10);
    expect(normalizeBearingDelta(-350)).toBe(10);
  });

  it('resolves a reversal to +180 rather than -180', () => {
    expect(normalizeBearingDelta(180)).toBe(180);
    expect(normalizeBearingDelta(-180)).toBe(180);
  });
});

describe('classifyTurnModifier', () => {
  it('maps magnitudes onto the OSRM vocabulary', () => {
    expect(classifyTurnModifier(5)).toBe('straight');
    expect(classifyTurnModifier(30)).toBe('slight right');
    expect(classifyTurnModifier(-30)).toBe('slight left');
    expect(classifyTurnModifier(90)).toBe('right');
    expect(classifyTurnModifier(-90)).toBe('left');
    expect(classifyTurnModifier(150)).toBe('sharp right');
    expect(classifyTurnModifier(-150)).toBe('sharp left');
  });
});

describe('detectCourseManeuvers', () => {
  it('finds no turns on a straight line', () => {
    expect(detectCourseManeuvers(line(40, 5, 0))).toEqual([]);
  });

  it('returns nothing for degenerate geometry', () => {
    expect(detectCourseManeuvers([])).toEqual([]);
    expect(detectCourseManeuvers([at(0, 0)])).toEqual([]);
    expect(detectCourseManeuvers([at(0, 0), at(0, 100)])).toEqual([]);
  });

  it('detects a single right-angle turn and classifies it right', () => {
    // 100 m north, then 100 m east.
    const north = line(21, 5, 0);
    const east = line(20, 5, 90, 0, 100).slice(1);
    const maneuvers = detectCourseManeuvers([...north, ...east]);

    expect(maneuvers).toHaveLength(1);
    expect(maneuvers[0]!.modifier).toBe('right');
    expect(maneuvers[0]!.angleDegrees).toBeCloseTo(90, 0);
  });

  it('classifies the mirrored corner as a left turn', () => {
    const north = line(21, 5, 0);
    const west = line(20, 5, 270, 0, 100).slice(1);
    const maneuvers = detectCourseManeuvers([...north, ...west]);

    expect(maneuvers).toHaveLength(1);
    expect(maneuvers[0]!.modifier).toBe('left');
  });

  it('collapses one corner into a single maneuver, not one per vertex', () => {
    // A corner rounded over 9 intermediate vertices — every one of them has a
    // heading change, but the rider takes one turn.
    // Quarter circle of radius 20 m, joining both legs tangentially so the
    // only heading change in the track is the corner itself.
    const approach = line(21, 5, 0);
    const arc: [number, number][] = Array.from({ length: 9 }, (_, i) => {
      const t = ((i + 1) / 9) * (Math.PI / 2);
      return at(20 * Math.sin(t), 100 + 20 * (1 - Math.cos(t)));
    });
    const exit = line(20, 5, 90, 20, 120).slice(1);

    const maneuvers = detectCourseManeuvers([...approach, ...arc, ...exit]);

    expect(maneuvers).toHaveLength(1);
    expect(maneuvers[0]!.modifier).toBe('right');
  });

  it('still separates two real turns that sit close together', () => {
    // The counterpart to the clustering test above: a rounded corner followed
    // ~30 m later by a distinct kink is two cues, not one. Guards against
    // widening suppression until genuine turns start disappearing.
    const approach = line(21, 5, 0);
    const arc: [number, number][] = Array.from({ length: 9 }, (_, i) => {
      const t = ((i + 1) / 10) * (Math.PI / 2);
      return at(20 * Math.sin(t), 100 + 20 * (1 - Math.cos(t)));
    });
    const exit = line(20, 5, 90, 20, 120).slice(1);

    expect(detectCourseManeuvers([...approach, ...arc, ...exit])).toHaveLength(2);
  });

  it('ignores wobble in the first and last few meters of a course', () => {
    // Vertices without a full bearing window on both sides are skipped. A
    // clamped window would measure heading over a couple of meters, where
    // jitter is the whole signal — that made every course grow phantom turns
    // at its ends.
    const wobbleStart: [number, number][] = [at(-2, 0), at(2, 3), at(-1, 6)];
    const straight = line(30, 5, 0, 0, 10);

    expect(detectCourseManeuvers([...wobbleStart, ...straight])).toEqual([]);
  });

  it('detects both turns of an S-bend', () => {
    const first = line(21, 5, 0); // north 100 m
    const second = line(21, 5, 90, 0, 100).slice(1); // east 100 m
    const third = line(21, 5, 0, 100, 100).slice(1); // north 100 m

    const maneuvers = detectCourseManeuvers([...first, ...second, ...third]);

    expect(maneuvers).toHaveLength(2);
    expect(maneuvers[0]!.modifier).toBe('right');
    expect(maneuvers[1]!.modifier).toBe('left');
  });

  it('ignores GPS jitter on an otherwise straight track', () => {
    // 1 Hz urban recording: 4 m spacing with +/- 1.5 m lateral wobble. Adjacent
    // -point bearings swing wildly here; the windowed measurement must not.
    const jittered: [number, number][] = Array.from({ length: 60 }, (_, i) =>
      at(i % 2 === 0 ? 1.5 : -1.5, i * 4),
    );

    expect(detectCourseManeuvers(jittered)).toEqual([]);
  });
});

describe('buildCourseSteps', () => {
  it('returns nothing for unusable geometry', () => {
    expect(buildCourseSteps([])).toEqual([]);
    expect(buildCourseSteps([at(0, 0)])).toEqual([]);
  });

  it('emits depart + arrive for a straight course', () => {
    const steps = buildCourseSteps(line(21, 5, 0));

    expect(steps).toHaveLength(2);
    expect(steps[0]!.maneuver.type).toBe('depart');
    expect(steps[1]!.maneuver.type).toBe('arrive');
  });

  it('follows OSRM step semantics: distance belongs to the step it starts', () => {
    const north = line(21, 5, 0); // 100 m
    const east = line(21, 5, 90, 0, 100).slice(1); // 100 m
    const steps = buildCourseSteps([...north, ...east]);

    expect(steps).toHaveLength(3); // depart, turn, arrive
    expect(steps[0]!.maneuver.type).toBe('depart');
    expect(steps[1]!.maneuver.type).toBe('turn');
    expect(steps[1]!.maneuver.modifier).toBe('right');
    expect(steps[2]!.maneuver.type).toBe('arrive');

    // Each leg is ~100 m, and the arrival step carries none of it.
    expect(steps[0]!.distanceMeters).toBeGreaterThan(90);
    expect(steps[0]!.distanceMeters).toBeLessThan(110);
    expect(steps[1]!.distanceMeters).toBeGreaterThan(90);
    expect(steps[1]!.distanceMeters).toBeLessThan(110);
    expect(steps[2]!.distanceMeters).toBe(0);
    expect(steps[2]!.durationSeconds).toBe(0);
  });

  it('sums step distances to the course length', () => {
    const coordinates = [...line(21, 5, 0), ...line(21, 5, 90, 0, 100).slice(1)];
    const steps = buildCourseSteps(coordinates);
    const summed = steps.reduce((total, step) => total + step.distanceMeters, 0);

    expect(summed).toBeCloseTo(courseDistanceMeters(coordinates), 3);
  });

  it('estimates duration from the assumed speed', () => {
    const steps = buildCourseSteps(line(21, 5, 0));
    const expected = steps[0]!.distanceMeters / DEFAULT_COURSE_SPEED_MPS;

    expect(steps[0]!.durationSeconds).toBeCloseTo(expected, 6);
  });

  it('honours a caller-supplied speed', () => {
    const fast = buildCourseSteps(line(21, 5, 0), { speedMetersPerSecond: 8.4 });
    const slow = buildCourseSteps(line(21, 5, 0), { speedMetersPerSecond: 4.2 });

    expect(fast[0]!.durationSeconds).toBeCloseTo(slow[0]!.durationSeconds / 2, 6);
  });

  it('leaves street names empty — geometry cannot know them', () => {
    const steps = buildCourseSteps(line(21, 5, 0));
    expect(steps.every((step) => step.streetName === '')).toBe(true);
  });

  it('gives every step a unique id', () => {
    const coordinates = [
      ...line(21, 5, 0),
      ...line(21, 5, 90, 0, 100).slice(1),
      ...line(21, 5, 0, 100, 100).slice(1),
    ];
    const steps = buildCourseSteps(coordinates);
    const ids = new Set(steps.map((step) => step.id));

    expect(ids.size).toBe(steps.length);
  });

  it('places each maneuver on a real coordinate of the course', () => {
    const coordinates = [...line(21, 5, 0), ...line(21, 5, 90, 0, 100).slice(1)];
    const steps = buildCourseSteps(coordinates);

    for (const step of steps) {
      const [lon, lat] = step.maneuver.location;
      expect(
        coordinates.some((c) => c[0] === lon && c[1] === lat),
      ).toBe(true);
    }
  });
});

describe('courseDistanceMeters', () => {
  it('is zero for degenerate geometry', () => {
    expect(courseDistanceMeters([])).toBe(0);
    expect(courseDistanceMeters([at(0, 0)])).toBe(0);
  });

  it('measures a known straight line', () => {
    // 20 gaps of 5 m.
    expect(courseDistanceMeters(line(21, 5, 0))).toBeCloseTo(100, 0);
  });
});

describe('isCourseRoute', () => {
  it('identifies an imported course', () => {
    expect(isCourseRoute({ source: 'gpx_course' })).toBe(true);
  });

  it('rejects routes we computed ourselves', () => {
    expect(isCourseRoute({ source: 'custom_osrm' })).toBe(false);
    expect(isCourseRoute({ source: 'mapbox' })).toBe(false);
  });

  it('fails safe on a missing route', () => {
    // Returning true here would suppress rerouting on a normal route, which
    // is a worse failure than the reverse: a rider genuinely off a computed
    // route would silently never be recalculated.
    expect(isCourseRoute(null)).toBe(false);
    expect(isCourseRoute(undefined)).toBe(false);
    expect(isCourseRoute({})).toBe(false);
  });
});
