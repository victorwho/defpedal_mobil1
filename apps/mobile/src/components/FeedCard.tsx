import type { FeedItem, RouteOption } from '@defensivepedal/core';
import { formatCo2Saved, formatDistance, formatDuration } from '@defensivepedal/core';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { brandColors, safetyColors } from '../design-system/tokens/colors';
import { radii } from '../design-system/tokens/radii';
import { surfaceTints } from '../design-system/tokens/tints';
import { ReactionBar } from './LikeButton';
import { RouteMap } from './map';
import { SafetyBadge } from './SafetyBadge';
import { SafetyTagChips } from './SafetyTagChips';

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

export const FeedCard = ({ item, isVisible, onLike, onLove, onPress, onUserPress }: FeedCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const syntheticRoute = buildSyntheticRoute(item);
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
            >
              <Text style={styles.displayName} numberOfLines={1}>
                {item.user.displayName}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.timestamp}>{formatRelativeTime(item.sharedAt)}</Text>
        </View>
      </View>

      {/* Title */}
      <Text style={styles.title} numberOfLines={2}>
        {item.title}
      </Text>

      {/* Map (lazy-loaded) */}
      <View style={styles.mapContainer}>
        {isVisible ? (
          <RouteMap
            routes={[syntheticRoute]}
            selectedRouteId={item.id}
            showRouteOverlay={false}
            containerStyle={styles.mapInner}
          />
        ) : (
          <View style={[styles.mapInner, styles.mapPlaceholder]}>
            <Text style={styles.placeholderText}>Route map</Text>
          </View>
        )}
      </View>

      {/* Safety badge + tags */}
      <SafetyBadge rating={item.safetyRating} />
      <SafetyTagChips tags={item.safetyTags} />

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Distance</Text>
          <Text style={styles.statValue}>{formatDistance(item.distanceMeters)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Duration</Text>
          <Text style={styles.statValue}>{formatDuration(item.durationSeconds)}</Text>
        </View>
        {item.elevationGainMeters != null ? (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Climb</Text>
            <Text style={styles.statValue}>{Math.round(item.elevationGainMeters)} m</Text>
          </View>
        ) : null}
        {item.co2SavedKg != null && item.co2SavedKg > 0 ? (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>CO2 Saved</Text>
            <Text style={[styles.statValue, { color: safetyColors.safe }]}>{formatCo2Saved(item.co2SavedKg)}</Text>
          </View>
        ) : null}
      </View>

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
};

/** Muted text for dark background — slightly lighter than textSecondary for readability */
const TEXT_ON_DARK_MUTED = '#cbd5e1';

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    backgroundColor: brandColors.bgSecondary,
    padding: 16,
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
    backgroundColor: brandColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: brandColors.textPrimary,
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
    gap: 4,
  },
  displayName: {
    color: brandColors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
  },
  timestamp: {
    color: TEXT_ON_DARK_MUTED,
    fontSize: 12,
  },
  title: {
    color: brandColors.accent,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.3,
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
    backgroundColor: brandColors.bgTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: TEXT_ON_DARK_MUTED,
    fontSize: 13,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stat: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: surfaceTints.overlaySubtle,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  statLabel: {
    color: TEXT_ON_DARK_MUTED,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statValue: {
    color: brandColors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  note: {
    color: TEXT_ON_DARK_MUTED,
    fontSize: 14,
    lineHeight: 20,
  },
  readMore: {
    color: brandColors.accent,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: brandColors.borderDefault,
    paddingTop: 8,
  },
  commentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  commentIcon: {
    fontSize: 18,
  },
  commentCount: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT_ON_DARK_MUTED,
  },
});
