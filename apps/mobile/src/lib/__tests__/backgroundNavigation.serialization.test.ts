/**
 * Background-navigation task operations must SERIALIZE.
 *
 * Regression cover for P1-8 in docs/plans/external-review-triage-2026-09-25.md.
 *
 * `startBackgroundNavigationUpdates` awaits a status write, then
 * `ensurePermissions()` (which can put an OS dialog in front of the rider),
 * then a bridge call, before it finally registers the task. If the ride ended
 * anywhere inside that window, the stop ran first, asked
 * `hasStartedLocationUpdatesAsync` -> false, concluded there was nothing to
 * stop, and wrote 'idle'. The start then completed and registered the task --
 * and because `isNavigating` was already false, NavigationLifecycleManager's
 * effect never fired again, so nothing ever stopped it. BestForNavigation GPS
 * and the "recording your ride" foreground-service notification kept running
 * after the ride was over.
 *
 * The assertion that matters is the FINAL registered state of the task, not the
 * call counts -- the bug was an ordering bug with perfectly reasonable calls.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('../storage', () => ({
  keyValueStorage: {
    getString: vi.fn(async (k: string) => store.get(k) ?? null),
    setString: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    delete: vi.fn(async (k: string) => {
      store.delete(k);
    }),
  },
}));

// Simulated OS state for the background task.
let taskRegistered = false;
/** Resolves when the test decides the permission prompt is answered. */
let permissionGate: Promise<void> = Promise.resolve();

const startLocationUpdatesAsync = vi.fn(async () => {
  taskRegistered = true;
});
const stopLocationUpdatesAsync = vi.fn(async () => {
  taskRegistered = false;
});

vi.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 4 },
  ActivityType: { Fitness: 3 },
  getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  // The window: background permission is where the OS dialog lives.
  getBackgroundPermissionsAsync: async () => {
    await permissionGate;
    return { status: 'granted' };
  },
  requestBackgroundPermissionsAsync: async () => ({ status: 'granted' }),
  hasStartedLocationUpdatesAsync: async () => taskRegistered,
  startLocationUpdatesAsync: (...args: unknown[]) => startLocationUpdatesAsync(...(args as [])),
  stopLocationUpdatesAsync: (...args: unknown[]) => stopLocationUpdatesAsync(...(args as [])),
}));

vi.mock('expo-task-manager', () => ({
  isTaskDefined: () => true,
  defineTask: vi.fn(),
}));

vi.mock('../../store/appStore', () => ({
  useAppStore: { getState: () => ({ locale: 'en' }) },
}));

const { startBackgroundNavigationUpdates, stopBackgroundNavigationUpdates } = await import(
  '../backgroundNavigation'
);

describe('background navigation task operations serialize', () => {
  beforeEach(() => {
    store.clear();
    taskRegistered = false;
    permissionGate = Promise.resolve();
    startLocationUpdatesAsync.mockClear();
    stopLocationUpdatesAsync.mockClear();
  });

  it('leaves the task STOPPED when the ride ends while the start is still in flight', async () => {
    // Hold the start inside ensurePermissions, exactly where the OS dialog sits.
    let openGate = () => {};
    permissionGate = new Promise<void>((resolve) => {
      openGate = resolve;
    });

    const starting = startBackgroundNavigationUpdates();

    // Rider ends the ride before the start has registered anything.
    const stopping = stopBackgroundNavigationUpdates();

    openGate();
    await Promise.all([starting, stopping]);

    // The whole point: GPS and the foreground-service notification must not
    // still be running after the ride ended.
    expect(taskRegistered).toBe(false);
    expect(stopLocationUpdatesAsync).toHaveBeenCalledTimes(1);
  });

  it('leaves the task RUNNING when a ride starts while a stop is still in flight', async () => {
    // The mirror case: ordering must not strand a live ride without background
    // recording either, which is how the locked-screen distance gets lost.
    taskRegistered = true;

    const stopping = stopBackgroundNavigationUpdates();
    const starting = startBackgroundNavigationUpdates();

    await Promise.all([stopping, starting]);

    expect(taskRegistered).toBe(true);
  });

  it('a failed start does not wedge later operations', async () => {
    // The queue must advance past a rejection -- otherwise one denied
    // permission would silently disable every subsequent stop for the process
    // lifetime, which is worse than the bug being fixed.
    permissionGate = Promise.reject(new Error('boom'));
    // Attach a catch immediately so the rejection is never unhandled.
    permissionGate.catch(() => undefined);

    await expect(startBackgroundNavigationUpdates()).rejects.toThrow();

    permissionGate = Promise.resolve();
    taskRegistered = true;
    await stopBackgroundNavigationUpdates();

    expect(taskRegistered).toBe(false);
  });
});
