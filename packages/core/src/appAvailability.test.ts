import { describe, expect, it } from 'vitest';

import {
  SUPPORTED_APP_COUNTRIES,
  isAppCountrySupported,
  normalizeCountryCode,
} from './appAvailability';

describe('SUPPORTED_APP_COUNTRIES', () => {
  it('contains all 27 EU member states', () => {
    const eu27 = [
      'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
      'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
      'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
    ];
    for (const code of eu27) {
      expect(SUPPORTED_APP_COUNTRIES.has(code)).toBe(true);
    }
  });

  it('contains EEA members and Switzerland', () => {
    for (const code of ['IS', 'LI', 'NO', 'CH']) {
      expect(SUPPORTED_APP_COUNTRIES.has(code)).toBe(true);
    }
  });

  it('contains the United Kingdom (b47v1 routing generation, 2026-09-21)', () => {
    expect(SUPPORTED_APP_COUNTRIES.has('GB')).toBe(true);
  });

  it('has exactly 32 entries (EU-27 + IS/LI/NO + CH + GB)', () => {
    expect(SUPPORTED_APP_COUNTRIES.size).toBe(32);
  });

  it('does not contain the Crown Dependencies or other unsupported countries', () => {
    // IM/JE/GG are separate ISO codes and are not in the routing graph.
    for (const code of ['IM', 'JE', 'GG', 'US', 'RS', 'UA', 'TR', 'MD', 'AL', 'BA', 'MK', 'ME', 'XK']) {
      expect(SUPPORTED_APP_COUNTRIES.has(code)).toBe(false);
    }
  });
});

describe('normalizeCountryCode', () => {
  it('uppercases and trims', () => {
    expect(normalizeCountryCode(' ro ')).toBe('RO');
    expect(normalizeCountryCode('gb')).toBe('GB');
  });

  it('maps the informal UK alias to GB', () => {
    expect(normalizeCountryCode('UK')).toBe('GB');
    expect(normalizeCountryCode('uk')).toBe('GB');
  });

  it('returns null for null, undefined, empty, and non-alpha-2 input', () => {
    expect(normalizeCountryCode(null)).toBeNull();
    expect(normalizeCountryCode(undefined)).toBeNull();
    expect(normalizeCountryCode('')).toBeNull();
    expect(normalizeCountryCode('ROU')).toBeNull();
    expect(normalizeCountryCode('R')).toBeNull();
    expect(normalizeCountryCode('12')).toBeNull();
  });
});

describe('isAppCountrySupported', () => {
  it('accepts EU members regardless of case', () => {
    expect(isAppCountrySupported('RO')).toBe(true);
    expect(isAppCountrySupported('es')).toBe(true);
    expect(isAppCountrySupported('fr')).toBe(true);
  });

  it('accepts the UK consistently via both GB and the UK alias', () => {
    // The alias still matters: some Android geocoders return "UK", and a UK
    // rider must pass the gate silently rather than fall through as an
    // "unknown country" to the manual picker.
    expect(isAppCountrySupported('GB')).toBe(true);
    expect(isAppCountrySupported('UK')).toBe(true);
    expect(isAppCountrySupported('gb')).toBe(true);
  });

  it('rejects unsupported countries', () => {
    expect(isAppCountrySupported('US')).toBe(false);
    expect(isAppCountrySupported('RS')).toBe(false);
    expect(isAppCountrySupported('TR')).toBe(false);
  });

  it('rejects null/undefined/garbage input', () => {
    expect(isAppCountrySupported(null)).toBe(false);
    expect(isAppCountrySupported(undefined)).toBe(false);
    expect(isAppCountrySupported('')).toBe(false);
    expect(isAppCountrySupported('ROU')).toBe(false);
  });
});
