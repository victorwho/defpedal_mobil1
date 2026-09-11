/**
 * Throttle rule for first-party app-open telemetry.
 *
 * Pure, and separate from the observer, because the interesting part is a
 * decision rather than a network call: Android and iOS both hand out
 * `active` transitions far more often than a human "opens the app" — switching
 * back from the notification shade, dismissing a permission dialog, returning
 * from the share sheet. Writing a row for each would turn a count of people
 * into a count of UI events.
 *
 * In-memory only, deliberately NOT persisted. A cold start SHOULD record an
 * open — that is the event we care most about — so the throttle must reset when
 * the process does.
 */

/**
 * Minimum gap between two recorded opens.
 *
 * Five minutes: long enough to collapse app-switching flapping, short enough
 * that genuinely separate sessions through the day are still counted
 * separately. DAU only needs one row per user per day, so erring long is safe;
 * erring short costs rows and rate-limit budget for no extra information.
 */
export const APP_OPEN_MIN_INTERVAL_MS = 5 * 60 * 1000;

export const shouldRecordAppOpen = (
  lastRecordedAtMs: number | null,
  nowMs: number,
  minIntervalMs: number = APP_OPEN_MIN_INTERVAL_MS,
): boolean => {
  if (lastRecordedAtMs === null) return true;
  // A clock that jumped backwards (NTP correction, manual change) must not lock
  // recording out until it catches up.
  if (nowMs < lastRecordedAtMs) return true;
  return nowMs - lastRecordedAtMs >= minIntervalMs;
};
