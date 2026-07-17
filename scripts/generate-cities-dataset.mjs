#!/usr/bin/env node
/**
 * Generate the City Riders Pulse cities dataset from GeoNames cities15000.
 *
 * Usage:
 *   curl -sLO https://download.geonames.org/export/dump/cities15000.zip
 *   unzip cities15000.zip
 *   node scripts/generate-cities-dataset.mjs path/to/cities15000.txt
 *
 * Filters to the 31 supported app countries (EU-27 + EEA + CH, same list as
 * packages/core/src/appAvailability.ts) and population >= 15000, then emits
 * services/mobile-api/src/lib/nudges/citiesData.ts as compact tuples.
 *
 * The utcOffset column is the STANDARD-TIME (winter) offset in hours, derived
 * from the city's IANA timezone at a fixed January instant. It is used only
 * to place the 07:00–21:30 local scheduling window; DST drift of one hour is
 * tolerated because the per-user quiet-hours gate (profile timezone via Intl,
 * DST-correct) is the enforcement backstop for the 22:00–07:00 rule.
 *
 * Dataset is server-side only (consumed by the nudge cron). It deliberately
 * does NOT live in packages/core: Metro does not tree-shake, so anything
 * re-exported from core's index ships in the mobile bundle.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPPORTED = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO', 'CH',
]);

const MIN_POPULATION = 15000;

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/generate-cities-dataset.mjs <cities15000.txt>');
  process.exit(1);
}

// Standard-time offset in hours for an IANA timezone (mid-January = no DST
// anywhere in Europe).
const STANDARD_TIME_PROBE = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
const offsetCache = new Map();
const standardOffsetHours = (timeZone) => {
  if (offsetCache.has(timeZone)) return offsetCache.get(timeZone);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' });
  const part = fmt.formatToParts(STANDARD_TIME_PROBE).find((p) => p.type === 'timeZoneName');
  // "GMT", "GMT+2", "GMT-1", "GMT+5:30"
  const m = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(part?.value ?? '');
  if (!m) throw new Error(`Cannot parse offset for timezone ${timeZone}: ${part?.value}`);
  const sign = m[1] === '-' ? -1 : 1;
  const hours = m[2] ? sign * (Number(m[2]) + Number(m[3] ?? 0) / 60) : 0;
  offsetCache.set(timeZone, hours);
  return hours;
};

const rows = [];
for (const line of readFileSync(input, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const f = line.split('\t');
  const countryCode = f[8];
  if (!SUPPORTED.has(countryCode)) continue;
  const population = Number.parseInt(f[14], 10);
  if (!Number.isFinite(population) || population < MIN_POPULATION) continue;
  const lat = Number.parseFloat(f[4]);
  const lon = Number.parseFloat(f[5]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  rows.push({
    name: f[1],
    countryCode,
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
    population,
    utcOffset: standardOffsetHours(f[17]),
  });
}

// Stable output order: country, then population desc, then name.
rows.sort(
  (a, b) =>
    a.countryCode.localeCompare(b.countryCode) ||
    b.population - a.population ||
    a.name.localeCompare(b.name),
);

const missing = [...SUPPORTED].filter((cc) => !rows.some((r) => r.countryCode === cc));

const tupleLines = rows.map(
  (r) =>
    `  [${JSON.stringify(r.name)}, '${r.countryCode}', ${r.lat}, ${r.lon}, ${r.population}, ${r.utcOffset}],`,
);

const out = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * City Riders Pulse dataset: cities with population >= ${MIN_POPULATION} in the 31
 * supported app countries (EU-27 + EEA + CH). Source: GeoNames cities15000
 * (CC BY 4.0, https://www.geonames.org/). Regenerate with:
 *   node scripts/generate-cities-dataset.mjs <cities15000.txt>
 *
 * Tuple layout: [name, countryCode, lat, lon, population, utcOffsetHours]
 * utcOffsetHours is the standard-time (winter) offset — see the generator
 * header for why DST drift is acceptable here.
 *
 * ${rows.length} cities.${missing.length ? ` Countries with no >=15k city: ${missing.join(', ')} (fallback path applies).` : ''}
 */

export type CityTuple = readonly [
  name: string,
  countryCode: string,
  lat: number,
  lon: number,
  population: number,
  utcOffsetHours: number,
];

export const CITY_TUPLES: readonly CityTuple[] = [
${tupleLines.join('\n')}
];
`;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dest = resolve(repoRoot, 'services/mobile-api/src/lib/nudges/citiesData.ts');
writeFileSync(dest, out, 'utf8');
console.log(`Wrote ${rows.length} cities to ${dest}`);
if (missing.length) console.log(`Countries with no >=15k city: ${missing.join(', ')}`);
