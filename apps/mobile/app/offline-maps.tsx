import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '../src/components/Screen';
import { useBackgroundNavigationSnapshot } from '../src/hooks/useBackgroundNavigationSnapshot';
import { mobileEnv } from '../src/lib/env';
import {
  buildOfflineRegionFromRoute,
  deleteOfflineRegion,
  downloadOfflineRegion,
  listOfflineRegions,
} from '../src/lib/offlinePacks';
import { summarizeSelectedRouteOfflineReadiness } from '../src/lib/validationSummary';
import { useAppStore } from '../src/store/appStore';

import { useTheme } from '../src/design-system/ThemeContext';
import { Button, Badge } from '../src/design-system/atoms';
import { safetyColors } from '../src/design-system/tokens/colors';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { brandTints, surfaceTints } from '../src/design-system/tokens/tints';
import {
  fontFamily,
  textBase,
  textSm,
  textXs,
  textLg,
  textXl,
} from '../src/design-system/tokens/typography';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Estimated average tile size in bytes (~15 KB). */
const ESTIMATED_TILE_SIZE_BYTES = 15 * 1024;

/** Storage cap in bytes (200 MB). */
const STORAGE_CAP_BYTES = 200 * 1024 * 1024;

/** Format bytes to human-readable MB string. */
const formatMB = (bytes: number): string =>
  `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** Format a date as a human-readable "time ago" string. */
const formatTimeAgo = (date: Date): string => {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

/** Get storage bar color based on usage fraction. */
const getStorageColor = (fraction: number): string => {
  if (fraction < 0.5) return safetyColors.safe;
  if (fraction < 0.8) return safetyColors.caution;
  return safetyColors.danger;
};

function MetricBlock({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.metricBlock,
        { backgroundColor: emphasis ? brandTints.accentMedium : surfaceTints.trackDim },
      ]}
    >
      <Text
        style={[
          styles.metricLabel,
          { color: emphasis ? colors.accentText : colors.textMuted },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.metricValue,
          { color: emphasis ? colors.textPrimary : colors.textPrimary },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  const { colors } = useTheme();

  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          { width: `${Math.max(0, Math.min(progress, 100))}%`, backgroundColor: colors.accent },
        ]}
      />
    </View>
  );
}

function Card({
  title,
  tone = 'default',
  children,
}: {
  title: string;
  tone?: 'default' | 'accent' | 'warning';
  children: React.ReactNode;
}) {
  const { colors } = useTheme();

  const bgMap = {
    default: colors.bgSecondary,
    accent: colors.accent,
    warning: colors.cautionTint,
  };

  const titleColorMap = {
    default: colors.textPrimary,
    accent: colors.textInverse,
    warning: colors.cautionText,
  };

  return (
    <View style={[styles.card, { backgroundColor: bgMap[tone] }, shadows.md]}>
      <Text style={[styles.cardTitle, { color: titleColorMap[tone] }]}>{title}</Text>
      {children}
    </View>
  );
}

function StorageOverview({ totalBytes }: { totalBytes: number }) {
  const { colors } = useTheme();
  const fraction = Math.min(totalBytes / STORAGE_CAP_BYTES, 1);
  const barColor = getStorageColor(fraction);

  return (
    <View style={[styles.card, { backgroundColor: colors.bgSecondary }, shadows.md]}>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Storage</Text>
      <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
        {formatMB(totalBytes)} used of {formatMB(STORAGE_CAP_BYTES)}
      </Text>
      <View style={styles.storageBarTrack}>
        <View
          style={[
            styles.storageBarFill,
            { width: `${Math.max(fraction * 100, 1)}%`, backgroundColor: barColor },
          ]}
        />
      </View>
      <Text style={[styles.helperText, { color: colors.textMuted }]}>
        Packs older than 5 days are automatically removed. Storage capped at 200 MB.
      </Text>
    </View>
  );
}

export default function OfflineMapsScreen() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  const { colors } = useTheme();

  const routePreview = useAppStore((state) => state.routePreview);
  const selectedRouteId = useAppStore((state) => state.selectedRouteId);
  const offlineRegions = useAppStore((state) => state.offlineRegions);
  const queuedMutations = useAppStore((state) => state.queuedMutations);
  const navigationSession = useAppStore((state) => state.navigationSession);
  const setOfflineRegions = useAppStore((state) => state.setOfflineRegions);
  const upsertOfflineRegion = useAppStore((state) => state.upsertOfflineRegion);
  const removeOfflineRegion = useAppStore((state) => state.removeOfflineRegion);
  const backgroundSnapshot = useBackgroundNavigationSnapshot();

  const selectedRoute =
    routePreview?.routes.find((route) => route.id === selectedRouteId) ?? routePreview?.routes[0] ?? null;
  const selectedRouteOfflineSummary = summarizeSelectedRouteOfflineReadiness(
    selectedRoute?.id ?? null,
    offlineRegions,
  );

  // Calculate total storage used across all offline packs
  const totalStorageBytes = useMemo(() => {
    return offlineRegions.reduce((acc, region) => {
      const count = region.completedResourceCount ?? 0;
      return acc + count * ESTIMATED_TILE_SIZE_BYTES;
    }, 0);
  }, [offlineRegions]);

  const refreshOfflineRegions = async () => {
    if (!mobileEnv.mapboxPublicToken) {
      return;
    }

    setIsRefreshing(true);
    setScreenError(null);

    try {
      setOfflineRegions(await listOfflineRegions());
    } catch (error) {
      setScreenError(error instanceof Error ? error.message : 'Failed to load offline packs.');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void refreshOfflineRegions();
  }, []);

  return (
    <Screen
      title="Offline Maps"
      eyebrow="Keep riding"
      subtitle="This surface now mirrors the web app more closely: one clear readiness signal, a primary download action, and visible pack progress."
    >
      {offlineRegions.length > 0 ? (
        <StorageOverview totalBytes={totalStorageBytes} />
      ) : null}

      <Card title="Selected route readiness" tone={selectedRouteOfflineSummary.isSelectedRouteReady ? 'accent' : 'default'}>
        <Text style={[styles.bodyText, selectedRouteOfflineSummary.isSelectedRouteReady ? { color: colors.textInverse } : { color: colors.textSecondary }]}>
          {selectedRouteOfflineSummary.isSelectedRouteReady
            ? 'Your selected route is ready for an offline ride.'
            : 'Download a pack for the selected route before going offline.'}
        </Text>
        <View style={styles.metricGrid}>
          <MetricBlock
            label="Offline-ready"
            value={selectedRouteOfflineSummary.isSelectedRouteReady ? 'Yes' : 'No'}
            emphasis={selectedRouteOfflineSummary.isSelectedRouteReady}
          />
          <MetricBlock
            label="Matching packs"
            value={`${selectedRouteOfflineSummary.matchingRegionCount}`}
          />
          <MetricBlock
            label="Ready packs"
            value={`${selectedRouteOfflineSummary.readyRegionCount}`}
          />
          <MetricBlock
            label="Last update"
            value={
              selectedRouteOfflineSummary.latestReadyAt
                ? new Date(selectedRouteOfflineSummary.latestReadyAt).toLocaleTimeString()
                : 'Not yet'
            }
          />
        </View>
      </Card>

      <Card title="Ride continuity" tone="accent">
        <Text style={[styles.bodyText, { color: colors.textInverse }]}>
          Active route: {selectedRoute?.id ?? 'No route selected'}
        </Text>
        <Text style={[styles.bodyText, { color: colors.textInverse }]}>Session state: {navigationSession?.state ?? 'idle'}</Text>
        <Text style={[styles.bodyText, { color: colors.textInverse }]}>Background status: {backgroundSnapshot.status.status}</Text>
        <Text style={[styles.bodyText, { color: colors.textInverse }]}>Queued writes: {queuedMutations.length}</Text>
      </Card>

      <Card title="Download route pack">
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          {selectedRoute
            ? 'Create a compact map pack around the selected route so preview and active navigation stay readable through signal loss.'
            : 'Choose a route preview first, then come back here to cache it for offline use.'}
        </Text>
        <View style={styles.actionStack}>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!selectedRoute || !mobileEnv.mapboxPublicToken}
            onPress={() => {
              if (!selectedRoute) {
                return;
              }

              setScreenError(null);
              void downloadOfflineRegion(
                buildOfflineRegionFromRoute(selectedRoute),
                upsertOfflineRegion,
              ).catch((error) => {
                setScreenError(
                  error instanceof Error ? error.message : 'Offline pack download failed.',
                );
              });
            }}
          >
            {selectedRoute ? 'Download selected route pack' : 'Need a selected route'}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onPress={() => void refreshOfflineRegions()}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh cached packs'}
          </Button>
        </View>
        {!mobileEnv.mapboxPublicToken ? (
          <Text style={[styles.helperText, { color: colors.textMuted }]}>
            Set `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` to enable native offline pack downloads.
          </Text>
        ) : null}
      </Card>

      {screenError ? (
        <Card title="Offline pack issue" tone="warning">
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{screenError}</Text>
        </Card>
      ) : null}

      {offlineRegions.length === 0 ? (
        <Card title="No cached packs yet">
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            No offline packs are cached yet. Download a selected route pack to seed local coverage
            before a ride.
          </Text>
        </Card>
      ) : null}

      {offlineRegions.map((region) => {
        const progress =
          region.progressPercentage !== undefined ? Math.round(region.progressPercentage) : 0;

        return (
          <Card
            key={region.id}
            title={region.name}
            tone={region.status === 'ready' ? 'accent' : region.status === 'failed' ? 'warning' : 'default'}
          >
            <View style={styles.statusRow}>
              <Badge
                variant={
                  region.status === 'ready'
                    ? 'risk-safe'
                    : region.status === 'failed'
                      ? 'risk-danger'
                      : 'neutral'
                }
                size="sm"
              >
                {region.status}
              </Badge>
            </View>
            <ProgressBar progress={progress} />
            <View style={styles.regionMeta}>
              {region.updatedAt ? (
                <Text style={[styles.metaText, { color: region.status === 'ready' ? colors.textInverse : colors.textSecondary }]}>
                  Downloaded {formatTimeAgo(new Date(region.updatedAt))}
                </Text>
              ) : null}
              <Text style={[styles.metaText, { color: region.status === 'ready' ? colors.textInverse : colors.textSecondary }]}>
                Progress: {region.progressPercentage !== undefined ? `${progress}%` : 'Waiting'}
              </Text>
              <Text style={[styles.metaText, { color: region.status === 'ready' ? colors.textInverse : colors.textSecondary }]}>
                Zoom: {region.minZoom} - {region.maxZoom}
              </Text>
              <Text style={[styles.metaText, { color: region.status === 'ready' ? colors.textInverse : colors.textSecondary }]}>
                Resources:{' '}
                {region.completedResourceCount !== undefined && region.requiredResourceCount !== undefined
                  ? `${region.completedResourceCount}/${region.requiredResourceCount}`
                  : 'Unknown'}
              </Text>
              {region.completedResourceCount != null ? (
                <Text style={[styles.metaText, { color: region.status === 'ready' ? colors.textInverse : colors.textSecondary }]}>
                  Size: ~{formatMB(region.completedResourceCount * ESTIMATED_TILE_SIZE_BYTES)}
                </Text>
              ) : null}
            </View>
            {region.error ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{region.error}</Text> : null}
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                setScreenError(null);
                void deleteOfflineRegion(region.id)
                  .then(() => {
                    removeOfflineRegion(region.id);
                  })
                  .catch((error) => {
                    setScreenError(
                      error instanceof Error ? error.message : 'Failed to delete offline pack.',
                    );
                  });
              }}
            >
              Delete pack
            </Button>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    ...textSm,
    lineHeight: 21,
  },
  helperText: {
    ...textXs,
    lineHeight: 18,
  },
  metaText: {
    ...textSm,
    lineHeight: 21,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2] + 2, // 10
  },
  metricBlock: {
    minWidth: 132,
    flexGrow: 1,
    borderRadius: radii.md,
    paddingHorizontal: space[3] + 2, // 14
    paddingVertical: space[3],
    gap: space[1],
  },
  metricLabel: {
    fontFamily: fontFamily.body.semiBold,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metricValue: {
    fontFamily: fontFamily.heading.extraBold,
    fontSize: 17,
    fontWeight: '900',
  },
  actionStack: {
    gap: space[2] + 2, // 10
  },
  progressTrack: {
    height: space[2] + 2, // 10
    borderRadius: radii.full,
    backgroundColor: surfaceTints.trackDim,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radii.full,
  },
  regionMeta: {
    gap: space[1],
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  card: {
    borderRadius: radii.xl,
    padding: space[4],
    gap: space[3],
  },
  cardTitle: {
    ...textXl,
    fontWeight: '900',
  },
  storageBarTrack: {
    height: space[2] + 2,
    borderRadius: radii.full,
    backgroundColor: surfaceTints.trackDim,
    overflow: 'hidden',
  },
  storageBarFill: {
    height: '100%',
    borderRadius: radii.full,
  },
});
