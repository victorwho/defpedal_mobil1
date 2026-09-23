import { formatDistance } from '@defensivepedal/core';
import { describe, expect, it } from 'vitest';

import { spokenDistance } from '../spokenDistance';

/** Stand-in for `t` — returns the key so the choice of word is visible. */
const t = (key: string) => key;

/** The abbreviations the visual surfaces render, keyed like the real strings. */
const abbreviations = (key: string) =>
  ({
    'common.unitMeters': 'm',
    'common.unitKilometers': 'km',
    'common.unitFeet': 'ft',
    'common.unitMiles': 'mi',
  })[key] ?? key;

describe('spokenDistance', () => {
  it('spells the unit out — text-to-speech reads "m" as a letter', () => {
    expect(spokenDistance(200, 'metric', t)).toBe('200 common.unitMeters');
    expect(spokenDistance(1500, 'metric', t)).toBe('1.5 common.unitKilometers');
  });

  it('uses feet then miles on imperial', () => {
    expect(spokenDistance(80, 'imperial', t)).toBe('260 common.unitFeet');
    expect(spokenDistance(1500, 'imperial', t)).toBe('0.9 common.unitMiles');
  });

  it('announces exactly what the screen shows, on both systems', () => {
    // A rider hearing "in 260 feet" while the HUD reads "0.1 mi" would not
    // trust either. Swapping the words for abbreviations must reproduce the
    // visual string character for character.
    for (const units of ['metric', 'imperial'] as const) {
      for (const meters of [50, 200, 999, 1000, 13_700]) {
        expect(spokenDistance(meters, units, abbreviations)).toBe(
          formatDistance(meters, units),
        );
      }
    }
  });
});
