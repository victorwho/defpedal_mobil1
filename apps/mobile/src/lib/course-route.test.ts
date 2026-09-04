import { decodePolyline } from '@defensivepedal/core';
import { describe, expect, it, vi } from 'vitest';

// course-route imports the enrichment helpers from mapbox-routing, which pulls
// in the env module and a network client. Only the OFFLINE half is under test
// here (buildCourseRoute is pure), so the network half is stubbed out.
vi.mock('./mapbox-routing', () => ({
  enrichRouteWithElevation: vi.fn(async (route: unknown) => route),
  enrichRouteWithRisk: vi.fn(async (route: unknown) => route),
}));

const { buildCourseRoute, courseStepInstruction, downsampleCourse, MAX_COURSE_POINTS } =
  await import('./course-route');

import type { ParsedCourse } from './gpx-parse';

const ORIGIN_LON = 26.1025;
const ORIGIN_LAT = 44.4268;
const LAT_METERS = (6371e3 * Math.PI) / 180;
const LON_METERS = LAT_METERS * Math.cos((ORIGIN_LAT * Math.PI) / 180);

const at = (east: number, north: number): [number, number] => [
  ORIGIN_LON + east / LON_METERS,
  ORIGIN_LAT + north / LAT_METERS,
];

const straight = (count: number, spacing = 5): [number, number][] =>
  Array.from({ length: count }, (_, i) => at(0, i * spacing));

const course = (
  coordinates: [number, number][],
  overrides: Partial<ParsedCourse> = {},
): ParsedCourse => ({
  name: 'Test course',
  coordinates,
  elevations: undefined,
  sourceElement: 'track',
  candidateCount: 1,
  droppedPoints: 0,
  ...overrides,
});

describe('downsampleCourse', () => {
  it('leaves a short course untouched', () => {
    const coords = straight(10);
    expect(downsampleCourse(coords, 100)).toEqual(coords);
  });

  it('thins an oversized course to the cap', () => {
    const coords = straight(5000, 1);
    expect(downsampleCourse(coords, 500)).toHaveLength(500);
  });

  it('always keeps the first and last point', () => {
    const coords = straight(5000, 1);
    const thinned = downsampleCourse(coords, 500);

    expect(thinned[0]).toEqual(coords[0]);
    expect(thinned[thinned.length - 1]).toEqual(coords[coords.length - 1]);
  });

  it('defaults to the shared geometry cap', () => {
    const coords = straight(MAX_COURSE_POINTS + 500, 1);
    expect(downsampleCourse(coords)).toHaveLength(MAX_COURSE_POINTS);
  });

  it('returns a mutable copy, not the input array', () => {
    const coords = straight(4);
    const result = downsampleCourse(coords, 100);

    expect(result).not.toBe(coords);
    expect(result).toEqual(coords);
  });
});

describe('courseStepInstruction', () => {
  const stepWith = (type: string, modifier?: string) => ({
    id: 'x',
    streetName: '' as const,
    distanceMeters: 10,
    durationSeconds: 2,
    mode: 'cycling' as const,
    maneuver: {
      type,
      location: [26.1, 44.4] as [number, number],
      bearing_before: 0,
      bearing_after: 0,
      ...(modifier === undefined ? {} : { modifier }),
    },
  });

  it('renders turns without a street name', () => {
    // The whole reason this exists instead of buildManeuverInstruction: that
    // one renders "Turn right onto {{street}}", which on a synthesized step
    // becomes "onto the road" on every single cue.
    const text = courseStepInstruction(stepWith('turn', 'right'), 'en');

    expect(text).toBe('Turn right');
    expect(text).not.toMatch(/road/i);
  });

  it('covers the full synthesized modifier vocabulary', () => {
    expect(courseStepInstruction(stepWith('turn', 'left'), 'en')).toBe('Turn left');
    expect(courseStepInstruction(stepWith('turn', 'slight left'), 'en')).toBe(
      'Slight left',
    );
    expect(courseStepInstruction(stepWith('turn', 'slight right'), 'en')).toBe(
      'Slight right',
    );
    expect(courseStepInstruction(stepWith('turn', 'sharp left'), 'en')).toBe(
      'Sharp left',
    );
    expect(courseStepInstruction(stepWith('turn', 'sharp right'), 'en')).toBe(
      'Sharp right',
    );
  });

  it('renders depart and arrive', () => {
    expect(courseStepInstruction(stepWith('depart'), 'en')).toBe('Depart');
    expect(courseStepInstruction(stepWith('arrive'), 'en')).toBe('Arrive');
  });

  it('localizes without any new i18n keys — RO and ES resolve too', () => {
    const ro = courseStepInstruction(stepWith('turn', 'right'), 'ro');
    const es = courseStepInstruction(stepWith('turn', 'right'), 'es');

    // A missing key echoes the key path back; assert we got real copy.
    expect(ro).not.toContain('nav.maneuverShort');
    expect(es).not.toContain('nav.maneuverShort');
    expect(ro).not.toBe('Turn right');
    expect(es).not.toBe('Turn right');
  });

  it('falls back to continue for an unknown maneuver', () => {
    expect(courseStepInstruction(stepWith('nonsense'), 'en')).toBe('Continue');
  });
});

