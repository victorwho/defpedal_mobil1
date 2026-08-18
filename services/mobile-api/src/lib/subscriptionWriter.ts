/**
 * Persists a mapped RevenueCat event into `subscriptions`.
 *
 * The mapping decisions live in `revenuecatWebhook.ts` (pure); this module owns
 * only the database side: idempotency, user attribution, ordering, and the
 * upsert. Splitting them keeps the interesting rules testable without a DB and
 * the DB code small enough to read in one go.
 *
 * Three failure modes this is built around:
 *
 *  1. DUPLICATE DELIVERY IS ROUTINE. RevenueCat retries aggressively, so the
 *     same event arrives more than once as a matter of course. The primary key
 *     on `subscription_events.event_id` is the dedupe: we insert first, and a
 *     unique violation means we have already handled this delivery.
 *
 *  2. DELIVERIES ARE NOT ORDERED. A delayed EXPIRATION can land after a
 *     RENEWAL. Without the `last_event_at` guard that marks a rider who just
 *     paid as expired.
 *
 *  3. THE ACCOUNT MAY NOT EXIST YET. The webhook can beat account creation, and
 *     a client that purchased before `logIn` sends a RevenueCat anonymous id
 *     instead of our user id. Those are different problems: the first is a race
 *     worth retrying, the second never resolves. They are reported separately so
 *     the endpoint can choose the right HTTP status.
 */
import {
  mapRevenueCatEvent,
  isNewerEvent,
  type RevenueCatMappingOptions,
} from './revenuecatWebhook';

/** Supabase client surface used here (the DB schema is untyped in this repo). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped DB schema
type Db = any;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres unique violation. */
const UNIQUE_VIOLATION = '23505';
/** Postgres foreign-key violation — the referenced user does not exist. */
const FK_VIOLATION = '23503';

export type ApplyWebhookResult =
  /** State written. */
  | { readonly kind: 'applied'; readonly userId: string; readonly eventId: string }
  /** Already processed — a retry. Not an error. */
  | { readonly kind: 'duplicate'; readonly eventId: string }
  /** Older than the state we hold; deliberately not applied. */
  | { readonly kind: 'stale'; readonly eventId: string }
  /** Mapper chose not to act. */
  | { readonly kind: 'ignored'; readonly eventId: string | null; readonly reason: string }
  /** Malformed payload. Retrying will not help. */
  | { readonly kind: 'invalid'; readonly reason: string }
  /**
   * `app_user_id` is not one of our user ids (a RevenueCat anonymous id).
   * Unresolvable — retrying never helps.
   */
  | { readonly kind: 'unattributable'; readonly appUserId: string }
  /**
   * Well-formed user id that does not exist yet. Usually the webhook racing
   * account creation, so a retry may succeed.
   */
  | { readonly kind: 'unknown_user'; readonly userId: string }
  /** Transport or database failure. Retryable. */
  | { readonly kind: 'error'; readonly message: string };

const errorCode = (error: unknown): string | null => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
};

/**
 * Records the raw event. Returns `'duplicate'` when this delivery has already
 * been seen, which is the idempotency gate for everything downstream.
 *
 * Recorded even for events we ignore: a TRANSFER we deliberately refuse to
 * auto-apply still needs to be visible to whoever reviews it, and an audit
 * trail of "what did the provider actually send" is exactly what support needs
 * when a rider disputes their access.
 */
const recordEvent = async (
  db: Db,
  row: {
    eventId: string;
    userId: string | null;
    eventType: string;
    eventAt: string;
    payload: unknown;
  },
): Promise<'inserted' | 'duplicate' | 'error'> => {
  const insert = async (userId: string | null) =>
    db.from('subscription_events').insert({
      event_id: row.eventId,
      user_id: userId,
      event_type: row.eventType,
      event_at: row.eventAt,
      payload: row.payload,
    });

  try {
    const { error } = await insert(row.userId);
    if (!error) return 'inserted';

    if (errorCode(error) === UNIQUE_VIOLATION) return 'duplicate';

    // The user id looks valid but no such account exists. Keep the audit row
    // rather than losing the event entirely — attribution can be repaired
    // later, a discarded payload cannot.
    if (errorCode(error) === FK_VIOLATION && row.userId !== null) {
      const retry = await insert(null);
      if (!retry.error) return 'inserted';
      if (errorCode(retry.error) === UNIQUE_VIOLATION) return 'duplicate';
      return 'error';
    }

    return 'error';
  } catch {
    return 'error';
  }
};

/**
 * Applies one webhook body.
 *
 * Order is deliberate: map, then dedupe, then attribute, then order-check, then
 * write. Deduping before attribution means a duplicate of an unattributable
 * event is still recognised as a duplicate rather than re-reported every retry.
 */
export const applyRevenueCatWebhook = async (
  db: Db,
  payload: unknown,
  options: RevenueCatMappingOptions,
): Promise<ApplyWebhookResult> => {
  const outcome = mapRevenueCatEvent(payload, options);

  if (outcome.kind === 'invalid') {
    return { kind: 'invalid', reason: outcome.reason };
  }

  const appUserId = outcome.appUserId ?? null;
  const candidateUserId = appUserId && UUID_RE.test(appUserId) ? appUserId : null;

  if (outcome.kind === 'ignore') {
    // Still recorded, so ignored events remain auditable.
    if (outcome.eventId && outcome.eventType) {
      await recordEvent(db, {
        eventId: outcome.eventId,
        userId: candidateUserId,
        eventType: outcome.eventType,
        eventAt: new Date().toISOString(),
        payload,
      });
    }
    return { kind: 'ignored', eventId: outcome.eventId, reason: outcome.reason };
  }

  const recorded = await recordEvent(db, {
    eventId: outcome.eventId,
    userId: candidateUserId,
    eventType: outcome.eventType,
    eventAt: outcome.eventAt,
    payload,
  });

  if (recorded === 'duplicate') return { kind: 'duplicate', eventId: outcome.eventId };
  if (recorded === 'error') {
    return { kind: 'error', message: 'failed to record subscription event' };
  }

  if (!candidateUserId) {
    // A RevenueCat anonymous id. The purchase is real but we cannot say whose
    // it is; retrying will never change that.
    return { kind: 'unattributable', appUserId: appUserId ?? '(missing)' };
  }

  try {
    const { data: existing, error: readError } = await db
      .from('subscriptions')
      .select('last_event_at')
      .eq('user_id', candidateUserId)
      .maybeSingle();

    if (readError && errorCode(readError) !== null) {
      return { kind: 'error', message: 'failed to read existing subscription' };
    }

    const lastEventAt = (existing?.last_event_at as string | undefined) ?? null;
    if (!isNewerEvent(lastEventAt, outcome.eventAt)) {
      return { kind: 'stale', eventId: outcome.eventId };
    }

    const { error: writeError } = await db.from('subscriptions').upsert(
      {
        user_id: candidateUserId,
        status: outcome.state.status,
        store: outcome.state.store,
        product_id: outcome.state.productId,
        expires_at: outcome.state.expiresAt,
        revenuecat_app_user_id: appUserId,
        last_event_at: outcome.eventAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (writeError) {
      if (errorCode(writeError) === FK_VIOLATION) {
        return { kind: 'unknown_user', userId: candidateUserId };
      }
      return { kind: 'error', message: 'failed to write subscription' };
    }

    return { kind: 'applied', userId: candidateUserId, eventId: outcome.eventId };
  } catch {
    return { kind: 'error', message: 'subscription write threw' };
  }
};
