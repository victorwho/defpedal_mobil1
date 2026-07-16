import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock expo-modules-core so importing the module under test never touches a
// real native probe (an unmocked import throws a __DEV__ reference error).
vi.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: () => null,
}));

import {
  runActivationLadderPass,
  type LadderNotifier,
  type LadderPassFlags,
  type LadderStoreFacade,
} from './activation-ladder';
import {
  LADDER_COPY,
  type ActivationLadderState,
} from './activation-ladder-messages';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const makeFakeStore = (initial?: Partial<ActivationLadderState>) => {
  let ladder: ActivationLadderState = {
    firstOpenAt: null,
    rungsFired: [],
    completed: false,
    scheduledRung: null,
    ...initial,
  };
  const facade: LadderStoreFacade = {
    getLadder: () => ladder,
    setFirstOpen: (iso) => {
      if (!ladder.firstOpenAt) ladder = { ...ladder, firstOpenAt: iso };
    },
    markRungFired: (rung) => {
      ladder = {
        ...ladder,
        rungsFired: ladder.rungsFired.includes(rung)
          ? ladder.rungsFired
          : [...ladder.rungsFired, rung],
        scheduledRung: null,
      };
    },
    setScheduled: (scheduled) => {
      ladder = { ...ladder, scheduledRung: scheduled };
    },
    complete: () => {
      ladder = { ...ladder, completed: true, scheduledRung: null };
    },
  };
  return { facade, get: () => ladder };
};

interface ScheduledCall {
  identifier: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  seconds: number;
}

const makeFakeNotifier = (permissionGranted = true) => {
  const scheduled: ScheduledCall[] = [];
  let cancelCount = 0;
  const notifier: LadderNotifier = {
    isPermissionGranted: async () => permissionGranted,
    cancelAll: async () => {
      cancelCount += 1;
    },
    schedule: async (input) => {
      scheduled.push(input);
    },
  };
  return {
    notifier,
    scheduled,
    get cancelCount() {
      return cancelCount;
    },
  };
};

const baseFlags: LadderPassFlags = {
  toggleEnabled: true,
  completedRideCount: 0,
  isAnonymous: true,
  hasPreviewedRoute: false,
  hasStartedTrip: false,
};

const NOW = new Date(2026, 6, 16, 12, 0, 0); // local noon

const runPass = (overrides?: {
  flags?: Partial<LadderPassFlags>;
  store?: ReturnType<typeof makeFakeStore>;
  notifier?: ReturnType<typeof makeFakeNotifier>;
  now?: Date;
  locale?: string;
}) => {
  const store = overrides?.store ?? makeFakeStore();
  const notifier = overrides?.notifier ?? makeFakeNotifier();
  const promise = runActivationLadderPass({
    now: overrides?.now ?? NOW,
    locale: overrides?.locale ?? 'en',
    flags: { ...baseFlags, ...overrides?.flags },
    store: store.facade,
    notifier: notifier.notifier,
  });
  return { promise, store, notifier };
};

beforeEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

