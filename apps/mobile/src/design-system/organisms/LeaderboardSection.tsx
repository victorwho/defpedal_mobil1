/**
 * LeaderboardSection — Neighborhood Safety Leaderboard organism.
 *
 * Self-contained section that manages metric + period selection internally.
 * Renders a tab bar for CO2/Hazards, period pills, and a scrollable list
 * of LeaderboardRow atoms. Includes ghost-rank separator for the
 * requesting user when they are outside the visible top entries.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { LeaderboardMetric, LeaderboardPeriod } from '@defensivepedal/core';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { FadeSlideIn } from '../atoms/FadeSlideIn';
import { LeaderboardRow } from '../atoms/LeaderboardRow';
import { SectionTitle } from '../atoms/SectionTitle';
import { Button } from '../atoms/Button';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textSm, textXs } from '../tokens/typography';
import { brandTints } from '../tokens/tints';
import { useLeaderboard } from '../../hooks/useLeaderboard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const METRICS: readonly { readonly key: LeaderboardMetric; readonly label: string }[] = [
  { key: 'co2', label: 'CO2 Saved' },
  { key: 'hazards', label: 'Hazards Reported' },
];

const PERIODS: readonly { readonly key: LeaderboardPeriod; readonly label: string }[] = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LeaderboardSection() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);

  const [metric, setMetric] = useState<LeaderboardMetric>('co2');
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');

  const { data, isLoading, error, refetch } = useLeaderboard(metric, period);

  const handleMetricChange = useCallback((m: LeaderboardMetric) => {
    setMetric(m);
  }, []);

  const handlePeriodChange = useCallback((p: LeaderboardPeriod) => {
    setPeriod(p);
  }, []);

  // Check if the user's rank is already in the entries list
  const userInEntries = useMemo(() => {
    if (!data?.userRank) return true;
    return data.entries.some((e) => e.userId === data.userRank!.userId);
  }, [data]);

  return (
    <View style={styles.container}>
      <SectionTitle variant="accent">Neighborhood Leaderboard</SectionTitle>

      {/* Metric tab bar */}
      <View style={styles.tabBar}>
        {METRICS.map((m) => (
          <Pressable
            key={m.key}
            style={[styles.tab, metric === m.key && styles.tabActive]}
            onPress={() => handleMetricChange(m.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: metric === m.key }}
          >
            <Text
              style={[
                styles.tabText,
                metric === m.key && styles.tabTextActive,
              ]}
            >
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Period pills */}
      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <Pressable
            key={p.key}
            style={[styles.pill, period === p.key && styles.pillActive]}
            onPress={() => handlePeriodChange(p.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: period === p.key }}
          >
            <Text
              style={[
                styles.pillText,
                period === p.key && styles.pillTextActive,
              ]}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Loading state */}
      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="small" />
        </View>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Button onPress={refetch} variant="secondary" size="sm">Retry</Button>
        </View>
      )}

      {/* Empty state */}
      {!isLoading && !error && data && data.entries.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No activity in your area yet</Text>
        </View>
      )}

      {/* Leaderboard list */}
      {!isLoading && !error && data && data.entries.length > 0 && (
        <ScrollView
          style={styles.list}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {data.entries.map((entry, i) => (
            <LeaderboardRow
              key={entry.userId}
              entry={entry}
              metric={metric}
              isHighlighted={entry.isRequestingUser}
              index={i}
            />
          ))}

          {/* Ghost rank separator + user row when not in top list */}
          {!userInEntries && data.userRank && (
            <>
              <View style={styles.separator}>
                <View style={styles.separatorLine} />
                <Text style={styles.separatorText}>Your Rank</Text>
                <View style={styles.separatorLine} />
              </View>
              <LeaderboardRow
                entry={data.userRank}
                metric={metric}
                isHighlighted
                index={data.entries.length}
              />
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Themed styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      padding: space[4],
      gap: space[3],
      ...shadows.md,
    },
    tabBar: {
      flexDirection: 'row',
      gap: 0,
      borderRadius: radii.lg,
      backgroundColor: colors.bgSecondary,
      overflow: 'hidden',
    },
    tab: {
      flex: 1,
      paddingVertical: space[2],
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabActive: {
      borderBottomColor: colors.accent,
    },
    tabText: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.textSecondary,
    },
    tabTextActive: {
      fontFamily: fontFamily.body.semiBold,
      color: colors.accent,
    },
    periodRow: {
      flexDirection: 'row',
      gap: space[2],
    },
    pill: {
      flex: 1,
      paddingVertical: space[1],
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      alignItems: 'center',
    },
    pillActive: {
      backgroundColor: brandTints.accentMedium,
      borderColor: colors.accent,
    },
    pillText: {
      ...textXs,
      fontFamily: fontFamily.body.medium,
      color: colors.textSecondary,
    },
    pillTextActive: {
      fontFamily: fontFamily.body.semiBold,
      color: colors.accent,
    },
    list: {
      maxHeight: 360,
    },
    center: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space[6],
      gap: space[2],
    },
    errorText: {
      ...textSm,
      color: colors.danger,
      textAlign: 'center',
    },
    emptyText: {
      ...textSm,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    separator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      paddingVertical: space[2],
    },
    separatorLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.borderDefault,
    },
    separatorText: {
      ...textXs,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
  });
