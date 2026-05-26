import { describe, expect, it } from 'vitest';

import { isRouteSupported, resolveCountryFromCoord } from './countryCoverage';

describe('resolveCountryFromCoord', () => {
  it('resolves Bucharest to RO', () => {
    expect(resolveCountryFromCoord({ lat: 44.4268, lon: 26.1025 })).toBe('RO');
  });

  it('resolves Cluj-Napoca to RO', () => {
    expect(resolveCountryFromCoord({ lat: 46.7712, lon: 23.6236 })).toBe('RO');
  });

  it('resolves Constanța (eastern edge) to RO', () => {
    expect(resolveCountryFromCoord({ lat: 44.1598, lon: 28.6348 })).toBe('RO');
  });

  it('resolves Madrid to ES', () => {
    expect(resolveCountryFromCoord({ lat: 40.4168, lon: -3.7038 })).toBe('ES');
  });

  it('resolves Barcelona to ES', () => {
    expect(resolveCountryFromCoord({ lat: 41.3851, lon: 2.1734 })).toBe('ES');
  });

  it('resolves Palma de Mallorca (Balearics) to ES', () => {
    expect(resolveCountryFromCoord({ lat: 39.5696, lon: 2.6502 })).toBe('ES');
  });

  it('returns null for Las Palmas (Canary Islands, intentionally excluded)', () => {
    expect(resolveCountryFromCoord({ lat: 28.1248, lon: -15.4300 })).toBeNull();
  });

  it('returns null for Paris (unsupported country)', () => {
    expect(resolveCountryFromCoord({ lat: 48.8566, lon: 2.3522 })).toBeNull();
  });

  it('returns null for mid-Atlantic (no country)', () => {
    expect(resolveCountryFromCoord({ lat: 30, lon: -30 })).toBeNull();
  });

  it('returns null for the null island (invalid GPS)', () => {
    expect(resolveCountryFromCoord({ lat: 0, lon: 0 })).toBeNull();
  });
});

describe('isRouteSupported', () => {
  const bucharest = { lat: 44.4268, lon: 26.1025 };
  const cluj = { lat: 46.7712, lon: 23.6236 };
  const madrid = { lat: 40.4168, lon: -3.7038 };
  const barcelona = { lat: 41.3851, lon: 2.1734 };
  const paris = { lat: 48.8566, lon: 2.3522 };

  it('supports a same-country RO ride', () => {
    const result = isRouteSupported(bucharest, cluj);
    expect(result).toEqual({ supported: true, country: 'RO' });
  });

  it('supports a same-country ES ride', () => {
    const result = isRouteSupported(madrid, barcelona);
    expect(result).toEqual({ supported: true, country: 'ES' });
  });

  it('rejects a cross-border RO -> ES pair', () => {
    expect(isRouteSupported(bucharest, madrid)).toEqual({
      supported: false,
      originCountry: 'RO',
      destinationCountry: 'ES',
      reason: 'cross_border',
    });
  });

  it('rejects when origin is in an unsupported country', () => {
    expect(isRouteSupported(paris, madrid)).toEqual({
      supported: false,
      originCountry: null,
      destinationCountry: 'ES',
      reason: 'origin_unsupported',
    });
  });

  it('rejects when destination is in an unsupported country', () => {
    expect(isRouteSupported(bucharest, paris)).toEqual({
      supported: false,
      originCountry: 'RO',
      destinationCountry: null,
      reason: 'destination_unsupported',
    });
  });

  it('rejects when both endpoints are unsupported', () => {
    expect(isRouteSupported(paris, paris)).toEqual({
      supported: false,
      originCountry: null,
      destinationCountry: null,
      reason: 'origin_unsupported',
    });
  });
});
