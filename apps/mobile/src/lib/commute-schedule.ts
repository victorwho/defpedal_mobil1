/**
 * When commute briefings fire. Pure: no native modules, no I/O.
 * Plan: docs/plans/commute-mode.md, step 3.
 *
 * A briefing fires COMMUTE_LEAD_MINUTES before each departure on the rider's
 * chosen weekdays, for the next `horizonDays` calendar days. Briefings are
 * rescheduled on every app open, so a rider who stops opening the app stops
 * getting them after the horizon (accepted for phase 1).
 */
import {
  COMMUTE_LEAD_MINUTES,
  type CommuteDirection,
  type CommuteSettings,
} from '../store/commuteSlice';

export const COMMUTE_HORIZON_DAYS = 7;

/** Fires closer than this to `now` are skipped: the OS needs a positive delay. */
const MIN_DELAY_MS = 60 * 1000;

export interface CommuteFire {
  /** When the notification fires. */
  readonly at: Date;
  /** When the rider leaves; the forecast is read for this hour. */
  readonly departAt: Date;
  readonly direction: CommuteDirection;
}

/** ISO weekday of a local date: 1 = Monday to 7 = Sunday. */
export const isoWeekday = (d: Date): number => ((d.getDay() + 6) % 7) + 1;

/**
 * Local `HH:MM` on the day `dayOffset` days after `base`. Day arithmetic goes
 * through `setDate`, so a DST change in between cannot shift the hour.
 */
const atLocalTime = (base: Date, dayOffset: number, hhmm: string): Date => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
};

export const buildCommuteFires = (
  now: Date,
  settings: CommuteSettings,
  horizonDays: number = COMMUTE_HORIZON_DAYS,
): CommuteFire[] => {
  if (!settings.enabled || settings.departTime === null) return [];

  const legs: { direction: CommuteDirection; time: string }[] = [
    { direction: 'to_work', time: settings.departTime },
    ...(settings.returnTime ? [{ direction: 'to_home' as const, time: settings.returnTime }] : []),
  ];

  const fires: CommuteFire[] = [];
  for (let offset = 0; offset < horizonDays; offset += 1) {
    for (const leg of legs) {
      const departAt = atLocalTime(now, offset, leg.time);
      if (!settings.days.includes(isoWeekday(departAt))) continue;
      const at = new Date(departAt.getTime() - COMMUTE_LEAD_MINUTES * 60 * 1000);
      if (at.getTime() - now.getTime() < MIN_DELAY_MS) continue;
      fires.push({ at, departAt, direction: leg.direction });
    }
  }
  return fires.sort((a, b) => a.at.getTime() - b.at.getTime());
};

/**
 * Departure times of the briefings a rider will get, or none when Home or
 * Work is missing. The cycling-weather ping skips these calendar days: two
 * weather messages on one morning is one too many. One day past the horizon,
 * because the weather ping can snap a late fire into the next day.
 */
export const commuteDepartures = (
  now: Date,
  settings: CommuteSettings,
  placesSet: boolean,
): Date[] =>
  placesSet ? buildCommuteFires(now, settings, COMMUTE_HORIZON_DAYS + 1).map((f) => f.departAt) : [];
