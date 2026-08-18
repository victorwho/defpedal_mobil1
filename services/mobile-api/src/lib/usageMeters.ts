/**
 * Server-side usage meters — today only the free-tier flat-route allowance.
 *
 * The device counts locally so a ride never waits on a network round-trip, and
 * reconciles here when it can. This is the durable half: without it a rider
 * resets their allowance by reinstalling.
 *
 * KNOWN LIMIT: the increment is read-modify-write, not atomic, because doing it
 * in one statement would need a Postgres function and this table is written
 * only by one rider's own devices. Two devices reconciling in the same instant
 * can under-count by one. That is a deliberate trade — the alternative failure
 * (charging a rider twice for one ride) is worse, and the client's own pending
 * counter still guards the common single-device case.
 */

/** Supabase client surface used here (the DB schema is untyped in this repo). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped DB schema
type Db = any;

export const FLAT_ROUTE_METER = 'flat_route';

/** `YYYY-MM`, matching the CHECK constraint on `usage_meters.period_key`. */
const PERIOD_KEY_RE = /^\d{4}-\d{2}$/;

export const isValidPeriodKey = (value: unknown): value is string =>
  typeof value === 'string' && PERIOD_KEY_RE.test(value);

export interface MeterReconcileResult {
  readonly periodKey: string;
  /** Authoritative total the server now holds for this period. */
  readonly total: number;
  /** How many of the reported rides were actually absorbed. */
  readonly accepted: number;
}

/**
 * Reads the current count for a period. `null` on any failure, which callers
 * treat as "cannot reconcile now" rather than zero.
 */
const readCount = async (
  db: Db,
  userId: string,
  periodKey: string,
): Promise<number | null> => {
  try {
    const { data, error } = await db
      .from('usage_meters')
      .select('count')
      .eq('user_id', userId)
      .eq('meter', FLAT_ROUTE_METER)
      .eq('period_key', periodKey)
      .maybeSingle();
    if (error) return null;
    return typeof data?.count === 'number' ? data.count : 0;
  } catch {
    return null;
  }
};

/**
 * Adds `pending` rides to a rider's meter for `periodKey`.
 *
 * `pending` is clamped: a negative value can never refund quota, and an absurd
 * one can never be used to poison the counter. Returns `null` when the write
 * could not be completed, so the caller can tell the device to keep its
 * pending count and retry rather than acknowledging rides that were never
 * recorded.
 */
export const reconcileFlatRouteMeter = async (
  db: Db,
  userId: string,
  periodKey: string,
  pending: number,
  maxPerCall = 50,
): Promise<MeterReconcileResult | null> => {
  if (!isValidPeriodKey(periodKey)) return null;

  const accepted = Math.min(Math.max(0, Math.trunc(pending)), maxPerCall);
  const current = await readCount(db, userId, periodKey);
  if (current === null) return null;

  if (accepted === 0) {
    return { periodKey, total: current, accepted: 0 };
  }

  const total = current + accepted;

  try {
    const { error } = await db.from('usage_meters').upsert(
      {
        user_id: userId,
        meter: FLAT_ROUTE_METER,
        period_key: periodKey,
        count: total,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,meter,period_key' },
    );
    if (error) return null;
  } catch {
    return null;
  }

  return { periodKey, total, accepted };
};
