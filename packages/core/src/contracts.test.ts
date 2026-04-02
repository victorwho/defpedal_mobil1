import { describe, expect, it } from 'vitest';

import {
  HAZARD_TYPE_OPTIONS,
  SAFETY_TAG_OPTIONS,
} from './contracts';

// ---------------------------------------------------------------------------
// HAZARD_TYPE_OPTIONS constant
// ---------------------------------------------------------------------------

describe('HAZARD_TYPE_OPTIONS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(HAZARD_TYPE_OPTIONS)).toBe(true);
    expect(HAZARD_TYPE_OPTIONS.length).toBeGreaterThan(0);
  });

  it('every entry has a non-empty value and label', () => {
    for (const option of HAZARD_TYPE_OPTIONS) {
      expect(typeof option.value).toBe('string');
      expect(option.value.length).toBeGreaterThan(0);
      expect(typeof option.label).toBe('string');
      expect(option.label.length).toBeGreaterThan(0);
    }
  });

  it('all value strings are unique', () => {
    const values = HAZARD_TYPE_OPTIONS.map((o) => o.value);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('includes the "pothole" hazard type', () => {
    const values = HAZARD_TYPE_OPTIONS.map((o) => o.value);
    expect(values).toContain('pothole');
  });

  it('includes an "other" fallback option', () => {
    const values = HAZARD_TYPE_OPTIONS.map((o) => o.value);
    expect(values).toContain('other');
  });
});

// ---------------------------------------------------------------------------
// SAFETY_TAG_OPTIONS constant
// ---------------------------------------------------------------------------

describe('SAFETY_TAG_OPTIONS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(SAFETY_TAG_OPTIONS)).toBe(true);
    expect(SAFETY_TAG_OPTIONS.length).toBeGreaterThan(0);
  });

  it('every entry has a non-empty value and label', () => {
    for (const option of SAFETY_TAG_OPTIONS) {
      expect(typeof option.value).toBe('string');
      expect(option.value.length).toBeGreaterThan(0);
      expect(typeof option.label).toBe('string');
      expect(option.label.length).toBeGreaterThan(0);
    }
  });

  it('all value strings are unique', () => {
    const values = SAFETY_TAG_OPTIONS.map((o) => o.value);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('includes "bike_lane" as a safety tag', () => {
    const values = SAFETY_TAG_OPTIONS.map((o) => o.value);
    expect(values).toContain('bike_lane');
  });
});
