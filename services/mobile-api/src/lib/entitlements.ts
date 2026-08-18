/**
 * Pedal Plus entitlement resolution, server side.
 *
 * The server is the source of truth for entitlement; the device caches the
 * answer and honours it for a grace window when offline. This module is the
 * only place the API turns database rows into a tier — the actual rules live
 * in `@defensivepedal/core` so the client and the server cannot drift.
 *
 * DEGRADES SAFELY WHEN THE SCHEMA IS ABSENT. Migration 202608190001 may not be
 * applied when this ships. Every read here is wrapped: a missing
 * `subscriptions` table or a missing `profiles.premium_ui_enabled` column
 * yields free-tier defaults rather than an exception. That property is what
 * makes it safe to deploy this before the migration — and it must be preserved,
 * because the profile endpoint is on the session-bootstrap path and throwing
 * here would 502 every rider's first request.
 *
 * FAIL OPEN, NEVER CLOSED. When anything is unknown we return the answer that
 * costs revenue rather than the one that takes a feature away: unknown account
 * age counts as grandfathered, and a failed read never downgrades a rider it
 * cannot verify.
 */
import {
  isGrandfatheredAccount,
  resolveEntitlement,
  type EntitlementSnapshot,
  type EntitlementStore,
  type PremiumTier,
  type SubscriptionStatus,
} from '@defensivepedal/core';

/** Supabase client surface used here (the DB schema is untyped in this repo). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped DB schema
type Db = any;

// ---------------------------------------------------------------------------
// Wire shape
// ---------------------------------------------------------------------------

/**
 * The premium block returned on the profile read.
 *
 * `uiEnabled` is visibility, NOT entitlement — the two are deliberately
 * independent so hiding the paywall can never strip features from a
 * subscriber, which is what makes it usable as an instant kill switch.
 */
export interface ProfilePremiumFields {
  readonly tier: PremiumTier;
  readonly isTrial: boolean;
  readonly isInBillingRetry: boolean;
  readonly isGrandfathered: boolean;
  readonly expiresAt: string | null;
  readonly uiEnabled: boolean;
}

/**
 * What every failure path returns. Grandfathered is `true` because an unknown
 * account age must never cost a rider a feature they already had.
 */
export const FALLBACK_PREMIUM_FIELDS: ProfilePremiumFields = {
  tier: 'free',
  isTrial: false,
  isInBillingRetry: false,
  isGrandfathered: true,
  expiresAt: null,
  uiEnabled: false,
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const VALID_STATUSES: readonly SubscriptionStatus[] = [
  'none',
  'trialing',
  'active',
  'grace',
  'cancelled',
  'expired',
];

const VALID_STORES: readonly EntitlementStore[] = ['play', 'app_store', 'manual'];

/**
 * Reads the rider's subscription row into a core snapshot.
 *
 * Returns `null` for "no row" and for any failure — the caller cannot
 * distinguish them, and must not: both mean "we have nothing that grants
 * Plus", and neither is an error worth failing a profile read over.
 *
 * `observedAt` is stamped with the server's clock rather than a column,
 * because it means "when this observation was made", which is now.
 */
export const loadSubscriptionSnapshot = async (
  db: Db,
  userId: string,
  nowIso: string,
): Promise<EntitlementSnapshot | null> => {
  try {
    const { data, error } = await db
      .from('subscriptions')
      .select('status, store, product_id, expires_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return null;

    const status = VALID_STATUSES.includes(data.status as SubscriptionStatus)
      ? (data.status as SubscriptionStatus)
      : 'none';
    const store = VALID_STORES.includes(data.store as EntitlementStore)
      ? (data.store as EntitlementStore)
      : null;

    return {
      status,
      store,
      productId: (data.product_id as string) ?? null,
      expiresAt: toIso(data.expires_at),
      observedAt: nowIso,
    };
  } catch {
    // Table absent (migration not yet applied) or transport failure.
    return null;
  }
};

interface ProfilePremiumColumns {
  readonly createdAt: string | null;
  readonly uiEnabled: boolean;
}

/**
 * Reads the two `profiles` columns entitlement needs.
 *
 * Deliberately a separate query rather than being folded into the profile
 * route's existing select: if `premium_ui_enabled` does not exist yet, adding
 * it to that select would fail the WHOLE profile read and 502 every rider.
 * Once the migration is live the caller can read both columns itself and pass
 * them in, dropping this round-trip entirely.
 */
const loadProfilePremiumColumns = async (
  db: Db,
  userId: string,
): Promise<ProfilePremiumColumns> => {
  try {
    const { data, error } = await db
      .from('profiles')
      .select('created_at, premium_ui_enabled')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return { createdAt: null, uiEnabled: false };

    return {
      createdAt: toIso(data.created_at),
      uiEnabled: data.premium_ui_enabled === true,
    };
  } catch {
    return { createdAt: null, uiEnabled: false };
  }
};

const toIso = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface PremiumFieldsInput {
  readonly userId: string;
  readonly nowIso: string;
  /**
   * Pass when the caller has already read these from `profiles`, to skip a
   * round-trip. Omit and they are read here.
   */
  readonly profileCreatedAt?: string | null;
  readonly premiumUiEnabled?: boolean;
}

/**
 * Resolves the premium block for a profile response.
 *
 * `cached` is always null server-side: the offline grace window is a client
 * concern, and the server either knows the current state or reports free.
 */
export const loadPremiumProfileFields = async (
  db: Db,
  input: PremiumFieldsInput,
): Promise<ProfilePremiumFields> => {
  try {
    const needsProfileRead =
      input.profileCreatedAt === undefined || input.premiumUiEnabled === undefined;

    // Concurrent, not sequential: this runs on the session-bootstrap path and
    // Supabase is a cross-region hop (~100 ms each). Serialising two reads
    // here would be a visible regression on every app open.
    const [columns, snapshot] = await Promise.all([
      needsProfileRead
        ? loadProfilePremiumColumns(db, input.userId)
        : Promise.resolve({
            createdAt: input.profileCreatedAt ?? null,
            uiEnabled: input.premiumUiEnabled === true,
          }),
      loadSubscriptionSnapshot(db, input.userId, input.nowIso),
    ]);

    const createdAt =
      input.profileCreatedAt !== undefined ? input.profileCreatedAt : columns.createdAt;
    const uiEnabled =
      input.premiumUiEnabled !== undefined ? input.premiumUiEnabled === true : columns.uiEnabled;

    const entitlement = resolveEntitlement({
      server: snapshot,
      cached: null,
      accountCreatedAt: createdAt,
      nowIso: input.nowIso,
    });

    return {
      tier: entitlement.tier,
      isTrial: entitlement.isTrial,
      isInBillingRetry: entitlement.isInBillingRetry,
      isGrandfathered: entitlement.isGrandfathered,
      expiresAt: entitlement.expiresAt,
      uiEnabled,
    };
  } catch {
    return FALLBACK_PREMIUM_FIELDS;
  }
};

/**
 * Server-side grandfathering check for callers that already hold the account
 * creation timestamp and do not need a full resolution.
 */
export const isGrandfathered = (profileCreatedAt: string | null): boolean =>
  isGrandfatheredAccount(profileCreatedAt);
