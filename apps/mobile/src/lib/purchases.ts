/**
 * RevenueCat adapter — the ONLY file in the app that touches the store SDK.
 *
 * Everything else speaks in this module's plain types, so a change of billing
 * provider is a rewrite of one file, and every other surface stays testable
 * without a native module.
 *
 * NATIVE-MODULE GUARDING (error-log #23 + #45). `react-native-purchases` is a
 * community module, not an Expo one:
 *
 *   - Its invariant throw ESCAPES a try/catch around `require()`, so presence
 *     is checked via `NativeModules.RNPurchases` FIRST.
 *   - TurboModule property access fires `getEnforcing` LAZILY, so the
 *     destructure must live INSIDE the same try as the require. Wrapping only
 *     the require line leaks the invariant on the next line.
 *
 * Every export is safe to call on a build without the native module or without
 * an API key: they resolve to "unavailable" rather than throwing. That is what
 * lets the paywall render, and the app boot, on a dev build that has no billing
 * configured at all.
 */
import { NativeModules, Platform } from 'react-native';

import { PLUS_ENTITLEMENT_ID } from '@defensivepedal/core';

import { mobileEnv } from './env';

// ---------------------------------------------------------------------------
// Plain types — no SDK types leak past this module
// ---------------------------------------------------------------------------

export type PurchasePlan = 'monthly' | 'annual';

export interface StoreOffer {
  readonly plan: PurchasePlan;
  /** Localised, store-formatted price string (e.g. "3,00 €"). Never computed. */
  readonly priceString: string;
  /** Free-trial length in days, when the offer carries an intro offer. */
  readonly trialDays: number | null;
  /** Opaque handle passed back to `purchase`. */
  readonly packageRef: unknown;
}

export interface StoreOffers {
  readonly monthly: StoreOffer | null;
  readonly annual: StoreOffer | null;
}

export type PurchaseOutcome =
  | { readonly kind: 'purchased' }
  /** The rider backed out. Never show an error for this. */
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed'; readonly message: string };

export type RestoreOutcome =
  | { readonly kind: 'restored' }
  /** Completed fine, but this account owns no subscription. */
  | { readonly kind: 'nothing_to_restore' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed'; readonly message: string };

// ---------------------------------------------------------------------------
// Module loading
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK is untyped here by design
type PurchasesModule = any;

let cached: PurchasesModule | null = null;
let configured = false;
let injectedForTests: PurchasesModule | null = null;

/**
 * Loads the SDK, or returns null when it is absent.
 *
 * The `NativeModules` probe is the load-bearing part: `require()` of a missing
 * community module throws an invariant that a try/catch cannot contain.
 *
 * The `require` branch itself is NOT exercised by unit tests — the package is
 * externalized, so under vitest the call reaches Node and loads the real
 * module, which dies parsing react-native's Flow syntax. Tests inject through
 * the seam below instead; what they still cover is the guard, the
 * configuration, and every call path built on top.
 */
const loadPurchases = (): PurchasesModule | null => {
  if (cached) return cached;
  // Guard first, and it applies to the injected module too — a test must not
  // be able to "have" the SDK on a build where the native module is missing.
  if (!NativeModules.RNPurchases) return null;

  if (injectedForTests) {
    cached = injectedForTests;
    return cached;
  }

  try {
    const mod = require('react-native-purchases');
    // Destructure INSIDE the try: TurboModule property access is lazy, so this
    // line — not the require — is where a missing module actually throws.
    const Purchases = mod?.default ?? mod;
    if (!Purchases || typeof Purchases.getOfferings !== 'function') return null;
    cached = Purchases;
    return cached;
  } catch {
    return null;
  }
};

/** Platform's public SDK key, or empty when billing is not configured. */
const apiKey = (): string =>
  Platform.OS === 'ios' ? mobileEnv.revenueCatIosKey : mobileEnv.revenueCatAndroidKey;

/** True when this build can actually transact. */
export const isBillingAvailable = (): boolean =>
  Boolean(loadPurchases()) && apiKey().length > 0;

/**
 * Configures the SDK once per process.
 *
 * `appUserID` is the Supabase user id so entitlements follow the account, not
 * the device. Passing it here (rather than letting RevenueCat mint an
 * anonymous id) is what keeps a purchase attributable — an anonymous id can
 * never be resolved back to an account by the webhook.
 */
const ensureConfigured = (appUserId: string | null): PurchasesModule | null => {
  const Purchases = loadPurchases();
  const key = apiKey();
  if (!Purchases || !key) return null;

  if (!configured) {
    try {
      Purchases.configure({ apiKey: key, appUserID: appUserId ?? undefined });
      configured = true;
    } catch {
      return null;
    }
  }
  return Purchases;
};

/**
 * Ties the SDK to a signed-in account, or releases it on sign-out.
 *
 * Must run on every auth change: without it, a second rider signing in on the
 * same phone inherits the first rider's entitlement.
 */
export const identifyPurchaser = async (appUserId: string | null): Promise<void> => {
  const Purchases = ensureConfigured(appUserId);
  if (!Purchases) return;

  try {
    if (appUserId) {
      await Purchases.logIn(appUserId);
    } else {
      await Purchases.logOut();
    }
  } catch {
    // Identity sync is best-effort; entitlement still comes from our server.
  }
};

// ---------------------------------------------------------------------------
// Offerings
// ---------------------------------------------------------------------------

const PLAN_BY_PERIOD: Record<string, PurchasePlan> = {
  MONTHLY: 'monthly',
  P1M: 'monthly',
  ANNUAL: 'annual',
  P1Y: 'annual',
};

/** Reads a trial length off whichever intro-offer shape the platform used. */
const trialDaysOf = (pkg: { product?: Record<string, unknown> } | null): number | null => {
  const product = pkg?.product as Record<string, unknown> | undefined;
  const intro = product?.introPrice as Record<string, unknown> | undefined;
  if (!intro) return null;
  const periodUnit = String(intro.periodUnit ?? '').toUpperCase();
  const periodNumber = Number(intro.periodNumberOfUnits ?? 0);
  if (!Number.isFinite(periodNumber) || periodNumber <= 0) return null;
  if (periodUnit === 'DAY') return periodNumber;
  if (periodUnit === 'WEEK') return periodNumber * 7;
  if (periodUnit === 'MONTH') return periodNumber * 30;
  return null;
};

const toOffer = (pkg: Record<string, unknown> | null, plan: PurchasePlan): StoreOffer | null => {
  if (!pkg) return null;
  const product = pkg.product as Record<string, unknown> | undefined;
  const priceString = typeof product?.priceString === 'string' ? product.priceString : '';
  if (!priceString) return null;
  return {
    plan,
    priceString,
    trialDays: trialDaysOf(pkg as never),
    packageRef: pkg,
  };
};

/**
 * Fetches the current offering.
 *
 * Returns both plans as null when billing is unavailable — the paywall renders
 * its benefits and simply shows no purchase button, which is exactly the state
 * before store products exist.
 */
export const getStoreOffers = async (appUserId: string | null): Promise<StoreOffers> => {
  const empty: StoreOffers = { monthly: null, annual: null };
  const Purchases = ensureConfigured(appUserId);
  if (!Purchases) return empty;

  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings?.current;
    if (!current) return empty;

    const packages: Array<Record<string, unknown>> = current.availablePackages ?? [];

    const find = (plan: PurchasePlan) =>
      packages.find((p) => {
        const type = String(p.packageType ?? '').toUpperCase();
        return PLAN_BY_PERIOD[type] === plan;
      }) ?? null;

    return {
      monthly: toOffer(find('monthly'), 'monthly'),
      annual: toOffer(find('annual'), 'annual'),
    };
  } catch {
    return empty;
  }
};

