/**
 * useExportRouteGpx — builds a GPX 1.1 file from the previewed route and
 * hands it to the system share sheet (save to Files/Drive, email it, or
 * open it in Garmin Connect / Strava / Komoot).
 *
 * Fully client-side: the polyline is already in memory, so unlike the
 * link-share flow this works offline.
 *
 * Mirrors `useShareRide`'s surface (exportGpx / isExporting / toastMessage /
 * consumeToast) so screens wire it the same way.
 */
import { useCallback, useState } from 'react';
// Static (not dynamic) import of expo-file-system — dynamic `await import()`
// fails silently in Hermes release bytecode on this project (see error log /
// impact-summary bug). Legacy API matches the rest of the codebase.
import * as FileSystem from 'expo-file-system/legacy';

import type { Coordinate, RouteOption } from '@defensivepedal/core';
import { decodePolyline, downsampleCoordinates } from '@defensivepedal/core';

import { buildRouteGpx, type GpxWaypoint } from '../lib/gpx-export';
import { shareFile } from '../lib/shareImage';
import { useT } from './useTranslation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportRouteGpxInput {
  readonly route: RouteOption;
  /** Actual route start (the preview origin, honoring a custom start override). */
  readonly origin: Coordinate;
  readonly destination: Coordinate;
  readonly waypoints?: readonly Coordinate[];
}

export type ExportRouteGpxResult =
  | { exported: true; fileUri: string }
  | { exported: false; reason: 'invalid_route' | 'unavailable' | 'error' };

export interface UseExportRouteGpxReturn {
  readonly exportGpx: (input: ExportRouteGpxInput) => Promise<ExportRouteGpxResult>;
  readonly isExporting: boolean;
  readonly toastMessage: string | null;
  readonly consumeToast: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Same 12k cap the elevation/risk uploads use (`MAX_RISK_GEOMETRY_POINTS`).
 * Keeps the file a sane size AND — because `route.elevationProfile` was
 * fetched for `downsampleCoordinates(decoded, 12_000)` of the same geometry —
 * keeps coordinates and elevations 1:1 so `<ele>` attaches per point.
 */
const MAX_GPX_POINTS = 12_000;
const GPX_MIME_TYPE = 'application/gpx+xml';
const GPX_UTI = 'com.topografix.gpx';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useExportRouteGpx(): UseExportRouteGpxReturn {
  const t = useT();

  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const consumeToast = useCallback(() => {
    setToastMessage(null);
  }, []);

  const exportGpx = useCallback<UseExportRouteGpxReturn['exportGpx']>(
    async (input) => {
      setIsExporting(true);

      try {
        const decoded = decodePolyline(input.route.geometryPolyline6);
        if (decoded.length < 2) {
          setToastMessage(t('preview.exportGpxFailed'));
          return { exported: false, reason: 'invalid_route' };
        }

        const coordinates = downsampleCoordinates(decoded, MAX_GPX_POINTS);

        const waypoints: GpxWaypoint[] = [
          {
            lat: input.origin.lat,
            lon: input.origin.lon,
            name: t('preview.gpxStart'),
          },
          ...(input.waypoints ?? []).map((wpt, index) => ({
            lat: wpt.lat,
            lon: wpt.lon,
            name: `${t('preview.gpxVia')} ${index + 1}`,
          })),
          {
            lat: input.destination.lat,
            lon: input.destination.lon,
            name: t('preview.gpxDestination'),
          },
        ];

        const gpx = buildRouteGpx({
          name: t('preview.gpxRouteName'),
          coordinates,
          elevations: input.route.elevationProfile,
          waypoints,
          time: new Date().toISOString(),
        });

        const cacheDir = FileSystem.cacheDirectory;
        if (!cacheDir) {
          setToastMessage(t('preview.exportGpxFailed'));
          return { exported: false, reason: 'unavailable' };
        }

        const fileUri = `${cacheDir}defensive-pedal-route-${Date.now()}.gpx`;
        await FileSystem.writeAsStringAsync(fileUri, gpx);

        const shared = await shareFile(fileUri, {
          mimeType: GPX_MIME_TYPE,
          dialogTitle: t('preview.exportGpxDialogTitle'),
          uti: GPX_UTI,
        });

        if (!shared) {
          setToastMessage(t('preview.exportGpxFailed'));
          return { exported: false, reason: 'unavailable' };
        }

        return { exported: true, fileUri };
      } catch (error: unknown) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : t('preview.exportGpxFailed');
        setToastMessage(message);
        return { exported: false, reason: 'error' };
      } finally {
        setIsExporting(false);
      }
    },
    [t],
  );

  return { exportGpx, isExporting, toastMessage, consumeToast };
}
