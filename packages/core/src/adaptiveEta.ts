/**
 * The in-ride ETA: the Phase 1 estimate for what is left, blended with the
 * speed actually ridden so far (docs/plans/adaptive-eta.md, Phase 2).
 *
 * Every weight below is a proposal, not a measurement. Tune them from the
 * `eta_accuracy` data, not by reasoning (error-log #111).
 */
import { sanitizeBreadcrumbs, type SanitisableCrumb } from './breadcrumbs';
import { haversineDistance } from './distance';

/** The observed speed's weight never passes this, so history still counts. */
export const OBSERVED_WEIGHT_CAP = 0.7;
/** Ridden distance at which the observed speed reaches its full weight. */
export const OBSERVED_WEIGHT_FULL_METERS = 3000;
/** Staying within this of one spot counts as standing still. */
export const STOP_RADIUS_METERS = 25;
/**
 * A stop longer than this is taken out of riding time: a cafe is not riding
 * pace. Shorter ones (lights, junctions) stay in, because the rest of the
 * ride will have them too.
 */
export const LONG_STOP_SECONDS = 120;

/** Same rule as `rideMinutes`: 10 m of ascent costs about a flat kilometre. */
const CLIMB_METERS_PER_FLAT_KM = 10;
/** Below these there is nothing to learn from yet. */
const MIN_OBSERVED_METERS = 200;
const MIN_OBSERVED_SECONDS = 60;

export interface RiddenSoFar {
  readonly distanceMeters: number;
  /** Seconds since the first fix, minus stops longer than `LONG_STOP_SECONDS`. */
  readonly movingSeconds: number;
}

/** Distance and riding time so far, from the sanitised breadcrumb trail. */
export const riddenSoFar = <T extends SanitisableCrumb & { readonly ts: number }>(
  crumbs: readonly T[],
  startedAtMs?: number,
): RiddenSoFar => {
  const trail = sanitizeBreadcrumbs(crumbs, startedAtMs);
  if (trail.length < 2) return { distanceMeters: 0, movingSeconds: 0 };

  let distanceMeters = 0;
  let longStopMs = 0;
  let anchor = trail[0];
  let lastInside = trail[0];
  const closeStop = () => {
    const dwellMs = lastInside.ts - anchor.ts;
    if (dwellMs > LONG_STOP_SECONDS * 1000) longStopMs += dwellMs;
  };

  for (let i = 1; i < trail.length; i++) {
    const crumb = trail[i];
    distanceMeters += haversineDistance(
      [trail[i - 1].lat, trail[i - 1].lon],
      [crumb.lat, crumb.lon],
    );
    if (haversineDistance([anchor.lat, anchor.lon], [crumb.lat, crumb.lon]) > STOP_RADIUS_METERS) {
      closeStop();
      anchor = crumb;
    }
    lastInside = crumb;
  }
  closeStop();

  const elapsedMs = trail[trail.length - 1].ts - trail[0].ts;
  return { distanceMeters, movingSeconds: Math.max(0, (elapsedMs - longStopMs) / 1000) };
};

/**
 * Seconds left: `priorSeconds` (the Phase 1 figure for what remains) blended
 * with the remaining distance and climb at the speed ridden so far.
 */
export const adaptiveRemainingSeconds = (input: {
  readonly remainingDistanceMeters: number;
  readonly remainingClimbMeters: number | null;
  readonly priorSeconds: number;
  readonly ridden: RiddenSoFar;
  /** Ascent already ridden; it slowed the observed speed, so it is credited back. */
  readonly riddenClimbMeters: number | null;
}): number => {
  const { ridden } = input;
  if (ridden.distanceMeters < MIN_OBSERVED_METERS || ridden.movingSeconds < MIN_OBSERVED_SECONDS) {
    return input.priorSeconds;
  }
  const climbAsMeters = (climb: number | null) =>
    climb !== null && Number.isFinite(climb) && climb > 0
      ? (climb / CLIMB_METERS_PER_FLAT_KM) * 1000
      : 0;

  const effectiveSpeedMps =
    (ridden.distanceMeters + climbAsMeters(input.riddenClimbMeters)) / ridden.movingSeconds;
  const observedSeconds =
    (Math.max(0, input.remainingDistanceMeters) + climbAsMeters(input.remainingClimbMeters)) /
    effectiveSpeedMps;

  const weight =
    OBSERVED_WEIGHT_CAP * Math.min(1, ridden.distanceMeters / OBSERVED_WEIGHT_FULL_METERS);
  return (1 - weight) * input.priorSeconds + weight * observedSeconds;
};
