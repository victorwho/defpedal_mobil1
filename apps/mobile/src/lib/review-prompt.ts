/**
 * Native Play Store review integration — the Stage 2 of the review prompt
 * funnel (Stage 1 is the custom sentiment card in
 * `design-system/organisms/ReviewPromptCard.tsx`).
 *
 * Platform split:
 *   - Android: open the Play Store listing directly via `Linking`. Google's
 *     in-app ReviewManager is intentionally NOT used — it only renders on
 *     Play-installed builds, is quota-limited, and resolves successfully even
 *     when it shows nothing, so the user often saw no review surface at all.
 *   - iOS: use the native SKStoreReview sheet (renders reliably, stays in-app),
 *     falling back to the App Store "write-review" page.
 *
 * On iOS we never call `expo-store-review` from a top-level import — the
 * underlying Expo native module (`ExpoStoreReview`) may be absent on tests,
 * old development builds that haven't been rebuilt since the module was added,
 * or any other host that doesn't autolink it. We follow the Expo Modules API
 * probe pattern from `expoNativeModule.ts` (error-log #21): probe with
 * `hasExpoNativeModule('ExpoStoreReview')`, then lazy `require('expo-store-review')`
 * only if the probe passes.
 *
 * The return value is a discriminator so the caller can update Zustand and
 * telemetry uniformly regardless of which path actually fired.
 */
import { Linking, Platform } from 'react-native';

import { hasExpoNativeModule } from './expoNativeModule';

/**
 * Production Play Store listing (Android). We intentionally hardcode the
 * production package name rather than reading from `applicationId` —
 * preview/dev variants point at the same review pool as production for this
 * prompt. Users on a dev variant shouldn't even reach the Stage 2 button (the
 * card lives behind eligibility gates), but if they do, sending them to the
 * production listing is the safe default.
 *
 * `market://` opens the listing directly inside the Play Store app; the
 * `https://play.google.com/...` form is the fallback for devices without the
 * Play Store app (it opens in a browser, and Play app-links intercept it when
 * Play *is* present).
 */
const PLAY_STORE_PACKAGE = 'com.defensivepedal.mobile';
const PLAY_STORE_MARKET_URL = `market://details?id=${PLAY_STORE_PACKAGE}`;
const PLAY_STORE_REVIEW_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE}`;

/**
 * Numeric App Store app id (App Store Connect → App Information → "Apple ID").
 * Empty until the App Store Connect app record exists. While empty the iOS URL
 * fallback is skipped — the native SKStoreReviewController path still works, and
 * crucially we never send iOS users to the Play Store. Fill in once the record
 * is created, e.g. '6740123456'.
 */
const IOS_APP_STORE_APP_ID = '6778694757';
const IOS_APP_STORE_REVIEW_URL = IOS_APP_STORE_APP_ID
  ? `https://apps.apple.com/app/id${IOS_APP_STORE_APP_ID}?action=write-review`
  : null;

export type ReviewRequestResult =
  /** iOS native SKStoreReview sheet was successfully invoked. */
  | 'native'
  /** Store listing/page was opened via Linking (Android always; iOS fallback). */
  | 'fallback'
  /** Both paths failed — caller should NOT increment the "rated" counter. */
  | 'failed';

interface ExpoStoreReviewModule {
  isAvailableAsync(): Promise<boolean>;
  requestReview(): Promise<void>;
}

const loadStoreReviewModule = (): ExpoStoreReviewModule | null => {
  if (!hasExpoNativeModule('ExpoStoreReview')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-store-review') as ExpoStoreReviewModule;
  } catch {
    return null;
  }
};

/**
 * Open the iOS App Store "write a review" page (fallback when the native
 * SKStoreReview sheet is unavailable). Returns false if the App Store id isn't
 * set — we never send iOS users to the Play Store.
 */
const openAppStoreReviewPage = async (): Promise<boolean> => {
  if (!IOS_APP_STORE_REVIEW_URL) return false;
  try {
    await Linking.openURL(IOS_APP_STORE_REVIEW_URL);
    return true;
  } catch {
    return false;
  }
};

/**
 * Open the Android Play Store listing so the user can leave a rating/review.
 * Prefer the native Play Store app via `market://`; if that scheme can't be
 * handled (Play Store app absent), fall back to the https listing.
 *
 * We deliberately do NOT gate on `Linking.canOpenURL('market://...')` — on
 * Android 11+ it returns false unless `market` is declared in the manifest
 * `<queries>`, even when Play IS installed. We attempt the open and catch
 * failure instead.
 */
const openPlayStoreListing = async (): Promise<boolean> => {
  try {
    await Linking.openURL(PLAY_STORE_MARKET_URL);
    return true;
  } catch {
    // Play Store app missing / can't handle market:// — fall through to https.
  }
  try {
    await Linking.openURL(PLAY_STORE_REVIEW_URL);
    return true;
  } catch {
    return false;
  }
};

/**
 * Send the user to a review surface.
 *
 * Android: open the Play Store listing directly. We deliberately do NOT use
 * Google's in-app ReviewManager (`expo-store-review`) on Android here. It only
 * renders on Play-installed builds, is quota-limited (~once/month/user), and —
 * critically — `requestReview()` resolves *successfully even when it shows
 * nothing*, giving no signal to trigger a fallback. The net effect was that
 * tapping "rate" did nothing for most users (sideloaded/preview builds, or
 * over quota). Opening the listing guarantees the user actually reaches a
 * place to review.
 *
 * iOS: use the native SKStoreReview sheet (it renders reliably and keeps the
 * user in-app), with the App Store "write-review" page as a fallback.
 */
export async function requestPlayStoreReview(): Promise<ReviewRequestResult> {
  if (Platform.OS === 'android') {
    const opened = await openPlayStoreListing();
    return opened ? 'fallback' : 'failed';
  }

  const mod = loadStoreReviewModule();
  if (mod) {
    try {
      if (await mod.isAvailableAsync()) {
        await mod.requestReview();
        return 'native';
      }
    } catch {
      // Fall through to the URL fallback.
    }
  }

  const opened = await openAppStoreReviewPage();
  return opened ? 'fallback' : 'failed';
}
