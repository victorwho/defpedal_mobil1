/**
 * loopPlan — the brain of the recreational loop generator.
 *
 * Pure geometry and arithmetic: no I/O, no clock, no OSRM. The mobile
 * orchestrator (`apps/mobile/src/lib/loop-generator.ts`) supplies the network
 * and calls into here for every decision it has to justify to a rider.
 *
 * Why this lives in core rather than beside the fetcher: every number in here
 * is a product claim. The distance tolerance is what "15 km" means; the
 * terrain cuts are what "hilly" means; the relaxation ladder is what the
 * result card promises when it says the heading moved. Those belong in one
 * tested module, not scattered across a screen (error-log #20 — a per-feature
 * constant that lived at its call site went invisible to every other surface
 * and outlived the limitation it encoded by twelve days).
 *
 * Three constraints from the routing stack shape everything here, and none of
 * them are negotiable from the client:
 *
 *   - OSRM has no round-trip service, so a loop is a waypoint ring we
 *     synthesize and then measure. `ringWaypoints` + `nextRingRadiusMeters`
 *     are that loop.
 *   - Climb cannot be requested, only measured. `classifyTerrain` therefore
 *     runs on a finished route, and `Flat` is the only terrain we can steer
 *     with (by routing the ring through the flat OSRM instance).
 *   - Offroad difficulty has no data path at all — `bicycle36.lua` declares
 *     exactly one excludable class, `unpaved`. Hence two surface states, not
 *     a technicality dial.
 */
import { destinationPoint, haversineDistance } from './distance';
import type { Coordinate, RiskSegment } from './contracts';
import { findHighRiskStretches } from './riskStretch';
import { riskSegmentDistanceMeters } from './riskDistribution';

// ---------------------------------------------------------------------------
// Request vocabulary
// ---------------------------------------------------------------------------

/**
 * What the rider asked the terrain to be.
 *
 * Deliberately three words and not a number. Climb is measured after routing,
 * so a numeric target ("600 m") is a promise the terrain cannot keep — in
 * Bucharest it is unsatisfiable at any distance, and every result becomes an
 * apology. A preference can miss honestly; a target cannot.
 */
export type LoopTerrain = 'flat' | 'rolling' | 'hilly';

/**
 * Surface appetite.
 *
 * `paved` and `any` are routing states: they map onto `exclude=unpaved` being
 * on or off, which is the only surface lever `bicycle36.lua` exposes.
 *
 * `offroad` is NOT a routing state, because OSRM has no inverse of `exclude` —
 * you cannot ask it to *seek* a class. It is a RANKING: generate without the
 * exclusion, measure how much of each candidate is unpaved, and prefer the
 * loop with the most. That is a weaker promise than a router-enforced one, so
 * the share is shown on every result and the rider can see whether it worked.
 *
 * Still no technicality dial. `mtb:scale` and `tracktype` remain invisible to
 * routing, so "offroad" means unpaved, never "difficult".
 */
export type LoopSurface = 'paved' | 'any' | 'offroad';

/** Does this appetite forbid unpaved outright? Only `paved` does. */
export const excludesUnpaved = (surface: LoopSurface): boolean =>
  surface === 'paved';

/** Should candidates be ranked by how much of them is unpaved? */
export const prefersUnpaved = (surface: LoopSurface): boolean =>
  surface === 'offroad';

/** Eight compass points plus "wherever" — the rider's local knowledge. */
export type LoopHeading =
  | 'any'
  | 'N'
  | 'NE'
  | 'E'
  | 'SE'
  | 'S'
  | 'SW'
  | 'W'
  | 'NW';

export const LOOP_HEADINGS: readonly LoopHeading[] = [
  'any',
  'N',
  'NE',
  'E',
  'SE',
  'S',
  'SW',
  'W',
  'NW',
];

/** Compass bearing in degrees for each named heading. `any` has none. */
const HEADING_BEARINGS: Record<Exclude<LoopHeading, 'any'>, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

/**
 * Distances offered by the picker, in metres.
 *
 * Snapped rather than a free slider because 23 versus 24 km is a distinction
 * the generator cannot honour — the tolerance below is ±12%, which is wider
 * than the gap. Offering precision we cannot deliver invites the rider to
 * read every result as a near miss.
 */
export const LOOP_DISTANCE_STEPS_METERS: readonly number[] = [
  5_000, 10_000, 15_000, 20_000, 30_000, 40_000, 60_000, 80_000, 100_000,
];

export interface LoopRequest {
  readonly start: Coordinate;
  readonly targetDistanceMeters: number;
  readonly terrain: LoopTerrain;
  readonly surface: LoopSurface;
  readonly heading: LoopHeading;
}

// ---------------------------------------------------------------------------
// Ring geometry
// ---------------------------------------------------------------------------

/** Waypoints per ring. Three makes a triangle — the cheapest closed shape. */
export const RING_WAYPOINT_COUNT = 3;

/**
 * Ring shapes to sample across a batch of candidates.
 *
 * Shape matters as much as bearing, and NEITHER value wins everywhere —
 * measured against live OSRM at the converged radius, a triangle found three
 * compliant loops in eight around Brasov and none at all around Bucharest,
 * while a hexagon did the exact opposite. Rather than pick a loser, alternate:
 * a batch spans both, which doubles the shape diversity for no extra requests.
 */
export const RING_WAYPOINT_CHOICES: readonly number[] = [3, 6];

/** Ring shape for the nth candidate in a batch. */
export const ringWaypointCountFor = (index: number): number =>
  RING_WAYPOINT_CHOICES[
    Math.abs(Math.floor(index)) % RING_WAYPOINT_CHOICES.length
  ]!;

/**
 * Perimeter of a regular n-gon inscribed in a unit circle: `2n·sin(π/n)`.
 *
 * Three points give 3√3 ≈ 5.196; six give 6.0; the limit is 2π. This is the
 * *floor* on how long a ring can be — real roads never achieve it, which is
 * what `DEFAULT_DETOUR_FACTOR` accounts for. It has to vary with the shape or
 * a hexagonal ring is sized as though it were a triangle and comes back long.
 */
export const ringPerimeterFactor = (waypointCount: number): number => {
  const n = Math.max(2, Math.floor(waypointCount));
  return 2 * n * Math.sin(Math.PI / n);
};

/** Perimeter factor for the default triangular ring. */
export const RING_PERIMETER_FACTOR = 3 * Math.sqrt(3);

/**
 * How much longer the road distance is than the ideal polygon perimeter.
 *
 * MEASURED, not guessed. 120 rings routed against the live safety profile in
 * five cities (Rasnov, Brasov, Bucharest, Cluj, Timisoara) at 15/30/50 km:
 *
 *   3-point rings  median 2.11   (min 1.67, max 2.96)
 *   6-point rings  median 2.54   (min 1.93, max 3.74)
 *
 * The old value was 1.25, and the comment called it "deliberately
 * conservative". It was not conservative, it was wrong by a factor of two:
 * every first attempt came back about 86% too long, one damped correction only
 * reached ~26% off, and the tolerance is 12% — so with a two-attempt budget
 * almost NO candidate ever landed. The search relaxed its distance filter on
 * essentially every run, which is why loops came back the wrong length and why
 * so few survived to be offered.
 *
 * It has to vary with the shape: more waypoints means more forced turns, and
 * the six-point ring realises a fifth more detour than the triangle. Linear
 * between the two measured points, clamped either side.
 */
