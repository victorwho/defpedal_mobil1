/**
 * RevenueCat webhook event -> desired subscription state.
 *
 * A pure mapper. No I/O, no database, no clock. Everything that decides what a
 * billing event *means* lives here so it can be tested as a table of payload ->
 * expected state, and so the endpoint that persists it stays trivial.
 *
 * Three properties this module exists to guarantee:
 *
 *  1. SANDBOX EVENTS NEVER GRANT PRODUCTION ENTITLEMENT. RevenueCat delivers
 *     sandbox and production events to the same webhook. Without this gate a
 *     tester — or anyone who can drive a sandbox purchase — grants themselves
 *     Plus on the live app.
 *
 *  2. UNKNOWN EVENTS ARE IGNORED, NOT GUESSED. RevenueCat adds event types over
 *     time. An unrecognised type must leave state untouched rather than fall
 *     through to some default, because every wrong default here is either a
 *     rider losing access they paid for or a refunded rider keeping it.
 *
 *  3. REFUNDS NEED NO SPECIAL CASE. A refund arrives as CANCELLATION with an
 *     expiry at or before now. Mapping it to `cancelled` and letting the core
 *     resolver compare the expiry against the clock produces the right answer
 *     without a second code path — the resolver already drops Plus for a
 *     cancelled period that has ended.
 *
 * Ordering: deliveries can arrive out of order. `isNewerEvent` is the guard the
 * writer must apply before persisting, so a delayed EXPIRATION cannot overwrite
 * a newer RENEWAL.
 */
import type { EntitlementStore, SubscriptionStatus } from '@defensivepedal/core';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface SubscriptionStateUpdate {
  readonly status: SubscriptionStatus;
  readonly store: EntitlementStore | null;
  readonly productId: string | null;
  readonly expiresAt: string | null;
}

export type RevenueCatIgnoreReason =
  | 'sandbox_event'
  | 'other_entitlement'
  | 'unsupported_event_type'
  | 'transfer_needs_review'
  | 'test_event';

export type RevenueCatEventOutcome =
  | {
      readonly kind: 'apply';
      readonly eventId: string;
      readonly eventType: string;
      readonly eventAt: string;
      readonly appUserId: string;
      readonly state: SubscriptionStateUpdate;
    }
  | {
      readonly kind: 'ignore';
      readonly eventId: string | null;
      readonly eventType: string | null;
      readonly appUserId: string | null;
      readonly reason: RevenueCatIgnoreReason;
    }
  | { readonly kind: 'invalid'; readonly reason: string };

export interface RevenueCatMappingOptions {
  /** The entitlement identifier that grants Plus. */
  readonly entitlementId: string;
  /**
   * Whether SANDBOX-environment events may grant entitlement. False in
   * production. True only for a deliberately isolated test deployment.
   */
  readonly allowSandbox: boolean;
}

// ---------------------------------------------------------------------------
// Payload access helpers
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

const asObject = (value: unknown): Json | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/** RevenueCat sends epoch milliseconds. Returns ISO, or null if unusable. */
const msToIso = (value: unknown): string | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const asStringArray = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
};

/**
 * RevenueCat store -> our store vocabulary.
 *
 * PROMOTIONAL is a grant RevenueCat issued on our behalf (support, giveaway),
 * which is exactly what `manual` means here. Unrecognised stores map to null
 * rather than failing — the entitlement is still real, we just do not know
 * which storefront produced it.
 */
