/**
 * Design System — MiaJourneyTracker Organism
 *
 * Vertical progress line with 5 level nodes showing the Mia journey progress.
 * Completed levels: green circle + checkmark. Current: pulsing accent.
 * Locked levels: gray circle + preview text.
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MiaJourneyLevel } from '@defensivepedal/core';

import { usePersonaT } from '../../hooks/usePersonaT';
import { FadeSlideIn } from '../atoms/FadeSlideIn';
import { useTheme, type ThemeColors } from '../ThemeContext';
import { miaLevelColors } from '../tokens/miaColors';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import {
  fontFamily,
  textBase,
  textSm,
  textXs,
} from '../tokens/typography';
import Ionicons from '@expo/vector-icons/Ionicons';

// ---------------------------------------------------------------------------
// Level config
// ---------------------------------------------------------------------------

/** Rides required to reach each level */
const LEVEL_RIDE_THRESHOLDS: Record<number, number> = {
  1: 0,
  2: 1,
  3: 3,
  4: 5,
  5: 10,
};

const ALL_LEVELS: readonly MiaJourneyLevel[] = [1, 2, 3, 4, 5];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MiaJourneyTrackerProps {
  readonly currentLevel: MiaJourneyLevel;
  readonly totalRides: number;
  readonly onShareProgress?: () => void;
}

// ---------------------------------------------------------------------------
// Node component
// ---------------------------------------------------------------------------

type NodeStatus = 'completed' | 'current' | 'locked';

type NodeProps = {
  readonly level: MiaJourneyLevel;
  readonly status: NodeStatus;
  readonly levelName: string;
  readonly preview: string | null;
  readonly conquered: string | null;
  readonly ridesProgress: string | null;
  readonly isLast: boolean;
  readonly colors: ThemeColors;
  readonly delay: number;
};

const NODE_SIZE = 28;
const LINE_WIDTH = 2;

const JourneyNode: React.FC<NodeProps> = ({
  level,
  status,
  levelName,
  preview,
  conquered,
  ridesProgress,
  isLast,
  colors,
  delay,
}) => {
  const nodeColor =
    status === 'completed'
      ? '#22C55E'
      : status === 'current'
        ? colors.accent
        : colors.bgTertiary;

  const textColor =
    status === 'locked' ? colors.textMuted : colors.textPrimary;

  return (
    <FadeSlideIn delay={delay} translateY={8}>
      <View style={nodeStyles.row}>
        {/* Vertical line + node */}
        <View style={nodeStyles.lineCol}>
          <View
            style={[
              nodeStyles.node,
              {
                backgroundColor: status === 'locked' ? 'transparent' : nodeColor,
                borderColor: nodeColor,
                borderWidth: status === 'locked' ? LINE_WIDTH : 0,
              },
            ]}
          >
            {status === 'completed' ? (
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            ) : status === 'current' ? (
              <Text style={nodeStyles.currentDot}>
                {level}
              </Text>
            ) : (
              <Text style={[nodeStyles.lockedDot, { color: colors.textMuted }]}>
                {level}
              </Text>
            )}
          </View>
          {/* Connecting line to next node */}
          {!isLast ? (
            <View
              style={[
                nodeStyles.connector,
                {
                  backgroundColor:
                    status === 'completed' ? '#22C55E' : colors.bgTertiary,
                },
              ]}
            />
          ) : null}
        </View>

        {/* Text content */}
        <View style={nodeStyles.textCol}>
          <Text style={[nodeStyles.levelName, { color: textColor }]}>
            {levelName}
          </Text>
          {status === 'current' && ridesProgress ? (
            <Text style={[nodeStyles.progressText, { color: colors.accent }]}>
              {ridesProgress}
            </Text>
          ) : null}
          {status === 'locked' && preview ? (
            <Text style={[nodeStyles.previewText, { color: colors.textMuted }]}>
              {preview}
            </Text>
          ) : null}
          {status === 'completed' && conquered ? (
            <View style={nodeStyles.conqueredRow}>
              <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
              <Text style={[nodeStyles.conqueredText, { color: colors.textSecondary }]}>
                {conquered}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </FadeSlideIn>
  );
};

const nodeStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space[3],
  },
  lineCol: {
    alignItems: 'center',
    width: NODE_SIZE,
  },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connector: {
    width: LINE_WIDTH,
    height: 32,
  },
  textCol: {
    flex: 1,
    paddingTop: 2,
    paddingBottom: space[1],
    gap: 2,
  },
  levelName: {
    ...textBase,
    fontFamily: fontFamily.body.semiBold,
    fontSize: 15,
  },
  progressText: {
    ...textSm,
    fontFamily: fontFamily.mono.medium,
  },
  previewText: {
    ...textXs,
    fontFamily: fontFamily.body.regular,
  },
  conqueredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  conqueredText: {
    ...textXs,
    fontFamily: fontFamily.body.regular,
  },
  currentDot: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  lockedDot: {
    fontFamily: fontFamily.mono.medium,
    fontSize: 12,
  },
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const MiaJourneyTracker: React.FC<MiaJourneyTrackerProps> = ({
  currentLevel,
  totalRides,
  onShareProgress,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = usePersonaT();

  return (
    <View style={styles.card}>
      <Text style={styles.header}>{t('mia.journey.title')}</Text>

      <View style={styles.nodeList}>
        {ALL_LEVELS.map((level, idx) => {
          const status: NodeStatus =
            level < currentLevel
              ? 'completed'
              : level === currentLevel
                ? 'current'
                : 'locked';

          const levelName = t(`mia.journey.levelNames.${level}`);
          const preview =
            status === 'locked' && level <= 5
              ? t(`mia.journey.unlockPreviews.${level}`)
              : null;
          const conquered =
            status === 'completed' && level <= 4
              ? t(`mia.journey.conquered.${level}`)
              : null;

          const nextThreshold = LEVEL_RIDE_THRESHOLDS[level + 1] ?? null;
          const ridesProgress =
            status === 'current' && nextThreshold != null
              ? t('mia.postRide.levelProgress', {
                  rides: totalRides,
                  needed: nextThreshold,
                  level: level + 1,
                })
              : null;

          return (
            <JourneyNode
              key={level}
              level={level}
              status={status}
              levelName={levelName}
              preview={preview}
              conquered={conquered}
              ridesProgress={ridesProgress}
              isLast={idx === ALL_LEVELS.length - 1}
              colors={colors}
              delay={idx * 80}
            />
          );
        })}
      </View>

      {/* Share progress button */}
      {onShareProgress ? (
        <FadeSlideIn delay={ALL_LEVELS.length * 80}>
          <Pressable style={styles.shareRow} onPress={onShareProgress}>
            <Ionicons name="share-social-outline" size={16} color={colors.accent} />
            <Text style={styles.shareText}>
              {t('mia.journey.shareProgress')}
            </Text>
          </Pressable>
        </FadeSlideIn>
      ) : null}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Themed styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.bgPrimary,
      borderRadius: radii['2xl'],
      borderWidth: 1,
      borderColor: colors.borderDefault,
      padding: space[5],
      gap: space[4],
      ...shadows.md,
    },
    header: {
      ...textSm,
      fontFamily: fontFamily.heading.semiBold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      fontSize: 11,
    },
    nodeList: {
      gap: 0,
    },
    shareRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[2],
      paddingVertical: space[2],
    },
    shareText: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.accent,
    },
  });
