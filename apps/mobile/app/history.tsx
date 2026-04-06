import type { ImpactDashboard } from '@defensivepedal/core';
import { formatCo2Saved, calculateEquivalentTreeDays, formatMicrolivesAsTime } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';

import { Screen } from '../src/components/Screen';
import { StatsDashboard } from '../src/components/StatsDashboard';
import { Button } from '../src/design-system/atoms/Button';
import { Card } from '../src/design-system/atoms/Card';
import { BottomNav } from '../src/design-system/organisms/BottomNav';
import { StreakCard } from '../src/design-system/organisms/StreakCard';
import { useTheme, type ThemeColors } from '../src/design-system';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { space } from '../src/design-system/tokens/spacing';
import { fontFamily, textBase, textSm, textXs } from '../src/design-system/tokens/typography';
import { safetyTints } from '../src/design-system/tokens/tints';
import { mobileApi } from '../src/lib/api';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { handleTabPress } from '../src/lib/navigation-helpers';
import { useT } from '../src/hooks/useTranslation';

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function HistoryScreen() {
  const { user } = useAuthSession();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['user-stats'],
    queryFn: () => mobileApi.getUserStats(),
    enabled: Boolean(user),
    staleTime: 120_000,
  });

  const { data: dashboard, isLoading: dashboardLoading } = useQuery<ImpactDashboard>({
    queryKey: ['impact-dashboard'],
    queryFn: () => mobileApi.fetchImpactDashboard(tz),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });


  return (
    <View style={[styles.root, { backgroundColor: colors.bgDeep }]}>
      <View style={styles.content}>
        <Screen title={t('history.title')} subtitle={t('history.subtitle')}>

          {/* 1. Your Impact */}
          {user ? (
            <View style={styles.impactCard}>
              <View style={styles.impactHeader}>
                <Ionicons name="leaf-outline" size={20} color={colors.safe} />
                <Text style={styles.impactTitle}>{t('history.yourImpact')}</Text>
              </View>
              {statsLoading ? (
                <ActivityIndicator size="small" color={colors.safe} />
              ) : stats ? (
                <>
                {dashboard ? (
                  <View style={styles.microlivesRow}>
                    <Ionicons name="heart" size={16} color={colors.accent} />
                    <Text style={styles.microlivesValue}>
                      +{formatMicrolivesAsTime(dashboard.totalMicrolives)}
                    </Text>
                    <Text style={styles.microlivesLabel}>{t('microlives.lifeEarned')}</Text>
                  </View>
                ) : null}
                <View style={styles.impactRow}>
                  <View style={styles.impactStat}>
                    <Text style={styles.impactValue}>{stats.totalTrips}</Text>
                    <Text style={styles.impactLabel}>{t('history.trips')}</Text>
                  </View>
                  <View style={styles.impactStat}>
                    <Text style={styles.impactValue}>
                      {(stats.totalDistanceMeters / 1000).toFixed(0)} {t('common.km')}
                    </Text>
                    <Text style={styles.impactLabel}>{t('history.cycled')}</Text>
                  </View>
                  <View style={styles.impactStat}>
                    <Text style={[styles.impactValue, { color: colors.safe }]}>
                      {formatCo2Saved(stats.totalCo2SavedKg)}
                    </Text>
                    <Text style={styles.impactLabel}>{t('history.co2Saved')}</Text>
                  </View>
                </View>
                <View style={styles.impactRow}>
                  <View style={styles.impactStat}>
                    <Text style={[styles.impactValue, { color: colors.accent }]}>
                      {stats ? `€${(stats.totalDistanceMeters / 1000 * 0.35).toFixed(0)}` : '—'}
                    </Text>
                    <Text style={styles.impactLabel}>{t('history.eurSaved')}</Text>
                  </View>
                  <View style={styles.impactStat}>
                    <Text style={[styles.impactValue, { color: colors.info }]}>
                      {dashboard ? `${Math.round(dashboard.totalCommunitySeconds)}s` : '—'}
                    </Text>
                    <Text style={styles.impactLabel}>{t('microlives.donatedToCity')}</Text>
                  </View>
                  <View style={styles.impactStat}>
                    <Text style={[styles.impactValue, { color: colors.caution }]}>
                      {dashboard ? String(dashboard.totalHazardsReported) : '—'}
                    </Text>
                    <Text style={styles.impactLabel}>{t('history.hazards')}</Text>
                  </View>
                </View>
              </>
              ) : null}
              {stats && stats.totalCo2SavedKg > 0 ? (
                <Text style={styles.impactTreeNote}>
                  Equivalent to {calculateEquivalentTreeDays(stats.totalCo2SavedKg)} days of a tree absorbing CO2
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* 2. Streak */}
          {dashboard ? (
            <StreakCard streakState={dashboard.streak} />
          ) : dashboardLoading && user ? (
            <ActivityIndicator size="small" color={colors.accent} style={{ paddingVertical: space[3] }} />
          ) : null}

          {/* 3. Stats Dashboard (Week / Month / All Time, Ride Frequency, Mode Split) */}
          {user ? <StatsDashboard hazardsReported={dashboard?.totalHazardsReported ?? 0} /> : null}

          {/* 5. Daily Safety Quiz */}
          {user ? (
            <Pressable
              style={styles.quizCard}
              onPress={() => router.push('/daily-quiz')}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={t('history.dailyQuiz')}
            >
              <View style={styles.quizCardLeft}>
                <Ionicons name="help-circle-outline" size={22} color={colors.accent} />
                <View>
                  <Text style={styles.quizCardTitle}>{t('history.dailyQuiz')}</Text>
                  <Text style={styles.quizCardSubtitle}>{t('history.dailyQuizSub')}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}

          {/* 6. View My Trips */}
          <View style={styles.section}>
            <Button variant="primary" size="md" fullWidth onPress={() => router.push('/trips')}>
              {t('history.viewTrips')}
            </Button>
          </View>
        </Screen>
      </View>
      <BottomNav activeTab="history" onTabPress={handleTabPress} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Themed style factory — colors come from useTheme(), layout stays static
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1 },
    content: { flex: 1 },
    impactCard: {
      padding: space[4],
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: safetyTints.safeBorder,
      backgroundColor: safetyTints.safeSubtle,
      gap: space[3],
    },
    impactHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    impactTitle: {
      ...textSm,
      fontFamily: fontFamily.heading.bold,
      color: colors.safe,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    microlivesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      paddingBottom: space[2],
      marginBottom: space[2],
      borderBottomWidth: 1,
      borderBottomColor: colors.borderDefault,
    },
    microlivesValue: {
      ...textBase,
      fontFamily: fontFamily.heading.bold,
      color: colors.accent,
    },
    microlivesLabel: {
      ...textXs,
      color: colors.textMuted,
    },
    impactRow: {
      flexDirection: 'row',
      gap: space[3],
    },
    impactStat: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    impactValue: {
      ...textBase,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
      fontSize: 18,
    },
    impactLabel: {
      ...textXs,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    impactTreeNote: {
      ...textXs,
      color: colors.textSecondary,
      textAlign: 'center',
      fontStyle: 'italic',
    },
    quizCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      padding: space[4],
      ...shadows.md,
    },
    quizCardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
    },
    quizCardTitle: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    quizCardSubtitle: {
      ...textXs,
      color: colors.textSecondary,
    },
    section: {
      paddingVertical: space[2],
    },
  });
