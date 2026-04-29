const OPEN_METEO_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const REQUEST_TIMEOUT_MS = 8_000;

export interface AirQualityData {
  readonly europeanAqi: number;
  readonly aqiLabel: string;
  readonly aqiColor: string;
  readonly pm25: number;
  readonly pm10: number;
  readonly no2: number;
  readonly ozone: number;
}

export interface WeatherData {
  readonly temperature: number;
  readonly weatherCode: number;
  readonly weatherLabel: string;
  readonly weatherIcon: string;
  readonly precipitationProbability: number;
  readonly windSpeed: number;
  readonly dailyTempMax: number;
  readonly dailyTempMin: number;
  readonly dailyPrecipMax: number;
  readonly dailyWindMax: number;
  /** Max precip probability from current hour to end of day */
  readonly remainingPrecipMax: number;
  /** Max wind speed from current hour to end of day */
  readonly remainingWindMax: number;
  /** Max wind gust speed from current hour to end of day */
  readonly remainingGustMax: number;
  /** Min temperature from current hour to end of day */
  readonly remainingTempMin: number;
  /** Max temperature from current hour to end of day */
  readonly remainingTempMax: number;
  readonly airQuality: AirQualityData | null;
}

export interface WeatherWarning {
  readonly type: 'rain' | 'freezing' | 'heat' | 'temp_drop' | 'wind' | 'air_quality' | 'pm25';
  readonly icon: string;
  readonly message: string;
}

type WmoMapping = { readonly label: string; readonly icon: string };

const WMO_CODE_MAP: Record<number, WmoMapping> = {
  0: { label: 'Clear sky', icon: 'sunny' },
  1: { label: 'Mainly clear', icon: 'sunny' },
  2: { label: 'Partly cloudy', icon: 'partly-sunny' },
  3: { label: 'Overcast', icon: 'cloudy' },
  45: { label: 'Fog', icon: 'cloud' },
  48: { label: 'Rime fog', icon: 'cloud' },
  51: { label: 'Light drizzle', icon: 'rainy' },
  53: { label: 'Moderate drizzle', icon: 'rainy' },
  55: { label: 'Dense drizzle', icon: 'rainy' },
  56: { label: 'Freezing drizzle', icon: 'rainy' },
  57: { label: 'Heavy freezing drizzle', icon: 'rainy' },
  61: { label: 'Light rain', icon: 'rainy' },
  63: { label: 'Moderate rain', icon: 'rainy' },
  65: { label: 'Heavy rain', icon: 'rainy' },
  66: { label: 'Freezing rain', icon: 'rainy' },
  67: { label: 'Heavy freezing rain', icon: 'rainy' },
  71: { label: 'Light snow', icon: 'snow' },
  73: { label: 'Moderate snow', icon: 'snow' },
  75: { label: 'Heavy snow', icon: 'snow' },
  77: { label: 'Snow grains', icon: 'snow' },
  80: { label: 'Light showers', icon: 'rainy' },
  81: { label: 'Moderate showers', icon: 'rainy' },
  82: { label: 'Heavy showers', icon: 'rainy' },
  85: { label: 'Light snow showers', icon: 'snow' },
  86: { label: 'Heavy snow showers', icon: 'snow' },
  95: { label: 'Thunderstorm', icon: 'thunderstorm' },
  96: { label: 'Thunderstorm with hail', icon: 'thunderstorm' },
  99: { label: 'Heavy thunderstorm', icon: 'thunderstorm' },
};

const resolveWmo = (code: number): WmoMapping =>
  WMO_CODE_MAP[code] ?? { label: 'Unknown', icon: 'cloud' };

type AqiMapping = { readonly label: string; readonly color: string };

