import type {
  FeedComment,
  FeedItem,
  RideActivity,
  RouteOption,
} from '@defensivepedal/core';
import { decodePolyline, formatDistance, formatDuration, formatSpeed } from '@defensivepedal/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNav } from '../src/design-system/organisms/BottomNav';
import { Toast } from '../src/design-system/molecules/Toast';
import { ReportSheet } from '../src/design-system/molecules/ReportSheet';
import { handleTabPress } from '../src/lib/navigation-helpers';

import { LikeButton } from '../src/components/LikeButton';
import { RouteMap } from '../src/components/map';
import { SafetyBadge } from '../src/components/SafetyBadge';
import { SafetyTagChips } from '../src/components/SafetyTagChips';
import {
  useComments,
  useFeedItemFromCache,
  useFeedQuery,
  useLikeToggle,
  usePostComment,
  useProfile,
} from '../src/hooks/useFeed';
import {
  useActivityComments,
  useActivityFeedItemFromCache,
  useActivityFeedQuery,
  useActivityReaction,
  usePostActivityComment,
} from '../src/hooks/useActivityFeed';
import { useBlockUser } from '../src/hooks/useBlockUser';
import { useCurrentLocation } from '../src/hooks/useCurrentLocation';
import { useShareRide } from '../src/hooks/useShareRide';
import { useT } from '../src/hooks/useTranslation';
import { useAuthSessionOptional } from '../src/providers/AuthSessionProvider';
import { useTheme, type ThemeColors } from '../src/design-system';
import { gray } from '../src/design-system/tokens/colors';

// ---------------------------------------------------------------------------
// Schema bridge — RideActivity → FeedItem
// ---------------------------------------------------------------------------
//
// community-trip.tsx was originally written against the trip-share feed
// (FeedItem). The community feed (community-feed.tsx) now displays the
// activity feed (ActivityFeedItem) and navigates here passing an activity
// id. Rather than duplicate the entire render block, we project a
// RideActivity into the FeedItem shape so existing JSX keeps working.
// The reverse direction is not needed — feed → activity navigation
// doesn't exist.

const rideActivityToFeedItem = (activity: RideActivity): FeedItem => ({
  id: activity.id,
  user: {
    id: activity.user.id,
    displayName: activity.user.displayName,
    avatarUrl: activity.user.avatarUrl ?? null,
    ...(activity.user.riderTier ? { riderTier: activity.user.riderTier } : {}),
  },
  title: activity.payload.title,
  startLocationText: activity.payload.startLocationText,
  destinationText: activity.payload.destinationText,
  distanceMeters: activity.payload.distanceMeters,
  durationSeconds: activity.payload.durationSeconds,
  elevationGainMeters: activity.payload.elevationGainMeters,
  averageSpeedMps: activity.payload.averageSpeedMps,
  safetyRating: activity.payload.safetyRating,
  safetyTags: activity.payload.safetyTags,
  geometryPolyline6: activity.payload.geometryPolyline6,
  note: activity.payload.note,
  sharedAt: activity.createdAt,
  likeCount: activity.likeCount,
  loveCount: activity.loveCount,
  co2SavedKg: activity.payload.co2SavedKg,
  commentCount: activity.commentCount,
  likedByMe: activity.likedByMe,
  lovedByMe: activity.lovedByMe,
});

// ---------------------------------------------------------------------------
// Extracted components for list memoization
// ---------------------------------------------------------------------------

interface StatTileProps {
  label: string;
  value: string;
  styles: ReturnType<typeof createThemedStyles>;
}

