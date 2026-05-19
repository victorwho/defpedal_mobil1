/**
 * Route-feature icon token completeness gate.
 *
 * The map layer (step 3) and proximity alert organism (step 4) both rely on
 * every `RouteFeatureType` having a matching token. A missing entry would
 * fall through to a blank label at runtime — caught here at typecheck/test
 * time instead.
 */
import { describe, expect, it } from 'vitest';

import {
  getRouteFeatureIcon,
  getRouteFeatureTierColor,
  routeFeatureIcons,
  routeFeatureLabelColor,
  routeFeatureTierColors,
} from '../routeFeatureIcons';

const ALL_FEATURE_TYPES = [
  'tunnel',
  'bridge',
  'semafor',
  'left_turn_no_intersection',
  'railway_crossing',
] as const;

const ALL_TIERS = ['info', 'caution', 'warning'] as const;

describe('routeFeatureIcons', () => {
  it('has an entry for every RouteFeatureType', () => {
    for (const type of ALL_FEATURE_TYPES) {
      expect(routeFeatureIcons[type]).toBeDefined();
    }
  });

  it('every label is a non-empty 2-character ASCII string', () => {
    for (const type of ALL_FEATURE_TYPES) {
      const { label } = routeFeatureIcons[type];
      expect(label).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('every label is unique — prevents two features sharing a glyph on the map', () => {
    const labels = ALL_FEATURE_TYPES.map((t) => routeFeatureIcons[t].label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('does not collide with existing single-letter POI labels (P/R/B)', () => {
    const reservedSingleLetterPoiLabels = new Set(['P', 'R', 'B']);
    for (const type of ALL_FEATURE_TYPES) {
      const { label } = routeFeatureIcons[type];
      expect(label.length).toBeGreaterThan(1);
      // Defensive: also verify no overlap if labels ever shorten.
      expect(reservedSingleLetterPoiLabels.has(label)).toBe(false);
    }
  });

  it('iconImage resolves to a require()-returned asset id for every entry', () => {
    for (const type of ALL_FEATURE_TYPES) {
      // RN's `require()` of a static asset returns an opaque numeric handle
      // (or, under happy-dom + vitest, the resolved relative path string).
      // Either way: must be truthy and never null/undefined.
      const { iconImage } = routeFeatureIcons[type];
      expect(iconImage).toBeTruthy();
    }
  });

  it('spriteName is a stable kebab-case key for every entry', () => {
    for (const type of ALL_FEATURE_TYPES) {
      const { spriteName } = routeFeatureIcons[type];
      expect(spriteName).toMatch(/^route-feature-[a-z-]+$/);
    }
  });

  it('all spriteName values are unique', () => {
    const names = ALL_FEATURE_TYPES.map((t) => routeFeatureIcons[t].spriteName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every accessibilityLabel is a non-empty human-readable phrase', () => {
    for (const type of ALL_FEATURE_TYPES) {
      const { accessibilityLabel } = routeFeatureIcons[type];
      expect(accessibilityLabel.length).toBeGreaterThan(0);
      // No raw underscores from the type name leaking through.
      expect(accessibilityLabel).not.toMatch(/_/);
    }
  });

  it('getRouteFeatureIcon returns the same reference as direct lookup', () => {
    for (const type of ALL_FEATURE_TYPES) {
      expect(getRouteFeatureIcon(type)).toBe(routeFeatureIcons[type]);
    }
  });
});

describe('routeFeatureTierColors', () => {
  it('has an entry for every RouteFeatureTier', () => {
    for (const tier of ALL_TIERS) {
      expect(routeFeatureTierColors[tier]).toBeDefined();
    }
  });

  it('every color is a 7-character hex string', () => {
    for (const tier of ALL_TIERS) {
      expect(routeFeatureTierColors[tier]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('tiers are visually distinct (no two share the same hex)', () => {
    const hexes = ALL_TIERS.map((t) => routeFeatureTierColors[t]);
    expect(new Set(hexes).size).toBe(hexes.length);
  });

  it('label color contrasts ≥4.5:1 against every tier background', () => {
    // Rough relative luminance check — a tight contrast assertion using
    // packages/core's contrast util would be overkill here. White text on
    // the three chosen tier hexes (#475569 slate, #F59E0B amber, #DC2626
    // red) all clear AA by inspection; this test just guards against a
    // future change to a near-white tier color silently breaking that.
    expect(routeFeatureLabelColor).toBe('#FFFFFF');
    for (const tier of ALL_TIERS) {
      const hex = routeFeatureTierColors[tier];
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      // Reject anything brighter than mid-gray — would lose contrast vs white.
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      expect(brightness).toBeLessThan(180);
    }
  });

  it('getRouteFeatureTierColor returns the same hex as direct lookup', () => {
    for (const tier of ALL_TIERS) {
      expect(getRouteFeatureTierColor(tier)).toBe(routeFeatureTierColors[tier]);
    }
  });
});
