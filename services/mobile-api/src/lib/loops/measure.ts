/**
 * Climb, risk and scenery for one finalist loop.
 *
 * This is the half of loop generation that server-side placement actually
 * fixes. On the phone these are three HTTP calls against `/v1/elevation-profile`,
 * `/v1/risk-segments` and `/v1/scenic-segments`, and all three share the
 * `routePreview` rate-limit bucket at 30 requests per 60 seconds. Five
 * finalists cost fifteen, an escalation costs fifteen more, and the rescue
 * branch another fifteen — so one unlucky search can exhaust a rider's own
 * budget and take the risk overlay down with it for the next minute.
 *
 * Here they are three function calls into the same code those endpoints wrap.
 * No HTTP, no bucket, no per-call auth. What bounds the work instead is the
 * `loopSearch` rate limit on the endpoint itself, which is the right place for
 * it: one bound on one rider action rather than a shared bound on an internal
 * step of it.
 *
 * Everything below degrades quietly and identically to the client path. A loop
 * whose climb could not be fetched reads as UNMEASURED rather than as flat,
 * which matters because `matchesTerrain` refuses to claim a terrain it never
 * measured — a silent zero would let the search report a flat loop it never
 * looked at.
 */
import {
  classifyTerrain,
  downsampleCoordinates,
  highRiskMeters,
  type GeoJsonLineString,
  type GeneratedLoop,
} from '@defensivepedal/core';

import type { MobileApiDependencies } from '../dependencies';
import { lengthWeightedScenic } from '../scenic';

/**
 * Cap on the geometry handed to elevation, risk and scenic.
 *
 * 12,000 points, matching what the app applies before POSTing rather than the
 * server's own 15,000 guard. The two differ, and using the server's number here
 * would silently make measurements taken through this path disagree with
 * measurements taken through the client path for any route long enough to
 * matter. Parity is the point; the tighter of the two wins.
 */
export const MAX_MEASURED_GEOMETRY_POINTS = 12_000;

/** Adjusted-duration model, ported verbatim from the app's routing module. */
const HILL_START_PENALTY_SEC = 10;
const ELEVATION_TIME_FACTOR = 0.75;
const CLIMB_THRESHOLD_M = 2;

/**
 * Terrain-adjusted duration.
 *
 * Deliberately NOT `getAdjustedDuration` from core, which counts real climbs by
 * walking the elevation profile. The app estimates them from the gain total
 * instead, and the two do not agree. Since the flag can serve either path to
 * the same rider, the estimate is what has to be reproduced — an ETA that
 * changes when a flag flips is a bug report about the ETA.
 */
export const computeAdjustedDuration = (
  flatDuration: number,
  elevationGain: number,
): number => {
  const estimatedClimbs =
    elevationGain > CLIMB_THRESHOLD_M
      ? Math.max(1, Math.round(elevationGain / 30))
      : 0;

  return (
    flatDuration +
    elevationGain * ELEVATION_TIME_FACTOR +
    estimatedClimbs * HILL_START_PENALTY_SEC
  );
};

/** The measurement surface, injected so the search can be tested without I/O. */
export interface LoopMeasurementPort {
  measure(loop: GeneratedLoop): Promise<GeneratedLoop>;
}

interface ElevationResult {
  readonly elevationProfile: number[];
  readonly elevationGain: number;
}

const measureElevation = async (
  dependencies: MobileApiDependencies,
  coordinates: [number, number][],
): Promise<ElevationResult | null> => {
  try {
    const [elevationProfile, gainLoss] = await Promise.all([
      dependencies.getElevationProfile(coordinates),
      dependencies.getElevationGain(coordinates),
    ]);
    return {
      elevationProfile: elevationProfile ?? [],
      elevationGain: gainLoss.elevationGain,
    };
  } catch {
    // Optional data. Returning null keeps the loop unmeasured, which is
    // honest; returning a zero would claim it is flat.
    return null;
  }
};

const measureRisk = async (
  dependencies: MobileApiDependencies,
  geometry: GeoJsonLineString,
) => {
  try {
    return await dependencies.fetchRiskSegments(geometry);
  } catch {
    return [];
  }
};

/**
 * Scenic, as a single length-weighted number in [-1, 1].
 *
 * 0 on any failure AND in an area with no scenic coverage, which are
 * deliberately indistinguishable: 0 is the neutral value in the ranking, so
 * both leave the order exactly as it was rather than pushing every candidate
 * around on missing data.
 */
const measureScenic = async (
  dependencies: MobileApiDependencies,
  geometry: GeoJsonLineString,
): Promise<number> => {
  try {
    const segments = await dependencies.fetchScenicSegments(geometry);
    return segments.length === 0 ? 0 : lengthWeightedScenic(segments);
  } catch {
    return 0;
  }
};

/**
 * Fetch climb, risk and scenery for one loop, in parallel.
 *
 * The three are independent, so a finalist costs one round of latency rather
 * than three. Five finalists measured together is five such rounds in flight,
 * which is what keeps the wait comparable to the client path despite Supabase
 * sitting on another continent.
 */
export const createMeasurementPort = (
  dependencies: MobileApiDependencies,
): LoopMeasurementPort => ({
  async measure(loop: GeneratedLoop): Promise<GeneratedLoop> {
    const bounded = downsampleCoordinates(
      loop.coordinates,
      MAX_MEASURED_GEOMETRY_POINTS,
    ) as [number, number][];
    const geometry: GeoJsonLineString = {
      type: 'LineString',
      coordinates: bounded,
    };

    const [elevation, riskSegments, scenicScore] = await Promise.all([
      measureElevation(dependencies, bounded),
      measureRisk(dependencies, geometry),
      measureScenic(dependencies, geometry),
    ]);

    const climbMeters =
      elevation === null ? null : Math.round(elevation.elevationGain);

    return {
      ...loop,
      route: {
        ...loop.route,
        totalClimbMeters: climbMeters,
        elevationProfile:
          elevation && elevation.elevationProfile.length > 0
            ? elevation.elevationProfile
            : undefined,
        adjustedDurationSeconds:
          elevation === null
            ? loop.route.adjustedDurationSeconds
            : Math.round(
                computeAdjustedDuration(
                  loop.route.durationSeconds,
                  elevation.elevationGain,
                ),
              ),
        riskSegments,
      },
      climbMeters,
      highRiskMeters: highRiskMeters(riskSegments),
      scenicScore,
      terrain:
        climbMeters === null
          ? null
          : classifyTerrain(climbMeters, loop.distanceMeters),
      measured: true,
    };
  },
});