// ---------------------------------------------------------------------------
// Purchase + restore
// ---------------------------------------------------------------------------

const ownsPlus = (customerInfo: Record<string, unknown> | undefined): boolean => {
  const entitlements = customerInfo?.entitlements as Record<string, unknown> | undefined;
  const active = entitlements?.active as Record<string, unknown> | undefined;
  return Boolean(active && active[PLUS_ENTITLEMENT_ID]);
};

/**
 * Runs a purchase.
 *
 * A cancellation is reported separately and must never surface as an error —
 * the rider chose to back out, and showing them a failure for that reads as a
 * bug.
 */
export const purchasePlan = async (
  offer: StoreOffer,
  appUserId: string | null,
): Promise<PurchaseOutcome> => {
  const Purchases = ensureConfigured(appUserId);
  if (!Purchases) return { kind: 'unavailable' };

  try {
    await Purchases.purchasePackage(offer.packageRef);
    // A completed call means the store took the payment. We deliberately do
    // NOT require the entitlement to be active in the response: our server is
    // the source of truth and learns from the webhook, which can land a moment
    // later. Telling a rider their payment failed because of that race would
    // be both wrong and alarming.
    return { kind: 'purchased' };
  } catch (error) {
    const e = error as { userCancelled?: boolean; message?: string };
    if (e?.userCancelled) return { kind: 'cancelled' };
    return { kind: 'failed', message: e?.message ?? 'Purchase failed.' };
  }
};

/**
 * Restores a previous purchase. Required by both stores, and the recovery path
 * after a reinstall.
 */
export const restorePurchases = async (appUserId: string | null): Promise<RestoreOutcome> => {
  const Purchases = ensureConfigured(appUserId);
  if (!Purchases) return { kind: 'unavailable' };

  try {
    const customerInfo = await Purchases.restorePurchases();
    return ownsPlus(customerInfo) ? { kind: 'restored' } : { kind: 'nothing_to_restore' };
  } catch (error) {
    const e = error as { message?: string };
    return { kind: 'failed', message: e?.message ?? 'Restore failed.' };
  }
};

/**
 * Test seam. Resets memoised state and, optionally, injects a stand-in for the
 * SDK so the call paths above can be exercised without a native module.
 * Injection does NOT bypass the `NativeModules` guard.
 */
export const __resetPurchasesForTests = (mod: PurchasesModule | null = null): void => {
  cached = null;
  configured = false;
  injectedForTests = mod;
};
