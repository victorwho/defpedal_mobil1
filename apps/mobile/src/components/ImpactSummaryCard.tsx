import type { ImpactDashboard, RideImpact } from '@defensivepedal/core';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { AnimatedCounter } from '../design-system/atoms/AnimatedCounter';
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

export const ImpactSummaryCard = ({
  rideImpact,
  dashboard,
  staggerDelayMs = 800,
}: ImpactSummaryCardProps) => (
  <View style={styles.card}>
    {/* This ride's impact */}
    <Text style={styles.sectionTitle}>This ride's impact</Text>

    <View style={styles.countersColumn}>
      <StaggeredCounter
        targetValue={rideImpact.co2SavedKg}
        suffix=" kg"
        decimals={2}
        label="CO2 saved"
        equivalentText={rideImpact.equivalentText}
        color={safetyColors.safe}
        delayMs={0}
      />
      <StaggeredCounter
        targetValue={rideImpact.moneySavedEur}
        prefix="EUR "
        decimals={2}
        label="Money saved"
        equivalentText={null}
        color={brandColors.accent}
        delayMs={staggerDelayMs}
      />
      <StaggeredCounter
        targetValue={rideImpact.hazardsWarnedCount}
        decimals={0}
        label="Hazards warned"
        equivalentText={null}
        color={safetyColors.caution}
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