export const ringDetourFactor = (waypointCount: number): number => {
  const n = Math.max(2, Math.floor(waypointCount));
  const factor = 2.11 + ((2.54 - 2.11) / 3) * (n - 3);
  return Math.min(3, Math.max(1.8, factor));
};

/**
 * Detour on the out-and-back stem of a lollipop, measured the same way.
 *
 * 1.86 (n=60, min 1.36, max 2.93) — lower than a ring's, because a stem is a
 * point-to-point ride that can take the direct road, where a ring is dragged
 * through waypoints that no single road serves. Applying the ring's factor to
 * the stem, as the first version did, skewed the split between how far out the
 * loop sits and how big it is.
 */
export const STEM_DETOUR_FACTOR = 1.86;

/**
 * Kept for callers that want one number. Prefer `ringDetourFactor`, which is
 * shape-aware; this is the three-point value.
 */
export const DEFAULT_DETOUR_FACTOR = 2.11;

/**
 * Radius for a first attempt at `targetDistanceMeters` with a given ring shape.
 *
 * `waypointCount` comes before `detourFactor` because the shape varies per
 * candidate while the detour factor almost never does.
 */
export const initialRingRadiusMeters = (
  targetDistanceMeters: number,
  waypointCount: number = RING_WAYPOINT_COUNT,
  detourFactor: number = ringDetourFactor(waypointCount),
): number => {
  const safeTarget = Math.max(0, targetDistanceMeters);
  const safeDetour =
    detourFactor > 0 ? detourFactor : ringDetourFactor(waypointCount);
  return safeTarget / (ringPerimeterFactor(waypointCount) * safeDetour);
};

/**
 * Damping on the proportional radius correction.
 *
 * A raw `radius × (target / actual)` correction oscillates in networks where
 * the road distance responds non-linearly to the radius — a slightly bigger
 * ring crosses a river and jumps 4 km. Damping to 70% of the indicated move
 * converges more slowly in the easy case and far more reliably in the hard
 * one, which is the right trade when every iteration is a network round trip.
 */
const RADIUS_CORRECTION_DAMPING = 0.7;

/** Never let one correction move the radius by more than this factor. */
const MAX_RADIUS_CORRECTION = 2;

/**
 * Radius to try next, given what the last radius actually produced.
 *
 * Returns the previous radius unchanged when the measurement is unusable
 * (zero or negative distance), because OSRM answers out-of-coverage requests
 * with a degenerate distance-0 route rather than an error — correcting off
 * that number would send the radius to infinity.
 */
export const nextRingRadiusMeters = (
  previousRadiusMeters: number,
  actualDistanceMeters: number,
  targetDistanceMeters: number,
): number => {
  if (actualDistanceMeters <= 0 || previousRadiusMeters <= 0) {
    return previousRadiusMeters;
  }

  const indicated = targetDistanceMeters / actualDistanceMeters;
  const damped = 1 + (indicated - 1) * RADIUS_CORRECTION_DAMPING;
  const clamped = Math.min(
    MAX_RADIUS_CORRECTION,
    Math.max(1 / MAX_RADIUS_CORRECTION, damped),
  );

  return previousRadiusMeters * clamped;
};

/**
 * The waypoints of one candidate ring, in ride order.
 *
 * `bearingDegrees` is the direction of the first waypoint from the start, so
 * it is also the direction the rider sets off in — which is exactly what the
 * heading control promises. The remaining waypoints are spaced evenly around
 * the circle so the route has to come back the far side rather than
 * retracing.
 */
export const ringWaypoints = (
  start: Coordinate,
  radiusMeters: number,
  bearingDegrees: number,
  waypointCount: number = RING_WAYPOINT_COUNT,
): Coordinate[] => {
  const count = Math.max(1, Math.floor(waypointCount));
  const spacing = 360 / count;

  return Array.from({ length: count }, (_, index) =>
    destinationPoint(start, bearingDegrees + spacing * index, radiusMeters),
  );
};

/**
 * How far the ring's NEAR EDGE should sit from the start, as a fraction of the
 * ride, when the rider wants to get out of town before looping.
 *
 * Expressed as clearance rather than as a stem length because clearance is the
 * thing the rider actually cares about: "the loop happens out there, not round
 * my house". A stem fraction leaves the ring's near edge wherever the
 * arithmetic lands — at a third of a 20 km ride it lands 1.3 km from the
 * start, which is still inside a small town, which is exactly the complaint
 * this shape exists to answer.
 */
export const RING_CLEARANCE_FRACTION = 0.14;

/** Clearance never drops below this, or the ring is still in the suburbs. */
export const MIN_RING_CLEARANCE_METERS = 2000;

/**
 * Nor above this: past it the ride is mostly approach, and the ring shrinks
 * until it has no road network to land on.
 */
export const MAX_RING_CLEARANCE_METERS = 8000;

/** How far out to put the loop, for a given ride length. */
export const ringClearanceMeters = (targetDistanceMeters: number): number =>
  Math.min(
    MAX_RING_CLEARANCE_METERS,
    Math.max(
      MIN_RING_CLEARANCE_METERS,
      Math.max(0, targetDistanceMeters) * RING_CLEARANCE_FRACTION,
    ),
  );

/**
 * Waypoints for a lollipop: ride out, loop somewhere else, ride home.
 *
 * The anchor — the point the ring is built around — is included as a waypoint
 * BEFORE and AFTER the ring. That is load-bearing twice over.
 *
 * It makes the shape real. Without it the router is handed a ring that merely
 * sits off to one side, and it enters and leaves that ring wherever is
 * cheapest; there is no ride-out, and measured against live OSRM the result is
 * an offset ring whose near edge comes back within 40 m of the start. With the
 * anchor the router must reach that point before the loop and again after it,
 * which is what "go out to the foothills, loop there, come home" means.
 *
 * It also makes the stem exactly measurable: the anchor is a leg boundary, so
 * the approach is the first and last leg and `splitStemAndRing` needs no
 * inference. See the note there about the mirrored-prefix detector this
 * replaced, which never fired.
 *
 * Sizing solves for the clearance the rider wants rather than a fixed stem
 * fraction. With approach S, ring radius r, perimeter factor P and detour d:
 *   2·S·d + P·r·d = budget   and   S − r = clearance
 * so r = (budget − 2·clearance·d) / (d·(2 + P)).
 *
 * The ring is thrown at `bearing + 180` so its first waypoint faces back
 * towards the start: the router reaches the near side of the ring first and
 * goes round, instead of overshooting to the far side and doubling back.
 */
