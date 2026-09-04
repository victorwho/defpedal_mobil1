/**
 * Risk band legend — display metadata for the server-side risk buckets.
 *
 * ⚠️ Keep `serverLabel` + `color` in sync with RISK_BUCKETS in
 * `services/mobile-api/src/lib/risk.ts` and with `RISK_CATEGORY_ORDER` in
 * `packages/core/src/riskDistribution.ts`. Score thresholds deliberately do
 * NOT appear here — they are server-side only (2026-04-13 risk-IP hardening).
 *
 * Order: safest → most hostile, with the "No data" state last (it is a data
 * state, not a risk level — legends read better with it as a footnote row).
 *
 * Re-anchored 2026-09-04 (b46v1 scale, BAND_REANCHOR_B46V1.md): THREE claim
 * tiers. The server paints the map with finer per-shade colors inside each
 * tier; this legend lists one representative color per tier — the tier is
 * the only level at which risk levels may be named or compared.
 */

export type RiskBandKey = 'safer' | 'typical' | 'highRisk' | 'noData';

export interface RiskLegendBand {
  /** The `riskCategory` label the server sends per segment. */
  readonly serverLabel: string;
  /** i18n key segment under `risk.bands.*`. */
  readonly key: RiskBandKey;
  /** Display color — mirrors the server bucket color painted on the map. */
  readonly color: string;
}

export const RISK_LEGEND_BANDS: readonly RiskLegendBand[] = [
  { serverLabel: 'Safer', key: 'safer', color: '#2E9E43' },
  { serverLabel: 'Typical', key: 'typical', color: '#E8921B' },
  { serverLabel: 'High risk', key: 'highRisk', color: '#BB2B20' },
  { serverLabel: 'No data', key: 'noData', color: '#3b82f6' },
];

/**
 * Map a server-provided `riskCategory` label to its `risk.bands.*` i18n key
 * segment, or null for unknown labels (render the raw label as fallback so a
 * server-side band rename can never blank the UI).
 */
export const riskBandKeyForServerLabel = (
  serverLabel: string,
): RiskBandKey | null =>
  RISK_LEGEND_BANDS.find((band) => band.serverLabel === serverLabel)?.key ??
  null;
