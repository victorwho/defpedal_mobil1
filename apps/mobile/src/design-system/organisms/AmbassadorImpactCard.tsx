/**
 * AmbassadorImpactCard — Slice 8b
 *
 * 4-stat tile summarising the user's lifetime ambassador activity:
 *   - Shares sent (active)
 *   - Opens (sum of view_count)
 *   - Signups (sum of signup_count)
 *   - XP earned from referrals
 *
 * Rendered on the Impact Dashboard alongside other stat tiles. Hidden
 * (returns null) when the user has never shared a route — avoids a
 * zero-everything tile cluttering the dashboard for the 90% of users who
 * never hit the share button.
 */
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { AmbassadorStatsClient } from '../../lib/api';
import { useTheme, type ThemeColors } from '../ThemeContext';
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

export type AmbassadorImpactCardProps = {
  readonly stats: AmbassadorStatsClient | null;
  readonly isLoading: boolean;
  /** Hide the card entirely when true (first-time/never-shared users). */
  readonly hideWhenEmpty?: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AmbassadorImpactCard = ({
  stats,
  isLoading,
  hideWhenEmpty = true,
}: AmbassadorImpactCardProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);

  if (isLoading) {
    return (
      <View style={styles.card} accessibilityLabel="Ambassador stats loading">
        <ActivityIndicator color={colors.accent} size="small" />
      </View>
    );
  }

  if (!stats) return null;

  const isEmpty =
    stats.sharesSent === 0 &&
    stats.opens === 0 &&
    stats.signups === 0 &&
    stats.xpEarned === 0;

  if (isEmpty && hideWhenEmpty) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Your Ambassador Impact</Text>

      <View style={styles.grid}>
        <StatTile
          value={String(stats.sharesSent)}
          label="Shares sent"
          styles={styles}
        />
        <StatTile
          value={String(stats.opens)}
          label="Opens"
          styles={styles}
        />
        <StatTile
          value={String(stats.signups)}
          label="Signups"
          styles={styles}
        />
        <StatTile
          value={String(stats.xpEarned)}
          unit="XP"
          label="Earned"
          styles={styles}
        />
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Stat Tile (internal)
// ---------------------------------------------------------------------------

type StatTileProps = {
  readonly value: string;
  readonly unit?: string;
  readonly label: string;
  readonly styles: ReturnType<typeof createThemedStyles>;
};

const StatTile = ({ value, unit, label, styles }: StatTileProps) => (
  <View style={styles.tile}>
    <View style={styles.tileValueRow}>
      <Text style={styles.tileValue}>{value}</Text>
      {unit ? <Text style={styles.tileUnit}>{unit}</Text> : null}
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
    loadingText: {
      ...textSm,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
