import type { BadgeUnlockEvent, ImpactDashboard, RideImpact } from '@defensivepedal/core';
import { formatMicrolivesAsTime, formatCommunitySeconds } from '@defensivepedal/core';
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
  readonly dashboard: ImpactDashboard | null;
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
  dashboard,
  staggerDelayMs = 800,
  newBadges,
}: ImpactSummaryCardProps) => (
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

    {/* This ride's impact — microlives first, then CO2/money/hazards */}
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

    {/* Lifetime totals */}
    {dashboard ? (
      <View style={styles.totalsSection}>
        <Text style={styles.totalsTitle}>Your total impact</Text>
        <View style={styles.totalsRow}>
          <View style={styles.totalItem}>
            <Text style={[styles.totalValue, { color: safetyColors.safe }]}>
              {dashboard.totalCo2SavedKg.toFixed(1)}
            </Text>
            <Text style={styles.totalLabel}>kg CO2</Text>
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalItem}>
            <Text style={[styles.totalValue, { color: brandColors.accent }]}>
              {dashboard.totalMoneySavedEur.toFixed(0)}
            </Text>
            <Text style={styles.totalLabel}>EUR saved</Text>
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalItem}>
            <Text style={[styles.totalValue, { color: safetyColors.caution }]}>
              {dashboard.totalHazardsReported}
            </Text>
            <Text style={styles.totalLabel}>hazards</Text>
          </View>
        </View>
      </View>
    ) : null}
  </View>
);

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
  totalsSection: {
    borderTopWidth: 1,
    borderTopColor: darkTheme.borderDefault,
    paddingTop: space[4],
    gap: space[3],
  },
  totalsTitle: {
    ...textSm,
    fontFamily: fontFamily.heading.semiBold,
    color: darkTheme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 11,
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  totalValue: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 18,
    lineHeight: 22,
  },
  totalLabel: {
    ...textXs,
    color: darkTheme.textSecondary,
  },
  totalDivider: {
    width: 1,
    height: 28,
    backgroundColor: darkTheme.borderDefault,
  },
});
