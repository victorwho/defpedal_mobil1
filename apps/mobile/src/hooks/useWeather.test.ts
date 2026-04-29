// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WeatherData } from '../lib/weather';

const mockFetchWeather = vi.fn();
const mockGetWeatherWarnings = vi.fn();

vi.mock('../lib/weather', () => ({
  fetchWeather: (...args: unknown[]) => mockFetchWeather(...args),
  getWeatherWarnings: (...args: unknown[]) => mockGetWeatherWarnings(...args),
}));

import { useWeather } from './useWeather';

let queryClient: QueryClient;

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.clearAllMocks();
});

afterEach(() => {
  queryClient.clear();
});

const sampleWeatherData: WeatherData = {
  temperature: 22,
  weatherCode: 2,
  weatherLabel: 'Partly cloudy',
  weatherIcon: 'partly-sunny',
  precipitationProbability: 10,
  windSpeed: 12,
  dailyTempMax: 25,
  dailyTempMin: 15,
  dailyPrecipMax: 30,
  dailyWindMax: 18,
  remainingPrecipMax: 25,
  remainingWindMax: 15,
  remainingGustMax: 18,
  remainingTempMin: 18,
  remainingTempMax: 24,
  airQuality: null,
};

describe('useWeather', () => {
  it('does not fetch when lat is null', () => {
    const { result } = renderHook(() => useWeather(null, 26.1), {
      wrapper,
    });

    expect(result.current.weather).toBeNull();
    expect(result.current.warnings).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockFetchWeather).not.toHaveBeenCalled();
  });

  it('does not fetch when lon is null', () => {
    const { result } = renderHook(() => useWeather(44.43, null), {
      wrapper,
    });

    expect(result.current.weather).toBeNull();
    expect(result.current.warnings).toEqual([]);
    expect(mockFetchWeather).not.toHaveBeenCalled();
  });

  it('does not fetch when both are null', () => {
    const { result } = renderHook(() => useWeather(null, null), {
      wrapper,
    });

    expect(result.current.weather).toBeNull();
    expect(result.current.warnings).toEqual([]);
    expect(mockFetchWeather).not.toHaveBeenCalled();
  });

  it('fetches weather and computes warnings when coords are provided', async () => {
    mockFetchWeather.mockResolvedValue(sampleWeatherData);
    mockGetWeatherWarnings.mockReturnValue([]);

    const { result } = renderHook(() => useWeather(44.4321, 26.1089), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.weather).not.toBeNull();
    });

    expect(result.current.weather).toEqual(sampleWeatherData);
    expect(result.current.warnings).toEqual([]);
    // Coordinates should be rounded to 2 decimal places
    expect(mockFetchWeather).toHaveBeenCalledWith(44.43, 26.11);
    expect(mockGetWeatherWarnings).toHaveBeenCalledWith(sampleWeatherData);
  });

  it('rounds coordinates to 2 decimal places for cache efficiency', async () => {
    mockFetchWeather.mockResolvedValue(sampleWeatherData);
    mockGetWeatherWarnings.mockReturnValue([]);

    renderHook(() => useWeather(44.4389, 26.1051), { wrapper });

    await waitFor(() => {
      expect(mockFetchWeather).toHaveBeenCalled();
    });

    expect(mockFetchWeather).toHaveBeenCalledWith(44.44, 26.11);
  });

  it('returns warnings when weather data triggers them', async () => {
    const warningWeather: WeatherData = {
      ...sampleWeatherData,
      remainingPrecipMax: 75,
      remainingWindMax: 35,
    };
    const expectedWarnings = [
      { type: 'rain', icon: 'rainy', message: 'High chance of rain later today (75%)' },
      { type: 'wind', icon: 'flag', message: 'Strong wind expected: 35 km/h' },
    ];
    mockFetchWeather.mockResolvedValue(warningWeather);
    mockGetWeatherWarnings.mockReturnValue(expectedWarnings);

    const { result } = renderHook(() => useWeather(44.43, 26.1), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.weather).not.toBeNull();
    });

    expect(result.current.warnings).toEqual(expectedWarnings);
  });

  it('returns null weather and empty warnings when fetch returns null', async () => {
    mockFetchWeather.mockResolvedValue(null);

    const { result } = renderHook(() => useWeather(44.43, 26.1), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.weather).toBeNull();
    expect(result.current.warnings).toEqual([]);
    // getWeatherWarnings should not be called when weather is null
    expect(mockGetWeatherWarnings).not.toHaveBeenCalled();
  });

  it('returns null weather on fetch failure', async () => {
    mockFetchWeather.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useWeather(44.43, 26.1), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.weather).toBeNull();
    expect(result.current.warnings).toEqual([]);
  });
});
