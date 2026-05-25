/**
 * useShareCard — orchestrates card-based image capture + native share sheet.
 *
 * Unlike `useShareRide`, this hook does NOT gate on connectivity: card shares
 * render entirely from local state and pre-bundled assets, so there is no
 * network fetch that could fail offline.
 *
 * Flow:
 *   1. Capture the supplied React element (`input.card`) via the
 *      OffScreenCaptureHost → PNG file URI.
 *   2. Build the English caption from the plain data fields (the `card`
 *      element is NOT passed to the caption builder).
 *   3. Hand the PNG to `shareImage` which drives `expo-sharing` +
 *      `expo-media-library`.
 *
 * Consumers get a simple `share(input)` API and an `isSharing` boolean for
 * button-disable + loading-indicator states.
 */
import { useCallback, useState, type ReactElement } from 'react';
import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import {
  PLAY_STORE_URL,
  buildShareCaption,
  type ShareCaptionInput,
} from '@defensivepedal/core';

import { shareImage, type ShareImageResult } from '../lib/shareImage';
import { useCaptureHost } from '../providers/OffScreenCaptureHost';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShareCardInput =
  | {
      readonly type: 'milestone';
      readonly milestoneTitle: string;
      readonly milestoneValue: string;
      readonly card: ReactElement;
    }
  | {
      readonly type: 'badge';
      readonly badgeName: string;
      readonly tier?: string;
      readonly rarity?: string;
      readonly card: ReactElement;
    };

export interface UseShareCardReturn {
  readonly share: (input: ShareCardInput) => Promise<ShareImageResult>;
  readonly isSharing: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CAPTURE_SIZE = 1080;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strips the `card` field from the input and returns the caption-builder
 * payload. Keeps the type-narrowing tidy and makes the caption call obvious.
 */
function toCaptionInput(input: ShareCardInput): ShareCaptionInput {
  switch (input.type) {
    case 'milestone':
      return {
        type: 'milestone',
        milestoneTitle: input.milestoneTitle,
        milestoneValue: input.milestoneValue,
      };
    case 'badge':
      return {
        type: 'badge',
        badgeName: input.badgeName,
        tier: input.tier,
        rarity: input.rarity,
      };
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useShareCard(): UseShareCardReturn {
  const captureHost = useCaptureHost();

  const [isSharing, setIsSharing] = useState(false);

  const share = useCallback<UseShareCardReturn['share']>(
    async (input) => {
      setIsSharing(true);

      try {
        const fileUri = await captureHost.capture(input.card, {
          width: CAPTURE_SIZE,
          height: CAPTURE_SIZE,
        });

        const caption = buildShareCaption(toCaptionInput(input));

        const result = await shareImage(fileUri, caption);

        // Image-based shares through expo-sharing cannot carry body text to
        // the recipient — only the captured image reaches them. Copy the
        // Play Store URL to the clipboard so the sender can paste it as a
        // tappable link in the same chat. Alert is fire-and-forget so it
        // doesn't block the return.
        if (result.shared) {
          try {
            await Clipboard.setStringAsync(PLAY_STORE_URL);
            Alert.alert(
              'Play Store link copied',
              'Paste it after sending — image shares can\'t carry a tappable link.',
              [{ text: 'Got it' }],
              { cancelable: true },
            );
          } catch {
            // Clipboard write failure is silent — the burned-in URL on the
            // share image still gives the recipient a path.
          }
        }

        return result;
      } catch {
        return { shared: false, savedToLibrary: false };
      } finally {
        setIsSharing(false);
      }
    },
    [captureHost],
  );

  return { share, isSharing };
}
