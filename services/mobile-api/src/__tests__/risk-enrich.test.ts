// @vitest-environment node
/**
 * Unit tests for `enrichRiskGeoJson` — the helper that maps the raw output
 * of the `get_road_risk_geojson` Supabase RPC into the shape the mobile map
 * actually consumes (color + quantized score + category label).
 *
 * Background: the original `/v1/risk-map` handler returned the RPC result
 * raw, which carried only `riskScore` per feature. The mobile map renders
 * with `lineColor: ['get', 'color']`, so every feature came through with
 * the same fallback colour. This helper restores per-feature colour while
 * keeping the bucket thresholds server-side only.
 */
import { describe, it, expect } from 'vitest';

import { enrichRiskGeoJson } from '../lib/risk';

describe('enrichRiskGeoJson', () => {
  const mkFeature = (props: Record<string, unknown>) => ({
    type: 'Feature' as const,
    properties: props,
    geometry: { type: 'LineString' as const, coordinates: [[0, 0], [1, 1]] },
  });

  it('returns an empty FeatureCollection when input is null/undefined', () => {
    expect(enrichRiskGeoJson(null)).toEqual({ type: 'FeatureCollection', features: [] });
    expect(enrichRiskGeoJson(undefined)).toEqual({ type: 'FeatureCollection', features: [] });
  });

  it('returns an empty FeatureCollection when input has no features array', () => {
    const result = enrichRiskGeoJson({ type: 'FeatureCollection' } as never);
    expect(result.features).toEqual([]);
  });

  it('assigns distinct colours for distinct risk scores (the original bug)', () => {
    const result = enrichRiskGeoJson({
      type: 'FeatureCollection',
      features: [
        mkFeature({ riskScore: 10 }),  // very-safe bucket
        mkFeature({ riskScore: 50 }),  // average bucket
        mkFeature({ riskScore: 80 }),  // very-risky bucket
      ],
    });

    const colours = result.features.map((f) => f.properties.color);
    // Three distinct buckets → three distinct colour values.
    expect(new Set(colours).size).toBe(3);
    // Each feature carries the new properties (none of the old ones).
    for (const feature of result.features) {
      expect(feature.properties).toHaveProperty('color');
      expect(feature.properties).toHaveProperty('riskCategory');
      expect(feature.properties).toHaveProperty('riskScore');
    }
  });

  it('quantizes raw scores to bucket midpoints (security: thresholds stay server-side)', () => {
    const result = enrichRiskGeoJson({
      type: 'FeatureCollection',
      features: [
        mkFeature({ riskScore: 12 }),
        mkFeature({ riskScore: 13 }),
        mkFeature({ riskScore: 28 }),
      ],
    });

    // All three land in the same "very safe" bucket → same midpoint.
    const scores = result.features.map((f) => f.properties.riskScore);
    expect(new Set(scores).size).toBe(1);
    // The exact raw input must NOT leak through.
    expect(scores).not.toContain(12);
    expect(scores).not.toContain(28);
  });

  it('accepts both camelCase `riskScore` and snake_case `risk_score`', () => {
    const result = enrichRiskGeoJson({
      type: 'FeatureCollection',
      features: [
        mkFeature({ riskScore: 50 }),
        mkFeature({ risk_score: 50 }),
      ],
    });

    expect(result.features[0].properties).toEqual(result.features[1].properties);
  });

  it('treats missing/zero score as the no-data bucket', () => {
    const result = enrichRiskGeoJson({
      type: 'FeatureCollection',
      features: [mkFeature({}), mkFeature({ riskScore: 0 })],
    });

    expect(result.features[0].properties.riskCategory).toBe('No data');
    expect(result.features[1].properties.riskCategory).toBe('No data');
  });

  it('preserves geometry untouched', () => {
    const original = mkFeature({ riskScore: 50 });
    const result = enrichRiskGeoJson({
      type: 'FeatureCollection',
      features: [original],
    });
    expect(result.features[0].geometry).toEqual(original.geometry);
  });

  it('strips raw score values from passed-through properties (no leak)', () => {
    const result = enrichRiskGeoJson({
      type: 'FeatureCollection',
      features: [mkFeature({ riskScore: 47.3, secret_internal: 'leaked' })],
    });

    // Only the three intended fields are exposed.
    expect(Object.keys(result.features[0].properties).sort()).toEqual(
      ['color', 'riskCategory', 'riskScore'].sort(),
    );
  });
});
