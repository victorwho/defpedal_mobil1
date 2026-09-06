/**
 * Navigation behaviour that a generated loop introduces.
 *
 * Two things are load-bearing here and neither is visible on a destination
 * route: the reroute predicate (a loop's destination IS its origin, so an
 * ordinary reroute is a request for the shortest way home) and the forward-only
 * snap window (a loop can cross itself, and an unrestricted snap jumps branches).
 */
import { describe, expect, it } from 'vitest';

import type { NavigationSession, RouteOption } from './contracts';
import { closestPointOnPolyline, closestPointOnPolylineWithin } from './distance';
import { isCourseRoute, isFixedLineRoute, isGeneratedLoop } from './courseSteps';
import { createNavigationSession, getNavigationProgress } from './navigation';
import { encodePolyline } from './polyline';

describe('isFixedLineRoute', () => {
  it('covers both kinds of route the rider committed to following', () => {
    expect(isFixedLineRoute({ source: 'gpx_course' })).toBe(true);
    expect(isFixedLineRoute({ source: 'generated_loop' })).toBe(true);
  });

  it('leaves destination routes reroutable', () => {
    // Suppressing reroute on a destination route is the worse error — that
    // rider genuinely needs a new way to where they are going.
    expect(isFixedLineRoute({ source: 'custom_osrm' })).toBe(false);
    expect(isFixedLineRoute({ source: 'mapbox' })).toBe(false);
  });

  it('fails safe on an unknown or missing source', () => {
    expect(isFixedLineRoute({ source: 'something_new' })).toBe(false);
    expect(isFixedLineRoute({})).toBe(false);
    expect(isFixedLineRoute(null)).toBe(false);
    expect(isFixedLineRoute(undefined)).toBe(false);
  });

  it('does not change what isCourseRoute means', () => {
    // Existing course-only call sites must keep their exact behaviour.
    expect(isCourseRoute({ source: 'generated_loop' })).toBe(false);
    expect(isCourseRoute({ source: 'gpx_course' })).toBe(true);
  });

  it('identifies a generated loop specifically', () => {
    expect(isGeneratedLoop({ source: 'generated_loop' })).toBe(true);
    expect(isGeneratedLoop({ source: 'gpx_course' })).toBe(false);
  });
});

describe('closestPointOnPolylineWithin', () => {
  // A straight west-to-east line of 11 vertices, ~100 m apart.
  const line: [number, number][] = Array.from(
    { length: 11 },
    (_, i) => [26.1 + i * 0.00128, 44.43] as [number, number],
  );

  it('agrees with the unrestricted search over the full range', () => {
    const target: [number, number] = [44.43, 26.1 + 5 * 0.00128];
    const full = closestPointOnPolyline(target, line);
    const windowed = closestPointOnPolylineWithin(target, line, 0, 999);
    expect(windowed!.segmentIndex).toBe(full!.segmentIndex);
  });

  it('will not snap behind the window start', () => {
    const nearStart: [number, number] = [44.43, 26.1];
    const windowed = closestPointOnPolylineWithin(nearStart, line, 6, 999);
    expect(windowed!.segmentIndex).toBeGreaterThanOrEqual(6);
  });

  it('will not snap past the window end', () => {
    const nearEnd: [number, number] = [44.43, 26.1 + 10 * 0.00128];
    const windowed = closestPointOnPolylineWithin(nearEnd, line, 0, 2);
    expect(windowed!.segmentIndex).toBeLessThanOrEqual(2);
  });

  it('degrades to the full polyline for an out-of-range window', () => {
    // A navigation path that silently loses its snap is worse than one that
    // briefly widens it.
    const target: [number, number] = [44.43, 26.1 + 5 * 0.00128];
    expect(closestPointOnPolylineWithin(target, line, -50, -10)).not.toBeNull();
    expect(closestPointOnPolylineWithin(target, line, 900, 999)).not.toBeNull();
  });

  it('handles a degenerate polyline without throwing', () => {
    expect(closestPointOnPolylineWithin([44.43, 26.1], [], 0, 10)).toBeNull();
    expect(
      closestPointOnPolylineWithin([44.43, 26.1], [[26.1, 44.43]], 0, 10),
    ).not.toBeNull();
  });
});

