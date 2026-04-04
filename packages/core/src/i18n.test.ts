import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * i18n completeness tests.
 *
 * These tests verify that:
 * 1. Every English key has a Romanian translation
 * 2. No profile screen strings are left untranslated
 * 3. Toggle descriptions have translation keys
 * 4. Alert dialogs use translation keys
 */

const MOBILE_APP = resolve(__dirname, '../../../apps/mobile');

const readSource = (relPath: string) =>
  readFileSync(resolve(MOBILE_APP, relPath), 'utf8');

describe('i18n key completeness', () => {
  it('ro.ts has every key that en.ts defines', () => {
    const enSource = readSource('src/i18n/en.ts');
    const roSource = readSource('src/i18n/ro.ts');

    // Extract all "key: 'value'" patterns from en.ts
    const enKeys = [...enSource.matchAll(/^\s+(\w+):\s*['"]/gm)].map((m) => m[1]);
    const roKeys = [...roSource.matchAll(/^\s+(\w+):\s*['"]/gm)].map((m) => m[1]);

    const missing = enKeys.filter((k) => !roKeys.includes(k));
    expect(missing, `Romanian file is missing keys: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('profile screen has no hardcoded English', () => {
  it('toggle descriptions use t() calls, not raw English strings', () => {
    const source = readSource('app/profile.tsx');

    // These are the known English toggle descriptions that should be translated
    const hardcodedDescriptions = [
      'Routes will stay on paved surfaces',
      'Routes may include unpaved roads',
      'Shows how much safer your route is',
      'Route comparison disabled',
      'Cycling infrastructure is visible',
      'Bike lanes are hidden from the map',
      'Daily 9am cycling weather forecast',
      'Daily weather notification is off',
      'Get notified about hazards',
      'Hazard alerts are off',
      'Get notified about likes',
      'Community notifications are off',
      'No notifications',
      'Your rides are shared in the community',
      'Your rides are private and not shared',
    ];

    const stillHardcoded = hardcodedDescriptions.filter((text) => source.includes(`'${text}`));
    expect(
      stillHardcoded,
      `Profile still has hardcoded English descriptions:\n  ${stillHardcoded.join('\n  ')}`,
    ).toEqual([]);
  });

  it('user card labels use t() calls', () => {
    const source = readSource('app/profile.tsx');

    const hardcodedLabels = [
      "'Rider'",
      "'Signed in'",
      "'Change username'",
      "'Set username'",
    ];

    const stillHardcoded = hardcodedLabels.filter((text) => source.includes(text));
    expect(
      stillHardcoded,
      `Profile still has hardcoded user card labels:\n  ${stillHardcoded.join('\n  ')}`,
    ).toEqual([]);
  });

  it('sign-out alert uses t() calls', () => {
    const source = readSource('app/profile.tsx');

    const hardcodedAlerts = [
      "'Are you sure you want to sign out?'",
      "text: 'Cancel'",
      "text: 'Sign Out'",
    ];

    const stillHardcoded = hardcodedAlerts.filter((text) => source.includes(text));
    expect(
      stillHardcoded,
      `Profile sign-out alert still has hardcoded English:\n  ${stillHardcoded.join('\n  ')}`,
    ).toEqual([]);
  });
});
