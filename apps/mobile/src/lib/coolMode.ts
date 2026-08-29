/**
 * Cool-mode (shade / avoid-heat routing) visibility flag.
 *
 * Hidden in the production app for now — a product decision, not a defect.
 * Dev and preview builds keep it so it can still be exercised and tested.
 *
 * WHY A SINGLE CHOKE POINT RATHER THAN JUST HIDING THE PILL
 * ---------------------------------------------------------
 * `avoidHeat` can become true through FIVE paths, only one of which is the
 * Cool pill on route-planning:
 *
 *   1. the Cool pill (route-planning)
 *   2. the tap-to-cycle mode pill (route-preview) — Safe -> Fast -> Flat -> Cool
 *   3. claiming a shared route whose routingMode is 'cool'
 *      (`shareClaimToPreview.ts`)
 *   4. opening a saved route persisted with `avoid_heat = true`
 *   5. the persisted store itself, from a session before this build
 *
 * Hiding the pill alone would leave the other four, and would strand anyone
 * who already has the preference on: cool routing with no visible control to
 * turn it off. So the store's `setAvoidHeat` refuses to enable it when this
 * flag is false, and rehydration coerces a stale `true` back to false. Every
 * path is then covered by construction, and the UI gates below are only about
 * not showing a control that could do nothing.
 *
 * TO RE-ENABLE: flip this to `true` unconditionally (or delete the module and
 * its call sites). Nothing else needs undoing — the routing dispatch,
 * `HEAT_ROUTING_COUNTRIES` coverage gate, OSRM shade instance and saved-route
 * `avoid_heat` column are all untouched and still work.
 */
import { mobileEnv } from './env';

/**
 * True when the Cool routing mode may be offered at all.
 *
 * Checks BOTH `appVariant` and `appEnv`, matching the existing dev-tool gates
 * (`devMockLocation.ts`, `diagnostics.tsx`): a production APK with a
 * mis-set env var, or a preview binary pointed at production, must both land
 * on the safe side.
 */
export const isCoolModeEnabled = (): boolean =>
  mobileEnv.appVariant !== 'production' && mobileEnv.appEnv !== 'production';

/**
 * Coerce a stored/incoming preference through the flag.
 *
 * Used by the store setter and by rehydration so a value that predates this
 * change cannot leave a production rider stuck in an invisible mode.
 */
export const resolveAvoidHeat = (requested: boolean | undefined): boolean =>
  isCoolModeEnabled() ? requested === true : false;
