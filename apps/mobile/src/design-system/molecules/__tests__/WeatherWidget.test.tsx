// @vitest-environment happy-dom
/**
 * WeatherWidget Molecule — Unit Tests
 *
 * Tests rendering, loading state, null weather, and data display.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark' as const,
    colors: { accent: '#FACC15' },
  }),
}));

vi.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) =>
      React.createElement('span', { ref, 'data-testid': `icon-${props.name}`, ...props }),
    ),
  };
});

const { WeatherWidget } = await import('../WeatherWidget');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createWeatherData = (overrides: Record<string, unknown> = {}) => ({
  temperature: 22,
  weatherCode: 0,
  weatherLabel: 'Clear sky',
  weatherIcon: 'sunny',
  precipitationProbability: 10,
  windSpeed: 12,
  dailyTempMax: 25,
  dailyTempMin: 15,
  dailyPrecipMax: 20,
  dailyWindMax: 18,
  remainingPrecipMax: 15,
  remainingWindMax: 14,
  remainingGustMax: 17,
  remainingTempMin: 16,
  remainingTempMax: 24,
  airQuality: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WeatherWidget', () => {
  describe('loading state', () => {
    it('shows loading text when isLoading is true', () => {
      render(<WeatherWidget weather={null} isLoading />);
      expect(screen.getByText('Loading weather...')).toBeTruthy();
    });
  });

  describe('no data', () => {
    it('returns null when weather is null and not loading', () => {
      const { container } = render(
        <WeatherWidget weather={null} isLoading={false} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('returns null when hasLocation is false and weather is null', () => {
      const { container } = render(
        <WeatherWidget weather={null} isLoading={false} hasLocation={false} />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('with weather data', () => {
    it('displays temperature', () => {
      const weather = createWeatherData();
      render(<WeatherWidget weather={weather as any} isLoading={false} />);
      expect(screen.getByText('22°C')).toBeTruthy();
    });

    it('displays precipitation probability', () => {
      const weather = createWeatherData();
      render(<WeatherWidget weather={weather as any} isLoading={false} />);
      expect(screen.getByText('10%')).toBeTruthy();
    });

    it('displays wind speed', () => {
      const weather = createWeatherData();
      render(<WeatherWidget weather={weather as any} isLoading={false} />);
      expect(screen.getByText('12 km/h')).toBeTruthy();
    });

    it('displays AQI when air quality data is present', () => {
      const weather = createWeatherData({
        airQuality: {
          europeanAqi: 42,
          aqiLabel: 'Good',
          aqiColor: '#22C55E',
          pm25: 8,
          pm10: 12,
          no2: 15,
          ozone: 30,
        },
      });
      render(<WeatherWidget weather={weather as any} isLoading={false} />);
      expect(screen.getByText('AQI 42')).toBeTruthy();
    });

    it('does not display AQI when air quality is null', () => {
      const weather = createWeatherData();
      render(<WeatherWidget weather={weather as any} isLoading={false} />);
      expect(screen.queryByText(/AQI/)).toBeNull();
    });
  });
});
