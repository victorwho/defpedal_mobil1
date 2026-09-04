/**
 * Risk band legend — display metadata for the server-side risk buckets.
 *
 * ⚠️ Keep `serverLabel` + `shades` in sync with RISK_BUCKETS in
 * `services/mobile-api/src/lib/risk.ts` and with `RISK_CATEGORY_ORDER` in
 * `packages/core/src/riskDistribution.ts`. Score thresholds deliberately do
 * NOT appear here — they are server-side only (2026-04-13 risk-IP hardening).
 * Colours are safe to bundle: they are painted on the map in front of the
 * rider anyway. The *cuts* are the intellectual property, not the palette.
 *
 * Order: safest → most hostile, with the "No data" state last (it is a data
 * state, not a risk level — legends read better with it as a footnote row).
 *
 * Re-anchored 2026-09-04 (b46v1 scale, BAND_REANCHOR_B46V1.md): THREE claim
 * tiers over TEN display shades. Hue changes only at a tier boundary;
 * lightness varies within a tier. That is the whole point of the scheme — a
 * rider can see gradation on the map without us implying we can tell two
 * shades of the same tier apart, which the accident validation does not
 * support.
 *
 * **The tier is the only level at which risk may be named or compared.**
 * Never label, rank, or write copy about an individual shade.
 */

export type RiskBandKey = 'safer' | 'typical' | 'highRisk' | 'noData';

export interface RiskLegendBand {
  /** The `riskCategory` label the server sends per segment. */
  readonly serverLabel: string;
  /** i18n key segment under `risk.bands.*`. */
  readonly key: RiskBandKey;
  /**
   * Every display shade the server paints for this tier, lightest → darkest.
   * Rendered as a ramp so the legend explains the gradation the rider sees on
   * the map. Individual shades are deliberately unlabelled.
   */
  readonly shades: readonly string[];
  /**
   * One representative shade, for compact surfaces with no room for a ramp.
   * Invariant: always a member of `shades` (locked by a test).
   */
  readonly color: string;
}

export const RISK_LEGEND_BANDS: readonly RiskLegendBand[] = [
  {
    serverLabel: 'Safer',
    key: 'safer',
    shades: ['#2E9E43', '#79BC4E'],
    color: '#2E9E43',
  },
  {
    serverLabel: 'Typical',
    key: 'typical',
    shades: ['#EFD124', '#EDB320', '#E8921B', '#E17114'],
    color: '#E8921B',
  },
  {
    serverLabel: 'High risk',
    key: 'highRisk',
    shades: ['#D5482D', '#BB2B20', '#851D16', '#000000'],
    color: '#BB2B20',
  },
  {
    // Not a risk level — the absence of one. Single flat colour on purpose:
    // a ramp here would imply a gradation that does not exist.
    serverLabel: 'No data',
    key: 'noData',
    shades: ['#3b82f6'],
    color: '#3b82f6',
  },
];

/** The three tiers that actually carry a risk claim, excluding "No data". */
export const RISK_CLAIM_BANDS: readonly RiskLegendBand[] =
  RISK_LEGEND_BANDS.filter((band) => band.key !== 'noData');

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
