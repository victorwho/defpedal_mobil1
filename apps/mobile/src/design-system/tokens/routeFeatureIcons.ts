/**
 * Design System — Route Feature Icons & Tier Colors
 *
 * Visual contract for the route-feature awareness layer (tunnels, bridges,
 * traffic signals, unprotected left turns, railway crossings). Backed by
 * server-emitted `RouteFeature[]` on every `RouteOption`.
 *
 * Icons are SDF PNGs at `apps/mobile/assets/map-icons/` — black-on-alpha
 * masters that Mapbox tints at render time via `iconColor`. The 2-letter
 * `label` field is retained as a screen-reader fallback and a
 * belt-and-suspenders glyph in case the sprite fails to load; both the
 * map layer and alert card prefer the PNG when present.
 *
 * Tier semantics are owned server-side
 * (`packages/core/src/routeFeatures.ts`); keep this file in sync if the
 * TIER_BY_TYPE map there ever shifts.
 */
import type { RouteFeatureTier, RouteFeatureType } from '@defensivepedal/core';

// ES `import` syntax (rather than `require()`) so Vitest can resolve the
// asset reference at bundle time without trying to parse the binary as JS.
// Metro accepts both forms for static-asset references.
import tunnelIcon from '../../../assets/map-icons/tunnel.png';
import bridgeIcon from '../../../assets/map-icons/bridge.png';
import semaforIcon from '../../../assets/map-icons/semafor.png';
import leftTurnIcon from '../../../assets/map-icons/left_turn.png';
import railwayIcon from '../../../assets/map-icons/railway_crossing.png';

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

/** Foreground tint for the SDF icon — white meets ≥4.5:1 on every tier. */
export const routeFeatureLabelColor = '#FFFFFF';

/** White stroke around the marker circle to preserve contrast on busy basemaps. */
export const routeFeatureStrokeColor = '#FFFFFF';

/**
 * Mapbox sprite name registered with `<Mapbox.Images>` in
 * `RouteFeatureLayer`. Kept in one place so the layer's `<Mapbox.Images>`
 * declaration and the `iconImage` style expression read off the same keys.
 */
export const routeFeatureSpriteNames: Record<RouteFeatureType, string> = {
  tunnel: 'route-feature-tunnel',
  bridge: 'route-feature-bridge',
  semafor: 'route-feature-semafor',
  left_turn_no_intersection: 'route-feature-left-turn',
  railway_crossing: 'route-feature-railway',
} as const;

export interface RouteFeatureIcon {
  /**
   * Short ASCII glyph used as a screen-reader-fallback render path if the
   * SDF sprite fails to load. Map and alert surfaces prefer `iconImage`.
   * Kept 2-character ASCII because Mapbox glyph PBFs for the Standard
   * style don't ship reliable Unicode shape coverage on Android
   * (CLAUDE.md error #13).
   */
  readonly label: string;
  /**
   * `require()`'d SDF PNG. Black-on-transparent at 96×96 master (+@2x +@3x),
   * tinted via `iconColor` on the Mapbox SymbolLayer and via `tintColor`
   * on the `Image` element in the alert card.
   */
  readonly iconImage: number;
  /**
   * Mapbox sprite key — the string passed to `<Mapbox.Images>` and matched
   * against in `iconImage` style expressions. Mirrors
   * `routeFeatureSpriteNames` so callers don't have to assemble the key.
   */
  readonly spriteName: string;
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
    iconImage: tunnelIcon,
    spriteName: routeFeatureSpriteNames.tunnel,
    accessibilityLabel: 'Tunnel',
  },
  bridge: {
    label: 'BR',
    iconImage: bridgeIcon,
    spriteName: routeFeatureSpriteNames.bridge,
    accessibilityLabel: 'Bridge',
  },
  semafor: {
    label: 'TL',
    iconImage: semaforIcon,
    spriteName: routeFeatureSpriteNames.semafor,
    accessibilityLabel: 'Traffic signal',
  },
  left_turn_no_intersection: {
    label: 'LT',
    iconImage: leftTurnIcon,
    spriteName: routeFeatureSpriteNames.left_turn_no_intersection,
    accessibilityLabel: 'Left turn across traffic',
  },
  railway_crossing: {
    label: 'RR',
    iconImage: railwayIcon,
    spriteName: routeFeatureSpriteNames.railway_crossing,
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
 * Mapbox style expression — SymbolLayer `iconImage` keyed on the GeoJSON
 * feature's `type` property. The image keys must match the names passed
 * to `<Mapbox.Images images={...} />` in `RouteFeatureLayer`.
 */
export const routeFeatureIconImageExpression: unknown = [
  'match',
  ['get', 'type'],
  'tunnel',
  routeFeatureSpriteNames.tunnel,
  'bridge',
  routeFeatureSpriteNames.bridge,
  'semafor',
  routeFeatureSpriteNames.semafor,
  'left_turn_no_intersection',
  routeFeatureSpriteNames.left_turn_no_intersection,
  'railway_crossing',
  routeFeatureSpriteNames.railway_crossing,
  '',
];

/**
 * Marker geometry presets. Pulled into tokens so the proximity alert card
 * can render the same circle+icon combo at a smaller size on the
 * bottom-right alert tile and stay visually consistent with the map.
 */
export const routeFeatureMarker = {
  /** Map marker circle radius in points at base zoom (≥15). */
  mapRadius: 14,
  /** Map marker circle radius at intermediate zoom (13–14). */
  mapRadiusCompact: 11,
  /**
   * On-map icon scale factor against the 96-px SDF source. 0.18 renders
   * the glyph at ~17 dp inside the 28-dp marker circle.
   */
  mapIconSize: 0.18,
  /** Compact-zoom icon scale (smaller glyph for the smaller circle). */
  mapIconSizeCompact: 0.14,
  /** Stroke width around the circle in points. */
  mapStrokeWidth: 1.5,
  /** Minimum zoom level at which markers render at all. */
  minZoom: 13,
  /** Zoom threshold below which the compact radius applies. */
  compactZoomThreshold: 15,
  /** Alert tile (bottom-right card) icon tile size in points. */
  alertTileSize: 40,
  /** Alert tile inner-icon size in points. */
  alertTileIconSize: 22,
} as const;
