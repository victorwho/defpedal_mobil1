// Single source of truth for the `/v1/route-shares/public/:code` payload.
// Imported from @defensivepedal/core so the viewer, the API, and the mobile client all
// share the same Zod schema and inferred type.
export { routeSharePublicViewSchema } from '@defensivepedal/core';
export type { RouteSharePublicView } from '@defensivepedal/core';
