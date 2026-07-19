/**
 * Cycling-weather classification — pure helpers shared by the server cron
 * (nudge safety gate) and the mobile daily-weather-ping (good-day check).
 *
 * The thresholds are tuned for European urban commuting: comfortable
 * temps, dry, light wind, no storms / snow / freezing rain. Storm codes
 * (Open-Meteo WMO weather code >= 71) are unconditionally bad — those
 * route to the safety-warning path upstream regardless of temp/wind.
 *
 * "Bad" for nudge purposes is a strict superset of "not good" — we err on
 * the side of suppressing ride-asking nudges. If conditions are even
 * slightly borderline, Pedal stays quiet for that user that day.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CyclingForecast {
  readonly tempMin: number;            // °C
  readonly tempMax: number;            // °C
  readonly precipitationProbability: number; // 0–100
  readonly windSpeedMax: number;       // km/h
  /** Open-Meteo WMO weather code. */
  readonly weatherCode: number;
}

// ---------------------------------------------------------------------------
// Thresholds — "good cycling day" window
// ---------------------------------------------------------------------------

/** Lower bound on min temp. Below this = uncomfortable / icy risk. */
export const CYCLING_TEMP_MIN_C = 10;
/** Upper bound on max temp. Above this = heat stress / dehydration risk. */
export const CYCLING_TEMP_MAX_C = 28;
/** Above this, rain probability is too high to push a ride. */
export const CYCLING_PRECIP_MAX_PCT = 30;
/** Above this, wind speeds make urban riding unsafe (turbulence near cars). */
export const CYCLING_WIND_MAX_KMH = 25;
/**
 * WMO weather codes 71+ cover snow showers, snow grains, freezing rain,
 * thunderstorms, hail. All hard-no for cycling pushes.
 */
export const STORM_WEATHER_CODE_THRESHOLD = 71;

// ---------------------------------------------------------------------------
// Thresholds — safety-suppression boundary (isBadCyclingWeather)
// ---------------------------------------------------------------------------
// Exported so consumers that grade the in-between band (e.g. the City Pulse
// variable weather factor) interpolate against the SAME boundaries the safety
// floor enforces — the two can never drift apart.

/** Below this min temp, riders must not be pushed onto icy roads. */
export const BAD_TEMP_MIN_C = 2;
/** Above this max temp, heat is a safety issue, not just discomfort. */
export const BAD_TEMP_MAX_C = 35;
/** Above this rain probability, suppress ride-asking pushes. */
export const BAD_PRECIP_MAX_PCT = 60;
/** Above this wind speed, gusts are dangerous for urban cyclists. */
export const BAD_WIND_MAX_KMH = 40;

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

/**
 * True when the day's forecast is in the "happy commuter" window. Used by
 * the mobile daily-weather ping to pick witty / non-warning titles.
 */
export const isGoodCyclingDay = (f: CyclingForecast): boolean => {
  if (!Number.isFinite(f.tempMin) || !Number.isFinite(f.tempMax)) return false;
  if (f.weatherCode >= STORM_WEATHER_CODE_THRESHOLD) return false;
  if (f.tempMin < CYCLING_TEMP_MIN_C) return false;
  if (f.tempMax > CYCLING_TEMP_MAX_C) return false;
  if (f.precipitationProbability > CYCLING_PRECIP_MAX_PCT) return false;
  if (f.windSpeedMax > CYCLING_WIND_MAX_KMH) return false;
  return true;
};

/**
 * True when conditions are bad enough that the Pedal Nudge System must NOT
 * push a streak-at-risk / daily-ride / lapsed nudge for safety reasons.
 *
 * Intentionally narrower than `!isGoodCyclingDay` — we only block on the
 * SAFETY-CRITICAL conditions (storm, freezing rain, strong wind, heavy
 * precipitation likelihood, freezing temps). Borderline-warm days
 * (29–32°C) and cool-but-dry days (5–9°C) are still acceptable for a
 * ride ask; they're just outside the "happy ping" window.
 */
export const isBadCyclingWeather = (f: CyclingForecast): boolean => {
  if (!Number.isFinite(f.tempMin) || !Number.isFinite(f.tempMax)) {
    // Fail closed — missing forecast = treat as unsafe to nudge.
    return true;
  }
  if (f.weatherCode >= STORM_WEATHER_CODE_THRESHOLD) return true;
  // Freezing risk — riders shouldn't be pushed onto icy / slippery roads.
  if (f.tempMin < BAD_TEMP_MIN_C) return true;
  if (f.tempMax > BAD_TEMP_MAX_C) return true;
  // Heavy rain probability (well above the "happy day" threshold).
  if (f.precipitationProbability > BAD_PRECIP_MAX_PCT) return true;
  // Strong wind — gusty conditions are dangerous for urban cyclists.
  if (f.windSpeedMax > BAD_WIND_MAX_KMH) return true;
  return false;
};
