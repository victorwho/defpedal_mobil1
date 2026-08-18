// Server-side enforcement. The client refuses first, but a client check is a
// courtesy — this is where a limit actually binds. Two properties dominate:
//   1. DARK-LAUNCH NEUTRALITY. With premium_ui_enabled false, nothing that
//      works today may start failing. A dark launch that changes behaviour is
//      not dark.
//   2. FAIL OPEN. If our own lookup breaks, the rider's write goes through.
//      Refusing a save because we could not count is worse than one extra row.
import { describe, expect, it } from 'vitest';

import { FREE_LIMITS } from '@defensivepedal/core';

import {
  assertCanSaveRoute,
  countSavedRoutes,
  loadEnforcementContext,
  resolveHistoryCutoff,
  PREMIUM_LIMIT_CODE,
} from './premiumEnforcement';

const NOW = '2026-08-15T12:00:00.000Z';
const USER = 'user-1';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface Config {
  uiEnabled?: boolean;
  subscription?: Record<string, unknown> | null;
  savedRouteCount?: number | null;
  profileThrows?: boolean;
  savedRoutesThrow?: boolean;
}

const makeDb = (c: Config = {}) => ({
  from: (table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => {
              if (c.profileThrows) throw new Error('no such column');
              return Promise.resolve({
                data: {
                  created_at: '2020-01-01T00:00:00.000Z',
                  premium_ui_enabled: c.uiEnabled === true,
                },
                error: null,
              });
            },
          }),
        }),
      };
    }
    if (table === 'subscriptions') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: c.subscription ?? null, error: null }),
          }),
        }),
      };
    }
    if (table === 'saved_routes') {
      return {
        select: () => ({
          eq: () => {
            if (c.savedRoutesThrow) throw new Error('boom');
            return Promise.resolve({
              count: c.savedRouteCount ?? null,
              error: c.savedRouteCount === null ? { message: 'failed' } : null,
            });
          },
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  },
});

const plusSub = {
  status: 'active',
  store: 'play',
  product_id: 'pedal_plus_monthly',
  expires_at: new Date(Date.parse(NOW) + 30 * MS_PER_DAY).toISOString(),
};

// ---------------------------------------------------------------------------

describe('loadEnforcementContext', () => {
  it('reports enforcement off while the paywall is dark', async () => {
    const ctx = await loadEnforcementContext(makeDb({ uiEnabled: false }), USER, NOW);
    expect(ctx.enforced).toBe(false);
  });

  it('reports enforcement on once revealed', async () => {
    const ctx = await loadEnforcementContext(makeDb({ uiEnabled: true }), USER, NOW);
    expect(ctx.enforced).toBe(true);
  });

  it('resolves the tier from the subscription', async () => {
    const ctx = await loadEnforcementContext(
      makeDb({ uiEnabled: true, subscription: plusSub }),
      USER,
      NOW,
    );
    expect(ctx.tier).toBe('plus');
  });
});

describe('countSavedRoutes', () => {
  it('returns the count', async () => {
    expect(await countSavedRoutes(makeDb({ savedRouteCount: 3 }), USER)).toBe(3);
  });

  it('returns null when the count fails rather than guessing zero', async () => {
    // Zero would silently let a rider past the ceiling.
    expect(await countSavedRoutes(makeDb({ savedRouteCount: null }), USER)).toBeNull();
  });

  it('returns null when the query throws', async () => {
    expect(await countSavedRoutes(makeDb({ savedRoutesThrow: true }), USER)).toBeNull();
  });
});

describe('assertCanSaveRoute — dark-launch neutrality', () => {
  it('allows a save far over the limit while the paywall is dark', async () => {
    const db = makeDb({ uiEnabled: false, savedRouteCount: 9999 });
    await expect(assertCanSaveRoute(db, USER, NOW)).resolves.toBeUndefined();
  });

  it('does not even count while dark', async () => {
    // Enforcement must be genuinely inert, not merely permissive.
    let counted = false;
    const inner = makeDb({ uiEnabled: false });
    const db = {
      from: (t: string) => {
        if (t === 'saved_routes') counted = true;
        return inner.from(t);
      },
    };
    await assertCanSaveRoute(db, USER, NOW);
    expect(counted).toBe(false);
  });
});

describe('assertCanSaveRoute — enforcement', () => {
  it('allows a free rider below the ceiling', async () => {
    const db = makeDb({ uiEnabled: true, savedRouteCount: FREE_LIMITS.savedRoutes! - 1 });
    await expect(assertCanSaveRoute(db, USER, NOW)).resolves.toBeUndefined();
  });

  it('refuses a free rider at the ceiling with a distinguishable code', async () => {
    const db = makeDb({ uiEnabled: true, savedRouteCount: FREE_LIMITS.savedRoutes! });
    await expect(assertCanSaveRoute(db, USER, NOW)).rejects.toMatchObject({
      statusCode: 402,
      code: PREMIUM_LIMIT_CODE,
    });
  });

  it('never refuses a subscriber', async () => {
    const db = makeDb({ uiEnabled: true, subscription: plusSub, savedRouteCount: 9999 });
    await expect(assertCanSaveRoute(db, USER, NOW)).resolves.toBeUndefined();
  });

  it('does NOT exempt a grandfathered rider from the saved-route ceiling', async () => {
    // Grandfathering preserves existing content; it does not grant unlimited
    // new additions. Same rule the client enforces.
    const db = makeDb({ uiEnabled: true, savedRouteCount: FREE_LIMITS.savedRoutes! });
    await expect(assertCanSaveRoute(db, USER, NOW)).rejects.toMatchObject({
      code: PREMIUM_LIMIT_CODE,
    });
  });
});

describe('assertCanSaveRoute — fails open', () => {
  it('allows the save when the count cannot be established', async () => {
    const db = makeDb({ uiEnabled: true, savedRouteCount: null });
    await expect(assertCanSaveRoute(db, USER, NOW)).resolves.toBeUndefined();
  });

  it('allows the save when entitlement cannot be read', async () => {
    const db = makeDb({ profileThrows: true, savedRouteCount: 9999 });
    await expect(assertCanSaveRoute(db, USER, NOW)).resolves.toBeUndefined();
  });
});

describe('resolveHistoryCutoff', () => {
  it('applies no filter while the paywall is dark', async () => {
    const db = makeDb({ uiEnabled: false });
    expect(await resolveHistoryCutoff(db, USER, NOW)).toBeNull();
  });

  it('applies the free window once revealed', async () => {
    const db = makeDb({ uiEnabled: true });
    const cutoff = await resolveHistoryCutoff(db, USER, NOW);
    expect(cutoff).toBe(
      new Date(Date.parse(NOW) - FREE_LIMITS.historyWindowDays! * MS_PER_DAY).toISOString(),
    );
  });

  it('applies no filter for a subscriber', async () => {
    const db = makeDb({ uiEnabled: true, subscription: plusSub });
    expect(await resolveHistoryCutoff(db, USER, NOW)).toBeNull();
  });

  it('applies no filter when entitlement cannot be read', async () => {
    // Hiding a rider's history because our lookup failed would look like data
    // loss to the only person who would notice.
    const db = makeDb({ profileThrows: true });
    expect(await resolveHistoryCutoff(db, USER, NOW)).toBeNull();
  });
});
