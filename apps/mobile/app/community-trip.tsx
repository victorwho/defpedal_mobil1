import type { FeedItem, RouteOption } from '@defensivepedal/core';
import { formatDistance, formatDuration, formatSpeed } from '@defensivepedal/core';
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
import { mobileTheme } from '../src/lib/theme';

export default function CommunityTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [commentText, setCommentText] = useState('');

  const location = useCurrentLocation();
  const feedQuery = useFeedQuery(location?.location?.lat ?? null, location?.location?.lon ?? null);
  const likeToggle = useLikeToggle();
  const commentsQuery = useComments(id ?? null);
  const postComment = usePostComment();

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

  const handleSubmitComment = useCallback(() => {
    if (!id || !commentText.trim()) return;
    postComment.mutate(
      { tripShareId: id, body: commentText.trim() },
      { onSuccess: () => setCommentText('') },
    );
  }, [id, commentText, postComment]);

  const insets = useSafeAreaInsets();

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
            {/* Back button */}
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backText}>{'\u2190'} Back to feed</Text>
            </Pressable>

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
              <StatTile label="Distance" value={formatDistance(item.distanceMeters)} />
              <StatTile label="Duration" value={formatDuration(item.durationSeconds)} />
              {item.elevationGainMeters != null ? (
                <StatTile label="Climb" value={`${Math.round(item.elevationGainMeters)} m`} />
              ) : null}
              {item.averageSpeedMps != null ? (
                <StatTile label="Avg speed" value={formatSpeed(item.averageSpeedMps) ?? '-'} />
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
        renderItem={({ item: comment }) => (
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
        )}
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
          placeholderTextColor={mobileTheme.colors.textOnDarkMuted}
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
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: mobileTheme.colors.background,
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
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 60,
  },
  backButton: {
    paddingVertical: 8,
  },
  backText: {
    color: mobileTheme.colors.brand,
    fontSize: 15,
    fontWeight: '700',
  },
  map: {
    height: 260,
    borderRadius: mobileTheme.radii.lg,
  },
  title: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  userLine: {
    color: mobileTheme.colors.textOnDarkMuted,
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
    borderRadius: mobileTheme.radii.md,
    backgroundColor: mobileTheme.colors.backgroundPanelSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  statLabel: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statValue: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 17,
    fontWeight: '900',
  },
  note: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  likeRow: {
    flexDirection: 'row',
  },
  commentsHeader: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 18,
    fontWeight: '900',
    borderTopWidth: 1,
    borderTopColor: mobileTheme.colors.border,
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
    backgroundColor: mobileTheme.colors.backgroundPanelSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 13,
    fontWeight: '800',
  },
  commentBody: {
    flex: 1,
    gap: 2,
  },
  commentUser: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 13,
    fontWeight: '800',
  },
  commentText: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  commentTime: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 11,
  },
  noComments: {
    color: mobileTheme.colors.textOnDarkMuted,
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
    borderTopColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.backgroundPanel,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.backgroundPanelSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: mobileTheme.colors.textOnDark,
    fontSize: 14,
  },
  sendButton: {
    borderRadius: 20,
    backgroundColor: mobileTheme.colors.brand,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#8f9bad',
  },
  sendButtonText: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
});
