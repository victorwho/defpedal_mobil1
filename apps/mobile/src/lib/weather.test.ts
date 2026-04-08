import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchWeather, getWeatherWarnings, type WeatherData } from './weather';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createOpenMeteoResponse = (overrides?: Partial<{
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  precipitationProbability: number;
  tempMax: number;
  tempMin: number;
  precipMax: number;
  windMax: number;
}>) => ({
  current: {
    temperature_2m: overrides?.temperature ?? 22,
    weather_code: overrides?.weatherCode ?? 0,
    wind_speed_10m: overrides?.windSpeed ?? 10,
    precipitation_probability: overrides?.precipitationProbability ?? 5,
  },
  daily: {
    temperature_2m_max: [overrides?.tempMax ?? 25],
    temperature_2m_min: [overrides?.tempMin ?? 15],
    precipitation_probability_max: [overrides?.precipMax ?? 10],
    wind_speed_10m_max: [overrides?.windMax ?? 15],
    weather_code: [overrides?.weatherCode ?? 0],
  },
  hourly: {
    time: Array.from({ length: 24 }, (_, i) => {
      const d = new Date();
      d.setHours(i, 0, 0, 0);
      return d.toISOString();
    }),
    temperature_2m: Array.from({ length: 24 }, () => overrides?.temperature ?? 22),
    precipitation_probability: Array.from({ length: 24 }, () => overrides?.precipitationProbability ?? 5),
    wind_speed_10m: Array.from({ length: 24 }, () => overrides?.windSpeed ?? 10),
  },
});

const createAirQualityResponse = (overrides?: Partial<{
  europeanAqi: number;
  pm25: number;
  pm10: number;
  no2: number;
  ozone: number;
}>) => ({
  current: {
    european_aqi: overrides?.europeanAqi ?? 25,
    pm2_5: overrides?.pm25 ?? 8.5,
    pm10: overrides?.pm10 ?? 12.3,
    nitrogen_dioxide: overrides?.no2 ?? 15.2,
    ozone: overrides?.ozone ?? 45.1,
  },
});

const mockFetchResponses = (weatherData: unknown, airQualityData: unknown, weatherOk = true, aqiOk = true) => {
  let callCount = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
    callCount++;
    const urlStr = typeof url === 'string' ? url : url.toString();

    if (urlStr.includes('air-quality')) {
      return {
        ok: aqiOk,
        json: async () => airQualityData,
        text: async () => JSON.stringify(airQualityData),
      } as Response;
    }

    return {
      ok: weatherOk,
      json: async () => weatherData,
      text: async () => JSON.stringify(weatherData),
    } as Response;
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchWeather', () => {
  it('returns weather data for valid coordinates', async () => {
    const weatherResponse = createOpenMeteoResponse();
    const aqiResponse = createAirQualityResponse();
    mockFetchResponses(weatherResponse, aqiResponse);

    const result = await fetchWeather(44.43, 26.1);

    expect(result).not.toBeNull();
    expect(result!.temperature).toBe(22);
    expect(result!.weatherCode).toBe(0);
    expect(result!.weatherLabel).toBe('Clear sky');
    expect(result!.weatherIcon).toBe('sunny');
    expect(result!.windSpeed).toBe(10);
    expect(result!.precipitationProbability).toBe(5);
    expect(result!.dailyTempMax).toBe(25);
    expect(result!.dailyTempMin).toBe(15);
  });

  it('includes air quality data when available', async () => {
    mockFetchResponses(createOpenMeteoResponse(), createAirQualityResponse({ europeanAqi: 25 }));

    const result = await fetchWeather(44.43, 26.1);

    expect(result).not.toBeNull();
    expect(result!.airQuality).not.toBeNull();
    expect(result!.airQuality!.europeanAqi).toBe(25);
    expect(result!.airQuality!.aqiLabel).toBe('Fair');
    expect(result!.airQuality!.aqiColor).toBe('#84CC16');
  });

  it('returns null air quality when AQI fetch fails', async () => {
    mockFetchResponses(createOpenMeteoResponse(), null, true, false);

    const result = await fetchWeather(44.43, 26.1);

    expect(result).not.toBeNull();
    expect(result!.airQuality).toBeNull();
  });

  it('returns null when weather fetch fails', async () => {
    mockFetchResponses(null, null, false, false);

    const result = await fetchWeather(44.43, 26.1);

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await fetchWeather(44.43, 26.1);

    expect(result).toBeNull();
  });

  it('maps WMO codes to correct weather labels', async () => {
    // Thunderstorm
    mockFetchResponses(createOpenMeteoResponse({ weatherCode: 95 }), createAirQualityResponse());

    const result = await fetchWeather(44.43, 26.1);

    expect(result!.weatherLabel).toBe('Thunderstorm');
    expect(result!.weatherIcon).toBe('thunderstorm');
  });

  it('maps unknown WMO code to Unknown', async () => {
    mockFetchResponses(createOpenMeteoResponse({ weatherCode: 999 }), createAirQualityResponse());

    const result = await fetchWeather(44.43, 26.1);

    expect(result!.weatherLabel).toBe('Unknown');
    expect(result!.weatherIcon).toBe('cloud');
  });

  it('resolves AQI levels correctly', async () => {
    // Good (<=20)
    mockFetchResponses(createOpenMeteoResponse(), createAirQualityResponse({ europeanAqi: 15 }));
    let result = await fetchWeather(44.43, 26.1);
    expect(result!.airQuality!.aqiLabel).toBe('Good');

    vi.restoreAllMocks();

    // Hazardous (>100)
    mockFetchResponses(createOpenMeteoResponse(), createAirQualityResponse({ europeanAqi: 120 }));
    result = await fetchWeather(44.43, 26.1);
    expect(result!.airQuality!.aqiLabel).toBe('Hazardous');
  });

  it('rounds temperature values', async () => {
    mockFetchResponses(
      createOpenMeteoResponse({ temperature: 22.7, tempMax: 25.3, tempMin: 14.6 }),
      createAirQualityResponse(),
    );

    const result = await fetchWeather(44.43, 26.1);

    expect(result!.temperature).toBe(23);
    expect(result!.dailyTempMax).toBe(25);
    expect(result!.dailyTempMin).toBe(15);
  });
});

