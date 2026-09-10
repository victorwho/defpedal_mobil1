// @vitest-environment node
/**
 * The only test here that talks to a real router.
 *
 * Skipped unless `LOOP_INTEGRATION_OSRM_URL` is set, because CI has no route to
 * the routing box and a suite that needs one would be permanently red or
 * permanently ignored. Run it by hand before a deploy, and after any change to
 * the sizing model:
 *
 *   LOOP_INTEGRATION_OSRM_URL=https://osrm.defensivepedal.com/route/v1/bicycle \
 *     npx vitest run src/lib/loops/integration.test.ts
 *
 * What it is for: every other test in this feature runs against a fixture or a
 * fake, and a fixture is a photograph. This is the one that notices when the
 * live graph is rebuilt, a profile changes, or a parameter we depend on stops
 * being honoured. It asserts SHAPE and ORDER OF MAGNITUDE, never an exact
 * distance — the graph moves, and a test that pins a metre count would fail on
 * every OSM refresh and teach everyone to ignore it.
 */
import {
  initialRingRadiusMeters,
  ringDetourFactor,
  ringWaypoints,
  type Coordinate,
} from '@defensivepedal/core';
import { describe, expect, it } from 'vitest';

import { measureLoopGeometry } from './osrm';

const OSRM_URL = process.env.LOOP_INTEGRATION_OSRM_URL;
const describeLive = OSRM_URL ? describe : describe.skip;

const BUCHAREST: Coordinate = { lat: 44.4268, lon: 26.1025 };

interface RingAnswer {
  readonly status: number;
  readonly code: string;
  readonly routes: {
    distance: number;
    legs: unknown[];
    geometry: { coordinates: number[][] };
  }[];
}

const routeRing = async (
  start: Coordinate,
  waypoints: readonly Coordinate[],
  { excludeUnpaved = false } = {},
): Promise<RingAnswer> => {
  const points = [start, ...waypoints, start];
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(';');
  let url =
    `${OSRM_URL}/${coords}?overview=full&geometries=geojson&steps=true` +
    `&alternatives=false&annotations=true&continue_straight=false`;
  if (excludeUnpaved) url += '&exclude=unpaved';

  const response = await fetch(url);
  const body = (await response.json()) as Omit<RingAnswer, 'status'>;
  // Deliberately NOT asserting `response.ok`: this router answers a genuine
  // "nothing connects these points" with HTTP 400, and that fact is the
  // subject of one of the tests below.
  return { status: response.status, code: body.code, routes: body.routes ?? [] };
};