export const lollipopWaypoints = (
  start: Coordinate,
  bearingDegrees: number,
  targetDistanceMeters: number,
  waypointCount: number = RING_WAYPOINT_COUNT,
  clearanceMeters: number = ringClearanceMeters(targetDistanceMeters),
  detourFactor: number = ringDetourFactor(waypointCount),
): Coordinate[] => {
  const target = Math.max(0, targetDistanceMeters);
  const ringDetour =
    detourFactor > 0 ? detourFactor : ringDetourFactor(waypointCount);
  const count = Math.max(1, Math.floor(waypointCount));
  const perimeter = ringPerimeterFactor(count);

  // Clamp so the ring never inverts on a budget too small for the clearance
  // asked of it — a negative radius would put the waypoints behind the rider.
  const maxClearance = target / (2 * STEM_DETOUR_FACTOR);
  const clearance = Math.min(
    Math.max(0, clearanceMeters),
    Math.max(0, maxClearance * 0.8),
  );

  // 2·S·stemDetour + P·r·ringDetour = budget, with S = r + clearance.
  // The stem gets its own factor: it is a point-to-point ride that can take
  // the direct road, where the ring is dragged through waypoints no single
  // road serves.
  const radius = Math.max(
    0,
    (target - 2 * clearance * STEM_DETOUR_FACTOR) /
      (2 * STEM_DETOUR_FACTOR + perimeter * ringDetour),
  );
  const anchor = destinationPoint(start, bearingDegrees, radius + clearance);

  return [
    anchor,
    ...ringWaypoints(anchor, radius, bearingDegrees + 180, count),
    anchor,
  ];
};

/**
 * Legs at each end of a lollipop that are approach rather than loop.
 *
 * One, because `lollipopWaypoints` puts the anchor in the list once before the
 * ring and once after it. Exported so the caller measuring a route cannot
 * disagree with the caller building it.
 */
export const LOLLIPOP_STEM_LEGS = 1;

// ---------------------------------------------------------------------------
// Bearings
// ---------------------------------------------------------------------------

/**
 * How many rings a single attempt throws.
 *
 * Five, not eight. Every ring is a network round trip the rider waits through,
 * and the fourth-through-eighth bearings were mostly producing near-duplicates
 * of their neighbours once the heading arc narrowed them — more waiting for
 * less choice. Five still samples both extremes of the arc and its middle,
 * caps an attempt at 10 OSRM calls across the two rungs that cost network, and
 * shortens the wait by roughly a third.
 */
export const LOOP_CANDIDATE_COUNT = 5;

/**
 * How many loops the rider is actually offered.
 *
 * Five, and this is the number that governs the list — not
 * `LOOP_CANDIDATE_COUNT`, which is how many rings ONE rung of the ladder
 * throws. Two rungs cost network, so a search generates ten candidates and
 * the rider was being shown all of them: ten rows, of which only the measured
 * finalists carried a climb figure and the rest read as a dash.
 *
 * Generation is deliberately NOT halved to match. Breadth is what makes a loop
 * clear the doubling-back cap at all — measured around Rasnov and Bucharest,
 * whether any candidate passes is decided by bearing and ring shape, so
 * throwing half as many rings would mean worse loops rather than a shorter
 * list. Ten are found, the best five are offered, and all five are measured.
 */
export const LOOP_RESULTS_SHOWN = 5;

/**
 * Half-width of the arc a named heading is allowed to search, per relaxation
 * level. Index 0 is the strict interpretation of "east"; index 1 is the first
 * rung of the ladder.
 *
 * 25° is a little wider than the 22.5° a strict eight-point compass would
 * give, so a loop that leaves due east but curls slightly north still counts
 * as east — which is what a rider means by the word.
 */
export const HEADING_ARC_HALF_WIDTHS_DEGREES: readonly number[] = [25, 70];

export const normalizeBearing = (degrees: number): number =>
  ((degrees % 360) + 360) % 360;

/**
 * Bearings to try, spread across the arc the heading allows.
 *
 * `any` spreads evenly over the full circle. A named heading spreads evenly
 * across its arc, endpoints included, so the extremes of what the rider asked
 * for are always sampled rather than only the middle.
 */
export const loopBearings = (
  heading: LoopHeading,
  count: number = LOOP_CANDIDATE_COUNT,
  arcHalfWidthDegrees: number = HEADING_ARC_HALF_WIDTHS_DEGREES[0]!,
): number[] => {
  const n = Math.max(1, Math.floor(count));

  if (heading === 'any') {
    return Array.from({ length: n }, (_, i) => normalizeBearing((360 / n) * i));
  }

  const centre = HEADING_BEARINGS[heading];
  if (n === 1) return [normalizeBearing(centre)];

  const span = arcHalfWidthDegrees * 2;
  return Array.from({ length: n }, (_, i) =>
    normalizeBearing(centre - arcHalfWidthDegrees + (span / (n - 1)) * i),
  );
};

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

/**
 * Climb per kilometre at which a loop stops being flat and starts rolling.
 *
 * Cycling convention rather than an invented scale: under ~8 m/km a route
 * reads as flat to a rider (a 15 km loop with less than 120 m of climb), and
 * at 18 m/km and above it reads as hilly (270 m over the same 15 km).
 */
export const TERRAIN_ROLLING_METERS_PER_KM = 8;
export const TERRAIN_HILLY_METERS_PER_KM = 18;

/** Climb per kilometre, guarding the zero-distance case. */
export const climbPerKilometre = (
  climbMeters: number,
  distanceMeters: number,
): number => {
  if (distanceMeters <= 0) return 0;
  return climbMeters / (distanceMeters / 1000);
};

/**
 * What terrain a *finished* route actually is.
 *
 * Runs after measurement, never before — this is the whole reason terrain is
 * a preference and not a constraint.
 */
export const classifyTerrain = (
  climbMeters: number,
  distanceMeters: number,
): LoopTerrain => {
  const perKm = climbPerKilometre(climbMeters, distanceMeters);
  if (perKm >= TERRAIN_HILLY_METERS_PER_KM) return 'hilly';
  if (perKm >= TERRAIN_ROLLING_METERS_PER_KM) return 'rolling';
  return 'flat';
};

/**
 * Does routing this terrain go through the flat OSRM instance?
 *
 * The one place the asymmetry between Flat and Hilly is stated. `bicycle36-flat`
 * carries a 7× uphill penalty, so asking for flat is a real routing constraint
 * we can satisfy directly. There is no hill-seeking counterpart, so Rolling and
 * Hilly can only be ranked after the fact.
 *
 * Callers must remember this has a billing consequence: the flat instance is
 * the metered Plus surface, so starting a flat loop also charges
 * `flatRidesPerMonth`.
 */
export const usesFlatProfile = (terrain: LoopTerrain): boolean =>
  terrain === 'flat';

