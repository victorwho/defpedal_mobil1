import type { TripHistoryItem } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BottomNav } from '../src/design-system/organisms/BottomNav';
import { TripCard } from '../src/design-system/organisms/TripCard';
import { Button } from '../src/design-system/atoms/Button';
import { brandColors, gray } from '../src/design-system/tokens/colors';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { fontFamily, textBase, textSm, text3xl, textXs } from '../src/design-system/tokens/typography';
import { mobileApi } from '../src/lib/api';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { handleTabPress } from '../src/lib/navigation-helpers';
import { useT } from '../src/hooks/useTranslation';

export default function TripsScreen() {
  const { user } = useAuthSession();
  const t = useT();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: trips, isLoading, error } = useQuery({
    queryKey: ['trip-history'],
    queryFn: () => mobileApi.getTripHistory(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

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

  const handleCompare = () => {
    if (selectedIds.length !== 2) return;
    router.push(`/trip-compare?trip1=${selectedIds[0]}&trip2=${selectedIds[1]}`);
    setCompareMode(false);
    setSelectedIds([]);
  };

  const exitCompareMode = () => {
    setCompareMode(false);
    setSelectedIds([]);
  };

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
                <Ionicons name="checkmark-circle" size={24} color={brandColors.accent} />
              ) : (
                <Ionicons name="ellipse-outline" size={24} color={gray[500]} />
              )}
            </View>
            <View style={styles.compareCardContent}>
              <TripCard trip={item} expanded={false} onToggle={() => {}} />
            </View>
          </Pressable>
        ) : (
          <TripCard
            trip={item}
            expanded={expandedId === item.id}
            onToggle={() => handleToggle(item.id)}
          />
        )}
      </View>
    ),
    [expandedId, handleToggle, compareMode, selectedIds],
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
                  <Ionicons name="map-outline" size={16} color={brandColors.accent} />
                  <Text style={styles.compareButtonText}>Map</Text>
                </Pressable>
              ) : null}
              {(trips?.length ?? 0) >= 2 && !compareMode ? (
                <Pressable style={styles.compareButton} onPress={() => setCompareMode(true)}>
                  <Ionicons name="git-compare-outline" size={16} color={brandColors.accent} />
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
            <ActivityIndicator size="large" color={brandColors.accent} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brandColors.bgDeep },
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
    color: brandColors.accent,
  },
  title: {
    ...text3xl,
    fontFamily: fontFamily.heading.extraBold,
    fontSize: 28,
    color: brandColors.textPrimary,
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
    color: '#EF4444',
    textAlign: 'center',
  },
  emptyTitle: {
    ...textBase,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textPrimary,
    fontSize: 18,
  },
  emptyText: {
    ...textBase,
    color: brandColors.textSecondary,
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
    borderColor: brandColors.accent,
  },
  compareButtonText: {
    ...textXs,
    fontFamily: fontFamily.body.bold,
    color: brandColors.accent,
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
    borderColor: brandColors.accent,
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
    borderTopColor: brandColors.borderDefault,
  },
});
