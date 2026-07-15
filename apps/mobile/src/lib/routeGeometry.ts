/**
 * Client-side bound on encoded route geometry before it's uploaded.
 *
 * EU-wide routing (2026-07-12) means a single route's `overview=full`
 * geometry can carry hundreds of thousands of points — the payload class
 * that 413'd `/risk-segments` and `/elevation-profile` (error-log #64) and
 * would have dead-lettered `/trips/track` uploads (GPS audit 2026-07-15
 * P0-3). The server carries its own bodyLimit + downsample backstop; this is
 * the client half so field devices never ship multi-MB polylines at all.
 *
 * 12k points matches the client cap used for the risk/elevation geometry
 * POSTs in `mapbox-routing.ts` — beyond sub-metre display resolution for any
 * plausible ride.
 */
import { decodePolyline, downsampleCoordinates, encodePolyline } from '@defensivepedal/core';

export const MAX_UPLOAD_ROUTE_POINTS = 12_000;

/**
 * Returns `encoded` unchanged when it decodes to ≤ 12k points; otherwise a
 * re-encoded uniform downsample (exact endpoints preserved). Never throws —
 * an undecodable string is returned as-is and left to the server backstop,
 * because failing here would block the upload the geometry rides along with.
 */
export const boundRoutePolyline6 = (encoded: string): string => {
  try {
    const points = decodePolyline(encoded);
    if (points.length <= MAX_UPLOAD_ROUTE_POINTS) return encoded;
    return encodePolyline(
      downsampleCoordinates(points, MAX_UPLOAD_ROUTE_POINTS) as [number, number][],
    );
  } catch {
    return encoded;
  }
};