/** Distance from the asked-for terrain, in bands. 0 is an exact match. */
export const terrainDistance = (
  actual: LoopTerrain,
  wanted: LoopTerrain,
): number => {
  const order: LoopTerrain[] = ['flat', 'rolling', 'hilly'];
  return Math.abs(order.indexOf(actual) - order.indexOf(wanted));
};

// ---------------------------------------------------------------------------
// Relaxation ladder
// ---------------------------------------------------------------------------

/**
 * What was given up to produce a result, in the order it is given up.
 *
 * The ladder is fixed rather than negotiated with the rider mid-wait, and
 * every rung is named on the result card. Heading goes first because it is
 * the constraint a rider is most often expressing as a preference ("not past
 * the landfill again") rather than a requirement; terrain goes last because
 * it is the one they are most likely to have opened the screen for.
 */
export type LoopRelaxation =
  | 'none'
  | 'heading'
  | 'distance'
  | 'terrain'
  | 'retrace';

export const LOOP_RELAXATION_LADDER: readonly LoopRelaxation[] = [
  'none',
  'heading',
  'distance',
  'terrain',
  // Last, and only ever reached when nothing else worked. Giving the rider a
  // loop that repeats a third of itself is worse than giving them the wrong
  // terrain, so the cap outlives every other preference.
  'retrace',
];

/** Fraction of the target a result may miss by, per relaxation level. */
export const DISTANCE_TOLERANCE_STRICT = 0.12;
export const DISTANCE_TOLERANCE_RELAXED = 0.25;

export const distanceToleranceFor = (relaxation: LoopRelaxation): number =>
  relaxation === 'distance' ||
  relaxation === 'terrain' ||
  relaxation === 'retrace'
    ? DISTANCE_TOLERANCE_RELAXED
    : DISTANCE_TOLERANCE_STRICT;

export const headingArcFor = (relaxation: LoopRelaxation): number =>
  relaxation === 'none'
    ? HEADING_ARC_HALF_WIDTHS_DEGREES[0]!
    : HEADING_ARC_HALF_WIDTHS_DEGREES[1]!;

/** Is the heading constraint still applied at this rung? */
export const headingAppliesAt = (relaxation: LoopRelaxation): boolean =>
  relaxation === 'none' || relaxation === 'heading';

/** Is the terrain preference still a filter at this rung? */
export const terrainAppliesAt = (relaxation: LoopRelaxation): boolean =>
  relaxation !== 'terrain' && relaxation !== 'retrace';

/** Is the doubling-back cap still enforced at this rung? */
export const retraceAppliesAt = (relaxation: LoopRelaxation): boolean =>
  relaxation !== 'retrace';

/**
 * Does a candidate satisfy the doubling-back cap at this rung?
 *
 * A route whose retracing could not be measured (no `annotation.nodes`) reads
 * as 0 and therefore passes — an unmeasurable loop must not be rejected on a
 * guess, the same rule `retracedShare` follows.
 */
export const withinRetraceCap = (
  candidate: Pick<LoopCandidate, 'ringRetracedShare'>,
  relaxation: LoopRelaxation,
): boolean => {
  if (!retraceAppliesAt(relaxation)) return true;
  // A missing or non-finite share means we could not measure this loop, not
  // that it is bad. Rejecting on that would discard a perfectly good loop, and
  // `<= ` against undefined is false — silently failing every candidate.
  if (!Number.isFinite(candidate.ringRetracedShare)) return true;
  return candidate.ringRetracedShare <= MAX_RETRACE_SHARE;
};

export const nextRelaxation = (
  current: LoopRelaxation,
): LoopRelaxation | null => {
  const index = LOOP_RELAXATION_LADDER.indexOf(current);
  if (index < 0 || index >= LOOP_RELAXATION_LADDER.length - 1) return null;
  return LOOP_RELAXATION_LADDER[index + 1]!;
};

// ---------------------------------------------------------------------------
// Unpaved share
// ---------------------------------------------------------------------------

/**
 * The per-edge annotation arrays OSRM returns alongside a route leg.
 *
 * All three ride along on requests we already make with `annotations=true`,
 * so everything derived from them is free.
 */
export interface AnnotatedLeg {
  readonly annotation?: {
    /** Length of each edge, in metres. */
    readonly distance?: number[];
    /** Class names per edge — `unpaved`, `tunnel`, `bridge`. */
    readonly classes?: string[];
    /** OSM node ids along the leg: `nodes.length === distance.length + 1`. */
    readonly nodes?: number[];
  };
}

/** @deprecated Use {@link AnnotatedLeg}. */
export type SurfaceAnnotatedLeg = AnnotatedLeg;

/**
 * Metres of a route on unpaved ways, and the metres we could classify at all.
 *
 * Free: `bicycle36.lua` sets `forward_classes['unpaved']`, so the class rides
 * along in `annotation.classes` on every request we already make with
 * `annotations=true` — the same array `routeFeatures` reads for tunnels and
 * bridges. No extra call, no rate-limit cost.
 *
 * `classifiedMeters` is returned rather than assumed equal to the route length
 * because a leg can arrive with no `classes` array at all (Mapbox never sends
 * one). Reporting a share of a length we could not classify would understate
 * it and look like the preference did nothing.
 */
export const unpavedMeters = (
  legs: readonly AnnotatedLeg[],
): { unpavedMeters: number; classifiedMeters: number } => {
  let unpaved = 0;
  let classified = 0;

  for (const leg of legs) {
    const classes = leg.annotation?.classes;
    const distances = leg.annotation?.distance;
    if (!classes || !distances) continue;

    const edges = Math.min(classes.length, distances.length);
    for (let i = 0; i < edges; i += 1) {
      const metres = distances[i] ?? 0;
      if (metres <= 0) continue;
      classified += metres;
      // OSRM may report one class or several per edge; the shipped
      // tunnel/bridge reader assumes a plain string, so accept both rather
      // than depending on which.
      const cls = classes[i];
      if (cls === 'unpaved' || (typeof cls === 'string' && cls.split(',').includes('unpaved'))) {
        unpaved += metres;
      }
    }
  }

  return { unpavedMeters: unpaved, classifiedMeters: classified };
};

/**
 * Fraction of a route that is unpaved, in [0, 1].
 *
 * Returns 0 when nothing could be classified — never `NaN`, and never a
 * flattering guess.
 */
export const unpavedShare = (
  legs: readonly AnnotatedLeg[],
): number => {
  const { unpavedMeters: unpaved, classifiedMeters } = unpavedMeters(legs);
  if (classifiedMeters <= 0) return 0;
  return Math.min(1, Math.max(0, unpaved / classifiedMeters));
};

// ---------------------------------------------------------------------------
// Doubling back
// ---------------------------------------------------------------------------

