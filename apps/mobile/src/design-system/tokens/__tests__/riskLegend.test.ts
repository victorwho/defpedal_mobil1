import { describe, expect, it } from 'vitest';

import {
  RISK_CLAIM_BANDS,
  RISK_LEGEND_BANDS,
  riskBandKeyForServerLabel,
} from '../riskLegend';

/**
 * The shades the SERVER paints, grouped by tier — mirrored from RISK_BUCKETS
 * in `services/mobile-api/src/lib/risk.ts` (b46v1 re-anchoring, 2026-09-04).
 *
 * Deliberately only the colours. The score CUTS are server-side only
 * (risk-IP hardening, 2026-04-13) and must never appear in the client.
 */
const SERVER_SHADES: Record<string, readonly string[]> = {
  Safer: ['#2E9E43', '#79BC4E'],
  Typical: ['#EFD124', '#EDB320', '#E8921B', '#E17114'],
  'High risk': ['#D5482D', '#BB2B20', '#851D16', '#000000'],
  'No data': ['#3b82f6'],
};

describe('RISK_LEGEND_BANDS', () => {
  it('carries exactly the three claim tiers plus No data, safest first', () => {
    expect(RISK_LEGEND_BANDS.map((b) => b.serverLabel)).toEqual([
      'Safer',
      'Typical',
      'High risk',
      'No data',
    ]);
  });

  it('matches the shades the server paints, per tier and in order', () => {
    // The legend claiming a colour the map never draws is the drift that
    // makes riders distrust both surfaces.
    for (const band of RISK_LEGEND_BANDS) {
      expect(band.shades).toEqual(SERVER_SHADES[band.serverLabel]);
    }
  });

  it('covers all ten risk shades across the three claim tiers', () => {
    const total = RISK_CLAIM_BANDS.reduce(
      (sum, band) => sum + band.shades.length,
      0,
    );
    expect(total).toBe(10);
  });

  it('uses every shade exactly once', () => {
    const all = RISK_LEGEND_BANDS.flatMap((b) => b.shades);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps the representative colour inside its own ramp', () => {
    for (const band of RISK_LEGEND_BANDS) {
      expect(band.shades).toContain(band.color);
    }
  });

  it('leaks no score thresholds', () => {
    // Cuts are server-side only. A number appearing on a legend band would
    // mean someone reintroduced them client-side.
    for (const band of RISK_LEGEND_BANDS) {
      expect(Object.keys(band).sort()).toEqual(
        ['color', 'key', 'serverLabel', 'shades'].sort(),
      );
    }
  });

  it('gives No data a single flat colour, not a ramp', () => {
    // It is the absence of a rating, not a level — a ramp would imply a
    // gradation that does not exist.
    const noData = RISK_LEGEND_BANDS.find((b) => b.key === 'noData');
    expect(noData?.shades).toHaveLength(1);
  });
});

describe('RISK_CLAIM_BANDS', () => {
  it('excludes No data', () => {
    expect(RISK_CLAIM_BANDS.map((b) => b.key)).toEqual([
      'safer',
      'typical',
      'highRisk',
    ]);
  });
});

describe('riskBandKeyForServerLabel', () => {
  it('maps every live server label', () => {
    expect(riskBandKeyForServerLabel('Safer')).toBe('safer');
    expect(riskBandKeyForServerLabel('Typical')).toBe('typical');
    expect(riskBandKeyForServerLabel('High risk')).toBe('highRisk');
    expect(riskBandKeyForServerLabel('No data')).toBe('noData');
  });

  it('returns null for the retired pre-b46v1 labels', () => {
    // Old builds and old labels must fall through to the raw-label fallback
    // rather than resolving to a wrong band.
    for (const retired of [
      'Very safe',
      'Safe',
      'Average',
      'Elevated',
      'Risky',
      'Very risky',
      'Extreme',
    ]) {
      expect(riskBandKeyForServerLabel(retired)).toBeNull();
    }
  });

  it('returns null for an unknown future label rather than guessing', () => {
    expect(riskBandKeyForServerLabel('Catastrophic')).toBeNull();
  });
});
