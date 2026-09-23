import type { DistanceUnit, MeasurementSystem } from './units';
import { distanceUnitFor, distanceValueIn, elevationUnitFor, kmhToMph, metersToFeet, speedUnitFor } from './units';
import type { Step } from './types';

export const formatManeuver = (step: Step): string => {
  const { type, modifier } = step.maneuver;
  let instruction = type.replace(/_/g, ' ');

  if (modifier) {
    instruction = modifier.replace(/_/g, ' ');
  }

  return instruction.charAt(0).toUpperCase() + instruction.slice(1);
};

export const formatInstruction = (step: Step): string => {
  const maneuver = formatManeuver(step);

  if (step.name && step.name.trim() !== '') {
    return `${maneuver} onto ${step.name}`;
  }

  return maneuver;
};

/**
 * A distance as the rider reads it: "850 m" / "8.4 km", or "260 ft" /
 * "8.4 mi" on imperial.
 *
 * `units` is REQUIRED on purpose. Two thirds of this app's distance strings
 * were hand-rolled `toFixed(1)} km` template literals when the toggle was
 * added (2026-09-23); a default would have let every one of them keep
 * compiling while silently ignoring the rider's choice.
 */
export const formatDistance = (
  distanceMeters: number,
  units: MeasurementSystem,
): string => {
  const unit = distanceUnitFor(distanceMeters, units);
  return `${distanceValueIn(distanceMeters, unit)} ${unit}`;
};

/**
 * A climb or an altitude: "195 m" / "640 ft". Never switches to miles —
 * elevation is always the small unit, however long the ride.
 */
export const formatElevation = (
  elevationMeters: number,
  units: MeasurementSystem,
): string => {
  const parts = formatElevationParts(elevationMeters, units);
  return `${parts.value} ${parts.unit}`;
};

/** Split form of {@link formatElevation} for value/unit rendered apart. */
export const formatElevationParts = (
  elevationMeters: number,
  units: MeasurementSystem,
): { value: string; unit: string } => ({
  value: `${Math.round(
    units === 'imperial' ? metersToFeet(elevationMeters) : elevationMeters,
  )}`,
  unit: elevationUnitFor(units),
});

export const formatDuration = (totalSeconds: number): string => {
  if (totalSeconds < 60) {
    return '< 1 min';
  }

  const minutes = Math.round(totalSeconds / 60);

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainingMinutes} min`;
};

export const formatSpeed = (
  speedMetersPerSecond: number | null,
  units: MeasurementSystem,
): string | null => {
  if (speedMetersPerSecond === null || speedMetersPerSecond < 0.5) {
    return null;
  }

  return formatSpeedKmh(speedMetersPerSecond * 3.6, units);
};

/**
 * Speed given in km/h — what the weather API reports for wind, and what the
 * navigation HUD already holds. "20 km/h" / "12 mph".
 */
export const formatSpeedKmh = (
  speedKmh: number,
  units: MeasurementSystem,
): string => {
  const parts = formatSpeedKmhParts(speedKmh, units);
  return `${parts.value} ${parts.unit}`;
};

/** Split form of {@link formatSpeedKmh} — the HUD renders the unit smaller. */
export const formatSpeedKmhParts = (
  speedKmh: number,
  units: MeasurementSystem,
): { value: string; unit: string } => ({
  value: `${Math.round(units === 'imperial' ? kmhToMph(speedKmh) : speedKmh)}`,
  unit: speedUnitFor(units),
});

/**
 * Split form of {@link formatDistance} for the navigation HUD, where the
 * numeral is rendered at ~3x the size of its unit on a separate line.
 *
 * Kept in lockstep with `formatDistance` by a test — the HUD and every other
 * surface must never disagree about the same distance.
 */
export const formatDistanceParts = (
  distanceMeters: number,
  units: MeasurementSystem,
): { value: string; unit: DistanceUnit } => {
  const meters = Math.max(0, distanceMeters);
  const unit = distanceUnitFor(meters, units);

  return { value: distanceValueIn(meters, unit), unit };
};

/**
 * Compact remaining-time for the HUD footer hero, split into value + unit.
 *
 * Deliberately NOT the `H:MM` form: this number is rendered inches away from
 * a wall-clock ETA ("14:44"), and "1:20" beside it reads as a second clock.
 * Past an hour the value carries its own `h` marker ("1h 20" + "min").
 */
export const formatDurationShort = (
  totalSeconds: number,
): { value: string; unit: string } => {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 60) {
    return { value: '<1', unit: 'min' };
  }

  const minutes = Math.round(totalSeconds / 60);

  if (minutes < 60) {
    return { value: `${minutes}`, unit: 'min' };
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return { value: `${hours}`, unit: 'h' };
  }

  return { value: `${hours}h ${remainingMinutes}`, unit: 'min' };
};
