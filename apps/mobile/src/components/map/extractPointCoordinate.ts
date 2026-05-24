/**
 * Safely extracts a flat `[longitude, latitude]` pair from a GeoJSON feature's
 * `geometry` object.
 *
 * Returns `null` for anything that isn't a `Point` with two finite numeric
 * coordinates. This is intentionally strict — the goal is to prevent passing
 * a nested array (e.g. a `LineString`'s `[[lng,lat], ...]` shape) across the
 * React Native bridge into a native module that expects flat doubles. That's
 * the exact root cause of Sentry MOBILE-9, where tapping a non-Point feature
 * in a Mapbox vector-tile source layer crashed the app with:
 *
 *     java.lang.ClassCastException:
 *       com.facebook.react.bridge.ReadableNativeArray cannot be cast to
 *       java.lang.Double
 *
 * @rnmapbox/maps's `MapView.getPointInView(coord)` calls
 * `ReadableArrayKt.toCoordinate` → `getDouble(0)` on the JS-supplied array,
 * and a nested `[[lng,lat]]` element 0 throws fatally before JS can catch.
 *
 * Pass everything that isn't a flat Point through `null` and let the caller
 * decide what to do (skip the bridge call, fall back to default screen
 * coordinates, etc.).
 */
export const extractPointCoordinate = (
  geometry: unknown,
): readonly [number, number] | null => {
  if (!geometry || typeof geometry !== 'object') {
    return null;
  }

  const candidate = geometry as { type?: unknown; coordinates?: unknown };

  // Only handle Point. LineString / Polygon / Multi* have nested coordinate
  // arrays that would explode the native cast, so refuse them. Callers that
  // want a representative point for a non-Point feature must compute it
  // (e.g. centroid) themselves — we don't silently guess.
  if (candidate.type !== 'Point') {
    return null;
  }

  const coords = candidate.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    return null;
  }

  const lng = coords[0];
  const lat = coords[1];

  // GeoJSON spec allows a third "altitude" element; only the first two are
  // positions. Validate strictly that both are finite numbers — NaN, Infinity,
  // arrays, strings, undefined all fail. This is the actual guard that would
  // have prevented MOBILE-9.
  if (typeof lng !== 'number' || !Number.isFinite(lng)) {
    return null;
  }
  if (typeof lat !== 'number' || !Number.isFinite(lat)) {
    return null;
  }

  return [lng, lat] as const;
};
