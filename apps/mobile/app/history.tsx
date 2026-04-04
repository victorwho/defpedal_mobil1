import type { GuardianTier, ImpactDashboard } from '@defensivepedal/core';
import { formatCo2Saved, calculateEquivalentTreeDays } from '@defensivepedal/core';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';

import { Screen } from '../src/components/Screen';
import { StatsDashboard } from '../src/components/StatsDashboard';
import { Button } from '../src/design-system/atoms/Button';
import { BottomNav } from '../src/design-system/organisms/BottomNav';
import { StreakCard } from '../src/design-system/organisms/StreakCard';
import { brandColors, darkTheme, safetyColors } from '../src/design-system/tokens/colors';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { space } from '../src/design-system/tokens/spacing';
import { fontFamily, textBase, textSm, textXs } from '../src/design-system/tokens/typography';
import { mobileApi } from '../src/lib/api';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { handleTabPress } from '../src/lib/navigation-helpers';
import { useT } from '../src/hooks/useTranslation';

// ---------------------------------------------------------------------------
// Guardian tier config
// ---------------------------------------------------------------------------

type TierConfig = {
  readonly label: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly color: string;
  readonly minHazards: number;
};

const TIER_CONFIG: Record<GuardianTier, TierConfig> = {
  reporter: { label: 'Reporter', icon: 'megaphone-outline', color: '#9CA3AF', minHazards: 0 },
  watchdog: { label: 'Watchdog', icon: 'eye-outline', color: '#60A5FA', minHazards: 5 },
  sentinel: { label: 'Sentinel', icon: 'shield-outline', color: '#A78BFA', minHazards: 15 },
  guardian_angel: { label: 'Guardian Angel', icon: 'shield-checkmark', color: brandColors.accent, minHazards: 50 },
};

const TIER_THRESHOLDS: readonly { tier: GuardianTier; min: number }[] = [
  { tier: 'reporter', min: 0 },
  { tier: 'watchdog', min: 5 },
  { tier: 'sentinel', min: 15 },
  { tier: 'guardian_angel', min: 50 },
];

