import { encodePolyline } from './polyline';

/**
 * Minimal risk-segment shape used for rendering multi-colored path overlays
 * in a Mapbox Static image. This is intentionally narrower than the full
 * `RiskSegment` contract in `./contracts` (which also carries id, score,
 * category, and MultiLineString geometry). We keep it local to this module
 * so callers can build overlays from any source — not only API responses.
 */
export interface StaticImageRiskSegment {
  coords: [number, number][];
  color: string;
}

export interface MapboxStaticImageParams {
  coords: [number, number][];
  riskSegments?: StaticImageRiskSegment[];
  width: number;
  height: number;
  retina?: boolean;
  accessToken: string;
  styleId?: string;
}

const DEFAULT_STYLE_ID = 'mapbox/outdoors-v12';
const DEFAULT_ROUTE_COLOR = 'D4A843'; // brand yellow, no '#'
const START_PIN_COLOR = '2E7D32'; // green
const END_PIN_COLOR = 'C62828'; // red
const URL_LENGTH_THRESHOLD = 8192;
const STROKE_WIDTH = 6;

/**
 * Strips a leading '#' from a hex color (Mapbox overlays don't accept '#').
 */
const normaliseColor = (color: string): string =>
  color.startsWith('#') ? color.slice(1) : color;

/**
 * Builds a Mapbox Static Images API GeoJSON path overlay segment.
 *
 * Example output (before URL encoding):
 *   geojson({"type":"Feature","properties":{"stroke":"#D4A843","stroke-width":6},"geometry":{"type":"LineString","coordinates":[...]}})
 */
const buildGeoJsonOverlay = (
  coords: readonly [number, number][],
  colorHex: string,
): string => {
  const feature = {
    type: 'Feature',
    properties: {
      stroke: `#${normaliseColor(colorHex)}`,
      'stroke-width': STROKE_WIDTH,
    },
    geometry: {
      type: 'LineString',
      coordinates: coords.map(([lon, lat]) => [lon, lat]),
    },
  };

  return `geojson(${encodeURIComponent(JSON.stringify(feature))})`;
};

/**
 * Builds an encoded-polyline path overlay segment — a much more compact
 * encoding used when GeoJSON overlays would exceed URL length limits.
 *
 * IMPORTANT: Mapbox Static Images API decodes `path-…(encoded)` overlays
 * with **polyline precision 5** (Google polyline standard). Passing a
 * polyline6 string causes every coordinate to be scaled 10x, producing
 * out-of-range lat/lon values and a 422 error ("Overlay bounds are out
 * of range"), which in turn leaves the `<Image>` blank. Always encode at
 * precision 1e5 here.
 */
const MAPBOX_POLYLINE_PRECISION = 1e5;

const buildEncodedPathOverlay = (
  coords: readonly [number, number][],
  colorHex: string,
): string => {
  const encoded = encodePolyline(
    coords as [number, number][],
    MAPBOX_POLYLINE_PRECISION,
  );
  // path-{strokeWidth}+{color}({encoded})
  return `path-${STROKE_WIDTH}+${normaliseColor(colorHex)}(${encodeURIComponent(encoded)})`;
};

/**
 * Builds a pin-s marker overlay segment for Mapbox Static Images.
 *   pin-s+COLOR(lon,lat)
 */
const buildPinOverlay = (
  coord: readonly [number, number],
  colorHex: string,
): string => `pin-s+${normaliseColor(colorHex)}(${coord[0]},${coord[1]})`;

/**
 * Assembles the final URL given the overlay string.
 */
const assembleUrl = (
  overlaySegment: string,
  styleId: string,
  width: number,
  height: number,
  retina: boolean,
  accessToken: string,
): string => {
  const retinaSuffix = retina ? '@2x' : '';
  const sizeSegment = `${width}x${height}${retinaSuffix}`;
  return (
    `https://api.mapbox.com/styles/v1/${styleId}/static/` +
    `${overlaySegment}/auto/${sizeSegment}` +
    `?access_token=${encodeURIComponent(accessToken)}`
  );
};

/**
 * Returns a fully-formed URL for the Mapbox Static Images API that renders
 * a cycling route with start/end pins, auto-fit bounds, and (optionally)
 * colored risk segments instead of a single stroked line.
 *
 * Falls back from GeoJSON overlay to encoded-polyline overlay when the
 * resulting URL would exceed 8192 chars (Mapbox's practical limit).
 *
 * Throws if `coords` is empty. Does not mutate inputs.
 */
export function mapboxStaticImageUrl(params: MapboxStaticImageParams): string {
  const {
    coords,
    riskSegments,
    width,
    height,
    retina = false,
    accessToken,
    styleId = DEFAULT_STYLE_ID,
  } = params;

  if (!coords || coords.length === 0) {
    throw new Error('coords required');
  }

  const start = coords[0];
  const end = coords[coords.length - 1];

  // Build path overlay(s) first using GeoJSON for best visual quality
  let pathOverlays: string[];
  if (riskSegments && riskSegments.length > 0) {
    pathOverlays = riskSegments.map((seg) =>
      buildGeoJsonOverlay(seg.coords, seg.color),
    );
  } else {
    pathOverlays = [buildGeoJsonOverlay(coords, DEFAULT_ROUTE_COLOR)];
  }

  const pins = [
    buildPinOverlay(start, START_PIN_COLOR),
    buildPinOverlay(end, END_PIN_COLOR),
  ];

  // Overlay segments are joined with commas (no trailing comma).
  // Order matters visually: paths first (drawn under pins).
  const overlaySegment = [...pathOverlays, ...pins].join(',');

  const url = assembleUrl(
    overlaySegment,
    styleId,
    width,
    height,
    retina,
    accessToken,
  );

  if (url.length <= URL_LENGTH_THRESHOLD) return url;

  // Fallback: encoded-polyline overlay — much shorter.
  let fallbackOverlays: string[];
  if (riskSegments && riskSegments.length > 0) {
    fallbackOverlays = riskSegments.map((seg) =>
      buildEncodedPathOverlay(seg.coords, seg.color),
    );
  } else {
    fallbackOverlays = [buildEncodedPathOverlay(coords, DEFAULT_ROUTE_COLOR)];
  }

  const fallbackSegment = [...fallbackOverlays, ...pins].join(',');
  return assembleUrl(
    fallbackSegment,
    styleId,
    width,
    height,
    retina,
    accessToken,
  );
}
