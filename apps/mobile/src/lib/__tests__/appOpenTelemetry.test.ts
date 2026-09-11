import { describe, expect, it } from 'vitest';

import { APP_OPEN_MIN_INTERVAL_MS, shouldRecordAppOpen } from '../appOpenTelemetry';

describe('shouldRecordAppOpen', () => {
  const T = 1_757_000_000_000;

  /** A cold start is the open we most want recorded. */
  it('records when nothing has been recorded yet', () => {
    expect(shouldRecordAppOpen(null, T)).toBe(true);
  });

  /**
   * The reason the throttle exists: the OS hands out `active` far more often
   * than a human opens the app — returning from the notification shade, a
   * permission dialog, the share sheet. One row each would turn a count of
   * people into a count of UI events.
   */
  it('suppresses a second open inside the interval', () => {
    expect(shouldRecordAppOpen(T, T + 1)).toBe(false);
    expect(shouldRecordAppOpen(T, T + APP_OPEN_MIN_INTERVAL_MS - 1)).toBe(false);
  });

  it('records again once the interval has passed', () => {
    expect(shouldRecordAppOpen(T, T + APP_OPEN_MIN_INTERVAL_MS)).toBe(true);
    expect(shouldRecordAppOpen(T, T + APP_OPEN_MIN_INTERVAL_MS + 1)).toBe(true);
  });

  /**
   * An NTP correction or a manual clock change can move `now` backwards. That
   * must not lock recording out until the clock catches up — which, for a clock
   * set days forward and then corrected, would be days.
   */
  it('records when the clock has jumped backwards', () => {
    expect(shouldRecordAppOpen(T, T - 60_000)).toBe(true);
  });

  it('honours an explicit interval', () => {
    expect(shouldRecordAppOpen(T, T + 500, 1_000)).toBe(false);
    expect(shouldRecordAppOpen(T, T + 1_000, 1_000)).toBe(true);
  });

  it('keeps the interval long enough to collapse app-switch flapping', () => {
    expect(APP_OPEN_MIN_INTERVAL_MS).toBeGreaterThanOrEqual(60_000);
    expect(APP_OPEN_MIN_INTERVAL_MS).toBeLessThanOrEqual(30 * 60 * 1000);
  });
});
