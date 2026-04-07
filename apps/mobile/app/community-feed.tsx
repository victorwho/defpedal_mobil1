import type { FeedItem } from '@defensivepedal/core';
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

import { FeedCard } from '../src/components/FeedCard';
import { FadeSlideIn } from '../src/design-system/atoms/FadeSlideIn';
import { BottomNav } from '../src/design-system/organisms/BottomNav';
import { useTheme, type ThemeColors } from '../src/design-system';
import { handleTabPress } from '../src/lib/navigation-helpers';
import { useCurrentLocation } from '../src/hooks/useCurrentLocation';
import { useFeedQuery, useLikeToggle, useLoveToggle } from '../src/hooks/useFeed';
import { useT } from '../src/hooks/useTranslation';

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
    ({ item, index }: { item: FeedItem; index: number }) => (
      <FadeSlideIn delay={Math.min(index * 50, 300)}>
        <FeedCard
          item={item}
          isVisible={visibleIds.has(item.id)}
          onLike={handleLike}
          onLove={handleLove}
          onPress={handlePress}
          onUserPress={(userId) => router.push(`/user-profile?id=${userId}`)}
        />
      </FadeSlideIn>
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
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.accent} />
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
  });
