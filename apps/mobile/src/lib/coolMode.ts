/**
 * Cool-mode (shade / avoid-heat routing) visibility flag.
 *
 * LIVE IN PRODUCTION since 2026-09-18. Before that it was dev/preview only —
 * a product decision, not a defect — while the shade graph and the canopy
 * comparison were built out.
 *
 * WHY THIS MODULE STILL EXISTS RATHER THAN BEING DELETED
 * ------------------------------------------------------
 * `avoidHeat` can become true through FIVE paths, only one of which is the
 * Cool pill on route-planning:
 *
 *   1. the Cool pill (route-planning)
 *   2. the tap-to-cycle mode pill (route-preview) — Safe -> Fast -> Flat ->
 *      E-bike -> Cool
 *   3. claiming a shared route whose routingMode is 'cool'
 *      (`shareClaimToPreview.ts`)
 *   4. opening a saved route persisted with `avoid_heat = true`
 *   5. the persisted store itself, from an earlier session
 *
 * `setAvoidHeat`, `selectRoutingMode`, `setRouteRequest` and rehydration all
 * coerce through `resolveAvoidHeat`, so every path is covered by construction
 * rather than by each call site remembering. Keeping that single choke point
 * is what makes turning the mode off again a one-line change instead of an
 * audit — and path 3 is not hypothetical: it reached production once, serving
 * shade-graph routes while the mode pill read "Safe", because
 * `setRouteRequest` was the one setter that did not coerce.
 *
 * TO HIDE IT AGAIN: return `false` here. Nothing else needs undoing.
 */

/**
 * True when the Cool routing mode may be offered at all.
 *
 * Now unconditional. The remaining gates on Cool are real ones, not build
 * flags: `isHeatRoutingAvailable(country)` for shade-graph coverage, and
 * `resolveCoolRoutingAvailability` for entitlement (see
 * `PLUS_MODES_FREE_UNTIL` — free to everyone through 2026-09-30, Plus
 * thereafter).
 */
export const isCoolModeEnabled = (): boolean => true;

/**
 * Coerce a stored/incoming preference through the flag.
 *
 * Retained deliberately even though the flag is now always true: it is the
 * single choke point described above, and the five write paths call it. If
 * Cool is ever gated again, this is what makes that safe.
 */
export const resolveAvoidHeat = (requested: boolean | undefined): boolean =>
  isCoolModeEnabled() ? requested === true : false;
