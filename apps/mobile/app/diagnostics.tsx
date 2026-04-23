import * as Location from 'expo-location';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '../src/components/Screen';
import { Badge } from '../src/design-system/atoms';
import { Button } from '../src/design-system/atoms';
import { useTheme } from '../src/design-system/ThemeContext';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { space } from '../src/design-system/tokens/spacing';
import {
  fontFamily,
  textDataSm,
  textSm,
  textXl,
  textXs,
} from '../src/design-system/tokens/typography';
import { useBackgroundNavigationSnapshot } from '../src/hooks/useBackgroundNavigationSnapshot';
import { mobileEnv } from '../src/lib/env';
import { listOfflineRegions } from '../src/lib/offlinePacks';
import { storageEngineKind } from '../src/lib/storage';
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
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.metricTile,
        { backgroundColor: colors.bgSecondary },
        emphasis && { backgroundColor: 'rgba(250, 204, 21, 0.14)' },
      ]}
    >
      <Text
        style={[
          styles.metricLabel,
          { color: colors.textMuted },
          emphasis && { color: colors.accent },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.metricValue,
          { color: colors.textPrimary },
          emphasis && { color: colors.accent },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function DiagnosticCard({
  title,
  tone = 'default',
  children,
}: {
  title: string;
  tone?: 'default' | 'accent' | 'warning';
  children: React.ReactNode;
}) {
  const { colors } = useTheme();

  const cardBg =
    tone === 'accent'
      ? colors.bgSecondary
      : tone === 'warning'
        ? 'rgba(245, 158, 11, 0.08)'
        : colors.bgPrimary;

  const borderColor =
    tone === 'accent'
      ? colors.borderAccent
      : tone === 'warning'
        ? colors.caution
        : colors.borderDefault;

  const titleColor =
    tone === 'accent'
      ? colors.accent
      : tone === 'warning'
        ? colors.cautionText
        : colors.textMuted;

  return (
    <View
      style={[
        styles.card,
        shadows.md,
        {
          borderColor,
          backgroundColor: cardBg,
        },
      ]}
    >
      <Text style={[styles.cardTitle, { color: titleColor }]}>{title}</Text>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function StatusBadge({
  label,
  ok,
}: {
  label: string;
  ok: boolean;
}) {
  return (
    <Badge variant={ok ? 'risk-safe' : 'neutral'} size="sm">
      {label}
    </Badge>
  );
}

/**
 * Exported default guards the QA-only diagnostics screen from production.
 * The Profile/Settings entry points are already hidden there, but a deep
 * link or stale route could still resolve here — this redirect catches
 * that. Wrapping also keeps `DiagnosticsContent`'s hooks (including the
 * network-hitting `refreshDiagnostics` effect) from running on production.
 */
export default function DiagnosticsScreen() {
  if (mobileEnv.appEnv === 'production') {
    return <Redirect href="/route-planning" />;
  }
  return <DiagnosticsContent />;
}

function DiagnosticsContent() {
  const { colors } = useTheme();
  const { user, session, isAnonymous, authError } = useAuthSession();
  const backgroundSnapshot = useBackgroundNavigationSnapshot();
  const queuedMutations = useAppStore((state) => state.queuedMutations);
  const offlineRegions = useAppStore((state) => state.offlineRegions);
  const navigationSession = useAppStore((state) => state.navigationSession);
  const routePreview = useAppStore((state) => state.routePreview);
  const selectedRouteId = useAppStore((state) => state.selectedRouteId);
  const anonymousOpenCount = useAppStore((state) => state.anonymousOpenCount);
  const onboardingCompleted = useAppStore((state) => state.onboardingCompleted);
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
      <DiagnosticCard title="Health at a glance" tone={apiHealth?.ok ? 'accent' : 'default'}>
        <View style={styles.badgeRow}>
          <StatusBadge label="API reachable" ok={Boolean(apiHealth?.ok)} />
          <Badge
            variant={foregroundPermission === 'granted' ? 'risk-safe' : 'risk-caution'}
            size="sm"
          >
            Foreground: {foregroundPermission}
          </Badge>
          <Badge
            variant={backgroundPermission === 'granted' ? 'risk-safe' : 'risk-caution'}
            size="sm"
          >
            Background: {backgroundPermission}
          </Badge>
          <Badge
            variant={queuedMutations.length === 0 ? 'neutral' : 'info'}
            size="sm"
            mono
          >
            Queue: {queuedMutations.length}
          </Badge>
        </View>
        <View style={styles.metricGrid}>
          <MetricBlock label="API" value={apiHealth?.ok ? 'Reachable' : 'Unavailable'} emphasis={Boolean(apiHealth?.ok)} />
          <MetricBlock label="Foreground" value={foregroundPermission} />
          <MetricBlock label="Background" value={backgroundPermission} />
          <MetricBlock label="Queue" value={`${queuedMutations.length} pending`} />
        </View>
        <Text style={[styles.dataText, { color: colors.textSecondary }]}>
          Shared store backend: {apiHealth?.sharedStoreBackend ?? 'Unknown'}
        </Text>
        <Text style={[styles.dataText, { color: colors.textSecondary }]}>
          Generated:{' '}
          {apiHealth?.generatedAt ? new Date(apiHealth.generatedAt).toLocaleTimeString() : 'Not available'}
        </Text>
      </DiagnosticCard>

      <DiagnosticCard title="Environment">
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>App variant: <Text style={styles.monoValue}>{mobileEnv.appVariant}</Text></Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>App environment: <Text style={styles.monoValue}>{mobileEnv.appEnv}</Text></Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Mobile API URL: <Text style={styles.monoValue}>{mobileEnv.mobileApiUrl || 'Not set'}</Text></Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          Mapbox token configured: <Text style={styles.monoValue}>{mobileEnv.mapboxPublicToken ? 'Yes' : 'No'}</Text>
        </Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          Validation bundle: <Text style={styles.monoValue}>{mobileEnv.validationBundleId || 'Not set'}</Text>
        </Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          Validation mode: <Text style={styles.monoValue}>{mobileEnv.validationMode || 'Not set'}</Text>
        </Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          Validation Metro port: <Text style={styles.monoValue}>{mobileEnv.validationMetroPort || 'Default'}</Text>
        </Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          Validation source: <Text style={styles.monoValue}>{mobileEnv.validationSourceRoot || 'Not set'}</Text>
        </Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          Signed in: <Text style={styles.monoValue}>{
            user == null
              ? 'No (no session)'
              : isAnonymous
                ? 'Anonymous'
                : user.email ?? user.id
          }</Text>
        </Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>Auth provider: <Text style={styles.monoValue}>{session?.provider ?? 'none'}</Text></Text>
      </DiagnosticCard>

      <DiagnosticCard title="Signup gate">
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          Anonymous open count: <Text style={styles.monoValue}>{anonymousOpenCount}</Text>
        </Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          Onboarding completed: <Text style={styles.monoValue}>{String(onboardingCompleted)}</Text>
        </Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          Is anonymous: <Text style={styles.monoValue}>{String(isAnonymous)}</Text>
        </Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          Has real account: <Text style={styles.monoValue}>{String(user != null && !isAnonymous)}</Text>
        </Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          Session exists: <Text style={styles.monoValue}>{String(session != null)}</Text>
        </Text>
        <Text style={[styles.bodyText, { color: storageEngineKind === 'memory' ? colors.danger : colors.textSecondary }]}>
          Storage engine: <Text style={styles.monoValue}>{storageEngineKind}</Text>
        </Text>
        {authError ? (
          <Text style={[styles.bodyText, { color: colors.danger, marginTop: 8 }]}>
            Auth error: <Text style={styles.monoValue}>{authError}</Text>
          </Text>
        ) : null}
        <Text style={[styles.bodyText, { color: colors.textSecondary, marginTop: 8 }]}>
          Gate fires at count{' '}=={' '}2 (dismissible) and count{' '}≥{' '}3 (mandatory), ONLY when Has real account is false.
        </Text>
      </DiagnosticCard>

      <DiagnosticCard
        title="Background navigation"
        tone={backgroundSnapshot.status.status === 'active' ? 'accent' : 'default'}
      >
        <View style={styles.badgeRow}>
          <Badge
            variant={backgroundSnapshot.status.status === 'active' ? 'accent' : 'neutral'}
            size="sm"
          >
            {backgroundSnapshot.status.status}
          </Badge>
          <Badge
            variant={movementSummary.movementDetected ? 'risk-safe' : 'neutral'}
            size="sm"
          >
            Movement: {movementSummary.movementDetected ? 'Detected' : 'None'}
          </Badge>
        </View>
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
        <Text style={[styles.dataText, { color: colors.textSecondary }]}>
          Updated: {new Date(backgroundSnapshot.status.updatedAt).toLocaleTimeString()}
        </Text>
        <Text style={[styles.dataText, { color: colors.textSecondary }]}>
          Latest fix:{' '}
          {backgroundSnapshot.latestLocation
            ? new Date(backgroundSnapshot.latestLocation.timestamp).toLocaleTimeString()
            : 'None'}
        </Text>
        <Text style={[styles.dataText, { color: colors.textSecondary }]}>
          Straight-line movement: {movementSummary.straightLineDistanceMeters} m
        </Text>
        <Text style={[styles.dataText, { color: colors.textSecondary }]}>
          Movement window: {movementSummary.durationSeconds}s
        </Text>
        {backgroundSnapshot.status.error ? (
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{backgroundSnapshot.status.error}</Text>
        ) : null}
        <Text style={[styles.helperText, { color: colors.textMuted }]}>
          For the locked-screen ride check, start navigation, lock the phone, move for at least a
          minute, then refresh here and confirm movement is detected.
        </Text>
      </DiagnosticCard>

      <DiagnosticCard title="Offline and queue state">
        <View style={styles.badgeRow}>
          <Badge
            variant={selectedRouteOfflineSummary.isSelectedRouteReady ? 'risk-safe' : 'neutral'}
            size="sm"
          >
            Offline: {selectedRouteOfflineSummary.isSelectedRouteReady ? 'Ready' : 'Not ready'}
          </Badge>
          <Badge variant={selectedRouteId ? 'info' : 'neutral'} size="sm">
            Route: {selectedRouteId ? 'Selected' : 'None'}
          </Badge>
        </View>
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
        <Text style={[styles.dataText, { color: colors.textSecondary }]}>
          Selected route matching packs: <Text style={styles.monoValue}>{selectedRouteOfflineSummary.matchingRegionCount}</Text>
        </Text>
        <Text style={[styles.dataText, { color: colors.textSecondary }]}>
          Selected route ready packs: <Text style={styles.monoValue}>{selectedRouteOfflineSummary.readyRegionCount}</Text>
        </Text>
        <Text style={[styles.dataText, { color: colors.textSecondary }]}>
          Selected route pack updated:{' '}
          <Text style={styles.monoValue}>
            {selectedRouteOfflineSummary.latestReadyAt
              ? new Date(selectedRouteOfflineSummary.latestReadyAt).toLocaleTimeString()
              : 'None'}
          </Text>
        </Text>
        <Text style={[styles.dataText, { color: colors.textSecondary }]}>In-app offline regions: <Text style={styles.monoValue}>{offlineRegions.length}</Text></Text>
        <Text style={[styles.dataText, { color: colors.textSecondary }]}>Active session: <Text style={styles.monoValue}>{navigationSession?.state ?? 'idle'}</Text></Text>
        <Text style={[styles.dataText, { color: colors.textSecondary }]}>Queue detail: <Text style={styles.monoValue}>{queueDetail}</Text></Text>
        {queuedMutations.some((m) => m.status === 'dead') ? (
          <View style={{ marginTop: space[2] }}>
            <Text style={[styles.dataText, { color: colors.danger, marginBottom: space[1] }]}>
              {queuedMutations.filter((m) => m.status === 'dead').length} mutation(s) permanently failed (max retries exceeded)
            </Text>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => {
                const count = useAppStore.getState().retryDeadMutations();
                setDevStatusMessage(
                  count > 0
                    ? `Reset ${count} dead mutation(s) for retry.`
                    : 'No dead mutations to retry.',
                );
              }}
            >
              Retry dead mutations
            </Button>
          </View>
        ) : null}
      </DiagnosticCard>

      {screenError ? (
        <DiagnosticCard title="Diagnostics issue" tone="warning">
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{screenError}</Text>
        </DiagnosticCard>
      ) : null}

      {mobileEnv.appEnv !== 'production' ? (
        <DiagnosticCard title="Developer validation">
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            Use this in development to queue authenticated sample writes, then toggle network off
            and back on to confirm the offline sync manager drains the queue.
          </Text>
          <View style={styles.badgeRow}>
            <StatusBadge label={`Signed in: ${user ? 'Yes' : 'No'}`} ok={Boolean(user)} />
            <Badge
              variant={
                queueActionSnapshot.lastResult === 'queued'
                  ? 'risk-safe'
                  : queueActionSnapshot.lastResult === 'failed'
                    ? 'risk-danger'
                    : queueActionSnapshot.lastResult === 'blocked'
                      ? 'risk-caution'
                      : 'neutral'
              }
              size="sm"
            >
              {queueActionSnapshot.lastResult}
            </Badge>
          </View>
          <View style={styles.metricGrid}>
            <MetricBlock label="Signed in for writes" value={user ? 'Yes' : 'No'} />
            <MetricBlock label="Last result" value={queueActionSnapshot.lastResult} />
            <MetricBlock label="Press count" value={`${queueActionSnapshot.pressInCount}`} />
            <MetricBlock label="Mutation count" value={`${queueActionSnapshot.lastMutationCount}`} />
          </View>
          <Text style={[styles.dataText, { color: colors.textSecondary }]}>
            Last press:{' '}
            <Text style={styles.monoValue}>
              {queueActionSnapshot.lastPressInAt
                ? new Date(queueActionSnapshot.lastPressInAt).toLocaleTimeString()
                : 'Never'}
            </Text>
          </Text>
          <Text style={[styles.dataText, { color: colors.textSecondary }]}>
            Last attempt:{' '}
            <Text style={styles.monoValue}>
              {queueActionSnapshot.lastAttemptAt
                ? new Date(queueActionSnapshot.lastAttemptAt).toLocaleTimeString()
                : 'Never'}
            </Text>
          </Text>
          <Text style={[styles.dataText, { color: colors.textSecondary }]}>
            Last client trip: <Text style={styles.monoValue}>{queueActionSnapshot.lastClientTripId ?? 'None'}</Text>
          </Text>
          <Text style={[styles.dataText, { color: colors.textSecondary }]}>
            Last error: <Text style={styles.monoValue}>{queueActionSnapshot.lastError ?? 'None'}</Text>
          </Text>
          {devStatusMessage ? <Text style={[styles.helperText, { color: colors.textMuted }]}>{devStatusMessage}</Text> : null}
          <View style={styles.buttonRow}>
            <Button
              variant="secondary"
              size="md"
              fullWidth
              accessibilityLabel="Queue sample writes"
              onPress={() => {
                handleQueuePressIn();
                queueSampleWrites();
              }}
            >
              Queue sample writes
            </Button>
          </View>
        </DiagnosticCard>
      ) : null}

      <View style={styles.buttonRow}>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={isRefreshing}
          onPress={() => void refreshDiagnostics()}
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh diagnostics'}
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    ...textSm,
  },
  dataText: {
    ...textDataSm,
  },
  monoValue: {
    fontFamily: fontFamily.mono.medium,
    fontSize: 14,
    lineHeight: 14 * 1.3,
  },
  helperText: {
    ...textXs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  metricTile: {
    minWidth: 132,
    flexGrow: 1,
    borderRadius: radii.md,
    paddingHorizontal: space[3],
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
    fontFamily: fontFamily.mono.bold,
    fontSize: 17,
    fontWeight: '900',
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: space[4],
    gap: space[3],
  },
  cardTitle: {
    fontFamily: fontFamily.heading.semiBold,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  cardBody: {
    gap: space[2],
  },
  buttonRow: {
    gap: space[3],
  },
});
