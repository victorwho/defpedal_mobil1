/**
 * Routing profile resolution — which OSRM graph serves a request, and how the
 * five user-facing routing modes map onto the request flags.
 *
 * The store and every wire contract speak `mode: 'safe' | 'fast'` plus three
 * profile flags (`avoidHills`, `avoidHeat`, `isEbike`). The UI, route shares
 * and the offline route cache speak one of five named modes. Each of those
 * conversions used to be an inline ternary at its call site, and each new mode
 * meant finding all of them. They live here so there is exactly one answer.
 *
 * WHY A SEPARATE GRAPH PER PROFILE
 * --------------------------------
 * OSRM bakes the Lua profile into the graph at extract time, so effort pricing
 * cannot be switched per request. Standard, flat, e-bike and cool are separate
 * extractions behind separate hostnames. Two consequences are load-bearing:
 *
 *  - There is NO e-bike flat graph and no e-bike cool graph, so at most one
 *    profile flag can be honoured. The UI keeps them mutually exclusive; the
 *    precedence below only settles inconsistent state (an old saved route, a
 *    hand-built request) instead of letting it pick a graph by accident.
 *  - The e-bike graph is ONE hostname for every covered country. Never
 *    derive it per country — there is no `osrm-es-ebike` and a country-suffixed
 *    host fails TLS in exactly the country that suffix names.
 */
import type { RoutingMode } from './contracts';

/** The OSRM instance a Safe-family request is dispatched to. */
export type SafeRoutingProfile = 'standard' | 'flat' | 'ebike' | 'cool';

/** The five routing modes a rider can pick, share, or resume. */
export type RoutingDisplayMode = 'safe' | 'fast' | 'flat' | 'ebike' | 'cool';

export const ROUTING_DISPLAY_MODES = [
  'safe',
  'fast',
  'flat',
  'ebike',
  'cool',
] as const satisfies readonly RoutingDisplayMode[];

export interface RoutingProfileFlags {
  readonly avoidHills?: boolean;
  readonly avoidHeat?: boolean;
  readonly isEbike?: boolean;
}

export interface RoutingModeSelection {
  readonly mode: RoutingMode;
  readonly avoidHills: boolean;
  readonly avoidHeat: boolean;
  readonly isEbike: boolean;
}

export const isRoutingDisplayMode = (value: unknown): value is RoutingDisplayMode =>
  typeof value === 'string' &&
  (ROUTING_DISPLAY_MODES as readonly string[]).includes(value);

/**
 * Pick the OSRM graph for a Safe-family request.
 *
 * Precedence: cool > e-bike > flat > standard.
 *
 * - Cool first because it is the only coverage-gated profile: outside the
 *   shade graph's countries `heatRoutingAvailable` is false and the request
 *   falls through to the next flag rather than failing.
 * - E-bike before flat: the pedelec already neutralises most climb cost, and
 *   no e-bike flat graph exists. Falling back to flat when both are set would
 *   silently drop the pedelec and hand an e-bike rider hill-avoiding detours.
 */
export const resolveSafeRoutingProfile = (
  flags: RoutingProfileFlags,
  heatRoutingAvailable: boolean,
): SafeRoutingProfile => {
  if (flags.avoidHeat && heatRoutingAvailable) return 'cool';
  if (flags.isEbike) return 'ebike';
  if (flags.avoidHills) return 'flat';
  return 'standard';
};

/**
 * Name the routing mode a request represents. Same precedence as
 * `resolveSafeRoutingProfile`, so what a share or cached route is LABELLED
 * always matches the graph that computed it.
 */
export const toRoutingDisplayMode = (
  mode: RoutingMode,
  flags: RoutingProfileFlags,
): RoutingDisplayMode => {
  if (mode === 'fast') return 'fast';
  if (flags.avoidHeat) return 'cool';
  if (flags.isEbike) return 'ebike';
  if (flags.avoidHills) return 'flat';
  return 'safe';
};

/**
 * Expand a named mode back into request flags. Every result sets exactly one
 * profile flag at most, which is the invariant the UI relies on.
 */
export const fromRoutingDisplayMode = (
  displayMode: RoutingDisplayMode,
): RoutingModeSelection => ({
  mode: displayMode === 'fast' ? 'fast' : 'safe',
  avoidHills: displayMode === 'flat',
  avoidHeat: displayMode === 'cool',
  isEbike: displayMode === 'ebike',
});
