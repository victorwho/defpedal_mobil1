import type { NearbyHazard, RouteFeature, RouteFeatureType } from './contracts';
import { haversineDistance } from './distance';

/**
 * Default proximity radius for hazard-vs-feature deduplication.
 *
 * Server-emitted route features are infrastructural (tunnel, bridge,
 * traffic signal, etc.); community-reported hazards are incidents. When a
 * `dangerous_intersection` hazard sits on top of the same junction we
 * already flagged as a `semafor`, the hazard wins — it's the more
 * actionable signal and carries community trust. 25 metres roughly covers
 * the footprint of a single junction or short bridge approach.
 */
export const HAZARD_DEDUP_RADIUS_METERS = 25;

/**
 * Returns the subset of `features` that have no hazard within
 * `radiusMeters`. O(features × hazards); safe up to a few hundred of each
 * — beyond that, switch to a spatial index. Stable order: input order is
 * preserved.
 */
export const dedupeRouteFeaturesAgainstHazards = (
  features: readonly RouteFeature[],
  hazards: readonly Pick<NearbyHazard, 'lat' | 'lon'>[],
  radiusMeters: number = HAZARD_DEDUP_RADIUS_METERS,
): RouteFeature[] => {
  if (features.length === 0 || hazards.length === 0) {
    return [...features];
  }

  return features.filter((feature) => {
    const featureLatLon: [number, number] = [feature.lat, feature.lon];
    for (const hazard of hazards) {
      const distance = haversineDistance(featureLatLon, [hazard.lat, hazard.lon]);
      if (distance <= radiusMeters) {
        return false;
      }
    }
    return true;
  });
};

// ──────────────────────────────────────────────────────────────────────────
// Proximity alert configuration
// ──────────────────────────────────────────────────────────────────────────

export interface RouteFeatureAlertConfig {
  /** Distance ahead at which the proximity card appears (meters). */
  readonly showAtMeters: number;
  /**
   * How many meters past the feature point the alert stays before dismissal
   * (covers GPS jitter and rider acceleration past a feature without a
   * sample landing exactly on it).
   */
  readonly dismissPastMeters: number;
  /**
   * Screen reader live-region politeness. `assertive` interrupts current
   * speech (railway, unprotected lefts). `polite` queues behind whatever
   * the reader is saying.
   */
  readonly a11yLiveRegion: 'polite' | 'assertive';
  /**
   * Whether to fire a haptic on first appearance. The mobile layer maps
   * this to `useHaptics().warning()` — uniform across all five types
   * because the semantic system already encodes "pay attention while
   * navigating". Differentiation by feature type would over-engineer the
   * haptic vocabulary.
   */
  readonly haptic: boolean;
}

export const ROUTE_FEATURE_ALERT_CONFIG: Record<
  RouteFeatureType,
  RouteFeatureAlertConfig
> = {
  tunnel: {
    showAtMeters: 200,
    dismissPastMeters: 10,
    a11yLiveRegion: 'polite',
    haptic: false,
  },
  bridge: {
    showAtMeters: 150,
    dismissPastMeters: 10,
    a11yLiveRegion: 'polite',
    haptic: true,
  },
  semafor: {
    showAtMeters: 100,
    dismissPastMeters: 10,
    a11yLiveRegion: 'polite',
    haptic: true,
  },
  left_turn_no_intersection: {
    showAtMeters: 200,
    dismissPastMeters: 10,
    a11yLiveRegion: 'assertive',
    haptic: true,
  },
  railway_crossing: {
    showAtMeters: 150,
    dismissPastMeters: 10,
    a11yLiveRegion: 'assertive',
    haptic: true,
  },
};

/** Maximum number of proximity alerts visible simultaneously. */
export const MAX_VISIBLE_FEATURE_ALERTS = 2;

export interface ApproachingFeature {
  readonly feature: RouteFeature;
  /**
   * Meters from the rider's current along-route position to the feature.
   * Positive = ahead, slightly negative = just passed (kept alive by
   * `dismissPastMeters`). Use `Math.max(0, …)` for display rounding.
   */
  readonly metersAhead: number;
  readonly config: RouteFeatureAlertConfig;
}

/**
 * Filter and rank features whose proximity warrants surfacing to the rider.
 * Pure — takes the rider's precomputed along-route distance, returns the
 * subset of features within each type's `showAtMeters` window (and not yet
 * past `dismissPastMeters`).
 *
 * Sorted closest-first by absolute meters ahead so the topmost alert is
 * always the most imminent.
 */
export const computeApproachingFeatures = (
  features: readonly RouteFeature[],
  riderDistanceAlongRouteMeters: number,
): ApproachingFeature[] => {
  const approaching: ApproachingFeature[] = [];
  for (const feature of features) {
    const config = ROUTE_FEATURE_ALERT_CONFIG[feature.type];
    const metersAhead =
      feature.distanceAlongRouteMeters - riderDistanceAlongRouteMeters;
    if (metersAhead < -config.dismissPastMeters) continue;
    if (metersAhead > config.showAtMeters) continue;
    approaching.push({ feature, metersAhead, config });
  }
  approaching.sort(
    (a, b) => Math.abs(a.metersAhead) - Math.abs(b.metersAhead),
  );
  return approaching;
};
