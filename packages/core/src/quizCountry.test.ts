import { describe, expect, it } from 'vitest';

import {
  resolveQuizCountry,
  resolveQuizCountryFromCoords,
} from './quizCountry';

// ---------------------------------------------------------------------------
// resolveQuizCountryFromCoords — bbox membership
// ---------------------------------------------------------------------------

describe('resolveQuizCountryFromCoords', () => {
  // RO
  it('resolves Bucharest to RO', () => {
    expect(resolveQuizCountryFromCoords(44.4268, 26.1025)).toBe('RO');
  });

  it('resolves Cluj-Napoca to RO', () => {
    expect(resolveQuizCountryFromCoords(46.7712, 23.6236)).toBe('RO');
  });

  it('resolves Constanța (eastern RO edge) to RO', () => {
    expect(resolveQuizCountryFromCoords(44.1598, 28.6348)).toBe('RO');
  });

  // ES mainland
  it('resolves Madrid to ES', () => {
    expect(resolveQuizCountryFromCoords(40.4168, -3.7038)).toBe('ES');
  });

  it('resolves Barcelona to ES', () => {
    expect(resolveQuizCountryFromCoords(41.3851, 2.1734)).toBe('ES');
  });

  it('resolves Tarifa (southern ES edge) to ES', () => {
    expect(resolveQuizCountryFromCoords(36.0145, -5.6097)).toBe('ES');
  });

  // ES Balearics
  it('resolves Palma de Mallorca (Balearics) to ES', () => {
    expect(resolveQuizCountryFromCoords(39.5696, 2.6502)).toBe('ES');
  });

  // ES Canary Islands — explicitly included for quiz purposes
  it('resolves Las Palmas (Gran Canaria) to ES', () => {
    expect(resolveQuizCountryFromCoords(28.1248, -15.4300)).toBe('ES');
  });

  it('resolves Santa Cruz de Tenerife to ES', () => {
    expect(resolveQuizCountryFromCoords(28.4636, -16.2518)).toBe('ES');
  });

  // Outside both
  it('returns null for Paris (unsupported)', () => {
    expect(resolveQuizCountryFromCoords(48.8566, 2.3522)).toBeNull();
  });

  it('returns null for Berlin (unsupported)', () => {
    expect(resolveQuizCountryFromCoords(52.5200, 13.4050)).toBeNull();
  });

  it('returns null for mid-Atlantic', () => {
    expect(resolveQuizCountryFromCoords(30, -30)).toBeNull();
  });

  // Edge cases
  it('returns null when lat is null', () => {
    expect(resolveQuizCountryFromCoords(null, 26.1025)).toBeNull();
  });

  it('returns null when lon is null', () => {
    expect(resolveQuizCountryFromCoords(44.4268, null)).toBeNull();
  });

  it('returns null when both are null', () => {
    expect(resolveQuizCountryFromCoords(null, null)).toBeNull();
  });

  it('returns null for NaN coords (sensor garbage)', () => {
    expect(resolveQuizCountryFromCoords(Number.NaN, Number.NaN)).toBeNull();
  });

  it('returns null for the null island (invalid GPS)', () => {
    expect(resolveQuizCountryFromCoords(0, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveQuizCountry — composite fallback chain
// ---------------------------------------------------------------------------

describe('resolveQuizCountry — override branch', () => {
  it('"RO" preference wins even with Madrid coords', () => {
    expect(
      resolveQuizCountry({
        preference: 'RO',
        coords: { lat: 40.4168, lon: -3.7038 },
        deviceLocaleRegion: 'ES',
      }),
    ).toEqual({ country: 'RO', source: 'override' });
  });

  it('"ES" preference wins even with Bucharest coords', () => {
    expect(
      resolveQuizCountry({
        preference: 'ES',
        coords: { lat: 44.4268, lon: 26.1025 },
        deviceLocaleRegion: 'RO',
      }),
    ).toEqual({ country: 'ES', source: 'override' });
  });
});

describe('resolveQuizCountry — GPS branch (preference=auto)', () => {
  it('falls through to coords when preference is auto', () => {
    expect(
      resolveQuizCountry({
        preference: 'auto',
        coords: { lat: 41.3851, lon: 2.1734 }, // Barcelona
        deviceLocaleRegion: 'RO',
      }),
    ).toEqual({ country: 'ES', source: 'gps' });
  });

  it('GPS wins over device-locale region', () => {
    // Rider in Bucharest with a Spanish phone locale → still gets RO content.
    expect(
      resolveQuizCountry({
        preference: 'auto',
        coords: { lat: 44.4268, lon: 26.1025 },
        deviceLocaleRegion: 'ES',
      }),
    ).toEqual({ country: 'RO', source: 'gps' });
  });

  it('Canary Islands GPS resolves to ES', () => {
    expect(
      resolveQuizCountry({
        preference: 'auto',
        coords: { lat: 28.1248, lon: -15.4300 },
        deviceLocaleRegion: null,
      }),
    ).toEqual({ country: 'ES', source: 'gps' });
  });
});

describe('resolveQuizCountry — locale branch', () => {
  it('falls back to device locale when no coords', () => {
    expect(
      resolveQuizCountry({
        preference: 'auto',
        coords: null,
        deviceLocaleRegion: 'ES',
      }),
    ).toEqual({ country: 'ES', source: 'locale' });
  });

  it('falls back to device locale when coords are outside every bbox', () => {
    // Rider testing in Berlin: GPS unsupported, but the OS locale is Spanish.
    expect(
      resolveQuizCountry({
        preference: 'auto',
        coords: { lat: 52.5200, lon: 13.4050 },
        deviceLocaleRegion: 'ES',
      }),
    ).toEqual({ country: 'ES', source: 'locale' });
  });

  it('normalizes lowercase region codes', () => {
    expect(
      resolveQuizCountry({
        preference: 'auto',
        coords: null,
        deviceLocaleRegion: 'ro',
      }),
    ).toEqual({ country: 'RO', source: 'locale' });
  });
});

describe('resolveQuizCountry — default branch', () => {
  it('defaults to RO when nothing else narrows it', () => {
    expect(
      resolveQuizCountry({
        preference: 'auto',
        coords: null,
        deviceLocaleRegion: null,
      }),
    ).toEqual({ country: 'RO', source: 'default' });
  });

  it('defaults to RO when locale region is unsupported (e.g. US)', () => {
    expect(
      resolveQuizCountry({
        preference: 'auto',
        coords: null,
        deviceLocaleRegion: 'US',
      }),
    ).toEqual({ country: 'RO', source: 'default' });
  });

  it('defaults to RO when coords are outside bboxes and no locale region', () => {
    // Rider testing in Berlin with a non-RO/ES OS locale.
    expect(
      resolveQuizCountry({
        preference: 'auto',
        coords: { lat: 48.8566, lon: 2.3522 }, // Paris
        deviceLocaleRegion: 'FR',
      }),
    ).toEqual({ country: 'RO', source: 'default' });
  });
});