const resolveAqi = (aqi: number): AqiMapping => {
  if (aqi <= 20) return { label: 'Good', color: '#22C55E' };
  if (aqi <= 40) return { label: 'Fair', color: '#84CC16' };
  if (aqi <= 60) return { label: 'Moderate', color: '#F59E0B' };
  if (aqi <= 80) return { label: 'Poor', color: '#F97316' };
  if (aqi <= 100) return { label: 'Very poor', color: '#EF4444' };
  return { label: 'Hazardous', color: '#991B1B' };
};

type AirQualityResponse = {
  current: {
    european_aqi: number;
    pm10: number;
    pm2_5: number;
    nitrogen_dioxide: number;
    ozone: number;
  };
};

const fetchAirQuality = async (
  lat: number,
  lon: number,
  signal: AbortSignal,
): Promise<AirQualityData | null> => {
  try {
    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      current: 'european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone',
      timezone: 'auto',
    });

    const response = await fetch(`${OPEN_METEO_AIR_QUALITY_URL}?${params.toString()}`, { signal });
    if (!response.ok) return null;

    const data = (await response.json()) as AirQualityResponse;
    const aqi = data.current.european_aqi;
    const mapping = resolveAqi(aqi);

    return {
      europeanAqi: aqi,
      aqiLabel: mapping.label,
      aqiColor: mapping.color,
      pm25: Math.round(data.current.pm2_5 * 10) / 10,
      pm10: Math.round(data.current.pm10 * 10) / 10,
      no2: Math.round(data.current.nitrogen_dioxide * 10) / 10,
      ozone: Math.round(data.current.ozone * 10) / 10,
    };
  } catch {
    return null;
  }
};

type OpenMeteoResponse = {
  current: {
    temperature_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_gusts_10m?: number;
    precipitation_probability: number;
  };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
    wind_gusts_10m_max?: number[];
    weather_code: number[];
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    wind_speed_10m: number[];
    wind_gusts_10m?: number[];
  };
};

/**
 * Fetch current weather + daily forecast from Open-Meteo.
 * No API key needed. Fails gracefully (returns null on error).
 */
export const fetchWeather = async (
  lat: number,
  lon: number,
): Promise<WeatherData | null> => {
  try {
    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      current: 'temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation_probability',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max',
      hourly: 'temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m',
      timezone: 'auto',
      forecast_days: '1',
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const [weatherResponse, airQuality] = await Promise.all([
      fetch(`${OPEN_METEO_WEATHER_URL}?${params.toString()}`, { signal: controller.signal }),
      fetchAirQuality(lat, lon, controller.signal),
    ]);

    clearTimeout(timeoutId);

    if (!weatherResponse.ok) return null;

    const data = (await weatherResponse.json()) as OpenMeteoResponse;
    const wmo = resolveWmo(data.current.weather_code);

    // Compute remaining-day aggregates from hourly data (current hour onward)
    const now = new Date();
    const currentHour = now.getHours();
    const hourlyTimes = data.hourly?.time ?? [];
    const startIdx = hourlyTimes.findIndex((t) => {
      const h = new Date(t).getHours();
      return h >= currentHour;
    });
    const remainingTemps = startIdx >= 0 ? (data.hourly?.temperature_2m ?? []).slice(startIdx) : [];
    const remainingPrecips = startIdx >= 0 ? (data.hourly?.precipitation_probability ?? []).slice(startIdx) : [];
    const remainingWinds = startIdx >= 0 ? (data.hourly?.wind_speed_10m ?? []).slice(startIdx) : [];
    const remainingGusts = startIdx >= 0 ? (data.hourly?.wind_gusts_10m ?? []).slice(startIdx) : [];

    const remainingPrecipMax = remainingPrecips.length > 0 ? Math.max(...remainingPrecips) : (data.daily.precipitation_probability_max[0] ?? 0);

    // Always fold the live current reading and the daily peak into the wind/gust
    // candidate set. Without this, late-evening windows shrink to one or two
    // hours and drop the warning even when the wind is blasting RIGHT NOW.
    // Math.ceil rather than Math.round closes the round-then-strict-compare
    // dead zone (a real 25.4 km/h day no longer rounds down to 25 and slips
    // under a > 25 threshold).
    const liveWind = data.current.wind_speed_10m ?? 0;
    const liveGust = data.current.wind_gusts_10m ?? 0;
    const dailyWindPeak = data.daily.wind_speed_10m_max[0] ?? 0;
    const dailyGustPeak = data.daily.wind_gusts_10m_max?.[0] ?? 0;

    const windCandidates = [liveWind, ...remainingWinds, dailyWindPeak].filter((n) => Number.isFinite(n));
    const gustCandidates = [liveGust, ...remainingGusts, dailyGustPeak].filter((n) => Number.isFinite(n));
    const remainingWindMax = windCandidates.length > 0 ? Math.ceil(Math.max(...windCandidates)) : 0;
    const remainingGustMax = gustCandidates.length > 0 ? Math.ceil(Math.max(...gustCandidates)) : 0;

    const remainingTempMin = remainingTemps.length > 0 ? Math.round(Math.min(...remainingTemps)) : Math.round(data.daily.temperature_2m_min[0]);
    const remainingTempMax = remainingTemps.length > 0 ? Math.round(Math.max(...remainingTemps)) : Math.round(data.daily.temperature_2m_max[0]);

    return {
      temperature: Math.round(data.current.temperature_2m),
      weatherCode: data.current.weather_code,
      weatherLabel: wmo.label,
      weatherIcon: wmo.icon,
      precipitationProbability: data.current.precipitation_probability ?? 0,
      windSpeed: Math.round(data.current.wind_speed_10m),
      dailyTempMax: Math.round(data.daily.temperature_2m_max[0]),
      dailyTempMin: Math.round(data.daily.temperature_2m_min[0]),
      dailyPrecipMax: data.daily.precipitation_probability_max[0] ?? 0,
      dailyWindMax: Math.round(data.daily.wind_speed_10m_max[0]),
      remainingPrecipMax,
      remainingWindMax,
      remainingGustMax,
      remainingTempMin,
      remainingTempMax,
      airQuality,
    };
  } catch {
    return null;
  }
};

