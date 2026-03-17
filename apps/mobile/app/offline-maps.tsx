import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../src/components/Screen';
import { StatusCard } from '../src/components/StatusCard';
import { useBackgroundNavigationSnapshot } from '../src/hooks/useBackgroundNavigationSnapshot';
import { mobileEnv } from '../src/lib/env';
import { mobileTheme } from '../src/lib/theme';
import {
  buildOfflineRegionFromRoute,
  deleteOfflineRegion,
  downloadOfflineRegion,
  listOfflineRegions,
} from '../src/lib/offlinePacks';
import { summarizeSelectedRouteOfflineReadiness } from '../src/lib/validationSummary';
import { useAppStore } from '../src/store/appStore';

function MetricBlock({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={[styles.metricBlock, emphasis ? styles.metricBlockAccent : null]}>
      <Text style={[styles.metricLabel, emphasis ? styles.metricLabelAccent : null]}>{label}</Text>
      <Text style={[styles.metricValue, emphasis ? styles.metricValueAccent : null]}>{value}</Text>
    </View>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(progress, 100))}%` }]} />
    </View>
  );
}

export default function OfflineMapsScreen() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

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
      <StatusCard title="Selected route readiness" tone={selectedRouteOfflineSummary.isSelectedRouteReady ? 'accent' : 'default'}>
        <Text style={selectedRouteOfflineSummary.isSelectedRouteReady ? styles.darkText : styles.bodyText}>
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
      </StatusCard>

      <StatusCard title="Ride continuity" tone="accent">
        <Text style={styles.darkText}>
          Active route: {selectedRoute?.id ?? 'No route selected'}
        </Text>
        <Text style={styles.darkText}>Session state: {navigationSession?.state ?? 'idle'}</Text>
        <Text style={styles.darkText}>Background status: {backgroundSnapshot.status.status}</Text>
        <Text style={styles.darkText}>Queued writes: {queuedMutations.length}</Text>
      </StatusCard>

      <StatusCard title="Download route pack">
        <Text style={styles.bodyText}>
          {selectedRoute
            ? 'Create a compact map pack around the selected route so preview and active navigation stay readable through signal loss.'
            : 'Choose a route preview first, then come back here to cache it for offline use.'}
        </Text>
        <View style={styles.actionStack}>
          <Pressable
            style={[
              styles.primaryButton,
              !selectedRoute || !mobileEnv.mapboxPublicToken ? styles.buttonDisabled : null,
            ]}
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
            <Text style={styles.primaryLabel}>
              {selectedRoute ? 'Download selected route pack' : 'Need a selected route'}
            </Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => void refreshOfflineRegions()}>
            <Text style={styles.secondaryLabel}>
              {isRefreshing ? 'Refreshing...' : 'Refresh cached packs'}
            </Text>
          </Pressable>
        </View>
        {!mobileEnv.mapboxPublicToken ? (
          <Text style={styles.helperText}>
            Set `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` to enable native offline pack downloads.
          </Text>
        ) : null}
      </StatusCard>

      {screenError ? (
        <StatusCard title="Offline pack issue" tone="warning">
          <Text style={styles.bodyText}>{screenError}</Text>
        </StatusCard>
      ) : null}

      {offlineRegions.length === 0 ? (
        <StatusCard title="No cached packs yet">
          <Text style={styles.bodyText}>
            No offline packs are cached yet. Download a selected route pack to seed local coverage
            before a ride.
          </Text>
        </StatusCard>
      ) : null}

      {offlineRegions.map((region) => {
        const progress =
          region.progressPercentage !== undefined ? Math.round(region.progressPercentage) : 0;

        return (
          <StatusCard
            key={region.id}
            title={region.name}
            tone={region.status === 'ready' ? 'accent' : region.status === 'failed' ? 'warning' : 'default'}
          >
            <Text style={region.status === 'ready' ? styles.darkText : styles.bodyText}>
              Status: {region.status}
            </Text>
            <ProgressBar progress={progress} />
            <View style={styles.regionMeta}>
              <Text style={region.status === 'ready' ? styles.darkText : styles.bodyText}>
                Progress: {region.progressPercentage !== undefined ? `${progress}%` : 'Waiting'}
              </Text>
              <Text style={region.status === 'ready' ? styles.darkText : styles.bodyText}>
                Zoom: {region.minZoom} - {region.maxZoom}
              </Text>
              <Text style={region.status === 'ready' ? styles.darkText : styles.bodyText}>
                Resources:{' '}
                {region.completedResourceCount !== undefined && region.requiredResourceCount !== undefined
                  ? `${region.completedResourceCount}/${region.requiredResourceCount}`
                  : 'Unknown'}
              </Text>
            </View>
            {region.error ? <Text style={styles.bodyText}>{region.error}</Text> : null}
            <Pressable
              style={styles.inlineButton}
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
              <Text style={styles.inlineButtonLabel}>Delete pack</Text>
            </Pressable>
          </StatusCard>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  darkText: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 15,
    lineHeight: 21,
  },
  bodyText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  helperText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricBlock: {
    minWidth: 132,
    flexGrow: 1,
    borderRadius: mobileTheme.radii.md,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  metricBlockAccent: {
    backgroundColor: 'rgba(250, 204, 21, 0.14)',
  },
  metricLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metricLabelAccent: {
    color: '#fef3c7',
  },
  metricValue: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
  },
  metricValueAccent: {
    color: mobileTheme.colors.textOnDark,
  },
  actionStack: {
    gap: 10,
  },
  primaryButton: {
    borderRadius: 22,
    backgroundColor: mobileTheme.colors.brand,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryLabel: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryLabel: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 16,
    fontWeight: '800',
  },
  buttonDisabled: {
    backgroundColor: '#8f9bad',
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.12)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: mobileTheme.colors.brand,
  },
  regionMeta: {
    gap: 4,
  },
  inlineButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inlineButtonLabel: {
    color: mobileTheme.colors.textPrimary,
    fontWeight: '800',
  },
});
