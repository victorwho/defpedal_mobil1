/**
 * Sesizări — the hand-off to civia.ro.
 *
 * Flow (one tap, no preview sheet):
 *   1. compose the Romanian petition paragraph (pure, core)
 *   2. copy it to the clipboard
 *   3. queue the server record
 *   4. Alert → the browser opens from the OK handler
 *
 * Step 4's ordering is load-bearing. With no preview sheet, the Alert is the
 * ONLY moment the rider learns something is on their clipboard; opening the
 * browser from `onPress` guarantees it was read. This mirrors `useShareCard`,
 * which does the same for the Play Store link.
 *
 * The composed text is ALWAYS Romanian regardless of UI locale — it is
 * addressed to a Romanian public authority. UI chrome is localized; the
 * petition is not.
 */
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import {
  buildCiviaUrl,
  composeSesizareText,
  isSesizareEligible,
  type Coordinate,
  type HazardType,
} from '@defensivepedal/core';

import { telemetry } from '../lib/telemetry';
import { useAppStore } from '../store/appStore';
import { useT } from './useTranslation';

export interface StartSesizareInput {
  readonly hazardType: HazardType;
  readonly coordinate: Coordinate;
  readonly address: string;
  /** Server hazard id when known — absent while the report is still queued. */
  readonly hazardId?: string;
  /** When the rider observed it. Defaults to now (armchair reports). */
  readonly observedAt?: string;
  /** Analytics label for where the CTA was tapped. */
  readonly surface: 'hazard_detail' | 'post_ride';
}

export interface UseSesizareResult {
  readonly startSesizare: (input: StartSesizareInput) => Promise<void>;
  /** True between the tap and the browser opening — disables the button. */
  readonly isStarting: boolean;
}

export const useSesizare = (): UseSesizareResult => {
  const t = useT();
  const baseUrl = useAppStore((state) => state.sesizariConfig.baseUrl);
  const enqueueMutation = useAppStore((state) => state.enqueueMutation);
  const [isStarting, setIsStarting] = useState(false);

  const startSesizare = useCallback(
    async (input: StartSesizareInput) => {
      if (isStarting) return;
      // Defence in depth — the caller gates on useSesizareAvailability, but a
      // petition for a hazard type no authority handles must never be sent.
      if (!isSesizareEligible(input.hazardType)) return;

      setIsStarting(true);
      try {
        const text = composeSesizareText({
          hazardType: input.hazardType,
          address: input.address,
          coordinate: input.coordinate,
          observedAt: input.observedAt ?? new Date().toISOString(),
        });

        // If the clipboard write fails there is nothing to paste, so bail
        // before opening a browser onto an empty form.
        try {
          await Clipboard.setStringAsync(text);
        } catch {
          Alert.alert(t('sesizare.clipboardFailedTitle'), t('sesizare.clipboardFailedBody'));
          return;
        }

        // Queued rather than posted directly: the record (and the badge that
        // hangs off it) must survive a flaky request. The drain loop owns
        // delivery from here.
        enqueueMutation('sesizare', {
          hazardId: input.hazardId,
          hazardType: input.hazardType,
          coordinate: input.coordinate,
          address: input.address,
        });

        telemetry.capture('sesizare_started', {
          hazard_type: input.hazardType,
          surface: input.surface,
          has_hazard_id: Boolean(input.hazardId),
        });

        Alert.alert(t('sesizare.copiedTitle'), t('sesizare.copiedBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('sesizare.openCivia'),
            onPress: () => {
              void WebBrowser.openBrowserAsync(buildCiviaUrl(baseUrl)).catch(() => {
                // An in-app browser that refuses to open is not worth an error
                // dialog — the text is already on the clipboard and the record
                // is queued, so the rider can finish from any browser.
              });
            },
          },
        ]);
      } finally {
        setIsStarting(false);
      }
    },
    [baseUrl, enqueueMutation, isStarting, t],
  );

  return { startSesizare, isStarting };
};
