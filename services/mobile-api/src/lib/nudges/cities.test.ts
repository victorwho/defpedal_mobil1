import { describe, expect, it } from 'vitest';

import { cityDatasetStats, cityKey, findNearestCity } from './cities';

describe('cities dataset', () => {
  it('covers the supported countries at meaningful scale', () => {
    const stats = cityDatasetStats();
    expect(stats.count).toBeGreaterThan(5000);
    // Liechtenstein legitimately has no >=15k city; every other supported
    // country must be present.
    for (const cc of ['RO', 'ES', 'DE', 'FR', 'NL', 'SE', 'PL', 'IT', 'IS', 'NO', 'CH']) {
      expect(stats.countries.has(cc)).toBe(true);
    }
  });
});

describe('findNearestCity', () => {
  it('resolves central Bucharest to Bucharest', () => {
    const city = findNearestCity(44.4268, 26.1025);
    expect(city?.name).toBe('Bucharest');
    expect(city?.countryCode).toBe('RO');
    expect(city?.population).toBeGreaterThan(1_000_000);
    expect(city?.utcOffsetHours).toBe(2);
  });

  it('resolves a small-town rider (Râșnov) to a nearby entry within 30 km', () => {
    const city = findNearestCity(45.5934, 25.4602);
    expect(city).not.toBeNull();
    expect(city!.countryCode).toBe('RO');
    expect(city!.population).toBeGreaterThanOrEqual(15000);
  });

  it('returns null outside the 30 km radius (deep countryside / at sea)', () => {
    // Mid-Atlantic — nowhere near any dataset city.
    expect(findNearestCity(50, -30)).toBeNull();
  });

  it('honors a custom maxKm', () => {
    // Mid-Danube point ~45 km from Bucharest: outside the default radius but
    // inside a widened one.
    const wide = findNearestCity(44.05, 26.0, 80);
    expect(wide).not.toBeNull();
  });

  it('cityKey is stable and derived from the entry only', () => {
    const a = findNearestCity(44.4268, 26.1025)!;
    const b = findNearestCity(44.44, 26.09)!; // still central Bucharest
    expect(cityKey(a)).toBe(cityKey(b));
    expect(cityKey(a)).toContain('RO|');
  });
});
