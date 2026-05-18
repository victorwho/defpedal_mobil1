import type {
  NearbyHazard,
  RouteFeature,
  RouteFeatureTier,
  RouteFeatureType,
} from './contracts';
import { haversineDistance } from './distance';
import type { Route } from './types';

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

// ──────────────────────────────────────────────────────────────────────────
// Extraction from raw OSRM/Mapbox `Route` responses
// ──────────────────────────────────────────────────────────────────────────
//
// Lives in core (not mobile-api) because the mobile app fetches routes
// client-side via `mapbox-routing.ts` and never round-trips through the
// server's `normalizeRoutePreviewResponse`. The server's normalize.ts
// re-imports from here so both paths produce identical features.

const TIER_BY_TYPE: Record<RouteFeatureType, RouteFeatureTier> = {
  tunnel: 'info',
  bridge: 'caution',
  semafor: 'caution',
  left_turn_no_intersection: 'warning',
  railway_crossing: 'warning',
};

const featureId = (
  routeIndex: number,
  type: RouteFeatureType,
  ordinal: number,
): string => `route-${routeIndex}-feature-${type}-${ordinal}`;

interface RouteCoordIndex {
  readonly coords: readonly [number, number][];
  /** cumulativeAt[i] = meters from route start to vertex i. */
  readonly cumulativeAt: readonly number[];
}

const haversineEdge = (
  coords: readonly [number, number][],
  edgeIndex: number,
): number =>
  haversineDistance(
    [coords[edgeIndex][1], coords[edgeIndex][0]],
    [coords[edgeIndex + 1][1], coords[edgeIndex + 1][0]],
  );

const buildCoordIndex = (route: Route): RouteCoordIndex => {
  const coords = route.geometry.coordinates;
  const cumulativeAt = new Array<number>(coords.length).fill(0);

  let edgeIndex = 0;
  for (const leg of route.legs) {
    const distances = leg.annotation?.distance;
    const legEdgeCount =
      distances?.length ?? Math.max(0, coords.length - 1 - edgeIndex);

    for (let i = 0; i < legEdgeCount; i++) {
      const idx = edgeIndex + i;
      if (idx + 1 >= coords.length) break;
      const annotated = distances?.[i];
      const d =
        annotated !== undefined && Number.isFinite(annotated)
          ? annotated
          : haversineEdge(coords, idx);
      cumulativeAt[idx + 1] = cumulativeAt[idx] + d;
    }
    edgeIndex += legEdgeCount;
  }

  // Backfill any tail vertices that weren't covered by annotations (defensive).
  for (let i = 1; i < coords.length; i++) {
    if (cumulativeAt[i] === 0 && i > 0) {
      cumulativeAt[i] = cumulativeAt[i - 1] + haversineEdge(coords, i - 1);
    }
  }

  return { coords, cumulativeAt };
};

const snapTargetToCumulative = (
  index: RouteCoordIndex,
  target: readonly [number, number],
): { cumulative: number; vertexIndex: number } => {
  const { coords, cumulativeAt } = index;
  let bestDist = Infinity;
  let bestI = 0;
  const targetLatLon: [number, number] = [target[1], target[0]];
  for (let i = 0; i < coords.length; i++) {
    const d = haversineDistance(
      [coords[i][1], coords[i][0]],
      targetLatLon,
    );
    if (d < bestDist) {
      bestDist = d;
      bestI = i;
    }
  }
  return { cumulative: cumulativeAt[bestI], vertexIndex: bestI };
};

/**
 * Tunnels and bridges: contiguous runs of `'tunnel'` / `'bridge'` in
 * `leg.annotation.classes`. Each run collapses into one feature whose
 * `lengthMeters` is the sum of per-edge distances in the run.
 *
 * Mapbox Directions doesn't populate `classes` on the cycling profile, so
 * this is effectively OSRM-only.
 */
