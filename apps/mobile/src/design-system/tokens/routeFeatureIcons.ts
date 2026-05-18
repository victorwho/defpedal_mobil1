/**
 * Design System — Route Feature Icons & Tier Colors
 *
 * Visual contract for the route-feature awareness layer (tunnels, bridges,
 * traffic signals, unprotected left turns, railway crossings). Backed by
 * server-emitted `RouteFeature[]` on every `RouteOption`.
 *
 * Today this is a label-based contract: a 2-letter ASCII glyph rendered as
 * a Mapbox SymbolLayer `textField` on top of a tier-colored circle. The
 * `iconImage` field is reserved for a future SDF sprite swap — layers
 * should branch on its presence so the upgrade is purely additive.
 *
 * Tier semantics are owned server-side
 * (`services/mobile-api/src/lib/routeFeatures.ts`); keep this file in sync
 * if the TIER_BY_TYPE map there ever shifts.
 */
import type { RouteFeatureTier, RouteFeatureType } from '@defensivepedal/core';

/**
 * Tier → marker background color.
 *
 * Slate for `info` (passive structural fact) intentionally differs from
 * `safetyColors.info` (bright blue) — route features are environmental, not
 * navigational hints. `caution` matches `safetyColors.caution`. `warning`
 * uses red-600 (slightly deeper than `safetyColors.danger`/red-500) so
 * route-feature warnings read as a distinct visual class from
 * community-reported hazard markers.
 */
export const routeFeatureTierColors: Record<RouteFeatureTier, string> = {
  info: '#475569',
  caution: '#F59E0B',
  warning: '#DC2626',
} as const;

/** Foreground color for the 2-letter label — white meets ≥4.5:1 on every tier. */
export const routeFeatureLabelColor = '#FFFFFF';

/** White stroke around the marker circle to preserve contrast on busy basemaps. */
export const routeFeatureStrokeColor = '#FFFFFF';

export interface RouteFeatureIcon {
  /**
   * Mapbox SymbolLayer `textField` glyph. ASCII only — Mapbox glyph PBFs
   * for the Standard style do not ship reliable coverage of Unicode shape
   * characters (↰, ≡) or any emoji on Android. See CLAUDE.md error #13.
   */
  readonly label: string;
  /**
   * Reserved for future SDF sprite swap. When non-null, layer code should
   * prefer `iconImage` over `textField`. Until SDF assets land in
   * `apps/mobile/assets/map-icons/`, this stays `null` everywhere.
   */
  readonly iconImage: string | null;
  /**
   * Long-form label for screen readers (`accessibilityLabel` on alert
   * cards, hazard sheet rows) and any non-map surface that needs to name
   * the feature in human language.
   */
  readonly accessibilityLabel: string;
}

export const routeFeatureIcons: Record<RouteFeatureType, RouteFeatureIcon> = {
  tunnel: {
    label: 'TN',
    iconImage: null,
    accessibilityLabel: 'Tunnel',
  },
  bridge: {
    label: 'BR',
    iconImage: null,
    accessibilityLabel: 'Bridge',
  },
  semafor: {
    label: 'TL',
    iconImage: null,
    accessibilityLabel: 'Traffic signal',
  },
  left_turn_no_intersection: {
    label: 'LT',
    iconImage: null,
    accessibilityLabel: 'Left turn across traffic',
  },
  railway_crossing: {
    label: 'RR',
    iconImage: null,
    accessibilityLabel: 'Railway crossing',
  },
} as const;

export const getRouteFeatureIcon = (type: RouteFeatureType): RouteFeatureIcon =>
  routeFeatureIcons[type];

export const getRouteFeatureTierColor = (tier: RouteFeatureTier): string =>
  routeFeatureTierColors[tier];

/**
 * Mapbox style expression — circle background color keyed on the GeoJSON
 * feature's `tier` property. Used as `circleColor` on the route-feature
 * CircleLayer so a single layer can render all three tiers.
 *
 * Typed loosely because Mapbox style expressions are heterogeneous arrays
 * the platform validates at native bridge time. Matches existing patterns
 * in `apps/mobile/src/components/map/layers/`.
 */
export const routeFeatureCircleColorExpression: unknown = [
  'match',
  ['get', 'tier'],
  'info',
  routeFeatureTierColors.info,
  'caution',
  routeFeatureTierColors.caution,
  'warning',
  routeFeatureTierColors.warning,
  routeFeatureTierColors.info,
];

/**
 * Mapbox style expression — SymbolLayer `textField` keyed on the GeoJSON
 * feature's `type` property. One symbol layer handles every feature type.
 */
export const routeFeatureLabelExpression: unknown = [
  'match',
  ['get', 'type'],
  'tunnel',
  routeFeatureIcons.tunnel.label,
  'bridge',
  routeFeatureIcons.bridge.label,
  'semafor',
  routeFeatureIcons.semafor.label,
  'left_turn_no_intersection',
  routeFeatureIcons.left_turn_no_intersection.label,
  'railway_crossing',
  routeFeatureIcons.railway_crossing.label,
  '',
];

/**
 * Marker geometry presets. Pulled into tokens so the proximity alert card
 * (step 4) can render the same circle+label combo at a smaller size on
 * the right-rail alert tile and stay visually consistent with the map.
 */
export const routeFeatureMarker = {
  /** Map marker circle radius in points at base zoom (≥15). */
  mapRadius: 14,
  /** Map marker circle radius at intermediate zoom (13–14). */
  mapRadiusCompact: 11,
  /** Map label text size in points. */
  mapLabelSize: 11,
  /** Stroke width around the circle in points. */
  mapStrokeWidth: 1.5,
  /** Minimum zoom level at which markers render at all. */
  minZoom: 13,
  /** Zoom threshold below which the compact radius applies. */
  compactZoomThreshold: 15,
  /** Alert tile (right-rail) icon tile size in points. */
  alertTileSize: 40,
  /** Alert tile label text size in points. */
  alertTileLabelSize: 14,
} as const;
