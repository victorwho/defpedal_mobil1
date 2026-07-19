/**
 * City Riders Pulse — synthetic "N people are cycling in {city} today" math
 * plus the stateful-schedule draw helpers. Pure functions, no I/O.
 *
 * Spec: docs/plans/city-riders-pulse-notification.md. Key invariants:
 *   - N is deterministic per (city, date): every user in the same city sees
 *     the same number on the same day (djb2 seeding — same hash pedalVoice
 *     uses for sticky buckets).
 *   - rate = clamp(mult × countryCyclingShare × jitter, 0.5%, 40%), where
 *     mult = 3 for measured Eurobarometer shares and 1.5 for estimates;
 *     additionally capped at 9% for cities under 50k population.
 *   - N is floored at 40 (RO copy relies on this: "{n} de oameni" needs
 *     n >= 20 for the "de" article to be correct) and rounded to the nearest
 *     10 plus a seeded 0–9 offset so it reads like a count, not a guess.
 *   - Fires only inside [07:00, 21:30] local; never 22:00–07:00. The 21:30
 *     ceiling absorbs cron granularity + Android Doze drift.
 *   - Guaranteed at least once every 5 days (weather/sunset floor may
 *     legitimately push past it — the caller escalates priority instead).
 */

import type { CyclingForecast } from './cyclingWeather';
import {
  BAD_PRECIP_MAX_PCT,
  BAD_TEMP_MAX_C,
  BAD_TEMP_MIN_C,
  BAD_WIND_MAX_KMH,
  CYCLING_PRECIP_MAX_PCT,
  CYCLING_TEMP_MAX_C,
  CYCLING_TEMP_MIN_C,
  CYCLING_WIND_MAX_KMH,
  isBadCyclingWeather,
} from './cyclingWeather';
import { djb2Hash } from './pedalVoice';

// ---------------------------------------------------------------------------
// Country cycling share (Eurobarometer anchors)
// ---------------------------------------------------------------------------

export interface CountryCyclingShare {
  /** Share of people whose main daily transport mode is a bicycle (0–1). */
  readonly share: number;
  /**
   * True when the share is a sourced Eurobarometer figure (mult ×3);
   * false for the defaulted 8% EU-average estimate (mult ×1.5).
   */
  readonly measured: boolean;
}

const MEASURED = (share: number): CountryCyclingShare => ({ share, measured: true });
const ESTIMATED: CountryCyclingShare = { share: 0.08, measured: false };

/**
 * Keyed by the same ISO 3166-1 alpha-2 codes as
 * `appAvailability.SUPPORTED_APP_COUNTRIES` (all 31 supported countries).
 * Measured anchors from the Eurobarometer mobility survey (see plan doc);
 * everything else defaults to the 8% EU average as an estimate. Upgrading a
 * country from estimate to measured is a data edit here, not a formula change.
 */
