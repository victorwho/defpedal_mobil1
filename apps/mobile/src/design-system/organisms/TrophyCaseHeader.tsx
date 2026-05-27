/**
 * Design System — TrophyCaseHeader Organism
 *
 * Shows earned/total badge count, progress bar, and most recent unlock banner.
 */
import React from 'react';
import { Text, View, StyleSheet } from 'react-native';

import type { BadgeDefinition } from '@defensivepedal/core';

import { useT } from '../../hooks/useTranslation';
import { BadgeVisual } from '../atoms/BadgeVisual';
import { BadgeProgressBar } from '../atoms/BadgeProgressBar';
import { type BadgeTier } from '../tokens/badgeColors';
import { brandColors } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textSm, textXs } from '../tokens/typography';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export interface TrophyCaseHeaderProps {
  earned: number;
  total: number;
  recentBadge?: {
    badge: BadgeDefinition;
    earnedAt: Date;
    tier: BadgeTier;
  };
}

const TIER_FROM_LEVEL: Record<number, BadgeTier> = {
  1: 'bronze',
  2: 'silver',
  3: 'gold',
  4: 'platinum',
  5: 'diamond',
};

function formatTimeAgo(date: Date, t: TFn): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return t('achievements.timeJustNow');
  if (mins < 60) return t('achievements.timeMinsAgo', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('achievements.timeHoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  return t('achievements.timeDaysAgo', { count: days });
}

export const TrophyCaseHeader: React.FC<TrophyCaseHeaderProps> = ({
  earned,
  total,
  recentBadge,
}) => {
  const t = useT();
  return (
    <View style={[styles.container, shadows.md]}>
      <Text style={styles.sectionTitle}>{t('achievements.yourAchievements')}</Text>

      <View style={styles.countRow}>
        <Text style={styles.countEarned}>{earned}</Text>
        <Text style={styles.countTotal}> / {total}</Text>
      </View>

      <BadgeProgressBar
        current={earned}
        target={total}
        tierColor={brandColors.accent}
        height={6}
      />

      {recentBadge ? (
        <View style={styles.recentCard}>
          <BadgeVisual
            badgeKey={recentBadge.badge.badgeKey}
            tierFamily={recentBadge.badge.tierFamily}
            tier={recentBadge.tier ?? TIER_FROM_LEVEL[recentBadge.badge.tier] ?? 'bronze'}
            size="sm"
          />
          <View style={styles.recentTextCol}>
            <Text style={styles.recentName} numberOfLines={1}>
              {recentBadge.badge.name}
            </Text>
            <Text style={styles.recentTime}>
              {formatTimeAgo(recentBadge.earnedAt, t)}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: brandColors.bgPrimary,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    padding: space[4],
    gap: space[3],
  },
  sectionTitle: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.accent,
    letterSpacing: 0.5,
    fontSize: 14,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  countEarned: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 30,
    lineHeight: 33,
    color: brandColors.textPrimary,
  },
  countTotal: {
    fontFamily: fontFamily.body.semiBold,
    fontSize: 18,
    lineHeight: 25,
    color: brandColors.textSecondary,
  },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: brandColors.bgSecondary,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: brandColors.borderAccent,
    padding: space[3],
  },
  recentTextCol: {
    flex: 1,
    gap: 2,
  },
  recentName: {
    ...textSm,
    fontFamily: fontFamily.body.semiBold,
    color: brandColors.textPrimary,
  },
  recentTime: {
    ...textXs,
    color: brandColors.textMuted,
  },
});
