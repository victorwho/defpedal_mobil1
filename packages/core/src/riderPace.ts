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
  /** The Profile bike for this ride is an e-bike. Absent counts as a normal bike. */
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
 * Splits history by the Profile bike each ride was recorded with, so both
 * paces are kept: switching bike in Profile switches pace, and no ride is
 * dropped from either.
 */
export const riderPaces = (samples: readonly PaceSample[]): RiderPaces => ({
  normal: riderPace(samples.filter((sample) => sample.isEbike !== true)),
  ebike: riderPace(samples.filter((sample) => sample.isEbike === true)),
});

/**
 * Metres of ascent that cost about as much time as a kilometre on the flat.
 *
 * It was 10, which made each 10 m of climb cost a flat kilometre (about 5 min
 * at 12 km/h, 30 s per metre). A tester's 16 km ride with a couple of hundred
 * metres of climb came out at 3 h 27. Measured 2026-10-22: the live safe
 * router takes 3,143 s for Brasov -> Poiana (9.0 km, about 420 m up), 771 s
 * more than the same distance at its flat speed (Bucharest control, 13.6
 * km/h), so about 1.8 s per metre. Lifting a rider and bike (~85 kg) at a
 * leisure 150 W takes ~5.5 s per metre. 60 m per flat km is 5 s per metre at
 * 12 km/h, which sits at the slow, leisure end of the two. Still not quoting
 * a hilly loop at flat-ground pace, the failure that leaves someone out after
 * dark.
 */
export const CLIMB_METERS_PER_FLAT_KM = 60;

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
 * for the rider's bike (Profile), when they have not switched it off and
 * have enough rides on that bike.
 */
export const resolveEtaPace = (input: {
  readonly paces: RiderPaces | null;
  readonly enabled: boolean;
  /** The Profile bike is an e-bike (not the E-bike routing mode). */
  readonly ebikeOwner: boolean;
}): RiderPace | null => {
  const pace = input.ebikeOwner ? input.paces?.ebike : input.paces?.normal;
  return input.enabled && pace?.personal ? pace : null;
};

/**
 * True when a route's time is not a prediction by the selected bike's
 * router, so a router factor must not scale it: a GPX course (distance at a
 * fixed speed) or a loop ridden on an e-bike (loops are always routed on the
 * standard graph). The one definition, so no screen decides it alone.
 */
export const routerTimeIsEstimate = (
  route: { readonly source?: string } | null | undefined,
  isEbike: boolean,
): boolean =>
  route?.source === 'gpx_course' || (route?.source === 'generated_loop' && isEbike);

/**
 * True when the rider's pace changes this route's time, so the time may say
 * "at your pace". On a router's prediction that takes the router factor:
 * until three rides carry one, the router's own time stands (owner decision
 * 2026-10-23, after an average-speed estimate put a tester's 16 km ride at
 * 3 h 27). A time no router made (`routerIsEstimate`) never gets a factor,
 * so the rider's speed replaces it as soon as there is one.
 */
export const paceAppliesTo = (
  route: { readonly routerIsEstimate?: boolean },
  pace: RiderPace | null,
): pace is RiderPace =>
  pace?.personal === true && (pace.routerFactor !== undefined || route.routerIsEstimate === true);

/**
 * Seconds for a ride: the router's time times the rider's own factor when
 * one is known, otherwise the router's time unchanged. A time no router made
 * (a GPX course) is replaced by one at the rider's pace (see `paceAppliesTo`).
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
  if (!paceAppliesTo(route, pace)) return route.routerSeconds;
  if (pace.routerFactor !== undefined && !route.routerIsEstimate) {
    return route.routerSeconds * pace.routerFactor;
  }
  return rideMinutes(route.distanceMeters, route.climbMeters ?? null, pace.kmh) * 60;
};
