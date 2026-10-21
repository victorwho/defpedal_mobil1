// Commute settings. Invariants:
//
//   1. USER-scoped: where an account lives and works must not survive a
//      sign-out or account switch (same rule as savedPlaces).
//   2. Persisted: a schedule that is lost on restart silently stops briefings.
//   3. No departure-time default: Commute only turns on with a valid time
//      the rider chose, and malformed values are never stored.
import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '../appStore';
import { DEFAULT_COMMUTE_SLICE_STATE, type CommuteRouteEstimate } from '../commuteSlice';

const estimate = (overrides: Partial<CommuteRouteEstimate> = {}): CommuteRouteEstimate => ({
  direction: 'to_work',
  durationSeconds: 1320,
  distanceMeters: 5400,
  fetchedAt: '2026-10-21T06:00:00.000Z',
  placesKey: 'k1',
  ...overrides,
});

beforeEach(() => {
  useAppStore.setState({ ...DEFAULT_COMMUTE_SLICE_STATE });
});

const commute = () => useAppStore.getState().commute;

describe('defaults', () => {
  it('starts off, weekdays, with no departure time', () => {
    expect(commute()).toEqual({
      enabled: false,
      days: [1, 2, 3, 4, 5],
      departTime: null,
      returnTime: null,
      routeEstimates: [],
    });
  });
});

describe('enableCommute', () => {
  it('turns on with the chosen departure time', () => {
    useAppStore.getState().enableCommute('07:30');
    expect(commute().enabled).toBe(true);
    expect(commute().departTime).toBe('07:30');
  });

  it.each(['7:30', '24:00', '07:60', '', 'soon'])('ignores malformed time %j', (time) => {
    useAppStore.getState().enableCommute(time);
    expect(commute().enabled).toBe(false);
    expect(commute().departTime).toBeNull();
  });

  it('disableCommute keeps the settings for the next time', () => {
    useAppStore.getState().enableCommute('08:00');
    useAppStore.getState().disableCommute();
    expect(commute().enabled).toBe(false);
    expect(commute().departTime).toBe('08:00');
  });
});

describe('times and days', () => {
  it('return time can be set and cleared, malformed is ignored', () => {
    useAppStore.getState().setCommuteReturnTime('17:30');
    expect(commute().returnTime).toBe('17:30');
    useAppStore.getState().setCommuteReturnTime('5pm');
    expect(commute().returnTime).toBe('17:30');
    useAppStore.getState().setCommuteReturnTime(null);
    expect(commute().returnTime).toBeNull();
  });

  it('days are deduplicated, sorted and limited to ISO weekdays', () => {
    useAppStore.getState().setCommuteDays([5, 1, 1, 0, 8, 3, 2.5]);
    expect(commute().days).toEqual([1, 3, 5]);
  });
});

describe('setCommuteRouteEstimate', () => {
  it('keeps one estimate per direction, replacing the old one', () => {
    useAppStore.getState().setCommuteRouteEstimate(estimate());
    useAppStore.getState().setCommuteRouteEstimate(estimate({ direction: 'to_home', durationSeconds: 1400 }));
    useAppStore.getState().setCommuteRouteEstimate(estimate({ durationSeconds: 1500 }));
    const byDir = Object.fromEntries(commute().routeEstimates.map((e) => [e.direction, e.durationSeconds]));
    expect(commute().routeEstimates).toHaveLength(2);
    expect(byDir).toEqual({ to_work: 1500, to_home: 1400 });
  });
});

describe('scoping and persistence', () => {
  it('resetUserScopedState clears commute settings', () => {
    useAppStore.getState().enableCommute('08:00');
    useAppStore.getState().setCommuteRouteEstimate(estimate());
    useAppStore.getState().resetUserScopedState();
    expect(commute()).toEqual(DEFAULT_COMMUTE_SLICE_STATE.commute);
  });

  it('is in the persisted partition', () => {
    const persistOptions = (useAppStore as unknown as {
      persist: { getOptions: () => { partialize?: (s: unknown) => Record<string, unknown> } };
    }).persist.getOptions();
    useAppStore.getState().enableCommute('08:00');
    const partialized = persistOptions.partialize?.(useAppStore.getState()) ?? {};
    expect((partialized.commute as { departTime: string }).departTime).toBe('08:00');
  });
});
