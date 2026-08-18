/**
 * Pedal Plus client state: the cached entitlement and the flat-route meter.
 *
 * USER-SCOPED, not device-scoped. Entitlement follows the account, so every
 * field here is cleared by `resetUserScopedState` — unlike `reviewPromptState`,
 * which is device-scoped because Play's review quota is per-Play-account. A
 * subscription that survived an account switch would grant Plus to whoever
 * signed in next on that phone.
 *
 * The persisted snapshot is the offline cache. It is what lets a paying rider
 * mid-tour with no signal keep what they paid for: `resolveEntitlement` honours
 * it for `PLUS_OFFLINE_GRACE_DAYS`. Writes are force-flushed for the same
 * reason the offline queue is — a debounced-but-unflushed write is lost on an
 * OS kill, and here that means a subscriber reopening the app as a free user.
 */
import type {
  FlatRouteMeterState,
  PremiumTier,
  ProfilePremium,
} from '@defensivepedal/core';
import {
  consumeFlatRoute,
  DEFAULT_FLAT_ROUTE_METER,
  mergeFlatRouteMeters,
  acknowledgeFlatRoutes,
} from '@defensivepedal/core';

import { flushPersistedWrites } from '../lib/storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The server's last word on this rider's entitlement, plus when we heard it.
 *
 * `observedAt` is stamped on receipt and is what both the grace window and the
 * freshness check measure against, so it must never be back-dated or faked.
 */
export interface PremiumSnapshot {
  readonly tier: PremiumTier;
  readonly isTrial: boolean;
  readonly isInBillingRetry: boolean;
  readonly isGrandfathered: boolean;
  readonly expiresAt: string | null;
  /** Paywall visibility. Independent of tier — see ProfilePremium. */
  readonly uiEnabled: boolean;
  readonly observedAt: string;
}

export type PremiumSliceState = {
  premiumSnapshot: PremiumSnapshot | null;
  flatRouteMeter: FlatRouteMeterState;
};

export type PremiumSliceActions = {
  /** Store the premium block from a profile read/write response. */
  setPremiumFromProfile: (premium: ProfilePremium, observedAtIso: string) => void;
  /** Record a started flat ride against the given period. */
  consumeFlatRouteLocally: (periodKey: string) => void;
  /** Fold a server meter snapshot into local state. */
  mergeFlatRouteMeterFromServer: (remote: FlatRouteMeterState) => void;
  /** Move acknowledged pending rides into the synced count. */
  acknowledgeFlatRoutesLocally: (acknowledged: number) => void;
  /** Clear everything. Used by the user-scoped reset. */
  clearPremiumState: () => void;
};

export type PremiumSlice = PremiumSliceState & PremiumSliceActions;

export const DEFAULT_PREMIUM_SLICE_STATE: PremiumSliceState = {
  premiumSnapshot: null,
  flatRouteMeter: DEFAULT_FLAT_ROUTE_METER,
};

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

export const createPremiumSlice = (
  set: (
    partial:
      | Partial<PremiumSliceState>
      | ((state: PremiumSliceState) => Partial<PremiumSliceState>),
  ) => void,
): PremiumSlice => ({
  ...DEFAULT_PREMIUM_SLICE_STATE,

  setPremiumFromProfile: (premium, observedAtIso) => {
    set(() => ({
      premiumSnapshot: {
        tier: premium.tier,
        isTrial: premium.isTrial,
        isInBillingRetry: premium.isInBillingRetry,
        isGrandfathered: premium.isGrandfathered,
        expiresAt: premium.expiresAt,
        uiEnabled: premium.uiEnabled,
        observedAt: observedAtIso,
      },
    }));
    // A subscriber who force-quits must not reopen as a free user.
    flushPersistedWrites();
  },

  consumeFlatRouteLocally: (periodKey) => {
    set((state) => ({
      flatRouteMeter: consumeFlatRoute(state.flatRouteMeter, periodKey),
    }));
    // Quota must survive a hard kill, or killing the app is free flat routes.
    flushPersistedWrites();
  },

  mergeFlatRouteMeterFromServer: (remote) => {
    set((state) => ({
      flatRouteMeter: mergeFlatRouteMeters(state.flatRouteMeter, remote),
    }));
    flushPersistedWrites();
  },

  acknowledgeFlatRoutesLocally: (acknowledged) => {
    set((state) => ({
      flatRouteMeter: acknowledgeFlatRoutes(state.flatRouteMeter, acknowledged),
    }));
    flushPersistedWrites();
  },

  clearPremiumState: () => {
    set(() => ({ ...DEFAULT_PREMIUM_SLICE_STATE }));
    flushPersistedWrites();
  },
});
