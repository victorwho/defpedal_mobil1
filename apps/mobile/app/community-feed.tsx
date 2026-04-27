import type { ActivityFeedItem } from '@defensivepedal/core';
import { decodePolyline } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Ionicons from '@expo/vector-icons/Ionicons';

import { FadeSlideIn } from '../src/design-system/atoms/FadeSlideIn';
import { BottomNav } from '../src/design-system/organisms/BottomNav';
import { ActivityFeedCard } from '../src/design-system/organisms/ActivityFeedCard';
import { SuggestedUsersRow } from '../src/design-system/organisms/SuggestedUsersRow';
import { Toast } from '../src/design-system/molecules/Toast';
import { useTheme, type ThemeColors } from '../src/design-system';
import { handleTabPress } from '../src/lib/navigation-helpers';
import { useCurrentLocation } from '../src/hooks/useCurrentLocation';
import { useActivityFeedQuery, useActivityReaction } from '../src/hooks/useActivityFeed';
import { useSuggestedUsers, useFollowUser } from '../src/hooks/useFollow';
import { useShareRide } from '../src/hooks/useShareRide';
import { useT } from '../src/hooks/useTranslation';
import { useAuthSession } from '../src/providers/AuthSessionProvider';

// ---------------------------------------------------------------------------
// Merged list item type: either a feed item or a "suggested users" separator
// ---------------------------------------------------------------------------

type MergedItem =
  | { kind: 'activity'; data: ActivityFeedItem }
  | { kind: 'suggested'; key: string };

