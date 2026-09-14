/**
 * How much today's conditions move cycling volume away from a typical day.
 *
 * Why this exists: the city cycling estimate is a TYPICAL-day figure, and a
 * typical-day figure labelled "today" is not answering the question it appears
 * to answer. The obvious shortcut — vary the number randomly each day so it
 * looks live — is worse than leaving it static, because the variation itself
 * is what makes a reader believe something is being measured. A number that
 * moves has the signature of real data, so it has to move for real reasons.
 *
 * Cycling volume genuinely does swing day to day, mostly on weather and day of
 * week, and both are things we already know. So the factor below is a MODEL,
 * built from inputs the rider can verify by looking out of the window, rather
 * than a number generator.
 *
 * ⚠️ The coefficients are judgement, not measurement. They are deliberately
 * coarse, bounded, and directional — heavy rain suppresses cycling a lot, a
 * mild dry day lifts it slightly — rather than tuned to a precision nobody has
 * evidence for. They keep the output within roughly 0.35x-1.15x of the typical
 * day, which is the range published commuter-cycling studies broadly support.
 * If real local count data ever arrives (see
 * docs/research/bike-counter-availability-2026-09-14.md), replace these with
 * fitted values and delete this note.
 */
import type { CyclingForecast } from './cyclingWeather';
import {
  BAD_PRECIP_MAX_PCT,
  BAD_TEMP_MAX_C,
  STORM_WEATHER_CODE_THRESHOLD,
} from './cyclingWeather';

/** Why today differs from a typical day — drives the explanatory line in the UI. */
export type CyclingVolumeReason =
  | 'storm'
  | 'rain'
  | 'cold'
  | 'hot'
  | 'windy'
  | 'ideal'
  | 'typical';

export interface CyclingVolumeAdjustment {
  /** Multiplier on the typical-day estimate. */
  readonly factor: number;
  readonly reason: CyclingVolumeReason;
}

/** Below this, riding is cold enough to deter most utility cycling. */
export const VOLUME_COLD_C = 5;
/** Ideal band — dry, mild, calm. */
export const VOLUME_IDEAL_MIN_C = 14;
export const VOLUME_IDEAL_MAX_C = 26;
export const VOLUME_IDEAL_MAX_PRECIP_PCT = 15;
export const VOLUME_IDEAL_MAX_WIND_KMH = 18;
/** Wind strong enough to matter on a bike. */
export const VOLUME_WINDY_KMH = 30;
/** Precipitation probability at which rain starts visibly suppressing volume. */
export const VOLUME_RAIN_PCT = 35;

/**
 * Weekend factor.
 *
 * Cycling in these cities is predominantly utility — commuting and errands —
 * and the modal-share figure this multiplies comes from trip surveys dominated
 * by weekday travel. Weekend leisure riding does not fully replace the commute,
 * so weekends sit below a weekday, not above.
 */
export const VOLUME_WEEKEND_FACTOR = 0.8;

/** Bounds. The model must never claim a day was catastrophic or miraculous. */
const MIN_FACTOR = 0.35;
const MAX_FACTOR = 1.15;

const clamp = (v: number): number => Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, v));

/**
 * Weather component. Worst condition wins rather than multiplying penalties
 * together: a cold, wet, windy day is one bad day, not three, and stacking
 * factors would drive the estimate to implausible lows.
 */
export const weatherVolumeAdjustment = (
  forecast: CyclingForecast | null,
): CyclingVolumeAdjustment => {
  if (!forecast) return { factor: 1, reason: 'typical' };

  const { tempMin, tempMax, precipitationProbability, windSpeedMax, weatherCode } = forecast;

  if (weatherCode >= STORM_WEATHER_CODE_THRESHOLD) return { factor: 0.4, reason: 'storm' };
  if (precipitationProbability >= BAD_PRECIP_MAX_PCT) return { factor: 0.55, reason: 'rain' };
  if (tempMin <= VOLUME_COLD_C) return { factor: 0.65, reason: 'cold' };
  if (tempMax >= BAD_TEMP_MAX_C) return { factor: 0.7, reason: 'hot' };
  if (precipitationProbability >= VOLUME_RAIN_PCT) return { factor: 0.8, reason: 'rain' };
  if (windSpeedMax >= VOLUME_WINDY_KMH) return { factor: 0.85, reason: 'windy' };

  if (
    tempMax >= VOLUME_IDEAL_MIN_C &&
    tempMax <= VOLUME_IDEAL_MAX_C &&
    precipitationProbability <= VOLUME_IDEAL_MAX_PRECIP_PCT &&
    windSpeedMax <= VOLUME_IDEAL_MAX_WIND_KMH
  ) {
    return { factor: 1.12, reason: 'ideal' };
  }

  return { factor: 1, reason: 'typical' };
};

/**
 * Full adjustment for a given day: weather, then the weekday/weekend shape.
 *
 * `dayOfWeek` is 0 = Sunday, matching `Date#getDay`. Pass the day in the
 * CITY's terms, not UTC — a Saturday is a Saturday where the riding happens.
 */
export const cyclingVolumeAdjustment = (
  forecast: CyclingForecast | null,
  dayOfWeek: number,
): CyclingVolumeAdjustment => {
  const weather = weatherVolumeAdjustment(forecast);
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const factor = clamp(weather.factor * (isWeekend ? VOLUME_WEEKEND_FACTOR : 1));
  return { factor, reason: weather.reason };
};

/**
 * Apply an adjustment to a typical-day estimate.
 *
 * Rounded to the nearest hundred: the result is an estimate modulated by a
 * model, so rendering it to the unit would imply a precision neither input has.
 * Coarser than the server-side rounding of the base figure on purpose — this
 * one moves daily, and a number that moves invites closer reading.
 */
export const applyCyclingVolume = (
  typicalDayCyclists: number,
  adjustment: CyclingVolumeAdjustment,
): number => {
  if (!Number.isFinite(typicalDayCyclists) || typicalDayCyclists <= 0) return 0;
  return Math.max(100, Math.round((typicalDayCyclists * adjustment.factor) / 100) * 100);
};
