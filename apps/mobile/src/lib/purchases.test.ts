// The store adapter. What matters here is that NOTHING throws on a build
// without the native module or without an API key — that is every build today,
// and a throw would take the paywall (or the app) down with it.
//
// Also pins the two outcomes that are easy to get wrong:
//   - a user cancellation is NOT an error, and must never surface as one
//   - a completed purchase is reported as success even if the entitlement is
//     not active in the response, because our server learns from the webhook a
//     moment later and telling a rider their payment failed would be wrong
//
// `react-native-purchases` is stubbed GLOBALLY in vitest.setup.ts, not here: it
// is externalized, so a per-file vi.mock does not stop Node loading the real
// package (which then dies parsing react-native's Flow syntax). We drive that
// shared stub directly.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NativeModules } from 'react-native';
import Purchases from 'react-native-purchases';

const { env } = vi.hoisted(() => ({
  // Both platforms keyed: the repo's RN mock reports iOS, and the test should
  // not silently depend on which one it picked.
  env: {
    revenueCatAndroidKey: 'goog_test',
    revenueCatIosKey: 'appl_test',
    appEnv: 'development',
  },
}));

vi.mock('./env', () => ({ mobileEnv: env }));

const sdk = Purchases as unknown as Record<string, ReturnType<typeof vi.fn>>;
const nativeModules = NativeModules as unknown as Record<string, unknown>;

import {
  __resetPurchasesForTests,
  getStoreOffers,
  identifyPurchaser,
  isBillingAvailable,
  purchasePlan,
  restorePurchases,
  type StoreOffer,
} from './purchases';

const pkg = (packageType: string, priceString: string, intro?: unknown) => ({
  packageType,
  product: { priceString, introPrice: intro },
});

beforeEach(() => {
  __resetPurchasesForTests(sdk);
  nativeModules.RNPurchases = {};
  env.revenueCatAndroidKey = 'goog_test';
  env.revenueCatIosKey = 'goog_test';
  env.appEnv = 'development';
  vi.clearAllMocks();
  sdk.getOfferings.mockResolvedValue({ current: null } as never);
  sdk.purchasePackage.mockResolvedValue({ customerInfo: {} } as never);
  sdk.restorePurchases.mockResolvedValue({} as never);
});

// ---------------------------------------------------------------------------

describe('availability', () => {
  it('is unavailable when the native module is absent', () => {
    delete nativeModules.RNPurchases;
    __resetPurchasesForTests(sdk);
    expect(isBillingAvailable()).toBe(false);
  });

  it('is unavailable when no API key is configured', () => {
    env.revenueCatAndroidKey = '';
    env.revenueCatIosKey = '';
    expect(isBillingAvailable()).toBe(false);
  });

  it('is available with both a module and a key', () => {
    expect(isBillingAvailable()).toBe(true);
  });
});

describe('no native module — nothing may throw', () => {
  beforeEach(() => {
    delete nativeModules.RNPurchases;
    __resetPurchasesForTests(sdk);
  });

  it('returns empty offers', async () => {
    expect(await getStoreOffers('u1')).toEqual({ monthly: null, annual: null });
  });

  it('reports purchase unavailable', async () => {
    const offer = { plan: 'monthly', priceString: 'x', trialDays: null, packageRef: {} } as StoreOffer;
    expect(await purchasePlan(offer, 'u1')).toEqual({ kind: 'unavailable' });
  });

  it('reports restore unavailable', async () => {
    expect(await restorePurchases('u1')).toEqual({ kind: 'unavailable' });
  });

  it('identify is a silent no-op', async () => {
    await expect(identifyPurchaser('u1')).resolves.toBeUndefined();
    expect(sdk.logIn).not.toHaveBeenCalled();
  });
});

describe('no API key — nothing may throw', () => {
  beforeEach(() => {
    env.revenueCatAndroidKey = '';
    env.revenueCatIosKey = '';
    __resetPurchasesForTests(sdk);
  });

  it('returns empty offers without configuring', async () => {
    expect(await getStoreOffers('u1')).toEqual({ monthly: null, annual: null });
    expect(sdk.configure).not.toHaveBeenCalled();
  });
});

describe('identity', () => {
  it('logs in with the account id so entitlement follows the account', async () => {
    await identifyPurchaser('user-1');
    expect(sdk.configure).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'goog_test', appUserID: 'user-1' }),
    );
    expect(sdk.logIn).toHaveBeenCalledWith('user-1');
  });

  it('logs out on sign-out so the next rider does not inherit a subscription', async () => {
    await identifyPurchaser(null);
    expect(sdk.logOut).toHaveBeenCalled();
    expect(sdk.logIn).not.toHaveBeenCalled();
  });

  it('never logs verbosely in production — receipts must not reach logcat', async () => {
    env.appEnv = 'production';
    await identifyPurchaser('user-1');
    expect(sdk.setLogLevel).toHaveBeenCalledWith('ERROR');
  });

  it('logs verbosely outside production', async () => {
    env.appEnv = 'development';
    await identifyPurchaser('user-1');
    expect(sdk.setLogLevel).toHaveBeenCalledWith('VERBOSE');
  });

  it('configures even when the SDK has no setLogLevel', async () => {
    // Logging is never load-bearing.
    const noLogger = { ...sdk, setLogLevel: undefined };
    __resetPurchasesForTests(noLogger);
    await identifyPurchaser('user-1');
    expect(sdk.configure).toHaveBeenCalled();
  });

  it('configures only once per process', async () => {
    await identifyPurchaser('user-1');
    await identifyPurchaser('user-1');
    expect(sdk.configure).toHaveBeenCalledTimes(1);
  });

  it('swallows a failing logIn — entitlement still comes from our server', async () => {
    sdk.logIn.mockRejectedValueOnce(new Error('network'));
    await expect(identifyPurchaser('user-1')).resolves.toBeUndefined();
  });
});

