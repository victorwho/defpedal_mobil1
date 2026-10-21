import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoutePreviewResponse } from '@defensivepedal/core';

import { useAppStore } from '../store/appStore';
import { DEFAULT_COMMUTE_SLICE_STATE } from '../store/commuteSlice';
import type { CommuteHourForecast } from './commute-messages';
import {
  __setCommuteTestOverrides,
  scheduleCommuteBriefings,
} from './commute-notification';

const HOME = { id: 'h', label: 'Home st', primaryText: 'Home st', coordinates: { lat: 44.43, lon: 26.1 } };
const WORK = { id: 'w', label: 'Work st', primaryText: 'Work st', coordinates: { lat: 44.45, lon: 26.08 } };
// Monday 06:00 local: weekdays at 08:00 give five briefings this week.
const NOW = new Date(2026, 9, 19, 6, 0);

const hour: CommuteHourForecast = { temperature: 12, precipitationProbability: 10, windSpeed: 10, weatherCode: 1 };
const anyHour = { get: () => hour } as unknown as Map<string, CommuteHourForecast>;

type Scheduled = { identifier: string; content: { body: string; data: Record<string, unknown> } };

const fakeNotifications = (permission = 'granted') => {
  let scheduled: Scheduled[] = [{ identifier: 'daily-weather-cycling-gX-0', content: { body: '', data: {} } }];
  const N = {
    AndroidImportance: { DEFAULT: 3 },
    getPermissionsAsync: vi.fn(async () => ({ status: permission })),
    setNotificationChannelAsync: vi.fn(async () => null),
    scheduleNotificationAsync: vi.fn(async (input: Scheduled) => {
      scheduled = [...scheduled, input];
      return input.identifier;
    }),
    getAllScheduledNotificationsAsync: vi.fn(async () => scheduled),
    cancelScheduledNotificationAsync: vi.fn(async (id: string) => {
      scheduled = scheduled.filter((s) => s.identifier !== id);
    }),
  };
  return { N, list: () => scheduled };
};

const safeRoute = (mode: 'safe' | 'fast' = 'safe') =>
  ({
    selectedMode: mode,
    routes: [{ adjustedDurationSeconds: 1320, distanceMeters: 5400 }],
  }) as unknown as RoutePreviewResponse;

const setup = (opts: { permission?: string; forecast?: typeof anyHour | null; mode?: 'safe' | 'fast' } = {}) => {
  const { N, list } = fakeNotifications(opts.permission);
  const previewRoute = vi.fn(async () => safeRoute(opts.mode));
  __setCommuteTestOverrides({
    notifications: N as never,
    store: useAppStore,
    fetchForecast: async () => (opts.forecast === undefined ? anyHour : opts.forecast),
    previewRoute,
  });
  return { N, list, previewRoute };
};

const commuteIds = (list: Scheduled[]) => list.filter((s) => s.identifier.startsWith('commute-briefing'));

beforeEach(() => {
  useAppStore.setState({
    ...DEFAULT_COMMUTE_SLICE_STATE,
    savedPlaces: { home: HOME, work: WORK },
    locale: 'en',
    measurementSystem: 'metric',
  });
  useAppStore.getState().enableCommute('08:00');
});

afterEach(() => __setCommuteTestOverrides({}));

describe('scheduleCommuteBriefings', () => {
  it('schedules one briefing per weekday with a tap payload carrying coordinates', async () => {
    const { list } = setup();
    expect(await scheduleCommuteBriefings(NOW)).toBe('scheduled');
    const briefings = commuteIds(list());
    expect(briefings).toHaveLength(5);
    expect(briefings[0].content.data).toMatchObject({
      type: 'commute',
      direction: 'to_work',
      origin: HOME.coordinates,
      destination: WORK.coordinates,
    });
    expect(briefings[0].content.body).toContain('Safe route: 22 min, 5.4 km.');
  });

  it('replaces the previous generation and leaves other notifications alone', async () => {
    const { list } = setup();
    await scheduleCommuteBriefings(NOW);
    await scheduleCommuteBriefings(new Date(NOW.getTime() + 60_000));
    const ids = commuteIds(list()).map((s) => s.identifier);
    expect(ids).toHaveLength(5);
    expect(new Set(ids.map((id) => id.split('-')[2])).size).toBe(1);
    expect(list().some((s) => s.identifier.startsWith('daily-weather'))).toBe(true);
  });

  it('turning Commute off or removing Work cancels every briefing', async () => {
    const { list } = setup();
    await scheduleCommuteBriefings(NOW);
    useAppStore.getState().setSavedPlace('work', null);
    expect(await scheduleCommuteBriefings(NOW)).toBe('off');
    expect(commuteIds(list())).toHaveLength(0);

    useAppStore.getState().setSavedPlace('work', WORK as never);
    await scheduleCommuteBriefings(NOW);
    useAppStore.getState().disableCommute();
    expect(await scheduleCommuteBriefings(NOW)).toBe('off');
    expect(commuteIds(list())).toHaveLength(0);
  });

  it('a failed forecast keeps the previous set', async () => {
    const first = setup();
    await scheduleCommuteBriefings(NOW);
    const before = commuteIds(first.list()).map((s) => s.identifier);
    __setCommuteTestOverrides({
      notifications: first.N as never,
      store: useAppStore,
      fetchForecast: async () => null,
      previewRoute: first.previewRoute,
    });
    expect(await scheduleCommuteBriefings(new Date(NOW.getTime() + 60_000))).toBe('forecast_failed');
    expect(commuteIds(first.list()).map((s) => s.identifier)).toEqual(before);
  });

  it('does nothing without permission and never asks for it', async () => {
    const { N, list } = setup({ permission: 'denied' });
    expect(await scheduleCommuteBriefings(NOW)).toBe('no_permission');
    expect(commuteIds(list())).toHaveLength(0);
    expect(Object.keys(N)).not.toContain('requestPermissionsAsync');
  });

  it('fetches the route once and reuses it within a day', async () => {
    const { previewRoute } = setup();
    await scheduleCommuteBriefings(NOW);
    await scheduleCommuteBriefings(new Date(NOW.getTime() + 60 * 60 * 1000));
    expect(previewRoute).toHaveBeenCalledTimes(1);
  });

  it('leaves the ETA out when only a non-safe route is available', async () => {
    const { list } = setup({ mode: 'fast' });
    await scheduleCommuteBriefings(NOW);
    expect(commuteIds(list())[0].content.body).not.toContain('Safe route');
  });
});
