import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '../src/components/map';
import { Button } from '../src/design-system/atoms/Button';
import { brandColors, gray } from '../src/design-system/tokens/colors';
import { space } from '../src/design-system/tokens/spacing';
import { fontFamily, text2xl, textSm } from '../src/design-system/tokens/typography';
import { mobileApi } from '../src/lib/api';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useCurrentLocation } from '../src/hooks/useCurrentLocation';
import { useT } from '../src/hooks/useTranslation';

export default function TripMapScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();
  const t = useT();
  const { coordinate } = useCurrentLocation();

  const { data: trips, isLoading } = useQuery({
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
      <View style={[styles.header, { paddingTop: insets.top + space[2] }]}>
        <Button variant="secondary" size="sm" onPress={() => router.back()}>
          ← {t('common.back')}
        </Button>
        <Text style={styles.title}>{t('tripsScreen.subtitle')} on Map</Text>
        <Text style={styles.subtitle}>
          {isLoading ? t('common.loading') : `${trailCount} ${trailCount === 1 ? 'ride' : 'rides'}`}
        </Text>
      </View>

      <View style={styles.mapContainer}>
        <RouteMap
          origin={coordinate ?? undefined}
          followUser={false}
          historyTrails={historyTrails}
          fullBleed
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: brandColors.bgDeep,
  },
  header: {
    paddingHorizontal: space[5],
    paddingBottom: space[3],
    gap: space[1],
    zIndex: 10,
  },
  title: {
    ...text2xl,
    fontFamily: fontFamily.heading.extraBold,
    color: brandColors.textPrimary,
  },
  subtitle: {
    ...textSm,
    color: gray[400],
  },
  mapContainer: {
    flex: 1,
  },
});
