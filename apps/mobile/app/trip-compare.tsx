import type { TripHistoryItem } from '@defensivepedal/core';
import {
  calculateCo2SavedKg,
  calculateTrailDistanceMeters,
  formatDistance,
  formatDuration,
  formatSpeed,
} from '@defensivepedal/core';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { RouteMap } from '../src/components/map';
import { ScreenHeader } from '../src/design-system/atoms/ScreenHeader';
import { useTheme, type ThemeColors } from '../src/design-system';
import { gray } from '../src/design-system/tokens/colors';
import { surfaceTints } from '../src/design-system/tokens/tints';
import { fontFamily, textBase, textSm, textXl, textXs } from '../src/design-system/tokens/typography';
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

type ThemedStyles = ReturnType<typeof createThemedStyles>;

type StatRowProps = {
  label: string;
  value1: string;
  value2: string;
  highlight?: 1 | 2 | null;
  ss: ThemedStyles;
};

const StatRow = ({ label, value1, value2, highlight, ss }: StatRowProps) => (
  <View style={ss.statRow}>
    <View style={ss.statCell}>
      <Text style={[ss.statValue, highlight === 1 && ss.statValueBetter]}>{value1}</Text>
    </View>
    <View style={ss.statLabelCell}>
      <Text style={ss.statLabel}>{label}</Text>
    </View>
    <View style={ss.statCell}>
      <Text style={[ss.statValue, highlight === 2 && ss.statValueBetter]}>{value2}</Text>
    </View>
  </View>
);

export default function TripCompareScreen() {
  const { trip1: trip1Id, trip2: trip2Id } = useLocalSearchParams<{ trip1: string; trip2: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();
  const t = useT();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);

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
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader variant="back" title={t('compare.title')} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space[8] }]}>

        {/* Map with Trip 1 GPS trail */}
        {mapCenter && trailA.length >= 2 ? (
          <View style={styles.mapContainer}>
            <RouteMap
              origin={mapCenter}
              followUser={false}
              trailCoordinates={trailA}
              fullBleed={false}
              a11yContext={{ mode: 'historical' }}
            />
          </View>
        ) : null}

        {/* Stats comparison table */}
        <View style={[styles.card, shadows.md]}>
          {/* Column headers */}
          <View style={styles.statRow}>
            <View style={styles.statCell}>
              <Text style={styles.statHeaderText}>{t('compare.trip1')}</Text>
              <Text style={styles.statDateText}>{formatDate(tripA.startedAt)}</Text>
            </View>
            <View style={styles.statLabelCell} />
            <View style={styles.statCell}>
              <Text style={styles.statHeaderText}>{t('compare.trip2')}</Text>
              <Text style={styles.statDateText}>{formatDate(tripB.startedAt)}</Text>
            </View>
          </View>

          <View style={styles.statDivider} />

          <StatRow
            ss={styles}
            label={t('compare.distance')}
            value1={formatDistance(Math.round(metricsA.distanceMeters))}
            value2={formatDistance(Math.round(metricsB.distanceMeters))}
            highlight={longerTrip}
          />
          <StatRow
            ss={styles}
            label={t('compare.duration')}
            value1={formatDuration(Math.round(metricsA.durationSeconds))}
            value2={formatDuration(Math.round(metricsB.durationSeconds))}
          />
          <StatRow
            ss={styles}
            label={t('compare.avgSpeed')}
            value1={formatSpeed(metricsA.avgSpeedMps) ?? '—'}
            value2={formatSpeed(metricsB.avgSpeedMps) ?? '—'}
            highlight={fasterTrip}
          />
          <StatRow
            ss={styles}
            label={t('compare.co2Saved')}
            value1={`${metricsA.co2Kg.toFixed(2)} kg`}
            value2={`${metricsB.co2Kg.toFixed(2)} kg`}
          />
          <StatRow
            ss={styles}
            label={t('compare.mode')}
            value1={tripA.routingMode === 'safe' ? t('planning.safe') : t('planning.fast')}
            value2={tripB.routingMode === 'safe' ? t('planning.safe') : t('planning.fast')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgDeep },
    scroll: {
      paddingTop: space[2],
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
      backgroundColor: surfaceTints.glass,
      borderRadius: radii.xl,
      padding: space[4],
      gap: space[2],
      borderWidth: 1,
      borderColor: colors.borderDefault,
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
    // Stat table styles
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: space[2],
    },
    statCell: {
      flex: 1,
      alignItems: 'center',
    },
    statLabelCell: {
      width: 90,
      alignItems: 'center',
    },
    statLabel: {
      ...textXs,
      fontFamily: fontFamily.body.medium,
      color: gray[400],
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    statValue: {
      ...textSm,
      fontFamily: fontFamily.mono.medium,
      color: colors.textPrimary,
    },
    statValueBetter: {
      color: colors.safe,
      fontFamily: fontFamily.mono.bold,
    },
    statHeaderText: {
      ...textSm,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
    },
    statDateText: {
      ...textXs,
      color: gray[500],
    },
    statDivider: {
      height: 1,
      backgroundColor: colors.borderDefault,
      marginVertical: space[1],
    },
  });
