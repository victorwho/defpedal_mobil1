/**
 * courseSteps — synthesize turn-by-turn maneuvers from bare geometry.
 *
 * An imported GPX course is a line and nothing else: no maneuvers, no street
 * names, no durations. Every other route in the app arrives from OSRM or
 * Mapbox with `steps` already populated, so navigation (`getNavigationProgress`,
 * the HUD, step advancement) has a step list to work against. This module
 * manufactures that list from the geometry alone.
 *
 * Deliberately pure geometry, and deliberately NOT map-matched: the whole
 * point of importing a course is that the rider wants *that* line. Snapping
 * to the road network would buy street names at the cost of silently moving
 * the rider off the route they chose.
 *
 * The emitted maneuvers use OSRM's own `type` + `modifier` vocabulary, so the
 * existing localized instruction builders (`buildManeuverInstruction`, the
 * HUD's `maneuverShort` labels) render them in EN/RO/ES with no new strings.
 */
import type { Maneuver } from './types';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/**
 * Distance over which the heading before and after a vertex is measured.
 *
 * This is the module's single most important constant. Bearing between two
 * ADJACENT points is dominated by GPS jitter baked into the source trace —
 * a track recorded at 1 Hz has points ~4 m apart, where a 2 m lateral error
 * swings the bearing by tens of degrees. Measuring over a window instead
 * means a turn only registers when the heading change is *sustained* across
 * ~15 m of travel, which is what a real corner looks like and what noise
 * does not.
 *
 * Lower this and dense urban traces sprout hundreds of phantom turns.
 */
const BEARING_WINDOW_METERS = 15;

/** Minimum sustained heading change that counts as a turn worth announcing. */
const TURN_THRESHOLD_DEGREES = 35;

/**
 * Minimum spacing between emitted maneuvers. A single corner spans several
 * vertices, each of which clears the threshold; without suppression one
 * junction becomes a burst of five "turn right" cues. The largest turn in
 * each cluster wins.
 */
const MIN_TURN_SPACING_METERS = 25;

/**
 * Fallback riding speed used to estimate step durations. A GPX course carries
 * no timing at all (and where it does — a recorded ride — that is the source
 * rider's pace, not this one's). Callers that know better should pass
 * `speedMetersPerSecond`; the route-level duration is refined afterwards by
 * the elevation-aware adjustment that every other route gets.
 *
 * 4.2 m/s ≈ 15 km/h — an unhurried urban cycling pace.
 */
export const DEFAULT_COURSE_SPEED_MPS = 4.2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One synthesized step. Mirrors `NavigationStep` minus `instruction`, which
 * needs the rider's locale and is therefore filled in by the app layer.
 *
 * `streetName` is always empty — geometry cannot know it. Downstream builders
 * already handle that case.
 */
export interface CourseStep {
  readonly id: string;
  readonly streetName: '';
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly maneuver: Maneuver;
  readonly mode: 'cycling';
}

export interface CourseManeuver {
  /** Index into the source coordinate array where the turn happens. */
  readonly index: number;
  /** Signed heading change in degrees. Positive turns right (clockwise). */
  readonly angleDegrees: number;
  readonly bearingBefore: number;
  readonly bearingAfter: number;
  readonly modifier: TurnModifier;
}

/** OSRM's modifier vocabulary, narrowed to what geometry can actually infer. */
export type TurnModifier =
  | 'sharp left'
  | 'left'
  | 'slight left'
  | 'straight'
  | 'slight right'
  | 'right'
  | 'sharp right';