describe('buildCourseRoute', () => {
  it('returns null for unusable geometry', () => {
    expect(buildCourseRoute(course([at(0, 0)]), { locale: 'en' })).toBeNull();
    expect(buildCourseRoute(course([]), { locale: 'en' })).toBeNull();
  });

  it('marks the route as an imported course', () => {
    // This flag is what suppresses auto-reroute during navigation. Losing it
    // silently converts the rider's imported line back into a computed route.
    const route = buildCourseRoute(course(straight(30)), { locale: 'en' });

    expect(route?.source).toBe('gpx_course');
  });

  it('round-trips the geometry through the polyline encoding', () => {
    const coords = straight(30);
    const route = buildCourseRoute(course(coords), { locale: 'en' })!;
    const decoded = decodePolyline(route.geometryPolyline6);

    expect(decoded).toHaveLength(coords.length);
    expect(decoded[0]![0]).toBeCloseTo(coords[0]![0], 5);
    expect(decoded[0]![1]).toBeCloseTo(coords[0]![1], 5);
  });

  it('produces localized steps ending at arrive', () => {
    const route = buildCourseRoute(course(straight(30)), { locale: 'en' })!;

    expect(route.steps.length).toBeGreaterThanOrEqual(2);
    expect(route.steps[0]!.instruction).toBe('Depart');
    expect(route.steps[route.steps.length - 1]!.instruction).toBe('Arrive');
    expect(route.steps.every((step) => step.streetName === '')).toBe(true);
  });

  it('measures a distance consistent with the geometry', () => {
    // 29 gaps of 5 m.
    const route = buildCourseRoute(course(straight(30)), { locale: 'en' })!;

    expect(route.distanceMeters).toBeGreaterThan(140);
    expect(route.distanceMeters).toBeLessThan(150);
  });

  it('starts with no risk segments and no route features', () => {
    // Risk arrives from the server; route features need OSRM annotations a
    // GPX cannot carry, so the list is honestly empty rather than half-filled.
    const route = buildCourseRoute(course(straight(30)), { locale: 'en' })!;

    expect(route.riskSegments).toEqual([]);
    expect(route.routeFeatures).toEqual([]);
    expect(route.totalClimbMeters).toBeNull();
  });

  it('downsamples an oversized course before building', () => {
    const route = buildCourseRoute(course(straight(MAX_COURSE_POINTS + 1000, 1)), {
      locale: 'en',
    })!;

    expect(decodePolyline(route.geometryPolyline6)).toHaveLength(MAX_COURSE_POINTS);
  });

  it('estimates a plausible duration', () => {
    const route = buildCourseRoute(course(straight(30)), { locale: 'en' })!;

    // ~145 m at ~15 km/h is roughly 35 s.
    expect(route.durationSeconds).toBeGreaterThan(20);
    expect(route.durationSeconds).toBeLessThan(60);
    expect(route.adjustedDurationSeconds).toBe(route.durationSeconds);
  });
});
