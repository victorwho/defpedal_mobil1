/**
 * Design System — ActivityFeedCard Organism
 *
 * Main renderer for the social network activity feed.
 * Switches on item.type to render the appropriate card variant:
 *   - ride         -> Route map, distance, duration, safety rating
 *   - hazard_batch -> "N hazards during their ride" + hazard type list
 *   - hazard_standalone -> "reported a [hazard type]" + location
 *   - tier_up      -> Tier mascot + "reached [Tier Name]!" celebration
 *   - badge_unlock -> Badge icon + "earned [Badge Name]" + category + flavor
 *
 * All card types include:
 *   - User header (avatar, display name, tier pill, timestamp)
 *   - ReactionBar (like/love) + comment count
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type {
  ActivityFeedItem,
  RideActivity,
  HazardBatchActivity,
  HazardStandaloneActivity,
  TierUpActivity,
  BadgeUnlockActivity,
  HazardType,
  RouteOption,
  RiderTierName,
} from '@defensivepedal/core';
import { formatDistance, formatDuration, formatCo2Saved, HAZARD_TYPE_OPTIONS } from '@defensivepedal/core';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { TierPill } from '../atoms/TierPill';
import { BadgeIcon } from '../atoms/BadgeIcon';
import { ReactionBar } from '../../components/LikeButton';
import { RouteMap } from '../../components/map';
import { riderTiers, type RiderTierKey } from '../tokens/tierColors';
import { tierImages } from '../tokens/tierImages';
import { safetyColors } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm, textXs } from '../tokens/typography';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivityFeedCardProps {
  item: ActivityFeedItem;
  onReact: (id: string, type: 'like' | 'love', active: boolean) => void;
  onComment: (id: string) => void;
  onUserPress: (userId: string) => void;
  /** Invoked when the user taps the card-level share icon. Only rendered when set. */
  onSharePress?: (item: ActivityFeedItem) => void;
  /** Whether the card is visible in viewport (for lazy map loading) */
  isVisible?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const getInitials = (name: string): string =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const getHazardLabel = (type: HazardType): string =>
  HAZARD_TYPE_OPTIONS.find((opt) => opt.value === type)?.label ?? 'Hazard';

const HAZARD_ICONS: Record<HazardType, string> = {
  illegally_parked_car: 'car-outline',
  blocked_bike_lane: 'close-circle-outline',
  missing_bike_lane: 'remove-circle-outline',
  pothole: 'alert-circle-outline',
  poor_surface: 'warning-outline',
  narrow_street: 'resize-outline',
  dangerous_intersection: 'git-branch-outline',
  construction: 'construct-outline',
  aggressive_traffic: 'speedometer-outline',
  other: 'help-circle-outline',
};

const getSafetyColor = (rating: number): string => {
  if (rating >= 4) return safetyColors.safe;
  if (rating >= 3) return safetyColors.caution;
  return safetyColors.danger;
};

const buildSyntheticRoute = (item: RideActivity): RouteOption => ({
  id: item.id,
  source: 'custom_osrm',
  routingEngineVersion: '',
  routingProfileVersion: '',
  mapDataVersion: '',
  riskModelVersion: '',
  geometryPolyline6: item.payload.geometryPolyline6,
  distanceMeters: item.payload.distanceMeters,
  durationSeconds: item.payload.durationSeconds,
  adjustedDurationSeconds: item.payload.durationSeconds,
  totalClimbMeters: item.payload.elevationGainMeters,
  steps: [],
  riskSegments: [],
  warnings: [],
});

