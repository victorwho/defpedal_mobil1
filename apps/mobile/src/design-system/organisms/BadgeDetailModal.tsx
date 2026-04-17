/**
 * Design System — BadgeDetailModal Organism
 *
 * Bottom sheet modal showing full badge information:
 * hero icon (lg), name, tier, flavor text, criteria, progress bar, rarity, share.
 */
import React, { useCallback } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';

import type { BadgeDefinition, BadgeProgress } from '@defensivepedal/core';

import { BadgeShareCard } from '../../components/BadgeShareCard';
import { useShareCard } from '../../hooks/useShareCard';
import { BadgeIcon } from '../atoms/BadgeIcon';
import { BadgeProgressBar } from '../atoms/BadgeProgressBar';
import {
  tierColors,
  badgeSpace,
  getRarity,
  type BadgeTier,
} from '../tokens/badgeColors';
import { brandColors } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import {
  fontFamily,
  textBase,
  textSm,
  textXl,
  textXs,
} from '../tokens/typography';

export interface BadgeDetailModalProps {
  badge: BadgeDefinition | null;
  earned: boolean;
  earnedAt?: string;
  earnedTier?: BadgeTier;
  progress?: BadgeProgress;
  rarityPercent?: number;
  onShare: () => void;
  onClose: () => void;
}

const TIER_LABELS: Record<BadgeTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
};