const RAIN_THRESHOLD = 50;
// Temperature comfort zone — when min/max stay within these bounds we issue
// no temperature warning at all. Cold/heat/swing rules below only fire when
// the day exits this zone.
const COMFORT_TEMP_MIN = 10;
const COMFORT_TEMP_MAX = 27;
// Cold warning fires when any hour remaining today drops below this.
const COLD_TEMP_THRESHOLD = 5;
// Heat warning fires when any hour remaining today exceeds this.
const HOT_TEMP_THRESHOLD = 30;
// Swing warning fires when (max - min) across remaining hours exceeds this.
const TEMP_SWING_THRESHOLD = 13;
// Wind tiers (km/h, mean wind at 10m AGL). Effective wind also folds in 60% of
// the gust speed, so a low-mean / high-gust day still surfaces a warning.
const WIND_BREEZY_THRESHOLD = 20;
const WIND_STRONG_THRESHOLD = 30;
const WIND_HAZARDOUS_THRESHOLD = 45;
// Gust speeds that bump the tier up regardless of mean wind.
const GUST_NOTABLE_THRESHOLD = 35;
const GUST_HAZARDOUS_THRESHOLD = 55;
const AQI_MODERATE_THRESHOLD = 50;
const AQI_POOR_THRESHOLD = 100;
const PM25_THRESHOLD = 25;

/**
 * Check weather data against cycling safety thresholds.
 * Returns an array of warnings (empty = nothing to flag). The wording is
 * advisory — surfaces ride-with-caution guidance rather than discouraging
 * the ride.
 */
