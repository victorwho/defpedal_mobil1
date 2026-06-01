/**
 * Localized turn-by-turn maneuver text for **safe-mode (OSRM) routes**.
 *
 * Mapbox Directions (fast mode) returns a localized `maneuver.instruction`
 * when called with `&language=<code>`, so the rider's UI locale flows through
 * for free. OSRM does NOT ship `osrm-text-instructions`, so safe-mode steps
 * arrive with no instruction string — historically we hand-built an English
 * fallback ("Turn left onto Main St"), which left Romanian/Spanish riders
 * reading English turn cues on every Safe route.
 *
 * This module rebuilds that fallback from the raw `maneuver.type` + `modifier`
 * through the app's i18n layer instead. Street names stay raw (proper nouns).
 *
 * Only used for the OSRM fallback path in `mapbox-routing.ts` — when Mapbox
 * already supplied a localized instruction, that wins.
 */
import type { Step } from '@defensivepedal/core';

import { translate, type Locale } from '../i18n';

/**
 * OSRM/Mapbox-v5 turn modifiers → `nav.direction.*` keys. The empty/unknown
 * modifier falls back to the "straight" word so templates never render a
 * double space or a dangling preposition.
 */
const DIRECTION_KEYS: Record<string, string> = {
  left: 'nav.direction.left',
  right: 'nav.direction.right',
  straight: 'nav.direction.straight',
  'slight left': 'nav.direction.slightLeft',
  'slight right': 'nav.direction.slightRight',
  'sharp left': 'nav.direction.sharpLeft',
  'sharp right': 'nav.direction.sharpRight',
};

const directionWord = (locale: Locale, modifier: string | undefined): string => {
  const key = modifier ? DIRECTION_KEYS[modifier] : undefined;
  return translate(locale, key ?? 'nav.direction.straight');
};

/**
 * Build a localized instruction string for a single OSRM step.
 *
 * Maps the OSRM maneuver `type` to a `nav.maneuver.*` phrase key and fills the
 * `{{direction}}` / `{{street}}` slots. Unknown maneuver types degrade to a
 * generic "continue {{direction}} onto {{street}}" phrase rather than leaking
 * a raw type token.
 */
export const buildManeuverInstruction = (step: Step, locale: Locale): string => {
  const { type, modifier } = step.maneuver;
  const street = step.name?.trim() || translate(locale, 'nav.maneuver.theRoad');
  const direction = directionWord(locale, modifier);

  // U-turn reads wrong inside a "Turn {{direction}}" template — dedicated phrase.
  if (modifier === 'uturn') {
    return translate(locale, 'nav.maneuver.uturn', { street });
  }

  switch (type) {
    case 'depart':
      return modifier
        ? translate(locale, 'nav.maneuver.depart', { direction, street })
        : translate(locale, 'nav.maneuver.departNoDir', { street });
    case 'arrive':
      return translate(locale, 'nav.maneuver.arrive');
    case 'turn':
    case 'end of road':
      return translate(locale, 'nav.maneuver.turn', { direction, street });
    case 'continue':
    case 'new name':
      return translate(locale, 'nav.maneuver.continue', { street });
    case 'merge':
      return translate(locale, 'nav.maneuver.merge', { street });
    case 'fork':
      return translate(locale, 'nav.maneuver.fork', { direction, street });
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return translate(locale, 'nav.maneuver.roundabout', { street });
    case 'on ramp':
      return translate(locale, 'nav.maneuver.rampOn', { street });
    case 'off ramp':
      return translate(locale, 'nav.maneuver.rampOff', { street });
    default:
      return translate(locale, 'nav.maneuver.generic', { direction, street });
  }
};
