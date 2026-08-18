/**
 * Server-side enforcement of the Pedal Plus free-tier ceilings.
 *
 * The client already refuses to exceed a limit, but a client check is a
 * courtesy, not a control: a modified or outdated build can call the API
 * directly. This module is where a limit is actually binding.
 *
 * It mirrors the client exactly, and deliberately so:
 *
 *   - The SAME core predicates decide the answer. A limit that drifts between
 *     the two would show a rider one number and enforce another.
 *   - Enforcement is gated on `premium_ui_enabled`, exactly as on the client.
 *     While the paywall is dark the server must not start rejecting writes
 *     that succeed today — a dark launch that changes behaviour is not dark.
 *   - It fails OPEN. If entitlement cannot be resolved (schema absent, read
 *     failed), the write is allowed. Refusing a rider's save because our own
 *     lookup broke is strictly worse than letting one extra route through.
 */
import {
  canSaveAnotherRoute,
  historyRetentionCutoff,
  type PremiumTier,
  type ResolvedEntitlement,
} from '@defensivepedal/core';

import { loadPremiumProfileFields, type ProfilePremiumFields } from './entitlements';
import { HttpError } from './http';

/** Supabase client surface used here (the DB schema is untyped in this repo). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped DB schema
type Db = any;

/** Error code clients switch on to show the right limit card. */
export const PREMIUM_LIMIT_CODE = 'PREMIUM_LIMIT_REACHED';

export interface EnforcementContext {
  /** False while the paywall is dark — nothing is binding. */
  readonly enforced: boolean;
  readonly tier: PremiumTier;
  readonly entitlement: ResolvedEntitlement;
}

/**
 * Rebuilds the shape core predicates expect from the wire fields.
 *
 * `source`/`isStale` describe the client's offline cache and have no meaning
 * server-side, where the answer is always freshly read.
 */
const toResolved = (fields: ProfilePremiumFields): ResolvedEntitlement => ({
  tier: fields.tier,
  isTrial: fields.isTrial,
  isInBillingRetry: fields.isInBillingRetry,
  isGrandfathered: fields.isGrandfathered,
  source: 'server',
  isStale: false,
  expiresAt: fields.expiresAt,
});

export const loadEnforcementContext = async (
  db: Db,
  userId: string,
  nowIso: string,
): Promise<EnforcementContext> => {
  const fields = await loadPremiumProfileFields(db, { userId, nowIso });
  return {
    enforced: fields.uiEnabled,
    tier: fields.tier,
    entitlement: toResolved(fields),
  };
};

/**
 * Counts a user's saved routes.
 *
 * Returns `null` when the count cannot be established, which callers must
 * treat as "allow" rather than "zero" — a failed count that read as 0 would
 * silently let a rider past the ceiling, and one that read as ∞ would block a
 * legitimate save.
 */
export const countSavedRoutes = async (db: Db, userId: string): Promise<number | null> => {
  try {
    const { count, error } = await db
      .from('saved_routes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error || typeof count !== 'number') return null;
    return count;
  } catch {
    return null;
  }
};

/**
 * Throws when a rider may not save another route.
 *
 * Every uncertain path allows the write: paywall dark, unknown count, or a
 * failed entitlement read.
 */
export const assertCanSaveRoute = async (
  db: Db,
  userId: string,
  nowIso: string,
): Promise<void> => {
  const ctx = await loadEnforcementContext(db, userId, nowIso);
  if (!ctx.enforced) return;

  const count = await countSavedRoutes(db, userId);
  if (count === null) return;

  if (!canSaveAnotherRoute(ctx.entitlement, count)) {
    throw new HttpError('Saved-route limit reached.', {
      statusCode: 402,
      code: PREMIUM_LIMIT_CODE,
      details: ['Delete a saved route or subscribe to Pedal Plus for unlimited routes.'],
    });
  }
};

/**
 * The oldest ride a rider may see, or `null` for everything.
 *
 * Returns `null` while the paywall is dark, so history keeps behaving exactly
 * as it does today until the tier is revealed. Rows are never deleted on
 * account of this — it is a read filter only, and subscribing restores the
 * full history immediately.
 */
export const resolveHistoryCutoff = async (
  db: Db,
  userId: string,
  nowIso: string,
): Promise<string | null> => {
  const ctx = await loadEnforcementContext(db, userId, nowIso);
  if (!ctx.enforced) return null;
  return historyRetentionCutoff(ctx.entitlement, nowIso);
};