/**
 * Metres of a route ridden twice, and its total classified length.
 *
 * "Twice" is exact, not approximate: an edge is the pair of OSM nodes at its
 * ends, and an edge counts as retraced when that pair appears more than once
 * anywhere in the route. Direction is ignored — riding up a hill and back down
 * the same road is the case this exists to catch, and those two traversals have
 * their node pair reversed.
 *
 * Every metre of a repeated edge counts, including the first pass. A spur that
 * is ridden out and back contributes its whole length twice, which is what a
 * rider means when they say half of it was doubling back.
 *
 * Node ids are global to OSM, so accumulating across the four legs of a
 * waypoint ring works without any per-leg bookkeeping.
 *
 * Geometry is deliberately NOT used. Two roads can run within a few metres of
 * each other — a dual carriageway, a towpath beside a canal — and a proximity
 * test would call those a retrace when they are the opposite: a legitimate way
 * back on a different road.
 */
export const retracedMeters = (
  legs: readonly AnnotatedLeg[],
): { retracedMeters: number; totalMeters: number } => {
  const lengthByEdge = new Map<string, number>();
  const countByEdge = new Map<string, number>();
  let total = 0;

  for (const leg of legs) {
    const nodes = leg.annotation?.nodes;
    const distances = leg.annotation?.distance;
    if (!nodes || !distances) continue;

    const edges = Math.min(nodes.length - 1, distances.length);
    for (let i = 0; i < edges; i += 1) {
      const metres = distances[i] ?? 0;
      if (metres <= 0) continue;

      const a = nodes[i]!;
      const b = nodes[i + 1]!;
      // Unordered pair: the same stretch ridden the other way is the same edge.
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;

      total += metres;
      countByEdge.set(key, (countByEdge.get(key) ?? 0) + 1);
      lengthByEdge.set(key, (lengthByEdge.get(key) ?? 0) + metres);
    }
  }

  let retraced = 0;
  for (const [key, count] of countByEdge) {
    if (count > 1) retraced += lengthByEdge.get(key) ?? 0;
  }

  return { retracedMeters: retraced, totalMeters: total };
};

/**
 * Fraction of a loop ridden twice, in [0, 1].
 *
 * 0 is a clean loop that comes back a different way. Around 1 is a there-and-
 * back wearing a loop's clothes. Returns 0 when nodes are unavailable — an
 * unmeasurable route must not be penalised into last place on a guess.
 */
export const retracedShare = (legs: readonly AnnotatedLeg[]): number => {
  const { retracedMeters: retraced, totalMeters } = retracedMeters(legs);
  if (totalMeters <= 0) return 0;
  return Math.min(1, Math.max(0, retraced / totalMeters));
};

/**
 * One route, split into the part ridden out and back to reach the riding, and
 * the part that is actually a loop.
 */
export interface StemAndRing {
  /** Metres of the out-and-back approach, counting BOTH passes. */
  readonly stemMeters: number;
  /** Metres of the loop at the far end. */
  readonly ringMeters: number;
  /** Metres inside the ring that are ridden twice. */
  readonly ringRetracedMeters: number;
}

/** An edge key that ignores direction: the same stretch, ridden either way. */
const edgeKey = (a: number, b: number): string =>
  a < b ? `${a}:${b}` : `${b}:${a}`;

/** Flatten a route's legs into one ordered list of (edge, length). */
const routeEdges = (
  legs: readonly AnnotatedLeg[],
): { key: string; meters: number }[] => {
  const edges: { key: string; meters: number }[] = [];
  for (const leg of legs) {
    const nodes = leg.annotation?.nodes;
    const distances = leg.annotation?.distance;
    if (!nodes || !distances) continue;
    const count = Math.min(nodes.length - 1, distances.length);
    for (let i = 0; i < count; i += 1) {
      const meters = distances[i] ?? 0;
      if (meters <= 0) continue;
      edges.push({ key: edgeKey(nodes[i]!, nodes[i + 1]!), meters });
    }
  }
  return edges;
};

/**
 * The set of road stretches a route uses, as undirected edge keys.
 *
 * Undirected is the point: a loop and the same loop ridden the other way round
 * share every key, so they compare as identical — which is what a rider means
 * by "that is the same route".
 */
export const routeEdgeKeys = (legs: readonly AnnotatedLeg[]): string[] => [
  ...new Set(routeEdges(legs).map((edge) => edge.key)),
];

/**
 * How much of two routes is the same road, in [0, 1].
 *
 * Jaccard over the undirected edge sets: shared stretches over the union, so a
 * pair that merely leaves town together scores low while a pair that differs
 * only in a slip road scores high.
 */
export const routeOverlapShare = (
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): number => {
  // An unmeasurable route must not be treated as a duplicate of anything: a
  // route whose annotations are missing would otherwise silently suppress
  // every candidate after it.
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  let shared = 0;
  const seen = new Set<string>();
  for (const key of b) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (setA.has(key)) shared += 1;
  }
  const union = setA.size + seen.size - shared;
  return union <= 0 ? 0 : shared / union;
};

/**
 * Above this, two loops are the same ride and only one is worth offering.
 *
 * Four fifths rather than exact equality, because two candidates thrown at
 * neighbouring bearings routinely converge onto the same roads and differ only
 * in which side street they use to leave. Offering both spends one of five
 * slots on a choice the rider cannot make.
 *
 * Exact equality would not have been enough anyway: route ids are minted from
 * `Date.now()`, so two byte-identical routes fetched a millisecond apart carry
 * different ids, and the id-based dedup they were subjected to could never
 * match. Content is the only honest identity here.
 */
export const LOOP_DUPLICATE_OVERLAP = 0.8;

/**
 * Split a route into the out-and-back stem that reaches the riding, and the
 * loop at the far end.
 *
 * `stemLegs` is how many legs at EACH end are the approach. It is 1 for a
 * lollipop, because we build one by putting the ring's anchor in the waypoint
 * list before and after the ring — so the anchor is a leg boundary and the
 * stem is exactly the first and last leg. 0 for a plain ring, which has no
 * stem at all.
 *
 * Taking it from construction is the whole point. This used to INFER the stem
 * by matching a mirrored prefix of edges, on the assumption that riding out
 * and back means riding the same edges in reverse. Measured against the live
 * router, that assumption is false: a literal `start -> X -> start` request
 * around Rasnov shares only 78 of 138 edges between the two directions, so the
 * mirror broke on the first edge and the detector reported a 0 m stem for
 * every lollipop ever generated. The exemption existed, passed its tests, and
 * never once fired in the field. Legs cannot drift like that — they are what
 * we asked for.
 *
 * A route with no ring — every leg inside the stem — is an out-and-back, not a
 * loop. `ringMeters` is 0 and `ringRetracedShare` reports 1 rather than
 * dividing by zero, so it fails the cap. That is correct: it is not a loop.
 */
/** The edges of the loop proper, with any deliberate approach removed. */
const ringEdges = (
  legs: readonly AnnotatedLeg[],
  stemLegs: number,
): { key: string; meters: number }[] => {
  const perLeg = legs.map((leg) => routeEdges([leg]));
  const stem = Math.max(0, Math.floor(stemLegs));
  // Not enough legs to have both a stem and a ring: treat it all as ring, so
  // an unexpected shape is judged on its whole self rather than waved through.
  const splittable = stem > 0 && perLeg.length > 2 * stem;
  return (splittable ? perLeg.slice(stem, perLeg.length - stem) : perLeg).flat();
};

