import type { HazardType, HazardVoteDirection, NearbyHazard } from '@defensivepedal/core';
import { HAZARD_TYPE_OPTIONS } from '@defensivepedal/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { brandColors, gray, safetyColors } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm, textXs } from '../tokens/typography';
import { getHazardIcon } from '../tokens/hazardIcons';
import { useT } from '../../hooks/useTranslation';

const POSITIVE_SCORE_THRESHOLD = 3;
const NEGATIVE_SCORE_THRESHOLD = -3;

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

export type HazardAlertVoteState = 'idle' | 'pending';

export interface HazardAlertProps {
  hazard: NearbyHazard;
  distanceMeters: number;
  onUpvote: () => void;
  onDownvote: () => void;
  /** Current user's vote on this hazard, if any. Drives active-ring + filled icon. */
  userVote?: HazardVoteDirection | null;
  /** Override score display — defaults to `hazard.score`. */
  score?: number;
  /** When `pending`, buttons are disabled and dimmed. */
  voteState?: HazardAlertVoteState;
}

export const HazardAlert = ({
  hazard,
  distanceMeters,
  onUpvote,
  onDownvote,
  userVote = null,
  score,
  voteState = 'idle',
}: HazardAlertProps) => {
  const t = useT();
  const iconName = getHazardIcon(hazard.hazardType);
  const label = getHazardLabel(hazard.hazardType);
  const displayScore = score ?? hazard.score ?? (hazard.confirmCount - hazard.denyCount);
  const distanceText =
    distanceMeters < 100
      ? t('common.mAhead', { distance: Math.round(distanceMeters) })
      : t('common.mAway', { distance: Math.round(distanceMeters) });

  const isPending = voteState === 'pending';
  const upActive = userVote === 'up';
  const downActive = userVote === 'down';

  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`${t('hazard.warning')}: ${label}, ${distanceText}. ${t('hazard.stillHereNow')}`}
    >
      <View style={styles.header}>
        <Ionicons name={iconName as any} size={24} color={safetyColors.caution} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.distance}>{distanceText}</Text>
        </View>
      </View>

      <View style={styles.voteRow}>
        <Pressable
          onPress={onUpvote}
          disabled={isPending}
          style={[
            styles.voteButton,
            upActive ? styles.voteButtonActiveUp : null,
            isPending ? styles.voteButtonDisabled : null,
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
            color={upActive ? safetyColors.safe : brandColors.textPrimary}
          />
        </Pressable>

        <View style={styles.scorePill}>
          <Text style={[styles.scoreText, { color: scoreColor(displayScore) }]}>
            {formatScore(displayScore)}
          </Text>
        </View>

        <Pressable
          onPress={onDownvote}
          disabled={isPending}
          style={[
            styles.voteButton,
            downActive ? styles.voteButtonActiveDown : null,
            isPending ? styles.voteButtonDisabled : null,
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
            color={downActive ? safetyColors.danger : brandColors.textPrimary}
          />
        </Pressable>
      </View>

      {hazard.confirmCount > 0 ? (
        <Text style={styles.confirmCount}>
          {t(hazard.confirmCount === 1 ? 'common.confirmed_one' : 'common.confirmed_other', { count: hazard.confirmCount })}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(30, 20, 0, 0.94)',
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: safetyColors.caution,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    marginHorizontal: space[4],
    gap: space[2],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  headerText: {
    flex: 1,
    gap: space[0.5],
  },
  title: {
    ...textBase,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.accent,
    fontSize: 15,
  },
  distance: {
    ...textXs,
    color: gray[400],
  },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
    marginTop: space[1],
  },
  voteButton: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  voteButtonActiveUp: {
    borderColor: safetyColors.safe,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  voteButtonActiveDown: {
    borderColor: safetyColors.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  voteButtonDisabled: {
    opacity: 0.5,
  },
  scorePill: {
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
  scoreText: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    fontSize: 18,
  },
  confirmCount: {
    ...textXs,
    color: gray[500],
    textAlign: 'center',
  },
});
