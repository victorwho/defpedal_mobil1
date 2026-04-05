import type { TripHistoryItem } from '@defensivepedal/core';
import {
  calculateCo2SavedKg,
  calculateTrailDistanceMeters,
  formatDistance,
  formatDuration,
  formatSpeed,
} from '@defensivepedal/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { RouteMap } from '../src/components/map';
import { BackButton } from '../src/design-system/atoms/BackButton';
import { Button } from '../src/design-system/atoms/Button';
import { brandColors, gray, safetyColors } from '../src/design-system/tokens/colors';
import { fontFamily, textBase, textSm, textXl, textXs, text2xl } from '../src/design-system/tokens/typography';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { mobileApi } from '../src/lib/api';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useT } from '../src/hooks/useTranslation';

type TripMetrics = {
  distanceMeters: number;
  durationSeconds: number;
  avgSpeedMps: number;
  co2Kg: number;
};

const computeMetrics = (trip: TripHistoryItem): TripMetrics => {
  const distanceMeters =
    trip.distanceMeters ?? calculateTrailDistanceMeters(trip.gpsBreadcrumbs);
  const durationSeconds =
    trip.endedAt
      ? (new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime()) / 1000
      : 0;
  const avgSpeedMps = durationSeconds > 0 ? distanceMeters / durationSeconds : 0;
  const co2Kg = calculateCo2SavedKg(distanceMeters);
  return { distanceMeters, durationSeconds, avgSpeedMps, co2Kg };
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

type StatRowProps = {
  label: string;
  value1: string;
  value2: string;
  highlight?: 1 | 2 | null;
};

const StatRow = ({ label, value1, value2, highlight }: StatRowProps) => (
  <View style={statStyles.row}>
    <View style={statStyles.cell}>
      <Text style={[statStyles.value, highlight === 1 && statStyles.valueBetter]}>{value1}</Text>
    </View>
    <View style={statStyles.labelCell}>
      <Text style={statStyles.label}>{label}</Text>
    </View>
    <View style={statStyles.cell}>
      <Text style={[statStyles.value, highlight === 2 && statStyles.valueBetter]}>{value2}</Text>
    </View>
  </View>
);

export default function TripCompareScreen() {
  const { trip1: trip1Id, trip2: trip2Id } = useLocalSearchParams<{ trip1: string; trip2: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();
  const t = useT();

  const { data: trips } = useQuery({
    queryKey: ['trip-history'],
    queryFn: () => mobileApi.getTripHistory(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const tripA = trips?.find((tr) => tr.id === trip1Id);
  const tripB = trips?.find((tr) => tr.id === trip2Id);

  const metricsA = useMemo(() => (tripA ? computeMetrics(tripA) : null), [tripA]);
  const metricsB = useMemo(() => (tripB ? computeMetrics(tripB) : null), [tripB]);

  // Decode trail for map
  const trailA = useMemo(
    () => tripA?.gpsBreadcrumbs.map((b) => [b.lon, b.lat] as [number, number]) ?? [],
    [tripA],
  );

  // Camera center
  const mapCenter = useMemo(() => {
    if (trailA.length === 0) return null;
    const sumLat = trailA.reduce((s, c) => s + c[1], 0);
    const sumLon = trailA.reduce((s, c) => s + c[0], 0);
    return { lat: sumLat / trailA.length, lon: sumLon / trailA.length };
  }, [trailA]);

  if (!tripA || !tripB || !metricsA || !metricsB) {
    return (
      <View style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t('tripsScreen.loading')}</Text>
        </View>
      </View>
    );
  }

  const fasterTrip = metricsA.avgSpeedMps > metricsB.avgSpeedMps ? 1 : metricsB.avgSpeedMps > metricsA.avgSpeedMps ? 2 : null;
  const longerTrip = metricsA.distanceMeters > metricsB.distanceMeters ? 1 : metricsB.distanceMeters > metricsA.distanceMeters ? 2 : null;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space[8] }]}>
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.title}>{t('compare.title')}</Text>
        </View>

        {/* Map with Trip 1 GPS trail */}
        {mapCenter && trailA.length >= 2 ? (
          <View style={styles.mapContainer}>
            <RouteMap
              origin={mapCenter}
              followUser={false}
              trailCoordinates={trailA}
              fullBleed={false}
            />
          </View>
        ) : null}

        {/* Stats comparison table */}
        <View style={[styles.card, shadows.md]}>
          {/* Column headers */}
          <View style={statStyles.row}>
            <View style={statStyles.cell}>
              <Text style={statStyles.headerText}>{t('compare.trip1')}</Text>
              <Text style={statStyles.dateText}>{formatDate(tripA.startedAt)}</Text>
            </View>
            <View style={statStyles.labelCell} />
            <View style={statStyles.cell}>
              <Text style={statStyles.headerText}>{t('compare.trip2')}</Text>
              <Text style={statStyles.dateText}>{formatDate(tripB.startedAt)}</Text>
            </View>
          </View>

          <View style={statStyles.divider} />

          <StatRow
            label={t('compare.distance')}
            value1={formatDistance(Math.round(metricsA.distanceMeters))}
            value2={formatDistance(Math.round(metricsB.distanceMeters))}
            highlight={longerTrip}
          />
          <StatRow
            label={t('compare.duration')}
            value1={formatDuration(Math.round(metricsA.durationSeconds))}
            value2={formatDuration(Math.round(metricsB.durationSeconds))}
          />
          <StatRow
            label={t('compare.avgSpeed')}
            value1={formatSpeed(metricsA.avgSpeedMps) ?? '—'}
            value2={formatSpeed(metricsB.avgSpeedMps) ?? '—'}
            highlight={fasterTrip}
          />
          <StatRow
            label={t('compare.co2Saved')}
            value1={`${metricsA.co2Kg.toFixed(2)} kg`}
            value2={`${metricsB.co2Kg.toFixed(2)} kg`}
          />
          <StatRow
            label={t('compare.mode')}
            value1={tripA.routingMode === 'safe' ? t('planning.safe') : t('planning.fast')}
            value2={tripB.routingMode === 'safe' ? t('planning.safe') : t('planning.fast')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brandColors.bgDeep },
  scroll: {},
  header: {
    paddingHorizontal: space[5],
    paddingTop: space[10],
    paddingBottom: space[3],
    gap: space[2],
  },
  title: {
    ...text2xl,
    fontFamily: fontFamily.heading.extraBold,
    color: brandColors.textPrimary,
  },
  mapContainer: {
    height: 280,
    marginHorizontal: space[4],
    borderRadius: radii.xl,
    overflow: 'hidden',
    marginBottom: space[3],
  },
  card: {
    marginHorizontal: space[4],
    backgroundColor: 'rgba(17, 24, 39, 0.86)',
    borderRadius: radii.xl,
    padding: space[4],
    gap: space[2],
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...textBase,
    color: gray[500],
  },
});

const statStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space[2],
  },
  cell: {
    flex: 1,
    alignItems: 'center',
  },
  labelCell: {
    width: 90,
    alignItems: 'center',
  },
  label: {
    ...textXs,
    fontFamily: fontFamily.body.medium,
    color: gray[400],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: {
    ...textSm,
    fontFamily: fontFamily.mono.medium,
    color: brandColors.textPrimary,
  },
  valueBetter: {
    color: safetyColors.safe,
    fontFamily: fontFamily.mono.bold,
  },
  headerText: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textPrimary,
  },
  dateText: {
    ...textXs,
    color: gray[500],
  },
  divider: {
    height: 1,
    backgroundColor: brandColors.borderDefault,
    marginVertical: space[1],
  },
});
