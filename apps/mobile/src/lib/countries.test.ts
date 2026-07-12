import { describe, expect, it } from 'vitest';

import { SUPPORTED_APP_COUNTRIES } from '@defensivepedal/core';

import { ALL_COUNTRIES, findCountryName } from './countries';

describe('ALL_COUNTRIES picker data', () => {
  it('has unique, well-formed ISO alpha-2 codes', () => {
    const codes = ALL_COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('has a non-empty name for every entry', () => {
    for (const { name } of ALL_COUNTRIES) {
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  it('contains every supported country so the gate can be passed via the picker', () => {
    // If a supported country were missing here, a rider with no GPS could
    // never pass the gate manually — they'd be forced onto the waitlist.
    const codes = new Set(ALL_COUNTRIES.map((c) => c.code));
    for (const supported of SUPPORTED_APP_COUNTRIES) {
      expect(codes.has(supported)).toBe(true);
    }
  });

  it('is sorted by English name so the unsearched list scans predictably', () => {
    const names = ALL_COUNTRIES.map((c) => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'en'));
    expect(names).toEqual(sorted);
  });
});

describe('findCountryName', () => {
  it('resolves a name case-insensitively', () => {
    expect(findCountryName('us')).toBe('United States');
    expect(findCountryName('RO')).toBe('Romania');
  });

  it('returns null for unknown or empty input', () => {
    expect(findCountryName('ZZ')).toBeNull();
    expect(findCountryName(null)).toBeNull();
    expect(findCountryName(undefined)).toBeNull();
  });
});
