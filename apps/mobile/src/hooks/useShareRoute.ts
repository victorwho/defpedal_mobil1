/**
 * useShareRoute — orchestrates route-share creation + native share sheet.
 *
 * Flow:
 *   1. If offline, abort early and surface the offline toast hint.
 *   2. POST the planned route payload to /v1/route-shares; on failure,
 *      surface the error message as a toast.
 *   3. On success, open the native Share sheet with the universal link
 *      + a short caption.
 *
 * Mirrors `useShareRide`'s shape (share / isSharing / toastMessage /
 * consumeToast) so callers can wire it in the same way.
 */
import { useCallback, useState } from 'react';
import { Share } from 'react-native';

import type { RouteOption } from '@defensivepedal/core';

import {
  mobileApi,
  type RouteShareCreatePayload,
  type RouteShareCreateResult,
  type RouteShareRiskSegment,
} from '../lib/api';
import { useConnectivity } from '../providers/ConnectivityMonitor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShareRouteInput = {
  /** The selected route option from the route preview. */
  readonly route: RouteOption;
  readonly origin: { readonly lat: number; readonly lon: number };
  readonly destination: { readonly lat: number; readonly lon: number };
  /** Matches the server-side routingMode enum. Flat = avoid hills. */
  readonly routingMode: 'safe' | 'fast' | 'flat';
  /** Optional human-readable destination for the caption. */
  readonly destinationLabel?: string;
  /**
   * Optional index-based risk segments for the web viewer's safety-colored
   * polyline. Shape: `{startIndex, endIndex, riskCategory}[]` over the
   * polyline coordinates. Slice 1 callers typically omit this — the web
   * viewer degrades to a single-color line and the stored payload gets an
   * empty array on the server side. Slice 5/6 will wire real index mapping.
   */
  readonly riskSegments?: readonly RouteShareRiskSegment[];
  /** Optional aggregate 0-100 safety score. Null when the route wasn't scored. */
  readonly safetyScore?: number | null;
};

export type ShareRouteResult =
  | { shared: true; dismissedAction: string | null; share: RouteShareCreateResult }
  | { shared: false; reason: 'offline' | 'error' | 'dismissed'; message?: string };

export type UseShareRouteReturn = {
  readonly share: (input: ShareRouteInput) => Promise<ShareRouteResult>;
  readonly isSharing: boolean;
  readonly toastMessage: string | null;
  readonly consumeToast: () => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OFFLINE_TOAST_MESSAGE = 'You are offline. Try again when connected.';
const GENERIC_ERROR_MESSAGE = 'Couldn\u2019t share this route. Try again.';

const buildShareCaption = (input: ShareRouteInput): string => {
  const km = (input.route.distanceMeters / 1000).toFixed(1);
  const label = input.destinationLabel?.trim();
  if (label) {
    return `Check out this ${km} km cycling route to ${label} on Defensive Pedal.`;
  }
  return `Check out this ${km} km cycling route on Defensive Pedal.`;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useShareRoute(): UseShareRouteReturn {
  const { isOnline } = useConnectivity();

  const [isSharing, setIsSharing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const consumeToast = useCallback(() => {
    setToastMessage(null);
  }, []);

  const share = useCallback<UseShareRouteReturn['share']>(
    async (input) => {
      if (!isOnline) {
        setToastMessage(OFFLINE_TOAST_MESSAGE);
        return { shared: false, reason: 'offline' };
      }

      setIsSharing(true);

      try {
        const payload: RouteShareCreatePayload = {
          source: 'planned',
          route: {
            origin: { lat: input.origin.lat, lon: input.origin.lon },
            destination: {
              lat: input.destination.lat,
              lon: input.destination.lon,
            },
            geometryPolyline6: input.route.geometryPolyline6,
            distanceMeters: input.route.distanceMeters,
            durationSeconds: input.route.durationSeconds,
            routingMode: input.routingMode,
            // Only spread optional fields when the caller provided them so
            // we don't ship undefined through to JSON.stringify.
            ...(input.riskSegments
              ? { riskSegments: [...input.riskSegments] }
              : {}),
            ...(input.safetyScore !== undefined
              ? { safetyScore: input.safetyScore }
              : {}),
          },
        };

        const created = await mobileApi.createRouteShare(payload);
        const caption = buildShareCaption(input);

        // Native share sheet. iOS prefers `url`; Android concatenates the
        // message. Passing both fields gives us the best behavior on both.
        const shareResult = await Share.share(
          {
            message: `${caption}\n${created.webUrl}`,
            url: created.webUrl,
            title: 'Share this route',
          },
          { dialogTitle: 'Share this route' },
        );

        if (shareResult.action === Share.dismissedAction) {
          return { shared: false, reason: 'dismissed' };
        }

        const activity =
          shareResult.action === Share.sharedAction
            ? shareResult.activityType ?? null
            : null;
        return { shared: true, dismissedAction: activity, share: created };
      } catch (error: unknown) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : GENERIC_ERROR_MESSAGE;
        setToastMessage(message);
        return { shared: false, reason: 'error', message };
      } finally {
        setIsSharing(false);
      }
    },
    [isOnline],
  );

  return { share, isSharing, toastMessage, consumeToast };
}
