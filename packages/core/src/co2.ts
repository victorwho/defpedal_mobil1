/**
 * CO2 savings calculations for cycling trips.
 *
 * Based on EU average new-car emissions of 120 g CO2/km.
 * Cycling direct emissions are effectively 0 g/km.
 */

/** EU average CO2 emissions for new passenger cars (grams per km). */
export const CO2_GRAMS_PER_KM = 120;

/** Average CO2 absorbed by a mature tree per year (kg). */
const TREE_CO2_KG_PER_YEAR = 22;

/**
 * Calculate CO2 saved by cycling instead of driving.
 * @param distanceMeters - Trip distance in meters
 * @returns CO2 saved in kilograms, rounded to 2 decimal places
 */
export function calculateCo2SavedKg(distanceMeters: number): number {
  if (distanceMeters <= 0) return 0;
  const km = distanceMeters / 1000;
  const kg = km * (CO2_GRAMS_PER_KM / 1000);
  return Math.round(kg * 100) / 100;
}

/**
 * Format CO2 saved as a human-readable string.
 * - < 0.1 kg  → grams  ("50 g")
 * - < 1000 kg → kg     ("1.2 kg")
 * - >= 1000 kg → tonnes ("1.2 t")
 */
export function formatCo2Saved(co2Kg: number): string {
  if (co2Kg <= 0) return '0 g';
  if (co2Kg < 0.1) return `${Math.round(co2Kg * 1000)} g`;
  if (co2Kg < 1000) return `${parseFloat(co2Kg.toFixed(1))} kg`;
  return `${parseFloat((co2Kg / 1000).toFixed(1))} t`;
}

/**
 * Calculate equivalent tree-days of CO2 absorption.
 * A mature tree absorbs ~22 kg CO2/year ≈ 0.0603 kg/day.
 * @returns Number of tree-days (rounded to nearest integer)
 */
export function calculateEquivalentTreeDays(co2Kg: number): number {
  if (co2Kg <= 0) return 0;
  const daysPerYear = 365;
  const kgPerDay = TREE_CO2_KG_PER_YEAR / daysPerYear;
  return Math.round(co2Kg / kgPerDay);
}