export const getWeatherWarnings = (data: WeatherData): readonly WeatherWarning[] => {
  const warnings: WeatherWarning[] = [];

  if (data.remainingPrecipMax > RAIN_THRESHOLD) {
    warnings.push({
      type: 'rain',
      icon: 'rainy',
      message: `High chance of rain later today (${data.remainingPrecipMax}%) — pack rain gear and ride with caution`,
    });
  }

  // Skip every temperature warning when the day stays in the comfort zone.
  // Outside it, fire any of cold / heat / swing that applies.
  const inComfortZone =
    data.remainingTempMin >= COMFORT_TEMP_MIN &&
    data.remainingTempMax <= COMFORT_TEMP_MAX;

  if (!inComfortZone) {
    if (data.remainingTempMin < COLD_TEMP_THRESHOLD) {
      warnings.push({
        type: 'freezing',
        icon: 'snow',
        message: `Cold conditions: ${data.remainingTempMin}°C — dress warmly and ride with caution`,
      });
    }

    if (data.remainingTempMax > HOT_TEMP_THRESHOLD) {
      warnings.push({
        type: 'heat',
        icon: 'thermometer',
        message: `Hot conditions: ${data.remainingTempMax}°C — hydrate and ride with caution`,
      });
    }

    if (data.remainingTempMax - data.remainingTempMin > TEMP_SWING_THRESHOLD) {
      warnings.push({
        type: 'temp_drop',
        icon: 'thermometer',
        message: `Big temperature swing: ${data.remainingTempMin}°C → ${data.remainingTempMax}°C — layer up and ride with caution`,
      });
    }
  }

  // Tiered wind warning. Effective wind = max(mean, ceil(gust * 0.6)) so a
  // gusty 18 km/h-mean / 40 km/h-gust day still trips the breezy tier.
  const effectiveWindKmh = Math.max(
    data.remainingWindMax,
    Math.ceil(data.remainingGustMax * 0.6),
  );

  let windTier: 'breezy' | 'strong' | 'hazardous' | null = null;
  if (
    effectiveWindKmh >= WIND_HAZARDOUS_THRESHOLD ||
    data.remainingGustMax >= GUST_HAZARDOUS_THRESHOLD
  ) {
    windTier = 'hazardous';
  } else if (
    effectiveWindKmh >= WIND_STRONG_THRESHOLD ||
    data.remainingGustMax >= GUST_NOTABLE_THRESHOLD
  ) {
    windTier = 'strong';
  } else if (effectiveWindKmh >= WIND_BREEZY_THRESHOLD) {
    windTier = 'breezy';
  }

  if (windTier !== null) {
    const gustSuffix =
      data.remainingGustMax >= GUST_NOTABLE_THRESHOLD
        ? `, gusts to ${data.remainingGustMax} km/h`
        : '';
    const windCopy: Record<typeof windTier, string> = {
      breezy: `Breezy: ${data.remainingWindMax} km/h${gustSuffix} — ride with caution`,
      strong: `Strong wind: ${data.remainingWindMax} km/h${gustSuffix} — ride with caution`,
      hazardous: `Hazardous wind: ${data.remainingWindMax} km/h${gustSuffix} — extreme caution, prefer sheltered routes`,
    };
    warnings.push({
      type: 'wind',
      icon: 'flag',
      message: windCopy[windTier],
    });
  }

  if (data.airQuality) {
    if (data.airQuality.europeanAqi > AQI_POOR_THRESHOLD) {
      warnings.push({
        type: 'air_quality',
        icon: 'cloud',
        message: `Poor air quality (AQI ${data.airQuality.europeanAqi}) — limit exertion and ride with caution`,
      });
    } else if (data.airQuality.europeanAqi > AQI_MODERATE_THRESHOLD) {
      warnings.push({
        type: 'air_quality',
        icon: 'cloud',
        message: `Moderate air quality (AQI ${data.airQuality.europeanAqi}) — sensitive groups should ride with caution`,
      });
    }

    if (data.airQuality.pm25 > PM25_THRESHOLD) {
      warnings.push({
        type: 'pm25',
        icon: 'alert-circle',
        message: `High fine particulate matter: PM2.5 ${data.airQuality.pm25} μg/m³ — ride with caution`,
      });
    }
  }

  return warnings;
};
