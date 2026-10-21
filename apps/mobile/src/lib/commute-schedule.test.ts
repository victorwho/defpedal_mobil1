import { describe, expect, it } from 'vitest';

import { DEFAULT_COMMUTE_SLICE_STATE, type CommuteSettings } from '../store/commuteSlice';
import { buildCommuteFires, isoWeekday } from './commute-schedule';

const settings = (overrides: Partial<CommuteSettings> = {}): CommuteSettings => ({
  ...DEFAULT_COMMUTE_SLICE_STATE.commute,
  enabled: true,
  departTime: '08:00',
  ...overrides,
});

// Local-time constructor: the schedule is local-time by design.
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);
const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('isoWeekday', () => {
  it('maps Monday to 1 and Sunday to 7', () => {
    expect(isoWeekday(at(2026, 10, 19))).toBe(1); // Monday
    expect(isoWeekday(at(2026, 10, 25))).toBe(7); // Sunday
  });
});

describe('buildCommuteFires', () => {
  it('is empty when off or when no departure time was chosen', () => {
    const now = at(2026, 10, 19, 6);
    expect(buildCommuteFires(now, settings({ enabled: false }))).toEqual([]);
    expect(buildCommuteFires(now, settings({ departTime: null }))).toEqual([]);
  });

  it('fires 15 min before departure on weekdays only, over 7 days', () => {
    // Monday 06:00 → Mon..Fri this week; the following Monday is day 8, outside.
    const fires = buildCommuteFires(at(2026, 10, 19, 6), settings());
    expect(fires.map((f) => f.at.getDate())).toEqual([19, 20, 21, 22, 23]);
    expect(fires.every((f) => hm(f.at) === '07:45' && hm(f.departAt) === '08:00')).toBe(true);
    expect(fires.every((f) => f.direction === 'to_work')).toBe(true);
  });

  it('skips a briefing whose time has passed', () => {
    const fires = buildCommuteFires(at(2026, 10, 19, 7, 50), settings());
    expect(fires[0].at.getDate()).toBe(20);
  });

  it('adds the evening briefing only when a return time is set, in time order', () => {
    const fires = buildCommuteFires(at(2026, 10, 19, 6), settings({ days: [1], returnTime: '17:30' }));
    expect(fires.map((f) => [f.direction, hm(f.at)])).toEqual([
      ['to_work', '07:45'],
      ['to_home', '17:15'],
    ]);
  });

  it('keeps the local time across a DST change', () => {
    // EU clocks go back on Sunday 2026-10-25. Every fire stays at 07:45 local.
    const fires = buildCommuteFires(at(2026, 10, 23, 9), settings({ days: [1, 2, 3, 4, 5, 6, 7] }));
    expect(fires).toHaveLength(6);
    expect(fires.map((f) => hm(f.at))).toEqual(Array(6).fill('07:45'));
  });
});
