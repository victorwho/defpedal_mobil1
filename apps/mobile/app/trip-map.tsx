import { useQuery } from '@tanstack/react-query';
import { useMemo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { RouteMap } from '../src/components/map';
import { BackButton } from '../src/design-system/atoms/BackButton';
import { brandColors, gray } from '../src/design-system/tokens/colors';
import { space } from '../src/design-system/tokens/spacing';
import { fontFamily, textSm } from '../src/design-system/tokens/typography';
import { mobileApi } from '../src/lib/api';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useCurrentLocation } from '../src/hooks/useCurrentLocation';

export default function TripMapScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();
  const { coordinate, refreshLocation } = useCurrentLocation();

  const { data: trips } = useQuery({
    queryKey: ['trip-history'],
    queryFn: () => mobileApi.getTripHistory(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const historyTrails = useMemo(() => {
    if (!trips) return undefined;
    return trips
      .filter((trip) => trip.gpsBreadcrumbs.length >= 2)
      .map((trip) => ({
        coordinates: trip.gpsBreadcrumbs.map((b) => [b.lon, b.lat] as [number, number]),
        mode: trip.routingMode,
      }));
  }, [trips]);

  const trailCount = historyTrails?.length ?? 0;
  const [recenterKey, setRecenterKey] = useState(1);

  const handleRecenter = useCallback(() => {
    void refreshLocation();
    setRecenterKey((k) => k + 1);
  }, [refreshLocation]);

  return (
    <View style={styles.root}>
      {/* Map with bottom safe area */}
      <View style={[styles.mapContainer, { paddingBottom: insets.bottom }]}>
        <RouteMap
          origin={coordinate ?? undefined}
          userLocation={coordinate}
          followUser={false}
          historyTrails={historyTrails}
          showRouteOverlay={false}
          recenterKey={recenterKey}
          fullBleed
        />
      </View>

      {/* Floating back button — bottom left */}
      <View style={[styles.bottomLeft, { bottom: insets.bottom + space[4] }]}>
        <BackButton />
      </View>

      {/* Floating recenter button — bottom right */}
      <Pressable
        style={[styles.recenterButton, { bottom: insets.bottom + space[4] }]}
        onPress={handleRecenter}
        accessibilityLabel="Center on my location"
        accessibilityRole="button"
      >
        <Ionicons name="locate" size={20} color={gray[700]} />
      </Pressable>

      {/* Ride count badge — top right */}
      <View style={[styles.badgeContainer, { top: insets.top + space[2] }]}>
        <Text style={styles.badge}>
          {trailCount} {trailCount === 1 ? 'ride' : 'rides'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: brandColors.bgDeep,
  },
  mapContainer: {
    flex: 1,
  },
  bottomLeft: {
    position: 'absolute',
    left: space[4],
  },
  recenterButton: {
    position: 'absolute',
    right: space[4],
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  badgeContainer: {
    position: 'absolute',
    right: space[4],
  },
  badge: {
    ...textSm,
    fontFamily: fontFamily.body.bold,
    color: brandColors.textPrimary,
    backgroundColor: 'rgba(17, 24, 39, 0.8)',
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: 12,
    overflow: 'hidden',
  },
});
