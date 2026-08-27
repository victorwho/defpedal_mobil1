import { describe, expect, it } from 'vitest';

import { HAZARD_TYPE_OPTIONS, type HazardType } from './contracts';
import {
  CIVIA_CATEGORY_BY_HAZARD_TYPE,
  DEFAULT_CIVIA_BASE_URL,
  SESIZARE_BADGE_THRESHOLDS,
  SESIZARE_ELIGIBLE_HAZARD_TYPES,
  buildCiviaUrl,
  composeSesizareText,
  formatSesizareCoordinates,
  formatSesizareDate,
  isSesizareEligible,
  type SesizareEligibleHazardType,
} from './sesizare';

const BASE_INPUT = {
  address: 'strada Fabrica de Glucoză nr. 5, Sector 2, București',
  coordinate: { lat: 44.46117, lon: 26.11094 },
  observedAt: '2026-08-27T09:14:00.000Z',
};

describe('sesizare — eligibility', () => {
  it('accepts exactly the six actionable hazard types', () => {
    expect([...SESIZARE_ELIGIBLE_HAZARD_TYPES]).toEqual([
      'pothole',
      'poor_surface',
      'dangerous_intersection',
      'illegally_parked_car',
      'blocked_bike_lane',
      'aggro_dogs',
    ]);
  });

  it('rejects the types no Romanian authority can act on', () => {
    // Guards the product decision, not just the code: these were excluded
    // because no department has a remedy for them.
    for (const type of ['aggressive_traffic', 'narrow_street', 'missing_bike_lane', 'other']) {
      expect(isSesizareEligible(type as HazardType)).toBe(false);
    }
  });

  it('only names hazard types that actually exist in the contract', () => {
    const known = HAZARD_TYPE_OPTIONS.map((option) => option.value);
    for (const type of SESIZARE_ELIGIBLE_HAZARD_TYPES) {
      expect(known).toContain(type);
    }
  });

  it('maps every eligible type to a Civia category slug', () => {
    for (const type of SESIZARE_ELIGIBLE_HAZARD_TYPES) {
      expect(CIVIA_CATEGORY_BY_HAZARD_TYPE[type]).toMatch(/^[a-z0-9-]+$/);
    }
    expect(Object.keys(CIVIA_CATEGORY_BY_HAZARD_TYPE).sort()).toEqual(
      [...SESIZARE_ELIGIBLE_HAZARD_TYPES].sort(),
    );
  });
});

describe('sesizare — formatting helpers', () => {
  it('renders Romanian long-form dates', () => {
    expect(formatSesizareDate('2026-08-27T09:14:00.000Z')).toBe('27 august 2026');
    expect(formatSesizareDate('2026-01-03T12:00:00.000Z')).toBe('3 ianuarie 2026');
    expect(formatSesizareDate('2026-12-31T12:00:00.000Z')).toBe('31 decembrie 2026');
  });

  it('returns an empty string for an unparseable date rather than "Invalid Date"', () => {
    expect(formatSesizareDate('not-a-date')).toBe('');
  });

  it('rounds coordinates to four decimals', () => {
    expect(formatSesizareCoordinates({ lat: 44.46117, lon: 26.11094 })).toBe('44.4612, 26.1109');
    expect(formatSesizareCoordinates({ lat: -1.5, lon: 2 })).toBe('-1.5000, 2.0000');
  });
});

describe('sesizare — Civia URL', () => {
  it('appends the attribution ref', () => {
    expect(buildCiviaUrl()).toBe(`${DEFAULT_CIVIA_BASE_URL}?ref=defensivepedal`);
  });

  it('uses & when the served base URL already carries a query string', () => {
    expect(buildCiviaUrl('https://civia.ro/sesizari?x=1')).toBe(
      'https://civia.ro/sesizari?x=1&ref=defensivepedal',
    );
  });

  it('falls back to the default when the served URL is blank', () => {
    expect(buildCiviaUrl('   ')).toBe(`${DEFAULT_CIVIA_BASE_URL}?ref=defensivepedal`);
  });
});

describe('sesizare — text composition', () => {
  const forEachType = (fn: (type: SesizareEligibleHazardType, text: string) => void) => {
    for (const type of SESIZARE_ELIGIBLE_HAZARD_TYPES) {
      fn(type, composeSesizareText({ ...BASE_INPUT, hazardType: type }));
    }
  };

  it('produces a distinct paragraph for every eligible type', () => {
    const texts = SESIZARE_ELIGIBLE_HAZARD_TYPES.map((type) =>
      composeSesizareText({ ...BASE_INPUT, hazardType: type }),
    );
    expect(new Set(texts).size).toBe(SESIZARE_ELIGIBLE_HAZARD_TYPES.length);
  });

  it('never leaks a raw placeholder', () => {
    forEachType((_type, text) => {
      expect(text).not.toMatch(/[{}]/);
      expect(text).not.toMatch(/undefined|NaN|null/);
    });
  });

  it('never contains emoji or markdown — this goes to a public authority', () => {
    forEachType((_type, text) => {
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(text).not.toMatch(/[*_`#]/);
    });
  });

  it('always includes the address, the date and the coordinates', () => {
    forEachType((_type, text) => {
      expect(text).toContain('strada Fabrica de Glucoză nr. 5, Sector 2, București');
      expect(text).toContain('27 august 2026');
      expect(text).toContain('Coordonate GPS: 44.4612, 26.1109.');
    });
  });

  it('is written in formal Romanian with diacritics', () => {
    forEachType((_type, text) => {
      expect(text).toContain('Vă rog să dispuneți');
      // A Romanian petition without diacritics reads as machine spam.
      expect(text).toMatch(/[ăâîșț]/);
    });
  });

  it('is a single paragraph — no newlines', () => {
    forEachType((_type, text) => {
      expect(text).not.toContain('\n');
    });
  });

  it('names Poliția Locală for the two parking-enforcement types', () => {
    for (const type of ['illegally_parked_car', 'blocked_bike_lane'] as const) {
      expect(composeSesizareText({ ...BASE_INPUT, hazardType: type })).toContain('Poliția Locală');
    }
  });

  it('reads correctly when the reverse geocode returned no address', () => {
    const text = composeSesizareText({
      ...BASE_INPUT,
      address: '   ',
      hazardType: 'pothole',
    });
    expect(text).toContain('În zona indicată de coordonatele de mai jos există o groapă');
    expect(text).not.toContain('Pe  ');
  });

  it('drops the date clause cleanly when the timestamp is unusable', () => {
    const text = composeSesizareText({
      ...BASE_INPUT,
      observedAt: 'not-a-date',
      hazardType: 'pothole',
    });
    expect(text).toContain('Am observat problema în timp ce mă deplasam cu bicicleta.');
    expect(text).not.toContain('pe , ');
  });

  it('matches the agreed wording for a pothole end to end', () => {
    expect(composeSesizareText({ ...BASE_INPUT, hazardType: 'pothole' })).toBe(
      'Pe strada Fabrica de Glucoză nr. 5, Sector 2, București există o groapă în carosabil ' +
        'care pune în pericol bicicliștii care circulă pe această stradă. Am observat problema ' +
        'pe 27 august 2026, în timp ce mă deplasam cu bicicleta. Coordonate GPS: 44.4612, ' +
        '26.1109. Vă rog să dispuneți remedierea.',
    );
  });
});

describe('sesizare — badge ladder', () => {
  it('exposes the 1/5/25 thresholds the migration hard-codes', () => {
    expect([...SESIZARE_BADGE_THRESHOLDS]).toEqual([1, 5, 25]);
  });
});
