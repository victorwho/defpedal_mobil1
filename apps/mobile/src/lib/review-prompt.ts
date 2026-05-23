/**
 * Native Play Store review integration — the Stage 2 of the review prompt
 * funnel (Stage 1 is the custom sentiment card in
 * `design-system/organisms/ReviewPromptCard.tsx`).
 *
 * We never call `expo-store-review` directly from a top-level import — the
 * underlying Expo native module (`ExpoStoreReview`) may be absent on tests,
 * old development builds that haven't been rebuilt since the module was
 * added, or any other host that doesn't autolink it. Following the same
 * Expo Modules API probe pattern documented in `expoNativeModule.ts` (and
 * error-log #21), we:
 *
 *   1. Probe with `hasExpoNativeModule('ExpoStoreReview')`.
 *   2. Lazy `require('expo-store-review')` only if the probe passes.
 *   3. Fall back to opening the Play Store listing via `Linking.openURL`
 *      so the user still has a path to leave a review.
 *
 * The return value is a discriminator so the caller can update Zustand and
 * telemetry uniformly regardless of which path actually fired.
 */
import { Linking } from 'react-native';

import { hasExpoNativeModule } from './expoNativeModule';

/**
 * Production Play Store listing. We intentionally hardcode the production
 * package name rather than reading from `applicationId` — preview/dev
 * variants point at the same review pool as production for this prompt.
 * Users on a dev variant shouldn't even reach the Stage 2 button (the card
 * lives behind eligibility gates), but if they do, sending them to the
 * production listing is the safe default.
 */
const PLAY_STORE_REVIEW_URL =
  'https://play.google.com/store/apps/details?id=com.defensivepedal.mobile';

export type ReviewRequestResult =
  /** Native Play in-app review sheet was successfully invoked. */
  | 'native'
  /** Native API unavailable; the Play Store URL was opened in a browser/Play. */
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

const openPlayStoreListing = async (): Promise<boolean> => {
  try {
    await Linking.openURL(PLAY_STORE_REVIEW_URL);
    return true;
  } catch {
    return false;
  }
};

/**
 * Try to open the native Play review sheet, with a Play Store URL fallback.
 *
 * Important: Google's ReviewManager throttles aggressively and gives no
 * signal about whether the sheet actually rendered. A success-resolution
 * from `requestReview()` only means "the API accepted the request" — not
 * "the user saw a sheet". This is by design; treat any non-throw as
 * "the user has been given the path" and don't re-prompt within the
 * cooldown window.
 */
export async function requestPlayStoreReview(): Promise<ReviewRequestResult> {
  const mod = loadStoreReviewModule();

  if (mod) {
    try {
      const available = await mod.isAvailableAsync();
      if (available) {
        await mod.requestReview();
        return 'native';
      }
    } catch {
      // Fall through to the URL fallback.
    }
  }

  const opened = await openPlayStoreListing();
  return opened ? 'fallback' : 'failed';
}
