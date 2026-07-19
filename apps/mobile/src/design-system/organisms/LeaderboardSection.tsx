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
import { Mascot } from '../atoms/Mascot';
import { SectionTitle } from '../atoms/SectionTitle';
import { Button } from '../atoms/Button';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textSm, textXs } from '../tokens/typography';
import { brandTints } from '../tokens/tints';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { useT } from '../../hooks/useTranslation';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LeaderboardSection() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();

  const METRICS: readonly { readonly key: LeaderboardMetric; readonly label: string }[] = [
    { key: 'co2', label: t('leaderboard.tabs.co2') },
    { key: 'hazards', label: t('leaderboard.tabs.hazards') },
  ];

  const PERIODS: readonly { readonly key: LeaderboardPeriod; readonly label: string }[] = [
    { key: 'week', label: t('leaderboard.periods.week') },
    { key: 'month', label: t('leaderboard.periods.month') },
    { key: 'all', label: t('leaderboard.periods.all') },
  ];

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

  // Trophy celebration when the requesting user is currently #1
  const userIsChampion = useMemo(() => {
    if (!data) return false;
    if (data.userRank?.rank === 1) return true;
    return data.entries[0]?.isRequestingUser ?? false;
  }, [data]);

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <SectionTitle variant="accent">{t('leaderboard.title')}</SectionTitle>
        {userIsChampion ? (
          <View style={styles.championStamp}>
            <Mascot pose="trophy" size="sm" />
          </View>
        ) : null}
      </View>

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
              // One line, shrink-to-fit: the active pill's semibold font is
              // wider than the medium it was measured with, which wrapped
              // "This Week" and clipped the second line ("This" bug,
              // 2026-07-19). Also keeps long RO/ES labels on one line.
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
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

      {/* Error state — audit 2026-07-05 UX-4: localized copy, not the raw
          Supabase/API error string. */}
      {error && !isLoading && (
        <View style={styles.center}>
          <Text style={styles.errorText}>{t('leaderboard.loadFailed')}</Text>
          <Button onPress={refetch} variant="secondary" size="sm">{t('common.retry')}</Button>
        </View>
      )}

      {/* Empty state */}
      {!isLoading && !error && data && data.entries.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t('leaderboard.emptyState')}</Text>
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
                <Text style={styles.separatorText}>{t('leaderboard.ghostRankSeparator')}</Text>
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
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space[2],
    },
    championStamp: {
      marginRight: -space[1],
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
      paddingHorizontal: space[2],
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
