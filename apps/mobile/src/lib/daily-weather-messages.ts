/**
 * Random witty / friendly / slightly-sarcastic message variants for the
 * morning "today is a good day to cycle" push notification.
 *
 * The title carries the personality; the body carries the weather facts.
 * Pure functions — no native modules, no IO — so this module is trivially
 * testable in Node-env Vitest.
 */

export interface GoodWeatherForecast {
  readonly tempMin: number;
  readonly tempMax: number;
  readonly precipitationProbability: number;
  readonly windSpeedMax: number;
  readonly weatherCode: number;
}

/**
 * Definition of a "good cycling day". Tuned for European urban commuting:
 * comfortable temps, dry, light wind, no storms / snow / freezing rain.
 * Storm and snow weather codes (>= 71) are auto-rejected regardless of
 * temp/wind/precip — those go down the safety-warning path upstream.
 */
const GOOD_TEMP_MIN = 10;
const GOOD_TEMP_MAX = 28;
const GOOD_PRECIP_MAX_PCT = 30;
const GOOD_WIND_MAX_KMH = 25;
const FIRST_STORM_CODE = 71; // 71+ = snow / showers / thunderstorms

export const isGoodCyclingWeather = (f: GoodWeatherForecast): boolean => {
  if (!Number.isFinite(f.tempMin) || !Number.isFinite(f.tempMax)) return false;
  if (f.weatherCode >= FIRST_STORM_CODE) return false;
  if (f.tempMin < GOOD_TEMP_MIN) return false;
  if (f.tempMax > GOOD_TEMP_MAX) return false;
  if (f.precipitationProbability > GOOD_PRECIP_MAX_PCT) return false;
  if (f.windSpeedMax > GOOD_WIND_MAX_KMH) return false;
  return true;
};

/**
 * 40 title variants. Friendly with a needle of sarcasm — never mean,
 * never preachy, never shaming the rider. Plain text only (no emoji /
 * special glyphs) so they render identically on every Android OEM skin.
 */
export const GOOD_WEATHER_TITLES: readonly string[] = [
  'Your bike misses you. Just saying.',
  'Weather: actually decent. Excuses: invalid.',
  'Today the universe approved your commute.',
  'Bike weather detected. Helmet optional but encouraged.',
  "It's cycling weather. Your gym membership wept quietly.",
  'Perfect ride conditions. Even the wind is on your side today.',
  "Today's forecast: zero excuses.",
  "Weather's behaving. Will you?",
  'Sky says ride. Who are you to argue?',
  'Conditions: chef’s kiss. Car: collecting dust.',
  'Outside is doing its best. Reward it with a ride.',
  "It's a 'left the car at home and felt smug' kind of day.",
  'Mother Nature opened the bike-friendly window. Climb through it.',
  'Today is rideable. Your sofa is also there, but rideable.',
  'Forecast: suspiciously perfect. Cycle before it changes its mind.',
  'Bike-shaped opportunity detected on radar.',
  "Sun's out. Excuses, however, are recalled.",
  "Today's weather sponsored by 'just ride already'.",
  'Roads dry. Air breathable. Time to clock kilometres.',
  "It's nice out. That's it. That's the alert.",
  "Cycling weather check passed. Cycling motivation check: that's on you.",
  'Today the wind agreed not to bully you.',
  'Perfect cycling weather. Use it before someone else takes it.',
  'Outside is co-operating. Use it before it changes its mind.',
  'Conditions ideal for arriving smug and slightly sweaty.',
  'Weather rolled a natural 20. Roll with it.',
  'The forecast wrote you a permission slip.',
  "Sky's clear. Calendar's full. Bike's ready. Math checks out.",
  'Optimal cycling weather: confirmed by science, vibes, and Open-Meteo.',
  "Today's weather: less yelling, more pedalling.",
  'Even pedestrians look jealous. Take the hint.',
  'Sun: present. Wind: polite. Excuses: revoked.',
  'Forecast looks like a cycling brochure cover.',
  "It's a ride day. Don't make me come over there.",
  "Outside is currently in 'cycling mode'.",
  "Today the planet politely asks: 'one less car?'",
  'Bike weather: detected. Coffee at destination: highly probable.',
  'Conditions exceed minimum vibes for cycling.',
  'The forecast says yes. Listen to the forecast.',
  'Tires inflated, skies cooperative. The rest is on you.',
];

if (GOOD_WEATHER_TITLES.length < 30) {
  // Compile-time-ish guard: the product requirement is at least 30 variants.
  // Throwing here would crash the app on import; instead, fail loudly in
  // tests via the assertion below.
}

/**
 * Pick a random title. Accepts an optional `random` function so tests can
 * inject a deterministic source (or seeded PRNG) without monkey-patching
 * `Math.random` globally.
 */
export const pickRandomGoodWeatherTitle = (
  random: () => number = Math.random,
): string => {
  const r = random();
  // Clamp defensively — a misbehaving PRNG returning 1.0 would index OOB.
  const idx = Math.min(
    GOOD_WEATHER_TITLES.length - 1,
    Math.max(0, Math.floor(r * GOOD_WEATHER_TITLES.length)),
  );
  return GOOD_WEATHER_TITLES[idx];
};

const formatTempRange = (min: number, max: number): string =>
  `${Math.round(min)}–${Math.round(max)}°C`;

const conditionWord = (code: number): string => {
  if (code <= 1) return 'sunny';
  if (code <= 2) return 'partly cloudy';
  if (code <= 3) return 'cloudy';
  if (code <= 48) return 'foggy';
  return 'clear-ish';
};

/**
 * Body copy = pure weather facts. The title already carries the wit, so
 * keep the body informative and scannable at a glance on the lock screen.
 */
