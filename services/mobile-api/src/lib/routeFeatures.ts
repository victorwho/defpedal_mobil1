import type {
  Route,
  RouteFeature,
  RouteFeatureTier,
  RouteFeatureType,
} from '@defensivepedal/core';
import { haversineDistance } from '@defensivepedal/core';

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
 * this is effectively OSRM-only. That's acceptable — fast routes are a
 * fallback surface and tunnel/bridge awareness is non-critical there.
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
 * — not a controlled 4-way intersection). Excludes depart/arrive maneuvers.
 *
 * This is heuristic. The real signal we want is "uncontrolled left across
 * opposing traffic" — i.e. no traffic signal, no protected turn lane. Until
 * OSRM exposes signal metadata on the bicycle profile, bearing count is the
 * best proxy we have: 4-way intersections are far more likely to be
 * signalized or stop-controlled than 3-way side streets.
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
      // 4-way or larger: likely controlled — skip.
      if (bearingCount >= 4) continue;

      const [lon, lat] = maneuver.location;
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
 * Traffic signals: stub. OSRM's standard bicycle profile doesn't expose
 * `traffic_signals` on intersection objects, and Mapbox Directions doesn't
 * either on the cycling profile. The data source for this is a future
 * Supabase table (`osm_road_features`) keyed by OSM node ID — populated
 * from a periodic OSM extract — that we'd join against
 * `leg.annotation.nodes` to flag signalized intersections.
 *
 * Wired as a separate extractor so the integration point is obvious when
 * the data layer ships; mobile consumers can rely on the feature surfacing
 * automatically.
 */
const extractTrafficSignals = (
  _route: Route,
  _routeIndex: number,
  _index: RouteCoordIndex,
): RouteFeature[] => [];

/**
 * Railway crossings: stub. Same data-source story as `extractTrafficSignals`.
 * Will be populated from `osm_road_features` where `tag = 'railway_crossing'`.
 */
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