const TIER_FROM_LEVEL: Record<number, BadgeTier> = {
  1: 'bronze',
  2: 'silver',
  3: 'gold',
  4: 'platinum',
  5: 'diamond',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export const BadgeDetailModal: React.FC<BadgeDetailModalProps> = ({
  badge,
  earned,
  earnedAt,
  earnedTier,
  progress,
  rarityPercent,
  onShare,
  onClose,
}) => {
  const { share: shareCard, isSharing } = useShareCard();

  const handleShare = useCallback(async () => {
    if (!badge) return;
    const t: BadgeTier = earnedTier ?? TIER_FROM_LEVEL[badge.tier] ?? 'bronze';
    const tierLabel = TIER_LABELS[t];
    const rarity = rarityPercent != null ? getRarity(rarityPercent) : null;

    const result = await shareCard({
      type: 'badge',
      badgeName: badge.name,
      tier: tierLabel,
      rarity: rarity?.level,
      card: (
        <BadgeShareCard
          variant="capture"
          badge={badge}
          tier={t}
          rarityPercent={rarityPercent}
        />
      ),
    });

    // Fire the parent tracking callback AFTER a successful share so analytics
    // reflect completed shares only.
    if (result.shared) {
      onShare();
    }
  }, [badge, earnedTier, onShare, rarityPercent, shareCard]);

  if (!badge) return null;

  const isSecret = badge.isHidden && !earned;
  const tier: BadgeTier | 'locked' | 'secret' = earned
    ? earnedTier ?? TIER_FROM_LEVEL[badge.tier] ?? 'bronze'
    : isSecret
      ? 'secret'
      : 'locked';

  const tierLabel =
    tier !== 'locked' && tier !== 'secret' ? TIER_LABELS[tier] : null;
  const tierColor =
    tier !== 'locked' && tier !== 'secret'
      ? tierColors[tier].primary
      : brandColors.textMuted;

  const progressFraction =
    !earned && progress ? progress.progress : undefined;

  const rarity = rarityPercent != null ? getRarity(rarityPercent) : null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} />
        <View style={[styles.sheet, shadows.xl]}>
          {/* Drag handle */}
          <View style={styles.dragHandle} />

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            {/* Hero badge icon */}
            <View style={styles.heroRow}>
              <BadgeIcon
                badgeKey={badge.badgeKey}
                tierFamily={badge.tierFamily}
                tier={tier}
                size="lg"
                progress={progressFraction}
              />
            </View>

            {/* Badge name */}
            <Text style={styles.badgeName}>
              {isSecret ? '???' : badge.name}
            </Text>

            {/* Tier label */}
            {tierLabel ? (
              <Text style={[styles.tierLabel, { color: tierColor }]}>
                {tierLabel}
              </Text>
            ) : null}

            {/* Flavor text */}
            <Text style={styles.flavorText}>
              {isSecret
                ? 'This badge is a mystery. Keep riding to discover it!'
                : badge.flavorText}
            </Text>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Criteria */}
            {!isSecret ? (
              <Text style={styles.criteriaText}>{badge.criteriaText}</Text>
            ) : null}

            {/* Progress bar + text */}
            {!earned && progress && !isSecret ? (
              <View style={styles.progressSection}>
                <BadgeProgressBar
                  current={progress.current}
                  target={progress.target}
                  tierColor={tierColor}
                  height={badgeSpace.progressHeightLg}
                />
                <Text
                  style={[styles.progressText, { color: tierColor }]}
                  accessibilityLabel={`${progress.current} of ${progress.target} ${badge.criteriaUnit ?? ''}, ${Math.round(progress.progress * 100)}% complete`}
                >
                  {progress.current} / {progress.target}
                  {badge.criteriaUnit ? ` ${badge.criteriaUnit}` : ''}
                </Text>
              </View>
            ) : null}

            {/* Divider before rarity */}
            {(rarity || earnedAt) ? <View style={styles.divider} /> : null}

            {/* Rarity */}
            {rarity && rarityPercent != null ? (
              <Text style={styles.rarityText}>
                <Text style={{ color: rarity.color }}>{'◆ '}</Text>
                <Text style={styles.rarityLabel}>
                  Only {rarityPercent.toFixed(0)}% of cyclists have this badge
                </Text>
              </Text>
            ) : null}

            {/* Earned date */}
            {earnedAt ? (
              <Text style={styles.earnedDate}>
                Earned {formatDate(earnedAt)}
              </Text>
            ) : null}

            {/* Share button */}
            {earned ? (
              <Pressable
                style={[styles.shareButton, isSharing && styles.shareButtonDisabled]}
                onPress={handleShare}
                disabled={isSharing}
                accessibilityState={{ disabled: isSharing, busy: isSharing }}
              >
                {isSharing ? (
                  <ActivityIndicator size="small" color="#111827" />
                ) : (
                  <Text style={styles.shareButtonText}>Share</Text>
                )}
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropPress: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: brandColors.bgPrimary,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    maxHeight: '80%',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: brandColors.bgTertiary,
    alignSelf: 'center',
    marginTop: space[3],
    marginBottom: space[2],
  },
  content: {
    paddingHorizontal: space[5],
    paddingBottom: space[6],
    gap: space[3],
  },
  heroRow: {
    alignItems: 'center',
    paddingTop: space[2],
    paddingBottom: space[2],
  },
  badgeName: {
    ...textXl,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textPrimary,
    textAlign: 'center',
  },
  tierLabel: {
    ...textSm,
    fontFamily: fontFamily.mono.semiBold,
    textAlign: 'center',
  },
  flavorText: {
    ...textBase,
    fontFamily: fontFamily.body.regular,
    color: brandColors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: brandColors.borderDefault,
  },
  criteriaText: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: brandColors.textPrimary,
  },
  progressSection: {
    gap: space[2],
  },
  progressText: {
    fontFamily: fontFamily.mono.medium,
    fontSize: 14,
    lineHeight: 18,
  },
  rarityText: {
    ...textSm,
    flexDirection: 'row',
  },
  rarityLabel: {
    color: brandColors.textMuted,
  },
  earnedDate: {
    ...textXs,
    color: brandColors.textMuted,
  },
  shareButton: {
    backgroundColor: brandColors.accent,
    borderRadius: radii.lg,
    paddingVertical: space[3],
    alignItems: 'center',
    marginTop: space[2],
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareButtonText: {
    fontFamily: fontFamily.body.bold,
    fontSize: 16,
    color: '#111827',
  },
});
