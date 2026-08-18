import { describe, expect, it } from 'vitest';

import {
  buildTimeOptions,
  QUIET_HOURS_OPTIONS,
  quietHoursAreOff,
  quietHoursWrapMidnight,
} from './quietHours';

describe('buildTimeOptions', () => {
  it('covers a full day at 30-minute steps', () => {
    expect(QUIET_HOURS_OPTIONS).toHaveLength(48);
    expect(QUIET_HOURS_OPTIONS[0]).toBe('00:00');
    expect(QUIET_HOURS_OPTIONS[QUIET_HOURS_OPTIONS.length - 1]).toBe('23:30');
  });

  it('zero-pads every value so the server string comparison stays valid', () => {
    // isInQuietHours compares 'HH:MM' lexicographically — '9:00' would sort
    // after '10:00' and silently invert the window.
    for (const value of QUIET_HOURS_OPTIONS) {
      expect(value).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it('includes the shipped defaults so existing users see their value selected', () => {
    expect(QUIET_HOURS_OPTIONS).toContain('22:00');
    expect(QUIET_HOURS_OPTIONS).toContain('07:00');
  });

  it('is strictly ascending', () => {
    const sorted = [...QUIET_HOURS_OPTIONS].sort();
    expect([...QUIET_HOURS_OPTIONS]).toEqual(sorted);
  });

  it('honours a custom step', () => {
    expect(buildTimeOptions(60)).toHaveLength(24);
    expect(buildTimeOptions(60)[7]).toBe('07:00');
  });
});

describe('quietHoursAreOff', () => {
  it('is true only when start and end match (server treats it as an empty window)', () => {
    expect(quietHoursAreOff('22:00', '22:00')).toBe(true);
    expect(quietHoursAreOff('22:00', '07:00')).toBe(false);
    expect(quietHoursAreOff('07:00', '22:00')).toBe(false);
  });
});

describe('quietHoursWrapMidnight', () => {
  it('detects the overnight window the defaults use', () => {
    expect(quietHoursWrapMidnight('22:00', '07:00')).toBe(true);
    expect(quietHoursWrapMidnight('07:00', '22:00')).toBe(false);
  });
});
