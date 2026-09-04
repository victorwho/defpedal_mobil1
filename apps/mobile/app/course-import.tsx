/**
 * course-import — review an imported GPX course before riding it.
 *
 * The heart of GPX import. Every other route in the app is one we *computed*,
 * so our value is choosing safer roads. An imported course is a fixed line the
 * rider brought with them, and re-routing it would destroy the only reason
 * they imported it. So the promise inverts: we cannot pick these roads, but we
 * can X-ray them and show exactly where the route gets dangerous.
 *
 * That is what the "Busy stretches" list is — the signature interaction of the
 * feature, and the reason to import here rather than into Garmin.
 *
 * Input contract is a single file URI, which is also the shape an OS
 * "Open with" intent will hand us later.
 */
import {
  findHighRiskStretches,
  formatDistance,
  formatDuration,
  isRiskDataAvailable,
  resolveCountryFromCoord,
  type HighRiskStretch,
  type RouteOption,
} from '@defensivepedal/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MapStageScreen } from '../src/components/MapStageScreen';
import { RouteMap } from '../src/components/map';
import { Badge } from '../src/design-system/atoms/Badge';
import { Button } from '../src/design-system/atoms/Button';
import { ElevationChart } from '../src/design-system/organisms/ElevationChart';
import { RiskDistributionCard } from '../src/design-system/organisms/RiskDistributionCard';
import { PremiumLimitCard } from '../src/design-system/organisms/PremiumLimitCard';
import { Toast } from '../src/design-system/molecules/Toast';
import { useTheme, type ThemeColors } from '../src/design-system';
import { radii } from '../src/design-system/tokens/radii';
import { space } from '../src/design-system/tokens/spacing';
import { useT } from '../src/hooks/useTranslation';
import { useLockOrientation } from '../src/hooks/useLockOrientation';
import { usePremium } from '../src/hooks/usePremium';
import { buildCourseRoute, enrichCourseRoute } from '../src/lib/course-route';
import { courseNameFromFileName, readGpxFile } from '../src/lib/gpx-import';
import { parseGpx, type ParsedCourse } from '../src/lib/gpx-parse';
import {
  createCourseId,
  readCourseGeometry,
  writeCourseGeometry,
} from '../src/lib/courseStorage';
import { createClientTripId } from '../src/lib/offlineQueue';
import { telemetry } from '../src/lib/telemetry';
import { useAppStore } from '../src/store/appStore';

type ScreenState =
  | { status: 'reading' }
  | { status: 'error'; messageKey: string }
  | {
      status: 'ready';
      course: ParsedCourse;
      route: RouteOption;
      /** False until risk + elevation have come back. */
      scored: boolean;
    };

const ERROR_KEYS: Record<string, string> = {
  not_gpx: 'course.errorNotGpx',
  no_track: 'course.errorNoTrack',
  too_few_points: 'course.errorTooFewPoints',
};

