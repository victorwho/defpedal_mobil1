/**
 * HazardDetailSheet — bottom-anchored dialog for a single hazard.
 *
 * Opens when a hazard marker is tapped on the map. Shows:
 *   - Hazard icon + localized type label + close button
 *   - Distance (if provided) + "reported N ago" + "last confirmed N ago"
 *   - Community score card (tier-colored number + sign)
 *   - Thumbs-up / thumbs-down vote buttons (same cluster as `HazardAlert`)
 *
 * Dismissal:
 *   - Backdrop tap
 *   - Swipe down past threshold (`dy > 120 || vy > 0.6`)
 *   - Android hardware back (via `onRequestClose`)
 *   - Screen reader `accessibilityEscape`
 *
 * Respects `useReducedMotion` — spring + fade are skipped when reduced.
 * Uses `useSafeAreaInsets()` directly (CLAUDE.md: never SafeAreaView from
 * react-native on Android).
 */
import type { HazardType, HazardVoteDirection, NearbyHazard } from '@defensivepedal/core';
import { HAZARD_TYPE_OPTIONS } from '@defensivepedal/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ReportSheet } from '../molecules/ReportSheet';
import { getHazardIcon } from '../tokens/hazardIcons';
import { radii } from '../tokens/radii';
import { safetyColors, gray } from '../tokens/colors';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm, textXs } from '../tokens/typography';
import { zIndex } from '../tokens/zIndex';
import { duration as dur, easing } from '../tokens/motion';
import { useT } from '../../hooks/useTranslation';

const POSITIVE_SCORE_THRESHOLD = 3;
const NEGATIVE_SCORE_THRESHOLD = -3;
const SWIPE_DISMISS_DY = 120;
const SWIPE_DISMISS_VY = 0.6;

const scoreColor = (score: number): string => {
  if (score >= POSITIVE_SCORE_THRESHOLD) return safetyColors.safe;
  if (score <= NEGATIVE_SCORE_THRESHOLD) return safetyColors.danger;
  return gray[400];
};

const formatScore = (score: number): string => {
  if (score > 0) return `+${score}`;
  if (score < 0) return `\u2212${Math.abs(score)}`;
  return '0';
};

const getHazardLabel = (type: HazardType): string =>
  HAZARD_TYPE_OPTIONS.find((opt) => opt.value === type)?.label ?? 'Hazard';