describe('forward snap window during navigation', () => {
  /**
   * A figure-eight: out east, back west along a line 8 m to the north, so the
   * two halves are close enough that an unrestricted snap can pick either.
   */
  const outbound: [number, number][] = Array.from(
    { length: 60 },
    (_, i) => [26.1 + i * 0.0005, 44.43] as [number, number],
  );
  const inbound: [number, number][] = Array.from(
    { length: 60 },
    (_, i) => [26.1 + (59 - i) * 0.0005, 44.43007] as [number, number],
  );
  const crossing = [...outbound, ...inbound];

  const routeWith = (source: RouteOption['source']): RouteOption => ({
    id: 'r1',
    source,
    routingEngineVersion: 'test',
    routingProfileVersion: 'test',
    mapDataVersion: 'test',
    riskModelVersion: 'test',
    geometryPolyline6: encodePolyline(crossing),
    distanceMeters: 9_000,
    durationSeconds: 2_400,
    adjustedDurationSeconds: 2_400,
    totalClimbMeters: 0,
    steps: [
      {
        id: 's1',
        instruction: 'Ride',
        distanceMeters: 9_000,
        durationSeconds: 2_400,
        maneuver: { type: 'depart', modifier: null, location: { lat: 44.43, lon: 26.1 } },
      },
    ],
    riskSegments: [],
    routeFeatures: [],
    warnings: [],
  });

  const sessionAt = (furthest: number | undefined): NavigationSession => ({
    ...createNavigationSession('r1'),
    furthestVertexIndex: furthest,
  });

  // A point on the outbound leg, roughly a third of the way along. The inbound
  // leg passes ~8 m to the north of it.
  const midOutbound = { lat: 44.43, lon: 26.1 + 20 * 0.0005 };

  it('keeps a loop rider on the leg they are actually riding', () => {
    const progress = getNavigationProgress(
      routeWith('generated_loop'),
      sessionAt(18),
      midOutbound,
    );
    // Outbound occupies indices 0..59; inbound 60..119.
    expect(progress.furthestVertexIndex).toBeLessThan(60);
  });

  it('advances the high-water mark as the rider progresses', () => {
    const progress = getNavigationProgress(
      routeWith('generated_loop'),
      sessionAt(5),
      midOutbound,
    );
    expect(progress.furthestVertexIndex).toBeGreaterThan(5);
  });

  it('never moves the high-water mark backwards on a normal fix', () => {
    const progress = getNavigationProgress(
      routeWith('generated_loop'),
      sessionAt(19),
      midOutbound,
    );
    expect(progress.furthestVertexIndex).toBeGreaterThanOrEqual(19);
  });

  it('reads the west end as the END of the loop once the rider has got that far', () => {
    // Not a quirk — the correct answer. On a route that retraces itself, a
    // position is ambiguous by construction, and the high-water mark is the
    // only thing that disambiguates it. A rider who has reached vertex 100 and
    // is now at the west end is finishing, not starting over.
    const westEnd = { lat: 44.43, lon: 26.1 + 2 * 0.0005 };
    const progress = getNavigationProgress(
      routeWith('generated_loop'),
      sessionAt(100),
      westEnd,
    );
    expect(progress.furthestVertexIndex).toBeGreaterThanOrEqual(100);
    expect(progress.isOffRoute).toBe(false);
  });

  it('lets the mark move back when the window went stale', () => {
    // The escape hatch, on geometry where "behind" is unambiguous: a rider who
    // doubled back must not be stranded behind a window they can never reach.
    const straight: [number, number][] = Array.from(
      { length: 120 },
      (_, i) => [26.1 + i * 0.0005, 44.43] as [number, number],
    );
    const straightRoute: RouteOption = {
      ...routeWith('generated_loop'),
      geometryPolyline6: encodePolyline(straight),
    };

    const progress = getNavigationProgress(
      straightRoute,
      sessionAt(100),
      { lat: 44.43, lon: 26.1 + 5 * 0.0005 },
    );

    expect(progress.furthestVertexIndex).toBeLessThan(100);
    expect(progress.isOffRoute).toBe(false);
  });

  it('does not accumulate the mark on a destination route', () => {
    const progress = getNavigationProgress(
      routeWith('custom_osrm'),
      sessionAt(undefined),
      midOutbound,
    );
    expect(progress.furthestVertexIndex).toBeUndefined();
  });

  it('leaves destination-route progress byte-identical to before', () => {
    const withMark = getNavigationProgress(
      routeWith('custom_osrm'),
      sessionAt(100),
      midOutbound,
    );
    const withoutMark = getNavigationProgress(
      routeWith('custom_osrm'),
      sessionAt(undefined),
      midOutbound,
    );
    expect(withMark.snappedCoordinate).toEqual(withoutMark.snappedCoordinate);
    expect(withMark.remainingDistanceMeters).toBe(withoutMark.remainingDistanceMeters);
  });

  it('starts from the beginning when no mark has been recorded yet', () => {
    const progress = getNavigationProgress(
      routeWith('generated_loop'),
      sessionAt(undefined),
      { lat: 44.43, lon: 26.1 },
    );
    expect(progress.isOffRoute).toBe(false);
    expect(progress.furthestVertexIndex).toBeGreaterThanOrEqual(0);
  });

  it('still reports a genuinely lost rider as off-route', () => {
    const progress = getNavigationProgress(
      routeWith('generated_loop'),
      sessionAt(20),
      { lat: 44.45, lon: 26.15 },
    );
    expect(progress.isOffRoute).toBe(true);
  });
});
