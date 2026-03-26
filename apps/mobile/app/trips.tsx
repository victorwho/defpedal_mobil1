import type { TripHistoryItem } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { BottomNav, type TabKey } from '../src/design-system/organisms/BottomNav';
import { TripCard } from '../src/design-system/organisms/TripCard';
import { Button } from '../src/design-system/atoms/Button';
import { brandColors, gray } from '../src/design-system/tokens/colors';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { fontFamily, textBase, text3xl, textXs } from '../src/design-system/tokens/typography';
import { mobileApi } from '../src/lib/api';
import { useAuthSession } from '../src/providers/AuthSessionProvider';

const handleTabPress = (tab: TabKey) => {
  if (tab === 'map') router.replace('/route-planning');
  else if (tab === 'community') router.replace('/community');
  else if (tab === 'profile') router.replace('/profile');
  else if (tab === 'history') router.replace('/history');
};

export default function TripsScreen() {
  const { user } = useAuthSession();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: trips, isLoading, error } = useQuery({
    queryKey: ['trip-history'],
    queryFn: () => mobileApi.getTripHistory(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const handleToggle = useCallback((tripId: string) => {
    setExpandedId((prev) => (prev === tripId ? null : tripId));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: TripHistoryItem }) => (
      <TripCard
        trip={item}
        expanded={expandedId === item.id}
        onToggle={() => handleToggle(item.id)}
      />
    ),
    [expandedId, handleToggle],
  );

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Button variant="secondary" size="sm" onPress={() => router.replace('/history')}>
              ← History
            </Button>
          </View>
          <Text style={styles.eyebrow}>DEFENSIVE PEDAL</Text>
          <Text style={styles.title}>My Trips</Text>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={brandColors.accent} />
            <Text style={styles.loadingText}>Loading your rides…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>Failed to load trips. Please try again.</Text>
          </View>
        ) : !trips?.length ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>No rides yet</Text>
            <Text style={styles.emptyText}>
              Complete a ride and your trip history will appear here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={trips}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            scrollEnabled={expandedId === null}
          />
        )}
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
});
