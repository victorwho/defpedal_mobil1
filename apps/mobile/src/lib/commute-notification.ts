/**
 * Commute briefing scheduler: local notifications, rescheduled on every app
 * open and whenever the commute settings or Home/Work change.
 * Plan: docs/plans/commute-mode.md, step 4.
 *
 * Mirrors daily-weather-notification.ts: lazy `require('expo-notifications')`
 * behind `hasNotificationsNativeModule()`; forecast fetched BEFORE any side
 * effect so a failed fetch leaves the previous set intact; generation-tagged
 * ids scheduled BEFORE the old generation is cancelled (a crash in between
 * leaves duplicates the next pass sweeps, never an empty queue); one-shot
 * `timeInterval` triggers, no exact alarms (Doze drift of 5-15 min accepted).
 *
 * This module never asks for notification permission. The ask belongs to the
 * moment the rider turns Commute on (Profile, step 5).
 */
import {
  riderPace,
  type Coordinate,
  type RiderPace,
  type RoutePreviewRequest,
  type RoutePreviewResponse,
} from '@defensivepedal/core';
import { Platform } from 'react-native';

import { translate, type Locale } from '../i18n';
import type { CommuteDirection, CommuteRouteEstimate } from '../store/commuteSlice';
import { buildCommuteMessage, type CommuteHourForecast } from './commute-messages';
import { buildHourlyForecastUrl, hourKey, parseHourlyForecast } from './commute-forecast';
import { buildCommuteFires, type CommuteFire } from './commute-schedule';
import { hasNotificationsNativeModule } from './notificationNativeModule';
import { telemetry } from './telemetry';

export const COMMUTE_ID_PREFIX = 'commute-briefing';
export const COMMUTE_NOTIFICATION_TYPE = 'commute';
const COMMUTE_CHANNEL_ID = 'commute';
const ROUTE_ESTIMATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type NotificationsModule = typeof import('expo-notifications');
type AppStoreHook = typeof import('../store/appStore').useAppStore;
type Forecast = Map<string, CommuteHourForecast>;

// Test seam: lazy require() calls bypass vitest's module mocks (same as the
// weather scheduler), so tests inject fakes here.
let testOverrides: {
  notifications?: NotificationsModule;
  store?: AppStoreHook;
  fetchForecast?: (lat: number, lon: number) => Promise<Forecast | null>;
  previewRoute?: (request: RoutePreviewRequest) => Promise<RoutePreviewResponse>;
  fetchPace?: () => Promise<RiderPace | null>;
} = {};

export const __setCommuteTestOverrides = (overrides: typeof testOverrides): void => {
  testOverrides = overrides;
};

const getNotifications = (): NotificationsModule | null => {
  if (testOverrides.notifications) return testOverrides.notifications;
  if (!hasNotificationsNativeModule()) return null;
  try {
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
};

const getAppStore = (): AppStoreHook => {
  if (testOverrides.store) return testOverrides.store;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('../store/appStore') as typeof import('../store/appStore')).useAppStore;
};

