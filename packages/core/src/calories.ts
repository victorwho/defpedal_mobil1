/**
 * Calorie Calculation Engine
 *
 * Uses MET (Metabolic Equivalent of Task) values from the Compendium of
 * Physical Activities (Ainsworth et al., 2011). E-bike MET from the 2024
 * Compendium update.
 *
 * Formula:  kcal = MET × weight_kg × duration_hours
 *
 * MET varies by average cycling speed; e-bikes get a fixed lower MET
 * regardless of speed (motor assistance reduces muscular effort).
 *
 * All functions are pure — no side effects, fully testable.
 */

import type { VehicleType } from './microlives';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default rider weight when no personalised value is on file. */
export const DEFAULT_RIDER_WEIGHT_KG = 70;

// MET values — Ainsworth BE et al. "2011 Compendium of Physical Activities"
// Med Sci Sports Exerc. 2011;43(8):1575–81.
// E-bike MET 4.9: 2024 Compendium update.
const MET_SLOW = 4.0;      // < 16 km/h — leisure / uphill crawl (code 01013)
const MET_MODERATE = 6.8;  // 16–22 km/h — typical urban commute (code 01015)
const MET_VIGOROUS = 8.0;  // 22–26 km/h — fast commuter (code 01020)
const MET_FAST = 10.0;     // ≥ 26 km/h — racing / very fast (code 01025)
const MET_EBIKE = 4.9;     // any speed on an e-bike (2024 Compendium)

// ── Internal helpers ──────────────────────────────────────────────────────────

function getMetForRide(avgSpeedKmh: number, vehicle: VehicleType): number {
  if (vehicle === 'ebike') return MET_EBIKE;
  if (avgSpeedKmh < 16) return MET_SLOW;
  if (avgSpeedKmh < 22) return MET_MODERATE;
  if (avgSpeedKmh < 26) return MET_VIGOROUS;
  return MET_FAST;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Calculate kilocalories burned during a cycling ride.
 *
 * @param distanceMeters - GPS trail distance in metres.
 * @param durationSeconds - Ride duration in seconds.
 * @param vehicle - Bike type: 'acoustic' (default) or 'ebike'.
 * @param weightKg - Rider body weight in kg. Defaults to DEFAULT_RIDER_WEIGHT_KG.
 * @returns Whole-number kcal; 0 for degenerate inputs.
 */
export function calculateCaloriesBurned(
  distanceMeters: number,
  durationSeconds: number,
  vehicle: VehicleType = 'acoustic',
  weightKg: number = DEFAULT_RIDER_WEIGHT_KG,
): number {
  if (
    distanceMeters <= 0 ||
    durationSeconds <= 0 ||
    !Number.isFinite(weightKg) ||
    weightKg <= 0
  ) {
    return 0;
  }
  const durationHours = durationSeconds / 3600;
  const avgSpeedKmh = (distanceMeters / 1000) / durationHours;
  const met = getMetForRide(avgSpeedKmh, vehicle);
  return Math.round(met * weightKg * durationHours);
}

/** Format a calorie value as a display string, e.g. "340 kcal". */
export function formatCaloriesBurned(kcal: number): string {
  return `${kcal} kcal`;
}

/**
 * Return a fun food-equivalent context line for a calorie count.
 * Returns null below 50 kcal (very short rides where the comparison is trivial).
 */
export function calorieEquivalent(kcal: number): string | null {
  if (kcal < 50) return null;
  if (kcal < 150) return '≈ 1 banana';
  if (kcal < 350) return '≈ 1 slice of pizza';
  if (kcal < 600) return '≈ a bowl of pasta';
  return '≈ a full meal';
}
