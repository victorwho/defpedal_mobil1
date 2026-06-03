/**
 * 10-route regression for the phantom-distance bug (stale/teleport GPS fix).
 *
 * Each route is run through the EXACT code shipped in the v0.2.89 preview
 * bundle — both gates:
 *   1. client append gate  — the real `appendGpsBreadcrumb` on the live store
 *   2. server/read gate     — the real `sanitizeBreadcrumbs` + `calculateTrailDistanceMeters`
 *
 * Every route injects a failure mode (stale head fix from another city,
 * mid-ride cached fix, missing timestamps, etc.) and asserts the recorded
 * distance matches the true ride distance and is NEVER inflated.
 */
import { calculateTrailDistanceMeters, sanitizeBreadcrumbs } from '@defensivepedal/core';
import type { NavigationLocationSample, RouteOption } from '@defensivepedal/core';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { useAppStore } from './appStore';

type LatLon = { lat: number; lon: number };

// ── independent reference haversine (NOT the code under test) ──
const refHaversine = (a: LatLon, b: LatLon): number => {
  const R = 6371e3;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
const refDistance = (pts: LatLon[]): number =>
  pts.slice(1).reduce((sum, p, i) => sum + refHaversine(pts[i], p), 0);

// real European city anchors
const CITY = {
  madrid: { lat: 40.4168, lon: -3.7038 },
  bucharest: { lat: 44.4268, lon: 26.1025 },
  barcelona: { lat: 41.3874, lon: 2.1686 },
  cluj: { lat: 46.7712, lon: 23.6236 },
  london: { lat: 51.5074, lon: -0.1278 },
  valencia: { lat: 39.4699, lon: -0.3763 },
  timisoara: { lat: 45.7489, lon: 21.2087 },
  brasov: { lat: 45.658, lon: 25.6012 },
};

/** Build a straight-ish ride of `n` points spanning ~`km` km from a city anchor. */
const ride = (origin: LatLon, bearingDeg: number, km: number, n: number): LatLon[] => {
  // crude local offset: 1° lat ≈ 111 km, 1° lon ≈ 111·cos(lat) km
  const endLat = origin.lat + (km / 111) * Math.cos((bearingDeg * Math.PI) / 180);
  const endLon =
    origin.lon + (km / (111 * Math.cos((origin.lat * Math.PI) / 180))) * Math.sin((bearingDeg * Math.PI) / 180);
  return Array.from({ length: n }, (_, i) => ({
    lat: origin.lat + ((endLat - origin.lat) * i) / (n - 1),
    lon: origin.lon + ((endLon - origin.lon) * i) / (n - 1),
  }));
};

const createRoute = (id: string): RouteOption => ({
  id,
  source: 'custom_osrm',
  routingEngineVersion: 'safe-osrm-v1',
  routingProfileVersion: 'safety-profile-v1',
  mapDataVersion: 'osm-europe-current',
  riskModelVersion: 'risk-model-v1',
  geometryPolyline6: '_o~iF~ps|U_ulLnnqC',
  distanceMeters: 1200,
  durationSeconds: 420,
  adjustedDurationSeconds: 450,
  totalClimbMeters: 24,
  steps: [],
  riskSegments: [],
  routeFeatures: [],
  warnings: [],
});

type Crumb = { lat: number; lon: number; ts?: number };
type Scenario = {
  name: string;
  /** Build (truePath, deviceTrace) given the session start epoch ms. */
  build: (startMs: number) => { truePath: LatLon[]; device: Crumb[] };
};

const sample = (c: Crumb): NavigationLocationSample => ({
  coordinate: { lat: c.lat, lon: c.lon },
  accuracyMeters: 8,
  speedMetersPerSecond: 5,
  heading: null,
  timestamp: c.ts as number,
});

// Stamp each point with a timestamp derived from the real inter-point distance
// at a realistic ~6 m/s urban-cycling pace, so legitimate fixes never trip the
// 30 m/s teleport gate regardless of how coarsely the path is sampled. Live
// expo-location fixes always carry a timestamp, so this mirrors reality.
const RIDE_SPEED_MPS = 6;
const stamp = (pts: LatLon[], startMs: number): Crumb[] => {
  let t = startMs;
  return pts.map((p, i) => {
    if (i > 0) t += Math.max(2000, (refHaversine(pts[i - 1], pts[i]) / RIDE_SPEED_MPS) * 1000);
    return { ...p, ts: Math.round(t) };
  });
};
/** Prepend stale "last-known" fixes captured before the ride began. */
const withStaleHead = (device: Crumb[], startMs: number, ...cities: LatLon[]): Crumb[] => [
  ...cities.map((c, i) => ({ ...c, ts: startMs - (cities.length - i) * 30_000 })),
  ...device,
];
/** Splice a cached far-away fix mid-ride (timestamp between its neighbours). */
const withCachedFix = (device: Crumb[], index: number, city: LatLon): Crumb[] => {
  const ts = Math.round(((device[index - 1].ts as number) + (device[index].ts as number)) / 2);
  return [...device.slice(0, index), { ...city, ts }, ...device.slice(index)];
};

const SCENARIOS: Scenario[] = [
  {
    name: '1. Madrid 12km, stale Bucharest head fix (the reported bug)',
    build: (s) => {
      const truePath = ride(CITY.madrid, 30, 12, 60);
      return { truePath, device: withStaleHead(stamp(truePath, s), s, CITY.bucharest) };
    },
  },
  {
    name: '2. Bucharest 3km, stale Madrid head fix',
    build: (s) => {
      const truePath = ride(CITY.bucharest, 110, 3, 30);
      return { truePath, device: withStaleHead(stamp(truePath, s), s, CITY.madrid) };
    },
  },
  {
    name: '3. Barcelona 8km, stale London head + mid-ride cached Cluj fix',
    build: (s) => {
      const truePath = ride(CITY.barcelona, 200, 8, 40);
      const dev = withCachedFix(stamp(truePath, s), 20, CITY.cluj);
      return { truePath, device: withStaleHead(dev, s, CITY.london) };
    },
  },
  {
    name: '4. Cluj 15km, clean (control — no injection)',
    build: (s) => {
      const truePath = ride(CITY.cluj, 75, 15, 80);
      return { truePath, device: stamp(truePath, s) };
    },
  },
  {
    name: '5. London 5km, stale head + two consecutive cached head fixes',
    build: (s) => {
      const truePath = ride(CITY.london, 90, 5, 40);
      return { truePath, device: withStaleHead(stamp(truePath, s), s, CITY.madrid, CITY.bucharest) };
    },
  },
  {
    name: '6. Valencia 25km with a legit 8km GPS gap (must NOT be trimmed)',
    build: (s) => {
      // a real signal gap: GPS drops, rider keeps moving, one 8km segment at a
      // plausible pace bridges the two halves. It must survive untrimmed.
      const a = ride(CITY.valencia, 45, 12, 30);
      const last = a[a.length - 1];
      const b = ride(last, 45, 13, 30).slice(1); // continues onward (8km+ spans inside)
      const truePath = [...a, ...b];
      return { truePath, device: stamp(truePath, s) };
    },
  },
  {
    name: '7. Timisoara 6km, two stale head fixes from different cities',
    build: (s) => {
      const truePath = ride(CITY.timisoara, 10, 6, 35);
      return { truePath, device: withStaleHead(stamp(truePath, s), s, CITY.madrid, CITY.barcelona) };
    },
  },
  {
    name: '8. Brasov 10km, clean but heavy GPS jitter (±~25m)',
    build: (s) => {
      const truePath = ride(CITY.brasov, 120, 10, 60);
      const jit = truePath.map((p, i) => ({
        lat: p.lat + (((i * 37) % 11) - 5) * 0.00002,
        lon: p.lon + (((i * 53) % 11) - 5) * 0.00002,
      }));
      return { truePath, device: stamp(jit, s) };
    },
  },
  {
    name: '9. Madrid 4km, stale head + cached fix re-surfacing late mid-ride',
    build: (s) => {
      const truePath = ride(CITY.madrid, 250, 4, 30);
      const dev = withCachedFix(stamp(truePath, s), 22, CITY.bucharest);
      return { truePath, device: withStaleHead(dev, s, CITY.bucharest) };
    },
  },
  {
    name: '10. Barcelona 1.5km very short, stale Bucharest head fix',
    build: (s) => {
      const truePath = ride(CITY.barcelona, 300, 1.5, 20);
      return { truePath, device: withStaleHead(stamp(truePath, s), s, CITY.bucharest) };
    },
  },
];

const results: Array<{
  name: string;
  trueKm: string;
  clientKm: string;
  serverKm: string;
  readbackKm: string;
  ok: boolean;
}> = [];

afterEach(() => {
  useAppStore.getState().resetFlow();
  useAppStore.persist.clearStorage();
});

afterAll(() => {
  console.log('\n──────── 10-route teleport regression (v0.2.89 bundle code) ────────');
  console.log('  #  true(km)  client  server  readbk  result  scenario');
  results.forEach((r, i) =>
    console.log(
      `  ${String(i + 1).padStart(2)}  ${r.trueKm.padStart(7)}  ${r.clientKm.padStart(6)}  ${r.serverKm.padStart(6)}  ${r.readbackKm.padStart(6)}  ${
        r.ok ? ' PASS ' : ' FAIL '
      }  ${r.name.replace(/^\d+\.\s*/, '')}`,
    ),
  );
  console.log('────────────────────────────────────────────────────────────────────');
});

describe('phantom-distance regression: 10 routes through the shipped code', () => {
  it.each(SCENARIOS.map((s, i) => [i, s] as const))('route %#: %o', (_i, scenario) => {
    const route = createRoute(`route-${scenario.name.slice(0, 2)}`);

    // ── client gate: drive the REAL store ──
    useAppStore.getState().startNavigation(route);
    const startMs = Date.parse(useAppStore.getState().navigationSession!.startedAt);
    const { truePath, device } = scenario.build(startMs);
    for (const c of device) useAppStore.getState().appendGpsBreadcrumb(sample(c));
    const storedCrumbs = useAppStore.getState().navigationSession!.gpsBreadcrumbs;
    const clientMeters = calculateTrailDistanceMeters(storedCrumbs);

    // ── server gate: REAL sanitize + distance ──
    const serverMeters = calculateTrailDistanceMeters(sanitizeBreadcrumbs(device, startMs));

    // ── read-back gate: the API maps gps_trail to {lat,lon}, dropping ts, so
    // every History/trips surface recomputes from a timestamp-less trail ──
    const readbackMeters = calculateTrailDistanceMeters(
      storedCrumbs.map((c) => ({ lat: c.lat, lon: c.lon })),
    );

    const trueMeters = refDistance(truePath);

    // record for the summary table
    const within = (m: number) => m >= trueMeters * 0.7 && m <= trueMeters * 1.15 + 200;
    results.push({
      name: scenario.name,
      trueKm: (trueMeters / 1000).toFixed(2),
      clientKm: (clientMeters / 1000).toFixed(2),
      serverKm: (serverMeters / 1000).toFixed(2),
      readbackKm: (readbackMeters / 1000).toFixed(2),
      ok: within(clientMeters) && within(serverMeters) && within(readbackMeters),
    });

    // ── hard assertions ──
    // 1. never inflated — the bug would add hundreds/thousands of km
    expect(clientMeters).toBeLessThan(trueMeters + 50_000);
    expect(serverMeters).toBeLessThan(trueMeters + 50_000);
    expect(readbackMeters).toBeLessThan(trueMeters + 50_000);
    // 2. recorded distance is accurate (within 15% + 200m of the true ride)
    for (const recorded of [clientMeters, serverMeters, readbackMeters]) {
      expect(recorded).toBeGreaterThan(trueMeters * 0.7);
      expect(recorded).toBeLessThan(trueMeters * 1.15 + 200);
    }
  });
});