export const splitStemAndRing = (
  legs: readonly AnnotatedLeg[],
  stemLegs = 0,
): StemAndRing => {
  const perLeg = legs.map((leg) => routeEdges([leg]));
  const stem = Math.max(0, Math.floor(stemLegs));
  const splittable = stem > 0 && perLeg.length > 2 * stem;

  let stemMeters = 0;
  if (splittable) {
    for (const edges of [
      ...perLeg.slice(0, stem),
      ...perLeg.slice(perLeg.length - stem),
    ]) {
      for (const edge of edges) stemMeters += edge.meters;
    }
  }

  const ring = ringEdges(legs, stemLegs);

  const lengthByEdge = new Map<string, number>();
  const countByEdge = new Map<string, number>();
  let ringMeters = 0;
  for (const edge of ring) {
    ringMeters += edge.meters;
    countByEdge.set(edge.key, (countByEdge.get(edge.key) ?? 0) + 1);
    lengthByEdge.set(edge.key, (lengthByEdge.get(edge.key) ?? 0) + edge.meters);
  }

  let ringRetracedMeters = 0;
  for (const [key, count] of countByEdge) {
    if (count > 1) ringRetracedMeters += lengthByEdge.get(key) ?? 0;
  }

  return { stemMeters, ringMeters, ringRetracedMeters };
};

/**
 * The shortest out-and-back worth calling a detour.
 *
 * A U-turn at a junction, a one-way pair, a few metres round a bollard — these
 * are how roads work, not excursions anyone notices. Measured in three cities,
 * ignoring anything under 200 m takes a dense-grid loop from 0.02-0.04 to
 * 0.00-0.03 while leaving the multi-kilometre spurs untouched.
 */
export const MIN_SPUR_METERS = 200;

/**
 * Metres spent on out-and-back SPURS: excursions that hang off the loop.
 *
 * This is a different complaint from `ringRetracedShare`, and the difference
 * is what a rider actually feels. Both count road ridden twice, but:
 *
 *   A SPUR is "ride up there, turn round, come back" — a detour bolted onto
 *   the ride. It is what makes a loop feel like a loop plus errands.
 *
 *   A shared CORRIDOR is leaving town on the one road out and returning on it
 *   at the end. Also road ridden twice, structurally unavoidable in a valley,
 *   and it still feels like a loop.
 *
 * The aggregate figure cannot tell them apart, which is why loops with several
 * kilometres of spur passed a cap set on the aggregate. Measured at 30 km:
 * Bucharest rings retrace 0.15-0.30 but spur 0.00-0.03 — all corridor. Around
 * Rasnov the same aggregate range hides spurs of 6.0 km, 6.8 km and 4.0 km.
 *
 * A spur has a signature the corridor does not: it ends in a U-TURN, so the
 * same edge appears twice in a row, with the edges on either side mirroring
 * outward from that point. A corridor's two passes sit at opposite ends of the
 * ride and are never adjacent. Matching the mirror is exact and needs no
 * geometry or threshold.
 */
export const spurMeters = (
  legs: readonly AnnotatedLeg[],
  stemLegs = 0,
): number => {
  const edges = ringEdges(legs, stemLegs);
  const n = edges.length;
  const covered = new Array<boolean>(n).fill(false);
  let total = 0;
  let index = 0;

  while (index < n - 1) {
    if (edges[index]!.key === edges[index + 1]!.key && !covered[index]) {
      let lo = index;
      let hi = index + 1;
      // Expand outward while the ride keeps mirroring itself.
      while (lo - 1 >= 0 && hi + 1 < n && edges[lo - 1]!.key === edges[hi + 1]!.key) {
        lo -= 1;
        hi += 1;
      }
      let meters = 0;
      for (let i = lo; i <= hi; i += 1) {
        meters += edges[i]!.meters;
        covered[i] = true;
      }
      if (meters >= MIN_SPUR_METERS) total += meters;
      index = hi + 1;
    } else {
      index += 1;
    }
  }

  return total;
};

/** Fraction of the loop spent on out-and-back spurs, in [0, 1]. */
export const spurShare = (
  legs: readonly AnnotatedLeg[],
  stemLegs = 0,
): number => {
  const edges = ringEdges(legs, stemLegs);
  const total = edges.reduce((sum, edge) => sum + edge.meters, 0);
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, spurMeters(legs, stemLegs) / total));
};

/**
 * The most of a loop that may be out-and-back spur and still be offered.
 *
 * Measured: loops that read as one ride cluster at 0.00-0.03, loops that read
 * as a loop plus errands at 0.15-0.34, and nothing observed lands between 0.03
 * and 0.15. 0.08 sits in that gap — comfortably above the clean cluster and
 * well below the unpleasant one.
 *
 * Enforced at every rung of the ladder except the last, exactly like the
 * doubling-back cap: in terrain where every loop has a spur the rider still
 * gets something rideable, and the ranking then hands them the least spurry
 * one rather than an arbitrary one.
 */
export const MAX_SPUR_SHARE = 0.08;

/**
 * Doubling back WITHIN the loop, ignoring the approach the rider asked for.
 *
 * This is what the cap is measured against. `retracedShare` remains the honest
 * whole-route figure and is what the rider is shown.
 *
 * The distinction is not academic. Around Rasnov a genuine road loop through
 * two neighbouring towns measures 0.379 whole-route, because the one road out
 * of the valley is also the one road back — so a 10% whole-route cap rejects
 * every real loop the terrain can offer, and the search falls to its last
 * rung every time. Measured on the ring alone, the same ride is 0.026.
 */
export const ringRetracedShare = (
  legs: readonly AnnotatedLeg[],
  stemLegs = 0,
): number => {
  const { ringMeters, ringRetracedMeters } = splitStemAndRing(legs, stemLegs);
  // No ring at all means an out-and-back, not a loop. Fail it.
  if (ringMeters <= 0) return 1;
  return Math.min(1, Math.max(0, ringRetracedMeters / ringMeters));
};

/**
 * The most of itself a loop may repeat and still be offered.
 *
 * A hard cap, not a preference — but set from measurement rather than from
 * what sounds strict. It was a tenth, chosen because "above a tenth, loop
 * stops being an honest description". Against the live router that threshold
 * turned out to be unreachable: across 40 candidates at Bucharest and Rasnov,
 * exactly ONE passed it. Typical ring-retrace is 0.14-0.39 in a dense grid and
 * 0.27-0.68 out of a valley town, where the one road out is also the one road
 * back.
 *
 * A filter nothing can satisfy is not strict, it is inert: the ladder reached
 * its last rung on essentially every search, the cap was bent every time, and
 * what the rider got was decided by ranking alone. Worse, the note below fired
 * on nearly every loop, and a warning that always fires carries no
 * information.
 *
 * At 0.35 it binds. In the same measurements it admits most Bucharest rings
 * and the better Rasnov ones, rejects the loops that repeat half of
 * themselves, and still fails a pure out-and-back outright — that has no ring
 * at all, so it scores 1 by construction and cannot sneak through any
 * threshold below it.
 *
 * Deliberately doubles as the threshold for MENTIONING retracing on a result.
 * The two being one number is what makes the UI self-consistent: a note can
 * only ever appear on a loop that broke the cap, which is exactly when the
 * rider needs telling. Splitting them would let a loop quietly sit just under
 * the cap with no note and no way to know.
 */