const mapStore = (raw: unknown): EntitlementStore | null => {
  switch (asString(raw)) {
    case 'PLAY_STORE':
      return 'play';
    case 'APP_STORE':
    case 'MAC_APP_STORE':
      return 'app_store';
    case 'PROMOTIONAL':
      return 'manual';
    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Event-type mapping
// ---------------------------------------------------------------------------

/**
 * Event types we deliberately ignore, with the reason each is safe to drop.
 *
 * TRANSFER moves an entitlement between app_user_ids. Applying it blindly
 * would revoke Plus from one account and grant it to another off a single
 * event; it is rare, and getting it silently wrong is worse than queueing it
 * for a human. Flagged rather than guessed.
 */
const IGNORED_EVENT_TYPES: Readonly<Record<string, RevenueCatIgnoreReason>> = {
  TEST: 'test_event',
  TRANSFER: 'transfer_needs_review',
  // Informational only — carries no entitlement state change.
  INVOICE_ISSUANCE: 'unsupported_event_type',
  NON_RENEWING_PURCHASE: 'unsupported_event_type',
};

/**
 * Maps an event type + payload to a status.
 *
 * Returns null for a type we do not model, which the caller turns into an
 * ignore rather than a guess.
 */
const statusForEvent = (eventType: string, event: Json): SubscriptionStatus | null => {
  const periodType = asString(event.period_type);

  switch (eventType) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'SUBSCRIPTION_EXTENDED':
    case 'TEMPORARY_ENTITLEMENT_GRANT':
      // A trial and a paid period both grant Plus; only the label differs.
      return periodType === 'TRIAL' ? 'trialing' : 'active';

    case 'PRODUCT_CHANGE':
      // Monthly and annual grant identical capability, so a plan switch never
      // changes entitlement. The new product takes effect at renewal; we record
      // it for support visibility and keep the rider entitled meanwhile.
      return 'active';

    case 'CANCELLATION':
      // Auto-renew off, or a refund. Either way the rider keeps access until
      // the expiry we are given — which for a refund is already in the past,
      // so the core resolver drops Plus without a special case here.
      return 'cancelled';

    case 'BILLING_ISSUE':
      // Payment failed and the store is retrying. Access continues through the
      // grace window.
      return 'grace';

    case 'EXPIRATION':
      return 'expired';

    case 'SUBSCRIPTION_PAUSED':
      // Play-only. A paused subscription grants nothing while paused.
      return 'expired';

    default:
      return null;
  }
};

/**
 * Which expiry applies. BILLING_ISSUE carries a grace-period expiry that
 * outlasts the lapsed paid period, and that is the date access really ends.
 */
const expiryForEvent = (eventType: string, event: Json): string | null => {
  if (eventType === 'BILLING_ISSUE') {
    return (
      msToIso(event.grace_period_expiration_at_ms) ?? msToIso(event.expiration_at_ms)
    );
  }
  return msToIso(event.expiration_at_ms);
};

/** PRODUCT_CHANGE names the plan being moved to; everything else uses product_id. */
const productForEvent = (eventType: string, event: Json): string | null => {
  if (eventType === 'PRODUCT_CHANGE') {
    return asString(event.new_product_id) ?? asString(event.product_id);
  }
  return asString(event.product_id);
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Maps one RevenueCat webhook body to an outcome.
 *
 * Never throws. A malformed body is `invalid`; anything we choose not to act on
 * is `ignore` with a reason, so the endpoint can log precisely why a delivery
 * changed nothing.
 */
export const mapRevenueCatEvent = (
  payload: unknown,
  options: RevenueCatMappingOptions,
): RevenueCatEventOutcome => {
  const body = asObject(payload);
  if (!body) return { kind: 'invalid', reason: 'payload is not an object' };

  const event = asObject(body.event);
  if (!event) return { kind: 'invalid', reason: 'missing event object' };

  const eventId = asString(event.id);
  if (!eventId) return { kind: 'invalid', reason: 'missing event id' };

  const eventType = asString(event.type);
  if (!eventType) return { kind: 'invalid', reason: 'missing event type' };

  const appUserId = asString(event.app_user_id);
  if (!appUserId) return { kind: 'invalid', reason: 'missing app_user_id' };

  const eventAt = msToIso(event.event_timestamp_ms);
  if (!eventAt) return { kind: 'invalid', reason: 'missing or invalid event_timestamp_ms' };

  const ignored = (reason: RevenueCatIgnoreReason): RevenueCatEventOutcome => ({
    kind: 'ignore',
    eventId,
    eventType,
    appUserId,
    reason,
  });

  // Sandbox gate first: a sandbox event must not even be considered against
  // production entitlement, whatever its type.
  const environment = asString(event.environment);
  if (environment === 'SANDBOX' && !options.allowSandbox) {
    return ignored('sandbox_event');
  }

  const ignoreReason = IGNORED_EVENT_TYPES[eventType];
  if (ignoreReason) return ignored(ignoreReason);

  // Only events touching OUR entitlement matter. RevenueCat omits the field on
  // some event types; absence is treated as "relevant" so we never drop a real
  // subscription change over a missing array.
  const entitlementIds = asStringArray(event.entitlement_ids);
  if (entitlementIds.length > 0 && !entitlementIds.includes(options.entitlementId)) {
    return ignored('other_entitlement');
  }

  const status = statusForEvent(eventType, event);
  if (!status) return ignored('unsupported_event_type');

  return {
    kind: 'apply',
    eventId,
    eventType,
    eventAt,
    appUserId,
    state: {
      status,
      store: mapStore(event.store),
      productId: productForEvent(eventType, event),
      expiresAt: expiryForEvent(eventType, event),
    },
  };
};

/**
 * Ordering guard for the writer.
 *
 * Webhook deliveries are not ordered. Persisting an older event over a newer
 * one is how a rider who just renewed gets marked expired. Returns true when
 * the incoming event should be applied.
 *
 * An unknown or unparseable stored timestamp means "we have nothing better",
 * so the incoming event wins — the alternative is a row frozen forever by one
 * bad value.
 */
export const isNewerEvent = (
  storedLastEventAt: string | null,
  incomingEventAt: string,
): boolean => {
  if (!storedLastEventAt) return true;
  const stored = Date.parse(storedLastEventAt);
  const incoming = Date.parse(incomingEventAt);
  if (Number.isNaN(stored) || Number.isNaN(incoming)) return true;
  return incoming >= stored;
};