export const COUNTRY_CYCLING_SHARE: Readonly<Record<string, CountryCyclingShare>> = {
  // EU-27
  AT: ESTIMATED,
  BE: MEASURED(0.12),
  BG: ESTIMATED,
  HR: ESTIMATED,
  CY: ESTIMATED,
  CZ: ESTIMATED,
  DK: MEASURED(0.12),
  EE: ESTIMATED,
  FI: MEASURED(0.13),
  FR: MEASURED(0.03),
  DE: MEASURED(0.15),
  GR: ESTIMATED,
  HU: MEASURED(0.14),
  IE: ESTIMATED,
  IT: ESTIMATED,
  LV: ESTIMATED,
  LT: ESTIMATED,
  LU: ESTIMATED,
  MT: ESTIMATED,
  NL: MEASURED(0.41),
  PL: ESTIMATED,
  PT: ESTIMATED,
  // Calibrated 2026-07-19: the 8% EU-average estimate read ~60% too high on
  // the ground (Bucharest pulse showed ~137k riders). 0.032 × the estimate
  // mult (×1.5) gives a 4.8% base rate — 40% of the old figure.
  RO: { share: 0.032, measured: false },
  SK: ESTIMATED,
  SI: ESTIMATED,
  ES: ESTIMATED,
  SE: MEASURED(0.21),
  // EEA
  IS: ESTIMATED,
  LI: ESTIMATED,
  NO: ESTIMATED,
  // Bilateral
  CH: ESTIMATED,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CITY_PULSE_RATE_MIN = 0.005;
export const CITY_PULSE_RATE_MAX = 0.4;
export const CITY_PULSE_SMALL_TOWN_POPULATION = 50_000;
export const CITY_PULSE_SMALL_TOWN_RATE_CAP = 0.09;
export const CITY_PULSE_MIN_N = 40;
export const CITY_PULSE_GUARANTEE_DAYS = 5;
/** Allowed local send window: [07:00, 21:30], minutes from local midnight. */
export const CITY_PULSE_WINDOW_START_MINUTES = 7 * 60;
export const CITY_PULSE_WINDOW_END_MINUTES = 21 * 60 + 30;
/** Population assumed when no dataset city is within range of the rider. */
export const CITY_PULSE_FALLBACK_POPULATION = 100_000;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// Weather factor
// ---------------------------------------------------------------------------

/** Weather factor at the safety-suppression boundary (worst allowed day). */
export const CITY_PULSE_WEATHER_FACTOR_FLOOR = 0.4;

/**
 * How far `value` sits between the good-day limit (0) and the bad/suppress
 * limit (1). Higher = worse; clamped to [0, 1].
 */
const degradation = (value: number, goodLimit: number, badLimit: number): number =>
  clamp((value - goodLimit) / (badLimit - goodLimit), 0, 1);

/**
 * Map a forecast onto the pulse weather factor:
 *   good ×1.0 … bad → null (suppress the notification), with the in-between
 *   band graded CONTINUOUSLY instead of a flat ×0.6 (changed 2026-07-19).
 *
 * Each dimension (rain probability, wind, cold, heat) is interpolated between
 * its happy-commuter limit (`CYCLING_*`, factor 1.0) and its safety-floor
 * limit (`BAD_*`, factor 0.4); the WORST dimension decides — riders bail on
 * the single worst condition, they don't average a cold morning against a
 * calm wind. So a 22°C day at 35% rain reads ~0.9 while a 3°C drizzle day
 * reads ~0.47, where both were a flat 0.6 before. Rounded to 2 decimals for
 * clean telemetry.
 *
 * "Bad" reuses the nudge safety floor (`isBadCyclingWeather` — storms,
 * freezing, heavy rain, strong wind). A missing forecast fails closed to
 * null, consistent with the safety floor.
 */
export const getCityPulseWeatherFactor = (
  forecast: CyclingForecast | null | undefined,
): number | null => {
  if (!forecast || isBadCyclingWeather(forecast)) return null;
  const worst = Math.max(
    degradation(forecast.precipitationProbability, CYCLING_PRECIP_MAX_PCT, BAD_PRECIP_MAX_PCT),
    degradation(forecast.windSpeedMax, CYCLING_WIND_MAX_KMH, BAD_WIND_MAX_KMH),
    degradation(CYCLING_TEMP_MIN_C - forecast.tempMin, 0, CYCLING_TEMP_MIN_C - BAD_TEMP_MIN_C),
    degradation(forecast.tempMax - CYCLING_TEMP_MAX_C, 0, BAD_TEMP_MAX_C - CYCLING_TEMP_MAX_C),
  );
  const factor = 1 - (1 - CITY_PULSE_WEATHER_FACTOR_FLOOR) * worst;
  return Math.round(factor * 100) / 100;
};

// ---------------------------------------------------------------------------
// The number N
// ---------------------------------------------------------------------------

/** Deterministic fraction in [0, 1) derived from a string key. */
const seededFraction = (key: string): number => (djb2Hash(key) % 100_000) / 100_000;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export interface CityRiderCount {
  /** The displayed rider count. */
  readonly n: number;
  /** Effective participation rate after clamps (0–1), for telemetry. */
  readonly rate: number;
  readonly weekdayFactor: number;
  readonly seasonFactor: number;
  readonly weatherFactor: number;
}

/**
 * Compute N = round(population × rate × weekday × season × weather) with the
 * clamps and presentation rounding from the plan doc.
 *
 * @param cityKey  stable identity of the city entry (e.g. "RO|Râșnov|45.59").
 *                 Combined with `dateISO` it seeds jitter + the 0–9 offset, so
 *                 every user in the city sees the identical N that day.
 * @param dateISO  local calendar date "YYYY-MM-DD" in the CITY's timezone.
 * @param weatherFactor  0.4–1.0 from `getCityPulseWeatherFactor` — callers
 *                 must suppress entirely (never call this) when it is null.
 */
export const computeCityRiderCount = (
  cityKey: string,
  population: number,
  countryCode: string,
  dateISO: string,
  weatherFactor: number,
): CityRiderCount => {
  const shareEntry = COUNTRY_CYCLING_SHARE[countryCode] ?? ESTIMATED;
  const mult = shareEntry.measured ? 3 : 1.5;
  const jitter = 0.85 + 0.3 * seededFraction(`${cityKey}|${dateISO}|jitter`);

  let rate = clamp(mult * shareEntry.share * jitter, CITY_PULSE_RATE_MIN, CITY_PULSE_RATE_MAX);
  if (population < CITY_PULSE_SMALL_TOWN_POPULATION) {
    rate = Math.min(rate, CITY_PULSE_SMALL_TOWN_RATE_CAP);
  }

  const date = new Date(`${dateISO}T00:00:00Z`);
  const dayOfWeek = date.getUTCDay();
  const weekdayFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 1.15 : 1.0;

  const month = date.getUTCMonth() + 1;
  const seasonFactor =
    month >= 4 && month <= 9 ? 1.0 : month === 3 || month === 10 ? 0.8 : 0.5;

  const raw = population * rate * weekdayFactor * seasonFactor * weatherFactor;
  const floored = Math.max(CITY_PULSE_MIN_N, raw);
  // "1,240" reads like a count, "1,200" reads like a guess: nearest 10 plus a
  // seeded 0–9 offset, deterministic per (city, date).
  const offset = djb2Hash(`${cityKey}|${dateISO}|offset`) % 10;
  const n = Math.round(floored / 10) * 10 + offset;

  return { n, rate, weekdayFactor, seasonFactor, weatherFactor };
};

// ---------------------------------------------------------------------------
// Scheduling draws
// ---------------------------------------------------------------------------

/** Uniform-random source in [0, 1). Injectable for deterministic tests. */
export type Rng = () => number;

/** Local calendar date "YYYY-MM-DD" for a fixed UTC-offset locality. */
export const localDateISO = (now: Date, utcOffsetHours: number): string =>
  new Date(now.getTime() + utcOffsetHours * HOUR_MS).toISOString().slice(0, 10);

/**
 * Place `minuteOfDay` on the local calendar day containing `utcMs`, returning
 * the corresponding UTC instant. Fixed-offset arithmetic — the DST backstop is
 * the per-user quiet-hours gate at send time.
 */
const atLocalMinute = (utcMs: number, utcOffsetHours: number, minuteOfDay: number): Date => {
  const offsetMs = utcOffsetHours * HOUR_MS;
  const localMidnight = Math.floor((utcMs + offsetMs) / DAY_MS) * DAY_MS;
  return new Date(localMidnight + minuteOfDay * MINUTE_MS - offsetMs);
};

/** Random minute inside [07:00, 21:30] inclusive. */
const drawWindowMinute = (rng: Rng): number => {
  const span = CITY_PULSE_WINDOW_END_MINUTES - CITY_PULSE_WINDOW_START_MINUTES + 1;
  const draw = Math.min(span - 1, Math.floor(rng() * span));
  return CITY_PULSE_WINDOW_START_MINUTES + draw;
};

/**
 * After a successful send: next fire = last send + d days (d uniform in
 * {1..5}) at a random minute inside the allowed local window.
 */
export const drawNextFireAt = (
  lastSentAt: Date,
  rng: Rng,
  utcOffsetHours = 2,
): Date => {
  const days = 1 + Math.min(4, Math.floor(rng() * 5));
  return atLocalMinute(
    lastSentAt.getTime() + days * DAY_MS,
    utcOffsetHours,
    drawWindowMinute(rng),
  );
};

/**
 * First seed when a user becomes eligible (first completed trip): fire at
 * now + U(0…5 days), snapped to a random minute inside the window. A draw
 * that lands in the past (day 0, minute already gone) rolls forward one day.
 */
export const drawInitialFireAt = (
  now: Date,
  rng: Rng,
  utcOffsetHours = 2,
): Date => {
  const days = Math.min(5, Math.floor(rng() * 6));
  const fireAt = atLocalMinute(
    now.getTime() + days * DAY_MS,
    utcOffsetHours,
    drawWindowMinute(rng),
  );
  return fireAt.getTime() <= now.getTime() ? new Date(fireAt.getTime() + DAY_MS) : fireAt;
};

/**
 * True when more than the guaranteed interval has elapsed since the last
 * successful send — the caller escalates the candidate from P3 to P2 so it
 * wins the next allowed slot. Never breached before the first send (the seed
 * draw already lands within 5 days) or on malformed timestamps.
 */
export const isGuaranteeBreached = (
  lastSentAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (!lastSentAt) return false;
  const lastMs = typeof lastSentAt === 'string' ? Date.parse(lastSentAt) : lastSentAt.getTime();
  if (!Number.isFinite(lastMs)) return false;
  return now.getTime() - lastMs > CITY_PULSE_GUARANTEE_DAYS * DAY_MS;
};