export default function CommunityFeedScreen() {
  const t = useT();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const {
    location: currentLocation,
    permissionStatus,
    isLoading: isLocating,
    error: locationError,
    refreshLocation,
  } = useCurrentLocation();
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();
  const currentUserId = user?.id ?? null;
  const lat = currentLocation?.lat ?? null;
  const lon = currentLocation?.lon ?? null;

  const {
    data,
    isLoading,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isRefetching,
  } = useActivityFeedQuery(lat, lon);

  const reaction = useActivityReaction();
  const followUser = useFollowUser();
  const shareRide = useShareRide();
  const { data: suggestedData } = useSuggestedUsers(lat, lon);
  const suggestedUsers = suggestedData?.users ?? [];

  // Track visible items for lazy map loading
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      setVisibleIds(
        new Set(
          viewableItems
            .map((v) => {
              const merged = v.item as MergedItem;
              return merged.kind === 'activity' ? merged.data.id : undefined;
            })
            .filter(Boolean) as string[],
        ),
      );
    },
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 }).current;

  // Flatten activity items from paginated response
  const activityItems = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data?.pages],
  );

  // Merge activity items with "suggested users" separators every 10 items
  const mergedItems: readonly MergedItem[] = useMemo(() => {
    const result: MergedItem[] = [];
    for (let i = 0; i < activityItems.length; i++) {
      result.push({ kind: 'activity', data: activityItems[i] });
      // Insert suggested users row after every 10th activity item
      if ((i + 1) % 10 === 0 && suggestedUsers.length > 0) {
        result.push({ kind: 'suggested', key: `suggested-${i}` });
      }
    }
    return result;
  }, [activityItems, suggestedUsers.length]);

  const handleReact = useCallback(
    (id: string, type: 'like' | 'love', active: boolean) => {
      reaction.mutate({ id, type, active });
    },
    [reaction],
  );

  const handleComment = useCallback((id: string) => {
    router.push({ pathname: '/community-trip', params: { id } });
  }, []);

  const handleUserPress = useCallback((userId: string) => {
    router.push(`/user-profile?id=${userId}` as any);
  }, []);

  const handleFollow = useCallback(
    (userId: string) => {
      followUser.mutate(userId);
    },
    [followUser],
  );

  const handleSharePress = useCallback(
    (item: ActivityFeedItem) => {
      if (item.type !== 'ride') return;
      let coords: [number, number][] = [];
      try {
        coords = decodePolyline(item.payload.geometryPolyline6);
      } catch {
        coords = [];
      }
      const distanceKm = item.payload.distanceMeters / 1000;
      const durationMinutes = Math.round(item.payload.durationSeconds / 60);
      const co2SavedKg = item.payload.co2SavedKg ?? distanceKm * 0.12;
      void shareRide.share({
        coords,
        distanceKm,
        durationMinutes,
        co2SavedKg,
        originLabel: item.payload.startLocationText,
        destinationLabel: item.payload.destinationText,
        dateIso: item.createdAt,
      });
    },
    [shareRide],
  );

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(
    ({ item, index }: { item: MergedItem; index: number }) => {
      if (item.kind === 'suggested') {
        return (
          <SuggestedUsersRow
            users={suggestedUsers}
            onFollow={handleFollow}
            onUserPress={handleUserPress}
          />
        );
      }

      return (
        <FadeSlideIn delay={Math.min(index * 50, 300)}>
          <ActivityFeedCard
            item={item.data}
            isVisible={visibleIds.has(item.data.id)}
            onReact={handleReact}
            onComment={handleComment}
            onUserPress={handleUserPress}
            onSharePress={handleSharePress}
            currentUserId={currentUserId}
          />
        </FadeSlideIn>
      );
    },
    [visibleIds, handleReact, handleComment, handleUserPress, handleSharePress, handleFollow, suggestedUsers, currentUserId],
  );

  const keyExtractor = useCallback(
    (item: MergedItem) => (item.kind === 'activity' ? item.data.id : item.key),
    [],
  );

  if (!lat || !lon) {
    const isDenied = permissionStatus === 'denied';
    const hasError = !isLocating && (isDenied || locationError != null);

    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.headerBar}>
          <Text style={styles.headerEyebrow}>{t('communityScreen.title')}</Text>
          <Text style={styles.headerTitle}>{t('communityScreen.feed')}</Text>
        </View>
        <View style={styles.centered}>
          {hasError ? (
            <>
              <Ionicons name="location-outline" size={48} color={colors.accent} />
              <Text style={styles.emptyTitle}>
                {isDenied ? t('communityScreen.locationNeeded') : t('communityScreen.locationFailed')}
              </Text>
              <Text style={styles.emptySubtitle}>
                {isDenied
                  ? t('communityScreen.locationPrompt')
                  : locationError ?? t('communityScreen.locationFailed')}
              </Text>
              <Pressable style={styles.retryButton} onPress={() => void refreshLocation()}>
                <Text style={styles.retryButtonText}>
                  {isDenied ? t('communityScreen.grantLocation') : t('communityScreen.tryAgain')}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.loadingText}>{t('communityScreen.gettingLocation')}</Text>
            </>
          )}
        </View>
        <BottomNav activeTab="community" onTabPress={handleTabPress} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <Text style={styles.headerEyebrow}>{t('communityScreen.title')}</Text>
        <Text style={styles.headerTitle}>{t('communityScreen.feed')}</Text>
      </View>

      <FlatList<MergedItem>
        data={mergedItems as MergedItem[]}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.list}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : isError ? (
            <View style={styles.emptyState}>
              <Ionicons name="cloud-offline-outline" size={48} color={colors.accent} />
              <Text style={styles.emptyTitle}>{t('communityScreen.loadFailed')}</Text>
              <Text style={styles.emptySubtitle}>{t('communityScreen.tryAgainLater')}</Text>
              <Pressable style={styles.retryButton} onPress={() => void refetch()}>
                <Text style={styles.retryButtonText}>{t('communityScreen.tryAgain')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>{t('communityScreen.noRidesNearby')}</Text>
              <Text style={styles.emptySubtitle}>
                {t('communityScreen.beFirst')}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={colors.accent} />
            </View>
          ) : null
        }
      />
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

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgDeep,
    },
    headerBar: {
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 10,
      gap: 2,
    },
    headerEyebrow: {
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.4,
      color: colors.accent,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: '900',
      color: colors.textPrimary,
      letterSpacing: -0.6,
    },
    list: {
      padding: 16,
      gap: 16,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      gap: 12,
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: 15,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 80,
      paddingHorizontal: 32,
      gap: 8,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: '900',
      textAlign: 'center',
    },
    emptySubtitle: {
      color: colors.textSecondary,
      fontSize: 15,
      textAlign: 'center',
      lineHeight: 22,
    },
    footer: {
      paddingVertical: 24,
      alignItems: 'center',
    },
    retryButton: {
      marginTop: 8,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.accent,
    },
    retryButtonText: {
      color: colors.textInverse,
      fontSize: 15,
      fontWeight: '700',
    },
    shareToastContainer: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 80,
    },
  });
