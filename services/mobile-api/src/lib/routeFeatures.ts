/**
 * Server-side compatibility re-export. The extractor lives in
 * `@defensivepedal/core/src/routeFeatures` so the mobile client (which
 * fetches routes directly from OSRM/Mapbox without going through the
 * server) can produce identical features. Keep this file as a stable
 * import point for `normalize.ts` and any future server consumers.
 */
export { extractRouteFeatures } from '@defensivepedal/core';