export interface BuildCourseStepsOptions {
  /** Overrides the assumed riding speed for duration estimation. */
  readonly speedMetersPerSecond?: number;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Initial bearing from one [lon, lat] point to another, in degrees clockwise
 * from north (0–360).
 */
export const bearingDegrees = (
  from: readonly [number, number],
  to: readonly [number, number],
): number => {
  const lat1 = from[1] * DEG_TO_RAD;
  const lat2 = to[1] * DEG_TO_RAD;
  const deltaLon = (to[0] - from[0]) * DEG_TO_RAD;

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  return (Math.atan2(y, x) * RAD_TO_DEG + 360) % 360;
};

/**
 * Shortest signed difference between two bearings, in (-180, 180].
 * Positive means the second bearing is clockwise (to the right) of the first.
 */
export const normalizeBearingDelta = (delta: number): number => {
  const wrapped = ((delta % 360) + 540) % 360 - 180;
  // ((x % 360) + 540) % 360 - 180 maps to [-180, 180); flip the -180 edge to
  // +180 so a perfect U-turn reads as a right-hand reversal rather than a
  // left one purely by floating-point luck.
  return wrapped === -180 ? 180 : wrapped;
};

/** Bucket a signed heading change into OSRM's modifier vocabulary. */
export const classifyTurnModifier = (angleDegrees: number): TurnModifier => {
  const magnitude = Math.abs(angleDegrees);
  const rightward = angleDegrees > 0;

  if (magnitude < 15) return 'straight';
  if (magnitude < 45) return rightward ? 'slight right' : 'slight left';
  if (magnitude < 120) return rightward ? 'right' : 'left';
  return rightward ? 'sharp right' : 'sharp left';
};

/** Prefix sums of along-line distance, so any span is one subtraction. */
const cumulativeDistances = (
  coordinates: readonly (readonly [number, number])[],
): number[] => {
  const cumulative: number[] = new Array(coordinates.length).fill(0);

  for (let i = 1; i < coordinates.length; i++) {
    const previous = coordinates[i - 1]!;
    const current = coordinates[i]!;
    const lat1 = previous[1] * DEG_TO_RAD;
    const lat2 = current[1] * DEG_TO_RAD;
    const deltaLat = (current[1] - previous[1]) * DEG_TO_RAD;
    const deltaLon = (current[0] - previous[0]) * DEG_TO_RAD;

    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

    cumulative[i] =
      cumulative[i - 1]! + 6371e3 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  return cumulative;
};

/**
 * Last index at least `meters` behind `index`, or -1 when the course does not
 * extend that far back.
 *
 * Returning -1 rather than clamping to 0 is load-bearing. A clamped window
 * measures the heading over whatever short span happens to be available, and
 * over a few meters GPS jitter *is* the signal — which made every course
 * sprout phantom turns in its first and last 15 m. Vertices without a full
 * window are skipped instead; a turn that close to either end is already
 * covered by the depart/arrive step.
 */
const windowStart = (
  cumulative: readonly number[],
  index: number,
  meters: number,
): number => {
  const target = cumulative[index]! - meters;
  for (let i = index - 1; i >= 0; i--) {
    if (cumulative[i]! <= target) return i;
  }
  return -1;
};

/** First index at least `meters` ahead of `index`, or -1. See `windowStart`. */
const windowEnd = (
  cumulative: readonly number[],
  index: number,
  meters: number,
): number => {
  const target = cumulative[index]! + meters;
  for (let i = index + 1; i < cumulative.length; i++) {
    if (cumulative[i]! >= target) return i;
  }
  return -1;
};

// ---------------------------------------------------------------------------
// Maneuver detection
// ---------------------------------------------------------------------------

/**
 * Find the turns along a course.
 *
 * For every interior vertex, compare the heading approaching it (measured
 * back over `BEARING_WINDOW_METERS`) with the heading leaving it (measured
 * forward over the same distance). Vertices whose change clears
 * `TURN_THRESHOLD_DEGREES` become candidates; clusters of candidates within
 * `MIN_TURN_SPACING_METERS` collapse to their sharpest member.
 *
 * Coordinates are [lon, lat] (GeoJSON order) — what `decodePolyline` returns.
 */
export const detectCourseManeuvers = (
  coordinates: readonly (readonly [number, number])[],
): CourseManeuver[] => {
  if (coordinates.length < 3) return [];

  const cumulative = cumulativeDistances(coordinates);
  const candidates: CourseManeuver[] = [];

  for (let i = 1; i < coordinates.length - 1; i++) {
    const before = windowStart(cumulative, i, BEARING_WINDOW_METERS);
    const after = windowEnd(cumulative, i, BEARING_WINDOW_METERS);

    // Too close to an end of the course to measure a trustworthy heading.
    if (before < 0 || after < 0) continue;

    const bearingBefore = bearingDegrees(coordinates[before]!, coordinates[i]!);
    const bearingAfter = bearingDegrees(coordinates[i]!, coordinates[after]!);
    const angleDegrees = normalizeBearingDelta(bearingAfter - bearingBefore);

    if (Math.abs(angleDegrees) < TURN_THRESHOLD_DEGREES) continue;

    candidates.push({
      index: i,
      angleDegrees,
      bearingBefore,
      bearingAfter,
      modifier: classifyTurnModifier(angleDegrees),
    });
  }

  // Non-maximum suppression. Clustering keys off the gap between CONSECUTIVE
  // candidates rather than the distance from the cluster's first member: a
  // corner taken on a wide radius flags a continuous run of vertices that can
  // easily span more than `MIN_TURN_SPACING_METERS` end to end, and measuring
  // from the start of the run would split one sweeping turn into two cues.
  // Genuinely separate turns are divided by straight road, which produces no
  // candidates at all, so the gap rule separates them cleanly.
  const maneuvers: CourseManeuver[] = [];
  let strongest: CourseManeuver | undefined;
  let previousCandidate: CourseManeuver | undefined;

  for (const candidate of candidates) {
    const startsNewCluster =
      previousCandidate === undefined ||
      cumulative[candidate.index]! - cumulative[previousCandidate.index]! >=
        MIN_TURN_SPACING_METERS;

    if (startsNewCluster) {
      if (strongest !== undefined) maneuvers.push(strongest);
      strongest = candidate;
    } else if (
      strongest === undefined ||
      Math.abs(candidate.angleDegrees) > Math.abs(strongest.angleDegrees)
    ) {
      strongest = candidate;
    }

    previousCandidate = candidate;
  }

  if (strongest !== undefined) maneuvers.push(strongest);

  return maneuvers;
};

// ---------------------------------------------------------------------------
// Step assembly
// ---------------------------------------------------------------------------

const makeManeuver = (
  type: string,
  location: readonly [number, number],
  bearingBefore: number,
  bearingAfter: number,
  modifier?: TurnModifier,
): Maneuver => ({
  type,
  location: [location[0], location[1]],
  bearing_before: Math.round(bearingBefore),
  bearing_after: Math.round(bearingAfter),
  ...(modifier === undefined ? {} : { modifier }),
});

/**
 * Build the full step list for a course.
 *
 * Follows OSRM's step semantics exactly, because that is what
 * `getNavigationProgress` and the HUD already expect:
 *   - `steps[i].maneuver` is the maneuver at the START of step i
 *   - `steps[i].distanceMeters` is the distance travelled DURING step i,
 *     i.e. from its own maneuver to the next one
 *   - the final `arrive` step has zero distance and duration
 *
 * Returns `[]` for degenerate geometry (fewer than two points) rather than a
 * one-step route to nowhere — callers should treat that as an unusable course.
 */
export const buildCourseSteps = (
  coordinates: readonly (readonly [number, number])[],
  options?: BuildCourseStepsOptions,
): CourseStep[] => {
  if (coordinates.length < 2) return [];

  const speed = options?.speedMetersPerSecond ?? DEFAULT_COURSE_SPEED_MPS;
  const cumulative = cumulativeDistances(coordinates);
  const maneuvers = detectCourseManeuvers(coordinates);
  const lastIndex = coordinates.length - 1;

  // Boundaries: start, every turn, finish.
  const boundaries = [0, ...maneuvers.map((m) => m.index), lastIndex];
  const steps: CourseStep[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const startIndex = boundaries[i]!;
    const endIndex = boundaries[i + 1]!;
    const distanceMeters = cumulative[endIndex]! - cumulative[startIndex]!;

    // i === 0 is the departure; every later boundary is a detected turn, so
    // it maps 1:1 onto `maneuvers[i - 1]`.
    const turn = i === 0 ? undefined : maneuvers[i - 1];
    const departureBearing = bearingDegrees(
      coordinates[0]!,
      coordinates[Math.min(1, lastIndex)]!,
    );

    steps.push({
      id: `course-step-${i}`,
      streetName: '',
      distanceMeters,
      durationSeconds: speed > 0 ? distanceMeters / speed : 0,
      mode: 'cycling',
      maneuver:
        turn === undefined
          ? makeManeuver('depart', coordinates[0]!, departureBearing, departureBearing)
          : makeManeuver(
              'turn',
              coordinates[turn.index]!,
              turn.bearingBefore,
              turn.bearingAfter,
              turn.modifier,
            ),
    });
  }

  const finalBearing = bearingDegrees(
    coordinates[Math.max(0, lastIndex - 1)]!,
    coordinates[lastIndex]!,
  );

  steps.push({
    id: `course-step-${steps.length}`,
    streetName: '',
    distanceMeters: 0,
    durationSeconds: 0,
    mode: 'cycling',
    maneuver: makeManeuver('arrive', coordinates[lastIndex]!, finalBearing, finalBearing),
  });

  return steps;
};

/**
 * Is this route an imported GPX course rather than one we computed?
 *
 * The single named predicate for course behaviour — most importantly the
 * auto-reroute suppression in navigation. Rerouting a course replaces the
 * rider's imported line with our own, mid-ride and with no undo, which from
 * their point of view is losing the exact thing they came here to follow.
 *
 * A named predicate rather than an inline `source === …` at each call site,
 * per error-log #20: navigation already has three separate paths that can
 * trigger a reroute, and a check that lives at only one of them is a gate
 * that the next path silently walks around.
 */
export const isCourseRoute = (
  route: { readonly source?: string } | null | undefined,
): boolean => route?.source === 'gpx_course';

/** Total along-line length of a course in meters. */
export const courseDistanceMeters = (
  coordinates: readonly (readonly [number, number])[],
): number => {
  if (coordinates.length < 2) return 0;
  const cumulative = cumulativeDistances(coordinates);
  return cumulative[cumulative.length - 1]!;
};
