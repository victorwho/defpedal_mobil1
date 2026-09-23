import type { DistanceUnit, MeasurementSystem } from '@defensivepedal/core';
import { formatDistanceParts } from '@defensivepedal/core';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const UNIT_WORD_KEY: Record<DistanceUnit, string> = {
  m: 'common.unitMeters',
  km: 'common.unitKilometers',
  ft: 'common.unitFeet',
  mi: 'common.unitMiles',
};

/**
 * A distance with its unit spelled out — "200 meters", "260 feet" — for
 * turn-by-turn speech and screen-reader announcements.
 *
 * Text-to-speech and TalkBack read the abbreviations the visual surfaces use
 * ("m", "ft") as letters, so those two audiences get the word instead. The
 * number itself is whatever `formatDistanceParts` decided, so what a rider
 * HEARS and what they SEE never disagree about the value.
 */
export const spokenDistance = (
  meters: number,
  units: MeasurementSystem,
  t: Translate,
): string => {
  const { value, unit } = formatDistanceParts(meters, units);
  return `${value} ${t(UNIT_WORD_KEY[unit])}`;
};
