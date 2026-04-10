import type { BadgeUnlockEvent, RideImpact } from '@defensivepedal/core';
import { formatMicrolivesAsTime } from '@defensivepedal/core';
import { riderTiers, getTierProgress, getNextTier, type RiderTierKey } from '../design-system/tokens/tierColors';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnimatedCounter } from '../design-system/atoms/AnimatedCounter';
import { BadgeIcon } from '../design-system/atoms/BadgeIcon';
import { brandColors, darkTheme, safetyColors } from '../design-system/tokens/colors';
import { radii } from '../design-system/tokens/radii';
import { shadows } from '../design-system/tokens/shadows';
import { space } from '../design-system/tokens/spacing';
import {
  fontFamily,
  textBase,
  textDataMd,
  textSm,
  textXs,
} from '../design-system/tokens/typography';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImpactSummaryCardProps = {
  readonly rideImpact: RideImpact;
  readonly staggerDelayMs?: number;
  readonly newBadges?: readonly BadgeUnlockEvent[];
};

// ---------------------------------------------------------------------------
// Staggered counter row
// ---------------------------------------------------------------------------

type StaggeredCounterProps = {
  readonly targetValue: number;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly decimals?: number;
  readonly label: string;
  readonly equivalentText: string | null;
  readonly color: string;
  readonly delayMs: number;
};

