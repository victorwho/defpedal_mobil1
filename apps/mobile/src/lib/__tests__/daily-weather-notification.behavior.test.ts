/**
 * Behavioral tests for the weather-notification scheduler glue (review
 * 2026-07-19, LOW: the pure cadence math was tested but the glue —
 * multi-row forecast parsing, generation-tagged scheduling, prefix
 * cancellation, chain persistence, failure paths — had no direct coverage).
 *
 * Mocks expo-notifications with a recording fake and uses the REAL Zustand
 * store, exercising scheduleDailyWeatherNotifications end-to-end.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  ops: [] as string[],
  scheduled: [] as Array<{ identifier: string; content: { data: Record<string, unknown> } }>,
  cancelled: [] as string[],
  existing: [] as Array<{ identifier: string }>,
  permissionStatus: 'granted',
  listThrows: false,
  scheduleFailures: 0,
}));

import {
  __setDailyWeatherTestOverrides,
  cancelDailyWeatherNotifications,
  scheduleDailyWeatherNotifications,
} from '../daily-weather-notification';
import { useAppStore } from '../../store/appStore';

// Injected through the module's test seam — the SUT's lazy require() calls
// bypass vitest's module-mock registry, so vi.mock() cannot reach them.
const fakeNotifications = {
  AndroidImportance: { DEFAULT: 3 },
  getPermissionsAsync: async () => ({ status: h.permissionStatus }),
  setNotificationChannelAsync: async () => {},
  getAllScheduledNotificationsAsync: async () => {
    if (h.listThrows) throw new Error('enumeration unavailable');
    return h.existing;
  },
  cancelScheduledNotificationAsync: async (id: string) => {
    h.ops.push(`cancel:${id}`);
    h.cancelled.push(id);
  },
  scheduleNotificationAsync: async (input: { identifier: string; content: { data: Record<string, unknown> } }) => {
    if (h.scheduleFailures > 0) {
      h.scheduleFailures -= 1;
      throw new Error('transient scheduling failure');
    }
    h.ops.push(`schedule:${input.identifier}`);
    h.scheduled.push(input);
    return input.identifier;
  },
} as unknown as typeof import('expo-notifications');

__setDailyWeatherTestOverrides({
  notifications: fakeNotifications,
  store: useAppStore,
});

const FORECAST_DAYS = 8;
const goodWeatherPayload = {
  daily: {
    time: Array.from({ length: FORECAST_DAYS }, (_, i) => `2026-07-${19 + i}`),
    temperature_2m_min: Array(FORECAST_DAYS).fill(15),
    temperature_2m_max: Array(FORECAST_DAYS).fill(24),
    precipitation_probability_max: Array(FORECAST_DAYS).fill(10),
    wind_speed_10m_max: Array(FORECAST_DAYS).fill(12),
    weather_code: Array(FORECAST_DAYS).fill(1),
  },
};

const stubFetch = (ok: boolean) => {
  const spy = vi.fn(async () => ({ ok, json: async () => goodWeatherPayload }));
  vi.stubGlobal('fetch', spy);
  return spy;
};

const NEW_GEN_ID = /^daily-weather-cycling-g[0-9a-z]+-\d+$/;

describe('scheduleDailyWeatherNotifications (behavioral)', () => {
  beforeEach(() => {
    h.ops.length = 0;
    h.scheduled.length = 0;
    h.cancelled.length = 0;
    h.existing = [];
    h.permissionStatus = 'granted';
    h.listThrows = false;
    h.scheduleFailures = 0;
    useAppStore.setState({ dailyWeatherChain: [], dailyWeatherGeneration: null });
    stubFetch(true);
  });

  it('schedules a generation-tagged set, persists chain + generation, tags the tap payload', async () => {
    await scheduleDailyWeatherNotifications(45.0, 25.0);

    expect(h.scheduled.length).toBeGreaterThanOrEqual(4); // ≥ the 4 escalation fires
    expect(h.scheduled.length).toBeLessThanOrEqual(12);
    for (const s of h.scheduled) {
      expect(s.identifier).toMatch(NEW_GEN_ID);
      expect(s.content.data.type).toBe('daily-weather');
    }

    const state = useAppStore.getState();
    expect(state.dailyWeatherChain.length).toBeGreaterThan(0);
    expect(state.dailyWeatherGeneration).toMatch(/^g[0-9a-z]+$/);
    expect(h.scheduled[0]!.identifier).toContain(`-${state.dailyWeatherGeneration}-`);
  });

  it('schedules the NEW generation before cancelling stale ids, and never cancels its own set', async () => {
    h.existing = [
      { identifier: 'daily-weather-cycling' }, // legacy pre-upgrade id
      { identifier: 'daily-weather-cycling-goldgen-0' }, // stale generation
      { identifier: 'activation-ladder-1' }, // unrelated — must survive
    ];

    await scheduleDailyWeatherNotifications(45.0, 25.0);

    expect(h.cancelled).toContain('daily-weather-cycling');
    expect(h.cancelled).toContain('daily-weather-cycling-goldgen-0');
    expect(h.cancelled).not.toContain('activation-ladder-1');
    for (const s of h.scheduled) {
      expect(h.cancelled).not.toContain(s.identifier);
    }

    // Crash-safety ordering (review M2): every schedule op precedes every
    // cancel op — a crash mid-pass leaves duplicates, never an empty queue.
    const firstCancel = h.ops.findIndex((op) => op.startsWith('cancel:'));
    const lastSchedule = h.ops.map((op) => op.startsWith('schedule:')).lastIndexOf(true);
    expect(firstCancel).toBeGreaterThan(lastSchedule);
  });

  it('a failed forecast fetch leaves the previously scheduled set untouched', async () => {
    stubFetch(false);
    useAppStore.setState({ dailyWeatherChain: ['2026-07-21T08:30:00.000Z'] });

    await scheduleDailyWeatherNotifications(45.0, 25.0);

    expect(h.scheduled).toHaveLength(0);
    expect(h.cancelled).toHaveLength(0);
    expect(useAppStore.getState().dailyWeatherChain).toEqual(['2026-07-21T08:30:00.000Z']);
  });

  it('does not even fetch when notification permission is missing', async () => {
    h.permissionStatus = 'denied';
    const fetchSpy = stubFetch(true);

    await scheduleDailyWeatherNotifications(45.0, 25.0);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(h.scheduled).toHaveLength(0);
  });

  it('falls back to constructed ids when the OS refuses to enumerate', async () => {
    h.listThrows = true;
    useAppStore.setState({ dailyWeatherGeneration: 'gprev' });

    await scheduleDailyWeatherNotifications(45.0, 25.0);

    expect(h.scheduled.length).toBeGreaterThanOrEqual(4); // new set still went out
    expect(h.cancelled).toContain('daily-weather-cycling'); // legacy id
    expect(h.cancelled).toContain('daily-weather-cycling-gprev-0'); // stale gen by index
    expect(h.cancelled).toContain('daily-weather-cycling-gprev-11');
  });

  it('retries a transiently failing schedule call once', async () => {
    h.scheduleFailures = 1; // first scheduleNotificationAsync call throws

    await scheduleDailyWeatherNotifications(45.0, 25.0);

    // The failed fire was retried, so the full set is still scheduled.
    const indices = h.scheduled.map((s) => Number(s.identifier.split('-').pop()));
    expect(indices).toContain(0);
    expect(h.scheduled.length).toBeGreaterThanOrEqual(4);
  });
});

describe('cancelDailyWeatherNotifications (behavioral)', () => {
  beforeEach(() => {
    h.ops.length = 0;
    h.scheduled.length = 0;
    h.cancelled.length = 0;
    h.existing = [];
    h.permissionStatus = 'granted';
    h.listThrows = false;
    h.scheduleFailures = 0;
    useAppStore.setState({ dailyWeatherChain: [], dailyWeatherGeneration: null });
  });

  it('cancels every weather id (toggle-off) and clears chain + generation', async () => {
    h.existing = [
      { identifier: 'daily-weather-cycling-gnow-0' },
      { identifier: 'daily-weather-cycling-gnow-1' },
      { identifier: 'activation-ladder-1' },
    ];
    useAppStore.setState({
      dailyWeatherChain: ['2026-07-21T08:30:00.000Z'],
      dailyWeatherGeneration: 'gnow',
    });

    await cancelDailyWeatherNotifications();

    expect(h.cancelled).toContain('daily-weather-cycling-gnow-0');
    expect(h.cancelled).toContain('daily-weather-cycling-gnow-1');
    expect(h.cancelled).not.toContain('activation-ladder-1');
    expect(useAppStore.getState().dailyWeatherChain).toEqual([]);
    expect(useAppStore.getState().dailyWeatherGeneration).toBeNull();
  });

  it('cancels the stored generation by constructed ids when enumeration fails', async () => {
    h.listThrows = true;
    useAppStore.setState({ dailyWeatherGeneration: 'gnow' });

    await cancelDailyWeatherNotifications();

    expect(h.cancelled).toContain('daily-weather-cycling'); // legacy
    expect(h.cancelled).toContain('daily-weather-cycling-gnow-0');
    expect(h.cancelled).toContain('daily-weather-cycling-gnow-11');
  });
});
