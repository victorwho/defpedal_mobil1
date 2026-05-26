/**
 * Pure helper to compute a rider's typical ride-start hour from their
 * recent trips. Used by the nudge cron's recompute-pattern endpoint to
 * populate `user_ride_pattern.typical_start_hour` so the
 * `daily_ride_reminder` can fire ~1h before the rider's usual time.
 *
 * Inputs:
 *   - `startedAtTimestamps` — UTC ISO strings of recent trip starts
 *   - `timezone` — rider's IANA timezone (e.g. "Europe/Bucharest")
 *
 * Output:
 *   - `typicalStartHour` — modal hour (0–23) in the rider's local TZ
 *   - `confidence` — 0.0–1.0 based on (count of modal hour) / (total),
 *     capped at 1.0 when we have >= 10 trips in the window
 *   - `sampleCount` — total trips considered (post-filter)
 *
 * Returns null when the input is empty or too sparse to derive a meaningful
 * pattern (sample_count < 3 = no pattern).
 */

export interface RidePattern {
  readonly typicalStartHour: number;
  readonly confidence: number;
  readonly sampleCount: number;
}

const MIN_SAMPLES = 3;
const SATURATION_SAMPLES = 10;

/**
 * Extract the hour-of-day (0–23) at which a UTC timestamp falls in the
 * given IANA timezone. Pure given Intl is deterministic (it is).
 */
const hourInTimezone = (isoTimestamp: string, timezone: string): number | null => {
  const ts = new Date(isoTimestamp);
  if (Number.isNaN(ts.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    timeZone: timezone,
  });
  // Intl produces "HH" — coerce to integer. macOS edge case returns "24"
  // at midnight; normalize to 0.
  const formatted = fmt.format(ts);
  const parsed = Number.parseInt(formatted, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed === 24 ? 0 : parsed;
};

export const computeRidePattern = (
  startedAtTimestamps: readonly string[],
  timezone: string,
): RidePattern | null => {
  if (startedAtTimestamps.length === 0) return null;

  const histogram = new Array<number>(24).fill(0);
  let sampleCount = 0;

  for (const ts of startedAtTimestamps) {
    const hour = hourInTimezone(ts, timezone);
    if (hour === null) continue;
    histogram[hour]!++;
    sampleCount++;
  }

  if (sampleCount < MIN_SAMPLES) return null;

  // Find the modal hour. Tie-break: the earliest hour wins (consistent
  // and deterministic — earlier means we nudge earlier, which is safer
  // because evening nudges are easier to ignore than morning ones).
  let modalHour = 0;
  let modalCount = 0;
  for (let h = 0; h < 24; h++) {
    if (histogram[h]! > modalCount) {
      modalCount = histogram[h]!;
      modalHour = h;
    }
  }

  // Confidence — modal share, saturated at the sample bonus.
  const modalShare = modalCount / sampleCount;
  const sampleBonus = Math.min(1, sampleCount / SATURATION_SAMPLES);
  const confidence = Number((modalShare * sampleBonus).toFixed(2));

  return {
    typicalStartHour: modalHour,
    confidence,
    sampleCount,
  };
};