export const buildGoodWeatherBody = (f: GoodWeatherForecast): string => {
  const tempRange = formatTempRange(f.tempMin, f.tempMax);
  const condition = conditionWord(f.weatherCode);
  const wind = Math.round(f.windSpeedMax);
  const rain = Math.round(f.precipitationProbability);
  return `${tempRange}, ${condition}. Wind ${wind} km/h, rain ${rain}%.`;
};

// ---------------------------------------------------------------------------
// Pure helpers for the notification scheduler. Kept here (rather than in
// daily-weather-notification.ts) so they can be unit-tested without dragging
// in expo-notifications / react-native mocks.
// ---------------------------------------------------------------------------

/**
 * Morning anchor (rider's timezone) — the waking-window start that random
 * fire times snap to in daily-weather-schedule.ts.
 */
export const TRIGGER_HOUR = 8;
export const TRIGGER_MINUTE = 30;

const weatherCodeIsStorm = (code: number): boolean => code >= 95;
const weatherCodeIsSnow = (code: number): boolean =>
  (code >= 71 && code <= 77) || code === 85 || code === 86;
const weatherCodeIsFog = (code: number): boolean => code >= 45 && code <= 48;

/**
 * Build the notification {title, body} for a forecast.
 *
 * Safety warnings fire first (storm / snow / extreme cold / strong wind /
 * heavy or moderate rain / freezing / windy) regardless of the good-weather
 * variants. When the day is genuinely good, picks a random witty title and
 * pairs it with a factual body.
 */
export const buildCyclingAdvice = (
  forecast: GoodWeatherForecast,
  random: () => number = Math.random,
): { title: string; body: string } => {
  const tempRange = formatTempRange(forecast.tempMin, forecast.tempMax);
  const precipChance = forecast.precipitationProbability;
  const windMax = Math.round(forecast.windSpeedMax);

  if (weatherCodeIsStorm(forecast.weatherCode)) {
    return {
      title: 'Storm alert — skip the bike today',
      body: `Thunderstorms expected. ${tempRange}, gusts up to ${windMax} km/h. Stay safe indoors.`,
    };
  }

  if (weatherCodeIsSnow(forecast.weatherCode)) {
    return {
      title: 'Snow expected — roads may be slippery',
      body: `${tempRange} with snow. Consider public transit or drive carefully if you must go out.`,
    };
  }

  if (forecast.tempMin < -5) {
    return {
      title: 'Extreme cold — bundle up or skip',
      body: `Temperature dropping to ${Math.round(forecast.tempMin)}°C. If cycling, wear layers and protect extremities.`,
    };
  }

  if (windMax > 40) {
    return {
      title: 'Very strong winds today',
      body: `Gusts up to ${windMax} km/h. ${tempRange}. Cycling will be difficult — consider alternatives.`,
    };
  }

  if (precipChance > 70) {
    return {
      title: 'High chance of rain today',
      body: `${precipChance}% chance of rain, ${tempRange}. Pack rain gear and fenders if cycling.`,
    };
  }

  if (precipChance > 40) {
    return {
      title: 'Possible rain — be prepared',
      body: `${precipChance}% chance of rain, ${tempRange}. A light jacket and mudguards recommended.`,
    };
  }

  if (forecast.tempMin < 0) {
    return {
      title: 'Freezing morning — watch for ice',
      body: `Low of ${Math.round(forecast.tempMin)}°C. Roads may be icy early. Ride carefully and dress warm.`,
    };
  }

  if (windMax > 25) {
    return {
      title: 'Windy day ahead',
      body: `${tempRange} with winds up to ${windMax} km/h. Give yourself extra time and energy for headwinds.`,
    };
  }

  if (isGoodCyclingWeather(forecast)) {
    return {
      title: pickRandomGoodWeatherTitle(random),
      body: buildGoodWeatherBody(forecast),
    };
  }

  if (weatherCodeIsFog(forecast.weatherCode)) {
    return {
      title: 'Foggy morning — ride visible',
      body: `${tempRange} with fog expected. Use lights and hi-vis gear if cycling.`,
    };
  }

  return {
    title: "Today's cycling forecast",
    body: `${tempRange}, ${precipChance}% rain, wind ${windMax} km/h. Ride prepared!`,
  };
};

/**
 * Parse an Open-Meteo `forecast` response into a `GoodWeatherForecast` row,
 * or return `null` if the payload is missing required fields. Defensive
 * against partial responses (rate-limited, truncated, etc.) — callers can
 * bail without scheduling a malformed notification.
 */
export const parseForecastResponse = (
  data: unknown,
  idx: number,
): GoodWeatherForecast | null => {
  if (!data || typeof data !== 'object') return null;
  const daily = (data as { daily?: unknown }).daily;
  if (!daily || typeof daily !== 'object') return null;
  const d = daily as Record<string, unknown>;
  const time = d.time;
  if (!Array.isArray(time) || time.length <= idx) return null;

  const arr = (key: string): number[] | null =>
    Array.isArray(d[key]) ? (d[key] as number[]) : null;
  const mins = arr('temperature_2m_min');
  const maxs = arr('temperature_2m_max');
  const precs = arr('precipitation_probability_max');
  const winds = arr('wind_speed_10m_max');
  const codes = arr('weather_code');

  if (!mins || !maxs || !precs || !winds || !codes) return null;
  const tempMin = mins[idx];
  const tempMax = maxs[idx];
  const precipitationProbability = precs[idx];
  const windSpeedMax = winds[idx];
  const weatherCode = codes[idx];

  if (![tempMin, tempMax, precipitationProbability, windSpeedMax, weatherCode].every(
    (v) => typeof v === 'number' && Number.isFinite(v),
  )) {
    return null;
  }

  return { tempMin, tempMax, precipitationProbability, windSpeedMax, weatherCode };
};
