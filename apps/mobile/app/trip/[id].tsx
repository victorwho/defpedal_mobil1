import type { BadgeUnlockEvent, RideImpact, TripHistoryItem } from '@defensivepedal/core';
import {
  PLAY_STORE_URL,
  calculateCo2SavedKg,
  calculateTrailDistanceMeters,
  decodePolyline,
  formatDistance,
  formatDuration,
  formatMicrolivesAsTime,
  formatSpeed,
} from '@defensivepedal/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { RouteMap } from '../../src/components/map';
import { BadgeVisual } from '../../src/design-system/atoms/BadgeVisual';
import { ScreenHeader } from '../../src/design-system/atoms/ScreenHeader';
import { Toast } from '../../src/design-system/molecules/Toast';
import { useTheme, type ThemeColors } from '../../src/design-system';
import { ElevationChart } from '../../src/design-system/organisms/ElevationChart';
import { brandColors, gray, safetyColors } from '../../src/design-system/tokens/colors';
import { radii } from '../../src/design-system/tokens/radii';
import { shadows } from '../../src/design-system/tokens/shadows';
import { space } from '../../src/design-system/tokens/spacing';
import {
  fontFamily,
  text2xl,
  textSm,
  textXs,
} from '../../src/design-system/tokens/typography';
import { mobileApi } from '../../src/lib/api';
import { useAuthSession } from '../../src/providers/AuthSessionProvider';
import { useConnectivity } from '../../src/providers/ConnectivityMonitor';
import { useT } from '../../src/hooks/useTranslation';

const MAP_HEIGHT = 300;

const formatDateLong = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatTimeRange = (start: string, end: string | null): string => {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (!end) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
};

const formatCommunitySeconds = (seconds: number): string => {
  const rounded = Math.round(seconds);
  if (rounded < 60) return `+${rounded}s`;
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return s === 0 ? `+${m}m` : `+${m}m ${s}s`;
};

const formatEur = (eur: number): string => `€${eur.toFixed(2)}`;

const formatCo2 = (kg: number): string => {
  if (kg >= 1) return `${kg.toFixed(2)} kg`;
  return `${Math.round(kg * 1000)} g`;
};

