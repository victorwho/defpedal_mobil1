import { describe, expect, it } from 'vitest';

import {
  BIKE_TYPE_IDS,
  avoidUnpavedForBikeType,
  isBikeTypeId,
  isEbikeBikeTypeValue,
  legacyBikeTypeToId,
  prefersPavedRouting,
  prefersUnpavedCapable,
  type BikeTypeId,
} from './bikeTypes';

/**
 * The regression these tests exist for: bike type used to be the LOCALIZED
 * picker label, compared against English literals in three separate places.
 * Every Romanian and Spanish rider silently got no avoid-unpaved default,
 * acoustic microlives on an e-bike, and wrong calories. The English-only
 * tests that shipped alongside it all passed.
 *
 * Every locale is therefore asserted explicitly below — an English-only
 * suite is what let this through the first time.
 */

/** Exactly the labels each locale's i18n file ships for the picker. */
const LABELS: Record<BikeTypeId, readonly string[]> = {
  road: ['Road bike', 'Bicicletă de cursă', 'Bicicleta de carretera'],
  city: ['City bike', 'Bicicletă de oraș', 'Bicicleta de ciudad'],
  mountain: ['Mountain bike', 'Bicicletă de munte', 'Bicicleta de montaña'],
  ebike: ['E-bike', 'Bicicletă electrică', 'Bicicleta eléctrica'],
  recumbent: ['Recumbent', 'Bicicletă recumbent', 'Bicicleta reclinada'],
  other: ['Other', 'Altele', 'Otra'],
};

describe('bike type ids', () => {
  it('exposes every id exactly once, in picker order', () => {
    expect(BIKE_TYPE_IDS).toEqual(['road', 'city', 'mountain', 'ebike', 'recumbent', 'other']);
    expect(new Set(BIKE_TYPE_IDS).size).toBe(BIKE_TYPE_IDS.length);
  });

  it('narrows unknown values', () => {
    expect(isBikeTypeId('road')).toBe(true);
    expect(isBikeTypeId('Road bike')).toBe(false);
    expect(isBikeTypeId(null)).toBe(false);
    expect(isBikeTypeId(7)).toBe(false);
  });
});

describe('routing implications', () => {
  it('prefers paved for road, city and recumbent', () => {
    expect(prefersPavedRouting('road')).toBe(true);
    expect(prefersPavedRouting('city')).toBe(true);
    expect(prefersPavedRouting('recumbent')).toBe(true);
    expect(prefersPavedRouting('mountain')).toBe(false);
    expect(prefersPavedRouting('ebike')).toBe(false);
    expect(prefersPavedRouting('other')).toBe(false);
  });

  it('marks only mountain bikes as unpaved-capable', () => {
    expect(prefersUnpavedCapable('mountain')).toBe(true);
    for (const id of BIKE_TYPE_IDS.filter((i) => i !== 'mountain')) {
      expect(prefersUnpavedCapable(id)).toBe(false);
    }
  });

  it('returns null — not false — for bike types that imply nothing', () => {
    // The distinction is load-bearing: `null` means "keep the rider's current
    // setting", `false` would mean "turn avoid-unpaved off". Collapsing them
    // would silently reset a preference the rider had chosen.
    expect(avoidUnpavedForBikeType('ebike')).toBeNull();
    expect(avoidUnpavedForBikeType('other')).toBeNull();
    expect(avoidUnpavedForBikeType('road')).toBe(true);
    expect(avoidUnpavedForBikeType('mountain')).toBe(false);
  });
});

describe('legacy localized label mapping', () => {
  it('maps every shipped label in every locale back to its id', () => {
    for (const [id, labels] of Object.entries(LABELS) as [BikeTypeId, string[]][]) {
      for (const label of labels) {
        expect(legacyBikeTypeToId(label), `${label} -> ${id}`).toBe(id);
      }
    }
  });

  it('is idempotent on ids already migrated', () => {
    for (const id of BIKE_TYPE_IDS) {
      expect(legacyBikeTypeToId(id)).toBe(id);
    }
  });

  it('is case- and whitespace-insensitive', () => {
    expect(legacyBikeTypeToId('  ROAD BIKE ')).toBe('road');
    expect(legacyBikeTypeToId('Bicicletă De Munte')).toBe('mountain');
  });

  it('returns null for unknown input rather than guessing a default', () => {
    expect(legacyBikeTypeToId(null)).toBeNull();
    expect(legacyBikeTypeToId(undefined)).toBeNull();
    expect(legacyBikeTypeToId('')).toBeNull();
    expect(legacyBikeTypeToId('penny farthing')).toBeNull();
  });
});

describe('isEbikeBikeTypeValue', () => {
  it('detects e-bikes in every locale — the calorie and microlives bug', () => {
    expect(isEbikeBikeTypeValue('ebike')).toBe(true);
    expect(isEbikeBikeTypeValue('E-bike')).toBe(true);
    expect(isEbikeBikeTypeValue('Bicicletă electrică')).toBe(true);
    expect(isEbikeBikeTypeValue('Bicicleta eléctrica')).toBe(true);
    // Historical values that reached trip_tracks before ids existed.
    expect(isEbikeBikeTypeValue('electric')).toBe(true);
  });

  it('does not classify acoustic bikes as e-bikes', () => {
    expect(isEbikeBikeTypeValue('road')).toBe(false);
    expect(isEbikeBikeTypeValue('Bicicletă de cursă')).toBe(false);
    expect(isEbikeBikeTypeValue('Bicicleta de montaña')).toBe(false);
    expect(isEbikeBikeTypeValue(null)).toBe(false);
  });
});
