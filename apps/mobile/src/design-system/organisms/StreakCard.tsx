/**
 * Design System v1.0 — StreakCard Organism
 *
 * Tier-aware streak summary card: flame icon tinted by the locked tier
 * ladder (kindling → spark → commute → endurance → binary → century →
 * legend), current streak number, 7-day chain preview, longest streak,
 * and freeze status. Powered by the shared `StreakFlame` atom so the
 * post-ride impact card and the dashboard card share visual logic.
 */
import { getTierForStreak, type StreakState } from '@defensivepedal/core';
import { StyleSheet, Text, View } from 'react-native';

import { brandColors, darkTheme, gray } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textSm, textXs } from '../tokens/typography';

import { StreakChain } from './StreakChain';
import { Mascot } from '../atoms/Mascot';
import { StreakFlame } from '../atoms/StreakFlame';
import { useT } from '../../hooks/useTranslation';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface StreakCardProps {
  streakState: StreakState;
}

export const StreakCard = ({ streakState }: StreakCardProps) => {
  const t = useT();
  const hasStreak = streakState.currentStreak > 0;
  const tier = getTierForStreak(streakState.currentStreak);

  const freezeLabel = streakState.freezeAvailable
    ? t('streak.freezeReady')
    : streakState.freezeUsedDate
      ? t('streak.freezeUsed')
      : null;

  return (
    <View style={styles.card}>
      {/* Top row: tier-aware flame + streak number + tier label */}
      <View style={styles.topRow}>
        <StreakFlame
          streakDays={streakState.currentStreak}
          size="lg"
          animated
        />
        <View style={styles.labelStack}>
          <Text style={styles.streakUnit}>
            {t('streak.dayStreak', { count: streakState.currentStreak })}
          </Text>
          {hasStreak ? (
            // Audit 2026-07-05 UX-7: localized tier name — core's `label` is
            // English-only; the streakTier.* namespace covers en/ro/es.
            <Text style={styles.tierLabel}>{t(`streakTier.${tier.tier}`)}</Text>
          ) : null}
        </View>
      </View>

      {/* Chain preview (last 7 days, non-scrollable) */}
      {hasStreak ? (
        <StreakChain
          streakState={streakState}
          maxVisible={7}
          scrollable={false}
        />
      ) : (
        <View style={styles.sleepyState}>
          <Mascot pose="sleep" size="sm" />
          <Text style={styles.encouragement}>{t('streak.startChain')}</Text>
        </View>
      )}

      {/* Bottom row: longest + freeze status */}
      <View style={styles.bottomRow}>
        <Text style={styles.longestText}>
          {t('streak.longest')} {streakState.longestStreak}d
        </Text>
        {freezeLabel ? (
          <View style={[
            styles.freezeBadge,
            streakState.freezeAvailable ? styles.freezeBadgeReady : styles.freezeBadgeUsed,
          ]}>
            <Text style={[
              styles.freezeText,
              streakState.freezeAvailable ? styles.freezeTextReady : styles.freezeTextUsed,
            ]}>
              {freezeLabel}
            </Text>
          </View>
        ) : null}
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
    padding: space[4],
    gap: space[3],
    ...shadows.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  labelStack: {
    flex: 1,
    flexDirection: 'column',
    gap: space[1] / 2,
  },
  streakUnit: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textSecondary,
  },
  tierLabel: {
    ...textXs,
    fontFamily: fontFamily.body.semiBold,
    color: brandColors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  encouragement: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textMuted,
    textAlign: 'center',
    paddingVertical: space[2],
  },
  sleepyState: {
    alignItems: 'center',
    gap: space[2],
    paddingVertical: space[2],
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  longestText: {
    ...textXs,
    fontFamily: fontFamily.mono.medium,
    color: darkTheme.textMuted,
  },
  freezeBadge: {
    borderRadius: radii.full,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
  },
  freezeBadgeReady: {
    backgroundColor: 'rgba(147, 197, 253, 0.15)',
  },
  freezeBadgeUsed: {
    backgroundColor: 'rgba(107, 114, 128, 0.15)',
  },
  freezeText: {
    ...textXs,
    fontFamily: fontFamily.body.semiBold,
  },
  freezeTextReady: {
    color: '#93C5FD',
  },
  freezeTextUsed: {
    color: gray[400],
  },
});