const fetchForecast = async (lat: number, lon: number): Promise<Forecast | null> => {
  if (testOverrides.fetchForecast) return testOverrides.fetchForecast(lat, lon);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(buildHourlyForecastUrl(lat, lon), { signal: controller.signal });
    if (!response.ok) return null;
    return parseHourlyForecast(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const previewRoute = (request: RoutePreviewRequest): Promise<RoutePreviewResponse> => {
  if (testOverrides.previewRoute) return testOverrides.previewRoute(request);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { directPreviewRoute } = require('./mapbox-routing') as typeof import('./mapbox-routing');
  return directPreviewRoute(request, { canopyComparison: false });
};

/**
 * The rider's pace from trip history, the same read the loop planner makes.
 * Null on failure: the briefing then shows the router's time.
 */
const fetchPace = async (): Promise<RiderPace | null> => {
  if (testOverrides.fetchPace) return testOverrides.fetchPace();
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { mobileApi } = require('./api') as typeof import('./api');
    return riderPace(await mobileApi.getTripHistory());
  } catch {
    return null;
  }
};

// "Show route" on a briefing, remembered until the ride it leads to starts, so
// `navigation_started` can carry `source: 'commute'`. In memory, and it
// expires after the 2 h the plan's success criterion measures.
export const COMMUTE_TAP_WINDOW_MS = 2 * 60 * 60 * 1000;
let commuteTappedAt: number | null = null;
export const markCommuteTapped = (now: number = Date.now()): void => {
  commuteTappedAt = now;
};
export const consumeCommuteTapped = (now: number = Date.now()): boolean => {
  const tapped = commuteTappedAt !== null && now - commuteTappedAt <= COMMUTE_TAP_WINDOW_MS;
  commuteTappedAt = null;
  return tapped;
};

export interface CommuteTarget {
  readonly direction: CommuteDirection;
  readonly origin: Coordinate;
  readonly destination: Coordinate;
}

const isCoordinate = (v: unknown): v is Coordinate => {
  const c = v as { lat?: unknown; lon?: unknown } | null;
  return (
    typeof c?.lat === 'number' && typeof c.lon === 'number' &&
    Number.isFinite(c.lat) && Number.isFinite(c.lon) &&
    Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180
  );
};

/** A briefing's tap payload, validated: it is replayed into routing. */
export const parseCommuteTarget = (data: unknown): CommuteTarget | null => {
  const d = data as { type?: unknown; direction?: unknown; origin?: unknown; destination?: unknown } | null;
  if (d?.type !== COMMUTE_NOTIFICATION_TYPE) return null;
  if (d.direction !== 'to_work' && d.direction !== 'to_home') return null;
  if (!isCoordinate(d.origin) || !isCoordinate(d.destination)) return null;
  return {
    direction: d.direction,
    origin: { lat: d.origin.lat, lon: d.origin.lon },
    destination: { lat: d.destination.lat, lon: d.destination.lon },
  };
};

/** Identifies a Home/Work pair; a cached route estimate is valid only for it. */
export const commutePlacesKey = (home: Coordinate, work: Coordinate): string =>
  [home.lat, home.lon, work.lat, work.lon].map((v) => v.toFixed(5)).join(',');

type StoreState = ReturnType<AppStoreHook['getState']>;

/** Home and Work coordinates, or null when either is missing. */
export const commutePlaces = (
  state: Pick<StoreState, 'savedPlaces'>,
): { home: Coordinate; work: Coordinate } | null => {
  const home = state.savedPlaces.home?.coordinates;
  const work = state.savedPlaces.work?.coordinates;
  return home && work ? { home, work } : null;
};

/**
 * The safe-route estimate for one direction: the cached one while fresh,
 * otherwise a new fetch. On a failed fetch the older estimate for the same
 * places is still better than none. Only a SAFE route counts: the briefing
 * says "safe route", and outside coverage the router degrades to Fast.
 */
const routeEstimate = async (
  direction: CommuteDirection,
  from: Coordinate,
  to: Coordinate,
  placesKey: string,
  now: Date,
): Promise<CommuteRouteEstimate | null> => {
  const store = getAppStore();
  const state = store.getState();
  const cached = state.commute.routeEstimates.find(
    (e) => e.direction === direction && e.placesKey === placesKey,
  );
  if (cached && now.getTime() - Date.parse(cached.fetchedAt) < ROUTE_ESTIMATE_MAX_AGE_MS) return cached;
  try {
    const response = await previewRoute({
      origin: from,
      destination: to,
      mode: 'safe',
      avoidUnpaved: state.avoidUnpaved,
      avoidHills: false,
      avoidHeat: false,
      isEbike: state.isEbike,
      showRouteComparison: false,
      locale: state.locale,
    });
    const route = response.routes[0];
    if (response.selectedMode !== 'safe' || !route) return cached ?? null;
    const estimate: CommuteRouteEstimate = {
      direction,
      durationSeconds: route.adjustedDurationSeconds,
      distanceMeters: route.distanceMeters,
      climbMeters: route.totalClimbMeters,
      fetchedAt: now.toISOString(),
      placesKey,
    };
    store.getState().setCommuteRouteEstimate(estimate);
    return estimate;
  } catch {
    return cached ?? null;
  }
};

interface PlannedBriefing {
  readonly id: string;
  readonly at: Date;
  readonly title: string;
  readonly body: string;
  readonly data: Record<string, unknown>;
}

const planBriefing = (
  fire: CommuteFire,
  id: string,
  places: { home: Coordinate; work: Coordinate },
  forecasts: Record<CommuteDirection, Forecast | null>,
  routes: Record<CommuteDirection, CommuteRouteEstimate | null>,
  pace: RiderPace | null,
  state: StoreState,
): PlannedBriefing => {
  const toWork = fire.direction === 'to_work';
  const origin = toWork ? places.home : places.work;
  const destination = toWork ? places.work : places.home;
  const departTime = (toWork ? state.commute.departTime : state.commute.returnTime) ?? '';
  const message = buildCommuteMessage({
    direction: fire.direction,
    departTime,
    departAt: fire.departAt,
    origin,
    forecast: forecasts[fire.direction]?.get(hourKey(fire.departAt)) ?? null,
    route: routes[fire.direction],
    pace,
    units: state.measurementSystem,
    t: (key, vars) => translate(state.locale as Locale, key, vars),
  });
  return {
    id,
    at: fire.at,
    title: message.title,
    body: message.body,
    // Coordinates, not a store reference: a tap routes where the briefing said
    // even if Home or Work changed after it was scheduled.
    data: { type: COMMUTE_NOTIFICATION_TYPE, direction: fire.direction, origin, destination, tone: message.tone },
  };
};

const ensureChannel = async (N: NotificationsModule): Promise<void> => {
  if (Platform.OS !== 'android') return;
  await N.setNotificationChannelAsync(COMMUTE_CHANNEL_ID, {
    name: 'Commute briefings',
    importance: N.AndroidImportance.DEFAULT,
    description: 'Weather and route time before you ride to work or home',
  });
};

const scheduleOne = (N: NotificationsModule, b: PlannedBriefing, now: Date): Promise<unknown> => {
  const input = {
    identifier: b.id,
    content: {
      title: b.title,
      body: b.body,
      sound: 'default',
      data: b.data,
      ...(Platform.OS === 'android' ? { channelId: COMMUTE_CHANNEL_ID } : {}),
    },
    trigger: {
      type: 'timeInterval' as never,
      seconds: Math.max(1, Math.floor((b.at.getTime() - now.getTime()) / 1000)),
      repeats: false,
    },
  };
  // One retry: a transient failure would otherwise drop that briefing.
  return N.scheduleNotificationAsync(input)
    .catch(() => N.scheduleNotificationAsync(input))
    .catch(() => undefined);
};

/** Cancel every commute briefing except the given generation (null = all). */
const cancelBriefingsExcept = async (N: NotificationsModule, keepGeneration: string | null): Promise<void> => {
  const keepPrefix = keepGeneration ? `${COMMUTE_ID_PREFIX}-${keepGeneration}-` : null;
  try {
    const scheduled = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(
          (s) => s.identifier.startsWith(COMMUTE_ID_PREFIX) && !(keepPrefix && s.identifier.startsWith(keepPrefix)),
        )
        .map((s) => N.cancelScheduledNotificationAsync(s.identifier).catch(() => undefined)),
    );
  } catch {
    // Enumeration failed: the next successful pass sweeps what is left.
    // Duplicates beat silence.
  }
};