describe('runActivationLadderPass — scheduling', () => {
  it('first pass: initializes firstOpenAt and schedules rung 1 with the ladder payload', async () => {
    const { promise, store, notifier } = runPass();
    await expect(promise).resolves.toBe('scheduled');

    expect(store.get().firstOpenAt).toBe(NOW.toISOString());
    expect(store.get().scheduledRung?.rung).toBe(1);
    expect(notifier.scheduled).toHaveLength(1);

    const call = notifier.scheduled[0];
    expect(call.identifier).toBe('activation-ladder-1');
    expect(call.data).toEqual({ type: 'activation_ladder', rung: 1, stage: 'A' });
    expect(call.title).toBe(LADDER_COPY.en.rung1.stageA.title);
    expect(call.seconds).toBeGreaterThanOrEqual(60);
  });

  it('is idempotent: a second pass cancels and re-schedules the SAME rung, no double-mark', async () => {
    const store = makeFakeStore();
    const notifier = makeFakeNotifier();
    await runPass({ store, notifier }).promise;
    const firstFireAt = store.get().scheduledRung?.fireAt;

    const secondNow = new Date(NOW.getTime() + 60_000);
    await runPass({ store, notifier, now: secondNow }).promise;

    expect(store.get().rungsFired).toEqual([]);
    expect(store.get().scheduledRung?.rung).toBe(1);
    expect(store.get().scheduledRung?.fireAt).toBe(firstFireAt);
    // One cancel per pass (cancel-then-schedule), two schedules total but
    // always the same identifier — the OS keeps only the latest.
    expect(notifier.scheduled.map((c) => c.identifier)).toEqual([
      'activation-ladder-1',
      'activation-ladder-1',
    ]);
  });

  it('records a past-due scheduled rung as fired, then schedules the next rung', async () => {
    const store = makeFakeStore({
      firstOpenAt: new Date(2026, 6, 10, 12, 0, 0).toISOString(),
      scheduledRung: { rung: 1, fireAt: new Date(2026, 6, 11, 18, 45, 0).toISOString() },
    });
    const notifier = makeFakeNotifier();

    await expect(runPass({ store, notifier }).promise).resolves.toBe('scheduled');

    expect(store.get().rungsFired).toEqual([1]);
    expect(store.get().scheduledRung?.rung).toBe(2);
    expect(notifier.scheduled[0].identifier).toBe('activation-ladder-2');
  });

  it('uses stage-B copy for a user who previewed a route', async () => {
    const { promise, notifier } = runPass({ flags: { hasPreviewedRoute: true } });
    await promise;
    expect(notifier.scheduled[0].data.stage).toBe('B');
    expect(notifier.scheduled[0].title).toBe(LADDER_COPY.en.rung1.stageB.title);
  });

  it('uses stage-C (stage-B copy) for a user who started a trip', async () => {
    const { promise, notifier } = runPass({ flags: { hasStartedTrip: true } });
    await promise;
    expect(notifier.scheduled[0].data.stage).toBe('C');
    expect(notifier.scheduled[0].title).toBe(LADDER_COPY.en.rung1.stageB.title);
  });

  it('schedules RO copy for the ro locale', async () => {
    const { promise, notifier } = runPass({ locale: 'ro' });
    await promise;
    expect(notifier.scheduled[0].title).toBe(LADDER_COPY.ro.rung1.stageA.title);
  });
});

// ---------------------------------------------------------------------------
// Stop conditions (spec §4 — cancel pending, mark completed, never again)
// ---------------------------------------------------------------------------

describe('runActivationLadderPass — stop conditions', () => {
  it.each([
    ['completed ride', { completedRideCount: 1 }],
    ['registered user', { isAnonymous: false }],
    ['toggle off', { toggleEnabled: false }],
  ] as const)('%s → cancels pending and marks completed', async (_label, flagOverride) => {
    const store = makeFakeStore({
      firstOpenAt: NOW.toISOString(),
      scheduledRung: { rung: 1, fireAt: new Date(NOW.getTime() + 3_600_000).toISOString() },
    });
    const notifier = makeFakeNotifier();

    await expect(runPass({ store, notifier, flags: flagOverride }).promise).resolves.toBe(
      'stopped',
    );

    expect(notifier.cancelCount).toBe(1);
    expect(notifier.scheduled).toHaveLength(0);
    expect(store.get().completed).toBe(true);
    expect(store.get().scheduledRung).toBeNull();
  });

  it('after the 3rd rung fires, the next pass completes the ladder — never a 4th', async () => {
    const store = makeFakeStore({
      firstOpenAt: new Date(2026, 6, 1, 12, 0, 0).toISOString(),
      rungsFired: [1, 2],
      scheduledRung: { rung: 3, fireAt: new Date(2026, 6, 8, 18, 45, 0).toISOString() },
    });
    const notifier = makeFakeNotifier();

    await expect(runPass({ store, notifier }).promise).resolves.toBe('stopped');

    expect(store.get().rungsFired).toEqual([1, 2, 3]);
    expect(store.get().completed).toBe(true);
    expect(notifier.scheduled).toHaveLength(0);
  });

  it('a completed ladder stays stopped on later passes', async () => {
    const store = makeFakeStore({ firstOpenAt: NOW.toISOString(), completed: true });
    const notifier = makeFakeNotifier();
    await expect(runPass({ store, notifier }).promise).resolves.toBe('stopped');
    expect(notifier.scheduled).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------

describe('runActivationLadderPass — permission', () => {
  it('permission not granted → silent (no schedule), NOT completed — resumes if granted later', async () => {
    const store = makeFakeStore();
    const notifier = makeFakeNotifier(false);

    await expect(runPass({ store, notifier }).promise).resolves.toBe('no-permission');

    expect(notifier.scheduled).toHaveLength(0);
    expect(store.get().completed).toBe(false);
    // firstOpenAt still initialized — thresholds anchor to the true first open.
    expect(store.get().firstOpenAt).toBe(NOW.toISOString());

    // Permission granted later → next pass schedules normally.
    const granted = makeFakeNotifier(true);
    await expect(runPass({ store, notifier: granted }).promise).resolves.toBe('scheduled');
    expect(granted.scheduled).toHaveLength(1);
  });
});
