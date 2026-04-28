import type { TripHistoryItem } from '@defensivepedal/core';
import {
  calculateCo2SavedKg,
  calculateTrailDistanceMeters,
  decodePolyline,
} from '@defensivepedal/core';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BottomNav } from '../src/design-system/organisms/BottomNav';
import { TripCard } from '../src/design-system/organisms/TripCard';
import { Button } from '../src/design-system/atoms/Button';
import { Toast } from '../src/design-system/molecules/Toast';
import { useTheme, type ThemeColors } from '../src/design-system';
import { gray } from '../src/design-system/tokens/colors';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { fontFamily, textBase, textSm, text3xl, textXs } from '../src/design-system/tokens/typography';
import { mobileApi } from '../src/lib/api';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { handleTabPress } from '../src/lib/navigation-helpers';
import { useShareRide } from '../src/hooks/useShareRide';
import { useT } from '../src/hooks/useTranslation';

export default function TripsScreen() {
  const { user } = useAuthSession();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteToast, setDeleteToast] = useState<string | null>(null);
  const shareRide = useShareRide();

  const handleShareTrip = useCallback((trip: TripHistoryItem) => {
    // Prefer GPS trail; fall back to planned route polyline for trips that
    // ended without breadcrumbs (killed app, permission loss, etc).
    let coords: [number, number][] = trip.gpsBreadcrumbs.map((pt) => [pt.lon, pt.lat]);
    if (coords.length < 2 && trip.plannedRoutePolyline6) {
      try {
        coords = decodePolyline(trip.plannedRoutePolyline6);
      } catch {
        coords = [];
      }
    }

    const distanceMeters =
      trip.distanceMeters ??
      (trip.gpsBreadcrumbs.length >= 2
        ? calculateTrailDistanceMeters(trip.gpsBreadcrumbs)
        : trip.plannedRouteDistanceMeters ?? 0);
    const distanceKm = distanceMeters / 1000;

    const durationMinutes = trip.endedAt
      ? Math.max(
          1,
          Math.round(
            (new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime()) / 60_000,
          ),
        )
      : 0;

    void shareRide.share({
      coords,
      distanceKm,
      durationMinutes,
      co2SavedKg: calculateCo2SavedKg(distanceMeters),
      dateIso: trip.startedAt,
    });
  }, [shareRide]);

  const { data: trips, isLoading, error } = useQuery({
    queryKey: ['trip-history'],
    queryFn: () => mobileApi.getTripHistory(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const deleteTripMutation = useMutation({
    mutationFn: (tripId: string) => mobileApi.deleteTrip(tripId),
    onMutate: (tripId) => {
      setDeletingId(tripId);
    },
    onSuccess: async (_data, tripId) => {
      // Optimistically prune from the cache so the row disappears immediately;
      // then invalidate so any aggregate views refetch fresh.
      queryClient.setQueryData<TripHistoryItem[] | undefined>(
        ['trip-history'],
        (prev) => prev?.filter((t) => t.id !== tripId),
      );
      if (expandedId === tripId) setExpandedId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['trip-history'] }),
        queryClient.invalidateQueries({ queryKey: ['stats-dashboard'] }),
      ]);
    },
    onError: () => {
      setDeleteToast(t('tripsScreen.deleteFailed'));
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const handleDeleteTrip = useCallback((trip: TripHistoryItem) => {
    Alert.alert(
      t('tripsScreen.deleteTitle'),
      t('tripsScreen.deleteMessage'),
      [
        { text: t('tripsScreen.deleteCancel'), style: 'cancel' },
        {
          text: t('tripsScreen.deleteConfirm'),
          style: 'destructive',
          onPress: () => deleteTripMutation.mutate(trip.id),
        },
      ],
      { cancelable: true },
    );
  }, [deleteTripMutation, t]);

  const handleToggle = useCallback((tripId: string) => {
    if (compareMode) {
      setSelectedIds((prev) => {
        if (prev.includes(tripId)) return prev.filter((id) => id !== tripId);
        if (prev.length >= 2) return prev;
        return [...prev, tripId];
      });
      return;
    }
    setExpandedId((prev) => (prev === tripId ? null : tripId));
  }, [compareMode]);

  const handleCompare = useCallback(() => {
    if (selectedIds.length !== 2) return;
    router.push(`/trip-compare?trip1=${selectedIds[0]}&trip2=${selectedIds[1]}`);
    setCompareMode(false);
    setSelectedIds([]);
  }, [selectedIds]);

  const exitCompareMode = useCallback(() => {
    setCompareMode(false);
    setSelectedIds([]);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: TripHistoryItem }) => (
      <View>
        {compareMode ? (
          <Pressable
            onPress={() => handleToggle(item.id)}
            style={[
              styles.compareSelectWrapper,
              selectedIds.includes(item.id) && styles.compareSelected,
            ]}
          >
            <View style={styles.compareCheckbox}>
              {selectedIds.includes(item.id) ? (
                <Ionicons name="checkmark-circle" size={24} color={colors.accent} />
              ) : (
                <Ionicons name="ellipse-outline" size={24} color={gray[500]} />
              )}
            </View>
            <View style={styles.compareCardContent}>
              <TripCard trip={item} expanded={false} onToggle={() => {}} />
            </View>
          </Pressable>
        ) : (
          <View style={styles.tripCardWrapper}>
            <TripCard
              trip={item}
              expanded={expandedId === item.id}
              onToggle={() => handleToggle(item.id)}
              onDeletePress={handleDeleteTrip}
              deletePending={deletingId === item.id}
              deleteLabel={t('tripsScreen.deleteAction')}
            />
            <Pressable
              style={styles.shareTripButton}
              onPress={() => handleShareTrip(item)}
              disabled={shareRide.isSharing}
              accessibilityRole="button"
              accessibilityLabel={t('share.shareRide')}
              hitSlop={10}
            >
              <Ionicons
                name="share-social-outline"
                size={18}
                color={shareRide.isSharing ? gray[500] : colors.accent}
              />
            </Pressable>
          </View>
        )}
      </View>
    ),
    [expandedId, handleToggle, compareMode, selectedIds, styles, colors, shareRide.isSharing, handleShareTrip, handleDeleteTrip, deletingId, t],
  );

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View />
            <View style={styles.headerActions}>
              {(trips?.length ?? 0) >= 1 && !compareMode ? (
                <Pressable style={styles.compareButton} onPress={() => router.push('/trip-map')}>
                  <Ionicons name="map-outline" size={16} color={colors.accent} />
                  <Text style={styles.compareButtonText}>Map</Text>
                </Pressable>
              ) : null}
              {(trips?.length ?? 0) >= 2 && !compareMode ? (
                <Pressable style={styles.compareButton} onPress={() => setCompareMode(true)}>
                  <Ionicons name="git-compare-outline" size={16} color={colors.accent} />
                  <Text style={styles.compareButtonText}>{t('compare.select')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <Text style={styles.eyebrow}>{t('history.eyebrow').toUpperCase()}</Text>
          <Text style={styles.title}>{t('tripsScreen.subtitle')}</Text>
          {compareMode ? (
            <Text style={styles.compareHint}>
              {t('compare.selectTrips')} ({selectedIds.length}/2)
            </Text>
          ) : null}
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>{t('tripsScreen.loading')}</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{t('tripsScreen.loadFailed')}</Text>
          </View>
        ) : !trips?.length ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>{t('tripsScreen.noRides')}</Text>
            <Text style={styles.emptyText}>
              {t('tripsScreen.noRidesSub')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={trips}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!compareMode || expandedId === null}
          />
        )}

        {compareMode ? (
          <View style={styles.compareFooter}>
            <Button variant="secondary" size="md" onPress={exitCompareMode}>
              {t('compare.cancel')}
            </Button>
            <Button
              variant="primary"
              size="md"
              onPress={handleCompare}
              disabled={selectedIds.length !== 2}
            >
              {t('compare.compare')}
            </Button>
          </View>
        ) : null}
      </View>
      <BottomNav activeTab="history" onTabPress={handleTabPress} />
      {shareRide.toastMessage ? (
        <View style={styles.shareToastContainer} pointerEvents="box-none">
          <Toast
            message={shareRide.toastMessage}
            variant="warning"
            onDismiss={shareRide.consumeToast}
          />
        </View>
      ) : null}
      {deleteToast ? (
        <View style={styles.shareToastContainer} pointerEvents="box-none">
          <Toast
            message={deleteToast}
            variant="warning"
            onDismiss={() => setDeleteToast(null)}
          />
        </View>
      ) : null}
    </View>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgDeep },
    content: { flex: 1 },
    header: {
      paddingHorizontal: space[5],
      paddingTop: space[10],
      paddingBottom: space[3],
      gap: space[1],
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: space[2],
    },
    eyebrow: {
      ...textXs,
      fontFamily: fontFamily.heading.extraBold,
      textTransform: 'uppercase',
      letterSpacing: 1.4,
      color: colors.accent,
    },
    title: {
      ...text3xl,
      fontFamily: fontFamily.heading.extraBold,
      fontSize: 28,
      color: colors.textPrimary,
      letterSpacing: -0.6,
    },
    list: {
      paddingHorizontal: space[4],
      paddingBottom: space[6],
      gap: space[3],
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space[8],
      gap: space[3],
    },
    loadingText: {
      ...textBase,
      color: gray[500],
    },
    errorText: {
      ...textBase,
      color: colors.danger,
      textAlign: 'center',
    },
    emptyTitle: {
      ...textBase,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
      fontSize: 18,
    },
    emptyText: {
      ...textBase,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    headerActions: {
      flexDirection: 'row',
      gap: space[2],
    },
    compareButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[1],
      paddingHorizontal: space[3],
      paddingVertical: space[1],
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    compareButtonText: {
      ...textXs,
      fontFamily: fontFamily.body.bold,
      color: colors.accent,
    },
    compareHint: {
      ...textSm,
      color: gray[400],
      marginTop: space[1],
    },
    compareSelectWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radii.xl,
      borderWidth: 2,
      borderColor: 'transparent',
      overflow: 'hidden',
    },
    compareSelected: {
      borderColor: colors.accent,
    },
    compareCheckbox: {
      paddingLeft: space[3],
      paddingRight: space[1],
    },
    compareCardContent: {
      flex: 1,
    },
    compareFooter: {
      flexDirection: 'row',
      gap: space[3],
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      borderTopWidth: 1,
      borderTopColor: colors.borderDefault,
    },
    tripCardWrapper: {
      position: 'relative',
    },
    shareTripButton: {
      position: 'absolute',
      top: space[2],
      right: space[2],
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.bgSecondary,
      alignItems: 'center',
      justifyContent: 'center',
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
  });
