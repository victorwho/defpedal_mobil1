/**
 * course-route — turn a parsed GPX course into an ordinary `RouteOption`.
 *
 * The whole design of this feature rests on one idea: an imported course
 * should become the *same shape* every other route already is. Once it is a
 * `RouteOption`, the map layers, risk card, elevation chart, HUD and
 * navigation progress math all work on it untouched — none of them need to
 * know it arrived as a file.
 *
 * Two things a GPX cannot supply, and where they come from instead:
 *   - **maneuvers** — synthesized from geometry (`core/courseSteps`)
 *   - **risk + elevation** — the existing `/v1/risk-segments` and
 *     `/v1/elevation-profile` enrichment, which take a bare coordinate array
 *     and therefore work on imported geometry with no server change at all
 *
 * The route is stamped `source: 'gpx_course'`, which is what suppresses
 * auto-reroute during navigation. Losing that flag silently converts the
 * rider's imported line back into a computed route mid-ride.
 */
import {
  buildCourseSteps,
  courseDistanceMeters,
  encodePolyline,
  type CourseStep,
  type NavigationStep,
  type RouteOption,
} from '@defensivepedal/core';

import type { ParsedCourse } from './gpx-parse';
import { enrichRouteWithElevation, enrichRouteWithRisk } from './mapbox-routing';
import { translate, type Locale } from '../i18n';

/**
 * Upper bound on the geometry we keep for an imported course.
 *
 * Matches the cap `mapbox-routing` already applies before POSTing geometry to
 * `/v1/risk-segments` and `/v1/elevation-profile` (error-log: oversized bodies
 * on EU-length routes). GPX files are exactly the case that cap exists for —
 * a 4-hour ride recorded at 1 Hz is ~14,000 points before anyone has tried to
 * do anything with it, and some exporters emit far more.
 *
 * 12k points is ~8 m spacing over 100 km, finer than the map, the risk overlay
 * or the turn detector can use.
 */
export const MAX_COURSE_POINTS = 12_000;

/**
 * Evenly thin a coordinate array to at most `max` points, always keeping the
 * first and last so the course still starts and ends where the rider expects.
 */
export const downsampleCourse = (
  coordinates: readonly (readonly [number, number])[],
  max: number = MAX_COURSE_POINTS,
): [number, number][] => {
  if (coordinates.length <= max || max < 2) {
    return coordinates.map((c) => [c[0], c[1]]);
  }

  const step = (coordinates.length - 1) / (max - 1);
  const thinned: [number, number][] = [];

  for (let i = 0; i < max; i++) {
    const source = coordinates[Math.round(i * step)]!;
    thinned.push([source[0], source[1]]);
  }

  return thinned;
};

/**
 * Localized turn text for a synthesized step.
 *
 * Uses the existing `nav.maneuverShort.*` keys — the same vocabulary the
 * navigation HUD already renders — so imported courses speak EN/RO/ES with no
 * new strings. Deliberately NOT `buildManeuverInstruction`: that builds
 * "Turn right onto {{street}}", and a synthesized step has no street name, so
 * it would render "Turn right onto the road" on every single cue.
 */
export const courseStepInstruction = (
  step: CourseStep,
  locale: Locale,
): string => {
  const t = (key: string): string => translate(locale, key);
  const type = step.maneuver.type.toLowerCase();
  const modifier = step.maneuver.modifier?.toLowerCase() ?? '';

  if (type === 'arrive') return t('nav.maneuverShort.arrive');
  if (type === 'depart') return t('nav.maneuverShort.depart');

  if (modifier === 'slight left') return t('nav.maneuverShort.slightLeft');
  if (modifier === 'slight right') return t('nav.maneuverShort.slightRight');
  if (modifier === 'sharp left') return t('nav.maneuverShort.sharpLeft');
  if (modifier === 'sharp right') return t('nav.maneuverShort.sharpRight');
  if (modifier === 'left') return t('nav.maneuverShort.turnLeft');
  if (modifier === 'right') return t('nav.maneuverShort.turnRight');

  return t('nav.maneuverShort.continue');
};

const toNavigationStep = (step: CourseStep, locale: Locale): NavigationStep => ({
  id: step.id,
  instruction: courseStepInstruction(step, locale),
  streetName: step.streetName,
  distanceMeters: step.distanceMeters,
  durationSeconds: step.durationSeconds,
  maneuver: step.maneuver,
  mode: step.mode,
});

export interface BuildCourseRouteOptions {
  /** Drives turn-instruction language. */
  readonly locale: Locale;
  /** Overrides the assumed riding speed used for duration estimates. */
  readonly speedMetersPerSecond?: number;
}

/**
 * Assemble the offline half of a course route: geometry, steps, distances.
 *
 * Pure and synchronous — no network. `enrichCourseRoute` adds risk and
 * elevation on top. Split this way so the review screen can draw the line
 * immediately and fill in scoring as it arrives, rather than showing a blank
 * map until the server answers.
 *
 * Returns `null` when the geometry is too short to be a route.
 */
export const buildCourseRoute = (
  course: ParsedCourse,
  options: BuildCourseRouteOptions,
): RouteOption | null => {
  const coordinates = downsampleCourse(course.coordinates);
  if (coordinates.length < 2) return null;

  const steps = buildCourseSteps(coordinates, {
    speedMetersPerSecond: options.speedMetersPerSecond,
  });
  if (steps.length === 0) return null;

  const distanceMeters = courseDistanceMeters(coordinates);
  const durationSeconds = steps.reduce(
    (total, step) => total + step.durationSeconds,
    0,
  );

  return {
    id: `gpx-course-${Date.now()}`,
    source: 'gpx_course',
    routingEngineVersion: 'gpx-import-v1',
    routingProfileVersion: 'none',
    mapDataVersion: 'none',
    // Risk is scored against the imported line by /v1/risk-segments, the same
    // model every other route is measured with — but we did not choose these
    // roads, so the route was never *routed* by a risk model.
    riskModelVersion: 'risk-model-v1',
    geometryPolyline6: encodePolyline(coordinates),
    distanceMeters,
    durationSeconds,
    adjustedDurationSeconds: durationSeconds,
    totalClimbMeters: null,
    steps: steps.map((step) => toNavigationStep(step, options.locale)),
    riskSegments: [],
    // Tunnel/bridge extraction reads OSRM annotations, and unprotected-left
    // detection reads intersection bearings. A GPX carries neither, so the
    // list is honestly empty rather than half-populated.
    routeFeatures: [],
    warnings: [],
  };
};

/**
 * Add risk segments and elevation to a course route.
 *
 * Both enrichers degrade gracefully — a failed fetch returns the route
 * unchanged rather than throwing — so a course stays importable and rideable
 * with no signal, just without scoring.
 */
export const enrichCourseRoute = async (
  route: RouteOption,
  coordinates: readonly (readonly [number, number])[],
): Promise<RouteOption> => {
  const bounded = downsampleCourse(coordinates);

  const [withElevation, withRisk] = await Promise.all([
    enrichRouteWithElevation(route, bounded),
    enrichRouteWithRisk(route, bounded),
  ]);

  return {
    ...route,
    totalClimbMeters: withElevation.totalClimbMeters,
    adjustedDurationSeconds: withElevation.adjustedDurationSeconds,
    elevationProfile: withElevation.elevationProfile,
    riskSegments: withRisk.riskSegments,
  };
};
