/**
 * useExportSavedRouteGpx — exports a SAVED route as GPX.
 *
 * A saved route stores only its parameters (origin/destination/waypoints/
 * mode/flags), not the geometry — so unlike the route-preview export this
 * must calculate the route first via the client-side routing pipeline
 * (`mobileApi.previewRoute` → OSRM/Mapbox, which also enriches with the
 * elevation profile). That fetch needs connectivity; export is gated on
 * `isOnline` with a dedicated toast.
 *
 * Composes `useExportRouteGpx` for the build/write/share tail so the GPX
 * content is identical to a preview export of the same route. The saved
 * route's user-given name becomes the course name inside the file.
 */
import { useCallback, useState } from 'react';

import type { SavedRoute } from '@defensivepedal/core';

import { mobileApi } from '../lib/api';
import { useConnectivity } from '../providers/ConnectivityMonitor';
import { useAppStore } from '../store/appStore';
import { useExportRouteGpx, type ExportRouteGpxResult } from './useExportRouteGpx';
import { useT } from './useTranslation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportSavedRouteGpxResult =
  | ExportRouteGpxResult
  | { exported: false; reason: 'offline' | 'fetch_failed' };

export interface UseExportSavedRouteGpxReturn {
  readonly exportSavedRoute: (saved: SavedRoute) => Promise<ExportSavedRouteGpxResult>;
  /** The id of the saved route currently exporting, for per-row spinners. */
  readonly exportingRouteId: string | null;
  readonly toastMessage: string | null;
  readonly consumeToast: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useExportSavedRouteGpx(): UseExportSavedRouteGpxReturn {
  const t = useT();
  const { isOnline } = useConnectivity();
  const locale = useAppStore((state) => state.locale);

  const {
    exportGpx,
    toastMessage: exportToastMessage,
    consumeToast: consumeExportToast,
  } = useExportRouteGpx();

  const [exportingRouteId, setExportingRouteId] = useState<string | null>(null);
  const [fetchToastMessage, setFetchToastMessage] = useState<string | null>(null);

  // Single toast surface for callers — fetch-stage failures take precedence,
  // export-stage failures come from the composed hook.
  const toastMessage = fetchToastMessage ?? exportToastMessage;
  const consumeToast = useCallback(() => {
    setFetchToastMessage(null);
    consumeExportToast();
  }, [consumeExportToast]);

  const exportSavedRoute = useCallback<
    UseExportSavedRouteGpxReturn['exportSavedRoute']
  >(
    async (saved) => {
      if (!isOnline) {
        setFetchToastMessage(t('preview.exportGpxOffline'));
        return { exported: false, reason: 'offline' };
      }

      setExportingRouteId(saved.id);

      try {
        const preview = await mobileApi.previewRoute({
          origin: saved.origin,
          destination: saved.destination,
          waypoints: saved.waypoints,
          mode: saved.mode,
          avoidUnpaved: saved.avoidUnpaved,
          avoidHills: saved.avoidHills,
          locale,
        });

        const route = preview.routes[0];
        if (!route) {
          setFetchToastMessage(t('preview.exportGpxFailed'));
          return { exported: false, reason: 'fetch_failed' };
        }

        return await exportGpx({
          route,
          origin: saved.origin,
          destination: saved.destination,
          waypoints: saved.waypoints,
          name: saved.name,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : t('preview.exportGpxFailed');
        setFetchToastMessage(message);
        return { exported: false, reason: 'fetch_failed' };
      } finally {
        setExportingRouteId(null);
      }
    },
    [isOnline, locale, exportGpx, t],
  );

  return { exportSavedRoute, exportingRouteId, toastMessage, consumeToast };
}
