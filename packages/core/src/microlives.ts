/**
 * Microlives Calculation Engine
 *
 * Based on Sir David Spiegelhalter's research (Cambridge University):
 * 1 Microlife = 30 minutes of adult life expectancy.
 * 20 minutes of moderate exercise ≈ 2 Microlives (1 hour of life).
 *
 * All functions are pure — no side effects, fully testable.
 * Used identically on client (instant local estimates) and server (authoritative).
 */

// ── Vehicle types ──

export type VehicleType = 'acoustic' | 'ebike';

/** Map user-facing bike type string to vehicle category. */
export const mapBikeTypeToVehicle = (bikeType: string | null | undefined): VehicleType => {
  if (!bikeType) return 'acoustic';
  const lower = bikeType.toLowerCase();
  if (lower.includes('e-bike') || lower.includes('ebike') || lower === 'electric') return 'ebike';
  return 'acoustic';
};

// ── Multipliers ──

/** Personal health modifier based on vehicle type. */
export const getVUser = (vehicle: VehicleType): number =>
  vehicle === 'ebike' ? 0.6 : 1.0;

/** Community pollution-prevention modifier based on vehicle type. */
export const getVCom = (vehicle: VehicleType): number =>
  vehicle === 'ebike' ? 0.85 : 1.0;

/**
 * AQI multiplier using European AQI scale (0–100+).
 *
 * Brackets:
 *  0–40  Good/Fair     → 1.0 (baseline)
 *  41–60 Moderate      → 1.2 (bonus for riding despite moderate air)
 *  61–80 Poor          → 1.5 (bigger bonus — braving poor air)
 *  81–100 Very Poor    → 1.0 (no bonus, but still allow)
 *  >100  Hazardous     → 0   (no reward — discourage riding)
 */
export const getMAqi = (europeanAqi: number | null | undefined): number => {
  if (europeanAqi == null) return 1.0;
  if (europeanAqi <= 40) return 1.0;
  if (europeanAqi <= 60) return 1.2;
  if (europeanAqi <= 80) return 1.5;
  if (europeanAqi <= 100) return 1.0;
  return 0;
};

// ── Core calculations ──

/** Base microlives per km of cycling. */
export const MICROLIVES_PER_KM = 0.4;

/** Base community seconds donated per km. */
export const COMMUNITY_SECONDS_PER_KM = 4.5;

/** Minutes of life expectancy per microlife. */
export const MINUTES_PER_MICROLIFE = 30;

/**
 * Calculate personal microlives earned for a ride.
 * M_total = 0.4 × D_km × V_user × M_AQI
 */
export const calculatePersonalMicrolives = (
  distanceKm: number,
  vehicle: VehicleType,
  europeanAqi: number | null | undefined,
): number => {
  if (distanceKm <= 0) return 0;
  const mAqi = getMAqi(europeanAqi);
  if (mAqi === 0) return 0;
  return Math.round((MICROLIVES_PER_KM * distanceKm * getVUser(vehicle) * mAqi) * 10000) / 10000;
};

/**
 * Calculate community seconds donated for a ride.
 * Seconds = 4.5 × D_km × V_com
 */
export const calculateCommunitySeconds = (
  distanceKm: number,
  vehicle: VehicleType,
): number => {
  if (distanceKm <= 0) return 0;
  return Math.round((COMMUNITY_SECONDS_PER_KM * distanceKm * getVCom(vehicle)) * 10000) / 10000;
};

// ── Formatting ──

/**
 * Convert microlives to human-readable time string.
 * 1 microlife = 30 minutes of life expectancy.
 *
 * Examples:
 *   4.0 ML → "2 hours"
 *   2.5 ML → "1 hour 15 minutes"
 *   0.5 ML → "15 minutes"
 *   48.0 ML → "1 day"
 *   336.0 ML → "7 days"
 */
export const formatMicrolivesAsTime = (microlives: number): string => {
  const totalMinutes = Math.round(microlives * MINUTES_PER_MICROLIFE);
  if (totalMinutes <= 0) return '0 minutes';

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (minutes > 0 && days === 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);

  return parts.join(', ') || '0 minutes';
};

/**
 * Format community seconds as human-readable string.
 * Examples: "45 seconds", "2 minutes 30 seconds", "1 hour 15 minutes"
 */
export const formatCommunitySeconds = (seconds: number): string => {
  const rounded = Math.round(seconds);
  if (rounded <= 0) return '0 seconds';

  const hours = Math.floor(rounded / 3600);
  const mins = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (mins > 0) parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);
  if (secs > 0 && hours === 0) parts.push(`${secs} ${secs === 1 ? 'second' : 'seconds'}`);

  return parts.join(', ') || '0 seconds';
};
