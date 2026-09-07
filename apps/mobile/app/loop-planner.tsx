/**
 * /loop-planner — find a ride that brings you back where you started.
 *
 * Every other route in this app is destination-first: you say where you are
 * going and we pick the safest way there. A recreational loop has no
 * destination, which is exactly why it needs its own screen rather than a fifth
 * mode pill on route-planning — those pills choose *how to reach* a place you
 * have already named, and here there is no such place.
 *
 * The screen produces an ordinary `RouteOption` and hands it to the existing
 * preview and navigation stack, the same trick `/course-import` uses. What
 * makes it a loop rather than a route is one field: `source: 'generated_loop'`,
 * which suppresses the reroute that would otherwise send the rider home.
 */
import {
  isRouteSupported,
  LOOP_CANDIDATE_COUNT,
  MAX_RETRACE_SHARE,
  LOOP_DISTANCE_STEPS_METERS,
  loopSessionPeriodKey,
  loopSessionRemainingMs,
  type Coordinate,
  type LoopHeading,
  type LoopSurface,
  type LoopTerrain,
} from '@defensivepedal/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MapStageScreen } from '../src/components/MapStageScreen';
import { RouteMap } from '../src/components/map';
import { Badge } from '../src/design-system/atoms/Badge';
import { Button } from '../src/design-system/atoms/Button';
import { PressableScale } from '../src/design-system/atoms/PressableScale';
import { Toast } from '../src/design-system/molecules/Toast';
import { useTheme, type ThemeColors } from '../src/design-system';
import { gray } from '../src/design-system/tokens/colors';
import { radii } from '../src/design-system/tokens/radii';
import { surfaceTints } from '../src/design-system/tokens/tints';
import { space } from '../src/design-system/tokens/spacing';
import { useCurrentLocation } from '../src/hooks/useCurrentLocation';
import { useLockOrientation } from '../src/hooks/useLockOrientation';
import { usePremium } from '../src/hooks/usePremium';
import { useShareRoute } from '../src/hooks/useShareRoute';
import { useT } from '../src/hooks/useTranslation';
import { searchLoops, type GeneratedLoop } from '../src/lib/loop-generator';
import { beginLoopRide } from '../src/lib/loop-ride';
import {
  createSavedLoopId,
  readSavedLoop,
  writeSavedLoop,
} from '../src/lib/loopStorage';
import { createClientTripId } from '../src/lib/offlineQueue';
import { telemetry } from '../src/lib/telemetry';
import { useConnectivity } from '../src/providers/ConnectivityMonitor';
import { useAppStore } from '../src/store/appStore';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const TERRAINS: LoopTerrain[] = ['flat', 'rolling', 'hilly'];
const SURFACES: LoopSurface[] = ['paved', 'any', 'offroad'];
const HEADINGS: LoopHeading[] = ['any', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Default speed for the time estimate when the rider has no history yet. */
const FALLBACK_SPEED_KMH = 15;

const km = (metres: number): string => (metres / 1000).toFixed(1).replace(/\.0$/, '');

const minutesFor = (metres: number, speedKmh: number): number =>
  Math.max(1, Math.round((metres / 1000 / speedKmh) * 60));

/** Loops are the only surface that needs a session countdown, so it lives here. */
const minutesLeftIn = (ms: number): number => Math.max(0, Math.ceil(ms / 60_000));

/**
 * Zoom that fits a loop of `targetDistanceMeters` around its start.
 *
 * The camera has to be told explicitly, because the default route framing
 * centres on `coordinates[length / 2]` — which on a loop is the point
 * diametrically opposite the start, i.e. exactly the wrong place. Derived from
 * the Web Mercator metres-per-pixel identity rather than a lookup table so it
 * stays honest across the 5-100 km range the picker offers.
 */
const loopZoomLevel = (targetDistanceMeters: number, lat: number): number => {
  const radiusMeters = targetDistanceMeters / (2 * Math.PI);
  if (radiusMeters <= 0) return 13;
  // 1.35 leaves the loop a margin instead of flush against the viewport edge.
  const halfViewportMeters = radiusMeters * 1.35;
  const metersPerPixelAtZoom0 = 156543 * Math.cos((lat * Math.PI) / 180);
  const zoom = Math.log2((metersPerPixelAtZoom0 * 400) / halfViewportMeters);
  return Math.max(9, Math.min(16, zoom));
};

type SearchState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'searching'; readonly found: number; readonly total: number }
  | { readonly kind: 'empty' }
  | { readonly kind: 'quota' };