export type CommuteScheduleResult =
  | 'scheduled'
  | 'off'
  | 'no_permission'
  | 'unavailable'
  | 'forecast_failed';

/**
 * One scheduling pass. Off, or Home/Work missing, cancels everything. A failed
 * forecast keeps the previous set. A missing route only drops the ETA line.
 */
export const scheduleCommuteBriefings = async (now: Date = new Date()): Promise<CommuteScheduleResult> => {
  const N = getNotifications();
  if (!N) return 'unavailable';

  const state = getAppStore().getState();
  const places = commutePlaces(state);
  const fires = places ? buildCommuteFires(now, state.commute) : [];
  if (!places || fires.length === 0) {
    await cancelBriefingsExcept(N, null);
    return 'off';
  }

  const { status } = await N.getPermissionsAsync();
  if (status !== 'granted') return 'no_permission';

  const needsHome = fires.some((f) => f.direction === 'to_home');
  const [toWorkForecast, toHomeForecast] = await Promise.all([
    fetchForecast(places.home.lat, places.home.lon),
    needsHome ? fetchForecast(places.work.lat, places.work.lon) : Promise.resolve(null),
  ]);
  if (!toWorkForecast || (needsHome && !toHomeForecast)) return 'forecast_failed';

  const key = commutePlacesKey(places.home, places.work);
  const routes = {
    to_work: await routeEstimate('to_work', places.home, places.work, key, now),
    to_home: needsHome ? await routeEstimate('to_home', places.work, places.home, key, now) : null,
  };
  const pace = await fetchPace();

  // Re-read: the route fetch may have taken a while, and the rider may have
  // changed the settings meanwhile. A pass on stale settings is harmless (the
  // change triggers its own pass), so this only refreshes the text inputs.
  const latest = getAppStore().getState();
  const generation = `g${now.getTime().toString(36)}`;
  const planned = fires.map((fire, i) =>
    planBriefing(
      fire,
      `${COMMUTE_ID_PREFIX}-${generation}-${i}`,
      places,
      { to_work: toWorkForecast, to_home: toHomeForecast },
      routes,
      pace,
      latest,
    ),
  );

  await ensureChannel(N);
  await Promise.all(planned.map((b) => scheduleOne(N, b, now)));
  await cancelBriefingsExcept(N, generation);
  telemetry.capture('commute_briefing_scheduled', {
    count: planned.length,
    has_eta: routes.to_work !== null,
    personal_eta: pace?.personal === true,
  });
  return 'scheduled';
};

