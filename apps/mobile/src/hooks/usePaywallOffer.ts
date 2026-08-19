/**
 * Everything a paywall surface needs to render and transact.
 *
 * Owns offer loading and the purchase/restore flow so each host screen stays a
 * few props wide. Offers are fetched only when a paywall is actually opened —
 * never on mount — so a rider who never taps upgrade makes no store call.
 *
 * Safe on a build with no billing configured: `getStoreOffers` returns empty,
 * the sheet renders its benefits with no purchase button, and nothing throws.
 * That is the current state everywhere until store products exist.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  getStoreOffers,
  purchasePlan,
  restorePurchases,
  type PurchaseOutcome,
  type PurchasePlan,
  type RestoreOutcome,
  type StoreOffers,
} from '../lib/purchases';
import { useAuthSession } from '../providers/AuthSessionProvider';

export interface UsePaywallOfferResult {
  readonly monthlyPrice?: string;
  readonly annualPrice?: string;
  readonly trialDays?: number;
  /** True while a store call is in flight — drives the CTA's disabled state. */
  readonly busy: boolean;
  readonly subscribe: (plan: PurchasePlan) => Promise<PurchaseOutcome>;
  readonly restore: () => Promise<RestoreOutcome>;
}

const EMPTY: StoreOffers = { monthly: null, annual: null };

/**
 * @param active Whether a paywall is currently open. Offers load on the first
 *               true and are not refetched while it stays open.
 */
export const usePaywallOffer = (active: boolean): UsePaywallOfferResult => {
  const { user } = useAuthSession();
  const userId = user?.id ?? null;

  const [offers, setOffers] = useState<StoreOffers>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    void getStoreOffers(userId).then((next) => {
      if (!cancelled) setOffers(next);
    });

    return () => {
      cancelled = true;
    };
  }, [active, userId]);

  const subscribe = useCallback(
    async (plan: PurchasePlan): Promise<PurchaseOutcome> => {
      const offer = plan === 'annual' ? offers.annual : offers.monthly;
      if (!offer) return { kind: 'unavailable' };

      setBusy(true);
      try {
        return await purchasePlan(offer, userId);
      } finally {
        setBusy(false);
      }
    },
    [offers, userId],
  );

  const restore = useCallback(async (): Promise<RestoreOutcome> => {
    setBusy(true);
    try {
      return await restorePurchases(userId);
    } finally {
      setBusy(false);
    }
  }, [userId]);

  return {
    monthlyPrice: offers.monthly?.priceString,
    annualPrice: offers.annual?.priceString,
    // The trial is a property of the offer, not of the tier — read it from
    // whichever plan carries one rather than hardcoding 7 days, so the copy can
    // never disagree with what the store will actually charge.
    trialDays: offers.monthly?.trialDays ?? offers.annual?.trialDays ?? undefined,
    busy,
    subscribe,
    restore,
  };
};
