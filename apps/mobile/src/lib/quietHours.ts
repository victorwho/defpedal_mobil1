/**
 * Quiet-hours helpers (audit UX-6).
 *
 * The Profile screen displayed quiet hours as static text for the app's whole
 * history — `setQuietHours` existed in the store with no UI caller — so every
 * rider was pinned to the 22:00–07:00 default. These helpers back the picker
 * that finally makes it editable.
 *
 * Values are stored as 'HH:MM' strings because that is what
 * `profiles.quiet_hours_start/end` hold and what the server compares
 * lexicographically in `isInQuietHours` (services/mobile-api/src/lib/notifications.ts).
 * Keep the format zero-padded 24-hour or that comparison breaks.
 */

/** Minutes between selectable times. 30 keeps the list to 48 rows. */
export const QUIET_HOURS_STEP_MINUTES = 30;

/** All selectable 'HH:MM' values, ascending from '00:00'. */
export const buildTimeOptions = (stepMinutes = QUIET_HOURS_STEP_MINUTES): readonly string[] => {
  const options: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += stepMinutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return options;
};

export const QUIET_HOURS_OPTIONS = buildTimeOptions();

/**
 * True when the configured window suppresses nothing.
 *
 * The server's `isInQuietHours` treats start === end as an empty window (the
 * same-day branch `now >= start && now < end` can never be true), so picking
 * matching values silently turns quiet hours OFF. That is a legitimate choice,
 * but it must be surfaced rather than looking like a 24-hour blackout.
 */
export const quietHoursAreOff = (start: string, end: string): boolean => start === end;

/**
 * True when the window wraps past midnight (e.g. 22:00 → 07:00), which is the
 * default and by far the common case. Mirrors the server's `start > end` branch.
 */
export const quietHoursWrapMidnight = (start: string, end: string): boolean => start > end;