describe('getWeatherWarnings', () => {
  const makeWeatherData = (overrides: Partial<WeatherData> = {}): WeatherData => ({
    temperature: 20,
    weatherCode: 0,
    weatherLabel: 'Clear sky',
    weatherIcon: 'sunny',
    precipitationProbability: 5,
    windSpeed: 10,
    dailyTempMax: 25,
    dailyTempMin: 15,
    dailyPrecipMax: 10,
    dailyWindMax: 15,
    remainingPrecipMax: 10,
    remainingWindMax: 15,
    remainingTempMin: 15,
    remainingTempMax: 25,
    airQuality: null,
    ...overrides,
  });

  it('returns empty array for good weather', () => {
    // Ensure no temp swing: max-min <= 5
    const warnings = getWeatherWarnings(makeWeatherData({
      remainingTempMin: 20,
      remainingTempMax: 24,
    }));

    expect(warnings).toEqual([]);
  });

  it('warns about high rain probability', () => {
    // Set temp min/max close together to avoid temp_drop warning
    const warnings = getWeatherWarnings(makeWeatherData({
      remainingPrecipMax: 70,
      remainingTempMin: 20,
      remainingTempMax: 23,
    }));

    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('rain');
    expect(warnings[0].message).toContain('70%');
  });

  it('warns about freezing temperatures', () => {
    const warnings = getWeatherWarnings(makeWeatherData({ remainingTempMin: -3 }));

    expect(warnings.some((w) => w.type === 'freezing')).toBe(true);
    expect(warnings.find((w) => w.type === 'freezing')!.message).toContain('-3');
  });

  it('warns about temperature swing', () => {
    const warnings = getWeatherWarnings(makeWeatherData({
      remainingTempMin: 5,
      remainingTempMax: 20,
    }));

    expect(warnings.some((w) => w.type === 'temp_drop')).toBe(true);
  });

  it('does not warn about small temperature swing', () => {
    const warnings = getWeatherWarnings(makeWeatherData({
      remainingTempMin: 18,
      remainingTempMax: 22,
    }));

    expect(warnings.some((w) => w.type === 'temp_drop')).toBe(false);
  });

  it('warns about strong wind', () => {
    const warnings = getWeatherWarnings(makeWeatherData({ remainingWindMax: 30 }));

    expect(warnings.some((w) => w.type === 'wind')).toBe(true);
    expect(warnings.find((w) => w.type === 'wind')!.message).toContain('30');
  });

  it('warns about poor air quality', () => {
    const warnings = getWeatherWarnings(makeWeatherData({
      airQuality: {
        europeanAqi: 110,
        aqiLabel: 'Hazardous',
        aqiColor: '#991B1B',
        pm25: 30,
        pm10: 40,
        no2: 50,
        ozone: 60,
      },
    }));

    expect(warnings.some((w) => w.type === 'air_quality')).toBe(true);
    expect(warnings.find((w) => w.type === 'air_quality')!.message).toContain('postponing');
  });

  it('warns about moderate air quality', () => {
    const warnings = getWeatherWarnings(makeWeatherData({
      airQuality: {
        europeanAqi: 60,
        aqiLabel: 'Moderate',
        aqiColor: '#F59E0B',
        pm25: 10,
        pm10: 20,
        no2: 30,
        ozone: 40,
      },
    }));

    expect(warnings.some((w) => w.type === 'air_quality')).toBe(true);
    expect(warnings.find((w) => w.type === 'air_quality')!.message).toContain('sensitive groups');
  });

  it('warns about high PM2.5', () => {
    const warnings = getWeatherWarnings(makeWeatherData({
      airQuality: {
        europeanAqi: 30,
        aqiLabel: 'Fair',
        aqiColor: '#84CC16',
        pm25: 30,
        pm10: 20,
        no2: 15,
        ozone: 40,
      },
    }));

    expect(warnings.some((w) => w.type === 'pm25')).toBe(true);
    expect(warnings.find((w) => w.type === 'pm25')!.message).toContain('PM2.5');
  });

  it('can trigger multiple warnings simultaneously', () => {
    const warnings = getWeatherWarnings(makeWeatherData({
      remainingPrecipMax: 80,
      remainingWindMax: 30,
      remainingTempMin: -2,
      remainingTempMax: 10,
    }));

    expect(warnings.length).toBeGreaterThanOrEqual(3);
    expect(warnings.some((w) => w.type === 'rain')).toBe(true);
    expect(warnings.some((w) => w.type === 'wind')).toBe(true);
    expect(warnings.some((w) => w.type === 'freezing')).toBe(true);
  });
});
