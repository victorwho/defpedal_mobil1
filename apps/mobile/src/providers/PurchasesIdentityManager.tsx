/**
 * Keeps the store SDK's identity in step with the signed-in account.
 *
 * Without this, entitlement follows the DEVICE: a second rider signing in on
 * the same phone inherits the first rider's subscription, and a purchase made
 * before sign-in is attributed to a RevenueCat anonymous id that the webhook
 * can never resolve back to an account (it reports `unattributable` and someone
 * has paid for nothing).
 *
 * Headless and best-effort. Entitlement itself always comes from our server, so
 * a failed identity sync costs attribution, never access.
 */
import { useEffect } from 'react';

import { identifyPurchaser } from '../lib/purchases';
import { useAuthSession } from './AuthSessionProvider';

export const PurchasesIdentityManager = () => {
  const { user } = useAuthSession();

  useEffect(() => {
    void identifyPurchaser(user?.id ?? null);
  }, [user?.id]);

  return null;
};
