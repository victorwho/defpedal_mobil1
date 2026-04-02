import type { CommunityStats } from '@defensivepedal/core';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { brandColors, darkTheme } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import {
  fontFamily,
  textSm,
  textXs,
  textLg,
  textDataMd,
} from '../tokens/typography';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CommunityStatsCardProps = {
  readonly stats: CommunityStats | null;
  readonly isLoading: boolean;
  readonly error: string | null;
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const formatDistance = (meters: number): string => {
  const km = meters / 1000;
  return km >= 1000 ? `${(km / 1000).toFixed(1)}k` : km.toFixed(0);
};

const formatDuration = (seconds: number): string => {
  const hours = seconds / 3600;
  return hours >= 1000 ? `${(hours / 1000).toFixed(1)}k` : hours.toFixed(0);
};

const formatCo2 = (kg: number): string => {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
  return kg.toFixed(1);
};

// ---------------------------------------------------------------------------
// Stat Tile
// ---------------------------------------------------------------------------

type StatTileProps = {
  readonly value: string;
  readonly unit: string;
  readonly label: string;
};

const StatTile = ({ value, unit, label }: StatTileProps) => (
  <View style={styles.tile}>
    <View style={styles.tileValueRow}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileUnit}>{unit}</Text>
    </View>
    <Text style={styles.tileLabel}>{label}</Text>
  </View>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CommunityStatsCard = ({
  stats,
  isLoading,
  error,
}: CommunityStatsCardProps) => {
  if (isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={brandColors.accent} size="small" />
        <Text style={styles.loadingText}>Loading community stats...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.card}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!stats) {
    return null;
  }

  const heading = stats.localityName
    ? `Cyclists in ${stats.localityName}`
    : 'Your cycling community';

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{heading}</Text>

      <View style={styles.grid}>
        <StatTile
          value={String(stats.totalTrips)}
          unit="trips"
          label="Total rides"
        />
        <StatTile
          value={formatDistance(stats.totalDistanceMeters)}
          unit="km"
          label="Distance"
        />
        <StatTile
          value={formatDuration(stats.totalDurationSeconds)}
          unit="hrs"
          label="Ride time"
        />
        <StatTile
          value={formatCo2(stats.totalCo2SavedKg)}
          unit="kg"
          label="CO2 saved"
        />
      </View>

      <View style={styles.riderRow}>
        <Text style={styles.riderCount}>{stats.uniqueRiders}</Text>
        <Text style={styles.riderLabel}>
          {stats.uniqueRiders === 1 ? 'active rider' : 'active riders'}
        </Text>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    backgroundColor: darkTheme.bgPrimary,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    paddingHorizontal: space[4],
    paddingVertical: space[4],
    gap: space[3],
    ...shadows.md,
  },
  heading: {
    ...textLg,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.accent,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  tile: {
    flex: 1,
    minWidth: '45%' as unknown as number,
    backgroundColor: darkTheme.bgSecondary,
    borderRadius: radii.lg,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    gap: 2,
  },
  tileValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  tileValue: {
    ...textDataMd,
    fontFamily: fontFamily.mono.bold,
    color: darkTheme.textPrimary,
  },
  tileUnit: {
    ...textXs,
    fontFamily: fontFamily.mono.medium,
    color: darkTheme.textMuted,
  },
  tileLabel: {
    ...textXs,
    fontFamily: fontFamily.body.regular,
    color: darkTheme.textSecondary,
  },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space[2],
    paddingTop: space[1],
  },
  riderCount: {
    ...textDataMd,
    fontFamily: fontFamily.mono.bold,
    color: brandColors.accent,
  },
  riderLabel: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textSecondary,
  },
  loadingText: {
    ...textSm,
    color: darkTheme.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    ...textSm,
    color: darkTheme.danger,
    textAlign: 'center',
  },
});
