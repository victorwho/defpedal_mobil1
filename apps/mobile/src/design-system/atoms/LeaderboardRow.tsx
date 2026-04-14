/**
 * Design System — LeaderboardRow Atom
 *
 * A single row in the neighborhood leaderboard showing rank, avatar,
 * name with tier pill, metric value, rank delta, and champion crown.
 */
import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { LeaderboardEntry, LeaderboardMetric } from '@defensivepedal/core';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { FadeSlideIn } from './FadeSlideIn';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textSm, textXs } from '../tokens/typography';
import { brandTints } from '../tokens/tints';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeaderboardRowProps {
  readonly entry: LeaderboardEntry;
  readonly metric: LeaderboardMetric;
  readonly isHighlighted: boolean;
  readonly index: number;
}

// ---------------------------------------------------------------------------
// Podium colors
// ---------------------------------------------------------------------------

const PODIUM_COLORS: Record<number, string> = {
  1: '#FFD700',  // gold
  2: '#C0C0C0',  // silver
  3: '#CD7F32',  // bronze
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const LeaderboardRow = React.memo(function LeaderboardRow({
  entry,
  metric,
  isHighlighted,
  index,
}: LeaderboardRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);

  const rankColor = PODIUM_COLORS[entry.rank] ?? colors.textSecondary;
  const initials = entry.displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const metricLabel =
    metric === 'co2'
      ? `${entry.metricValue.toFixed(1)} kg`
      : `${entry.metricValue}`;

  return (
    <FadeSlideIn delay={index * 50}>
      <View
        style={[
          styles.row,
          isHighlighted && styles.highlightedRow,
        ]}
        accessibilityLabel={`Rank ${entry.rank}, ${entry.displayName}, ${metricLabel}`}
      >
        {/* Rank number */}
        <Text style={[styles.rank, { color: rankColor }]}>
          {entry.rank}
        </Text>

        {/* Avatar */}
        {entry.avatarUrl ? (
          <Image source={{ uri: entry.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>{initials}</Text>
          </View>
        )}

        {/* Name */}
        <View style={styles.nameContainer}>
          <Text style={styles.name} numberOfLines={1}>
            {entry.displayName}
          </Text>
        </View>

        {/* Metric value */}
        <Text style={styles.metricValue}>{metricLabel}</Text>

        {/* Rank delta */}
        <View style={styles.deltaContainer}>
          {entry.rankDelta === null ? (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>NEW</Text>
            </View>
          ) : entry.rankDelta > 0 ? (
            <View style={styles.deltaRow}>
              <Ionicons name="arrow-up" size={12} color={colors.safe} />
              <Text style={[styles.deltaText, { color: colors.safe }]}>
                {entry.rankDelta}
              </Text>
            </View>
          ) : entry.rankDelta < 0 ? (
            <View style={styles.deltaRow}>
              <Ionicons name="arrow-down" size={12} color={colors.danger} />
              <Text style={[styles.deltaText, { color: colors.danger }]}>
                {Math.abs(entry.rankDelta)}
              </Text>
            </View>
          ) : (
            <Text style={[styles.deltaText, { color: colors.textMuted }]}>-</Text>
          )}
        </View>

        {/* Champion crown */}
        {entry.isChampion && (
          <Ionicons
            name="trophy"
            size={16}
            color="#D4A843"
            style={styles.crownIcon}
          />
        )}
      </View>
    </FadeSlideIn>
  );
});

// ---------------------------------------------------------------------------
// Themed styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: space[2],
      paddingHorizontal: space[2],
      borderRadius: radii.lg,
      gap: space[2],
    },
    highlightedRow: {
      backgroundColor: brandTints.accentLight,
    },
    rank: {
      width: 24,
      textAlign: 'center',
      fontFamily: fontFamily.mono.bold,
      fontSize: 14,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
    },
    avatarPlaceholder: {
      backgroundColor: colors.bgTertiary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      ...textXs,
      fontFamily: fontFamily.heading.bold,
      color: colors.textSecondary,
      fontSize: 11,
    },
    nameContainer: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
      flexShrink: 1,
    },
    metricValue: {
      fontFamily: fontFamily.mono.semiBold,
      fontSize: 13,
      color: colors.accent,
      minWidth: 48,
      textAlign: 'right',
    },
    deltaContainer: {
      width: 36,
      alignItems: 'center',
    },
    deltaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    deltaText: {
      fontFamily: fontFamily.mono.medium,
      fontSize: 10,
    },
    newBadge: {
      backgroundColor: colors.info,
      borderRadius: radii.sm,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    newBadgeText: {
      fontFamily: fontFamily.mono.bold,
      fontSize: 8,
      color: '#FFFFFF',
      textTransform: 'uppercase',
    },
    crownIcon: {
      marginLeft: 2,
    },
  });
