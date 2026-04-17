import type { FeedComment, FeedItem, RouteOption } from '@defensivepedal/core';
import { decodePolyline, formatDistance, formatDuration, formatSpeed } from '@defensivepedal/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
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
import { handleTabPress } from '../src/lib/navigation-helpers';

import { LikeButton } from '../src/components/LikeButton';
import { RouteMap } from '../src/components/map';
import { SafetyBadge } from '../src/components/SafetyBadge';
import { SafetyTagChips } from '../src/components/SafetyTagChips';
import {
  useComments,
  useFeedQuery,
  useLikeToggle,
  usePostComment,
} from '../src/hooks/useFeed';
import { useCurrentLocation } from '../src/hooks/useCurrentLocation';
import { useShareRide } from '../src/hooks/useShareRide';
import { useT } from '../src/hooks/useTranslation';
import { useTheme, type ThemeColors } from '../src/design-system';
import { gray } from '../src/design-system/tokens/colors';

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
  const feedQuery = useFeedQuery(location?.location?.lat ?? null, location?.location?.lon ?? null);
  const likeToggle = useLikeToggle();
  const commentsQuery = useComments(id ?? null);
  const postComment = usePostComment();
  const shareRide = useShareRide();

  // Find the item from the feed cache
  const item: FeedItem | undefined = useMemo(
    () =>
      feedQuery.data?.pages
        .flatMap((page) => page.items)
        .find((i) => i.id === id),
    [feedQuery.data, id],
  );

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
    if (item) {
      likeToggle.mutate({ id: item.id, liked: item.likedByMe });
    }
  }, [item, likeToggle]);

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
    postComment.mutate(
      { tripShareId: id, body: commentText.trim() },
      { onSuccess: () => setCommentText('') },
    );
  }, [id, commentText, postComment]);

  const insets = useSafeAreaInsets();

  // Memoized renderItem for FlatList - prevents recreation on every render
  const renderCommentItem = useCallback(
    ({ item: comment }: { item: FeedComment }) => (
      <View style={styles.commentRow}>
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
      </View>
    ),
    [styles],
  );

  if (!item) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.loadingText}>Loading trip details...</Text>
        <BottomNav activeTab="community" onTabPress={handleTabPress} />
      </View>
    );
  }

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

            {/* Map */}
            {syntheticRoute ? (
              <RouteMap
                routes={[syntheticRoute]}
                selectedRouteId={item.id}
                showRouteOverlay={false}
                containerStyle={styles.map}
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
