import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../src/components/Screen';
import { StatusCard } from '../src/components/StatusCard';
import { useBackgroundNavigationSnapshot } from '../src/hooks/useBackgroundNavigationSnapshot';
import { mobileEnv } from '../src/lib/env';
import { listOfflineRegions } from '../src/lib/offlinePacks';
import { mobileTheme } from '../src/lib/theme';
import {
  summarizeBackgroundMovement,
  summarizeSelectedRouteOfflineReadiness,
} from '../src/lib/validationSummary';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';

type ApiHealthResponse = {
  ok: boolean;
  service: string;
  sharedStoreBackend?: string;
  generatedAt: string;
};

const API_HEALTH_TIMEOUT_MS = 5000;

const getApiHealthHeaders = () =>
  mobileEnv.usesNgrokTunnel
    ? {
        'ngrok-skip-browser-warning': 'true',
      }
    : undefined;

type QueueActionSnapshot = {
  pressInCount: number;
  lastPressInAt: string | null;
  lastAttemptAt: string | null;
  lastResult: 'idle' | 'blocked' | 'queued' | 'failed';
  lastClientTripId: string | null;
  lastMutationCount: number;
  lastError: string | null;
};

const loadApiHealthViaFetch = async (baseUrl: string) => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, API_HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, {
      method: 'GET',
      headers: getApiHealthHeaders(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Health check failed with ${response.status}.`);
    }

    return (await response.json()) as ApiHealthResponse;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Health check timed out after ${API_HEALTH_TIMEOUT_MS / 1000} seconds.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const loadApiHealthViaXmlHttpRequest = (baseUrl: string) =>
  new Promise<ApiHealthResponse>((resolve, reject) => {
    if (typeof XMLHttpRequest === 'undefined') {
      reject(new Error('XMLHttpRequest is unavailable in this runtime.'));
      return;
    }

    const request = new XMLHttpRequest();
    request.open('GET', `${baseUrl.replace(/\/$/, '')}/health`, true);
    request.timeout = API_HEALTH_TIMEOUT_MS;

    if (mobileEnv.usesNgrokTunnel) {
      request.setRequestHeader('ngrok-skip-browser-warning', 'true');
    }

    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`Health check failed with ${request.status}.`));
        return;
      }

      try {
        resolve(JSON.parse(request.responseText) as ApiHealthResponse);
      } catch {
        reject(new Error('Health check returned invalid JSON.'));
      }
    };

    request.onerror = () => {
      reject(new Error('Health check failed.'));
    };

    request.ontimeout = () => {
      reject(
        new Error(`Health check timed out after ${API_HEALTH_TIMEOUT_MS / 1000} seconds.`),
      );
    };

    request.send();
  });

const loadApiHealth = async (baseUrl: string) => {
  let lastError: unknown = null;

  if (typeof fetch === 'function') {
    try {
      return await loadApiHealthViaFetch(baseUrl);
    } catch (error) {
      lastError = error;
    }
  }

  try {
    return await loadApiHealthViaXmlHttpRequest(baseUrl);
  } catch (error) {
    if (lastError instanceof Error) {
      throw new Error(`${lastError.message} ${error instanceof Error ? error.message : ''}`.trim());
    }

    throw error;
  }
};

function MetricBlock({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={[styles.metricTile, emphasis ? styles.metricTileAccent : null]}>
      <Text style={[styles.metricLabel, emphasis ? styles.metricLabelAccent : null]}>{label}</Text>
      <Text style={[styles.metricValue, emphasis ? styles.metricValueAccent : null]}>{value}</Text>
    </View>
  );
}

export default function DiagnosticsScreen() {
  const { user, session } = useAuthSession();
  const backgroundSnapshot = useBackgroundNavigationSnapshot();
  const queuedMutations = useAppStore((state) => state.queuedMutations);
  const offlineRegions = useAppStore((state) => state.offlineRegions);
  const navigationSession = useAppStore((state) => state.navigationSession);
  const routePreview = useAppStore((state) => state.routePreview);
  const selectedRouteId = useAppStore((state) => state.selectedRouteId);
  const queueDeveloperValidationWrites = useAppStore(
    (state) => state.queueDeveloperValidationWrites,
  );

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [devStatusMessage, setDevStatusMessage] = useState<string | null>(null);
  const [foregroundPermission, setForegroundPermission] = useState<string>('unknown');
  const [backgroundPermission, setBackgroundPermission] = useState<string>('unknown');
  const [apiHealth, setApiHealth] = useState<ApiHealthResponse | null>(null);
  const [nativeOfflinePackCount, setNativeOfflinePackCount] = useState<number | null>(null);
  const [queueActionSnapshot, setQueueActionSnapshot] = useState<QueueActionSnapshot>({
    pressInCount: 0,
    lastPressInAt: null,
    lastAttemptAt: null,
    lastResult: 'idle',
    lastClientTripId: null,
    lastMutationCount: 0,
    lastError: null,
  });

  const movementSummary = summarizeBackgroundMovement(backgroundSnapshot.locationHistory);
  const selectedRouteOfflineSummary = summarizeSelectedRouteOfflineReadiness(
    selectedRouteId,
    offlineRegions,
  );

  const handleQueuePressIn = () => {
    const pressedAt = new Date().toISOString();
    setQueueActionSnapshot((current) => ({
      ...current,
      pressInCount: current.pressInCount + 1,
      lastPressInAt: pressedAt,
    }));
  };

  const queueSampleWrites = () => {
    const attemptedAt = new Date().toISOString();

    if (!user) {
      setDevStatusMessage('Sign in first, then queue sample writes for sync validation.');
      setQueueActionSnapshot((current) => ({
        ...current,
        lastAttemptAt: attemptedAt,
        lastResult: 'blocked',
        lastClientTripId: null,
        lastMutationCount: 0,
        lastError: 'User is not signed in.',
      }));
      return;
    }

    try {
      const result = queueDeveloperValidationWrites();
      setDevStatusMessage('Queued sample trip, hazard, feedback, and trip-end writes.');
      setQueueActionSnapshot((current) => ({
        ...current,
        lastAttemptAt: attemptedAt,
        lastResult: 'queued',
        lastClientTripId: result.clientTripId,
        lastMutationCount: result.mutationIds.length,
        lastError: null,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to queue sample writes.';
      setDevStatusMessage(errorMessage);
      setQueueActionSnapshot((current) => ({
        ...current,
        lastAttemptAt: attemptedAt,
        lastResult: 'failed',
        lastClientTripId: null,
        lastMutationCount: 0,
        lastError: errorMessage,
      }));
    }
  };

  const refreshDiagnostics = async () => {
    setIsRefreshing(true);
    setScreenError(null);

    try {
      const [foreground, background] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
      ]);
      setForegroundPermission(foreground.status);
      setBackgroundPermission(background.status);

      backgroundSnapshot.refresh();

      if (mobileEnv.mobileApiUrl) {
        setApiHealth(await loadApiHealth(mobileEnv.mobileApiUrl));
      } else {
        setApiHealth(null);
      }

      if (mobileEnv.mapboxPublicToken) {
        setNativeOfflinePackCount((await listOfflineRegions()).length);
      } else {
        setNativeOfflinePackCount(null);
      }
    } catch (error) {
      setScreenError(error instanceof Error ? error.message : 'Diagnostics refresh failed.');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void refreshDiagnostics();
  }, []);

  const queueDetail =
    queuedMutations.length > 0
      ? queuedMutations
          .map((mutation) =>
            mutation.lastError
              ? `${mutation.type}:${mutation.status} (${mutation.lastError})`
              : `${mutation.type}:${mutation.status}`,
          )
          .join(', ')
      : 'none';

  return (
    <Screen
      title="Diagnostics"
      eyebrow="Validation"
      subtitle="This remains the QA control room, but it now uses the same visual hierarchy as the rider-facing app instead of dropping into a plain utility page."
    >
      <StatusCard title="Health at a glance" tone={apiHealth?.ok ? 'accent' : 'default'}>
        <View style={styles.metricGrid}>
          <MetricBlock label="API" value={apiHealth?.ok ? 'Reachable' : 'Unavailable'} emphasis={Boolean(apiHealth?.ok)} />
          <MetricBlock label="Foreground" value={foregroundPermission} />
          <MetricBlock label="Background" value={backgroundPermission} />
          <MetricBlock label="Queue" value={`${queuedMutations.length} pending`} />
        </View>
        <Text style={apiHealth?.ok ? styles.darkText : styles.bodyText}>
          Shared store backend: {apiHealth?.sharedStoreBackend ?? 'Unknown'}
        </Text>
        <Text style={apiHealth?.ok ? styles.darkText : styles.bodyText}>
          Generated:{' '}
          {apiHealth?.generatedAt ? new Date(apiHealth.generatedAt).toLocaleTimeString() : 'Not available'}
        </Text>
      </StatusCard>

      <StatusCard title="Environment">
        <Text style={styles.bodyText}>App variant: {mobileEnv.appVariant}</Text>
        <Text style={styles.bodyText}>App environment: {mobileEnv.appEnv}</Text>
        <Text style={styles.bodyText}>Mobile API URL: {mobileEnv.mobileApiUrl || 'Not set'}</Text>
        <Text style={styles.bodyText}>
          Mapbox token configured: {mobileEnv.mapboxPublicToken ? 'Yes' : 'No'}
        </Text>
        <Text style={styles.bodyText}>
          Validation bundle: {mobileEnv.validationBundleId || 'Not set'}
        </Text>
        <Text style={styles.bodyText}>
          Validation mode: {mobileEnv.validationMode || 'Not set'}
        </Text>
        <Text style={styles.bodyText}>
          Validation Metro port: {mobileEnv.validationMetroPort || 'Default'}
        </Text>
        <Text style={styles.bodyText}>
          Validation source: {mobileEnv.validationSourceRoot || 'Not set'}
        </Text>
        <Text style={styles.bodyText}>Signed in: {user ? user.email ?? user.id : 'No'}</Text>
        <Text style={styles.bodyText}>Auth provider: {session?.provider ?? 'none'}</Text>
      </StatusCard>

      <StatusCard
        title="Background navigation"
        tone={backgroundSnapshot.status.status === 'active' ? 'accent' : 'default'}
      >
        <View style={styles.metricGrid}>
          <MetricBlock
            label="Status"
            value={backgroundSnapshot.status.status}
            emphasis={backgroundSnapshot.status.status === 'active'}
          />
          <MetricBlock
            label="Movement"
            value={movementSummary.movementDetected ? 'Detected' : 'None'}
            emphasis={movementSummary.movementDetected}
          />
          <MetricBlock label="Samples" value={`${movementSummary.sampleCount}`} />
          <MetricBlock label="Distance" value={`${movementSummary.totalDistanceMeters} m`} />
        </View>
        <Text
          style={backgroundSnapshot.status.status === 'active' ? styles.darkText : styles.bodyText}
        >
          Updated: {new Date(backgroundSnapshot.status.updatedAt).toLocaleTimeString()}
        </Text>
        <Text
          style={backgroundSnapshot.status.status === 'active' ? styles.darkText : styles.bodyText}
        >
          Latest fix:{' '}
          {backgroundSnapshot.latestLocation
            ? new Date(backgroundSnapshot.latestLocation.timestamp).toLocaleTimeString()
            : 'None'}
        </Text>
        <Text
          style={backgroundSnapshot.status.status === 'active' ? styles.darkText : styles.bodyText}
        >
          Straight-line movement: {movementSummary.straightLineDistanceMeters} m
        </Text>
        <Text
          style={backgroundSnapshot.status.status === 'active' ? styles.darkText : styles.bodyText}
        >
          Movement window: {movementSummary.durationSeconds}s
        </Text>
        {backgroundSnapshot.status.error ? (
          <Text style={styles.bodyText}>{backgroundSnapshot.status.error}</Text>
        ) : null}
        <Text style={styles.helperText}>
          For the locked-screen ride check, start navigation, lock the phone, move for at least a
          minute, then refresh here and confirm movement is detected.
        </Text>
      </StatusCard>

      <StatusCard title="Offline and queue state">
        <View style={styles.metricGrid}>
          <MetricBlock label="Route previews" value={`${routePreview?.routes.length ?? 0}`} />
          <MetricBlock label="Selected route" value={selectedRouteId ? 'Present' : 'None'} />
          <MetricBlock
            label="Offline-ready"
            value={selectedRouteOfflineSummary.isSelectedRouteReady ? 'Yes' : 'No'}
            emphasis={selectedRouteOfflineSummary.isSelectedRouteReady}
          />
          <MetricBlock label="Native packs" value={nativeOfflinePackCount !== null ? `${nativeOfflinePackCount}` : 'Unavailable'} />
        </View>
        <Text style={styles.bodyText}>
          Selected route matching packs: {selectedRouteOfflineSummary.matchingRegionCount}
        </Text>
        <Text style={styles.bodyText}>
          Selected route ready packs: {selectedRouteOfflineSummary.readyRegionCount}
        </Text>
        <Text style={styles.bodyText}>
          Selected route pack updated:{' '}
          {selectedRouteOfflineSummary.latestReadyAt
            ? new Date(selectedRouteOfflineSummary.latestReadyAt).toLocaleTimeString()
            : 'None'}
        </Text>
        <Text style={styles.bodyText}>In-app offline regions: {offlineRegions.length}</Text>
        <Text style={styles.bodyText}>Active session: {navigationSession?.state ?? 'idle'}</Text>
        <Text style={styles.bodyText}>Queue detail: {queueDetail}</Text>
      </StatusCard>

      {screenError ? (
        <StatusCard title="Diagnostics issue" tone="warning">
          <Text style={styles.bodyText}>{screenError}</Text>
        </StatusCard>
      ) : null}

      {mobileEnv.appEnv !== 'production' ? (
        <StatusCard title="Developer validation">
          <Text style={styles.bodyText}>
            Use this in development to queue authenticated sample writes, then toggle network off
            and back on to confirm the offline sync manager drains the queue.
          </Text>
          <View style={styles.metricGrid}>
            <MetricBlock label="Signed in for writes" value={user ? 'Yes' : 'No'} />
            <MetricBlock label="Last result" value={queueActionSnapshot.lastResult} />
            <MetricBlock label="Press count" value={`${queueActionSnapshot.pressInCount}`} />
            <MetricBlock label="Mutation count" value={`${queueActionSnapshot.lastMutationCount}`} />
          </View>
          <Text style={styles.bodyText}>
            Last press:{' '}
            {queueActionSnapshot.lastPressInAt
              ? new Date(queueActionSnapshot.lastPressInAt).toLocaleTimeString()
              : 'Never'}
          </Text>
          <Text style={styles.bodyText}>
            Last attempt:{' '}
            {queueActionSnapshot.lastAttemptAt
              ? new Date(queueActionSnapshot.lastAttemptAt).toLocaleTimeString()
              : 'Never'}
          </Text>
          <Text style={styles.bodyText}>
            Last client trip: {queueActionSnapshot.lastClientTripId ?? 'None'}
          </Text>
          <Text style={styles.bodyText}>
            Last error: {queueActionSnapshot.lastError ?? 'None'}
          </Text>
          {devStatusMessage ? <Text style={styles.helperText}>{devStatusMessage}</Text> : null}
          <View style={styles.buttonRow}>
            <Pressable
              style={styles.secondaryButton}
              accessibilityRole="button"
              accessibilityLabel="Queue sample writes"
              testID="queue-sample-writes-button"
              hitSlop={10}
              onPressIn={handleQueuePressIn}
              onPress={queueSampleWrites}
            >
              <Text style={styles.secondaryLabel}>Queue sample writes</Text>
            </Pressable>
          </View>
        </StatusCard>
      ) : null}

      <View style={styles.buttonRow}>
        <Pressable style={styles.primaryButton} onPress={() => void refreshDiagnostics()}>
          <Text style={styles.primaryLabel}>
            {isRefreshing ? 'Refreshing...' : 'Refresh diagnostics'}
          </Text>
        </Pressable>
      </View>
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
  metricTile: {
    minWidth: 132,
    flexGrow: 1,
    borderRadius: mobileTheme.radii.md,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  metricTileAccent: {
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
  buttonRow: {
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
});
