import type { FeedItem } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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

import { FeedCard } from '../src/components/FeedCard';
import { BottomNav } from '../src/design-system/organisms/BottomNav';
import { handleTabPress } from '../src/lib/navigation-helpers';
import { useCurrentLocation } from '../src/hooks/useCurrentLocation';
import { useFeedQuery, useLikeToggle, useLoveToggle } from '../src/hooks/useFeed';
import { mobileTheme } from '../src/lib/theme';

export default function CommunityFeedScreen() {
  const {
    location: currentLocation,
    permissionStatus,
    isLoading: isLocating,
    error: locationError,
    refreshLocation,
  } = useCurrentLocation();
  const insets = useSafeAreaInsets();
  const lat = currentLocation?.lat ?? null;
  const lon = currentLocation?.lon ?? null;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isRefetching,
  } = useFeedQuery(lat, lon);

  const likeToggle = useLikeToggle();
  const loveToggle = useLoveToggle();

  // Track visible items for lazy map loading
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      setVisibleIds(new Set(viewableItems.map((v) => v.item?.id).filter(Boolean)));
    },
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 }).current;

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  const handleLike = useCallback(
    (id: string, liked: boolean) => {
      likeToggle.mutate({ id, liked });
    },
    [likeToggle],
  );

  const handleLove = useCallback(
    (id: string, loved: boolean) => {
      loveToggle.mutate({ id, loved });
    },
    [loveToggle],
  );

  const handlePress = useCallback((id: string) => {
    router.push({ pathname: '/community-trip', params: { id } });
  }, []);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => (
      <FeedCard
        item={item}
        isVisible={visibleIds.has(item.id)}
        onLike={handleLike}
        onLove={handleLove}
        onPress={handlePress}
        onUserPress={(userId) => router.push(`/user-profile?id=${userId}`)}
      />
    ),
    [visibleIds, handleLike, handleLove, handlePress, router],
  );

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);

  if (!lat || !lon) {
    const isDenied = permissionStatus === 'denied';
    const hasError = !isLocating && (isDenied || locationError != null);

    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.headerBar}>
          <Text style={styles.headerEyebrow}>Community</Text>
          <Text style={styles.headerTitle}>Nearby Rides</Text>
        </View>
        <View style={styles.centered}>
          {hasError ? (
            <>
              <Ionicons name="location-outline" size={48} color={mobileTheme.colors.brand} />
              <Text style={styles.emptyTitle}>
                {isDenied ? 'Location access needed' : 'Unable to get location'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {isDenied
                  ? 'Enable location permission to see rides shared by cyclists near you.'
                  : locationError ?? 'Something went wrong resolving your location.'}
              </Text>
              <Pressable style={styles.retryButton} onPress={() => void refreshLocation()}>
                <Text style={styles.retryButtonText}>
                  {isDenied ? 'Grant Location Access' : 'Try Again'}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={mobileTheme.colors.brand} />
              <Text style={styles.loadingText}>Getting your location...</Text>
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
        <Text style={styles.headerEyebrow}>Community</Text>
        <Text style={styles.headerTitle}>Nearby Rides</Text>
      </View>

      <FlatList
        data={items}
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
            tintColor={mobileTheme.colors.brand}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={mobileTheme.colors.brand} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No rides shared nearby yet</Text>
              <Text style={styles.emptySubtitle}>
                Complete a ride and be the first to share a safe route in your area!
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={mobileTheme.colors.brand} />
            </View>
          ) : null
        }
      />
    <BottomNav activeTab="community" onTabPress={handleTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: mobileTheme.colors.background,
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
    color: mobileTheme.colors.brand,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: mobileTheme.colors.textOnDark,
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
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 15,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: mobileTheme.colors.textOnDarkMuted,
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
    backgroundColor: mobileTheme.colors.brand,
  },
  retryButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
});
