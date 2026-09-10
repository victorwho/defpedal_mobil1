// @vitest-environment node
/**
 * Loop routing, measured against RESPONSES CAPTURED FROM THE LIVE ROUTER.
 *
 * The four fixtures in `__fixtures__/` are real OSRM answers, recorded
 * 2026-09-10 from `osrm.defensivepedal.com` at the coordinates and ring
 * geometry named in each file's `meta`. That is not fussiness: three separate
 * features in this codebase shipped dead because every test built its own
 * fixture in the shape the code assumed, so the parse always succeeded and the
 * real response never had the field at all (error-log #113). A hand-built
 * fixture proves you can parse your own assumption and nothing else.
 *
 * The numbers asserted below are therefore MEASURED, not chosen. Where one
 * looks surprising it is labelled, because a surprising true number is worth
 * more than a comfortable invented one.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  initialRingRadiusMeters,
  isOutAndBack,
  isRingOutAndBack,
  lollipopWaypoints,
  loopRoundness,
  MAX_RETRACE_SHARE,
  RETRACE_CEILING,
  ringCoordinates,
  ringDetourFactor,
  ringRetracedShare,
  ringRoundness,
  ringWaypoints,
  withinRetraceCeiling,
  type Coordinate,
  type Route,
  type RouteResponse,
} from '@defensivepedal/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildLoopUrl,
  fetchLoopRoute,
  measureLoopGeometry,
  OsrmOutOfCoverageError,
} from './osrm';

interface FixtureMeta {
  readonly name: string;
  readonly start: Coordinate;
  readonly target: number;
  readonly count: number;
  readonly shape: 'ring' | 'lollipop';
  readonly bearing: number;
  readonly waypoints: Coordinate[];
}

interface Fixture {
  readonly meta: FixtureMeta;
  readonly response: RouteResponse;
}

const loadFixture = (name: string): Fixture =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./__fixtures__/${name}.json`, import.meta.url)),
      'utf8',
    ),
  ) as Fixture;

const FIXTURE_NAMES = [
  'ring-bucharest-5km',
  'ring-bucharest-15km-hex',
  'lollipop-rasnov-20km',
  'ring-rasnov-10km',
] as const;

const stemLegsFor = (meta: FixtureMeta): number =>
  meta.shape === 'lollipop' ? 1 : 0;

describe('captured OSRM fixtures', () => {
  it.each(FIXTURE_NAMES)(
    '%s carries the annotation everything is measured from',
    (name) => {
      const { response } = loadFixture(name);
      const route = response.routes[0] as unknown as Route;

      for (const leg of route.legs) {
        const annotation = (leg as unknown as { annotation?: Record<string, unknown> })
          .annotation;
        expect(annotation).toBeDefined();
        expect(Array.isArray(annotation!.nodes)).toBe(true);
        expect(Array.isArray(annotation!.distance)).toBe(true);
        // nodes has one more entry than distance: n edges span n+1 nodes.
        expect((annotation!.nodes as number[]).length).toBe(
          (annotation!.distance as number[]).length + 1,
        );
      }
    },
  );

  it.each(FIXTURE_NAMES)(
    '%s has NO `classes` on the leg annotation, where three features looked for it',
    (name) => {
      const { response } = loadFixture(name);
      const route = response.routes[0] as unknown as Route;
      for (const leg of route.legs) {
        const annotation = (leg as unknown as { annotation: Record<string, unknown> })
          .annotation;
        expect(annotation).not.toHaveProperty('classes');
      }
      // Road classes live here instead. If this ever fails, the surface split,
      // tunnel markers and bridge markers are all silently dead again.
      const withClasses = route.legs
        .flatMap((leg) => leg.steps)
        .flatMap((step) => (step as unknown as { intersections?: unknown[] }).intersections ?? []);
      expect(withClasses.length).toBeGreaterThan(0);
    },
  );

  it.each(FIXTURE_NAMES)(
    '%s waypoints are reproducible from the core geometry model',
    (name) => {
      const { meta } = loadFixture(name);
      const rebuilt =
        meta.shape === 'lollipop'
          ? lollipopWaypoints(meta.start, meta.bearing, meta.target, meta.count)
          : ringWaypoints(
              meta.start,
              initialRingRadiusMeters(
                meta.target,
                meta.count,
                ringDetourFactor(meta.count),
              ),
              meta.bearing,
              meta.count,
            );

      expect(rebuilt).toHaveLength(meta.waypoints.length);
      rebuilt.forEach((point, index) => {
        expect(point.lat).toBeCloseTo(meta.waypoints[index]!.lat, 9);
        expect(point.lon).toBeCloseTo(meta.waypoints[index]!.lon, 9);
      });
    },
  );
});

describe('measureLoopGeometry', () => {
  it('reads turn-by-turn from EVERY leg, not just the first', () => {
    const { meta, response } = loadFixture('ring-bucharest-5km');
    const route = response.routes[0] as unknown as Route;

    const result = measureLoopGeometry(route, 'rolling', stemLegsFor(meta), false);

    // 94 steps across four legs; the first leg alone holds 28. The server's
    // A-to-B normaliser reads `legs[0]`, which is right for a single-leg route
    // and would hand a loop rider turn-by-turn for the opening quarter of the
    // ride and silence after that.
    expect(result.route.steps).toHaveLength(94);
    expect(route.legs[0]!.steps).toHaveLength(28);
    expect(route.legs).toHaveLength(4);
  });

  it('stamps the marker that stops a loop being rerouted home', () => {
    const { meta, response } = loadFixture('ring-bucharest-5km');
    const result = measureLoopGeometry(
      response.routes[0] as unknown as Route,
      'rolling',
      stemLegsFor(meta),
      false,
    );
    expect(result.route.source).toBe('generated_loop');
  });

  it('selects the flat profile version only for flat terrain', () => {
    const { response } = loadFixture('ring-bucharest-5km');
    const route = response.routes[0] as unknown as Route;
    expect(measureLoopGeometry(route, 'flat', 0, false).route.routingProfileVersion).toBe(
      'flat-profile-v1',
    );
    expect(
      measureLoopGeometry(route, 'hilly', 0, false).route.routingProfileVersion,
    ).not.toBe('flat-profile-v1');
  });

  it('gives every candidate a distinct id even within one millisecond', () => {
    const { response } = loadFixture('ring-bucharest-5km');
    const route = response.routes[0] as unknown as Route;
    const ids = new Set(
      Array.from({ length: 20 }, () => measureLoopGeometry(route, 'rolling', 0, false).route.id),
    );
    // The client mints ids from `Date.now()`, so two rings resolving in the
    // same millisecond collide and one silently overwrites the other in the
    // measured map. A counter cannot.
    expect(ids.size).toBe(20);
  });

  it('splits a lollipop stem from its ring, which is the whole point of the shape', () => {
    const { meta, response } = loadFixture('lollipop-rasnov-20km');
    const route = response.routes[0] as unknown as Route;

    const withStem = measureLoopGeometry(route, 'rolling', 1, false);
    const withoutStem = measureLoopGeometry(route, 'rolling', 0, false);

    // Measured on the real response: the ride out and back is 8,794 m of a
    // 16,742 m ride, so the whole route reads 47.6% retraced while the loop at
    // the far end repeats less than 1% of itself.
    expect(Math.round(withStem.stemMeters)).toBe(8794);
    expect(withStem.retracedShare).toBeCloseTo(0.4755, 3);
    expect(withStem.ringRetracedShare).toBeCloseTo(0.0089, 3);

    // Without the split the same ride is judged on its approach and fails the
    // 0.35 cap outright — which is exactly how every lollipop used to be
    // vetoed before it could be ranked.
    expect(withoutStem.ringRetracedShare).toBeCloseTo(0.4755, 3);
    expect(withStem.ringRetracedShare).toBeLessThan(withoutStem.ringRetracedShare);
  });

  it('separates a spur from a shared corridor on real valley roads', () => {
    const rasnov = loadFixture('ring-rasnov-10km');
    const bucharest = loadFixture('ring-bucharest-5km');

    const valley = measureLoopGeometry(
      rasnov.response.routes[0] as unknown as Route,
      'rolling',
      0,
      false,
    );
    const grid = measureLoopGeometry(
      bucharest.response.routes[0] as unknown as Route,
      'rolling',
      0,
      false,
    );

    // Râșnov at 10 km: 70% of the ride repeated, and 60% of it is out-and-back
    // spur rather than a shared corridor. This is what the spur cap exists to
    // catch, and it is a loop the rider would call "a loop plus errands".
    expect(valley.retracedShare).toBeCloseTo(0.7005, 3);
    expect(valley.spurShare).toBeCloseTo(0.5954, 3);

    // Bucharest at 5 km: 12% repeated and NO spur at all. Same aggregate
    // family, completely different ride. One number could not tell them apart.
    expect(grid.retracedShare).toBeCloseTo(0.1224, 3);
    expect(grid.spurShare).toBe(0);
  });

  it('reads the unpaved share off annotations, for free', () => {
    const bucharest = measureLoopGeometry(
      loadFixture('ring-bucharest-5km').response.routes[0] as unknown as Route,
      'rolling',
      0,
      false,
    );
    const rasnov = measureLoopGeometry(
      loadFixture('lollipop-rasnov-20km').response.routes[0] as unknown as Route,
      'rolling',
      1,
      false,
    );

    // A city ring is 3.5% unpaved; a ride into the Râșnov foothills is 76.7%.
    // Both are read from `steps[].intersections[].classes` with no extra call.
    expect(bucharest.unpavedShare).toBeCloseTo(0.0347, 3);
    expect(rasnov.unpavedShare).toBeCloseTo(0.7674, 3);
  });
});

describe('the out-and-back guard, measured on a real lollipop', () => {
  it('measured on the WHOLE route it rejects a lollipop for being a lollipop', () => {
    const { meta, response } = loadFixture('lollipop-rasnov-20km');
    const route = response.routes[0] as unknown as Route;
    const coordinates = route.geometry.coordinates as [number, number][];

    // The defect this file used to pin, kept as the explanation of why the
    // scope changed. `loopRoundness` divides the furthest point reached by the
    // radius a CIRCLE of this length would have. A lollipop rides out before
    // it loops, so its excursion is large by construction and the whole-route
    // ratio is structurally inflated — 1.905 here, against a 1.9 threshold.
    expect(loopRoundness(meta.start, coordinates, route.distance)).toBeCloseTo(
      1.905,
      2,
    );
    expect(isOutAndBack(meta.start, coordinates, route.distance)).toBe(true);
  });

  it('measured on the RING it accepts it, and the ring is an excellent loop', () => {
    const { response } = loadFixture('lollipop-rasnov-20km');
    const route = response.routes[0] as unknown as Route;

    // Same ride, judged on the part that is actually a loop. It repeats under
    // 1% of itself, which is better than every plain ring in this fixture set.
    expect(isRingOutAndBack(route.legs, 1)).toBe(false);
    expect(ringRoundness(route.legs, 1)).toBeLessThan(1.9);
    expect(ringRetracedShare(route.legs, 1)).toBeCloseTo(0.0089, 3);
  });

  it('accepts every plain ring in the fixture set, before and after the change', () => {
    // The scope change must not move a plain ring. It has no stem, so the ring
    // IS the whole route and the only difference is that the reference point
    // becomes the snapped start rather than the rider's raw coordinate. That
    // flipped no verdict in 300 live measurements, and none here.
    for (const name of [
      'ring-bucharest-5km',
      'ring-bucharest-15km-hex',
      'ring-rasnov-10km',
    ]) {
      const { meta, response } = loadFixture(name);
      const route = response.routes[0] as unknown as Route;
      expect(
        isOutAndBack(
          meta.start,
          route.geometry.coordinates as [number, number][],
          route.distance,
        ),
      ).toBe(false);
      expect(isRingOutAndBack(route.legs, 0)).toBe(false);
    }
  });

  it('reads the ring geometry off the steps, not the route overview', () => {
    const { response } = loadFixture('lollipop-rasnov-20km');
    const route = response.routes[0] as unknown as Route;

    // Six legs, of which the first and last are the ride out and home. The
    // ring is the four in the middle, and its geometry has to come from
    // `steps[].geometry` because the route-level overview is one line with no
    // leg boundaries in it.
    expect(route.legs).toHaveLength(6);
    const whole = ringCoordinates(route.legs, 0);
    const ring = ringCoordinates(route.legs, 1);
    expect(whole.length).toBeGreaterThan(ring.length);
    expect(ring.length).toBeGreaterThan(0);
  });

  it('passes a route it cannot measure rather than rejecting it on a guess', () => {
    // Same rule the retrace and spur caps follow. A route with no step
    // geometry is unmeasurable, not bad.
    expect(ringRoundness([{ annotation: { nodes: [], distance: [] } }], 0)).toBe(0);
    expect(isRingOutAndBack([], 0)).toBe(false);
  });
});

describe('the never-relaxed doubling-back ceiling', () => {
  it('refuses a route that repeats effectively all of itself', () => {
    expect(withinRetraceCeiling({ ringRetracedShare: 1 })).toBe(false);
    expect(withinRetraceCeiling({ ringRetracedShare: 0.95 })).toBe(false);
  });

  it('allows everything the ordinary cap already governs', () => {
    // The ceiling costs nothing at any rung where MAX_RETRACE_SHARE applies,
    // because everything above 0.35 already fails there. It only ever bites at
    // the last rung, where that cap is dropped.
    expect(withinRetraceCeiling({ ringRetracedShare: MAX_RETRACE_SHARE })).toBe(true);
    expect(withinRetraceCeiling({ ringRetracedShare: 0.5 })).toBe(true);
    expect(withinRetraceCeiling({ ringRetracedShare: 0.89 })).toBe(true);
  });

  it('sits in the gap the measurement found', () => {
    // 300 real candidates: the share tails off smoothly with one visible gap,
    // 0.893 to 0.930, and 30 of them sit at exactly 1.0.
    expect(RETRACE_CEILING).toBeGreaterThan(0.893);
    expect(RETRACE_CEILING).toBeLessThan(0.93);
    // And it must stay well above the relaxable cap, or it would start
    // refusing loops the ladder is entitled to offer.
    expect(RETRACE_CEILING).toBeGreaterThan(MAX_RETRACE_SHARE * 2);
  });

  it('passes an unmeasurable share, like every other cap here', () => {
    expect(withinRetraceCeiling({ ringRetracedShare: NaN })).toBe(true);
  });

  it('rejects the fixture that rides most of its ring twice', () => {
    // Râșnov at 10 km: 70% repeated. Under the ceiling, so the rider can still
    // be offered it when nothing better exists — which is the intent.
    const { response } = loadFixture('ring-rasnov-10km');
    const route = response.routes[0] as unknown as Route;
    const share = ringRetracedShare(route.legs, 0);
    expect(share).toBeCloseTo(0.7005, 3);
    expect(withinRetraceCeiling({ ringRetracedShare: share })).toBe(true);
  });
});

describe('buildLoopUrl', () => {
  const start: Coordinate = { lat: 44.4268, lon: 26.1025 };
  const waypoints: Coordinate[] = [
    { lat: 44.44, lon: 26.1 },
    { lat: 44.43, lon: 26.12 },
  ];

  it('closes the ring by repeating the start at both ends', () => {
    const url = buildLoopUrl(start, waypoints, { terrain: 'rolling', surface: 'any' });
    const path = url.split('?')[0]!;
    const coords = path.slice(path.lastIndexOf('/') + 1).split(';');
    expect(coords).toHaveLength(4);
    expect(coords[0]).toBe(coords[coords.length - 1]);
  });

  it('asks for the annotations every measurement depends on', () => {
    const url = buildLoopUrl(start, waypoints, { terrain: 'rolling', surface: 'any' });
    expect(url).toContain('annotations=true');
    expect(url).toContain('steps=true');
    expect(url).toContain('alternatives=false');
    expect(url).toContain('overview=full');
  });

  it('excludes unpaved only when the rider asked for paved', () => {
    const paved = buildLoopUrl(start, waypoints, { terrain: 'rolling', surface: 'paved' });
    expect(paved).toContain('exclude=unpaved');

    for (const surface of ['any', 'offroad'] as const) {
      expect(
        buildLoopUrl(start, waypoints, { terrain: 'rolling', surface }),
      ).not.toContain('exclude=unpaved');
    }
  });

  it('routes flat terrain through the flat instance and nothing else through it', () => {
    const flat = buildLoopUrl(start, waypoints, { terrain: 'flat', surface: 'any' });
    const rolling = buildLoopUrl(start, waypoints, { terrain: 'rolling', surface: 'any' });
    expect(flat).not.toBe(rolling);
    expect(flat).toContain('osrm-flat');
    expect(rolling).not.toContain('osrm-flat');
  });
});

describe('fetchLoopRoute', () => {
  const start: Coordinate = { lat: 44.4268, lon: 26.1025 };
  const waypoints: Coordinate[] = [{ lat: 44.44, lon: 26.1 }];
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ok = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  /** Exactly what the live router sends for an unroutable paved ring. */
  const noRoute400 = () =>
    ok({ message: 'No route found between points', code: 'NoRoute' }, 400);

  it('returns a measured loop for a normal response', async () => {
    const { response } = loadFixture('ring-bucharest-5km');
    fetchMock.mockResolvedValue(ok(response));

    const result = await fetchLoopRoute(start, waypoints, {
      terrain: 'rolling',
      surface: 'any',
    });

    expect(result.route.distanceMeters).toBeCloseTo(11748, 0);
    expect(result.pavedFallback).toBe(false);
    expect(result.edgeKeys.length).toBe(533);
  });

  it('drops the paved constraint once, and says so', async () => {
    const { response } = loadFixture('ring-rasnov-10km');
    fetchMock
      .mockResolvedValueOnce(noRoute400())
      .mockResolvedValueOnce(ok(response));

    const result = await fetchLoopRoute(start, waypoints, {
      terrain: 'rolling',
      surface: 'paved',
    });

    // Without this a paved-only search in trail country reports "no loops
    // found" and blames the search rather than the constraint — the candidate
    // is dropped silently by the caller, so nothing else could say it.
    expect(result.pavedFallback).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toContain('exclude=unpaved');
    expect(fetchMock.mock.calls[1]![0]).not.toContain('exclude=unpaved');
  });

  it('reaches the fallback when NoRoute arrives as HTTP 400', async () => {
    // THE regression test for the paved bug. The live router answers an
    // unroutable paved ring with HTTP 400 carrying `code: NoRoute`, and the
    // old code tested `response.ok` before reading the body — so it threw
    // straight past the retry below and the candidate was dropped in silence.
    // The rider was told no loops exist here rather than that their surface
    // constraint is what removed them.
    //
    // Measured against the live router: 78 of 216 paved rings across twelve
    // start points answered NoRoute, and at two of those start points EVERY
    // ring did, so a rider standing there got nothing at all.
    const { response } = loadFixture('ring-rasnov-10km');
    fetchMock
      .mockResolvedValueOnce(noRoute400())
      .mockResolvedValueOnce(ok(response));

    const result = await fetchLoopRoute(start, waypoints, {
      terrain: 'rolling',
      surface: 'paved',
    });

    expect(result.pavedFallback).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toContain('exclude=unpaved');
    expect(fetchMock.mock.calls[1]![0]).not.toContain('exclude=unpaved');
  });

  it('still fails a malformed request that answers the SAME status', async () => {
    // The fix must not become "stop throwing on 400". The live router returns
    // `InvalidValue`, `InvalidQuery` and `InvalidOptions` at 400 too, and
    // swallowing those would turn a real bug into a silent wrong answer.
    fetchMock.mockResolvedValue(
      ok(
        { code: 'InvalidValue', message: 'Exclude flag combination is not supported.' },
        400,
      ),
    );

    await expect(
      fetchLoopRoute(start, waypoints, { terrain: 'rolling', surface: 'paved' }),
    ).rejects.toThrow(/InvalidValue/);
    // One call: no retry, because this is not a routing outcome.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('names the status and the code when it does fail', async () => {
    fetchMock.mockResolvedValue(ok({ code: 'TooBig', message: 'Too many coordinates.' }, 400));
    await expect(
      fetchLoopRoute(start, waypoints, { terrain: 'rolling', surface: 'any' }),
    ).rejects.toThrow(/HTTP 400 TooBig: Too many coordinates\./);
  });

  it('does not retry a second NoRoute forever', async () => {
    fetchMock.mockResolvedValue(noRoute400());
    await expect(
      fetchLoopRoute(start, waypoints, { terrain: 'rolling', surface: 'paved' }),
    ).rejects.toThrow(/NoRoute/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('names an out-of-coverage answer rather than treating it as a route', async () => {
    // OSRM does NOT error for points outside its data: it snaps both ends to
    // the same edge and answers `Ok` with a zero-length route.
    fetchMock.mockResolvedValue(
      ok({
        code: 'Ok',
        routes: [
          { distance: 0, duration: 0, legs: [], geometry: { type: 'LineString', coordinates: [] } },
        ],
      }),
    );

    await expect(
      fetchLoopRoute(start, waypoints, { terrain: 'rolling', surface: 'any' }),
    ).rejects.toBeInstanceOf(OsrmOutOfCoverageError);
  });

  it('surfaces an HTTP failure with its status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'upstream down',
      json: async () => ({}),
    });

    await expect(
      fetchLoopRoute(start, waypoints, { terrain: 'rolling', surface: 'any' }),
    ).rejects.toThrow(/503/);
  });
});
