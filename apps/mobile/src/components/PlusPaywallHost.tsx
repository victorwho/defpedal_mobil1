/**
 * PlusPaywallHost — the one place a screen opens the Pedal Plus paywall from.
 *
 * `PaywallSheet` only renders. Everything a host screen used to copy — loading
 * store offers, running the purchase and restore flows, polling for the
 * entitlement after a purchase, the manage-subscription link — lives here, so
 * the next entry point is one element rather than forty lines that drift.
 *
 * Also owns the two side effects every paywall must have:
 *  - funnel telemetry (`plus_paywall_viewed` / `plus_plan_tapped` /
 *    `plus_purchase_result`), tagged with WHERE the sheet was opened from, so
 *    a nudge can be judged by what it led to (docs/plans/pedal-plus-nudges.md
 *    §6 — report counts with their N; volume is far too low for rates);
 *  - retiring every unsolicited Plus nudge once the rider subscribes or
 *    restores. Selling Plus to someone who just bought it is the fastest way
 *    to make them regret it.
 */
import React, { useEffect, useRef } from 'react';
import { AppState, Linking, Platform, type AppStateStatus } from 'react-native';

import {
  PaywallSheet,
  type PaywallFocus,
  type PaywallPlan,
} from '../design-system/organisms/PaywallSheet';
import { usePaywallOffer } from '../hooks/usePaywallOffer';
import { usePremium } from '../hooks/usePremium';
import { awaitPremiumActivation, refreshPremiumEntitlement } from '../lib/premiumRefresh';
import { syncPurchasesAfterRedeem } from '../lib/purchases';
import { useAuthSession } from '../providers/AuthSessionProvider';
import { telemetry } from '../lib/telemetry';
import { useAppStore } from '../store/appStore';

/** Where the sheet was opened from. Telemetry only — never changes behaviour. */
export type PaywallSource =
  | 'profile'
  | 'bike_type'
  | 'locked_mode_planning'
  | 'locked_mode_preview'
  | 'modes_moved_notice'
  | 'ebike_post_ride'
  | 'cool_hot_day'
  | 'limit_card'
  | 'loop_quota'
  | 'loop_save_limit'
  | 'course_limit';

/** Stop waiting for the rider to come back from the store after this long. */
const REDEEM_RETURN_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Runs `onReturn` once, the first time the app is active again after leaving
 * the foreground. The App Store page and the Play Store backgrounds the app;
 * Apple's in-app sheet only makes it inactive. Either way the code has been
 * entered (or not) by the time we are active again.
 */
const onceBackInForeground = (onReturn: () => void): void => {
  let left = false;
  let done = false;
  const finish = () => {
    done = true;
    subscription.remove();
    clearTimeout(timer);
  };
  const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (done) return;
    if (state !== 'active') {
      left = true;
      return;
    }
    if (left) {
      finish();
      onReturn();
    }
  });
  const timer = setTimeout(() => {
    if (!done) finish();
  }, REDEEM_RETURN_TIMEOUT_MS);
};

const MANAGE_SUBSCRIPTION_URL =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions?package=com.defensivepedal.mobile';

export interface PlusPaywallHostProps {
  readonly visible: boolean;
  readonly onDismiss: () => void;
  readonly source: PaywallSource;
  readonly focus?: PaywallFocus;
  /** Coverage only — whether the rider's country has the shade graph. */
  readonly coolRoutingAvailable: boolean;
}

export const PlusPaywallHost: React.FC<PlusPaywallHostProps> = ({
  visible,
  onDismiss,
  source,
  focus,
  coolRoutingAvailable,
}) => {
  const premium = usePremium();
  const offer = usePaywallOffer(visible);
  const { user } = useAuthSession();
  const userId = user?.id ?? null;
  const retirePlusNudges = useAppStore((s) => s.retirePlusNudges);

  // One view event per opening, not per render.
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      telemetry.capture('plus_paywall_viewed', {
        source,
        focus: focus ?? null,
        subscribed: premium.isPlus,
      });
    }
    wasVisible.current = visible;
  }, [visible, source, focus, premium.isPlus]);

  const handleSubscribe = (plan: PaywallPlan) => {
    telemetry.capture('plus_plan_tapped', { plan, source });
    void offer.subscribe(plan).then((outcome) => {
      telemetry.capture('plus_purchase_result', { plan, source, outcome: outcome.kind });
      // A cancellation is the rider changing their mind — close quietly,
      // never as an error.
      if (outcome.kind === 'cancelled') {
        onDismiss();
        return;
      }
      if (outcome.kind === 'purchased') {
        retirePlusNudges();
        onDismiss();
        // The store returns as soon as it takes payment, but the entitlement
        // arrives via RevenueCat's webhook a moment later. Without this poll
        // the rider pays and sees no change until the next cold start.
        void awaitPremiumActivation();
      }
    });
  };

  const handleRestore = () => {
    void offer.restore().then((outcome) => {
      telemetry.capture('plus_restore_result', { source, outcome: outcome.kind });
      if (outcome.kind === 'restored') {
        retirePlusNudges();
        onDismiss();
        void refreshPremiumEntitlement();
      }
    });
  };

  const handleRedeem = () => {
    void offer.redeem().then((outcome) => {
      telemetry.capture('plus_redeem_opened', { source, outcome: outcome.kind });
      if (outcome.kind !== 'opened') return;
      onDismiss();
      // Neither store reports whether the code worked. When the rider comes
      // back, push the store's transactions to RevenueCat and poll our server
      // for the webhook's result, exactly as after a purchase.
      onceBackInForeground(() => {
        void syncPurchasesAfterRedeem(userId)
          .then(() => awaitPremiumActivation())
          .then((activated) => {
            telemetry.capture('plus_redeem_result', { source, activated });
            if (activated) retirePlusNudges();
          });
      });
    });
  };

  return (
    <PaywallSheet
      visible={visible}
      onDismiss={onDismiss}
      limits={premium.limits}
      coolRoutingAvailable={coolRoutingAvailable}
      focus={focus}
      monthlyPrice={offer.monthlyPrice}
      annualPrice={offer.annualPrice}
      annualPerMonth={offer.annualPerMonth}
      annualSavingsPercent={offer.annualSavingsPercent}
      trialDays={offer.trialDays}
      busy={offer.busy}
      isSubscribed={premium.isPlus}
      expiresAt={premium.entitlement.expiresAt}
      isInBillingRetry={premium.entitlement.isInBillingRetry}
      onManage={() => {
        void Linking.openURL(MANAGE_SUBSCRIPTION_URL);
      }}
      onSubscribe={handleSubscribe}
      onRestore={handleRestore}
      onRedeemCode={handleRedeem}
    />
  );
};
