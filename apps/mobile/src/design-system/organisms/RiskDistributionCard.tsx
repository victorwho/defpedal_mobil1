import type { RiskSegment } from '@defensivepedal/core';
import { computeRiskDistribution } from '@defensivepedal/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { darkTheme } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { RISK_LEGEND_BANDS, riskBandKeyForServerLabel } from '../tokens/riskLegend';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textSm, textXs, textDataSm } from '../tokens/typography';
import { useT } from '../../hooks/useTranslation';

/** Bands that count as "green" for the takeaway line. */
const GREEN_BANDS: ReadonlySet<string> = new Set(['Safer']);

/** Below this green share the takeaway is the neutral variant. */
const MOSTLY_GREEN_THRESHOLD = 60;

/** Below this green share no takeaway renders — the bar speaks for itself. */
const TAKEAWAY_MIN_GREEN = 25;

type RiskDistributionCardProps = {
  readonly riskSegments: readonly RiskSegment[];
  /** Opens the "How we score every street" explainer sheet. */
  readonly onInfoPress?: () => void;
};

export const RiskDistributionCard = ({
  riskSegments,
  onInfoPress,
}: RiskDistributionCardProps) => {
  const t = useT();

  const distribution = useMemo(
    () => computeRiskDistribution(riskSegments),
    [riskSegments],
  );

  const greenPercent = useMemo(
    () =>
      distribution
        .filter((entry) => GREEN_BANDS.has(entry.category.label))
        .reduce((sum, entry) => sum + entry.percentage, 0),
    [distribution],
  );

  if (distribution.length === 0) {
    return null;
  }

  /** Localize a server band label, falling back to the raw label. */
  const bandLabel = (serverLabel: string): string => {
    const key = riskBandKeyForServerLabel(serverLabel);
    return key ? t(`risk.bands.${key}.label`) : serverLabel;
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>{t('risk.cardTitle')}</Text>
        {onInfoPress ? (
          <Pressable
            onPress={onInfoPress}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('risk.cardInfoA11y')}
          >
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={darkTheme.textMuted}
            />
          </Pressable>
        ) : null}
      </View>

      {greenPercent >= TAKEAWAY_MIN_GREEN ? (
        <Text style={styles.takeaway}>
          {greenPercent >= MOSTLY_GREEN_THRESHOLD
            ? t('risk.takeawayMostlyGreen', { percent: greenPercent })
            : t('risk.takeawayNeutral', { percent: greenPercent })}
        </Text>
      ) : null}

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
            {/*
              A ramp of the tier's own shades, not the segment colour that
              happened to appear first on this route. `computeRiskDistribution`
              keeps the first colour it sees per category, so a single dot gave
              the SAME tier a different colour from one route to the next.
              Unknown labels (an older or newer server) keep the flat
              server-sent colour — never guess a band we do not recognise.
            */}
            {(() => {
              const shades = RISK_LEGEND_BANDS.find(
                (b) => b.serverLabel === entry.category.label,
              )?.shades;

              return shades ? (
                <View style={styles.legendRamp}>
                  {shades.map((shade) => (
                    <View
                      key={shade}
                      style={[styles.legendRampShade, { backgroundColor: shade }]}
                    />
                  ))}
                </View>
              ) : (
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: entry.category.color },
                  ]}
                />
              );
            })()}
            <Text style={styles.legendLabel}>{bandLabel(entry.category.label)}</Text>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  header: {
    ...textSm,
    fontFamily: fontFamily.body.semiBold,
    color: darkTheme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 11,
  },
  takeaway: {
    ...textSm,
    fontFamily: fontFamily.body.regular,
    color: darkTheme.textSecondary,
    marginTop: -space[1],
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
  // Same footprint as legendDot so rows with a ramp and rows with the
  // unknown-label fallback dot still line up.
  legendRamp: {
    width: 20,
    height: 10,
    borderRadius: 5,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  legendRampShade: {
    flex: 1,
    height: '100%',
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
