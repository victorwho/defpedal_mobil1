#!/usr/bin/env node
/**
 * Has the widened `unpaved` class gone live?
 *
 * OSRM_Server commit 090c226 widens the class to cover `highway=path` and
 * `bridleway` without a paved surface tag. Classes are baked at graph-extract
 * time, so nothing changes until the next graph rebuild ships — and there is
 * no date for that. This tells you whether it has landed instead of assuming.
 *
 * The probe is the one their notice specified: Brasov -> Rasnov on the
 * standard host, where the share of metres carrying `unpaved` jumps from about
 * 16% to about 66% once the new graph is live.
 *
 *   node scripts/probe-unpaved-widening.mjs
 *
 * Measures the share the same way the app does — from
 * `steps[].intersections[].classes`, per `packages/core/src/routeClasses.ts`.
 */

const BASE = 'https://osrm.defensivepedal.com/route/v1/bicycle';
const FROM = '25.6012,45.6580'; // Brasov
const TO = '25.4600,45.5934'; // Rasnov
const BEFORE = 0.16;
const AFTER = 0.66;

const R = 6371008.8;
const haversine = (a, b) => {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Mirrors `segmentMeters` in core: intersection i owns the stretch to i+1. */
const segments = (step) => {
  const intersections = step.intersections ?? [];
  const meters = step.distance ?? 0;
  const n = intersections.length;
  if (n === 0 || meters <= 0) return [];
  if (n === 1) return [meters];

  const points = intersections.map((i) => i.location).filter(Boolean);
  if (points.length !== n) return new Array(n).fill(meters / n);
  const coords = step.geometry?.coordinates;
  if (coords?.length) points.push(coords[coords.length - 1]);

  const raw = points
    .slice(0, n)
    .map((from, i) =>
      points[i + 1]
        ? haversine([from[1], from[0]], [points[i + 1][1], points[i + 1][0]])
        : 0,
    );
  if (raw[n - 1] === 0 && n > 1) {
    const measured = raw.slice(0, n - 1);
    raw[n - 1] = measured.reduce((s, v) => s + v, 0) / measured.length;
  }
  const sum = raw.reduce((s, v) => s + v, 0);
  return sum <= 0 ? new Array(n).fill(meters / n) : raw.map((v) => (v / sum) * meters);
};

const run = async () => {
  const url =
    `${BASE}/${FROM};${TO}` +
    '?overview=full&geometries=geojson&steps=true&annotations=true';
  const response = await fetch(url);
  const data = await response.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    console.error(`probe failed: OSRM answered ${data.code}`);
    process.exitCode = 2;
    return;
  }

  const route = data.routes[0];
  let unpaved = 0;
  let classified = 0;
  for (const leg of route.legs) {
    for (const step of leg.steps ?? []) {
      const intersections = step.intersections ?? [];
      if (intersections.length === 0) continue;
      classified += step.distance ?? 0;
      const parts = segments(step);
      intersections.forEach((intersection, i) => {
        if ((intersection.classes ?? []).includes('unpaved')) {
          unpaved += parts[i] ?? 0;
        }
      });
    }
  }

  const share = classified > 0 ? unpaved / classified : 0;
  const toBefore = Math.abs(share - BEFORE);
  const toAfter = Math.abs(share - AFTER);
  const live = toAfter < toBefore;

  console.log(`Brasov -> Rasnov  ${(route.distance / 1000).toFixed(1)} km`);
  console.log(`unpaved share: ${(share * 100).toFixed(1)}%`);
  console.log(`expected ~${BEFORE * 100}% before the rebuild, ~${AFTER * 100}% after`);
  console.log(
    live
      ? 'VERDICT: the widened class appears to be LIVE.'
      : 'VERDICT: still the OLD graph — widening has not shipped yet.',
  );
  // Neither state is a failure; the exit code just makes this scriptable.
  // `exitCode` rather than `exit()` — exiting inside the async flow trips a
  // libuv assertion on Windows while the fetch handle is still closing.
  process.exitCode = live ? 0 : 1;
};

run().catch((error) => {
  console.error(`probe failed: ${error?.message ?? error}`);
  process.exitCode = 2;
});
