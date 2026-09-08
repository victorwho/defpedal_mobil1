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

  const middle = Math.floor(speeds.length / 2);
  const median =
    speeds.length % 2 === 0
      ? (speeds[middle - 1]! + speeds[middle]!) / 2
      : speeds[middle]!;

  return { kmh: median, personal: true, rideCount: speeds.length };
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