const StatTile = ({ label, value, styles }: StatTileProps) => (
  <View style={styles.statTile}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

export default function CommunityTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const [commentText, setCommentText] = useState('');

  const location = useCurrentLocation();

  // Two parallel data sources — the screen handles either:
  //   1. ActivityFeedItem (the *active* feed system; community-feed.tsx
  //      navigates here passing an activity-feed row id).
  //   2. FeedItem (the legacy trip-share feed; kept as a fallback in case
  //      something still navigates here with a trip_shares.id).
  // Hooks must be called unconditionally on every render, so we always run
  // both and discriminate downstream by which cache produced the hit.
  const activityCached = useActivityFeedItemFromCache(id ?? null);
  const feedItemCached = useFeedItemFromCache(id ?? null);
  const activityFeedQuery = useActivityFeedQuery(
    location?.location?.lat ?? null,
    location?.location?.lon ?? null,
  );
  const feedQuery = useFeedQuery(
    location?.location?.lat ?? null,
    location?.location?.lon ?? null,
  );

  // Activity-feed comment/reaction stack (used when the id resolves to an
  // ActivityFeedItem — the common case).
  const activityCommentsQuery = useActivityComments(activityCached ? id ?? null : null);
  const postActivityComment = usePostActivityComment();
  const activityReaction = useActivityReaction();
  const profileQuery = useProfile();

  // Legacy trip-share stack (used only if the id resolved to a FeedItem
  // and not an activity).
  const legacyCommentsQuery = useComments(
    !activityCached && feedItemCached ? id ?? null : null,
  );
  const legacyPostComment = usePostComment();
  const legacyLikeToggle = useLikeToggle();

  const shareRide = useShareRide();

  // Compliance plan item 7 — comment moderation. Long-press a comment to
  // open Report / Block. Suppressed for own comments. Hidden state is
  // optimistic + per-screen-instance (no global cache update needed; the
  // server filters blocked-user content on next fetch).
  const authCtx = useAuthSessionOptional();
  const currentUserId = authCtx?.user?.id ?? null;
  const blockMutation = useBlockUser();
  const [reportTargetCommentId, setReportTargetCommentId] = useState<string | null>(null);
  const [hiddenCommentIds, setHiddenCommentIds] = useState<Set<string>>(() => new Set());

  const hideComment = useCallback((commentId: string) => {
    setHiddenCommentIds((prev) => {
      const next = new Set(prev);
      next.add(commentId);
      return next;
    });
  }, []);

  // Project whichever schema we hit into the FeedItem-shaped value the
  // existing render code consumes. RideActivity stores its trip data in
  // `payload`; everything else ActivityFeedItemBase carries directly.
  // Returns undefined when neither cache has the id; the screen branches
  // on that to show a "loading" or "no longer available" state.
  const itemSource: 'activity' | 'feed' | null = activityCached
    ? 'activity'
    : feedItemCached
      ? 'feed'
      : null;

  const item: FeedItem | undefined = useMemo(() => {
    if (activityCached && activityCached.type === 'ride') {
      return rideActivityToFeedItem(activityCached);
    }
    if (feedItemCached) return feedItemCached;
    // Fallback: feedQuery may still be populating on first render with
    // resolved location. Try its current data.
    return feedQuery.data?.pages
      .flatMap((page) => page.items)
      .find((i) => i.id === id);
  }, [activityCached, feedItemCached, feedQuery.data, id]);

  const syntheticRoute: RouteOption | null = useMemo(() => {
    if (!item) return null;
    return {
      id: item.id,
      source: 'custom_osrm' as const,
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
    };
  }, [item]);

  const handleLike = useCallback(() => {
    if (!item || !id) return;
    if (itemSource === 'activity') {
      // active === !liked: useActivityReaction toggles the reaction state
      // by sending the desired final state.
      activityReaction.mutate({ id, type: 'like', active: !item.likedByMe });
    } else {
      legacyLikeToggle.mutate({ id: item.id, liked: item.likedByMe });
    }
  }, [item, id, itemSource, activityReaction, legacyLikeToggle]);

  const handleShare = useCallback(() => {
    if (!item) return;
    // Community trips only expose the encoded polyline; decode it into
    // [lon, lat] coordinate pairs for the share card map background.
    let coords: [number, number][] = [];
    try {
      coords = decodePolyline(item.geometryPolyline6);
    } catch {
      coords = [];
    }
    const distanceKm = item.distanceMeters / 1000;
    const durationMinutes = Math.max(1, Math.round(item.durationSeconds / 60));
    void shareRide.share({
      coords,
      distanceKm,
      durationMinutes,
      // CO2 may be null on older feed records — omit rather than pass 0.
      co2SavedKg: item.co2SavedKg ?? distanceKm * 0.12,
      // safetyRating is 1-5 stars on feed items, not a /100 score, so skip.
      dateIso: item.sharedAt,
      originLabel: item.startLocationText,
      destinationLabel: item.destinationText,
    });
  }, [item, shareRide]);

  const handleSubmitComment = useCallback(() => {
    if (!id || !commentText.trim()) return;
    const onSuccess = () => setCommentText('');
    if (itemSource === 'activity') {
      const profile = profileQuery.data;
      // Fall back to the resolved item's user (the activity row) if profile
      // is still loading — prevents a missing displayName on the optimistic
      // comment row. The server overwrites with the canonical entry on
      // refetch anyway.
      postActivityComment.mutate(
        {
          activityId: id,
          body: commentText.trim(),
          optimisticAuthor: {
            id: profile?.id ?? currentUserId ?? '',
            displayName: profile?.displayName ?? 'You',
            avatarUrl: profile?.avatarUrl ?? null,
          },
        },
        { onSuccess },
      );
    } else {
      legacyPostComment.mutate(
        { tripShareId: id, body: commentText.trim() },
        { onSuccess },
      );
    }
  }, [id, commentText, itemSource, postActivityComment, legacyPostComment, profileQuery.data, currentUserId]);

  const insets = useSafeAreaInsets();

  // Memoized renderItem for FlatList - prevents recreation on every render
  const renderCommentItem = useCallback(
    ({ item: comment }: { item: FeedComment }) => {
      // Optimistic hide after report or block — replaces the row with a small
      // "Hidden" placeholder. Same pattern as ActivityFeedCard.
      if (hiddenCommentIds.has(comment.id)) {
        return (
          <View
            style={styles.commentHiddenRow}
            accessibilityRole="text"
            accessibilityLabel={t('feedCard.hiddenAfterAction')}
          >
            <Ionicons name="eye-off-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.commentHiddenText}>{t('feedCard.hiddenAfterAction')}</Text>
          </View>
        );
      }

      const isOwnComment = currentUserId != null && currentUserId === comment.user.id;

      const handleLongPress = () => {
        if (isOwnComment) return;
        Alert.alert(comment.user.displayName, t('feedCard.moderationMenu'), [
          {
            text: t('feedCard.report'),
            onPress: () => setReportTargetCommentId(comment.id),
          },
          {
            text: t('feedCard.blockUser'),
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                t('feedCard.blockConfirmTitle'),
                t('feedCard.blockConfirmMessage', { name: comment.user.displayName }),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('feedCard.blockUser'),
                    style: 'destructive',
                    onPress: () => {
                      hideComment(comment.id);
                      blockMutation.mutate(comment.user.id, {
                        onError: () => {
                          // Roll back the hide if the server rejected.
                          setHiddenCommentIds((prev) => {
                            const next = new Set(prev);
                            next.delete(comment.id);
                            return next;
                          });
                          Alert.alert(
                            t('feedCard.blockErrorTitle'),
                            t('feedCard.blockErrorMessage'),
                          );
                        },
                      });
                    },
                  },
                ],
              );
            },
          },
          { text: t('common.cancel'), style: 'cancel' },
        ]);
      };

      return (
        <Pressable
          style={styles.commentRow}
          onLongPress={isOwnComment ? undefined : handleLongPress}
          accessibilityHint={isOwnComment ? undefined : t('feedCard.longPressHint')}
        >
          <View style={styles.commentAvatar}>
            <Text style={styles.commentAvatarText}>
              {comment.user.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.commentBody}>
            <Text style={styles.commentUser}>{comment.user.displayName}</Text>
            <Text style={styles.commentText}>{comment.body}</Text>
            <Text style={styles.commentTime}>
              {new Date(comment.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </Pressable>
      );
    },
    [styles, t, colors.textSecondary, currentUserId, blockMutation, hiddenCommentIds, hideComment],
  );

  if (!item) {
    // Two distinct cases:
    //   - one of the feed queries is fetching → genuine loading
    //   - both settled (success or error) and still no match → item is no
    //     longer in any visible feed window (rotated out, deleted, blocked
    //     author, etc.). Don't strand the user; offer a recovery.
    const isStillLoading =
      activityFeedQuery.isPending ||
      activityFeedQuery.isLoading ||
      activityFeedQuery.isFetching ||
      feedQuery.isPending ||
      feedQuery.isLoading ||
      feedQuery.isFetching;
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {isStillLoading ? (
          <Text style={styles.loadingText}>Loading trip details...</Text>
        ) : (
          <View style={styles.notFoundBlock}>
            <Text style={styles.loadingText}>This trip is no longer available.</Text>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backText}>{'←'} Back to feed</Text>
            </Pressable>
          </View>
        )}
        <BottomNav activeTab="community" onTabPress={handleTabPress} />
      </View>
    );
  }

  // Pick the comments + post-comment hook output for the active source.
  // Whichever query was disabled (its `enabled` flag is null) returns
  // `undefined` data and an idle status, so this is safe.
  const commentsQuery =
    itemSource === 'activity' ? activityCommentsQuery : legacyCommentsQuery;
  const postComment =
    itemSource === 'activity' ? postActivityComment : legacyPostComment;
  const comments = commentsQuery.data?.comments ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <FlatList
        data={comments}
        keyExtractor={(comment) => comment.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            {/* Top bar: back + share */}
            <View style={styles.topBar}>
              <Pressable style={styles.backButton} onPress={() => router.back()}>
                <Text style={styles.backText}>{'\u2190'} Back to feed</Text>
              </Pressable>
              <Pressable
                style={styles.shareButton}
                onPress={handleShare}
                disabled={shareRide.isSharing}
                accessibilityRole="button"
                accessibilityLabel={t('share.shareRide')}
                hitSlop={10}
              >
                <Ionicons
                  name="share-social-outline"
                  size={20}
                  color={shareRide.isSharing ? gray[500] : colors.accent}
                />
              </Pressable>
            </View>

            {/* Map — decorative; the surrounding card text (title, user,
                safety, distance) carries all the info for screen readers. */}
            {syntheticRoute ? (
              <RouteMap
                routes={[syntheticRoute]}
                selectedRouteId={item.id}
                showRouteOverlay={false}
                containerStyle={styles.map}
                a11yContext={{ decorative: true }}
              />
            ) : null}

            {/* Title + user */}
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.userLine}>
              by {item.user.displayName} {'\u00B7'}{' '}
              {new Date(item.sharedAt).toLocaleDateString()}
            </Text>

            {/* Safety */}
            <SafetyBadge rating={item.safetyRating} />
            <SafetyTagChips tags={item.safetyTags} />

            {/* Stats grid */}
            <View style={styles.statsGrid}>
              <StatTile label="Distance" value={formatDistance(item.distanceMeters)} styles={styles} />
              <StatTile label="Duration" value={formatDuration(item.durationSeconds)} styles={styles} />
              {item.elevationGainMeters != null ? (
                <StatTile label="Climb" value={`${Math.round(item.elevationGainMeters)} m`} styles={styles} />
              ) : null}
              {item.averageSpeedMps != null ? (
                <StatTile label="Avg speed" value={formatSpeed(item.averageSpeedMps) ?? '-'} styles={styles} />
              ) : null}
            </View>

            {/* Note */}
            {item.note ? <Text style={styles.note}>{item.note}</Text> : null}

            {/* Like */}
            <View style={styles.likeRow}>
              <LikeButton liked={item.likedByMe} count={item.likeCount} onPress={handleLike} />
            </View>

            {/* Comments header */}
            <Text style={styles.commentsHeader}>
              Comments {comments.length > 0 ? `(${comments.length})` : ''}
            </Text>
          </>
        }
        renderItem={renderCommentItem}
        ListEmptyComponent={
          <Text style={styles.noComments}>
            {commentsQuery.isLoading ? 'Loading comments...' : 'No comments yet. Be the first!'}
          </Text>
        }
      />

      {/* Comment input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Add a comment..."
          placeholderTextColor={colors.textSecondary}
          value={commentText}
          onChangeText={setCommentText}
          multiline
        />
        <Pressable
          style={[styles.sendButton, !commentText.trim() ? styles.sendButtonDisabled : null]}
          disabled={!commentText.trim() || postComment.isPending}
          onPress={handleSubmitComment}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
    <BottomNav activeTab="community" onTabPress={handleTabPress} />
    {shareRide.toastMessage ? (
      <View style={styles.shareToastContainer} pointerEvents="box-none">
        <Toast
          message={shareRide.toastMessage}
          variant="warning"
          onDismiss={shareRide.consumeToast}
        />
      </View>
    ) : null}
    <ReportSheet
      visible={reportTargetCommentId !== null}
      onClose={() => setReportTargetCommentId(null)}
      targetType="comment"
      targetId={reportTargetCommentId ?? ''}
      onReported={() => {
        if (reportTargetCommentId) hideComment(reportTargetCommentId);
        setReportTargetCommentId(null);
      }}
    />
    </View>
  );
}

const createThemedStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDeep,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 80,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 60,
  },
  notFoundBlock: {
    alignItems: 'center',
    gap: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    paddingVertical: 8,
  },
  backText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  shareButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  shareToastContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 80,
    alignItems: 'center',
  },
  map: {
    height: 260,
    borderRadius: 28,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  userLine: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statTile: {
    minWidth: 100,
    flexGrow: 1,
    borderRadius: 20,
    backgroundColor: colors.bgTertiary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
  },
  note: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  likeRow: {
    flexDirection: 'row',
  },
  commentsHeader: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
    paddingTop: 14,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
  },
  commentAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.bgTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  commentBody: {
    flex: 1,
    gap: 2,
  },
  commentUser: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  commentText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  commentTime: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  commentHiddenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.bgSecondary,
  },
  commentHiddenText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontStyle: 'italic',
  },
  noComments: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
    backgroundColor: colors.bgSecondary,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgTertiary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
  },
  sendButton: {
    borderRadius: 20,
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  sendButtonDisabled: {
    backgroundColor: gray[400],
  },
  sendButtonText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '800',
  },
});