// Map badge category to a BadgeTier for BadgeIcon display
const BADGE_TIER_MAP: Record<string, 'bronze' | 'silver' | 'gold'> = {
  firsts: 'gold',
  riding: 'silver',
  consistency: 'bronze',
  impact: 'gold',
  safety: 'silver',
  community: 'bronze',
  explore: 'silver',
  events: 'gold',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ActivityFeedCard = React.memo(function ActivityFeedCard({
  item,
  onReact,
  onComment,
  onUserPress,
  onSharePress,
  isVisible = true,
}: ActivityFeedCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);

  const initials = useMemo(
    () => getInitials(item.user.displayName),
    [item.user.displayName],
  );

  const handleLike = useCallback(
    () => onReact(item.id, 'like', item.likedByMe),
    [item.id, item.likedByMe, onReact],
  );
  const handleLove = useCallback(
    () => onReact(item.id, 'love', item.lovedByMe),
    [item.id, item.lovedByMe, onReact],
  );
  const handleComment = useCallback(
    () => onComment(item.id),
    [item.id, onComment],
  );
  const handleUserPress = useCallback(
    () => onUserPress(item.user.id),
    [item.user.id, onUserPress],
  );
  const handleSharePress = useCallback(
    () => onSharePress?.(item),
    [item, onSharePress],
  );
  const canShare = onSharePress != null && item.type === 'ride';

  return (
    <View style={styles.card}>
      {/* User header */}
      <CardHeader
        displayName={item.user.displayName}
        riderTier={item.user.riderTier}
        timestamp={item.createdAt}
        initials={initials}
        onUserPress={handleUserPress}
        styles={styles}
        colors={colors}
      />

      {/* Type-specific content */}
      {item.type === 'ride' && (
        <RideContent item={item} isVisible={isVisible} styles={styles} colors={colors} />
      )}
      {item.type === 'hazard_batch' && (
        <HazardBatchContent item={item} styles={styles} colors={colors} />
      )}
      {item.type === 'hazard_standalone' && (
        <HazardStandaloneContent item={item} styles={styles} colors={colors} />
      )}
      {item.type === 'tier_up' && (
        <TierUpContent item={item} styles={styles} colors={colors} />
      )}
      {item.type === 'badge_unlock' && (
        <BadgeUnlockContent item={item} styles={styles} colors={colors} />
      )}
      {item.type === 'route_share_signup' && (
        <RouteShareSignupContent styles={styles} colors={colors} />
      )}

      {/* Reaction bar */}
      <View style={styles.actionBar}>
        <View style={styles.reactionBarWrap}>
          <ReactionBar
            likeCount={item.likeCount}
            loveCount={item.loveCount}
            commentCount={item.commentCount}
            likedByMe={item.likedByMe}
            lovedByMe={item.lovedByMe}
            onLike={handleLike}
            onLove={handleLove}
            onComment={handleComment}
          />
        </View>
        {canShare && (
          <Pressable
            onPress={handleSharePress}
            accessibilityRole="button"
            accessibilityLabel="Share this ride"
            hitSlop={8}
            style={styles.shareButton}
          >
            <Ionicons name="share-social-outline" size={20} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// CardHeader sub-component
// ---------------------------------------------------------------------------

interface CardHeaderProps {
  displayName: string;
  riderTier?: RiderTierName;
  timestamp: string;
  initials: string;
  onUserPress: () => void;
  styles: ReturnType<typeof createThemedStyles>;
  colors: ThemeColors;
}

const CardHeader = React.memo(function CardHeader({
  displayName,
  riderTier,
  timestamp,
  initials,
  onUserPress,
  styles,
}: CardHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.headerText}>
        <View style={styles.nameRow}>
          <Pressable
            onPress={onUserPress}
            accessibilityRole="button"
            accessibilityLabel={`View ${displayName}'s profile`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Text style={styles.displayName} numberOfLines={1}>
              {displayName}
            </Text>
            {riderTier && riderTiers[riderTier as RiderTierKey]?.level >= 3 && (
              <TierPill tier={riderTier} size="sm" />
            )}
          </Pressable>
        </View>
        <Text style={styles.timestamp}>{formatRelativeTime(timestamp)}</Text>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// RideContent sub-component
// ---------------------------------------------------------------------------

interface RideContentProps {
  item: RideActivity;
  isVisible: boolean;
  styles: ReturnType<typeof createThemedStyles>;
  colors: ThemeColors;
}

const RideContent = React.memo(function RideContent({
  item,
  isVisible,
  styles,
  colors,
}: RideContentProps) {
  const syntheticRoute = useMemo(() => buildSyntheticRoute(item), [item]);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const toggleNote = useCallback(() => setNoteExpanded((prev) => !prev), []);
  const { payload } = item;

  return (
    <>
      {/* Map */}
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

      {/* Title + safety pill */}
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={1}>
          {payload.title ?? `${payload.startLocationText} to ${payload.destinationText}`}
        </Text>
        {payload.safetyRating != null && (
          <View style={[styles.safetyPill, { backgroundColor: getSafetyColor(payload.safetyRating) }]}>
            <View style={styles.safetyDot} />
            <Text style={styles.safetyPillText}>{payload.safetyRating}/5</Text>
          </View>
        )}
      </View>

      {/* Summary line */}
      <Text style={styles.summaryLine}>
        {formatDistance(payload.distanceMeters)} · {formatDuration(payload.durationSeconds)}
        {payload.co2SavedKg != null && payload.co2SavedKg > 0
          ? ` · ${formatCo2Saved(payload.co2SavedKg)} CO2`
          : ''}
      </Text>

      {/* Note */}
      {payload.note ? (
        <Pressable
          onPress={toggleNote}
          accessibilityRole="button"
          accessibilityLabel={noteExpanded ? 'Collapse note' : 'Expand note'}
        >
          <Text style={styles.note} numberOfLines={noteExpanded ? undefined : 2}>
            {payload.note}
          </Text>
          {!noteExpanded && payload.note.length > 100 ? (
            <Text style={styles.readMore}>Read more</Text>
          ) : null}
        </Pressable>
      ) : null}
    </>
  );
});

// ---------------------------------------------------------------------------
// HazardBatchContent sub-component
// ---------------------------------------------------------------------------

interface HazardBatchContentProps {
  item: HazardBatchActivity;
  styles: ReturnType<typeof createThemedStyles>;
  colors: ThemeColors;
}

const HazardBatchContent = React.memo(function HazardBatchContent({
  item,
  styles,
  colors,
}: HazardBatchContentProps) {
  const { payload } = item;
  const count = payload.hazards.length;

  return (
    <>
      <View style={styles.contentRow}>
        <Ionicons name="warning" size={20} color={safetyColors.caution} />
        <Text style={styles.contentText}>
          Reported {count} hazard{count !== 1 ? 's' : ''} during their ride
        </Text>
      </View>

      {/* Hazard type list */}
      <View style={styles.hazardList}>
        {payload.hazards.map((h, idx) => (
          <View key={`${h.hazardType}-${idx}`} style={styles.hazardChip}>
            <Ionicons
              name={(HAZARD_ICONS[h.hazardType] ?? 'help-circle-outline') as any}
              size={14}
              color={colors.textSecondary}
            />
            <Text style={styles.hazardChipText}>{getHazardLabel(h.hazardType)}</Text>
          </View>
        ))}
      </View>
    </>
  );
});

// ---------------------------------------------------------------------------
// HazardStandaloneContent sub-component
// ---------------------------------------------------------------------------

interface HazardStandaloneContentProps {
  item: HazardStandaloneActivity;
  styles: ReturnType<typeof createThemedStyles>;
  colors: ThemeColors;
}

const HazardStandaloneContent = React.memo(function HazardStandaloneContent({
  item,
  styles,
  colors,
}: HazardStandaloneContentProps) {
  const { payload } = item;

  return (
    <View style={styles.contentRow}>
      <Ionicons
        name={(HAZARD_ICONS[payload.hazardType] ?? 'help-circle-outline') as any}
        size={24}
        color={safetyColors.caution}
      />
      <View style={styles.contentTextGroup}>
        <Text style={styles.contentText}>
          Reported a {getHazardLabel(payload.hazardType).toLowerCase()}
        </Text>
        <Text style={styles.contentSubtext} numberOfLines={1}>
          {payload.lat.toFixed(4)}, {payload.lon.toFixed(4)}
        </Text>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// TierUpContent sub-component
// ---------------------------------------------------------------------------

interface TierUpContentProps {
  item: TierUpActivity;
  styles: ReturnType<typeof createThemedStyles>;
  colors: ThemeColors;
}

const TierUpContent = React.memo(function TierUpContent({
  item,
  styles,
}: TierUpContentProps) {
  const { payload } = item;
  const tierKey = payload.tierName as RiderTierKey;
  const mascotImage = tierImages[tierKey];
  const tierDef = riderTiers[tierKey];

  return (
    <View style={[styles.celebrationContainer, { borderColor: payload.tierColor }]}>
      {mascotImage && (
        <Image
          source={mascotImage}
          style={styles.tierMascot}
          resizeMode="contain"
          accessibilityLabel={`${payload.tierDisplayName} tier mascot`}
        />
      )}
      <View style={styles.celebrationText}>
        <Text style={[styles.tierUpTitle, { color: payload.tierColor }]}>
          Reached {payload.tierDisplayName}!
        </Text>
        {tierDef && (
          <TierPill tier={payload.tierName} size="md" />
        )}
        <Text style={styles.tierUpSubtext}>
          Level {payload.tierLevel} rider
        </Text>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// BadgeUnlockContent sub-component
// ---------------------------------------------------------------------------

interface BadgeUnlockContentProps {
  item: BadgeUnlockActivity;
  styles: ReturnType<typeof createThemedStyles>;
  colors: ThemeColors;
}

const BadgeUnlockContent = React.memo(function BadgeUnlockContent({
  item,
  styles,
  colors,
}: BadgeUnlockContentProps) {
  const { payload } = item;
  const badgeTier = BADGE_TIER_MAP[payload.category] ?? 'bronze';

  return (
    <View style={styles.badgeContainer}>
      <BadgeIcon
        badgeKey={payload.badgeKey}
        tier={badgeTier}
        size="md"
      />
      <View style={styles.badgeInfo}>
        <Text style={styles.badgeTitle}>
          Earned {payload.badgeName}
        </Text>
        <View style={styles.badgeCategoryChip}>
          <Text style={styles.badgeCategoryText}>
            {payload.category.charAt(0).toUpperCase() + payload.category.slice(1)}
          </Text>
        </View>
        <Text style={styles.badgeFlavor} numberOfLines={2}>
          {payload.flavorText}
        </Text>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Route Share Signup content (Slice 8)
//
// Minimal card — just icon + message. The trimmed polyline payload is
// available but a full mini-map preview would add weight; slice 8c can
// layer that in if conversion CTR warrants it.
// ---------------------------------------------------------------------------

interface RouteShareSignupContentProps {
  styles: ReturnType<typeof createThemedStyles>;
  colors: ThemeColors;
}

const RouteShareSignupContent = React.memo(function RouteShareSignupContent({
  styles,
  colors,
}: RouteShareSignupContentProps) {
  return (
    <View style={styles.routeShareSignupContainer}>
      <Ionicons name="share-social" size={20} color={colors.accent} />
      <Text style={styles.routeShareSignupText}>
        Someone signed up via a shared route.
      </Text>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      borderRadius: radii.xl,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgSecondary,
      padding: space[4],
      gap: 10,
    },

    // Header
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
      color: colors.textInverse,
      fontSize: 13,
      fontFamily: fontFamily.heading.bold,
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
      fontFamily: fontFamily.body.bold,
      flexShrink: 1,
    },
    timestamp: {
      color: colors.textSecondary,
      fontSize: textXs.fontSize,
    },

    // Ride content
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
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    title: {
      flex: 1,
      color: colors.accent,
      fontSize: textBase.fontSize,
      fontFamily: fontFamily.heading.bold,
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
      backgroundColor: '#FFFFFF',
    },
    safetyPillText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontFamily: fontFamily.body.bold,
    },
    summaryLine: {
      color: colors.textSecondary,
      fontSize: 13,
      fontFamily: fontFamily.body.semiBold,
    },
    note: {
      color: colors.textSecondary,
      fontSize: textSm.fontSize,
      lineHeight: 20,
    },
    readMore: {
      color: colors.accent,
      fontSize: 13,
      fontFamily: fontFamily.body.bold,
      marginTop: 2,
    },

    // Hazard content
    contentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingVertical: space[2],
    },
    contentText: {
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: fontFamily.body.semiBold,
      flex: 1,
    },
    contentTextGroup: {
      flex: 1,
      gap: 2,
    },
    contentSubtext: {
      color: colors.textSecondary,
      fontSize: textXs.fontSize,
      fontFamily: fontFamily.mono.medium,
    },
    hazardList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[2],
    },
    hazardChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[1],
      paddingHorizontal: space[2],
      paddingVertical: 4,
      borderRadius: radii.full,
      backgroundColor: colors.bgTertiary,
    },
    hazardChipText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontFamily: fontFamily.body.medium,
    },

    // Tier up content
    celebrationContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[4],
      paddingVertical: space[3],
      paddingHorizontal: space[3],
      borderRadius: radii.lg,
      borderWidth: 1,
      backgroundColor: colors.bgTertiary,
    },
    tierMascot: {
      width: 64,
      height: 64,
    },
    celebrationText: {
      flex: 1,
      gap: space[1],
    },
    tierUpTitle: {
      fontSize: 18,
      fontFamily: fontFamily.heading.bold,
    },
    tierUpSubtext: {
      color: colors.textSecondary,
      fontSize: textSm.fontSize,
      fontFamily: fontFamily.body.medium,
    },

    // Badge unlock content
    badgeContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingVertical: space[2],
    },
    badgeInfo: {
      flex: 1,
      gap: space[1],
    },
    badgeTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: fontFamily.body.semiBold,
    },
    badgeCategoryChip: {
      alignSelf: 'flex-start',
      paddingHorizontal: space[2],
      paddingVertical: 2,
      borderRadius: radii.full,
      backgroundColor: colors.bgTertiary,
    },
    badgeCategoryText: {
      color: colors.textSecondary,
      fontSize: 11,
      fontFamily: fontFamily.body.medium,
    },
    badgeFlavor: {
      color: colors.textMuted,
      fontSize: textSm.fontSize,
      fontFamily: fontFamily.body.regular,
      fontStyle: 'italic',
    },

    // Route Share Signup (Slice 8)
    routeShareSignupContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      paddingVertical: space[1],
    },
    routeShareSignupText: {
      color: colors.textPrimary,
      fontSize: textBase.fontSize,
      fontFamily: fontFamily.body.medium,
      flex: 1,
    },

    // Action bar
    actionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      borderTopWidth: 1,
      borderTopColor: colors.borderDefault,
      paddingTop: space[2],
    },
    reactionBarWrap: {
      flex: 1,
    },
    shareButton: {
      padding: space[2],
      borderRadius: radii.full,
    },
  });
