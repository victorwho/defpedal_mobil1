import type { FeedItem, RouteOption } from '@defensivepedal/core';
import { formatCo2Saved, formatDistance, formatDuration } from '@defensivepedal/core';
import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, type ThemeColors } from '../design-system';
import { safetyColors } from '../design-system/tokens/colors';
import { radii } from '../design-system/tokens/radii';
import { space } from '../design-system/tokens/spacing';
import { textBase, textLg, textSm, textXs } from '../design-system/tokens/typography';
import { TierPill } from '../design-system/atoms/TierPill';
import { riderTiers, type RiderTierKey } from '../design-system/tokens/tierColors';
import { ReactionBar } from './LikeButton';
import { RouteMap } from './map';

type FeedCardProps = {
  item: FeedItem;
  isVisible: boolean;
  onLike: (id: string, liked: boolean) => void;
  onLove: (id: string, loved: boolean) => void;
  onPress: (id: string) => void;
  onUserPress?: (userId: string) => void;
};

const formatRelativeTime = (isoDate: string): string => {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
};

const buildSyntheticRoute = (item: FeedItem): RouteOption => ({
  id: item.id,
  source: 'custom_osrm',
  routingEngineVersion: '',
  routingProfileVersion: '',
  mapDataVersion: '',
  riskModelVersion: '',
  geometryPolyline6: item.geometryPolyline6,
  distanceMeters: item.distanceMeters,
  durationSeconds: item.durationSeconds,
  adjustedDurationSeconds: item.durationSeconds,
  totalClimbMeters: item.elevationGainMeters,
  steps: [],
  riskSegments: [],
  warnings: [],
});

const getSafetyColor = (rating: number): string => {
  if (rating >= 4) return safetyColors.safe;
  if (rating >= 3) return safetyColors.caution;
  return safetyColors.danger;
};

export const FeedCard = memo(({ item, isVisible, onLike, onLove, onPress, onUserPress }: FeedCardProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const syntheticRoute = useMemo(() => buildSyntheticRoute(item), [item]);
  const initials = item.user.displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handlePress = useCallback(() => onPress(item.id), [item.id, onPress]);
  const handleLike = useCallback(() => onLike(item.id, item.likedByMe), [item.id, item.likedByMe, onLike]);
  const handleLove = useCallback(() => onLove(item.id, item.lovedByMe ?? false), [item.id, item.lovedByMe, onLove]);
  const handleUserPress = useCallback(() => onUserPress?.(item.user.id), [item.user.id, onUserPress]);
  const handleToggleExpanded = useCallback(() => setExpanded((prev) => !prev), []);

  return (
    <Pressable style={styles.card} onPress={handlePress}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <Pressable
              onPress={onUserPress ? handleUserPress : undefined}
              disabled={!onUserPress}
              accessibilityRole={onUserPress ? 'button' : undefined}
              accessibilityLabel={onUserPress ? `View ${item.user.displayName}'s profile` : undefined}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Text style={styles.displayName} numberOfLines={1}>
                {item.user.displayName}
              </Text>
              {item.user.riderTier && riderTiers[item.user.riderTier as RiderTierKey]?.level >= 3 && (
                <TierPill tier={item.user.riderTier as any} size="sm" />
              )}
              {item.isWeeklyChampion && (
                <Ionicons name="trophy" size={16} color="#D4A843" style={{ marginLeft: 4 }} />
              )}
            </Pressable>
          </View>
          <Text style={styles.timestamp}>{formatRelativeTime(item.sharedAt)}</Text>
        </View>
      </View>

      {/* Map (lazy-loaded) — decorative; the card's title/distance/safety text
          carries all the info a screen reader needs. */}
      <View
        style={styles.mapContainer}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {isVisible ? (
          <RouteMap
            routes={[syntheticRoute]}
            selectedRouteId={item.id}
            showRouteOverlay={false}
            containerStyle={styles.mapInner}
            a11yContext={{ decorative: true }}
          />
        ) : (
          <View style={[styles.mapInner, styles.mapPlaceholder]}>
            <Text style={styles.placeholderText}>Route map</Text>
          </View>
        )}
      </View>

      {/* Title + inline safety pill */}
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        {item.safetyRating != null ? (
          <View style={[styles.safetyPill, { backgroundColor: getSafetyColor(item.safetyRating) }]}>
            <View style={[styles.safetyDot, { backgroundColor: '#FFFFFF' }]} />
            <Text style={styles.safetyPillText}>{item.safetyRating}/5</Text>
          </View>
        ) : null}
      </View>

      {/* Compact summary line */}
      <Text style={styles.summaryLine}>
        {formatDistance(item.distanceMeters)} · {formatDuration(item.durationSeconds)}
        {item.co2SavedKg != null && item.co2SavedKg > 0
          ? ` · ${formatCo2Saved(item.co2SavedKg)} CO2`
          : ''}
      </Text>

      {/* Note */}
      {item.note ? (
        <Pressable
          onPress={handleToggleExpanded}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse note' : 'Expand note'}
        >
          <Text style={styles.note} numberOfLines={expanded ? undefined : 2}>
            {item.note}
          </Text>
          {!expanded && item.note.length > 100 ? (
            <Text style={styles.readMore}>Read more</Text>
          ) : null}
        </Pressable>
      ) : null}

      {/* Action bar */}
      <View style={styles.actionBar}>
        <ReactionBar
          likeCount={item.likeCount}
          loveCount={item.loveCount ?? 0}
          commentCount={item.commentCount}
          likedByMe={item.likedByMe}
          lovedByMe={item.lovedByMe ?? false}
          onLike={handleLike}
          onLove={handleLove}
          onComment={handlePress}
        />
      </View>
    </Pressable>
  );
});

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      borderRadius: radii.xl,
      borderCurve: 'continuous', // Smooth squircle corners on iOS
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgSecondary,
      padding: space[4],
      gap: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    headerText: {
      flex: 1,
      gap: 1,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[1],
    },
    displayName: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '800',
      flexShrink: 1,
    },
    timestamp: {
      color: colors.textSecondary,
      fontSize: textXs.fontSize,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    title: {
      flex: 1,
      color: colors.accent,
      fontSize: textBase.fontSize,
      fontWeight: '900',
      letterSpacing: -0.3,
    },
    safetyPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[1],
      borderRadius: radii.lg,
      paddingHorizontal: space[2],
      paddingVertical: 3,
    },
    safetyDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    safetyPillText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
    },
    summaryLine: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    mapContainer: {
      borderRadius: radii.md,
      overflow: 'hidden',
    },
    mapInner: {
      aspectRatio: 16 / 9,
      maxHeight: 200,
      borderRadius: radii.md,
    },
    mapPlaceholder: {
      backgroundColor: colors.bgTertiary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeholderText: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    note: {
      color: colors.textSecondary,
      fontSize: textSm.fontSize,
      lineHeight: 20,
    },
    readMore: {
      color: colors.accent,
      fontSize: 13,
      fontWeight: '700',
      marginTop: 2,
    },
    actionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      borderTopWidth: 1,
      borderTopColor: colors.borderDefault,
      paddingTop: space[2],
    },
    commentButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[1],
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    commentIcon: {
      fontSize: textLg.fontSize,
    },
    commentCount: {
      fontSize: textSm.fontSize,
      fontWeight: '700',
      color: colors.textSecondary,
    },
  });