/** Cancel every pending commute briefing. */
export const cancelCommuteBriefings = async (): Promise<void> => {
  const N = getNotifications();
  if (N) await cancelBriefingsExcept(N, null);
};

/**
 * Diagnostics only: a to-work briefing for right now, firing in 10 s, built
 * exactly like a real one (live forecast, cached or fetched route).
 */
export const fireTestCommuteBriefing = async (now: Date = new Date()): Promise<string> => {
  const N = getNotifications();
  if (!N) return 'notifications unavailable';
  const state = getAppStore().getState();
  const places = commutePlaces(state);
  if (!places) return 'set Home and Work first';
  const { status } = await N.getPermissionsAsync();
  if (status !== 'granted') return 'notification permission not granted';

  const forecast = await fetchForecast(places.home.lat, places.home.lon);
  const route = await routeEstimate('to_work', places.home, places.work, commutePlacesKey(places.home, places.work), now);
  const pace = await fetchPace();
  const departAt = new Date(now.getTime() + 15 * 60 * 1000);
  const fire: CommuteFire = { at: new Date(now.getTime() + 10_000), departAt, direction: 'to_work' };
  const latest = getAppStore().getState();
  const departTime = `${hourKey(departAt).slice(11, 13)}:${String(departAt.getMinutes()).padStart(2, '0')}`;
  const briefing = planBriefing(
    fire,
    `${COMMUTE_ID_PREFIX}-test`,
    places,
    { to_work: forecast, to_home: null },
    { to_work: route, to_home: null },
    pace,
    { ...latest, commute: { ...latest.commute, departTime } },
  );
  await ensureChannel(N);
  await scheduleOne(N, briefing, now);
  const paceNote = pace?.personal ? `your pace ${pace.kmh.toFixed(1)} km/h` : `router time, ${pace?.rideCount ?? 0} usable rides`;
  return `scheduled in 10 s (forecast ${forecast ? 'ok' : 'missing'}, route ${route ? 'ok' : 'missing'}, ${paceNote})`;
};