describe('offers', () => {
  it('maps monthly and annual packages', async () => {
    sdk.getOfferings.mockResolvedValue({
      current: { availablePackages: [pkg('MONTHLY', '3,00 €'), pkg('ANNUAL', '30,00 €')] },
    } as never);

    const offers = await getStoreOffers('u1');
    expect(offers.monthly).toMatchObject({ plan: 'monthly', priceString: '3,00 €' });
    expect(offers.annual).toMatchObject({ plan: 'annual', priceString: '30,00 €' });
  });

  it('uses the store price string verbatim — never a computed one', async () => {
    sdk.getOfferings.mockResolvedValue({
      current: { availablePackages: [pkg('MONTHLY', 'RON 14,99')] },
    } as never);
    expect((await getStoreOffers('u1')).monthly?.priceString).toBe('RON 14,99');
  });

  it('reads a day-based trial', async () => {
    sdk.getOfferings.mockResolvedValue({
      current: {
        availablePackages: [
          pkg('MONTHLY', '3,00 €', { periodUnit: 'DAY', periodNumberOfUnits: 7 }),
        ],
      },
    } as never);
    expect((await getStoreOffers('u1')).monthly?.trialDays).toBe(7);
  });

  it('normalises a week-based trial to days', async () => {
    sdk.getOfferings.mockResolvedValue({
      current: {
        availablePackages: [
          pkg('MONTHLY', '3,00 €', { periodUnit: 'WEEK', periodNumberOfUnits: 1 }),
        ],
      },
    } as never);
    expect((await getStoreOffers('u1')).monthly?.trialDays).toBe(7);
  });

  it('reports no trial when the offer has none', async () => {
    sdk.getOfferings.mockResolvedValue({
      current: { availablePackages: [pkg('MONTHLY', '3,00 €')] },
    } as never);
    expect((await getStoreOffers('u1')).monthly?.trialDays).toBeNull();
  });

  it('drops a package with no price rather than rendering a blank button', async () => {
    sdk.getOfferings.mockResolvedValue({
      current: { availablePackages: [pkg('MONTHLY', '')] },
    } as never);
    expect((await getStoreOffers('u1')).monthly).toBeNull();
  });

  it('returns empty when there is no current offering', async () => {
    expect(await getStoreOffers('u1')).toEqual({ monthly: null, annual: null });
  });

  it('returns empty rather than throwing when the store call fails', async () => {
    sdk.getOfferings.mockRejectedValue(new Error('offline'));
    expect(await getStoreOffers('u1')).toEqual({ monthly: null, annual: null });
  });
});

describe('purchase', () => {
  const offer = {
    plan: 'monthly',
    priceString: '3,00 €',
    trialDays: 7,
    packageRef: { id: 'pkg' },
  } as StoreOffer;

  it('reports success on a completed purchase', async () => {
    expect(await purchasePlan(offer, 'u1')).toEqual({ kind: 'purchased' });
    expect(sdk.purchasePackage).toHaveBeenCalledWith({ id: 'pkg' });
  });

  it('reports success even when the entitlement is not active yet', async () => {
    // The webhook is the source of truth and may land a moment later. Telling
    // the rider their payment failed here would be wrong and alarming.
    sdk.purchasePackage.mockResolvedValue({ customerInfo: { entitlements: { active: {} } } } as never);
    expect(await purchasePlan(offer, 'u1')).toEqual({ kind: 'purchased' });
  });

  it('reports a cancellation distinctly — never as an error', async () => {
    sdk.purchasePackage.mockRejectedValue({ userCancelled: true });
    expect(await purchasePlan(offer, 'u1')).toEqual({ kind: 'cancelled' });
  });

  it('reports a real failure with its message', async () => {
    sdk.purchasePackage.mockRejectedValue({ message: 'card declined' });
    expect(await purchasePlan(offer, 'u1')).toEqual({
      kind: 'failed',
      message: 'card declined',
    });
  });

  it('always has a message even when the SDK gives none', async () => {
    sdk.purchasePackage.mockRejectedValue({});
    expect(await purchasePlan(offer, 'u1')).toMatchObject({ kind: 'failed' });
  });
});

describe('restore', () => {
  it('reports restored when the account owns Plus', async () => {
    sdk.restorePurchases.mockResolvedValue({
      entitlements: { active: { pedal_plus: {} } },
    } as never);
    expect(await restorePurchases('u1')).toEqual({ kind: 'restored' });
  });

  it('distinguishes "nothing to restore" from a failure', async () => {
    // A rider with no subscription pressed restore. That is not an error and
    // must not be shown as one.
    sdk.restorePurchases.mockResolvedValue({ entitlements: { active: {} } } as never);
    expect(await restorePurchases('u1')).toEqual({ kind: 'nothing_to_restore' });
  });

  it('does not mistake another entitlement for Plus', async () => {
    sdk.restorePurchases.mockResolvedValue({
      entitlements: { active: { something_else: {} } },
    } as never);
    expect(await restorePurchases('u1')).toEqual({ kind: 'nothing_to_restore' });
  });

  it('reports a failure with its message', async () => {
    sdk.restorePurchases.mockRejectedValue({ message: 'no network' });
    expect(await restorePurchases('u1')).toEqual({ kind: 'failed', message: 'no network' });
  });
});