export default function LoopPlannerScreen() {
  const t = useT();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  useLockOrientation();

  const { isOnline } = useConnectivity();
  const premium = usePremium();
  const { location } = useCurrentLocation();

  const beginLoopSessionLocally = useAppStore((s) => s.beginLoopSessionLocally);
  const loopMeter = useAppStore((s) => s.loopSessionMeter);
  const locale = useAppStore((s) => s.locale);

  // ── Controls ────────────────────────────────────────────────────────────
  const [distanceIndex, setDistanceIndex] = useState(2); // 15 km
  const [terrain, setTerrain] = useState<LoopTerrain>('rolling');
  const [heading, setHeading] = useState<LoopHeading>('any');
  const [customStart, setCustomStart] = useState<Coordinate | null>(null);
  const [pickingStart, setPickingStart] = useState(false);

  /**
   * Surface defaults from the rider's bike rather than from a global default.
   * A road bike opens on Paved only, a mountain bike on Allow offroad, and an
   * e-bike says nothing either way so we leave whatever they last chose.
   */
  const avoidUnpaved = useAppStore((s) => s.avoidUnpaved);
  const [surface, setSurface] = useState<LoopSurface>(avoidUnpaved ? 'paved' : 'any');

  // ── Results ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });
  const [sessionLoops, setSessionLoops] = useState<GeneratedLoop[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [relaxation, setRelaxation] = useState<string | null>(null);
  const [checked, setChecked] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // ── Save / share ────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Record<string, string>>({});
  const savedLoops = useAppStore((state) => state.savedLoops);
  const addSavedLoop = useAppStore((state) => state.addSavedLoop);
  const shareRoute = useShareRoute();

  // Opening a loop the rider saved earlier: it becomes the only result, ready
  // to ride. Reusing this screen rather than a viewer of its own keeps one
  // place where a loop is looked at and set off from.
  const params = useLocalSearchParams<{ loopId?: string }>();
  const openedRef = useRef<string | null>(null);
  useEffect(() => {
    const id = params.loopId;
    if (!id || openedRef.current === id) return;
    openedRef.current = id;

    void (async () => {
      const stored = await readSavedLoop(id);
      if (!stored) {
        // Validation failed or the file is gone. Say so rather than opening an
        // empty planner the rider has to guess about.
        setToast(t('loop.errorSave'));
        return;
      }
      setCustomStart(stored.start);
      setSessionLoops([
        {
          id: stored.route.id,
          route: stored.route,
          coordinates: [],
          bearingDegrees: 0,
          distanceMeters: stored.route.distanceMeters,
          climbMeters: stored.route.totalClimbMeters,
          highRiskMeters: 0,
          unpavedShare: 0,
          retracedShare: 0,
          ringRetracedShare: 0,
          stemMeters: 0,
          scenicScore: 0,
          relaxation: 'none',
          terrain: null,
          measured: true,
        },
      ]);
      setSelectedId(stored.route.id);
      setSavedIds((prev) => ({ ...prev, [stored.route.id]: id }));
    })();
  }, [params.loopId, t]);

  useEffect(
    () => () => {
      // Leaving mid-search must not leave eight requests running.
      abortRef.current?.abort();
    },
    [],
  );

  const start = customStart ?? location;
  const targetDistanceMeters = LOOP_DISTANCE_STEPS_METERS[distanceIndex]!;

  /**
   * Bumped whenever the thing the camera should be looking at changes.
   *
   * `focusCoordinate` alone is not enough: the camera is keyed on its centre,
   * so re-supplying the same coordinate after a GPS fix arrives is a no-op and
   * the map stays wherever it first landed. Without this the screen opens on a
   * region centroid and never recovers.
   */
  const [focusKey, setFocusKey] = useState(0);
  useEffect(() => {
    if (start) setFocusKey((n) => n + 1);
  }, [start?.lat, start?.lon, targetDistanceMeters]);

  /**
   * Coverage is structural, not cosmetic. A loop needs `exclude=unpaved`,
   * `annotation.classes` and the safety profile — all three are OSRM-only, and
   * Mapbox Directions populates none of them. There is no degraded mode.
   */
  const supported = useMemo(
    () => (start ? isRouteSupported(start, start).supported : true),
    [start],
  );

  const sessionsLeft = premium.loopSessionsLeft();
  const sessionOpenMs = loopSessionRemainingMs(
    loopMeter,
    new Date().toISOString(),
    loopSessionPeriodKey(new Date().toISOString(), 'UTC'),
  );

  // ── The search ──────────────────────────────────────────────────────────
  const runSearch = useCallback(async () => {
    if (!start || !isOnline) return;

    const decision = premium.loopSearch();
    if (!decision.allowed) {
      setSearch({ kind: 'quota' });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearch({ kind: 'searching', found: 0, total: LOOP_CANDIDATE_COUNT });
    setRelaxation(null);

    telemetry.capture('loop_search_started', {
      km: targetDistanceMeters / 1000,
      terrain,
      surface,
      heading,
    });

    // Charged on the first loop DRAWN, never on the button press: a cancelled
    // search and a search that finds nothing both cost the rider nothing.
    let charged = false;
    const chargeOnce = () => {
      if (charged) return;
      charged = true;
      const periodKey = premium.loopSessionToCharge();
      if (periodKey) beginLoopSessionLocally(periodKey, new Date().toISOString());
    };

    const outcome = await searchLoops(
      {
        start,
        targetDistanceMeters,
        terrain,
        surface,
        heading,
        locale,
      },
      {
        signal: controller.signal,
        onCandidate: (loop) => {
          chargeOnce();
          setSessionLoops((prev) => {
            const next = prev.filter((existing) => existing.id !== loop.id);
            // Newest first, capped — nothing found is lost to one more tap,
            // but the map and the list both stay bounded.
            return [loop, ...next].slice(0, 12);
          });
        },
        onProgress: (found, total) =>
          setSearch({
            kind: 'searching',
            found,
            total: Math.max(total, LOOP_CANDIDATE_COUNT),
          }),
      },
    );

    if (controller.signal.aborted) {
      setSearch({ kind: 'idle' });
      return;
    }

    if (outcome.status === 'cancelled') {
      setSearch({ kind: 'idle' });
      return;
    }

    if (outcome.status === 'empty') {
      setSearch({ kind: 'empty' });
      telemetry.capture('loop_search_empty', {
        km: targetDistanceMeters / 1000,
        blocking_constraint: 'no_loop',
      });
      return;
    }

    setSearch({ kind: 'idle' });
    setRelaxation(outcome.relaxation);
    setChecked(outcome.checked);
    setSelectedId(outcome.loops[0]?.id ?? null);
    setSessionLoops((prev) => {
      const byId = new Map(prev.map((loop) => [loop.id, loop]));
      for (const loop of outcome.loops) byId.set(loop.id, loop);
      return [...outcome.loops, ...prev.filter((l) => !outcome.loops.some((o) => o.id === l.id))]
        .map((loop) => byId.get(loop.id) ?? loop)
        .slice(0, 12);
    });

    telemetry.capture('loop_results_shown', {
      n: outcome.loops.length,
      relaxed: outcome.relaxation,
      checked: outcome.checked,
    });
  }, [
    start,
    isOnline,
    premium,
    targetDistanceMeters,
    terrain,
    surface,
    heading,
    locale,
    beginLoopSessionLocally,
  ]);

  const cancelSearch = useCallback(() => {
    abortRef.current?.abort();
    setSearch({ kind: 'idle' });
  }, []);

  const selected = sessionLoops.find((loop) => loop.id === selectedId) ?? null;

  /**
   * The session counter, rendered wherever the action that spends it lives —
   * under "Find loops" before a search, under "Try another" after one. Declared
   * once so the two never drift apart.
   */
  const quotaLabel =
    sessionOpenMs > 0
      ? t('loop.sessionActive', { minutes: String(minutesLeftIn(sessionOpenMs)) })
      : t('loop.sessionsLeft', {
          count: String(sessionsLeft),
          total: String(premium.limits.loopSessionsPerMonth ?? 0),
        });

  const handleSave = useCallback(() => {
    if (!selected || !start) return;
    if (savedIds[selected.id]) {
      setToast(t('loop.savedAlready'));
      return;
    }

    // Loops count against the same allowance as saved routes — the rider was
    // promised "saved like any route", and two separate quotas for two kinds
    // of saved thing is a distinction only the code cares about.
    const total = savedLoops.length;
    if (premium.blockSaveRoute(total)) {
      setToast(
        t('loop.saveLimit', {
          count: String(premium.limits.savedRoutes ?? 0),
        }),
      );
      return;
    }

    const id = createSavedLoopId();
    const name = t('loop.nameFallback', { km: km(selected.distanceMeters) });

    void (async () => {
      // File first, metadata second: a row pointing at a file that was never
      // written is a loop the rider can tap and never open, whereas an
      // orphaned file is reclaimed by the storage sweep.
      const written = await writeSavedLoop(id, {
        route: selected.route,
        start,
      });
      if (!written) {
        setToast(t('loop.errorSave'));
        return;
      }
      addSavedLoop({
        id,
        name,
        distanceMeters: selected.distanceMeters,
        climbMeters: selected.climbMeters,
        unpavedShare: selected.unpavedShare,
        createdAt: new Date().toISOString(),
      });
      setSavedIds((prev) => ({ ...prev, [selected.id]: id }));
      setToast(t('loop.saved'));
      telemetry.capture('loop_saved', {
        km: Math.round(selected.distanceMeters / 1000),
      });
    })();
  }, [selected, start, savedIds, savedLoops.length, premium, addSavedLoop, t]);

  const handleShare = useCallback(() => {
    if (!selected || !start) return;
    void (async () => {
      // Both ends are the start, because that is what a loop is. The share
      // service takes the geometry, so the recipient sees the actual line
      // rather than a route recomputed between two identical points.
      const result = await shareRoute.share({
        route: selected.route,
        origin: start,
        destination: start,
        routingMode: terrain === 'flat' ? 'flat' : 'safe',
        isLoop: true,
      });
      if (!result.shared && result.reason !== 'dismissed') {
        setToast(result.message ?? t('loop.errorSave'));
      }
    })();
  }, [selected, start, terrain, shareRoute, t]);

  // ── Start the ride ──────────────────────────────────────────────────────
  // Mirrors `handleStartRide` in /course-import, which mirrors
  // `beginNavigation` in /route-preview: navigation reads its route from
  // `routePreview.routes`, so the loop has to be published there before the
  // session starts.
  //
  // A loop's destination IS its origin, which is the one way this differs from
  // every other route in the app. That is safe because completion is gated on
  // `onLastStep` as well as physical proximity — being parked on the
  // destination at kilometre zero is not enough to end the ride. The
  // remaining-distance floor is likewise last-step-only, so the HUD counts the
  // whole loop down rather than reading zero from the start.
  //
  // Auto-reroute is suppressed downstream by the route's own
  // `source: 'generated_loop'` marker (see `isFixedLineRoute`). Without it,
  // drifting off the line for 60 s would silently replace the rider's loop
  // with an OSRM route home — which for a loop means ending the ride.
  const rideStartedRef = useRef(false);

  const openSelected = useCallback(() => {
    if (!selected || !start) return;

    // Double-tap guard: a second tap before re-render would enqueue a
    // duplicate trip_start with a fresh clientTripId, orphaning the first.
    // (`beginLoopRide` guards the already-riding case; this guards the race.)
    if (rideStartedRef.current) return;
    rideStartedRef.current = true;

    const outcome = beginLoopRide(useAppStore.getState(), {
      route: selected.route,
      start,
      distanceMeters: selected.distanceMeters,
      loopName: t('loop.nameFallback', { km: km(selected.distanceMeters) }),
      startedAt: new Date().toISOString(),
      sessionId:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `session-${Date.now()}`,
      clientTripId: createClientTripId(),
    });

    if (outcome === 'started') {
      telemetry.capture('loop_ride_started', {
        km: Math.round(selected.distanceMeters / 1000),
        climb: selected.climbMeters,
      });
      telemetry.capture('navigation_started', {
        mode: 'loop',
        route_id: selected.route.id,
        route_source: selected.route.source,
        relaxation: selected.relaxation,
      });
    } else {
      // Already riding — the rider backed out of /navigation onto this screen.
      rideStartedRef.current = false;
    }

    router.push('/navigation');
  }, [selected, start, t]);

  // ── Render ──────────────────────────────────────────────────────────────
  const isSearching = search.kind === 'searching';

  const mapRoutes = useMemo(
    () => sessionLoops.map((loop) => loop.route),
    [sessionLoops],
  );

  const speedKmh = FALLBACK_SPEED_KMH;

  if (!supported) {
    return (
      <MapStageScreen
        map={<RouteMap fullBleed origin={start ?? undefined} />}
        topOverlay={
          <View style={styles.topBar}>
            <PressableScale onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </PressableScale>
            <Text style={styles.topTitle}>{t('loop.title')}</Text>
          </View>
        }
      >
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{t('loop.unavailableTitle')}</Text>
          <Text style={styles.noticeBody}>{t('loop.unavailableBody')}</Text>
        </View>
      </MapStageScreen>
    );
  }

  return (
    <MapStageScreen
      useBottomSheet
      initiallyExpanded
      map={
        <View style={StyleSheet.absoluteFill}>
          <RouteMap
            fullBleed
            origin={start ?? undefined}
            routes={mapRoutes}
            selectedRouteId={selectedId}
            userLocation={location}
            /*
             * `origin` is NOT part of the camera's fallback chain, and the route
             * framing it would otherwise use centres on the far side of a loop.
             * Focus outranks both, so state it explicitly.
             */
            focusCoordinate={start ?? null}
            focusKey={focusKey}
            focusZoomLevel={loopZoomLevel(targetDistanceMeters, start?.lat ?? 45)}
            onMapTap={
              pickingStart
                ? (coordinate) => {
                    setCustomStart(coordinate);
                    setPickingStart(false);
                    setSessionLoops([]);
                    setSelectedId(null);
                  }
                : undefined
            }
            crosshairMode={pickingStart ? 'suggestion' : undefined}
          />
        </View>
      }
      topOverlay={
        <View style={styles.topBar}>
          <PressableScale
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityLabel={t('common.back')}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </PressableScale>
          <Text style={styles.topTitle} numberOfLines={1}>
            {t('loop.title')}
          </Text>
        </View>
      }
      peekContent={
        sessionLoops.length > 0 ? (
          <View style={styles.peekRow}>
            <Badge variant="accent">{t('loop.badge')}</Badge>
            <Text style={styles.peekStat}>
              {t('loop.sessionCount', { count: String(sessionLoops.length) })}
            </Text>
          </View>
        ) : undefined
      }
      footer={
        isSearching ? (
          <View style={styles.footerCol}>
            <View style={styles.searchRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.searchText}>
                {t('loop.searching')}{'  '}
                {t('loop.searchProgress', {
                  found: String(search.found),
                  total: String(search.total),
                })}
              </Text>
            </View>
            <Button variant="secondary" onPress={cancelSearch}>
              {t('loop.cancel')}
            </Button>
          </View>
        ) : (
          <View style={styles.footerCol}>
            {!isOnline ? (
              <Text style={styles.offline}>{t('loop.offline')}</Text>
            ) : null}
            {/*
              The persistent action is whatever the rider is most likely to want
              next. Before a search that is finding loops; after one it is
              setting off on the loop they picked. Searching again is a
              secondary action and lives under the list it would replace, next
              to the counter it spends.
            */}
            {sessionLoops.length > 0 ? (
              <>
                <Button onPress={openSelected} disabled={!selected}>
                  {t('loop.startRide')}
                </Button>
                {/*
                  Secondary to setting off, but on the same surface: a rider
                  who likes a loop wants to keep it or send it before they
                  leave the screen that found it.
                */}
                <View style={styles.secondaryRow}>
                  <View style={styles.secondaryCell}>
                    <Button
                      variant="secondary"
                      onPress={handleSave}
                      disabled={!selected}
                    >
                      {selected && savedIds[selected.id]
                        ? t('loop.savedAlready')
                        : t('loop.save')}
                    </Button>
                  </View>
                  <View style={styles.secondaryCell}>
                    <Button
                      variant="secondary"
                      onPress={handleShare}
                      disabled={!selected || shareRoute.isSharing || !isOnline}
                    >
                      {t('loop.share')}
                    </Button>
                  </View>
                </View>
              </>
            ) : (
              <>
                <Button
                  onPress={runSearch}
                  disabled={!isOnline || !start}
                  accessibilityLabel={t('loop.findCta')}
                >
                  {t('loop.findCta')}
                </Button>
                {Number.isFinite(sessionsLeft) ? (
                  <Text style={styles.quota}>{quotaLabel}</Text>
                ) : null}
              </>
            )}
          </View>
        )
      }
    >
      {/* ── Controls ─────────────────────────────────────────────────── */}
      <View style={styles.control}>
        <Text style={styles.controlLabel}>{t('loop.startLabel')}</Text>
        <PressableScale
          style={styles.readout}
          onPress={() => setPickingStart((v) => !v)}
          accessibilityLabel={t('loop.startChange')}
        >
          <Text style={styles.readoutValue}>
            {customStart ? t('loop.startCustom') : t('loop.startCurrent')}
          </Text>
          <Text style={styles.readoutAction}>
            {pickingStart ? t('loop.startPickHint') : t('loop.startChange')}
          </Text>
        </PressableScale>
      </View>

      <View style={styles.control}>
        <Text style={styles.controlLabel}>{t('loop.distanceLabel')}</Text>
        <View style={styles.steps}>
          {LOOP_DISTANCE_STEPS_METERS.map((metres, index) => (
            <PressableScale
              key={metres}
              onPress={() => setDistanceIndex(index)}
              style={[styles.step, index === distanceIndex && styles.stepOn]}
              hitSlop={8}
              accessibilityLabel={t('loop.distanceValue', {
                km: String(metres / 1000),
              })}
              accessibilityState={{ selected: index === distanceIndex }}
            >
              <Text
                style={[
                  styles.stepText,
                  index === distanceIndex && styles.stepTextOn,
                ]}
              >
                {metres / 1000}
              </Text>
            </PressableScale>
          ))}
        </View>
        <Text style={styles.hint}>
          {t('loop.distanceValue', { km: String(targetDistanceMeters / 1000) })}
          {'  ·  '}
          {t('loop.timeEstimate', {
            minutes: String(minutesFor(targetDistanceMeters, speedKmh)),
          })}
        </Text>
      </View>

      <View style={styles.control}>
        <Text style={styles.controlLabel}>{t('loop.terrainLabel')}</Text>
        <View style={styles.pills}>
          {TERRAINS.map((value) => (
            <PressableScale
              key={value}
              onPress={() => setTerrain(value)}
              style={[styles.pill, value === terrain && styles.pillOn]}
              accessibilityState={{ selected: value === terrain }}
            >
              <Text
                style={[styles.pillText, value === terrain && styles.pillTextOn]}
              >
                {t(
                  `loop.terrain${value.charAt(0).toUpperCase()}${value.slice(1)}`,
                )}
              </Text>
            </PressableScale>
          ))}
        </View>
        {terrain === 'flat' && Number.isFinite(premium.flatRoutesLeft()) ? (
          <Text style={styles.hint}>
            {t('loop.flatQuotaNote', {
              count: String(premium.flatRoutesLeft()),
            })}
          </Text>
        ) : null}
      </View>

      <View style={styles.control}>
        <Text style={styles.controlLabel}>{t('loop.surfaceLabel')}</Text>
        <View style={styles.pills}>
          {SURFACES.map((value) => (
            <PressableScale
              key={value}
              onPress={() => setSurface(value)}
              style={[styles.pill, value === surface && styles.pillOn]}
              accessibilityState={{ selected: value === surface }}
            >
              <Text
                style={[styles.pillText, value === surface && styles.pillTextOn]}
              >
                {value === 'paved'
                  ? t('loop.surfacePaved')
                  : value === 'any'
                    ? t('loop.surfaceAny')
                    : t('loop.surfaceOffroad')}
              </Text>
            </PressableScale>
          ))}
        </View>
        {/*
          Offroad is a ranking, not a routing constraint — OSRM has no inverse
          of `exclude`. Say so, and show the measured share on every result, so
          the rider can tell whether the preference actually did anything.
        */}
        {surface === 'offroad' ? (
          <Text style={styles.hint}>{t('loop.surfaceOffroadNote')}</Text>
        ) : null}
      </View>

      {/*
        Heading lives in the sheet rather than as an arc on the map. The dial was
        anchored to screen centre on the assumption that the start pin sits
        there — which held only while the sheet was collapsed and the camera was
        already on the start. With the sheet open (which this screen requires,
        since the sheet IS the controls) screen centre is behind the sheet, so
        the dial was both mis-anchored and invisible. Pills are anchored, always
        visible, and each one is a plain 44pt button, so the gesture-alternative
        rule is satisfied natively rather than by a parallel picker.
      */}
      <View style={styles.control}>
        <Text style={styles.controlLabel}>{t('loop.headingLabel')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.headingRowScroll}
        >
          {HEADINGS.map((value) => (
            <PressableScale
              key={value}
              onPress={() => setHeading(value)}
              style={[styles.pill, value === heading && styles.pillOn]}
              accessibilityLabel={t(`loop.heading${value}`)}
              accessibilityState={{ selected: value === heading }}
            >
              <Text
                style={[styles.pillText, value === heading && styles.pillTextOn]}
              >
                {t(`loop.heading${value}`)}
              </Text>
            </PressableScale>
          ))}
        </ScrollView>
      </View>

      {/* ── Outcome ──────────────────────────────────────────────────── */}
      {search.kind === 'empty' ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>
            {t('loop.emptyTitle', { km: String(targetDistanceMeters / 1000) })}
          </Text>
          <Text style={styles.noticeBody}>{t('loop.emptyBody')}</Text>
          <View style={styles.noticeActions}>
            <Button
              variant="secondary"
              onPress={() => {
                setDistanceIndex((i) =>
                  Math.min(i + 1, LOOP_DISTANCE_STEPS_METERS.length - 1),
                );
                setSearch({ kind: 'idle' });
              }}
            >
              {t('loop.emptyTryLonger', {
                km: String(
                  (LOOP_DISTANCE_STEPS_METERS[
                    Math.min(distanceIndex + 1, LOOP_DISTANCE_STEPS_METERS.length - 1)
                  ] ?? targetDistanceMeters) / 1000,
                ),
              })}
            </Button>
            <Button
              variant="secondary"
              onPress={() => {
                setHeading('any');
                setSearch({ kind: 'idle' });
              }}
            >
              {t('loop.emptyTryDirection')}
            </Button>
          </View>
        </View>
      ) : null}

      {search.kind === 'quota' ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{t('loop.quotaTitle')}</Text>
          <Text style={styles.noticeBody}>
            {t('loop.quotaBody', {
              total: String(premium.limits.loopSessionsPerMonth ?? 0),
            })}
          </Text>
        </View>
      ) : null}

      {/*
        A relaxation the rider is not told about is indistinguishable from the
        generator ignoring them, so the note is not optional.
      */}
      {relaxation && relaxation !== 'none' && sessionLoops.length > 0 ? (
        <Text style={styles.relaxNote}>
          {relaxation === 'retrace'
            ? t('loop.relaxedRetrace', {
                percent: String(
                  Math.round((selected?.retracedShare ?? 0) * 100),
                ),
              })
            : relaxation === 'terrain'
            ? t('loop.relaxedTerrain', {
                asked: t(
                  `loop.terrain${terrain.charAt(0).toUpperCase()}${terrain.slice(1)}`,
                ).toLowerCase(),
                checked: String(checked),
              })
            : relaxation === 'distance'
              ? t('loop.relaxedDistance', {
                  km: km(selected?.distanceMeters ?? targetDistanceMeters),
                  asked: String(targetDistanceMeters / 1000),
                })
              : t('loop.relaxedHeading', {
                  actual: t(`loop.heading${heading}`).toLowerCase(),
                  terrain: t(
                    `loop.terrain${terrain.charAt(0).toUpperCase()}${terrain.slice(1)}`,
                  ).toLowerCase(),
                  asked: t(`loop.heading${heading}`).toLowerCase(),
                })}
        </Text>
      ) : null}

      {/* ── Session results ──────────────────────────────────────────── */}
      {sessionLoops.length > 0 ? (
        <View style={styles.results}>
          <Text style={styles.sectionTitle}>
            {t('loop.resultsTitle', { count: String(sessionLoops.length) })}
          </Text>
          {sessionLoops.map((loop) => {
            const isSelected = loop.id === selectedId;
            return (
              <PressableScale
                key={loop.id}
                onPress={() => setSelectedId(loop.id)}
                style={[styles.loopRow, isSelected && styles.loopRowOn]}
                accessibilityState={{ selected: isSelected }}
              >
                <View style={styles.loopMain}>
                  <Text style={styles.loopDistance}>
                    {km(loop.distanceMeters)} km
                  </Text>
                  <Text style={styles.loopMeta}>
                    {loop.climbMeters === null
                      ? '—'
                      : t('loop.climb', { meters: String(loop.climbMeters) })}
                    {'  ·  '}
                    {t('loop.timeEstimate', {
                      minutes: String(minutesFor(loop.distanceMeters, speedKmh)),
                    })}
                    {loop.unpavedShare > 0
                      ? `  ·  ${t('loop.unpavedShare', {
                          percent: String(Math.round(loop.unpavedShare * 100)),
                        })}`
                      : ''}
                  </Text>
                  {/*
                    Silence when the loop is clean, which is the common case.
                    A note only when it genuinely doubles back — a few shared
                    metres through the starting junction is not worth saying.
                  */}
                  {loop.retracedShare >= MAX_RETRACE_SHARE ? (
                    <Text style={styles.loopWarn}>
                      {t('loop.retraced', {
                        percent: String(Math.round(loop.retracedShare * 100)),
                      })}
                    </Text>
                  ) : null}
                </View>
                {loop.measured ? null : <ActivityIndicator size="small" />}
              </PressableScale>
            );
          })}
          <Button
            variant="secondary"
            onPress={runSearch}
            disabled={!isOnline || !start}
          >
            {t('loop.tryAnother')}
          </Button>
          {Number.isFinite(sessionsLeft) ? (
            <Text style={styles.quota}>{quotaLabel}</Text>
          ) : null}
        </View>
      ) : null}



      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </MapStageScreen>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgSecondary,
    },
    topTitle: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 17,
      fontWeight: '600',
    },
    control: {
      marginBottom: space[6],
    },
    controlLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: space[2],
    },
    readout: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.borderDefault,
      borderRadius: radii.md,
      paddingVertical: space[2] + 2,
      paddingHorizontal: space[4],
      minHeight: 44,
    },
    readoutValue: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    readoutAction: {
      color: colors.textMuted,
      fontSize: 13,
    },
    steps: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[1],
    },
    step: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      paddingHorizontal: space[2],
    },
    stepOn: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    stepText: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: '600',
    },
    stepTextOn: {
      color: gray[900],
    },
    hint: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: space[2],
    },
    headingRowScroll: {
      flexDirection: 'row',
      gap: space[1],
      paddingRight: space[4],
    },
    pills: {
      flexDirection: 'row',
      gap: space[1],
      flexWrap: 'wrap',
    },
    pill: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: space[4],
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.borderDefault,
    },
    pillOn: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    pillText: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: '600',
    },
    pillTextOn: {
      color: gray[900],
    },
    footerCol: {
      gap: space[2],
    },
    secondaryRow: {
      flexDirection: 'row',
      gap: space[2],
    },
    secondaryCell: {
      flex: 1,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    searchText: {
      color: colors.textPrimary,
      fontSize: 14,
      flex: 1,
    },
    quota: {
      color: colors.textMuted,
      fontSize: 12,
      textAlign: 'center',
    },
    offline: {
      color: colors.textMuted,
      fontSize: 13,
      textAlign: 'center',
    },
    notice: {
      backgroundColor: colors.bgSecondary,
      borderRadius: radii.md,
      padding: space[4],
      marginBottom: space[6],
      gap: space[1],
    },
    noticeTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    noticeBody: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    noticeActions: {
      gap: space[1],
      marginTop: space[2],
    },
    relaxNote: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: space[4],
    },
    results: {
      gap: space[2],
      marginBottom: space[6],
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '700',
      marginBottom: space[1],
    },
    loopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      borderWidth: 1,
      borderColor: colors.borderDefault,
      borderRadius: radii.md,
      padding: space[4],
      minHeight: 44,
    },
    loopRowOn: {
      borderColor: colors.accent,
      backgroundColor: colors.bgSecondary,
    },
    loopMain: {
      flex: 1,
    },
    loopDistance: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    loopWarn: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
      fontStyle: 'italic',
    },
    loopMeta: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: 2,
    },
    peekRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    peekStat: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: surfaceTints.scrim,
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: colors.bgDeep,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      padding: space[6],
      maxHeight: '70%',
    },
    headingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 48,
      paddingHorizontal: space[1],
    },
    headingRowText: {
      color: colors.textPrimary,
      fontSize: 16,
    },
  });
