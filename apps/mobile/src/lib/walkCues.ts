/**
 * Rider-facing text for walk-the-bike cues (core walkSections.ts).
 *
 * The cue lives on the step as data (`walkCue`, `walkMeters`) and is turned
 * into words only here, at render and speech time, so a rider who switches
 * language or units mid-ride gets the new ones, and speech can say "metres"
 * where the screen says "m".
 *
 * A step whose maneuver is a `notification` exists only because the travel
 * mode changed on a straight road; its own instruction ("Continue…") carries
 * nothing, so the cue replaces it. Any real maneuver keeps its instruction and
 * gets the cue alongside.
 */
import { formatDistance, type MeasurementSystem, type NavigationStep } from '@defensivepedal/core';

import { spokenDistance } from './spokenDistance';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** True for a step that exists only because the travel mode changed. */
export const isCueOnlyStep = (step: NavigationStep): boolean =>
  step.walkCue != null && step.maneuver.type === 'notification';

const cueWords = (
  step: NavigationStep,
  t: Translate,
  units: MeasurementSystem,
  spoken: boolean,
): string | null => {
  switch (step.walkCue) {
    case 'dismount': {
      const meters = step.walkMeters ?? 0;
      return t('nav.walkDismount', {
        distance: spoken ? spokenDistance(meters, units, t) : formatDistance(meters, units),
      });
    }
    case 'ride_again':
      return t('nav.walkRideAgain');
    case 'cross_on_foot':
      return t('nav.walkCrossOnFoot');
    default:
      return null;
  }
};

/** The full cue for the screen ("Dismount and walk the bike for 120 m"), or null. */
export const cueText = (step: NavigationStep, t: Translate, units: MeasurementSystem): string | null =>
  cueWords(step, t, units, false);

/** A one-word headline for a cue-only step on the turn card ("Dismount"). */
export const cueShortLabel = (step: NavigationStep, t: Translate): string | null => {
  switch (step.walkCue) {
    case 'dismount':
      return t('nav.walkDismountShort');
    case 'ride_again':
      return t('nav.walkRideAgainShort');
    case 'cross_on_foot':
      return t('nav.walkCrossShort');
    default:
      return null;
  }
};

/** Icon for a cue-only step: walking, or back on the bike. */
export const cueIconName = (step: NavigationStep): 'walk' | 'bicycle' | null =>
  step.walkCue === 'ride_again' ? 'bicycle' : step.walkCue ? 'walk' : null;

/** What voice guidance says for this step. */
export const spokenInstruction = (
  step: NavigationStep,
  t: Translate,
  units: MeasurementSystem,
): string => {
  const cue = cueWords(step, t, units, true);
  if (!cue) return step.instruction;
  if (isCueOnlyStep(step)) return cue;
  return t('nav.walkWithCue', { instruction: step.instruction, cue });
};
