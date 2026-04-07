import type { CommunityStats } from '@defensivepedal/core';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTheme, type ThemeColors } from '..';
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
import { useT } from '../../hooks/useTranslation';

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
  if (km >= 1000) return `${(km / 1000).toFixed(1)}k`;
  return km.toFixed(0);
};

const formatDuration = (seconds: number): string => {
  const hours = seconds / 3600;
  return hours.toFixed(0);
};

const formatCo2 = (kg: number): string => {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
  return kg.toFixed(1);
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CommunityStatsCard = ({
  stats,
  isLoading,
  error,
}: CommunityStatsCardProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();

  if (isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.accent} size="small" />
        <Text style={styles.loadingText}>{t('communityStats.loading')}</Text>
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
    ? `${t('communityStats.cyclistsIn')} ${stats.localityName}`
    : t('communityStats.title');

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{heading}</Text>

      <View style={styles.grid}>
        <StatTile
          value={String(stats.totalTrips)}
          unit={t('history.trips').toLowerCase()}
          label={t('communityStats.totalRides')}
          styles={styles}
        />
        <StatTile
          value={formatDistance(stats.totalDistanceMeters)}
          unit={t('common.km')}
          label={t('communityStats.distance')}
          styles={styles}
        />
        <StatTile
          value={formatDuration(stats.totalDurationSeconds)}
          unit="hrs"
          label={t('communityStats.rideTime')}
          styles={styles}
        />
        <StatTile
          value={formatCo2(stats.totalCo2SavedKg)}
          unit="kg"
          label={t('communityStats.co2Saved')}
          styles={styles}
        />
        <StatTile
          value={String(Math.round(stats.totalDistanceMeters / 1000 * 4.5))}
          unit="sec"
          label={t('microlives.donatedToCity')}
          styles={styles}
        />
      </View>

      <View style={styles.riderRow}>
        <Text style={styles.riderCount}>{stats.uniqueRiders}</Text>
        <Text style={styles.riderLabel}>
          {t(stats.uniqueRiders === 1 ? 'communityStats.activeRider_one' : 'communityStats.activeRider_other')}
        </Text>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Stat Tile (internal)
// ---------------------------------------------------------------------------

type StatTileProps = {
  readonly value: string;
  readonly unit: string;
  readonly label: string;
  readonly styles: ReturnType<typeof createThemedStyles>;
};

const StatTile = ({ value, unit, label, styles }: StatTileProps) => (
  <View style={styles.tile}>
    <View style={styles.tileValueRow}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileUnit}>{unit}</Text>
    </View>
    <Text style={styles.tileLabel}>{label}</Text>
  </View>
);

// ---------------------------------------------------------------------------
// Themed styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      paddingHorizontal: space[4],
      paddingVertical: space[4],
      gap: space[3],
      ...shadows.md,
    },
    heading: {
      ...textLg,
      fontFamily: fontFamily.heading.bold,
      color: colors.accent,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[2],
    },
    tile: {
      flex: 1,
      minWidth: '45%' as unknown as number,
      backgroundColor: colors.bgSecondary,
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
      color: colors.textPrimary,
    },
    tileUnit: {
      ...textXs,
      fontFamily: fontFamily.mono.medium,
      color: colors.textMuted,
    },
    tileLabel: {
      ...textXs,
      fontFamily: fontFamily.body.regular,
      color: colors.textSecondary,
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
      color: colors.accent,
    },
    riderLabel: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.textSecondary,
    },
    loadingText: {
      ...textSm,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    errorText: {
      ...textSm,
      color: colors.danger,
      textAlign: 'center',
    },
  });
