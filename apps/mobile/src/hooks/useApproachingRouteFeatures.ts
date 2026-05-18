/**
 * Computes the route-feature proximity alerts that should be visible right
 * now in the navigation HUD.
 *
 * Subscribes to: `navigationSession`, `routePreview`, `selectedRouteId`,
 * `appState`, `showRouteFeatures` from Zustand. Re-runs every time the
 * navigation session updates (typically every GPS sample). Suppression
 * matches the design contract: silent unless actively navigating, route
 * feature toggle on, on-route, and GPS accuracy is good.
 */
import type { ApproachingFeature } from '@defensivepedal/core';
import {
  MAX_VISIBLE_FEATURE_ALERTS,
  computeApproachingFeatures,
} from '@defensivepedal/core';
import { useMemo } from 'react';
import { useShallow } from 'zustand/shallow';

import { useAppStore } from '../store/appStore';

/**
 * GPS accuracy threshold above which proximity alerts are suppressed.
 * Matches the threshold the ManeuverCard uses to flag a degraded fix —
 * keeping alerts off during bad GPS prevents spurious "tunnel ahead!"
 * triggers when the snapped position is jittering.
 */
const MAX_TOLERATED_GPS_ACCURACY_METERS = 25;

export interface UseApproachingRouteFeaturesResult {
  readonly visible: readonly ApproachingFeature[];
  readonly hiddenCount: number;
}

const EMPTY: UseApproachingRouteFeaturesResult = {
  visible: [],
  hiddenCount: 0,
};

export const useApproachingRouteFeatures =
  (): UseApproachingRouteFeaturesResult => {
    const {
      isNavigating,
      showRouteFeatures,
      navigationSession,
      routePreview,
      selectedRouteId,
    } = useAppStore(
      useShallow((state) => ({
        isNavigating: state.appState === 'NAVIGATING',
        showRouteFeatures: state.showRouteFeatures,
        navigationSession: state.navigationSession,
        routePreview: state.routePreview,
        selectedRouteId: state.selectedRouteId,
      })),
    );

    return useMemo<UseApproachingRouteFeaturesResult>(() => {
      if (!isNavigating || !showRouteFeatures || !navigationSession || !routePreview) {
        return EMPTY;
      }

      // Off-route or low-GPS suppresses alerts — same gate the existing
      // HazardAlert flow uses to avoid surfacing stale or jittery prompts.
      if (navigationSession.offRouteSince) return EMPTY;
      const accuracy = navigationSession.lastLocationAccuracyMeters;
      if (accuracy != null && accuracy > MAX_TOLERATED_GPS_ACCURACY_METERS) {
        return EMPTY;
      }

      const selectedRoute =
        routePreview.routes.find((r) => r.id === selectedRouteId) ??
        routePreview.routes[0];
      if (!selectedRoute || selectedRoute.routeFeatures.length === 0) {
        return EMPTY;
      }

      const remaining =
        navigationSession.remainingDistanceMeters ?? selectedRoute.distanceMeters;
      const riderDistanceAlongRouteMeters = Math.max(
        0,
        selectedRoute.distanceMeters - remaining,
      );

      const approaching = computeApproachingFeatures(
        selectedRoute.routeFeatures,
        riderDistanceAlongRouteMeters,
      );

      if (approaching.length <= MAX_VISIBLE_FEATURE_ALERTS) {
        return { visible: approaching, hiddenCount: 0 };
      }
      return {
        visible: approaching.slice(0, MAX_VISIBLE_FEATURE_ALERTS),
        hiddenCount: approaching.length - MAX_VISIBLE_FEATURE_ALERTS,
      };
    }, [
      isNavigating,
      showRouteFeatures,
      navigationSession,
      routePreview,
      selectedRouteId,
    ]);
  };
