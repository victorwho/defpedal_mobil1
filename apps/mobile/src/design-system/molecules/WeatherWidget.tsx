import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import type { WeatherData } from '../../lib/weather';
import { brandColors, gray, safetyColors } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textSm } from '../tokens/typography';

type WeatherWidgetProps = {
  weather: WeatherData | null;
  isLoading: boolean;
  /** When false the widget hides instead of showing a permanent loading spinner. */
  hasLocation?: boolean;
};

const precipColor = (pct: number): string => {
  if (pct > 50) return safetyColors.caution;
  return gray[400];
};

const windColor = (speed: number): string => {
  if (speed > 25) return safetyColors.caution;
  return gray[400];
};

export const WeatherWidget = ({ weather, isLoading, hasLocation = true }: WeatherWidgetProps) => {
  // Hide entirely when we have no location to fetch weather for
  if (!hasLocation && !weather) return null;

  if (isLoading) {
    return (
      <View style={styles.card}>
        <Text style={styles.loadingText}>Loading weather...</Text>
      </View>
    );
  }

  if (!weather) return null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons
          name={weather.weatherIcon as any}
          size={20}
          color={brandColors.textPrimary}
        />
        <Text style={[styles.metricText, { color: brandColors.textPrimary }]}>{weather.temperature}°C</Text>

        <View style={styles.divider} />

        <Ionicons name="water" size={14} color={precipColor(weather.precipitationProbability)} />
        <Text style={[styles.metricText, { color: precipColor(weather.precipitationProbability) }]}>
          {weather.precipitationProbability}%
        </Text>

        <View style={styles.divider} />

        <Ionicons name="flag" size={14} color={windColor(weather.windSpeed)} />
        <Text style={[styles.metricText, { color: windColor(weather.windSpeed) }]}>
          {weather.windSpeed} km/h
        </Text>

        {weather.airQuality ? (
          <>
            <View style={styles.divider} />
            <Text style={[styles.metricText, { color: weather.airQuality.aqiColor }]}>
              AQI {weather.airQuality.europeanAqi}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    backgroundColor: 'rgba(17, 24, 39, 0.86)',
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  metricText: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    fontSize: 13,
  },
  loadingText: {
    ...textSm,
    color: gray[500],
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: gray[700],
  },
});
