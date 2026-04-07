import type { TripHistoryItem } from '@defensivepedal/core';
import { calculateCo2SavedKg, calculateTrailDistanceMeters, decodePolyline } from '@defensivepedal/core';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme, type ThemeColors } from '..';
import { Co2Badge } from '../atoms/Co2Badge';
import { RouteMap } from '../../components/map';
import { safetyColors, gray } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textSm, textXs } from '../tokens/typography';

type TripCardProps = {
  readonly trip: TripHistoryItem;
  readonly expanded: boolean;
  readonly onToggle: () => void;
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDuration = (start: string, end: string | null): string => {
  if (!end) return '—';
  const totalMin = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hours}h ${mins}m`;
};

const formatDistance = (meters?: number): string => {
  if (!meters) return '—';
  return `${(meters / 1000).toFixed(1)} km`;
};

const endReasonIcon = (reason: string): { name: keyof typeof Ionicons.glyphMap; color: string } => {
  switch (reason) {
    case 'completed':
      return { name: 'checkmark-circle', color: safetyColors.safe };
    case 'stopped':
      return { name: 'close-circle', color: safetyColors.caution };
    case 'app_killed':
      return { name: 'warning', color: safetyColors.danger };
    default:
      return { name: 'ellipsis-horizontal', color: gray[500] };
  }
};

export const TripCard = ({ trip, expanded, onToggle }: TripCardProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const icon = endReasonIcon(trip.endReason);
  const hasGpsTrail = trip.gpsBreadcrumbs.length > 0;

  const trailCoords = useMemo<[number, number][]>(
    () => trip.gpsBreadcrumbs.map((pt) => [pt.lon, pt.lat]),
    [trip.gpsBreadcrumbs],
  );

  const plannedRouteCoords = useMemo<[number, number][] | undefined>(() => {
    if (!trip.plannedRoutePolyline6) return undefined;
    try {
      return decodePolyline(trip.plannedRoutePolyline6);
    } catch {
      return undefined;
    }
  }, [trip.plannedRoutePolyline6]);

  const plannedRouteColor = trip.routingMode === 'safe' ? safetyColors.safe : '#EF4444';

  return (
    <View style={styles.card}>
      <Pressable onPress={onToggle} style={styles.row}>
        <View style={styles.dateCol}>
          <Text style={styles.dateText}>{formatDate(trip.startedAt)}</Text>
          <Text style={styles.timeText}>{formatTime(trip.startedAt)}</Text>
        </View>

        <View style={styles.metricsCol}>
          <View style={styles.metric}>
            <Ionicons name="resize-outline" size={14} color={gray[400]} />
            <Text style={styles.metricText}>{formatDistance(
              trip.distanceMeters
                ?? (trip.gpsBreadcrumbs.length >= 2
                  ? calculateTrailDistanceMeters(trip.gpsBreadcrumbs)
                  : trip.plannedRouteDistanceMeters ?? 0)
            )}</Text>
          </View>
          <View style={styles.metric}>
            <Ionicons name="time-outline" size={14} color={gray[400]} />
            <Text style={styles.metricText}>{formatDuration(trip.startedAt, trip.endedAt)}</Text>
          </View>
          <Co2Badge co2SavedKg={calculateCo2SavedKg(
            trip.gpsBreadcrumbs.length >= 2
              ? calculateTrailDistanceMeters(trip.gpsBreadcrumbs)
              : trip.plannedRouteDistanceMeters ?? 0
          )} size="sm" />
        </View>

        <View style={styles.badgeCol}>
          <View style={[styles.modeBadge, { backgroundColor: trip.routingMode === 'safe' ? safetyColors.safe : '#EF4444' }]}>
            <Text style={styles.modeBadgeText}>{trip.routingMode === 'safe' ? 'Safe' : 'Fast'}</Text>
          </View>
          <Ionicons name={icon.name} size={18} color={icon.color} />
        </View>

        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>

      {expanded && trailCoords.length >= 2 ? (
        <View style={styles.mapContainer}>
          <RouteMap
            trailCoordinates={trailCoords}
            plannedRouteCoordinates={plannedRouteCoords}
            plannedRouteColor={plannedRouteColor}
            showRouteOverlay={false}
            containerStyle={styles.mapInner}
          />
        </View>
      ) : null}

    </View>
  );
};

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgPrimary,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      gap: space[3],
    },
    dateCol: {
      flex: 1,
      gap: 2,
    },
    dateText: {
      ...textSm,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
    },
    timeText: {
      ...textXs,
      color: colors.textMuted,
    },
    metricsCol: {
      gap: 4,
      alignItems: 'flex-end',
    },
    metric: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    metricText: {
      ...textXs,
      color: colors.textSecondary,
      fontFamily: fontFamily.body.medium,
    },
    badgeCol: {
      alignItems: 'center',
      gap: 4,
    },
    modeBadge: {
      paddingHorizontal: space[2],
      paddingVertical: 2,
      borderRadius: radii.full,
    },
    modeBadgeText: {
      ...textXs,
      color: '#FFFFFF',
      fontFamily: fontFamily.heading.bold,
      fontSize: 10,
      textTransform: 'uppercase',
    },
    mapContainer: {
      height: 200,
      borderTopWidth: 1,
      borderTopColor: colors.borderDefault,
    },
    mapInner: {
      flex: 1,
      borderRadius: 0,
      borderWidth: 0,
    },
  });
