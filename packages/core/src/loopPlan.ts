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
 * Perimeter of the ideal triangle inscribed in a circle of radius 1.
 *
 * Three points at 120° spacing on a unit circle form an equilateral triangle
 * with side √3, so the perimeter is 3√3 ≈ 5.196. This is the *floor* on how
 * long a ring can be; real roads never achieve it, which is what
 * `DEFAULT_DETOUR_FACTOR` accounts for.
 */
export const RING_PERIMETER_FACTOR = 3 * Math.sqrt(3);

/**
 * First guess at how much longer the road distance is than the ideal triangle.
 *
 * A starting point only — `nextRingRadiusMeters` corrects from the measured
 * result within one or two iterations, so being wrong here costs a round trip,
 * not a bad loop. 1.25 is deliberately conservative: overshooting the target
 * and shrinking is cheaper than undershooting, because a too-small ring in a
 * sparse network can collapse onto a single road and return a there-and-back.
 */
export const DEFAULT_DETOUR_FACTOR = 1.25;

/** Radius for a first attempt at `targetDistanceMeters`. */
export const initialRingRadiusMeters = (
  targetDistanceMeters: number,
  detourFactor: number = DEFAULT_DETOUR_FACTOR,
): number => {
  const safeTarget = Math.max(0, targetDistanceMeters);
  const safeDetour = detourFactor > 0 ? detourFactor : DEFAULT_DETOUR_FACTOR;
  return safeTarget / (RING_PERIMETER_FACTOR * safeDetour);
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
export type LoopRelaxation = 'none' | 'heading' | 'distance' | 'terrain';

export const LOOP_RELAXATION_LADDER: readonly LoopRelaxation[] = [
  'none',
  'heading',
  'distance',
  'terrain',
];

/** Fraction of the target a result may miss by, per relaxation level. */
export const DISTANCE_TOLERANCE_STRICT = 0.12;
export const DISTANCE_TOLERANCE_RELAXED = 0.25;

export const distanceToleranceFor = (relaxation: LoopRelaxation): number =>
  relaxation === 'distance' || relaxation === 'terrain'
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
  relaxation !== 'terrain';

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
 * Retracing worth telling the rider about.
 *
 * Below this a loop reads as clean — a few shared metres through a junction or
 * a one-way pair is normal and not what anyone means by doubling back.
 */
export const NOTABLE_RETRACE_SHARE = 0.1;

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
 * Eight points, deliberately wide. Loops routinely share a few percent through
 * the junction they start from, and letting that decide would scramble the
 * distance and surface ordering for a difference no rider would notice.
 */
export const RETRACE_RANKING_DEADBAND = 0.08;

export const rankCandidates = <T extends LoopCandidate>(
  candidates: readonly T[],
  request: Pick<LoopRequest, 'targetDistanceMeters' | 'terrain'> &
    Partial<Pick<LoopRequest, 'surface'>>,
): T[] =>
  [...candidates].sort((a, b) => {
    if (a.highRiskMeters !== b.highRiskMeters) {
      return a.highRiskMeters - b.highRiskMeters;
    }

    // Coming back a different way is not a taste, it is what makes a loop a
    // loop — so this outranks the optional preferences and sits directly under
    // safety. The deadband is wide because small overlaps are unavoidable
    // (a junction, a one-way pair) and should not reorder anything.
    const retraceGap = a.retracedShare - b.retracedShare;
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
    if (aDistance !== bDistance) return aDistance - bDistance;

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
