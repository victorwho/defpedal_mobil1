// @vitest-environment node
/**
 * Quiet hours enforcement — unit tests
 *
 * Tests the isInQuietHours logic that gates all push notification delivery.
 * Uses fake timers to control Date.now / new Date() so timezone arithmetic
 * is deterministic.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isInQuietHours, type UserPrefs } from '../lib/notifications';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makePrefs = (overrides?: Partial<UserPrefs>): UserPrefs => ({
  notify_weather: true,
  notify_hazard: true,
  notify_community: true,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  quiet_hours_timezone: 'UTC',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('isInQuietHours', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true during overnight quiet hours (03:30 UTC, range 22:00-07:00)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T03:30:00Z'));

    expect(isInQuietHours(makePrefs())).toBe(true);
  });

  it('returns false outside quiet hours (12:00 UTC, range 22:00-07:00)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T12:00:00Z'));

    expect(isInQuietHours(makePrefs())).toBe(false);
  });

  it('returns false when quiet hours start and end are null', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T03:30:00Z'));

    expect(
      isInQuietHours(makePrefs({ quiet_hours_start: null, quiet_hours_end: null })),
    ).toBe(false);
  });
});
