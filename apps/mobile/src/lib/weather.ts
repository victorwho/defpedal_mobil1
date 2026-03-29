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
  readonly airQuality: AirQualityData | null;
}

export interface WeatherWarning {
  readonly type: 'rain' | 'freezing' | 'temp_drop' | 'wind' | 'air_quality' | 'pm25';
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
    precipitation_probability: number;
  };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
    weather_code: number[];
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
      current: 'temperature_2m,weather_code,wind_speed_10m,precipitation_probability',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
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
      airQuality,
    };
  } catch {
    return null;
  }
};

const RAIN_THRESHOLD = 50;
const FREEZE_THRESHOLD = 0;
const TEMP_DROP_THRESHOLD = 5;
const WIND_THRESHOLD = 25;
const AQI_MODERATE_THRESHOLD = 50;
const AQI_POOR_THRESHOLD = 100;
const PM25_THRESHOLD = 25;

/**
 * Check weather data against cycling safety thresholds.
 * Returns an array of warnings (empty = safe to ride).
 */
export const getWeatherWarnings = (data: WeatherData): readonly WeatherWarning[] => {
  const warnings: WeatherWarning[] = [];

  if (data.dailyPrecipMax > RAIN_THRESHOLD) {
    warnings.push({
      type: 'rain',
      icon: 'rainy',
      message: `High chance of rain today (${data.dailyPrecipMax}%)`,
    });
  }

  if (data.temperature < FREEZE_THRESHOLD) {
    warnings.push({
      type: 'freezing',
      icon: 'snow',
      message: `Freezing temperature: ${data.temperature}°C`,
    });
  }

  if (data.dailyTempMax - data.dailyTempMin > TEMP_DROP_THRESHOLD) {
    warnings.push({
      type: 'temp_drop',
      icon: 'thermometer',
      message: `Temperature swing today: ${data.dailyTempMin}°C → ${data.dailyTempMax}°C`,
    });
  }

  if (data.dailyWindMax > WIND_THRESHOLD) {
    warnings.push({
      type: 'wind',
      icon: 'flag',
      message: `Strong wind: ${data.dailyWindMax} km/h`,
    });
  }

  if (data.airQuality) {
    if (data.airQuality.europeanAqi > AQI_POOR_THRESHOLD) {
      warnings.push({
        type: 'air_quality',
        icon: 'cloud',
        message: `Poor air quality (AQI ${data.airQuality.europeanAqi}) — consider postponing your ride`,
      });
    } else if (data.airQuality.europeanAqi > AQI_MODERATE_THRESHOLD) {
      warnings.push({
        type: 'air_quality',
        icon: 'cloud',
        message: `Moderate air quality (AQI ${data.airQuality.europeanAqi}) — sensitive groups should limit outdoor exertion`,
      });
    }

    if (data.airQuality.pm25 > PM25_THRESHOLD) {
      warnings.push({
        type: 'pm25',
        icon: 'alert-circle',
        message: `High fine particulate matter: PM2.5 ${data.airQuality.pm25} μg/m³`,
      });
    }
  }

  return warnings;
};