const extractZoneFeatures = (
  route: Route,
  routeIndex: number,
  index: RouteCoordIndex,
): RouteFeature[] => {
  const features: RouteFeature[] = [];
  const { coords, cumulativeAt } = index;

  let edgeIndex = 0;
  const ordinals: Record<'tunnel' | 'bridge', number> = { tunnel: 0, bridge: 0 };

  for (const leg of route.legs) {
    const classes = leg.annotation?.classes;
    if (!classes) {
      const distances = leg.annotation?.distance;
      const legEdgeCount =
        distances?.length ?? Math.max(0, coords.length - 1 - edgeIndex);
      edgeIndex += legEdgeCount;
      continue;
    }

    let i = 0;
    while (i < classes.length) {
      const cls = classes[i];
      if (cls === 'tunnel' || cls === 'bridge') {
        const runStartEdge = edgeIndex + i;
        const runStartCumulative = cumulativeAt[runStartEdge];
        let runEnd = i;
        while (runEnd < classes.length && classes[runEnd] === cls) {
          runEnd++;
        }
        const runEndEdge = Math.min(edgeIndex + runEnd, coords.length - 1);
        const lengthMeters = Math.max(
          0,
          cumulativeAt[runEndEdge] - runStartCumulative,
        );
        const startCoord = coords[runStartEdge];
        if (startCoord) {
          features.push({
            id: featureId(routeIndex, cls, ordinals[cls]++),
            type: cls,
            tier: TIER_BY_TYPE[cls],
            lon: startCoord[0],
            lat: startCoord[1],
            distanceAlongRouteMeters: runStartCumulative,
            lengthMeters,
          });
        }
        i = runEnd;
      } else {
        i++;
      }
    }

    edgeIndex += classes.length;
  }

  return features;
};

const LEFT_MODIFIERS = new Set(['left', 'sharp left', 'slight left']);
const LEFT_MANEUVER_TYPES = new Set(['turn', 'fork', 'end of road', 'on ramp']);

/**
 * Left-turn-without-intersection: any left maneuver where the intersection
 * has fewer than 4 distinct bearings (T-junction, side street, or driveway
 * — not a controlled 4-way intersection). Heuristic — see step-1 notes.
 */
const extractLeftTurns = (
  route: Route,
  routeIndex: number,
  index: RouteCoordIndex,
): RouteFeature[] => {
  const features: RouteFeature[] = [];
  let ordinal = 0;

  for (const leg of route.legs) {
    for (const step of leg.steps ?? []) {
      const maneuver = step.maneuver;
      if (!maneuver) continue;
      if (!LEFT_MANEUVER_TYPES.has(maneuver.type)) continue;

      const modifier = maneuver.modifier?.toLowerCase() ?? '';
      if (!LEFT_MODIFIERS.has(modifier)) continue;

      const intersection = step.intersections?.[0];
      const bearingCount = intersection?.bearings?.length ?? 0;
      if (bearingCount >= 4) continue;

      // OSRM always emits `maneuver.location`, but defend against malformed
      // fixtures / future profile changes.
      const location = maneuver.location;
      if (!Array.isArray(location) || location.length < 2) continue;
      const [lon, lat] = location;
      const { cumulative } = snapTargetToCumulative(index, [lon, lat]);

      features.push({
        id: featureId(routeIndex, 'left_turn_no_intersection', ordinal++),
        type: 'left_turn_no_intersection',
        tier: TIER_BY_TYPE.left_turn_no_intersection,
        lon,
        lat,
        distanceAlongRouteMeters: cumulative,
        lengthMeters: null,
      });
    }
  }

  return features;
};

/**
 * Traffic signals / railway crossings: stubs. Awaiting an OSM node-tag
 * lookup table that joins against `leg.annotation.nodes`.
 */
const extractTrafficSignals = (
  _route: Route,
  _routeIndex: number,
  _index: RouteCoordIndex,
): RouteFeature[] => [];

const extractRailwayCrossings = (
  _route: Route,
  _routeIndex: number,
  _index: RouteCoordIndex,
): RouteFeature[] => [];

export const extractRouteFeatures = (
  route: Route,
  routeIndex: number,
): RouteFeature[] => {
  if (!route.geometry?.coordinates?.length) return [];
  const index = buildCoordIndex(route);

  const features = [
    ...extractZoneFeatures(route, routeIndex, index),
    ...extractLeftTurns(route, routeIndex, index),
    ...extractTrafficSignals(route, routeIndex, index),
    ...extractRailwayCrossings(route, routeIndex, index),
  ];

  features.sort(
    (a, b) => a.distanceAlongRouteMeters - b.distanceAlongRouteMeters,
  );
  return features;
};