export const MAX_RETRACE_SHARE = 0.35;

/**
 * Does this loop keep its out-and-back detours under the cap?
 *
 * Same rung semantics as the doubling-back cap, and the same defensive shape:
 * an unmeasurable loop passes rather than being penalised on a guess.
 */
export const withinSpurCap = (
  candidate: Pick<LoopCandidate, 'spurShare'>,
  relaxation: LoopRelaxation,
): boolean => {
  if (!retraceAppliesAt(relaxation)) return true;
  if (!Number.isFinite(candidate.spurShare)) return true;
  return candidate.spurShare <= MAX_SPUR_SHARE;
};

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

/**
 * One generated loop, once it has a distance. `climbMeters` is null until the
 * elevation pass has run — which is the point of the two-stage screen: eight
 * candidates get a distance for free, only three get a climb.
 */
export interface LoopCandidate {
  readonly id: string;
  /** Bearing the ring was thrown at, i.e. the direction the rider sets off. */
  readonly bearingDegrees: number;
  readonly distanceMeters: number;
  readonly climbMeters: number | null;
  /** Metres of the loop on roads in the busiest risk tier. */
  readonly highRiskMeters: number;
  /**
   * Fraction of the loop on unpaved ways, in [0, 1].
   *
   * Available from the moment the ring is routed — it costs nothing — so it is
   * never null, unlike `climbMeters`.
   */
  readonly unpavedShare: number;
  /**
   * Fraction of the loop ridden twice, in [0, 1]. Free, like `unpavedShare`.
   */
  readonly retracedShare: number;
  /**
   * Doubling back inside the loop only, with any deliberate out-and-back stem
   * excluded. THIS is what the cap tests — see `splitStemAndRing`.
   */
  readonly ringRetracedShare: number;
  /** Metres of out-and-back approach, both passes. 0 for a plain loop. */
  readonly stemMeters: number;
  /**
   * Fraction of the loop spent on out-and-back SPURS — detours that hang off
   * the ride, as distinct from the shared corridor out of town. This is the
   * one a rider feels as "a loop plus errands".
   */
  readonly spurShare: number;
  /**
   * Length-weighted mean scenic score of the loop, in [-1, 1].
   *
   * 0 for an unscored area — indistinguishable from "scored and unremarkable"
   * by design, because both should leave the ranking exactly as it was.
   */
  readonly scenicScore: number;
  /** Which rung of the ladder produced it. */
  readonly relaxation: LoopRelaxation;
}

/** Fractional distance error against the target. */
export const distanceError = (
  candidate: Pick<LoopCandidate, 'distanceMeters'>,
  targetDistanceMeters: number,
): number => {
  if (targetDistanceMeters <= 0) return 0;
  return (
    Math.abs(candidate.distanceMeters - targetDistanceMeters) /
    targetDistanceMeters
  );
};

/** Does a candidate's length land inside the tolerance for this rung? */
export const withinDistanceTolerance = (
  candidate: Pick<LoopCandidate, 'distanceMeters'>,
  targetDistanceMeters: number,
  relaxation: LoopRelaxation,
): boolean =>
  distanceError(candidate, targetDistanceMeters) <=
  distanceToleranceFor(relaxation);

/**
 * Total metres of a route sitting in the busy risk tier.
 *
 * Delegates to `findHighRiskStretches` so there is exactly one definition of
 * "busy" in the codebase, shared with the route-preview callout and the
 * imported-course busy list. Never re-declare that category set at a call
 * site (error-log #20).
 */
export const highRiskMeters = (
  riskSegments: readonly RiskSegment[],
): number =>
  findHighRiskStretches(riskSegments).reduce(
    (total, stretch) => total + stretch.lengthMeters,
    0,
  );

/** Total scored length, so `highRiskMeters` can be read as a share. */
export const scoredMeters = (riskSegments: readonly RiskSegment[]): number =>
  riskSegments.reduce(
    (total, segment) => total + riskSegmentDistanceMeters(segment),
    0,
  );

/**
 * Rank candidates for presentation.
 *
 * Safety leads the sort even on a ride whose entire purpose is recreation:
 * of two loops that both satisfy what the rider asked for, we show the one
 * that spends less distance on the roads where a crash is more likely to be
 * serious. Distance accuracy breaks that tie, and terrain match breaks the
 * next one — terrain last because by this point every survivor has already
 * passed the terrain filter, unless the ladder dropped it.
 *
 * Candidates without a measured climb sort as an exact terrain match rather
 * than a mismatch, so an unmeasured loop is never demoted for a fact we
 * declined to look up.
 */
/**
 * Retrace difference below which two loops rank as equally clean.
 *
 * Three points. It was eight while retracing was unbounded, but the hard cap
 * compresses every offered loop into 0-10%, and an eight-point deadband over a
 * ten-point range would swallow almost every real difference and silently turn
 * the ranking off. Still wide enough that a shared starting junction does not
 * reorder anything.
 */
/**
 * Below this, two loops have the same amount of detour and something else
 * should decide. Tighter than the retrace deadband because a spur is a
 * discrete thing the rider will see on the map, not a diffuse overlap.
 */
export const SPUR_RANKING_DEADBAND = 0.01;

export const RETRACE_RANKING_DEADBAND = 0.03;

/**
 * How much scenic may move a candidate's rank (the "lambda" of the spec).
 *
 * Scenic is a TIE-BREAKER, never an override, and it is bounded twice over:
 *   - it is consulted only between candidates already within
 *     `SCENIC_SAFETY_TOLERANCE_METERS` of each other on safety exposure, so a
 *     prettier loop can never beat a materially safer one;
 *   - it is added to a DISTANCE-ERROR term measured in fractions of target, so
 *     lambda has to be small relative to the +-12% strict tolerance.
 *
 * 0.08 is MEASURED, not guessed: a lambda sweep over 24 real loops around
 * Râșnov (validate_scenic_loops.py, 2026-09-07) found it the smallest value
 * that reorders anything at all — 0.05 and below changed zero routes. It moved
 * 1 of 3 targets, mean scenic gain +0.159, worst base-weight +4.35% (PASS vs
 * the 5% cap).
 *
 * Two earlier values were wrong in opposite directions and both were caught
 * rather than reasoned away: 0.35 let a 24 km loop beat a 15 km one on a 15 km
 * request (an override, not a tie-breaker); 0.03 was provably inert.
 *
 * Worth knowing before tuning: the worst-case weight increase plateaued at
 * +4.35% across the whole sweep, up to lambda 0.30. The SAFETY GATE bounds
 * what scenic can cost; lambda only controls how often it gets to speak.
 */
