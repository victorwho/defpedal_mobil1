import type { RiskSegment } from '@defensivepedal/core';
import { computeRiskDistribution } from '@defensivepedal/core';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { darkTheme } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textSm, textXs, textDataSm } from '../tokens/typography';

type RiskDistributionCardProps = {
  readonly riskSegments: readonly RiskSegment[];
};

export const RiskDistributionCard = ({
  riskSegments,
}: RiskDistributionCardProps) => {
  const distribution = useMemo(
    () => computeRiskDistribution(riskSegments),
    [riskSegments],
  );

  if (distribution.length === 0) {
    return null;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.header}>Route risk</Text>

      {/* Stacked horizontal bar */}
      <View style={styles.barContainer}>
        {distribution.map((entry, index) => {
          const isFirst = index === 0;
          const isLast = index === distribution.length - 1;

          return (
            <View
              key={entry.category.label}
              style={[
                styles.barSegment,
                {
                  flex: entry.percentage,
                  backgroundColor: entry.category.color,
                  borderTopLeftRadius: isFirst ? 6 : 0,
                  borderBottomLeftRadius: isFirst ? 6 : 0,
                  borderTopRightRadius: isLast ? 6 : 0,
                  borderBottomRightRadius: isLast ? 6 : 0,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Legend rows */}
      <View style={styles.legendContainer}>
        {distribution.map((entry) => (
          <View key={entry.category.label} style={styles.legendRow}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: entry.category.color },
              ]}
            />
            <Text style={styles.legendLabel}>{entry.category.label}</Text>
            <Text style={styles.legendValue}>{entry.percentage}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: darkTheme.bgPrimary,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    gap: space[3],
    ...shadows.md,
  },
  header: {
    ...textSm,
    fontFamily: fontFamily.body.semiBold,
    color: darkTheme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 11,
  },
  barContainer: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 6,
    overflow: 'hidden',
    gap: 1,
  },
  barSegment: {
    minWidth: 4,
  },
  legendContainer: {
    gap: space[1],
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    ...textXs,
    fontFamily: fontFamily.body.regular,
    color: darkTheme.textSecondary,
    flex: 1,
  },
  legendValue: {
    ...textDataSm,
    fontFamily: fontFamily.mono.semiBold,
    color: darkTheme.textPrimary,
    fontSize: 12,
  },
});
