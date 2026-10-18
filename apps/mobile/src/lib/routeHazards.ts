import { closestPointOnPolyline, haversineDistance, type Coordinate, type NearbyHazard } from '@defensivepedal/core';

/** `/v1/hazards/nearby` caps its radius here (MAX_HAZARD_RADIUS_METERS). */
export const HAZARD_QUERY_RADIUS_METERS = 5000;
/**
 * Spacing between query centres along the route. Below twice the radius, so
 * neighbouring circles overlap and a winding route cannot slip between them.
 */
const CENTRE_SPACING_METERS = 8000;
/** More than this many queries and we do not claim a count at all. */
const MAX_QUERIES = 4;
/**
 * `get_nearby_hazards` returns at most this many rows, newest first (its
 * `p_limit` default; the API passes none). A full batch means older reports
 * in that circle were cut off, so the read did not cover the route.
 */
export const NEARBY_HAZARDS_ROW_CAP = 200;
/** Give up on the count (and make no claim) after this long. */
export const HAZARD_COUNT_TIMEOUT_MS = 4000;

/** A report counts as "on the route" within this distance of the line. */
export const ON_ROUTE_BUFFER_METERS = 40;

/**
 * Where to ask for hazards so the whole route is covered: one centre for a
 * short route, evenly spaced centres for a longer one.
 *
 * Returns null when the route is too long to cover in `MAX_QUERIES` — the
 * caller must then say nothing about hazards, because "no hazards reported"
 * over a route we only partly looked at would be a claim we cannot back.
 *
 * @param points Route geometry as [lon, lat] (decodePolyline order).
 */
export const hazardQueryCentres = (
  points: readonly [number, number][],
): Coordinate[] | null => {
  if (points.length === 0) return null;
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    const [lon0, lat0] = points[i - 1];
    const [lon1, lat1] = points[i];
    cumulative.push(cumulative[i - 1] + haversineDistance([lat0, lon0], [lat1, lon1]));
  }
  const total = cumulative[cumulative.length - 1];
  const count = Math.max(1, Math.ceil(total / CENTRE_SPACING_METERS));
  if (count > MAX_QUERIES) return null;

  const centres: Coordinate[] = [];
  for (let k = 0; k < count; k += 1) {
    const target = (total * (k + 0.5)) / count;
    const index = cumulative.findIndex((d) => d >= target);
    const [lon, lat] = points[index === -1 ? points.length - 1 : index];
    centres.push({ lat, lon });
  }
  return centres;
};

/**
 * The route's hazard count from per-centre batches, or null when any batch hit
 * the row cap — in a dense city (Amsterdam, the UK imports) a 5 km circle
 * holds thousands of reports, and a truncated read would say "none on your
 * route" about reports it never received.
 */
export const countHazardsFromBatches = (
  batches: readonly (readonly NearbyHazard[])[],
  points: readonly [number, number][],
): number | null => {
  if (batches.some((batch) => batch.length >= NEARBY_HAZARDS_ROW_CAP)) return null;
  return countHazardsOnRoute(batches.flat(), points);
};

/** Distinct hazards lying on the route line (within the buffer). */
export const countHazardsOnRoute = (
  hazards: readonly NearbyHazard[],
  points: readonly [number, number][],
  bufferMeters: number = ON_ROUTE_BUFFER_METERS,
): number => {
  const seen = new Set<string>();
  for (const hazard of hazards) {
    if (seen.has(hazard.id)) continue;
    const snap = closestPointOnPolyline([hazard.lat, hazard.lon], points);
    if (snap && snap.distanceMeters <= bufferMeters) seen.add(hazard.id);
  }
  return seen.size;
};