export default function TripDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const tripId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const { user } = useAuthSession();
  const queryClient = useQueryClient();
  const [deleteToast, setDeleteToast] = useState<string | null>(null);
  // When a finger is on the map, suspend ScrollView pan so Mapbox owns the
  // gesture cleanly (pinch-zoom, pan, rotate). onTouchStart/End on a wrapper
  // View are passive listeners — they fire even though Mapbox is the
  // responder, so we don't steal touches from the native map.
  const [mapInteracting, setMapInteracting] = useState(false);
  const handleMapTouchStart = useCallback(() => setMapInteracting(true), []);
  const handleMapTouchEnd = useCallback(() => setMapInteracting(false), []);
  const [isSharing, setIsSharing] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const { isOnline } = useConnectivity();

  // Trip comes from the cached history list — Trips screen has already
  // fetched it before push navigation lands here. We fall back to a network
  // fetch via getTripHistory if the cache is cold (e.g. deep link).
  const { data: trips } = useQuery({
    queryKey: ['trip-history'],
    queryFn: () => mobileApi.getTripHistory(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const trip = useMemo<TripHistoryItem | undefined>(
    () => trips?.find((row) => row.id === tripId),
    [trips, tripId],
  );

  // GPS trail / planned polyline — needed for both the map and the elevation lookup.
  const trailCoords = useMemo<[number, number][]>(
    () => (trip ? trip.gpsBreadcrumbs.map((pt) => [pt.lon, pt.lat]) : []),
    [trip],
  );

  const plannedCoords = useMemo<[number, number][] | undefined>(() => {
    if (!trip?.plannedRoutePolyline6) return undefined;
    try {
      return decodePolyline(trip.plannedRoutePolyline6);
    } catch {
      return undefined;
    }
  }, [trip?.plannedRoutePolyline6]);

  // Coordinates used for the elevation lookup: prefer the real GPS trail,
  // fall back to the planned polyline so even pre-recorded trips with no
  // breadcrumbs still get a chart.
  const elevationCoords = useMemo<[number, number][] | null>(() => {
    if (trailCoords.length >= 2) return trailCoords;
    if (plannedCoords && plannedCoords.length >= 2) return plannedCoords;
    return null;
  }, [trailCoords, plannedCoords]);

  // Elevation profile — async, fails soft (chart simply hides).
  // Long stale time: a ride's elevation never changes.
  const elevationQuery = useQuery({
    queryKey: ['trip-elevation', tripId, elevationCoords?.length ?? 0],
    queryFn: () => mobileApi.fetchElevationProfile(elevationCoords!),
    enabled: Boolean(user) && elevationCoords !== null,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  // Ride impact — async, fails soft (we degrade to client-side derived stats).
  const impactQuery = useQuery({
    queryKey: ['ride-impact', tripId],
    queryFn: () => mobileApi.fetchRideImpact(tripId),
    enabled: Boolean(user) && Boolean(tripId),
    staleTime: 60_000,
  });

  const metrics = useMemo(() => {
    if (!trip) {
      return {
        distanceMeters: 0,
        durationSeconds: 0,
        avgSpeedMps: 0,
        co2Kg: 0,
        moneyEur: 0,
      };
    }
    const distanceMeters =
      trip.distanceMeters ??
      (trip.gpsBreadcrumbs.length >= 2
        ? calculateTrailDistanceMeters(trip.gpsBreadcrumbs)
        : trip.plannedRouteDistanceMeters ?? 0);
    const durationSeconds = trip.endedAt
      ? (new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime()) / 1000
      : 0;
    const avgSpeedMps = durationSeconds > 0 ? distanceMeters / durationSeconds : 0;
    return {
      distanceMeters,
      durationSeconds,
      avgSpeedMps,
      co2Kg: calculateCo2SavedKg(distanceMeters),
    };
  }, [trip]);

  // Server-supplied impact wins when available — it accounts for any
  // server-side adjustments (XP, badge unlocks, multipliers) the client
  // can't replicate. Fall back to derived metrics otherwise.
  const impact: RideImpact | undefined = impactQuery.data;

  const co2Kg = impact?.co2SavedKg ?? metrics.co2Kg;
  const moneyEur = impact?.moneySavedEur ?? null;
  const microlives = impact?.personalMicrolives ?? 0;
  const communitySeconds = impact?.communitySeconds ?? 0;
  const newBadges = impact?.newBadges ?? [];

  const speedLabel = formatSpeed(metrics.avgSpeedMps) ?? '—';

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mobileApi.deleteTrip(id),
    onSuccess: async (_data, id) => {
      queryClient.setQueryData<TripHistoryItem[] | undefined>(
        ['trip-history'],
        (prev) => prev?.filter((row) => row.id !== id),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['trip-history'] }),
        queryClient.invalidateQueries({ queryKey: ['stats-dashboard'] }),
      ]);
      router.back();
    },
    onError: () => {
      setDeleteToast(t('tripsScreen.deleteFailed'));
    },
  });

  const handleDelete = useCallback(() => {
    if (!trip) return;
    Alert.alert(
      t('tripsScreen.deleteTitle'),
      t('tripsScreen.deleteMessage'),
      [
        { text: t('tripsScreen.deleteCancel'), style: 'cancel' },
        {
          text: t('tripsScreen.deleteConfirm'),
          style: 'destructive',
          onPress: () => deleteMutation.mutate(trip.id),
        },
      ],
      { cancelable: true },
    );
  }, [deleteMutation, t, trip]);

  // Share — creates a route_share record from the trip's planned polyline,
  // then opens the native text-share sheet with the caption + webUrl +
  // Play Store install link. Same pattern as useShareRoute on the route
  // planning screen: recipients tap the URL to open the route on web /
  // load it in the app. Image share was dropped in v0.2.52 because
  // expo-sharing can't include a tappable link alongside the PNG.
  const handleShare = useCallback(async () => {
    if (!trip) return;
    if (!isOnline) {
      setShareToast('You are offline. Try again when connected.');
      return;
    }

    // Need a planned polyline to share — that's what populates the public
    // route viewer. Without it, the recipient has nothing to look at.
    if (!trip.plannedRoutePolyline6) {
      setShareToast('This ride has no planned route to share.');
      return;
    }

    let coords: [number, number][];
    try {
      coords = decodePolyline(trip.plannedRoutePolyline6);
    } catch {
      setShareToast('Could not decode this ride’s route.');
      return;
    }
    if (coords.length < 2) {
      setShareToast('This ride has no planned route to share.');
      return;
    }

    const first = coords[0]!;
    const last = coords[coords.length - 1]!;
    const distanceMeters =
      trip.distanceMeters ??
      trip.plannedRouteDistanceMeters ??
      (trip.gpsBreadcrumbs.length >= 2
        ? calculateTrailDistanceMeters(trip.gpsBreadcrumbs)
        : 0);
    const durationSeconds = trip.endedAt
      ? Math.max(1, Math.round(
          (new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime()) / 1000,
        ))
      : 0;

    setIsSharing(true);
    try {
      const created = await mobileApi.createRouteShare({
        source: 'planned',
        route: {
          origin: { lat: first[1], lon: first[0] },
          destination: { lat: last[1], lon: last[0] },
          geometryPolyline6: trip.plannedRoutePolyline6,
          distanceMeters,
          durationSeconds,
          routingMode: trip.routingMode,
        },
      });

      const km = (distanceMeters / 1000).toFixed(1);
      const caption = `I rode this ${km} km cycling route on Defensive Pedal — see the route.`;
      // iOS prefers `url` for previews; Android concatenates message+url.
      // Passing both gives the best behavior on both platforms.
      await Share.share(
        {
          message: `${caption}\n${created.webUrl}\nGet Defensive Pedal: ${PLAY_STORE_URL}`,
          url: created.webUrl,
          title: 'Share this ride',
        },
        { dialogTitle: 'Share this ride' },
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Couldn’t share this ride. Try again.';
      setShareToast(message);
    } finally {
      setIsSharing(false);
    }
  }, [isOnline, trip]);

  if (!trip) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ScreenHeader variant="back" title="Trip" />
        <View style={styles.loadingFull}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const plannedColor = trip.routingMode === 'safe' ? safetyColors.safe : safetyColors.danger;
  const hasTrail = trailCoords.length >= 2;
  const hasMapData = hasTrail || (plannedCoords && plannedCoords.length >= 2);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        variant="back"
        title={formatDateLong(trip.startedAt)}
        rightAccessory={
          <Pressable
            onPress={handleShare}
            disabled={isSharing}
            accessibilityRole="button"
            accessibilityLabel={t('share.shareRide')}
            accessibilityState={{ disabled: isSharing }}
            hitSlop={10}
            style={({ pressed }) => [
              styles.headerShareButton,
              pressed && !isSharing && styles.headerShareButtonPressed,
            ]}
          >
            <Ionicons
              name="share-social"
              size={22}
              color={isSharing ? gray[500] : brandColors.textInverse}
            />
          </Pressable>
        }
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!mapInteracting}
      >
        {/* Map — Mapbox gestures (pan, pinch-to-zoom, rotate, pitch) are
           enabled by default. The wrapper View suspends parent ScrollView
           pan while a finger is on the map so Mapbox owns the gesture. */}
        <View
          style={styles.mapSection}
          onTouchStart={handleMapTouchStart}
          onTouchEnd={handleMapTouchEnd}
          onTouchCancel={handleMapTouchEnd}
        >
          {hasMapData ? (
            <RouteMap
              trailCoordinates={hasTrail ? trailCoords : undefined}
              plannedRouteCoordinates={plannedCoords}
              plannedRouteColor={plannedColor}
              showRouteOverlay={false}
              containerStyle={styles.mapInner}
              a11yContext={{ mode: 'historical' }}
            />
          ) : (
            <View style={[styles.mapInner, styles.mapEmpty]}>
              <Ionicons name="map-outline" size={32} color={gray[500]} />
              <Text style={styles.mapEmptyText}>{t('tripsScreen.noGpsTrail')}</Text>
            </View>
          )}
        </View>

        <View style={styles.subHeaderRow}>
          <View style={styles.timeBlock}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={styles.timeText}>{formatTimeRange(trip.startedAt, trip.endedAt)}</Text>
          </View>
          <View
            style={[
              styles.modeBadge,
              { backgroundColor: trip.routingMode === 'safe' ? safetyColors.safe : safetyColors.danger },
            ]}
          >
            <Text style={styles.modeBadgeText}>
              {trip.routingMode === 'safe' ? 'Safe' : trip.routingMode === 'flat' ? 'Flat' : 'Fast'}
            </Text>
          </View>
        </View>

        {/* Elevation — hidden until the chart is meaningful (>=2 samples). */}
        {elevationQuery.isLoading ? (
          <View style={styles.chartSkeleton}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : elevationQuery.data && elevationQuery.data.elevationProfile.length >= 2 ? (
          <ElevationChart
            elevationProfile={elevationQuery.data.elevationProfile}
            distanceMeters={metrics.distanceMeters}
          />
        ) : null}

        {/* Stats grid — server impact when present, derived otherwise. */}
        <View style={styles.statsCard}>
          <Text style={styles.sectionTitle}>Trip stats</Text>
          <View style={styles.statsGrid}>
            <StatTile
              icon="resize-outline"
              iconColor={colors.accent}
              label="Distance"
              value={formatDistance(metrics.distanceMeters)}
              styles={styles}
            />
            <StatTile
              icon="speedometer-outline"
              iconColor={colors.accent}
              label="Avg speed"
              value={speedLabel}
              styles={styles}
            />
            <StatTile
              icon="leaf-outline"
              iconColor={safetyColors.safe}
              label="CO₂ saved"
              value={formatCo2(co2Kg)}
              styles={styles}
            />
            <StatTile
              icon="cash-outline"
              iconColor={safetyColors.safe}
              label="Money saved"
              value={moneyEur !== null ? formatEur(moneyEur) : '—'}
              hint={impactQuery.isLoading && moneyEur === null ? 'Loading…' : undefined}
              styles={styles}
            />
            <StatTile
              icon="heart-outline"
              iconColor={colors.accent}
              label="Life earned"
              value={microlives > 0 ? `+${formatMicrolivesAsTime(microlives)}` : '—'}
              hint={impactQuery.isLoading ? 'Loading…' : undefined}
              styles={styles}
            />
            <StatTile
              icon="people-outline"
              iconColor={colors.accent}
              label="Donated to city"
              value={communitySeconds > 0 ? formatCommunitySeconds(communitySeconds) : '—'}
              hint={impactQuery.isLoading ? 'Loading…' : undefined}
              styles={styles}
            />
          </View>
          <View style={styles.durationRow}>
            <Ionicons name="hourglass-outline" size={14} color={colors.textMuted} />
            <Text style={styles.durationText}>
              {metrics.durationSeconds > 0 ? formatDuration(metrics.durationSeconds) : '—'}
              <Text style={styles.durationCaption}> total time</Text>
            </Text>
          </View>
        </View>

        {/* Badges earned on THIS ride. Section hides when none. */}
        {impactQuery.isLoading && newBadges.length === 0 ? (
          <View style={styles.badgesSkeleton}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : newBadges.length > 0 ? (
          <View style={styles.badgesCard}>
            <Text style={styles.sectionTitle}>Badges earned</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.badgesRow}
            >
              {newBadges.map((badge: BadgeUnlockEvent) => (
                <View key={badge.badgeKey} style={styles.badgeItem}>
                  <BadgeVisual
                    badgeKey={badge.badgeKey}
                    tier={badge.tier ?? 'bronze'}
                    size="md"
                  />
                  <Text style={styles.badgeName} numberOfLines={2}>
                    {badge.name}
                  </Text>
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={() => router.push('/achievements' as any)}>
              <Text style={styles.viewAllLink}>View all achievements ›</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          onPress={handleDelete}
          disabled={deleteMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={t('tripsScreen.deleteAction')}
          accessibilityState={{ disabled: deleteMutation.isPending }}
          style={({ pressed }) => [
            styles.deleteButton,
            pressed && !deleteMutation.isPending && styles.deleteButtonPressed,
            deleteMutation.isPending && styles.deleteButtonDisabled,
          ]}
        >
          <Ionicons
            name="trash-outline"
            size={16}
            color={deleteMutation.isPending ? gray[500] : colors.danger}
          />
          <Text
            style={[
              styles.deleteButtonText,
              deleteMutation.isPending && styles.deleteButtonTextDisabled,
            ]}
          >
            {t('tripsScreen.deleteAction')}
          </Text>
        </Pressable>
      </ScrollView>

      {deleteToast ? (
        <View style={styles.toastContainer} pointerEvents="box-none">
          <Toast
            message={deleteToast}
            variant="warning"
            onDismiss={() => setDeleteToast(null)}
          />
        </View>
      ) : null}
      {shareToast ? (
        <View style={styles.toastContainer} pointerEvents="box-none">
          <Toast
            message={shareToast}
            variant="warning"
            onDismiss={() => setShareToast(null)}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

type StatTileProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  label: string;
  value: string;
  hint?: string;
  styles: ReturnType<typeof createThemedStyles>;
};

const StatTile = ({ icon, iconColor, label, value, hint, styles }: StatTileProps) => (
  <View style={styles.statTile}>
    <View style={styles.statIconRow}>
      <Ionicons name={icon} size={16} color={iconColor} />
      <Text style={styles.statLabel}>{label}</Text>
    </View>
    <Text style={styles.statValue}>{value}</Text>
    {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
  </View>
);

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgDeep },
    scrollContent: {
      paddingBottom: space[8],
      gap: space[3],
    },
    loadingFull: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mapSection: {
      height: MAP_HEIGHT,
      marginHorizontal: space[4],
      borderRadius: radii.xl,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.borderDefault,
      ...shadows.md,
    },
    mapInner: {
      flex: 1,
      borderRadius: 0,
      borderWidth: 0,
    },
    mapEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[2],
      backgroundColor: colors.bgPrimary,
    },
    mapEmptyText: {
      ...textSm,
      color: colors.textMuted,
    },
    subHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space[5],
    },
    timeBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    timeText: {
      ...textSm,
      color: colors.textSecondary,
      fontFamily: fontFamily.body.medium,
    },
    modeBadge: {
      paddingHorizontal: space[3],
      paddingVertical: 2,
      borderRadius: radii.full,
    },
    modeBadgeText: {
      ...textXs,
      color: brandColors.textPrimary,
      fontFamily: fontFamily.heading.bold,
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    chartSkeleton: {
      marginHorizontal: space[4],
      height: 140,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statsCard: {
      marginHorizontal: space[4],
      paddingHorizontal: space[4],
      paddingVertical: space[4],
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgPrimary,
      gap: space[3],
      ...shadows.md,
    },
    sectionTitle: {
      ...textXs,
      fontFamily: fontFamily.heading.semiBold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      fontSize: 11,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[3],
    },
    statTile: {
      // Two-column grid: 50% minus half the gap. flexBasis works around RN's
      // lack of CSS grid; gap is applied by the parent.
      flexBasis: '47%',
      flexGrow: 1,
      gap: 4,
    },
    statIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statLabel: {
      ...textXs,
      color: colors.textMuted,
      fontFamily: fontFamily.body.medium,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      fontSize: 10,
    },
    statValue: {
      ...text2xl,
      fontFamily: fontFamily.mono.bold,
      color: colors.textPrimary,
      fontSize: 22,
    },
    statHint: {
      ...textXs,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
    durationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: space[1],
      paddingTop: space[3],
      borderTopWidth: 1,
      borderTopColor: colors.borderDefault,
    },
    durationText: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    durationCaption: {
      fontFamily: fontFamily.body.regular,
      color: colors.textMuted,
    },
    badgesCard: {
      marginHorizontal: space[4],
      paddingHorizontal: space[4],
      paddingVertical: space[4],
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgPrimary,
      gap: space[3],
      ...shadows.md,
    },
    badgesSkeleton: {
      marginHorizontal: space[4],
      height: 96,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgesRow: {
      flexDirection: 'row',
      gap: space[3],
      paddingVertical: space[1],
    },
    badgeItem: {
      alignItems: 'center',
      width: 84,
      gap: 4,
    },
    badgeName: {
      ...textXs,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    viewAllLink: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.accent,
      textAlign: 'center',
    },
    deleteButton: {
      marginHorizontal: space[4],
      marginTop: space[2],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[2],
      paddingHorizontal: space[3],
      paddingVertical: space[3],
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.danger,
      backgroundColor: 'transparent',
    },
    deleteButtonPressed: {
      opacity: 0.7,
    },
    deleteButtonDisabled: {
      borderColor: gray[400],
      opacity: 0.6,
    },
    deleteButtonText: {
      ...textSm,
      color: colors.danger,
      fontFamily: fontFamily.body.bold,
    },
    deleteButtonTextDisabled: {
      color: gray[500],
    },
    toastContainer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 80,
      alignItems: 'center',
    },
    // Mirrors ScreenHeader.backButton — same 44px yellow accent circle so
    // the share affordance is unmissable. A subtler styling round-tripped
    // through v0.2.50 visibly enough that testers reported "no share
    // button" — the contrast against bgDeep was too low.
    headerShareButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: brandColors.accent,
      ...shadows.sm,
    },
    headerShareButtonPressed: {
      opacity: 0.75,
    },
  });