export default function CourseImportScreen() {
  const params = useLocalSearchParams<{
    uri?: string;
    fileName?: string;
    /** Set instead of `uri` when reopening a course already on the device. */
    courseId?: string;
    courseName?: string;
  }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const locale = useAppStore((s) => s.locale);

  // Map screens are handlebar-mounted — portrait only, like route-preview.
  useLockOrientation();

  const [state, setState] = useState<ScreenState>({ status: 'reading' });
  const [focus, setFocus] = useState<{ lat: number; lon: number } | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Guards against a second import overwriting a newer one if the screen is
  // re-entered while an enrichment round-trip is still in flight.
  const importIdRef = useRef(0);

  const uri = params.uri;
  const fileName = params.fileName ?? 'course.gpx';
  const courseId = params.courseId;
  const savedName = params.courseName;

  useEffect(() => {
    if (!uri && !courseId) {
      setState({ status: 'error', messageKey: 'course.errorRead' });
      return;
    }

    const importId = ++importIdRef.current;
    let cancelled = false;

    /**
     * Two ways in, one screen: a freshly picked file, or a course already on
     * this device. Both end up as the same `ParsedCourse`, so everything
     * downstream — scoring, the busy list, starting the ride — is identical.
     */
    const loadCourse = async (): Promise<ParsedCourse | 'error' | string> => {
      if (courseId) {
        const stored = await readCourseGeometry(courseId);
        if (stored === null) return 'course.openFailed';
        return {
          name: savedName ?? null,
          coordinates: stored.coordinates as [number, number][],
          elevations: stored.elevations,
          sourceElement: 'track',
          candidateCount: 1,
          droppedPoints: 0,
        };
      }

      const text = await readGpxFile(uri!);
      if (text === null) return 'course.errorRead';

      const parsed = parseGpx(text);
      if (!parsed.ok) {
        telemetry.capture('gpx_import_failed', { reason: parsed.reason });
        return ERROR_KEYS[parsed.reason] ?? 'course.errorRead';
      }
      return parsed.course;
    };

    const run = async (): Promise<void> => {
      setState({ status: 'reading' });

      const loaded = await loadCourse();
      if (cancelled || importId !== importIdRef.current) return;

      if (typeof loaded === 'string') {
        setState({ status: 'error', messageKey: loaded });
        return;
      }

      const parsed = { ok: true as const, course: loaded };
      const route = buildCourseRoute(parsed.course, { locale });
      if (route === null) {
        setState({ status: 'error', messageKey: 'course.errorBuild' });
        return;
      }

      // Draw the line immediately, then fill in scoring. Waiting for the
      // server before showing anything would leave a blank map on every
      // import, and the geometry is already fully known.
      setState({ status: 'ready', course: parsed.course, route, scored: false });

      telemetry.capture('gpx_import_succeeded', {
        points: parsed.course.coordinates.length,
        source_element: parsed.course.sourceElement,
        distance_km: Math.round(route.distanceMeters / 100) / 10,
      });

      const enriched = await enrichCourseRoute(route, parsed.course.coordinates);
      if (cancelled || importId !== importIdRef.current) return;

      setState({
        status: 'ready',
        course: parsed.course,
        route: enriched,
        scored: true,
      });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [uri, courseId, savedName, locale]);

  const route = state.status === 'ready' ? state.route : null;
  const course = state.status === 'ready' ? state.course : null;

  const stretches = useMemo<HighRiskStretch[]>(
    () => (route ? findHighRiskStretches(route.riskSegments) : []),
    [route],
  );

  /**
   * Risk coverage is per-country. A course from outside the 31 covered
   * countries gets no scoring, and we say so rather than rendering a
   * fabricated number — the mistake the deleted `safety-score.tsx` made.
   */
  const riskCovered = useMemo(() => {
    const midpoint = course?.coordinates[Math.floor(course.coordinates.length / 2)];
    if (!midpoint) return false;
    return isRiskDataAvailable(
      resolveCountryFromCoord({ lat: midpoint[1], lon: midpoint[0] }),
    );
  }, [course]);

  const courseName = useMemo(
    () => course?.name ?? courseNameFromFileName(fileName),
    [course, fileName],
  );

  const handleFocusStretch = useCallback((stretch: HighRiskStretch) => {
    setFocus(stretch.focus);
    setFocusKey((key) => key + 1);
  }, []);

  const endpoints = useMemo(() => {
    if (!course || course.coordinates.length < 2) return null;
    const first = course.coordinates[0]!;
    const last = course.coordinates[course.coordinates.length - 1]!;
    return {
      origin: { lat: first[1], lon: first[0] },
      destination: { lat: last[1], lon: last[0] },
    };
  }, [course]);

  // ── Save the course to this device ───────────────────────────────────────
  // Geometry goes to disk, metadata to the store. The free-tier ceiling is
  // read through `blockImportCourse`, which folds in the dark-launch gate —
  // writing `uiEnabled && !canImportCourse(n)` here would be the call-site
  // gate error-log #20 exists to prevent.
  const premium = usePremium();
  const importedCourses = useAppStore((s) => s.importedCourses);
  const addImportedCourse = useAppStore((s) => s.addImportedCourse);
  // A reopened course is already on the device — the save button starts
  // in its 'saved' state rather than offering a duplicate copy.
  const [savedCourseId, setSavedCourseId] = useState<string | null>(courseId ?? null);
  const [saving, setSaving] = useState(false);
  const [limitVisible, setLimitVisible] = useState(false);

  const handleSaveCourse = useCallback(async () => {
    if (state.status !== 'ready' || saving || savedCourseId !== null) return;

    if (premium.blockImportCourse(importedCourses.length)) {
      setLimitVisible(true);
      return;
    }

    setSaving(true);
    const id = createCourseId();

    const written = await writeCourseGeometry(id, {
      coordinates: state.course.coordinates,
      elevations: state.course.elevations,
    });

    if (!written) {
      // Never record metadata for geometry that is not on disk — the row
      // would render a course that cannot be opened.
      setSaving(false);
      setSaveToast(t('course.errorSave'));
      return;
    }

    addImportedCourse({
      id,
      name: courseName,
      distanceMeters: state.route.distanceMeters,
      climbMeters: state.route.totalClimbMeters,
      busyStretchCount: stretches.length,
      pointCount: state.course.coordinates.length,
      createdAt: new Date().toISOString(),
    });

    setSavedCourseId(id);
    setSaving(false);
    setSaveToast(t('course.saved'));
  }, [
    state,
    saving,
    savedCourseId,
    premium,
    importedCourses.length,
    addImportedCourse,
    courseName,
    stretches.length,
    t,
  ]);

  // ── Start the ride ───────────────────────────────────────────────────────
  // Mirrors `beginNavigation` in route-preview: navigation reads its route
  // from `routePreview.routes`, so the course has to be published there before
  // the session starts. Auto-reroute is suppressed downstream by the route's
  // own `source: 'gpx_course'` marker (see `isCourseRoute`) — without that,
  // going 50 m off the line for 60 s would silently replace the course.
  const rideStartedRef = useRef(false);

  const handleStartRide = useCallback(() => {
    if (state.status !== 'ready' || !endpoints) return;

    // Already riding — the rider backed out of /navigation onto this screen.
    // Return to the HUD rather than enqueueing a second trip_start.
    if (useAppStore.getState().appState === 'NAVIGATING') {
      router.push('/navigation');
      return;
    }

    // Double-tap guard: a second tap before re-render would enqueue a
    // duplicate trip_start with a fresh clientTripId, orphaning the first.
    if (rideStartedRef.current) return;
    rideStartedRef.current = true;

    const store = useAppStore.getState();
    const startedAt = new Date().toISOString();
    const sessionId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `session-${Date.now()}`;

    // The course defines its own endpoints; POI and hazard queries in
    // navigation read them from routeRequest.
    store.setRouteRequest({
      origin: endpoints.origin,
      destination: endpoints.destination,
      waypoints: [],
      startOverride: undefined,
    });

    store.setRoutePreview(
      {
        routes: [state.route],
        selectedMode: 'safe',
        coverage: {
          countryCode: '',
          status: 'supported',
          safeRouting: false,
          fastRouting: false,
        },
        generatedAt: startedAt,
      },
      { preferredRouteId: state.route.id },
    );

    // Enqueued unconditionally, even with no auth session yet — the offline
    // queue is the right buffer and a missing trip_start is how recorded
    // rides get silently dropped (GPS audit 2026-07-15 P0-1).
    const clientTripId = createClientTripId();
    store.enqueueMutation('trip_start', {
      clientTripId,
      sessionId,
      startLocationText: `Course start (${endpoints.origin.lat.toFixed(5)}, ${endpoints.origin.lon.toFixed(5)})`,
      startCoordinate: endpoints.origin,
      destinationText: courseName,
      destinationCoordinate: endpoints.destination,
      distanceMeters: state.route.distanceMeters,
      startedAt,
    });
    store.setActiveTripClientId(clientTripId);

    telemetry.capture('navigation_started', {
      mode: 'course',
      route_id: state.route.id,
      route_source: state.route.source,
      course_points: state.course.coordinates.length,
    });

    store.startNavigation(state.route, sessionId);
    router.push('/navigation');
  }, [state, endpoints, courseName]);

  // ── Non-ready states ─────────────────────────────────────────────────────

  if (state.status !== 'ready') {
    return (
      <View style={styles.centered}>
        {state.status === 'reading' ? (
          <>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.centeredText}>{t('course.reading')}</Text>
          </>
        ) : (
          <>
            <Ionicons name="document-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.errorText}>{t(state.messageKey)}</Text>
          </>
        )}
        <Button variant="secondary" size="lg" onPress={() => router.back()}>
          {t('common.back')}
        </Button>
      </View>
    );
  }

  // ── Ready ────────────────────────────────────────────────────────────────

  const busyCountLabel = t(
    stretches.length === 1 ? 'course.busyFound_one' : 'course.busyFound_other',
    { count: stretches.length },
  );

  return (
    <MapStageScreen
      useBottomSheet
      peekContent={
        <View style={styles.peekStrip}>
          <Badge variant="info">{t('course.badge')}</Badge>
          <Text style={styles.peekStat}>
            {formatDistance(state.route.distanceMeters)}
          </Text>
          <Text style={styles.peekDivider}>·</Text>
          <Text style={styles.peekStat}>
            {formatDuration(state.route.adjustedDurationSeconds)}
          </Text>
          <View style={styles.peekSpacer} />
          {!state.scored ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : stretches.length > 0 ? (
            <Text style={styles.peekWarning}>{busyCountLabel}</Text>
          ) : null}
        </View>
      }
      map={
        <RouteMap
          routes={[state.route]}
          selectedRouteId={state.route.id}
          origin={endpoints?.origin}
          destination={endpoints?.destination}
          fullBleed
          showRouteOverlay={false}
          focusCoordinate={focus}
          focusKey={focusKey}
          a11yContext={{ mode: 'planning' }}
        />
      }
      topOverlay={
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.topTitle} numberOfLines={1}>
            {courseName}
          </Text>
        </View>
      }
      footer={
        <>
          <Button variant="primary" size="lg" fullWidth onPress={handleStartRide}>
            {t('course.startRide')}
          </Button>
          <Button
            variant="secondary"
            size="md"
            fullWidth
            disabled={saving || savedCourseId !== null}
            onPress={() => void handleSaveCourse()}
          >
            {savedCourseId !== null ? t('course.savedAlready') : t('course.saveCourse')}
          </Button>
        </>
      }
    >
      <ScrollView contentContainerStyle={styles.sheetContent}>
        {/* The pitch, stated plainly: we did not choose these roads. */}
        <View style={styles.provenanceRow}>
          <Ionicons name="navigate-outline" size={16} color={colors.info} />
          <Text style={styles.provenanceText}>{t('course.notOurRoute')}</Text>
        </View>

        <View style={styles.statsRow}>
          <Stat
            label={t('course.distance')}
            value={formatDistance(state.route.distanceMeters)}
            styles={styles}
          />
          <Stat
            label={t('course.estTime')}
            value={formatDuration(state.route.adjustedDurationSeconds)}
            styles={styles}
          />
          <Stat
            label={t('course.climb')}
            value={
              state.route.totalClimbMeters === null
                ? '—'
                : `${Math.round(state.route.totalClimbMeters)} m`
            }
            styles={styles}
          />
        </View>

        {/* Busy stretches — the reason to import into this app. */}
        {state.scored && riskCovered ? (
          <View style={styles.busySection}>
            <Text style={styles.sectionTitle}>{t('course.busyTitle')}</Text>
            {stretches.length === 0 ? (
              <Text style={styles.busyEmpty}>{t('course.busyNone')}</Text>
            ) : (
              <>
                <Text style={styles.busyHint}>{t('course.busyHint')}</Text>
                {stretches.map((stretch) => (
                  <Pressable
                    key={`${stretch.startIndex}-${stretch.endIndex}`}
                    onPress={() => handleFocusStretch(stretch)}
                    style={styles.busyRow}
                    accessibilityRole="button"
                    accessibilityLabel={t('course.busyRowLabel', {
                      distance: formatDistance(stretch.lengthMeters),
                      category: stretch.category,
                    })}
                  >
                    <Ionicons name="warning-outline" size={18} color={colors.caution} />
                    <View style={styles.busyTextColumn}>
                      <Text style={styles.busyDistance}>
                        {formatDistance(stretch.lengthMeters)}
                      </Text>
                      <Text style={styles.busyMeta}>
                        {t('course.atKm', {
                          distance: formatDistance(stretch.distanceFromStartMeters),
                        })}
                      </Text>
                    </View>
                    <Ionicons
                      name="locate-outline"
                      size={18}
                      color={colors.textSecondary}
                    />
                  </Pressable>
                ))}
              </>
            )}
          </View>
        ) : null}

        {state.scored && state.route.riskSegments.length > 0 ? (
          <RiskDistributionCard riskSegments={state.route.riskSegments} />
        ) : state.scored && !riskCovered ? (
          <View style={styles.noticeRow}>
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={colors.info}
            />
            <Text style={styles.noticeText}>{t('risk.dataUnavailable')}</Text>
          </View>
        ) : !state.scored ? (
          <View style={styles.noticeRow}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
            <Text style={styles.noticeText}>{t('course.scoring')}</Text>
          </View>
        ) : null}

        {state.route.elevationProfile && state.route.elevationProfile.length > 0 ? (
          <ElevationChart
            elevationProfile={state.route.elevationProfile}
            distanceMeters={state.route.distanceMeters}
          />
        ) : null}

        {/* Honest about what a GPX cannot carry. */}
        <View style={styles.noticeRow}>
          <Ionicons name="git-branch-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.noticeText}>{t('course.turnsOnly')}</Text>
        </View>

        {state.course.candidateCount > 1 ? (
          <View style={styles.noticeRow}>
            <Ionicons
              name="layers-outline"
              size={16}
              color={colors.textSecondary}
            />
            <Text style={styles.noticeText}>
              {t(
                state.course.candidateCount === 2
                  ? 'course.multipleTracks_one'
                  : 'course.multipleTracks_other',
                { count: state.course.candidateCount },
              )}
            </Text>
          </View>
        ) : null}

        {state.course.droppedPoints > 0 ? (
          <View style={styles.noticeRow}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.caution} />
            <Text style={styles.noticeText}>
              {t(
                state.course.droppedPoints === 1
                  ? 'course.droppedPoints_one'
                  : 'course.droppedPoints_other',
                { count: state.course.droppedPoints },
              )}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {limitVisible ? (
        <View style={styles.limitContainer}>
          <PremiumLimitCard
            kind="importedCourses"
            limitValue={premium.limits.importedCourses ?? 0}
            onUpgrade={() => {
              setLimitVisible(false);
              router.push('/profile');
            }}
            onDismiss={() => setLimitVisible(false)}
          />
        </View>
      ) : null}

      {saveToast ? (
        <View style={styles.toastContainer}>
          <Toast
            message={saveToast}
            variant={savedCourseId !== null ? 'success' : 'error'}
            onDismiss={() => setSaveToast(null)}
          />
        </View>
      ) : null}
    </MapStageScreen>
  );
}

const Stat = ({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createThemedStyles>;
}) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[4],
      padding: space[6],
      backgroundColor: colors.bgDeep,
    },
    centeredText: { color: colors.textSecondary, fontSize: 15 },
    errorText: {
      color: colors.textPrimary,
      fontSize: 16,
      textAlign: 'center',
      lineHeight: 22,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingHorizontal: space[4],
    },
    backButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.full,
      backgroundColor: colors.bgPrimary,
    },
    topTitle: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    peekStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      paddingHorizontal: space[4],
      height: 60,
    },
    peekStat: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
    peekDivider: { color: colors.textSecondary },
    peekSpacer: { flex: 1 },
    peekWarning: { color: colors.caution, fontSize: 13, fontWeight: '600' },
    sheetContent: { gap: space[4], paddingBottom: space[6] },
    provenanceRow: {
      flexDirection: 'row',
      gap: space[2],
      alignItems: 'flex-start',
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.lg,
      padding: space[3],
    },
    provenanceText: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
    statsRow: { flexDirection: 'row', gap: space[3] },
    stat: {
      flex: 1,
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.lg,
      padding: space[3],
      gap: space[1],
    },
    statValue: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
    statLabel: { color: colors.textSecondary, fontSize: 12 },
    busySection: { gap: space[2] },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '700',
    },
    busyEmpty: { color: colors.textSecondary, fontSize: 13 },
    busyHint: { color: colors.textSecondary, fontSize: 12 },
    busyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.lg,
      padding: space[3],
      minHeight: 56,
    },
    busyTextColumn: { flex: 1, gap: 2 },
    busyDistance: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
    busyMeta: { color: colors.textSecondary, fontSize: 12 },
    limitContainer: {
      position: 'absolute',
      left: space[4],
      right: space[4],
      bottom: space[6],
    },
    toastContainer: {
      position: 'absolute',
      left: space[4],
      right: space[4],
      bottom: space[6],
    },
    noticeRow: {
      flexDirection: 'row',
      gap: space[2],
      alignItems: 'flex-start',
    },
    noticeText: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
    },
  });
