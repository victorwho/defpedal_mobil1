// @vitest-environment happy-dom
/**
 * "Ride it later" (docs/plans/onboarding-first-ride.md step 4 / [D6]).
 *
 *   - Route: a failed save still schedules, because the reminder carries the route.
 *   - Loop: the reminder reopens the SAVED loop, so a failed save is a failure.
 *   - Declined permission keeps the save and records no reminder day.
 *   - Success records the day so the weather ping can skip it.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSaveRoute, mockSaveLoop, mockSchedule, mockForecast } = vi.hoisted(() => ({
  mockSaveRoute: vi.fn(),
  mockSaveLoop: vi.fn(),
  mockSchedule: vi.fn(),
  mockForecast: vi.fn(),
}));

vi.mock('../../lib/api', () => ({ mobileApi: { saveRoute: mockSaveRoute, saveLoop: mockSaveLoop } }));
vi.mock('../../lib/daily-weather-notification', () => ({
  fetchForecastForDate: mockForecast,
  scheduleDailyWeatherNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../lib/firstRideReminder', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  scheduleFirstRideReminder: mockSchedule,
}));
vi.mock('../../lib/loopStorage', () => ({ writeSavedLoop: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../lib/push-notifications', () => ({ ensureNotificationPermissionAsync: vi.fn() }));
vi.mock('../../lib/telemetry', () => ({ telemetry: { capture: vi.fn() } }));
vi.mock('../useUnits', () => ({ useUnits: () => 'metric' }));
vi.mock('../useTranslation', () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

import { useAppStore } from '../../store/appStore';
import { useRideLater, type RideLaterSubject } from '../useRideLater';

const routeSubject: RideLaterSubject = {
  kind: 'route',
  origin: { lat: 44.43, lon: 26.1 },
  destination: { lat: 44.45, lon: 26.08 },
  mode: 'safe',
  avoidUnpaved: true,
  avoidHills: false,
  avoidHeat: false,
  isEbike: false,
};

const loopSubject: RideLaterSubject = {
  kind: 'loop',
  start: { lat: 44.43, lon: 26.1 },
  route: { id: 'r' } as never,
  distanceMeters: 5000,
  climbMeters: 20,
  unpavedShare: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ firstRideReminderAt: null, savedLoops: [] });
  mockForecast.mockResolvedValue({ tempMax: 14.4, tempMin: 6, precipitationProbability: 10, windSpeedMax: 8, weatherCode: 1 });
  mockSchedule.mockResolvedValue('scheduled');
});

describe('useRideLater', () => {
  it('saves the route, schedules a reminder with the weather, and records the day', async () => {
    mockSaveRoute.mockResolvedValue({ id: 'saved-1' });
    const { result } = renderHook(() => useRideLater(routeSubject));

    await act(() => result.current.choose('tomorrow_morning'));

    const call = mockSchedule.mock.calls[0][0];
    expect(call.target).toMatchObject({ kind: 'route', savedRouteId: 'saved-1' });
    expect(call.body).toMatch(/temp[^0-9]*14[^0-9]/);
    expect(call.fireAt.getHours()).toBe(8);
    expect(useAppStore.getState().firstRideReminderAt).toBe(call.fireAt.toISOString());
    expect(result.current.status).toEqual({ kind: 'set', slot: 'tomorrow_morning' });
  });

  it('still schedules a route reminder when the save fails', async () => {
    mockSaveRoute.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useRideLater(routeSubject));

    await act(() => result.current.choose('weekend'));

    expect(mockSchedule.mock.calls[0][0].target).toMatchObject({ kind: 'route', savedRouteId: null });
    expect(result.current.status.kind).toBe('set');
  });

  it('fails a loop whose save fails, scheduling nothing', async () => {
    mockSaveLoop.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useRideLater(loopSubject));

    await act(() => result.current.choose('tomorrow_evening'));

    expect(mockSchedule).not.toHaveBeenCalled();
    expect(result.current.status).toEqual({ kind: 'failed' });
  });

  it('keeps a saved loop and points the reminder at it', async () => {
    mockSaveLoop.mockResolvedValue({ id: 'loop-1', name: 'n', distanceMeters: 5000, climbMeters: 20, unpavedShare: 0, createdAt: 'x' });
    const { result } = renderHook(() => useRideLater(loopSubject));

    await act(() => result.current.choose('tomorrow_evening'));

    expect(mockSchedule.mock.calls[0][0].target).toEqual({ kind: 'loop', savedLoopId: 'loop-1' });
    expect(useAppStore.getState().savedLoops.map((l) => l.id)).toEqual(['loop-1']);
  });

  it('says so when notifications are declined, and records no reminder day', async () => {
    mockSaveRoute.mockResolvedValue({ id: 'saved-1' });
    mockSchedule.mockResolvedValue('no_permission');
    const { result } = renderHook(() => useRideLater(routeSubject));

    await act(() => result.current.choose('tomorrow_morning'));

    expect(result.current.status).toEqual({ kind: 'no_permission' });
    expect(useAppStore.getState().firstRideReminderAt).toBeNull();
  });

  it('writes the reminder without weather when the forecast is unavailable', async () => {
    mockSaveRoute.mockResolvedValue({ id: 'saved-1' });
    mockForecast.mockResolvedValue(null);
    const { result } = renderHook(() => useRideLater(routeSubject));

    await act(() => result.current.choose('tomorrow_morning'));

    expect(mockSchedule.mock.calls[0][0].body).toBe('onboardingRide.reminderBodyNoWeather');
  });
});

describe('useRideLater — double tap', () => {
  it('saves and schedules once even when a slot is tapped twice quickly', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockSaveRoute.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const { result } = renderHook(() => useRideLater(routeSubject));

    await act(async () => {
      const first = result.current.choose('tomorrow_morning');
      const second = result.current.choose('tomorrow_morning');
      release({ id: 'saved-1' });
      await Promise.all([first, second]);
    });

    expect(mockSaveRoute).toHaveBeenCalledTimes(1);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });
});
