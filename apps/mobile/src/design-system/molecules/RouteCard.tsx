/**
 * Design System v1.0 — RouteCard Molecule
 *
 * Displays a single route option with:
 * - Risk score badge (48px circle, mono font)
 * - Route name + distance/ETA
 * - Risk gradient bar (4px flex segments)
 * - Recommended left-border accent
 * - Press handler for selection
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeContext';
import { Badge } from '../atoms/Badge';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { fontFamily, textBase, textSm, textXs, textDataMd, textDataSm } from '../tokens/typography';
import {
  safetyColors,
  riskScoreToLevel,
  riskLevelColors,
  type RiskLevel,
} from '../tokens/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RiskBarSegment {
  /** Weight (flex) for how much of the bar this segment occupies */
  weight: number;
  /** Risk level for coloring */
  level: RiskLevel;
}

export interface RouteCardProps {
  /** Route display name (e.g. "Via Calea Victoriei") */
  name: string;
  /** Total distance formatted (e.g. "3.2 km") */
  distance: string;
  /** Estimated time formatted (e.g. "14 min") */
  eta: string;
  /** Total climb formatted (e.g. "42 m") or null */
  climb?: string | null;
  /** Overall risk score 0–10 */
  riskScore: number;
  /** Segments for the gradient bar */
  riskSegments?: RiskBarSegment[];
  /** Whether this is the recommended route */
  recommended?: boolean;
  /** Whether this card is currently selected */
  selected?: boolean;
  /** Press handler */
  onPress?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatRiskScore = (score: number) => score.toFixed(1);

const riskLabel = (level: RiskLevel): string => {
  switch (level) {
    case 'safe':
      return 'Safe';
    case 'caution':
      return 'Caution';
    case 'danger':
      return 'Danger';
  }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const RouteCard: React.FC<RouteCardProps> = ({
  name,
  distance,
  eta,
  climb,
  riskScore,
  riskSegments = [],
  recommended = false,
  selected = false,
  onPress,
}) => {
  const { colors } = useTheme();
  const level = riskScoreToLevel(riskScore);
  const levelColors = riskLevelColors[level];

  const containerStyle: ViewStyle[] = [
    styles.container,
    {
      backgroundColor: colors.bgSecondary,
      borderColor: selected ? colors.accent : colors.borderDefault,
      borderWidth: selected ? 2 : 1,
    },
    shadows.sm,
  ];

  return (
    <Pressable
      style={({ pressed }) => [
        ...containerStyle,
        pressed && { backgroundColor: colors.bgTertiary },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Route ${name}, ${distance}, ${eta}, risk ${formatRiskScore(riskScore)}`}
    >
      {/* Recommended left accent */}
      {recommended ? (
        <View style={[styles.recommendedBar, { backgroundColor: colors.accent }]} />
      ) : null}

      <View style={styles.body}>
        {/* Top row: risk score circle + route info */}
        <View style={styles.topRow}>
          {/* Risk score circle */}
          <View
            style={[
              styles.riskCircle,
              { backgroundColor: levelColors.tint, borderColor: levelColors.primary },
            ]}
          >
            <Text
              style={[
                textDataMd,
                { color: levelColors.text },
              ]}
            >
              {formatRiskScore(riskScore)}
            </Text>
          </View>

          {/* Route info */}
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text
                style={[
                  textBase,
                  { color: colors.textPrimary, fontFamily: fontFamily.body.semiBold },
                ]}
                numberOfLines={1}
              >
                {name}
              </Text>
              {recommended ? (
                <Badge variant="accent" size="sm">
                  Best
                </Badge>
              ) : null}
            </View>

            <View style={styles.metaRow}>
              <Text style={[textDataSm, { color: colors.textSecondary }]}>
                {distance}
              </Text>
              <Text style={[textXs, { color: colors.textMuted }]}>•</Text>
              <Text style={[textDataSm, { color: colors.textSecondary }]}>
                {eta}
              </Text>
              {climb ? (
                <>
                  <Text style={[textXs, { color: colors.textMuted }]}>•</Text>
                  <Text style={[textDataSm, { color: colors.textSecondary }]}>
                    ↑{climb}
                  </Text>
                </>
              ) : null}
            </View>

            {/* Risk label */}
            <Badge variant={`risk-${level}`} size="sm">
              {riskLabel(level)}
            </Badge>
          </View>
        </View>

        {/* Risk gradient bar */}
        {riskSegments.length > 0 ? (
          <View style={styles.riskBar}>
            {riskSegments.map((seg, i) => (
              <View
                key={i}
                style={{
                  flex: seg.weight,
                  height: 4,
                  backgroundColor: riskLevelColors[seg.level].primary,
                  borderTopLeftRadius: i === 0 ? radii.full : 0,
                  borderBottomLeftRadius: i === 0 ? radii.full : 0,
                  borderTopRightRadius: i === riskSegments.length - 1 ? radii.full : 0,
                  borderBottomRightRadius:
                    i === riskSegments.length - 1 ? radii.full : 0,
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  recommendedBar: {
    width: 4,
  },
  body: {
    flex: 1,
    padding: space[4],
    gap: space[3],
  },
  topRow: {
    flexDirection: 'row',
    gap: space[3],
  },
  riskCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: space[1],
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  riskBar: {
    flexDirection: 'row',
    height: 4,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
});