/** Format an ISO timestamp as a short relative-time string ("2m ago", "3h ago"). */
const formatRelativeTime = (iso: string | null | undefined, nowMs: number): string => {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diffSec = Math.max(0, Math.round((nowMs - ts) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
};

export type HazardDetailSheetVoteState = 'idle' | 'pending';

export interface HazardDetailSheetProps {
  hazard: NearbyHazard | null;
  visible: boolean;
  onDismiss: () => void;
  onVote: (direction: HazardVoteDirection) => void;
  voteState?: HazardDetailSheetVoteState;
  /** Optional override — otherwise falls back to `hazard.distanceMeters`. */
  distanceMeters?: number;
}

export const HazardDetailSheet: React.FC<HazardDetailSheetProps> = ({
  hazard,
  visible,
  onDismiss,
  onVote,
  voteState = 'idle',
  distanceMeters,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const haptics = useHaptics();
  const t = useT();

  const [reportSheetVisible, setReportSheetVisible] = useState(false);

  const translateY = useRef(new Animated.Value(280)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      if (reducedMotion) {
        translateY.setValue(0);
        backdropOpacity.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 70,
          friction: 11,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: dur.fast,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      translateY.setValue(280);
      backdropOpacity.setValue(0);
    }
  }, [visible, reducedMotion]);

  // PanResponder for swipe-to-dismiss. Using useRef so the handler is stable
  // across renders; `onDismiss` is read off a ref so the closure stays fresh.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dy) > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_evt, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dy > SWIPE_DISMISS_DY || gesture.vy > SWIPE_DISMISS_VY) {
          Animated.timing(translateY, {
            toValue: 320,
            duration: dur.fast,
            easing: easing.in,
            useNativeDriver: true,
          }).start(() => onDismissRef.current());
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 70,
            friction: 11,
          }).start();
        }
      },
    }),
  ).current;

  // Early-return AFTER hooks — React requires stable hook order.
  if (!hazard) return null;

  const iconName = getHazardIcon(hazard.hazardType);
  const label = getHazardLabel(hazard.hazardType);
  const score = hazard.score ?? hazard.confirmCount - hazard.denyCount;
  const nowMs = Date.now();
  const reportedAgo = formatRelativeTime(hazard.createdAt, nowMs);
  const lastConfirmedAgo = formatRelativeTime(hazard.lastConfirmedAt, nowMs);
  const dist = distanceMeters ?? hazard.distanceMeters;

  const isPending = voteState === 'pending';
  const upActive = hazard.userVote === 'up';
  const downActive = hazard.userVote === 'down';

  const handleUpvote = () => {
    if (isPending) return;
    haptics.confirm();
    onVote('up');
  };
  const handleDownvote = () => {
    if (isPending) return;
    haptics.confirm();
    onVote('down');
  };
  const handleOverflow = () => {
    Alert.alert(label, t('feedCard.moderationMenu'), [
      { text: t('feedCard.report'), onPress: () => setReportSheetVisible(true) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.root} accessibilityViewIsModal>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
        </Animated.View>

        <Animated.View
          {...panResponder.panHandlers}
          accessibilityRole="none"
          accessibilityLabel={`${label}. ${t('hazard.communityScore')}: ${formatScore(score)}`}
          onAccessibilityEscape={onDismiss}
          style={[
            styles.sheet,
            shadows.xl,
            {
              backgroundColor: colors.bgPrimary,
              paddingBottom: insets.bottom + space[4],
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.dragHandleContainer}>
            <View style={[styles.dragHandle, { backgroundColor: gray[400] }]} />
          </View>

          <View style={styles.header}>
            <Ionicons name={iconName as any} size={28} color={safetyColors.caution} />
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {label}
            </Text>
            <Pressable
              onPress={handleOverflow}
              accessibilityRole="button"
              accessibilityLabel={t('feedCard.moderationMenu')}
              hitSlop={8}
              style={styles.overflowButton}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={8}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.metaRow}>
            {typeof dist === 'number' ? (
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {t('common.mAway', { distance: Math.round(dist) })}
              </Text>
            ) : null}
            {reportedAgo ? (
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {t('hazard.reportedAgo', { time: reportedAgo })}
              </Text>
            ) : null}
            {lastConfirmedAgo ? (
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {t('hazard.lastConfirmedAgo', { time: lastConfirmedAgo })}
              </Text>
            ) : null}
          </View>

          {hazard.description ? (
            <View style={[styles.descriptionCard, { backgroundColor: colors.bgSecondary }]}>
              <Text style={[styles.descriptionText, { color: colors.textPrimary }]}>
                {hazard.description}
              </Text>
            </View>
          ) : null}

          <View style={[styles.scoreCard, { backgroundColor: colors.bgSecondary }]}>
            <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>
              {t('hazard.communityScore')}
            </Text>
            <Text style={[styles.scoreValue, { color: scoreColor(score) }]}>
              {formatScore(score)}
            </Text>
            <View style={styles.scoreBreakdown}>
              <Text style={[styles.scoreBreakdownText, { color: colors.textSecondary }]}>
                {`${t('hazard.confirms')}: ${hazard.confirmCount}`}
              </Text>
              <Text style={[styles.scoreBreakdownText, { color: colors.textSecondary }]}>
                {`${t('hazard.dismisses')}: ${hazard.denyCount}`}
              </Text>
            </View>
          </View>

          <View style={styles.voteRow}>
            <Pressable
              onPress={handleUpvote}
              disabled={isPending}
              style={[
                styles.voteButton,
                upActive ? styles.voteButtonActiveUp : null,
                isPending ? styles.voteButtonDisabled : null,
                { backgroundColor: colors.bgSecondary },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: upActive, disabled: isPending }}
              accessibilityLabel={t('hazard.upvoteLabel')}
              accessibilityHint={t('hazard.upvoteHint')}
              hitSlop={4}
            >
              <Ionicons
                name={(upActive ? 'thumbs-up' : 'thumbs-up-outline') as any}
                size={22}
                color={upActive ? safetyColors.safe : colors.textPrimary}
              />
              <Text style={[styles.voteButtonLabel, { color: colors.textPrimary }]}>
                {t('hazard.confirms')}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleDownvote}
              disabled={isPending}
              style={[
                styles.voteButton,
                downActive ? styles.voteButtonActiveDown : null,
                isPending ? styles.voteButtonDisabled : null,
                { backgroundColor: colors.bgSecondary },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: downActive, disabled: isPending }}
              accessibilityLabel={t('hazard.downvoteLabel')}
              accessibilityHint={t('hazard.downvoteHint')}
              hitSlop={4}
            >
              <Ionicons
                name={(downActive ? 'thumbs-down' : 'thumbs-down-outline') as any}
                size={22}
                color={downActive ? safetyColors.danger : colors.textPrimary}
              />
              <Text style={[styles.voteButtonLabel, { color: colors.textPrimary }]}>
                {t('hazard.dismisses')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
      <ReportSheet
        visible={reportSheetVisible}
        onClose={() => setReportSheetVisible(false)}
        targetType="hazard"
        targetId={hazard.id}
        onReported={() => {
          setReportSheetVisible(false);
          // Auto-dismiss the detail sheet after a successful report — the
          // user no longer wants to interact with this hazard. The map
          // marker stays put until moderation hides it server-side.
          onDismissRef.current();
        }}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    zIndex: zIndex.modal,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: space[4],
    paddingTop: space[3],
    gap: space[3],
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingBottom: space[2],
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  title: {
    flex: 1,
    ...textBase,
    fontFamily: fontFamily.heading.bold,
    fontSize: 18,
  },
  overflowButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[3],
  },
  metaText: {
    ...textXs,
  },
  scoreCard: {
    alignItems: 'center',
    padding: space[4],
    borderRadius: radii.lg,
    gap: space[1],
  },
  descriptionCard: {
    padding: space[3],
    borderRadius: radii.lg,
  },
  descriptionText: {
    ...textSm,
    lineHeight: 20,
  },
  scoreLabel: {
    ...textXs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scoreValue: {
    fontFamily: fontFamily.heading.extraBold,
    fontSize: 36,
    lineHeight: 40,
  },
  scoreBreakdown: {
    flexDirection: 'row',
    gap: space[4],
    marginTop: space[1],
  },
  scoreBreakdownText: {
    ...textXs,
  },
  voteRow: {
    flexDirection: 'row',
    gap: space[3],
  },
  voteButton: {
    flex: 1,
    flexBasis: '50%',
    minHeight: 56,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[1],
    paddingVertical: space[2],
  },
  voteButtonActiveUp: {
    borderColor: safetyColors.safe,
  },
  voteButtonActiveDown: {
    borderColor: safetyColors.danger,
  },
  voteButtonDisabled: {
    opacity: 0.5,
  },
  voteButtonLabel: {
    ...textSm,
    fontFamily: fontFamily.body.semiBold,
  },
});
