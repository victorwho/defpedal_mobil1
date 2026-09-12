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

export const formatDistance = (distanceMeters: number): string => {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`;
};

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

export const formatSpeed = (speedMetersPerSecond: number | null): string | null => {
  if (speedMetersPerSecond === null || speedMetersPerSecond < 0.5) {
    return null;
  }

  const speedKmh = Math.round(speedMetersPerSecond * 3.6);
  return `${speedKmh} km/h`;
};

/**
 * Split form of {@link formatDistance} for the navigation HUD, where the
 * numeral is rendered at ~3x the size of its unit on a separate line.
 *
 * Kept in lockstep with `formatDistance` by a test — the HUD and every other
 * surface must never disagree about the same distance.
 */
export const formatDistanceParts = (
  distanceMeters: number,
): { value: string; unit: string } => {
  const meters = Math.max(0, distanceMeters);

  if (meters < 1000) {
    return { value: `${Math.round(meters)}`, unit: 'm' };
  }

  return { value: (meters / 1000).toFixed(1), unit: 'km' };
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
