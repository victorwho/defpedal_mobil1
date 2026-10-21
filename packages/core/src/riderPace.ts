/**
 * How fast this rider actually rides.
 *
 * The loop planner showed every rider the same figure: distance divided by
 * 15 km/h, always. The constant was named `FALLBACK_SPEED_KMH` and commented
 * "when the rider has no history yet", but nothing ever supplied history, so
 * the fallback was the only path — and the number sat in the same line as
 * measured climb and measured surface, borrowing their credibility.
 */

/** Used only when a rider has no usable rides yet. */
export const DEFAULT_PACE_KMH = 15;

/**
 * Rides needed before we trust the rider's own pace.
 *
 * Three, because one ride is an anecdote — a single short errand or one ride
 * that sat paused at a café would otherwise reset every estimate on the
 * screen, and an estimate that lurches after each ride reads as broken rather
 * than personal.
 */
export const MIN_RIDES_FOR_PACE = 3;

/** Slower than this is a walk or a stopped clock; faster is not a bicycle. */
const MIN_PLAUSIBLE_KMH = 5;
const MAX_PLAUSIBLE_KMH = 45;

/** The shortest ride worth learning from. */
const MIN_RIDE_METERS = 500;
const MIN_RIDE_SECONDS = 120;

export interface PaceSample {
  readonly distanceMeters?: number | undefined;
  readonly startedAt: string;
  readonly endedAt: string | null;
  /** Router's predicted time at start (Phase 3). Absent = not recorded. */
  readonly plannedDurationSeconds?: number | undefined;
  /** Absent = unknown; only a ride known to have no reroute is compared. */
  readonly rerouteCount?: number | undefined;
  readonly endReason?: string | undefined;
  /** Bike at start (Phase 3). Absent = not recorded. */
  readonly isEbike?: boolean | undefined;
}

export interface RiderPace {
  readonly kmh: number;
  /**
   * False when this is the default rather than the rider's own pace, so the
   * caller can say so instead of presenting a guess as a measurement.
   */
  readonly personal: boolean;
  /** How many rides it was drawn from. 0 for the default. */
  readonly rideCount: number;
  /**
   * Median of actual ride time / router-predicted time, once enough rides
   * carry a prediction (docs/plans/adaptive-eta.md, Phase 3). Preferred over
   * `kmh` wherever a router's time exists, because it keeps what the router
   * knows (signals, turns, road class) and adjusts it to this rider.
   */
  readonly routerFactor?: number;
}

