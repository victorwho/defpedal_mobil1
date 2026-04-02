import { describe, it, expect } from 'vitest';
import {
  calculateCo2SavedKg,
  calculateTrailDistanceMeters,
  formatCo2Saved,
  calculateEquivalentTreeDays,
  CO2_GRAMS_PER_KM,
} from './co2';

describe('calculateCo2SavedKg', () => {
  it('returns 0 for zero distance', () => {
    expect(calculateCo2SavedKg(0)).toBe(0);
  });

  it('returns 0 for negative distance', () => {
    expect(calculateCo2SavedKg(-500)).toBe(0);
  });

  it('calculates correctly for 1 km (1000m)', () => {
    // 1 km * 120 g/km = 120 g = 0.12 kg
    expect(calculateCo2SavedKg(1000)).toBe(0.12);
  });

  it('calculates correctly for 10 km (10000m)', () => {
    expect(calculateCo2SavedKg(10000)).toBe(1.2);
  });

  it('calculates correctly for 100 km', () => {
    expect(calculateCo2SavedKg(100_000)).toBe(12);
  });

  it('rounds to 2 decimal places', () => {
    // 1.5 km = 0.18 kg
    expect(calculateCo2SavedKg(1500)).toBe(0.18);
  });

  it('handles very short distances', () => {
    // 100m = 0.1 km * 0.12 = 0.012 → 0.01
    expect(calculateCo2SavedKg(100)).toBe(0.01);
  });

  it('uses the correct EU average constant', () => {
    expect(CO2_GRAMS_PER_KM).toBe(120);
  });
});

describe('formatCo2Saved', () => {
  it('returns "0 g" for zero', () => {
    expect(formatCo2Saved(0)).toBe('0 g');
  });

  it('returns "0 g" for negative values', () => {
    expect(formatCo2Saved(-1)).toBe('0 g');
  });

  it('formats sub-100g values in grams', () => {
    expect(formatCo2Saved(0.05)).toBe('50 g');
    expect(formatCo2Saved(0.001)).toBe('1 g');
  });

  it('formats 0.1-999 kg values in kg', () => {
    expect(formatCo2Saved(0.12)).toBe('0.1 kg');
    expect(formatCo2Saved(1.2)).toBe('1.2 kg');
    expect(formatCo2Saved(12)).toBe('12 kg');
    expect(formatCo2Saved(999)).toBe('999 kg');
  });

  it('formats >= 1000 kg as tonnes', () => {
    expect(formatCo2Saved(1000)).toBe('1 t');
    expect(formatCo2Saved(1200)).toBe('1.2 t');
    expect(formatCo2Saved(15600)).toBe('15.6 t');
  });

  it('does not show trailing zeros in kg', () => {
    expect(formatCo2Saved(5.0)).toBe('5 kg');
  });
});

describe('calculateEquivalentTreeDays', () => {
  it('returns 0 for zero CO2', () => {
    expect(calculateEquivalentTreeDays(0)).toBe(0);
  });

  it('returns 0 for negative CO2', () => {
    expect(calculateEquivalentTreeDays(-5)).toBe(0);
  });

  it('returns ~365 for 22 kg (one tree-year)', () => {
    expect(calculateEquivalentTreeDays(22)).toBe(365);
  });

  it('returns ~1 for a small daily amount', () => {
    const dailyAbsorption = 22 / 365;
    expect(calculateEquivalentTreeDays(dailyAbsorption)).toBe(1);
  });

  it('scales linearly', () => {
    expect(calculateEquivalentTreeDays(44)).toBe(730);
  });
});

describe('calculateTrailDistanceMeters', () => {
  it('returns 0 for empty trail', () => {
    expect(calculateTrailDistanceMeters([])).toBe(0);
  });

  it('returns 0 for single point', () => {
    expect(calculateTrailDistanceMeters([{ lat: 44.4, lon: 26.1 }])).toBe(0);
  });

  it('calculates distance between two points', () => {
    // ~111 km between lat 44 and lat 45 at same lon
    const dist = calculateTrailDistanceMeters([
      { lat: 44.0, lon: 26.0 },
      { lat: 45.0, lon: 26.0 },
    ]);
    expect(dist).toBeGreaterThan(110_000);
    expect(dist).toBeLessThan(112_000);
  });

  it('sums consecutive segments', () => {
    const trail = [
      { lat: 44.0, lon: 26.0 },
      { lat: 44.001, lon: 26.0 },
      { lat: 44.002, lon: 26.0 },
    ];
    const total = calculateTrailDistanceMeters(trail);
    // Two ~111m segments
    expect(total).toBeGreaterThan(200);
    expect(total).toBeLessThan(250);
  });
});
