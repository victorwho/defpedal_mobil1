/**
 * Anonymous Activation Ladder — scheduler glue.
 *
 * Spec: docs/plans/anonymous-activation-ladder.md §5. Mirrors
 * `daily-weather-notification.ts`: native-module guard → lazy require →
 * cancel-by-identifier → schedule a one-shot timeInterval trigger.
 *
 * Repo notification checklist (CLAUDE.md → Notifications):
 * - (a) gated on `hasNotificationsNativeModule()`, lazy `require()` in
 *   try/catch. NEVER `NativeModules.*` (error-log #21/#2b — undefined on
 *   bridgeless preview/production builds).
 * - (b) NO permission prompt here — `DailyWeatherScheduler` owns the single
 *   `ensureNotificationPermissionAsync()` ask. This module only reads
 *   `getPermissionsAsync()`.
 * - (c) payload `data = { type: 'activation_ladder', rung, stage }`.
 * - (f) Android channel `activation` (default importance).
 *
 * `runActivationLadderPass` is dependency-injected (notifier + store facade)
 * so the whole pass is unit-testable without expo-notifications mocks.
 */

import {
  buildRungContent,
  computeRungFireTime,
  computeSecondsUntilFire,
  deriveActivationStage,
  hasScheduledRungFired,
  selectNextRung,
  shouldStopLadder,
  type ActivationLadderState,
  type ActivationRung,
} from './activation-ladder-messages';
import { hasNotificationsNativeModule } from './notificationNativeModule';

const IDENTIFIER_PREFIX = 'activation-ladder-';
const CHANNEL_ID = 'activation';
const ALL_IDENTIFIERS = [1, 2, 3].map((r) => `${IDENTIFIER_PREFIX}${r}`);