describeLive('live OSRM', () => {
  it('answers a four-point ring with a route that returns to the start', async () => {
    const radius = initialRingRadiusMeters(15_000, 3, ringDetourFactor(3));
    const waypoints = ringWaypoints(BUCHAREST, radius, 0, 3);
    const data = await routeRing(BUCHAREST, waypoints);

    expect(data.code).toBe('Ok');
    expect(data.routes.length).toBeGreaterThan(0);
    // start + 3 waypoints + start = four legs. If this changes, the stem split
    // and every leg-indexed measurement changes with it.
    expect(data.routes[0]!.legs).toHaveLength(4);
    expect(data.routes[0]!.distance).toBeGreaterThan(0);
  }, 30_000);

  it('still puts road classes on intersections and NOT on the annotation', async () => {
    const radius = initialRingRadiusMeters(10_000, 3, ringDetourFactor(3));
    const data = await routeRing(BUCHAREST, ringWaypoints(BUCHAREST, radius, 90, 3));
    const legs = data.routes[0]!.legs as {
      annotation: Record<string, unknown>;
      steps: { intersections?: unknown[] }[];
    }[];

    for (const leg of legs) {
      // Three features in this codebase read `annotation.classes` for years.
      // It has never existed. If it ever appears, that is worth knowing.
      expect(leg.annotation).not.toHaveProperty('classes');
      expect(Array.isArray(leg.annotation.nodes)).toBe(true);
      expect(Array.isArray(leg.annotation.distance)).toBe(true);
    }

    const intersections = legs
      .flatMap((leg) => leg.steps)
      .flatMap((step) => step.intersections ?? []);
    expect(intersections.length).toBeGreaterThan(0);
  }, 30_000);

  it('honours exclude=unpaved rather than accepting and ignoring it', async () => {
    // A filter that is accepted and silently ignored is this project's most
    // repeated third-party trap. Proving it applied means comparing against a
    // request that did not carry it. Amsterdam, because a paved ring is
    // reliably routable there — see the NoRoute test below for why that is not
    // true everywhere.
    const start: Coordinate = { lat: 52.3676, lon: 4.9041 };
    const radius = initialRingRadiusMeters(15_000, 3, ringDetourFactor(3));
    const waypoints = ringWaypoints(start, radius, 45, 3);

    const [open, paved] = await Promise.all([
      routeRing(start, waypoints),
      routeRing(start, waypoints, { excludeUnpaved: true }),
    ]);

    expect(open.code).toBe('Ok');
    expect(paved.code).toBe('Ok');

    const openShare = measureLoopGeometry(
      open.routes[0] as never,
      'rolling',
      0,
      false,
    ).unpavedShare;
    const pavedShare = measureLoopGeometry(
      paved.routes[0] as never,
      'rolling',
      0,
      false,
    ).unpavedShare;

    expect(pavedShare).toBeLessThanOrEqual(openShare);
    expect(pavedShare).toBeLessThan(0.05);
  }, 30_000);

  it('answers an unroutable paved ring with HTTP 400, which defeats the fallback', async () => {
    // ⚠ A LIVE DEFECT, pinned rather than fixed. Fixing it here would break
    // parity with the app while the feature flag can still serve either path,
    // so it is recorded and scheduled — see "Server-side TODO" in
    // docs/plans/loop-generator.md.
    //
    // What happens: `exclude=unpaved` on a ring frequently has no solution,
    // and this router reports that as HTTP 400 with `code: NoRoute` in the
    // body. Both `fetchLoopRoute` implementations test `response.ok` BEFORE
    // reading the body, so they throw, and the paved-fallback retry underneath
    // is unreachable. The caller drops the candidate silently, so a paved-only
    // search reports "no loops found" and blames the search rather than the
    // constraint that caused it.
    //
    // Measured 2026-09-10 over five cities at 10/15/30 km and both ring
    // shapes: 20 of 30 paved rings routed, 10 did not — including ALL SIX
    // Bucharest attempts. So "Paved only" currently returns nothing at all in
    // some cities.
    const start: Coordinate = { lat: 44.4268, lon: 26.1025 };
    const radius = initialRingRadiusMeters(15_000, 3, ringDetourFactor(3));
    const answer = await routeRing(start, ringWaypoints(start, radius, 0, 3), {
      excludeUnpaved: true,
    });

    expect(answer.code).toBe('NoRoute');
    // The status is the whole problem. When this becomes 200, or the fallback
    // learns to read the body first, this expectation should change with it.
    expect(answer.status).toBe(400);
  }, 30_000);

  it('lands a ring within a factor of two of the requested length', async () => {
    // Deliberately loose. The sizing model is calibrated at 15/30/50 km and the
    // convergence controller does the rest, so a single unconverged attempt is
    // expected to miss. What this catches is the model being wrong by the
    // factor of two it once was, when every first attempt came back 86% long
    // and essentially nothing ever passed the distance gate.
    const target = 15_000;
    const radius = initialRingRadiusMeters(target, 3, ringDetourFactor(3));
    const data = await routeRing(BUCHAREST, ringWaypoints(BUCHAREST, radius, 180, 3));
    const actual = data.routes[0]!.distance;

    expect(actual).toBeGreaterThan(target * 0.5);
    expect(actual).toBeLessThan(target * 2);
  }, 30_000);
});