const getTierProgress = (currentTier: GuardianTier, hazardsReported: number) => {
  const currentIndex = TIER_THRESHOLDS.findIndex((t) => t.tier === currentTier);
  const nextTier = TIER_THRESHOLDS[currentIndex + 1];
  if (!nextTier) return { progress: 1, nextLabel: null as string | null, nextTarget: 0 };
  const currentMin = TIER_THRESHOLDS[currentIndex].min;
  const range = nextTier.min - currentMin;
  const elapsed = Math.min(hazardsReported - currentMin, range);
  return {
    progress: range > 0 ? elapsed / range : 1,
    nextLabel: TIER_CONFIG[nextTier.tier].label,
    nextTarget: nextTier.min,
  };
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function HistoryScreen() {
  const { user } = useAuthSession();
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

  const tierConfig = dashboard ? TIER_CONFIG[dashboard.guardianTier] : null;
  const tierProgress = dashboard ? getTierProgress(dashboard.guardianTier, dashboard.totalHazardsReported) : null;

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Screen title={t('history.title')} eyebrow={t('history.eyebrow')} subtitle={t('history.subtitle')}>

          {/* 1. Your Impact */}
          {user ? (
            <View style={styles.impactCard}>
              <View style={styles.impactHeader}>
                <Ionicons name="leaf-outline" size={20} color={safetyColors.safe} />
                <Text style={styles.impactTitle}>{t('history.yourImpact')}</Text>
              </View>
              {statsLoading ? (
                <ActivityIndicator size="small" color={safetyColors.safe} />
              ) : stats ? (
                <>
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
                    <Text style={[styles.impactValue, { color: safetyColors.safe }]}>
                      {formatCo2Saved(stats.totalCo2SavedKg)}
                    </Text>
                    <Text style={styles.impactLabel}>{t('history.co2Saved')}</Text>
                  </View>
                </View>
                <View style={styles.impactRow}>
                  <View style={styles.impactStat}>
                    <Text style={[styles.impactValue, { color: brandColors.accent }]}>
                      {stats ? `€${(stats.totalDistanceMeters / 1000 * 0.35).toFixed(0)}` : '—'}
                    </Text>
                    <Text style={styles.impactLabel}>{t('history.eurSaved')}</Text>
                  </View>
                  <View style={styles.impactStat}>
                    <Text style={[styles.impactValue, { color: safetyColors.caution }]}>
                      {dashboard ? String(dashboard.totalHazardsReported) : '—'}
                    </Text>
                    <Text style={styles.impactLabel}>{t('history.hazards')}</Text>
                  </View>
                  <View style={styles.impactStat}>
                    <Text style={[styles.impactValue, { color: safetyColors.info }]}>
                      {dashboard ? String(dashboard.totalRidersProtected) : '—'}
                    </Text>
                    <Text style={styles.impactLabel}>{t('history.protected')}</Text>
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
            <ActivityIndicator size="small" color={brandColors.accent} style={{ paddingVertical: space[3] }} />
          ) : null}

          {/* 3. Guardian Tier */}
          {tierConfig && tierProgress && dashboard ? (
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Ionicons name="shield-half-outline" size={18} color={tierConfig.color} />
                <Text style={styles.cardHeaderText}>Guardian Tier</Text>
              </View>
              <View style={styles.tierRow}>
                <View style={[styles.tierBadge, { borderColor: tierConfig.color }]}>
                  <Ionicons name={tierConfig.icon} size={24} color={tierConfig.color} />
                </View>
                <View style={styles.tierTextCol}>
                  <Text style={[styles.tierName, { color: tierConfig.color }]}>
                    {tierConfig.label}
                  </Text>
                  <Text style={styles.tierHazards}>
                    {dashboard.totalHazardsReported} hazards reported
                  </Text>
                </View>
              </View>
              {tierProgress.nextLabel ? (
                <View style={styles.tierProgressSection}>
                  <View style={styles.tierProgressBarBg}>
                    <View
                      style={[
                        styles.tierProgressBarFill,
                        { width: `${Math.round(tierProgress.progress * 100)}%`, backgroundColor: tierConfig.color },
                      ]}
                    />
                  </View>
                  <Text style={styles.tierProgressText}>
                    {tierProgress.nextTarget - dashboard.totalHazardsReported} more to {tierProgress.nextLabel}
                  </Text>
                </View>
              ) : (
                <Text style={styles.tierMaxText}>Maximum tier reached!</Text>
              )}
            </View>
          ) : null}

          {/* 4. Stats Dashboard (Week / Month / All Time, Ride Frequency, Mode Split) */}
          {user ? <StatsDashboard hazardsReported={dashboard?.totalHazardsReported ?? 0} /> : null}

          {/* 5. Daily Safety Quiz */}
          {user ? (
            <Pressable style={styles.quizCard} onPress={() => router.push('/daily-quiz')}>
              <View style={styles.quizCardLeft}>
                <Ionicons name="help-circle-outline" size={22} color={brandColors.accent} />
                <View>
                  <Text style={styles.quizCardTitle}>{t('history.dailyQuiz')}</Text>
                  <Text style={styles.quizCardSubtitle}>{t('history.dailyQuizSub')}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={darkTheme.textMuted} />
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brandColors.bgDeep },
  content: { flex: 1 },
  impactCard: {
    padding: space[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.2)',
    backgroundColor: 'rgba(74, 222, 128, 0.05)',
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
    color: safetyColors.safe,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
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
    color: brandColors.textPrimary,
    fontSize: 18,
  },
  impactLabel: {
    ...textXs,
    color: brandColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  impactTreeNote: {
    ...textXs,
    color: brandColors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: darkTheme.bgPrimary,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    padding: space[4],
    gap: space[3],
    ...shadows.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  cardHeaderText: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: darkTheme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  tierBadge: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: darkTheme.bgSecondary,
  },
  tierTextCol: {
    flex: 1,
    gap: 2,
  },
  tierName: {
    fontFamily: fontFamily.heading.bold,
    fontSize: 18,
  },
  tierHazards: {
    ...textXs,
    color: darkTheme.textSecondary,
  },
  tierProgressSection: {
    gap: space[1],
  },
  tierProgressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: darkTheme.bgTertiary,
    overflow: 'hidden',
  },
  tierProgressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  tierProgressText: {
    ...textXs,
    color: darkTheme.textSecondary,
  },
  tierMaxText: {
    ...textXs,
    color: brandColors.accent,
    fontFamily: fontFamily.body.semiBold,
  },
  quizCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: darkTheme.bgPrimary,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
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
    color: darkTheme.textPrimary,
  },
  quizCardSubtitle: {
    ...textXs,
    color: darkTheme.textSecondary,
  },
  section: {
    paddingVertical: space[2],
  },
});
