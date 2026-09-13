import type { Coordinate } from './contracts';

/**
 * The bounding box of a named place, west/south/east/north in degrees.
 *
 * This is what a geocoder hands back for a city, and it is an ADMINISTRATIVE
 * boundary rather than the edge of the built-up area. The two differ most for
 * small communes: Râșnov's box is 13.9 x 24.2 km because the commune owns the
 * mountain behind it, while the town itself is barely 2 km across. So this is
 * a hint about how far "out of town" is, never a claim about where the houses
 * stop — which is why nothing here is presented to the rider as a measurement
 * and why the clearance it produces is always clamped by what the ride can
 * afford.
 */
export interface PlaceBounds {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

/** Metres per degree of latitude. Constant enough at any latitude we serve. */
const METERS_PER_DEGREE_LAT = 110_574;

/** Metres per degree of longitude at the equator. */
const METERS_PER_DEGREE_LON = 111_320;

/**
 * Shortest distance from `start` to the edge of `bounds`, in metres.
 *
 * The NEAREST edge, deliberately, not the half-diagonal or the distance to the
 * far side. It answers "how far must this rider travel to be out of town",
 * which depends on where in town they live — a rider on the northern fringe of
 * Bucharest is 2 km from open country while one in Piața Unirii is 10 km from
 * it, and a single city-wide radius would be wrong for both.
 *
 * Returns 0 for a start outside the box: they are already out of town, so the
 * out-of-town clearance falls back to its budget fraction rather than pushing
 * them somewhere arbitrary.
 */
export const distanceToPlaceEdgeMeters = (
  start: Coordinate,
  bounds: PlaceBounds,
): number => {
  const lonScale =
    METERS_PER_DEGREE_LON * Math.cos((start.lat * Math.PI) / 180);

  const toWest = (start.lon - bounds.west) * lonScale;
  const toEast = (bounds.east - start.lon) * lonScale;
  const toSouth = (start.lat - bounds.south) * METERS_PER_DEGREE_LAT;
  const toNorth = (bounds.north - start.lat) * METERS_PER_DEGREE_LAT;

  const nearest = Math.min(toWest, toEast, toSouth, toNorth);

  return nearest > 0 ? nearest : 0;
};

/**
 * Is this box big enough that leaving it is a meaningful ask?
 *
 * A geocoder returns a box for every place, including a hamlet whose box is
 * 400 m across. Treating that as "a town to escape" would spend a rider's
 * whole budget riding away from somewhere they were never in. Half a kilometre
 * of clearance is below the noise of the shape itself.
 */
export const MIN_MEANINGFUL_EDGE_METERS = 500;
