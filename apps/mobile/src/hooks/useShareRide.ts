/**
 * useShareRide — orchestrates ride-share image capture + native share sheet.
 *
 * Flow:
 *   1. If offline, abort early (ride-share requires the Mapbox Static Images
 *      API to render the map). Surfaces an offline toast hint to the caller.
 *   2. Trim the coordinate polyline by the configured privacy radius so
 *      shared routes don't reveal home/work locations.
 *   3. Build the Mapbox Static Images URL for the map background.
 *   4. Build the share card React element, hand it to the off-screen capture
 *      host, and shoot a PNG.
 *   5. Hand the PNG to `shareImage` which drives `expo-sharing` +
 *      `expo-media-library`.
 *
 * Consumers get a simple `share(input)` API and an `isSharing` boolean for
 * button-disable states, plus a `toastMessage` + `consumeToast` pair that
 * callers can wire into any toast UI.
 */
import React, { useCallback, useState } from 'react';
// Use the legacy FileSystem API (cacheDirectory + downloadAsync).
// The new v55 API (Paths / File) works too, but legacy is simpler and is
// what the rest of the codebase targets.
import * as FileSystem from 'expo-file-system/legacy';

import {
  buildShareCaption,
  mapboxStaticImageUrl,
  trimPrivacyZone,
  type ShareCaptionInput,
} from '@defensivepedal/core';

// Phase 3 delivered RideShareCard in parallel — the import now resolves.
import { RideShareCard } from '../components/share/RideShareCard';

import { mobileEnv } from '../lib/env';
import { shareImage, type ShareImageResult } from '../lib/shareImage';
import { useConnectivity } from '../providers/ConnectivityMonitor';
import { useCaptureHost } from '../providers/OffScreenCaptureHost';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RideShareRiskSegment {
  readonly coords: [number, number][];
  readonly color: string;
}

export interface ShareRideInput {
  readonly coords: [number, number][];
  readonly riskSegments?: RideShareRiskSegment[];
  readonly distanceKm: number;
  readonly durationMinutes: number;
  readonly co2SavedKg: number;
  readonly safetyScore?: number;
  readonly microlivesGained?: number;
  readonly originLabel?: string;
  readonly destinationLabel?: string;
  readonly dateIso?: string;
}

export interface UseShareRideReturn {
  readonly share: (input: ShareRideInput) => Promise<ShareImageResult>;
  readonly isSharing: boolean;
  readonly toastMessage: string | null;
  readonly consumeToast: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIVACY_TRIM_METERS = 200;
const CAPTURE_SIZE = 1080;
// The card's map region is 1080 wide × 560 tall. Request matching pixels
// @2x for retina crispness (Mapbox Static Images accepts 2160×1120).
const MAP_IMAGE_WIDTH = 1080;
const MAP_IMAGE_HEIGHT = 560;
const OFFLINE_TOAST_MESSAGE = 'No connection — try again when online';

/**
 * Downloads the Mapbox static image PNG to the expo-file-system cache
 * directory and returns the local `file://` URI. Rendering from a local
 * file is the difference between a reliable capture and a black map: a
 * local file decodes synchronously from disk, whereas a remote URL is
 * still in-flight when `captureRef` snapshots the offscreen view.
 *
 * Uses static (not dynamic) `import` of `expo-file-system` — dynamic
 * `await import()` is known to fail silently in Hermes release bytecode
 * on this project (see error log / impact-summary bug).
 */
const downloadMapImage = async (url: string): Promise<string> => {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error('expo-file-system cacheDirectory unavailable');
  }
  const name = `share-map-${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`;
  const dest = `${cacheDir}${name}`;
  const res = await FileSystem.downloadAsync(url, dest);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`map image download failed (${res.status})`);
  }
  return res.uri;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useShareRide(): UseShareRideReturn {
  const { isOnline } = useConnectivity();
  const captureHost = useCaptureHost();

  const [isSharing, setIsSharing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const consumeToast = useCallback(() => {
    setToastMessage(null);
  }, []);

  const share = useCallback<UseShareRideReturn['share']>(
    async (input) => {
      if (!isOnline) {
        setToastMessage(OFFLINE_TOAST_MESSAGE);
        return { shared: false, savedToLibrary: false };
      }

      setIsSharing(true);

      try {
        // 1) Privacy trim — protects home/work endpoints.
        const trimmed = trimPrivacyZone(input.coords, PRIVACY_TRIM_METERS);

        // 2) Mapbox Static image URL for the map background.
        const mapImageUrl = mapboxStaticImageUrl({
          coords: trimmed,
          riskSegments: input.riskSegments,
          width: MAP_IMAGE_WIDTH,
          height: MAP_IMAGE_HEIGHT,
          retina: true,
          accessToken: mobileEnv.mapboxPublicToken,
        });

        // 2a) Download the remote image to the cache directory and hand the
        // local file:// URI to the share card. See `downloadMapImage`.
        // If download fails (network hiccup), fall back to the remote URL
        // — the user may get a blank map but the share still goes through.
        let localMapUri = mapImageUrl;
        let mapDownloadError: string | null = null;
        try {
          localMapUri = await downloadMapImage(mapImageUrl);
        } catch (e: unknown) {
          mapDownloadError =
            e instanceof Error ? e.message : 'map image download failed';
        }

        // 3) Render the share card off-screen to capture as PNG.
        const cardElement = React.createElement(RideShareCard, {
          mapImageUrl: localMapUri,
          distanceKm: input.distanceKm,
          durationMinutes: input.durationMinutes,
          co2SavedKg: input.co2SavedKg,
          safetyScore: input.safetyScore,
          microlivesGained: input.microlivesGained,
          originLabel: input.originLabel,
          destinationLabel: input.destinationLabel,
          dateIso: input.dateIso,
        });

        const fileUri = await captureHost.capture(cardElement, {
          width: CAPTURE_SIZE,
          height: CAPTURE_SIZE,
          // Local file:// images still take a few hundred ms to decode
          // a 2160x1120 PNG off disk and paint into the ImageView. 1s is
          // conservative but bulletproof for offscreen capture.
          settleMs: mapDownloadError ? 1500 : 1000,
        });

        // 4) Caption + share sheet + camera roll save.
        const captionInput: ShareCaptionInput = {
          type: 'ride',
          distanceKm: input.distanceKm,
          durationMinutes: input.durationMinutes,
          co2SavedKg: input.co2SavedKg,
          safetyScore: input.safetyScore,
          microlivesGained: input.microlivesGained,
        };
        const caption = buildShareCaption(captionInput);

        const result = await shareImage(fileUri, caption);
        return result;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unexpected share failure';
        setToastMessage(message);
        return { shared: false, savedToLibrary: false };
      } finally {
        setIsSharing(false);
      }
    },
    [captureHost, isOnline],
  );

  return { share, isSharing, toastMessage, consumeToast };
}
