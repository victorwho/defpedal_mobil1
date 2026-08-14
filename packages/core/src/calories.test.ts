import { describe, expect, it } from 'vitest';

import {
  calculateCaloriesBurned,
  calorieEquivalent,
  DEFAULT_RIDER_WEIGHT_KG,
  formatCaloriesBurned,
} from './calories';

// ── calculateCaloriesBurned ───────────────────────────────────────────────────

describe('calculateCaloriesBurned', () => {
  // Degenerate inputs
  it('returns 0 for zero distance', () => {
    expect(calculateCaloriesBurned(0, 1800)).toBe(0);
  });

  it('returns 0 for zero duration', () => {
    expect(calculateCaloriesBurned(5000, 0)).toBe(0);
  });

  it('returns 0 for negative distance', () => {
    expect(calculateCaloriesBurned(-100, 600)).toBe(0);
  });

  it('returns 0 for negative duration', () => {
    expect(calculateCaloriesBurned(1000, -60)).toBe(0);
  });

  it('returns 0 for non-finite weight', () => {
    expect(calculateCaloriesBurned(5000, 1800, 'acoustic', NaN)).toBe(0);
    expect(calculateCaloriesBurned(5000, 1800, 'acoustic', Infinity)).toBe(0);
  });

  it('returns 0 for zero weight', () => {
    expect(calculateCaloriesBurned(5000, 1800, 'acoustic', 0)).toBe(0);
  });

  // MET tier — slow (< 16 km/h)
  it('uses MET 4.0 for slow cycling', () => {
    // 10 km in 1 hour → 10 km/h → MET 4.0, 70 kg → 280 kcal
    expect(calculateCaloriesBurned(10_000, 3600)).toBe(280);
  });

  // MET tier — moderate (16–22 km/h)
  it('uses MET 6.8 at 16 km/h (lower moderate boundary)', () => {
    // 16 km in 1 hour → MET 6.8, 70 kg → 476 kcal
    expect(calculateCaloriesBurned(16_000, 3600)).toBe(476);
  });

  it('uses MET 6.8 for moderate cycling (~18 km/h)', () => {
    // 9 km in 30 min → 18 km/h → MET 6.8, 70 kg → 238 kcal
    expect(calculateCaloriesBurned(9_000, 1800)).toBe(238);
  });

  // MET tier — vigorous (22–26 km/h)
  it('uses MET 8.0 at 22 km/h (lower vigorous boundary)', () => {
    // 22 km in 1 hour → MET 8.0, 70 kg → 560 kcal
    expect(calculateCaloriesBurned(22_000, 3600)).toBe(560);
  });

  // MET tier — fast (≥ 26 km/h)
  it('uses MET 10.0 at 26 km/h (fast boundary)', () => {
    // 26 km in 1 hour → MET 10.0, 70 kg → 700 kcal
    expect(calculateCaloriesBurned(26_000, 3600)).toBe(700);
  });

  it('uses MET 10.0 above 26 km/h', () => {
    // 32 km in 1 hour → MET 10.0, 70 kg → 700 kcal
    expect(calculateCaloriesBurned(32_000, 3600)).toBe(700);
  });

  // E-bike — fixed MET 4.9 regardless of speed
  it('uses MET 4.9 for e-bike at slow speed', () => {
    // 8 km in 1 hour → would be MET 4.0 acoustic; e-bike → MET 4.9, 70 kg → 343 kcal
    expect(calculateCaloriesBurned(8_000, 3600, 'ebike')).toBe(343);
  });

  it('uses MET 4.9 for e-bike at fast speed', () => {
    // 30 km in 1 hour → would be MET 10.0 acoustic; e-bike → MET 4.9, 70 kg → 343 kcal
    expect(calculateCaloriesBurned(30_000, 3600, 'ebike')).toBe(343);
  });

  // Custom weight
  it('scales linearly with rider weight', () => {
    const kcal80 = calculateCaloriesBurned(10_000, 3600, 'acoustic', 80);
    const kcal60 = calculateCaloriesBurned(10_000, 3600, 'acoustic', 60);
    // MET 4.0 × 80 × 1h = 320; MET 4.0 × 60 × 1h = 240
    expect(kcal80).toBe(320);
    expect(kcal60).toBe(240);
  });

  // Default weight constant is 70 kg
  it('uses DEFAULT_RIDER_WEIGHT_KG when weight is omitted', () => {
    const explicit = calculateCaloriesBurned(10_000, 3600, 'acoustic', DEFAULT_RIDER_WEIGHT_KG);
    const implicit = calculateCaloriesBurned(10_000, 3600);
    expect(explicit).toBe(implicit);
  });

  // Realistic urban commute (5 km, 20 min, ~15 km/h)
  it('produces a plausible result for a typical short commute', () => {
    const kcal = calculateCaloriesBurned(5_000, 1200); // 15 km/h → MET 4.0
    // 4.0 × 70 × (20/60) = 93.3 → 93 kcal
    expect(kcal).toBe(93);
  });
});

// ── formatCaloriesBurned ──────────────────────────────────────────────────────

describe('formatCaloriesBurned', () => {
  it('appends kcal unit', () => {
    expect(formatCaloriesBurned(340)).toBe('340 kcal');
  });

  it('works for zero', () => {
    expect(formatCaloriesBurned(0)).toBe('0 kcal');
  });
});

// ── calorieEquivalent ─────────────────────────────────────────────────────────

describe('calorieEquivalent', () => {
  it('returns null below 50 kcal', () => {
    expect(calorieEquivalent(0)).toBeNull();
    expect(calorieEquivalent(49)).toBeNull();
  });

  it('returns banana for 50–149 kcal', () => {
    expect(calorieEquivalent(50)).toBe('≈ 1 banana');
    expect(calorieEquivalent(100)).toBe('≈ 1 banana');
    expect(calorieEquivalent(149)).toBe('≈ 1 banana');
  });

  it('returns pizza slice for 150–349 kcal', () => {
    expect(calorieEquivalent(150)).toBe('≈ 1 slice of pizza');
    expect(calorieEquivalent(300)).toBe('≈ 1 slice of pizza');
    expect(calorieEquivalent(349)).toBe('≈ 1 slice of pizza');
  });

  it('returns bowl of pasta for 350–599 kcal', () => {
    expect(calorieEquivalent(350)).toBe('≈ a bowl of pasta');
    expect(calorieEquivalent(500)).toBe('≈ a bowl of pasta');
    expect(calorieEquivalent(599)).toBe('≈ a bowl of pasta');
  });

  it('returns full meal for 600+ kcal', () => {
    expect(calorieEquivalent(600)).toBe('≈ a full meal');
    expect(calorieEquivalent(1000)).toBe('≈ a full meal');
  });
});