const getNotifications = () => {
  if (!hasNotificationsNativeModule()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Notifier seam (injected in tests; defaultLadderNotifier in production)
// ---------------------------------------------------------------------------

export interface LadderNotifier {
  /** Read-only — never prompts (checklist (b)). */
  isPermissionGranted: () => Promise<boolean>;
  cancelAll: () => Promise<void>;
  schedule: (input: {
    identifier: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    seconds: number;
  }) => Promise<void>;
}

export const createDefaultLadderNotifier = (): LadderNotifier | null => {
  const N = getNotifications();
  if (!N) return null;
  // Lazy so importing this module never drags react-native into node tests.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Platform } = require('react-native') as typeof import('react-native');
  return {
    isPermissionGranted: async () => {
      const { status } = await N.getPermissionsAsync();
      return status === 'granted';
    },
    cancelAll: async () => {
      await Promise.all(
        ALL_IDENTIFIERS.map((id) =>
          N.cancelScheduledNotificationAsync(id).catch(() => {}),
        ),
      );
    },
    schedule: async ({ identifier, title, body, data, seconds }) => {
      if (Platform.OS === 'android') {
        await N.setNotificationChannelAsync(CHANNEL_ID, {
          name: 'Getting started',
          importance: N.AndroidImportance.DEFAULT,
          description: 'Reminders to plan your first safe ride',
        });
      }
      await N.scheduleNotificationAsync({
        identifier,
        content: {
          title,
          body,
          sound: 'default',
          data,
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
        },
        trigger: {
          type: 'timeInterval' as never,
          seconds,
          repeats: false,
        },
      });
    },
  };
};

// ---------------------------------------------------------------------------
// Store facade seam
// ---------------------------------------------------------------------------

export interface LadderStoreFacade {
  getLadder: () => ActivationLadderState;
  setFirstOpen: (iso: string) => void;
  markRungFired: (rung: number) => void;
  setScheduled: (scheduled: { rung: ActivationRung; fireAt: string }) => void;
  complete: () => void;
}

export interface LadderPassFlags {
  toggleEnabled: boolean;
  completedRideCount: number;
  isAnonymous: boolean;
  hasPreviewedRoute: boolean;
  hasStartedTrip: boolean;
}

export type LadderPassResult =
  | 'stopped'
  | 'no-permission'
  | 'scheduled'
  | 'exhausted';

/**
 * One schedule pass (spec §5, "Scheduling mechanics"). Runs on every app open:
 * 1. init firstOpenAt; 2. record a past-due scheduled rung as fired;
 * 3. stop conditions → cancel + complete; 4. schedule the next unfired rung
 * at the next 18:45 ≥ its threshold. Idempotent — re-running cancels and
 * re-schedules the same rung with the same fire time.
 */
export const runActivationLadderPass = async (deps: {
  now: Date;
  locale: string;
  flags: LadderPassFlags;
  store: LadderStoreFacade;
  notifier: LadderNotifier;
}): Promise<LadderPassResult> => {
  const { now, locale, flags, store, notifier } = deps;

  if (!store.getLadder().firstOpenAt) {
    store.setFirstOpen(now.toISOString());
  }

  // Spec §5.4: no reliable "delivered" callback exists for local one-shots
  // across app kills — record the previously scheduled rung as fired on the
  // first pass that sees its fire time in the past.
  const beforeMark = store.getLadder();
  if (
    beforeMark.scheduledRung &&
    hasScheduledRungFired(beforeMark.scheduledRung, now)
  ) {
    store.markRungFired(beforeMark.scheduledRung.rung);
  }

  const ladder = store.getLadder();
  if (
    shouldStopLadder({
      completedRideCount: flags.completedRideCount,
      isAnonymous: flags.isAnonymous,
      rungsFiredCount: ladder.rungsFired.length,
      toggleEnabled: flags.toggleEnabled,
      completed: ladder.completed,
    })
  ) {
    await notifier.cancelAll();
    if (!ladder.completed) store.complete();
    return 'stopped';
  }

  // Permission not granted → the ladder stays silent (spec §9). Not a stop:
  // if the user grants permission later, the next pass resumes scheduling.
  if (!(await notifier.isPermissionGranted())) {
    return 'no-permission';
  }

  const nextRung = selectNextRung(ladder.rungsFired);
  if (nextRung === null) {
    // Defensive — shouldStopLadder already covers rungsFired >= 3.
    await notifier.cancelAll();
    if (!ladder.completed) store.complete();
    return 'exhausted';
  }

  const stage = deriveActivationStage({
    hasPreviewedRoute: flags.hasPreviewedRoute,
    hasStartedTrip: flags.hasStartedTrip,
  });
  const { title, body } = buildRungContent(locale, nextRung, stage);
  const firstOpenAt = new Date(store.getLadder().firstOpenAt ?? now.toISOString());
  const fireAt = computeRungFireTime(firstOpenAt, nextRung, now);
  const seconds = computeSecondsUntilFire(fireAt, now);

  // One pending ladder notification at a time (spec §3): cancel, reschedule.
  await notifier.cancelAll();
  await notifier.schedule({
    identifier: `${IDENTIFIER_PREFIX}${nextRung}`,
    title,
    body,
    data: { type: 'activation_ladder', rung: nextRung, stage },
    seconds,
  });
  store.setScheduled({ rung: nextRung, fireAt: fireAt.toISOString() });
  return 'scheduled';
};

// ---------------------------------------------------------------------------
// Production wiring (store + auth read at call time)
// ---------------------------------------------------------------------------

const getAppStore = () => {
  // Lazy so unit tests of the pass never touch zustand persistence.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAppStore } = require('../store/appStore') as typeof import('../store/appStore');
  return useAppStore;
};

const buildStoreFacade = (): LadderStoreFacade => {
  const useAppStore = getAppStore();
  return {
    getLadder: () => useAppStore.getState().activationLadder,
    setFirstOpen: (iso) => useAppStore.getState().initActivationLadderFirstOpen(iso),
    markRungFired: (rung) => useAppStore.getState().markActivationLadderRungFired(rung),
    setScheduled: (scheduled) => useAppStore.getState().setActivationLadderScheduled(scheduled),
    complete: () => useAppStore.getState().completeActivationLadder(),
  };
};

/**
 * Run a schedule pass against the live store. `isAnonymous` comes from the
 * auth context (the store doesn't know it).
 */
export const runActivationLadderPassFromStore = async (
  isAnonymous: boolean,
): Promise<LadderPassResult | 'unavailable'> => {
  const notifier = createDefaultLadderNotifier();
  if (!notifier) return 'unavailable';
  const state = getAppStore().getState();
  return runActivationLadderPass({
    now: new Date(),
    locale: state.locale,
    flags: {
      toggleEnabled: state.notifyActivationLadder,
      completedRideCount: state.completedRideCount,
      isAnonymous,
      // Stage evidence (spec §4): B = any sign the user previewed a route;
      // C = any sign a trip was started (queued mutation, active client trip,
      // or a resolved server id).
      hasPreviewedRoute:
        state.routePreview !== null || state.recentDestinations.length > 0,
      hasStartedTrip:
        state.activeTripClientId !== null ||
        Object.keys(state.tripServerIds).length > 0 ||
        state.queuedMutations.some((m) => m.type === 'trip_start'),
    },
    store: buildStoreFacade(),
    notifier,
  });
};

/**
 * Hard stop from UI (Profile toggle off): cancel anything pending and mark
 * the ladder completed — spec §4: any stop is permanent.
 */
export const stopActivationLadder = async (): Promise<void> => {
  const useAppStore = getAppStore();
  if (!useAppStore.getState().activationLadder.completed) {
    useAppStore.getState().completeActivationLadder();
  }
  const notifier = createDefaultLadderNotifier();
  if (notifier) await notifier.cancelAll();
};

/**
 * Diagnostics dev tool: fire the next rung NOW and advance the ladder as if
 * it had fired for real — the rung is recorded in `rungsFired` and a normal
 * schedule pass runs afterwards, so the readout immediately shows the next
 * rung scheduled (or the ladder completed after rung 3). Lets QA walk all
 * three rungs without waiting days.
 *
 * The instant notification is scheduled under the `-dev` identifier —
 * deliberately OUTSIDE the pass's cancel set, otherwise the follow-up pass's
 * cancel-then-schedule would kill it in the 2s before it fires.
 */
export const fireNextLadderRungNowForDev = async (
  isAnonymous: boolean,
): Promise<string> => {
  const notifier = createDefaultLadderNotifier();
  if (!notifier) return 'notifications module unavailable';
  if (!(await notifier.isPermissionGranted())) return 'permission not granted';

  const useAppStore = getAppStore();
  const state = useAppStore.getState();
  if (state.activationLadder.completed) {
    return 'ladder already completed — clear app data to restart it';
  }
  const rung = selectNextRung(state.activationLadder.rungsFired);
  if (rung === null) return 'all 3 rungs already fired';

  const stage = deriveActivationStage({
    hasPreviewedRoute:
      state.routePreview !== null || state.recentDestinations.length > 0,
    hasStartedTrip:
      state.activeTripClientId !== null ||
      Object.keys(state.tripServerIds).length > 0 ||
      state.queuedMutations.some((m) => m.type === 'trip_start'),
  });
  const { title, body } = buildRungContent(state.locale, rung, stage);
  await notifier.schedule({
    identifier: `${IDENTIFIER_PREFIX}dev`,
    title,
    body,
    data: { type: 'activation_ladder', rung, stage },
    seconds: 2,
  });

  // Simulate the real lifecycle: record the rung as fired, then run a normal
  // pass — it cancels the pending 18:45 one-shot and schedules the next rung
  // (or stops + completes the ladder when this was rung 3 / a stop condition
  // holds, e.g. the tester is signed in).
  useAppStore.getState().markActivationLadderRungFired(rung);
  const passResult = await runActivationLadderPassFromStore(isAnonymous);
  return `rung ${rung} (stage ${stage}) fires in ~2s — recorded as fired; next pass: ${passResult}`;
};