const StaggeredCounter = ({
  targetValue,
  prefix,
  suffix,
  decimals = 1,
  label,
  equivalentText,
  color,
  delayMs,
}: StaggeredCounterProps) => {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, delayMs);

    return () => clearTimeout(timer);
  }, [opacity, delayMs]);

  return (
    <Animated.View style={[styles.counterBlock, { opacity }]}>
      <AnimatedCounter
        targetValue={targetValue}
        prefix={prefix}
        suffix={suffix}
        decimals={decimals}
        duration={1200}
        style={{ ...textDataMd, fontFamily: fontFamily.mono.bold, fontSize: 28, color }}
      />
      <Text style={styles.counterLabel}>{label}</Text>
      {equivalentText ? (
        <Text style={styles.equivalentText}>{equivalentText}</Text>
      ) : null}
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Badge row with stagger animation
const StaggeredBadge = ({
  badge,
  delayMs,
}: {
  badge: BadgeUnlockEvent;
  delayMs: number;
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }, delayMs);

    return () => clearTimeout(timer);
  }, [opacity, translateY, delayMs]);

  const tier = badge.tier ?? 'bronze';

  return (
    <Animated.View
      style={[
        styles.badgeItem,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <BadgeIcon badgeKey={badge.badgeKey} tier={tier} size="md" />
      <Text style={styles.badgeName} numberOfLines={2}>
        {badge.name}
      </Text>
    </Animated.View>
  );
};

export const ImpactSummaryCard = ({
  rideImpact,
  staggerDelayMs = 800,
  newBadges,
}: ImpactSummaryCardProps) => {
  const tierKey = rideImpact.riderTier as RiderTierKey;
  const tierDef = riderTiers[tierKey];
  const progress = tierDef ? getTierProgress(rideImpact.currentTotalXp, tierKey) : 0;
  const nextKey = tierDef ? getNextTier(tierKey) : null;
  const nextDef = nextKey ? riderTiers[nextKey] : null;

  return (
    <View style={styles.card}>
      {/* Badges earned this ride */}
      {newBadges && newBadges.length > 0 ? (
        <View style={styles.badgesSection}>
          <Text style={styles.sectionTitle}>Badges earned</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.badgesRow}
          >
            {newBadges.map((b, i) => (
              <StaggeredBadge key={b.badgeKey} badge={b} delayMs={i * 400} />
            ))}
          </ScrollView>
          <Pressable onPress={() => router.push('/achievements' as any)}>
            <Text style={styles.viewAllLink}>View all achievements &gt;</Text>
          </Pressable>
        </View>
      ) : null}

      {/* XP earned — always visible */}
      <View style={styles.xpSection}>
        <Text style={styles.sectionTitle}>XP earned</Text>
        {rideImpact.xpBreakdown && rideImpact.xpBreakdown.length > 0 ? (
          <>
            {rideImpact.xpBreakdown.map((item, i) => (
              <View key={`${item.action}-${i}`} style={styles.xpRow}>
                <Text style={styles.xpLabel} numberOfLines={1}>{item.label}</Text>
                <Text style={styles.xpValue}>
                  +{item.finalXp}
                  {item.multiplier > 1 ? (
                    <Text style={styles.xpMultiplier}>{` (${item.multiplier}x)`}</Text>
                  ) : null}
                </Text>
              </View>
            ))}
            <View style={styles.xpDivider} />
          </>
        ) : null}
        <View style={styles.xpRow}>
          <Text style={[styles.xpLabel, styles.xpTotalLabel]}>Total</Text>
          <Text style={[styles.xpValue, styles.xpTotalValue]}>+{rideImpact.totalXpEarned} XP</Text>
        </View>
        {/* Progress bar to next tier */}
        {tierDef ? (
          <View style={styles.xpProgressWrap}>
            <View style={styles.xpProgressTrack}>
              <View style={[styles.xpProgressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: tierDef.color }]} />
            </View>
            {nextDef ? (
              <Text style={styles.xpProgressLabel}>
                {tierDef.displayName} → {nextDef.displayName}  ·  {rideImpact.currentTotalXp.toLocaleString()} / {nextDef.xp.toLocaleString()} XP
              </Text>
            ) : (
              <Text style={styles.xpProgressLabel}>Legend — Maximum rank</Text>
            )}
          </View>
        ) : null}
      </View>

      {/* This ride's impact — microlives first, then CO2/money */}
      <Text style={styles.sectionTitle}>This ride's impact</Text>

      <View style={styles.countersColumn}>
        <StaggeredCounter
          targetValue={rideImpact.personalMicrolives}
          decimals={1}
          label={`+${formatMicrolivesAsTime(rideImpact.personalMicrolives)} of life earned`}
          equivalentText={rideImpact.communitySeconds > 0 ? `+${Math.round(rideImpact.communitySeconds)}s donated to city` : null}
          color="#F2C30F"
          delayMs={0}
          suffix=" ML"
        />
        <StaggeredCounter
          targetValue={rideImpact.co2SavedKg}
          suffix=" kg"
          decimals={2}
          label="CO2 saved"
          equivalentText={rideImpact.equivalentText}
          color={safetyColors.safe}
          delayMs={staggerDelayMs}
        />
        <StaggeredCounter
          targetValue={rideImpact.moneySavedEur}
          prefix="EUR "
          decimals={2}
          label="Money saved"
          equivalentText={null}
          color={brandColors.accent}
          delayMs={staggerDelayMs * 2}
        />
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
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    padding: space[5],
    gap: space[5],
    ...shadows.lg,
  },
  sectionTitle: {
    ...textSm,
    fontFamily: fontFamily.heading.semiBold,
    color: darkTheme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 11,
  },
  countersColumn: {
    gap: space[4],
  },
  counterBlock: {
    alignItems: 'center',
    gap: 4,
  },
  counterLabel: {
    ...textBase,
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textSecondary,
  },
  equivalentText: {
    ...textXs,
    color: darkTheme.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  badgesSection: {
    gap: space[3],
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.borderDefault,
    paddingBottom: space[4],
  },
  badgesRow: {
    flexDirection: 'row',
    gap: space[3],
    paddingVertical: space[1],
  },
  badgeItem: {
    alignItems: 'center',
    width: 80,
    gap: 4,
  },
  badgeName: {
    ...textXs,
    fontFamily: fontFamily.body.semiBold,
    color: darkTheme.textPrimary,
    textAlign: 'center',
  },
  viewAllLink: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: brandColors.accent,
    textAlign: 'center',
    marginTop: space[1],
  },
  xpSection: {
    gap: space[2],
  },
  xpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  xpLabel: {
    ...textSm,
    color: darkTheme.textSecondary,
    flex: 1,
  },
  xpValue: {
    fontFamily: fontFamily.mono.medium,
    fontSize: 13,
    color: darkTheme.textPrimary,
  },
  xpMultiplier: {
    fontFamily: fontFamily.mono.medium,
    fontSize: 11,
    color: darkTheme.textMuted,
  },
  xpDivider: {
    height: 1,
    backgroundColor: darkTheme.borderDefault,
    marginVertical: space[1],
  },
  xpTotalLabel: {
    fontFamily: fontFamily.body.bold,
    color: darkTheme.textPrimary,
  },
  xpTotalValue: {
    fontFamily: fontFamily.mono.bold,
    color: brandColors.accent,
    fontSize: 15,
  },
  xpProgressWrap: {
    marginTop: space[2],
    gap: space[1],
  },
  xpProgressTrack: {
    height: 6,
    borderRadius: radii.sm,
    backgroundColor: darkTheme.bgTertiary,
    overflow: 'hidden',
  },
  xpProgressFill: {
    height: '100%',
    borderRadius: radii.sm,
  },
  xpProgressLabel: {
    ...textXs,
    color: darkTheme.textMuted,
    textAlign: 'center',
  },
});
