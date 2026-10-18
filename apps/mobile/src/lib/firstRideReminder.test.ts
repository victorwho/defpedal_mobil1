import { describe, expect, it } from 'vitest';

import {
  consumeReminderTapped,
  isSameLocalDay,
  markReminderTapped,
  parseReminderTarget,
  reminderFireAt,
} from './firstRideReminder';

// Local-time constructors, so the assertions hold in any test timezone.
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min);

describe('reminderFireAt', () => {
  const wednesday = at(2026, 10, 21, 21, 30);

  it('tomorrow morning is 08:00 the next day', () => {
    expect(reminderFireAt('tomorrow_morning', wednesday)).toEqual(at(2026, 10, 22, 8));
  });

  it('tomorrow evening is 18:00 the next day', () => {
    expect(reminderFireAt('tomorrow_evening', wednesday)).toEqual(at(2026, 10, 22, 18));
  });

  it('this weekend is the coming Saturday 10:00 on a weekday', () => {
    expect(reminderFireAt('weekend', wednesday)).toEqual(at(2026, 10, 24, 10));
  });

  it('on Saturday morning it is still today, if two hours away', () => {
    expect(reminderFireAt('weekend', at(2026, 10, 24, 7, 30))).toEqual(at(2026, 10, 24, 10));
  });

  it('on Saturday afternoon it moves to Sunday', () => {
    expect(reminderFireAt('weekend', at(2026, 10, 24, 15))).toEqual(at(2026, 10, 25, 10));
  });

  it('on Sunday afternoon it moves to next Saturday', () => {
    expect(reminderFireAt('weekend', at(2026, 10, 25, 15))).toEqual(at(2026, 10, 31, 10));
  });

  it('crosses a month boundary', () => {
    expect(reminderFireAt('tomorrow_morning', at(2026, 10, 31, 12))).toEqual(at(2026, 11, 1, 8));
  });
});

describe('isSameLocalDay', () => {
  it('compares calendar days, not 24-hour windows', () => {
    expect(isSameLocalDay(at(2026, 10, 22, 0, 5), at(2026, 10, 22, 23, 55))).toBe(true);
    expect(isSameLocalDay(at(2026, 10, 22, 23, 55), at(2026, 10, 23, 0, 5))).toBe(false);
  });
});

describe('parseReminderTarget', () => {
  const route = {
    type: 'first_ride_reminder',
    kind: 'route',
    savedRouteId: 'r1',
    origin: { lat: 44.43, lon: 26.1 },
    destination: { lat: 44.45, lon: 26.08 },
    mode: 'safe',
    avoidUnpaved: true,
    isEbike: false,
  };

  it('reads a route payload', () => {
    expect(parseReminderTarget(route)).toEqual({
      kind: 'route',
      savedRouteId: 'r1',
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.45, lon: 26.08 },
      mode: 'safe',
      avoidUnpaved: true,
      isEbike: false,
    });
  });

  it('reads a loop payload', () => {
    expect(parseReminderTarget({ type: 'first_ride_reminder', kind: 'loop', savedLoopId: 'l1' })).toEqual({
      kind: 'loop',
      savedLoopId: 'l1',
    });
  });

  it('rejects other notification types and malformed payloads', () => {
    expect(parseReminderTarget({ ...route, type: 'daily-weather' })).toBeNull();
    expect(parseReminderTarget({ ...route, origin: { lat: 'x', lon: 1 } })).toBeNull();
    expect(parseReminderTarget({ ...route, destination: { lat: 200, lon: 1 } })).toBeNull();
    expect(parseReminderTarget({ type: 'first_ride_reminder', kind: 'loop' })).toBeNull();
    expect(parseReminderTarget(null)).toBeNull();
  });

  it('falls back to Safe for an unknown mode', () => {
    expect(parseReminderTarget({ ...route, mode: 'teleport' })?.kind === 'route' &&
      (parseReminderTarget({ ...route, mode: 'teleport' }) as { mode: string }).mode).toBe('safe');
  });
});

describe('reminder tap → ride attribution', () => {
  it('is consumed exactly once', () => {
    markReminderTapped();
    expect(consumeReminderTapped()).toBe(true);
    expect(consumeReminderTapped()).toBe(false);
  });

  it('expires, so a much later ride is not credited to the reminder', () => {
    markReminderTapped(0);
    expect(consumeReminderTapped(31 * 60 * 1000)).toBe(false);
    markReminderTapped(0);
    expect(consumeReminderTapped(29 * 60 * 1000)).toBe(true);
  });
});
