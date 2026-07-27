/**
 * useExportTripGpx — builds a GPX 1.1 file from a recorded trip (GPS trail
 * + planned route track) and hands it to the system share sheet.
 *
 * Fully client-side: the trip history item is already in memory, so this
 * works offline. Elevation arrays are optional — the trip detail screen
 * already fetches a profile for its chart and passes it through so the
 * exported track carries `<ele>` when available.
 *
 * Mirrors `useExportRouteGpx`'s surface (exportGpx / isExporting /
 * toastMessage / consumeToast).
 */
import { useCallback, useEffect, useState } from 'react';

import type { TripHistoryItem } from '@defensivepedal/core';

import { buildGpxString } from '../lib/gpx-export';
import { preloadGpxShare, writeAndShareGpx } from '../lib/gpx-share';
import { useT } from './useTranslation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportTripGpxInput {
  readonly trip: TripHistoryItem;
  /** Per-breadcrumb elevations; emitted only when 1:1 with the GPS trail. */
  readonly trailElevations?: readonly number[];
  /** Per-point elevations for the planned polyline; emitted only when 1:1. */
  readonly plannedElevations?: readonly number[];
}

export type ExportTripGpxResult =
  | { exported: true; fileUri: string }
  | { exported: false; reason: 'invalid_trip' | 'unavailable' | 'error' };

export interface UseExportTripGpxReturn {
  readonly exportGpx: (input: ExportTripGpxInput) => Promise<ExportTripGpxResult>;
  readonly isExporting: boolean;
  readonly toastMessage: string | null;
  readonly consumeToast: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useExportTripGpx(): UseExportTripGpxReturn {
  const t = useT();

  // Warm the share-sheet module at mount so the tap-to-sheet delay is the
  // file write alone, not dynamic module loading.
  useEffect(() => {
    preloadGpxShare();
  }, []);

  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const consumeToast = useCallback(() => {
    setToastMessage(null);
  }, []);

  const exportGpx = useCallback<UseExportTripGpxReturn['exportGpx']>(
    async (input) => {
      setIsExporting(true);

      try {
        const hasTrail = input.trip.gpsBreadcrumbs.length >= 2;
        if (!hasTrail && !input.trip.plannedRoutePolyline6) {
          setToastMessage(t('preview.exportGpxFailed'));
          return { exported: false, reason: 'invalid_trip' };
        }

        const gpx = buildGpxString(input.trip, {
          name: `${t('history.gpxRideName')} ${input.trip.startedAt.slice(0, 10)}`,
          trailElevations: input.trailElevations,
          plannedElevations: input.plannedElevations,
        });

        const result = await writeAndShareGpx(gpx, {
          fileBaseName: 'defensive-pedal-ride',
          dialogTitle: t('history.exportGpxDialogTitle'),
        });

        if (!result.ok) {
          setToastMessage(result.message ?? t('preview.exportGpxFailed'));
          return { exported: false, reason: result.reason };
        }

        return { exported: true, fileUri: result.fileUri };
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
