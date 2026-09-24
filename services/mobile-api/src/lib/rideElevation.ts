/**
 * Geometry for a ride's elevation gain.
 *
 * `ride_impacts.elevation_gain_m` has existed since the table was created and
 * is 0 on every row: the impact endpoint accepts `elevationGainM` from the
 * client, and no client has ever sent it. The obvious fix — capture altitude in
 * the GPS trail — is the wrong one. Consumer GPS altitude carries ±10–20 m of
 * noise, so summing positive deltas books hundreds of phantom metres on a flat
 * ride, and it would need an app release before a single number appeared.
 *
 * The backend already resolves elevation from a terrain dataset for route
 * previews (`lib/elevation.ts`, exposed as `dependencies.getElevationGain`).
 * Feeding it a ride's own geometry gives an accurate climb, server-side, for
 * rides that have already happened — and it cannot be forged by a client.
 *
 * This module only chooses and cleans the coordinates. The lookup and the
 * gain/loss maths stay in lib/elevation.ts.
 */
import { decodePolyline, sanitizeBreadcrumbs } from '@defensivepedal/core';

/** Shape `trip_tracks.gps_trail` is read back as — the API drops `ts` on read. */
export interface TrailPoint {
  readonly lat: number;
  readonly lon: number;
  readonly ts?: number;
}

/** Two points is the minimum that can express a change in height. */
const MIN_POINTS = 2;

function isUsablePoint(point: unknown): point is TrailPoint {
  if (point === null || typeof point !== 'object') return false;
  const { lat, lon } = point as { lat?: unknown; lon?: unknown };
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

/**
 * The coordinates to measure a ride's climb over, as `[lon, lat]` pairs in
 * GeoJSON order — the order `getElevationGain` expects.
 *
 * Prefers the ridden trail over the planned line, because the question is what
 * the rider actually climbed, not what the route suggested. A navigated ride
 * that was never saved has no trail at all, and for those the planned geometry
 * is the only thing left; it is better than recording nothing, and the two are
 * the same road whenever the rider followed the route.
 *
 * The trail is sanitised first. A cached "wrong city" fix is already known to
 * corrupt ride distance (see core/breadcrumbs.ts) and it would corrupt this
 * worse: the terrain lookup would happily return that other city's altitude and
 * book the difference as climb.
 *
 * Returns an empty array when nothing usable exists, which callers should treat
 * as "not measurable" rather than as zero climb.
 */
export function rideElevationCoordinates(
  gpsTrail: readonly unknown[] | null | undefined,
  plannedRoutePolyline6: string | null | undefined,
): [number, number][] {
  const points = Array.isArray(gpsTrail) ? gpsTrail.filter(isUsablePoint) : [];

  if (points.length >= MIN_POINTS) {
    const clean = sanitizeBreadcrumbs(points);
    if (clean.length >= MIN_POINTS) {
      return clean.map((point) => [point.lon, point.lat]);
    }
  }

  if (typeof plannedRoutePolyline6 === 'string' && plannedRoutePolyline6.length > 0) {
    try {
      // decodePolyline already returns [lon, lat] — see routeShareService.ts,
      // which documents the same swap.
      const decoded = decodePolyline(plannedRoutePolyline6) as [number, number][];
      const usable = decoded.filter(
        ([lon, lat]) =>
          Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180,
      );
      if (usable.length >= MIN_POINTS) return usable;
    } catch {
      // A corrupt polyline is not worth failing an impact write over.
    }
  }

  return [];
}
