import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '../src/components/map';
import { Button } from '../src/design-system/atoms/Button';
import { brandColors, gray } from '../src/design-system/tokens/colors';
import { space } from '../src/design-system/tokens/spacing';
import { fontFamily, textSm } from '../src/design-system/tokens/typography';
import { mobileApi } from '../src/lib/api';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useCurrentLocation } from '../src/hooks/useCurrentLocation';
import { useT } from '../src/hooks/useTranslation';

export default function TripMapScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();
  const t = useT();
  const { coordinate } = useCurrentLocation();

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

  return (
    <View style={styles.root}>
      {/* Map fills screen */}
      <RouteMap
        origin={coordinate ?? undefined}
        userLocation={coordinate}
        followUser={false}
        historyTrails={historyTrails}
        fullBleed
      />

      {/* Floating header overlay */}
      <View style={[styles.headerOverlay, { paddingTop: insets.top + space[2] }]}>
        <View style={styles.headerRow}>
          <Button variant="secondary" size="sm" onPress={() => router.back()}>
            ← {t('common.back')}
          </Button>
          <Text style={styles.badge}>
            {trailCount} {trailCount === 1 ? 'ride' : 'rides'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: brandColors.bgDeep,
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space[4],
    paddingBottom: space[2],
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