const speedOf = (sample: PaceSample): number | null => {
  const metres = sample.distanceMeters;
  if (metres === undefined || !Number.isFinite(metres) || metres < MIN_RIDE_METERS) {
    return null;
  }
  if (sample.endedAt === null) return null;

  const start = Date.parse(sample.startedAt);
  const end = Date.parse(sample.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  const seconds = (end - start) / 1000;
  if (seconds < MIN_RIDE_SECONDS) return null;

  const kmh = metres / 1000 / (seconds / 3600);
  if (kmh < MIN_PLAUSIBLE_KMH || kmh > MAX_PLAUSIBLE_KMH) return null;
  return kmh;
};

/** The shortest ride worth comparing with its prediction. */
const MIN_FACTOR_RIDE_METERS = 1000;
/** Outside this, the clock or the prediction is wrong, not the rider. */
const MIN_PLAUSIBLE_FACTOR = 0.4;
const MAX_PLAUSIBLE_FACTOR = 3;

const factorOf = (sample: PaceSample): number | null => {
  const planned = sample.plannedDurationSeconds;
  if (planned === undefined || !Number.isFinite(planned) || planned <= 0) return null;
  // Rerouted, or unknown: the prediction was for a different ride.
  if (sample.rerouteCount !== 0 || sample.endReason !== 'completed') return null;
  const metres = sample.distanceMeters;
  if (metres === undefined || !Number.isFinite(metres) || metres < MIN_FACTOR_RIDE_METERS) {
    return null;
  }
  if (sample.endedAt === null) return null;
  const seconds = (Date.parse(sample.endedAt) - Date.parse(sample.startedAt)) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const factor = seconds / planned;
  return factor >= MIN_PLAUSIBLE_FACTOR && factor <= MAX_PLAUSIBLE_FACTOR ? factor : null;
};

const median = (sorted: readonly number[]): number => {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
};

/**
 * The rider's typical speed, as the MEDIAN of their per-ride speeds.
 *
 * Median rather than total distance over total time: one ride that sat paused
 * at a café has a near-zero speed and would drag a pooled average down for
 * every estimate afterwards, where it barely moves a median. Rides that cannot
 * be a bicycle ride at all are dropped before the median is taken — a stopped
 * clock reads as 200 km/h and would otherwise become the middle value on a
 * short history.
 */
export const riderPace = (samples: readonly PaceSample[]): RiderPace => {
  const speeds = samples
    .map(speedOf)
    .filter((speed): speed is number => speed !== null)
    .sort((a, b) => a - b);

  if (speeds.length < MIN_RIDES_FOR_PACE) {
    return { kmh: DEFAULT_PACE_KMH, personal: false, rideCount: speeds.length };
  }

  const factors = samples
    .map(factorOf)
    .filter((factor): factor is number => factor !== null)
    .sort((a, b) => a - b);

  return {
    kmh: median(speeds),
    personal: true,
    rideCount: speeds.length,
    ...(factors.length >= MIN_RIDES_FOR_PACE ? { routerFactor: median(factors) } : {}),
  };
};

/** A pace per bike (owner decision 2026-10-21). */
export interface RiderPaces {
  readonly normal: RiderPace;
  readonly ebike: RiderPace;
}

/**
 * Splits history by the bike recorded at start. Rides from before that was
 * recorded count for the normal bike only while no ride is recorded on the
 * e-bike: once one is, an unrecorded ride could be either, so it is left out
 * rather than guessed.
 */
export const riderPaces = (samples: readonly PaceSample[]): RiderPaces => {
  const usesEbike = samples.some((sample) => sample.isEbike === true);
  return {
    normal: riderPace(
      samples.filter(
        (sample) => sample.isEbike === false || (sample.isEbike === undefined && !usesEbike),
      ),
    ),
    ebike: riderPace(samples.filter((sample) => sample.isEbike === true)),
  };
};

/**
 * Metres of ascent that cost about as much time as a kilometre on the flat.
 *
 * A rough rule cyclists already use, and rough is the honest register here:
 * the alternative is presenting a hilly loop at flat-ground pace, which is
 * wrong in the direction that leaves someone out after dark.
 */
const CLIMB_METERS_PER_FLAT_KM = 10;

/**
 * Minutes for a ride of this length and ascent, at this pace.
 *
 * Climb is folded in as extra distance rather than a slower speed, so a flat
 * loop is unaffected and a steep one is not quietly optimistic.
 */
export const rideMinutes = (
  distanceMeters: number,
  climbMeters: number | null,
  paceKmh: number,
): number => {
  const km = Math.max(0, distanceMeters) / 1000;
  const pace = paceKmh > 0 ? paceKmh : DEFAULT_PACE_KMH;
  const climbPenaltyKm =
    climbMeters !== null && Number.isFinite(climbMeters) && climbMeters > 0
      ? climbMeters / CLIMB_METERS_PER_FLAT_KM
      : 0;
  return Math.max(1, Math.round(((km + climbPenaltyKm) / pace) * 60));
};

/**
 * The pace a ride time should use, or null for the router's time: the pace
 * for the bike selected now, when the rider has not switched it off and has
 * enough rides on that bike.
 */
export const resolveEtaPace = (input: {
  readonly paces: RiderPaces | null;
  readonly enabled: boolean;
  readonly isEbike: boolean;
}): RiderPace | null => {
  const pace = input.isEbike ? input.paces?.ebike : input.paces?.normal;
  return input.enabled && pace?.personal ? pace : null;
};

/**
 * Seconds for a ride: the router's time times the rider's own factor when
 * one is known, otherwise at the rider's pace (see `resolveEtaPace`),
 * otherwise the router's time unchanged.
 *
 * It never scales the router's time by pace: the safe router's own average
 * speed is 12.9 to 19.1 km/h across flat city routes (measured 2026-10-21),
 * so there is no single speed to scale against. The factor is different: it
 * compares this rider with the router's own predictions.
 */
export const personalRideSeconds = (
  route: {
    readonly distanceMeters: number;
    readonly climbMeters?: number | null;
    readonly routerSeconds: number;
    /**
     * True when `routerSeconds` is not a router's prediction (a GPX course
     * is distance at a fixed speed), so the factor does not apply to it.
     */
    readonly routerIsEstimate?: boolean;
  },
  pace: RiderPace | null,
): number => {
  if (!pace?.personal) return route.routerSeconds;
  if (pace.routerFactor !== undefined && !route.routerIsEstimate) {
    return route.routerSeconds * pace.routerFactor;
  }
  return rideMinutes(route.distanceMeters, route.climbMeters ?? null, pace.kmh) * 60;
};
