/**
 * Design System v1.0 — StreakCard Organism
 *
 * Compact streak summary card with flame icon, current streak number,
 * abbreviated 7-day chain preview, longest streak, and freeze status.
 */
import type { StreakState } from '@defensivepedal/core';
import { StyleSheet, Text, View } from 'react-native';

import { brandColors, darkTheme, gray } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textDataLg, textSm, textXs } from '../tokens/typography';

import { StreakChain } from './StreakChain';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface StreakCardProps {
  streakState: StreakState;
}

export const StreakCard = ({ streakState }: StreakCardProps) => {
  const hasStreak = streakState.currentStreak > 0;

  const freezeLabel = streakState.freezeAvailable
    ? 'Freeze ready'
    : streakState.freezeUsedDate
      ? 'Freeze used'
      : null;

  return (
    <View style={styles.card}>
      {/* Top row: flame + streak number + label */}
      <View style={styles.topRow}>
        <View style={styles.streakNumberSection}>
          <Text style={styles.flameIcon}>~</Text>
          <Text style={styles.streakNumber}>{streakState.currentStreak}</Text>
          <Text style={styles.streakUnit}>day streak</Text>
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
        <Text style={styles.encouragement}>Start your chain today!</Text>
      )}

      {/* Bottom row: longest + freeze status */}
      <View style={styles.bottomRow}>
        <Text style={styles.longestText}>
          Longest: {streakState.longestStreak}d
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
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  streakNumberSection: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space[2],
  },
  flameIcon: {
    fontFamily: fontFamily.body.bold,
    fontSize: 24,
    color: brandColors.accent,
  },
  streakNumber: {
    ...textDataLg,
    fontFamily: fontFamily.mono.bold,
    color: brandColors.accent,
  },
  streakUnit: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textSecondary,
  },
  encouragement: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textMuted,
    textAlign: 'center',
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