export const SCENIC_LAMBDA = 0.08;

/**
 * Safety exposure difference below which two candidates count as equally safe.
 *
 * Above this gap, safety decides outright and scenic is not consulted at all.
 * This is what bounds scenic's influence: it cannot trade away busy-road metres
 * for scenery, only choose between loops that already cost the same in safety.
 */
export const SCENIC_SAFETY_TOLERANCE_METERS = 250;

export const rankCandidates = <T extends LoopCandidate>(
  candidates: readonly T[],
  request: Pick<LoopRequest, 'targetDistanceMeters' | 'terrain'> &
    Partial<Pick<LoopRequest, 'surface'>>,
): T[] =>
  [...candidates].sort((a, b) => {
    // Safety first, and outright: a gap wider than the tolerance is decided
    // here and scenic never gets a vote.
    const safetyGap = a.highRiskMeters - b.highRiskMeters;
    if (Math.abs(safetyGap) > SCENIC_SAFETY_TOLERANCE_METERS) return safetyGap;

    // An out-and-back detour hanging off the ride is the thing riders name
    // unprompted — "a loop plus detours" — so it is settled before the
    // aggregate figure. The two are not the same complaint: a loop can repeat
    // a third of itself on the one road out of a valley and still read as one
    // ride, while a loop with two kilometres of spur does not, whatever its
    // aggregate says.
    const spurGap = a.spurShare - b.spurShare;
    if (Math.abs(spurGap) > SPUR_RANKING_DEADBAND) return spurGap;

    // Coming back a different way is not a taste, it is what makes a loop a
    // loop — so this outranks the optional preferences and sits directly under
    // safety. The deadband is wide because small overlaps are unavoidable
    // (a junction, a one-way pair) and should not reorder anything.
    //
    // Compares the RING figure, not the whole route, for the same reason the
    // cap does: a lollipop's approach is retraced by construction, and sorting
    // on the whole route buries every lollipop under every plain ring before
    // any preference is consulted. That is not a tie-break, it is a veto — and
    // it was silently vetoing the shape a rider explicitly asked for.
    const retraceGap = a.ringRetracedShare - b.ringRetracedShare;
    if (Math.abs(retraceGap) > RETRACE_RANKING_DEADBAND) return retraceGap;

    // Only when the rider asked for it, and only after safety. Unpaved ways are
    // usually car-free and therefore already score well, so the two rarely
    // fight; where they do, the quieter loop still wins. Promoting surface
    // above safety would let a recreational preference override the thing the
    // whole app is for.
    if (request.surface && prefersUnpaved(request.surface)) {
      const shareGap = b.unpavedShare - a.unpavedShare;
      // 1 percentage point — below that the difference is noise, and letting it
      // decide would scramble the distance ordering for no real gain.
      if (Math.abs(shareGap) > 0.01) return shareGap;
    }

    const aDistance = distanceError(a, request.targetDistanceMeters);
    const bDistance = distanceError(b, request.targetDistanceMeters);

    // Scenic enters here, as a weighted nudge on the distance ordering, and
    // only among candidates already judged equally safe above. Comparing the
    // COMBINED figure rather than scenic alone is what keeps it a tie-breaker:
    // a large distance error still beats a prettier road.
    const aRank = aDistance - SCENIC_LAMBDA * a.scenicScore;
    const bRank = bDistance - SCENIC_LAMBDA * b.scenicScore;
    if (aRank !== bRank) return aRank - bRank;

    const aTerrain =
      a.climbMeters === null
        ? 0
        : terrainDistance(
            classifyTerrain(a.climbMeters, a.distanceMeters),
            request.terrain,
          );
    const bTerrain =
      b.climbMeters === null
        ? 0
        : terrainDistance(
            classifyTerrain(b.climbMeters, b.distanceMeters),
            request.terrain,
          );

    return aTerrain - bTerrain;
  });

/** Does a measured candidate satisfy the terrain the rider asked for? */
export const matchesTerrain = (
  candidate: Pick<LoopCandidate, 'climbMeters' | 'distanceMeters'>,
  terrain: LoopTerrain,
): boolean => {
  if (candidate.climbMeters === null) return false;
  return (
    classifyTerrain(candidate.climbMeters, candidate.distanceMeters) === terrain
  );
};

// ---------------------------------------------------------------------------
// Degenerate-loop rejection
// ---------------------------------------------------------------------------

/**
 * Smallest fraction of the target distance a result may be before we treat it
 * as a collapsed ring rather than a short loop.
 *
 * OSRM does not error for points outside its data — it snaps both ends to the
 * same edge and returns `Ok` with a near-zero route. The existing zero-distance
 * guard in the fetchers catches the exact-zero case; this catches the ring that
 * partially collapsed, which looks like a valid short loop to every other check.
 */
export const MIN_VIABLE_DISTANCE_FRACTION = 0.25;

export const isDegenerateLoop = (
  distanceMeters: number,
  targetDistanceMeters: number,
): boolean => {
  if (distanceMeters <= 0) return true;
  if (targetDistanceMeters <= 0) return false;
  return distanceMeters < targetDistanceMeters * MIN_VIABLE_DISTANCE_FRACTION;
};

/**
 * How far the far side of a loop gets from the start, as a fraction of an
 * ideal circle's radius for that distance.
 *
 * Catches the there-and-back: a route that runs 7 km out and 7 km back is
 * 14 km long, closes perfectly, and is not a loop. Comparing the maximum
 * excursion against the radius a real loop of that length would need is the
 * cheapest discriminator that does not need self-intersection tests.
 */
export const loopRoundness = (
  start: Coordinate,
  coordinates: readonly (readonly [number, number])[],
  distanceMeters: number,
): number => {
  if (coordinates.length === 0 || distanceMeters <= 0) return 0;

  let maxExcursion = 0;
  for (const [lon, lat] of coordinates) {
    const away = haversineDistance([start.lat, start.lon], [lat, lon]);
    if (away > maxExcursion) maxExcursion = away;
  }

  // Radius of a circle whose circumference is this route's length.
  const idealRadius = distanceMeters / (2 * Math.PI);
  if (idealRadius <= 0) return 0;

  return maxExcursion / idealRadius;
};

/**
 * A true circle scores 1.0. An out-and-back scores about π (it reaches half
 * its own length away from the start). 1.9 keeps genuinely lobed city loops —
 * which are never circular — while rejecting the degenerate shape.
 */
export const MAX_LOOP_ROUNDNESS = 1.9;

export const isOutAndBack = (
  start: Coordinate,
  coordinates: readonly (readonly [number, number])[],
  distanceMeters: number,
): boolean =>
  loopRoundness(start, coordinates, distanceMeters) > MAX_LOOP_ROUNDNESS;
