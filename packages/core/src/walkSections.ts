/**
 * Walk-the-bike sections (2026-10-10).
 *
 * The routing graph marks steps the rider must walk with `mode === "pushing
 * bike"` — cemeteries, ways tagged bicycle=dismount, legal dismount footways
 * in DE/NL/FR/HU/AT/GB, underpasses, and pedestrian crossings in several
 * countries when the route traverses the crossing way (OSRM_Server ef105ca).
 * Mapbox's cycling profile uses the same mode string. The route's duration
 * already includes the walking, so nothing here touches the ETA, and walked
 * sections are legal requirements or hard barriers — never hidden, never
 * rerouted around.
 *
 * Two jobs:
 *  - `findWalkSections` merges consecutive walk steps into sections for the
 *    map overlay and the "includes X m on foot" summary.
 *  - `applyWalkCues` keeps turn-by-turn calm. A mode change on a straight road
 *    arrives as its own `notification` step, so a Bucharest route can carry
 *    dozens of them, and every step is announced twice. Those steps are folded
 *    into the step before them (distances and geometry summed, so navigation
 *    totals are unchanged), and only three kinds of cue survive: dismount and
 *    ride-again around a real walk, and one light "cross on foot" per
 *    maneuver for crossings.
 */
import type { NavigationStep, WalkCue, WalkSection } from './contracts';

/** The exact mode string the routing engines use for a walked step. */
export const WALK_MODE = 'pushing bike';

/**
 * A walk shorter than this is treated as a crossing: no dismount marker, no
 * dismount/ride-again cues, just "cross on foot". A starting point for product
 * review, per the routing team — one zebra is 10-30 m.
 */
export const SHORT_WALK_MAX_METERS = 40;

const NOTIFICATION = 'notification';

const isWalking = (step: NavigationStep): boolean =>
  step.mode === WALK_MODE && step.distanceMeters > 0;

export interface IndexedWalkSection extends WalkSection {
  /** Index of the first walked step. */
  readonly start: number;
  /** Index of the last walked step. */
  readonly end: number;
}

/**
 * Consecutive walked steps, merged. Zero-length steps (an `arrive` inherits
 * the last way's mode) neither extend nor break a section. Shared boundary
 * points are stitched once.
 */
export const findWalkSections = (steps: readonly NavigationStep[]): IndexedWalkSection[] => {
  const sections: IndexedWalkSection[] = [];
  let current: IndexedWalkSection | null = null;

  steps.forEach((step, index) => {
    if (step.distanceMeters <= 0) return;
    if (isWalking(step)) {
      const points = (step.geometry?.coordinates ?? []) as [number, number][];
      current = current
        ? {
            ...current,
            end: index,
            distanceMeters: current.distanceMeters + step.distanceMeters,
            durationSeconds: current.durationSeconds + step.durationSeconds,
            coordinates: [...current.coordinates, ...points.slice(1)],
          }
        : {
            start: index,
            end: index,
            distanceMeters: step.distanceMeters,
            durationSeconds: step.durationSeconds,
            coordinates: [...points],
          };
      return;
    }
    if (current) {
      sections.push(current);
      current = null;
    }
  });
  if (current) sections.push(current);
  return sections;
};

/** Sections without their step indices, as stored on a RouteOption. */
export const toWalkSections = (sections: readonly IndexedWalkSection[]): WalkSection[] =>
  sections.map(({ distanceMeters, durationSeconds, coordinates }) => ({
    distanceMeters,
    durationSeconds,
    coordinates,
  }));

export const totalWalkMeters = (sections: readonly WalkSection[] | undefined): number =>
  (sections ?? []).reduce((meters, section) => meters + section.distanceMeters, 0);

/** Highest wins when two cues land on one step. */
const CUE_PRIORITY: Record<WalkCue, number> = { dismount: 3, ride_again: 2, cross_on_foot: 1 };

const mergeInto = (target: NavigationStep, folded: NavigationStep): NavigationStep => ({
  ...target,
  distanceMeters: target.distanceMeters + folded.distanceMeters,
  durationSeconds: target.durationSeconds + folded.durationSeconds,
  geometry:
    target.geometry && folded.geometry
      ? {
          ...target.geometry,
          coordinates: [...target.geometry.coordinates, ...folded.geometry.coordinates.slice(1)],
        }
      : target.geometry,
});

/**
 * Folds mode-change `notification` steps and marks the steps that carry a walk
 * cue. Returns the input unchanged when the route has no walking.
 */
export const applyWalkCues = (steps: readonly NavigationStep[]): NavigationStep[] => {
  const sections = findWalkSections(steps);
  if (sections.length === 0) return [...steps];

  const fold = new Set<number>();
  const cues = new Map<number, { cue: WalkCue; meters?: number }>();
  const setCue = (index: number, cue: WalkCue, meters?: number) => {
    const existing = cues.get(index);
    if (!existing || CUE_PRIORITY[cue] > CUE_PRIORITY[existing.cue]) cues.set(index, { cue, meters });
  };
  const isNotification = (index: number) =>
    index > 0 && steps[index]?.maneuver.type === NOTIFICATION;

  const shortSections: IndexedWalkSection[] = [];
  for (const section of sections) {
    const next = section.end + 1;
    const nextStep = steps[next];
    if (section.distanceMeters >= SHORT_WALK_MAX_METERS) {
      setCue(section.start, 'dismount', section.distanceMeters);
      for (let i = section.start + 1; i <= section.end; i += 1) {
        if (isNotification(i)) fold.add(i);
      }
      if (nextStep && nextStep.maneuver.type !== 'arrive') setCue(next, 'ride_again');
    } else {
      for (let i = section.start; i <= section.end; i += 1) {
        if (isNotification(i)) fold.add(i);
      }
      if (nextStep && isNotification(next) && !isWalking(nextStep)) fold.add(next);
      shortSections.push(section);
    }
  }
  // After folding, the maneuver a rider approaches a crossing under is the
  // first kept step at or after it.
  for (const section of shortSections) {
    let index = section.start;
    while (index < steps.length && fold.has(index)) index += 1;
    if (index < steps.length) setCue(index, 'cross_on_foot');
  }

  const out: NavigationStep[] = [];
  steps.forEach((step, index) => {
    if (fold.has(index) && out.length > 0) {
      out[out.length - 1] = mergeInto(out[out.length - 1], step);
      return;
    }
    const cue = cues.get(index);
    out.push(
      cue
        ? { ...step, walkCue: cue.cue, ...(cue.meters !== undefined ? { walkMeters: cue.meters } : {}) }
        : step,
    );
  });
  return out;
};
