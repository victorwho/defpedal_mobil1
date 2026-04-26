/**
 * Design System v1.0 — HazardAlertPill Molecule
 *
 * Floating top-center pill during navigation.
 * Severity-colored background.
 * Spring entrance animation + opacity pulse.
 * Auto-dismiss callback after duration.
 */
import type { HazardVoteDirection } from '@defensivepedal/core';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { fontFamily, textSm } from '../tokens/typography';
import { gray, safetyColors, type RiskLevel } from '../tokens/colors';
import { duration as dur, easing } from '../tokens/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptics } from '../hooks/useHaptics';

const POSITIVE_SCORE_THRESHOLD = 3;
const NEGATIVE_SCORE_THRESHOLD = -3;

const pillScoreColor = (score: number): string => {
  if (score >= POSITIVE_SCORE_THRESHOLD) return safetyColors.safe;
  if (score <= NEGATIVE_SCORE_THRESHOLD) return safetyColors.danger;
  return gray[200];
};

const formatPillScore = (score: number): string => {
  if (score > 0) return `+${score}`;
  if (score < 0) return `\u2212${Math.abs(score)}`;
  return '0';
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HazardAlertPillVoteState = 'idle' | 'pending';

export interface HazardAlertPillProps {
  /** Hazard type label (e.g. "Pothole ahead") */
  message: string;
  /** Severity level */
  severity: RiskLevel;
  /** Distance text (e.g. "120 m ahead") */
  distanceText?: string;
  /** Duration in ms before auto-dismiss. 0 = manual dismiss only. */
  autoDismissMs?: number;
  /** Called when pill should be removed */
  onDismiss?: () => void;
  /** Optional icon name from Ionicons */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Community score. When set together with `onUpvote`/`onDownvote`, the compact vote row is shown. */
  score?: number;
  /** Current user's vote on this hazard, if any. */
  userVote?: HazardVoteDirection | null;
  /** When `pending`, vote buttons are disabled. */
  voteState?: HazardAlertPillVoteState;
  onUpvote?: () => void;
  onDownvote?: () => void;
  /** Accessibility labels for the vote buttons. */
  upvoteLabel?: string;
  downvoteLabel?: string;
}

// ---------------------------------------------------------------------------
// Severity color mapping
// ---------------------------------------------------------------------------

const severityStyles: Record<
  RiskLevel,
  { bg: string; text: string; iconColor: string }
> = {
  safe: {
    bg: safetyColors.safe,
    text: '#FFFFFF',
    iconColor: '#FFFFFF',
  },
  caution: {
    bg: safetyColors.caution,
    text: '#FFFFFF',
    iconColor: '#FFFFFF',
  },
  danger: {
    bg: safetyColors.danger,
    text: '#FFFFFF',
    iconColor: '#FFFFFF',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const HazardAlertPill: React.FC<HazardAlertPillProps> = ({
  message,
  severity,
  distanceText,
  autoDismissMs = 5000,
  onDismiss,
  icon = 'warning-outline',
  score,
  userVote = null,
  voteState = 'idle',
  onUpvote,
  onDownvote,
  upvoteLabel,
  downvoteLabel,
}) => {
  const showVoteRow =
    typeof score === 'number' && typeof onUpvote === 'function' && typeof onDownvote === 'function';
  const isPending = voteState === 'pending';
  const upActive = userVote === 'up';
  const downActive = userVote === 'down';
  const reducedMotion = useReducedMotion();
  const haptics = useHaptics();
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const sv = severityStyles[severity];

  // Entrance animation — always show the pill (safety-critical), skip motion if reduced
  useEffect(() => {
    // Safety-critical haptic: fires during NAVIGATING and overrides reduced-motion
    // (see design-system/tokens/haptics.ts §warning).
    haptics.warning();

    if (reducedMotion) {
      translateY.setValue(0);
      opacity.setValue(1);
      return;
    }

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 8,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: dur.fast,
        useNativeDriver: true,
      }),
    ]).start();

    // Danger-level pulse (non-safety animation — skip when reduced)
    if (severity === 'danger') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.7,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [severity, reducedMotion]);

  // Auto-dismiss
  useEffect(() => {
    if (autoDismissMs <= 0 || !onDismiss) return;

    const timer = setTimeout(() => {
      if (reducedMotion) {
        onDismiss();
        return;
      }
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -80,
          duration: dur.normal,
          easing: easing.in,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: dur.normal,
          useNativeDriver: true,
        }),
      ]).start(() => onDismiss());
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [autoDismissMs, onDismiss, reducedMotion]);

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: sv.bg, transform: [{ translateY }], opacity },
        shadows.md,
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`${message}${distanceText ? `, ${distanceText}` : ''}`}
    >
      <Animated.View style={{ opacity: pulseAnim }}>
        <Ionicons name={icon} size={20} color={sv.iconColor} />
      </Animated.View>
      <View style={styles.textWrap}>
        <Text
          style={[
            textSm,
            {
              color: sv.text,
              fontFamily: fontFamily.body.bold,
            },
          ]}
          numberOfLines={1}
        >
          {message}
        </Text>
        {distanceText ? (
          <Text
            style={[
              { fontSize: 12, color: sv.text, fontFamily: fontFamily.mono.medium, opacity: 0.85 },
            ]}
          >
            {distanceText}
          </Text>
        ) : null}
      </View>

      {showVoteRow ? (
        <View style={styles.voteCluster}>
          <Pressable
            onPress={onUpvote}
            disabled={isPending}
            style={[
              styles.pillVoteButton,
              upActive ? styles.pillVoteButtonActiveUp : null,
              isPending ? styles.pillVoteButtonDisabled : null,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: upActive, disabled: isPending }}
            accessibilityLabel={upvoteLabel}
            hitSlop={6}
          >
            <Ionicons
              name={(upActive ? 'thumbs-up' : 'thumbs-up-outline') as keyof typeof Ionicons.glyphMap}
              size={18}
              color={'#FFFFFF'}
            />
          </Pressable>
          <Text style={[styles.pillScoreText, { color: pillScoreColor(score as number) }]}>
            {formatPillScore(score as number)}
          </Text>
          <Pressable
            onPress={onDownvote}
            disabled={isPending}
            style={[
              styles.pillVoteButton,
              downActive ? styles.pillVoteButtonActiveDown : null,
              isPending ? styles.pillVoteButtonDisabled : null,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: downActive, disabled: isPending }}
            accessibilityLabel={downvoteLabel}
            hitSlop={6}
          >
            <Ionicons
              name={
                (downActive ? 'thumbs-down' : 'thumbs-down-outline') as keyof typeof Ionicons.glyphMap
              }
              size={18}
              color={'#FFFFFF'}
            />
          </Pressable>
        </View>
      ) : null}
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radii.full,
    gap: space[2],
    maxWidth: '90%',
  },
  textWrap: {
    flexShrink: 1,
    gap: 2,
  },
  voteCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    marginLeft: space[1],
  },
  pillVoteButton: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  pillVoteButtonActiveUp: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  pillVoteButtonActiveDown: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  pillVoteButtonDisabled: {
    opacity: 0.5,
  },
  pillScoreText: {
    fontSize: 13,
    fontFamily: fontFamily.heading.bold,
    minWidth: 28,
    textAlign: 'center',
  },
});
