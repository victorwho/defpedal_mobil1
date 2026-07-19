/**
 * Tests for the per-user location resolver — written after error-log #70:
 * PostgREST returns geography(Point) as WKB hex, the parser only understood
 * WKT + GeoJSON, so EVERY user silently resolved to the Bucharest fallback
 * (a rider's pulse named "Bucharest" while their trips decode to a town far
 * away, and the nudge safety floor gated on Bucharest weather fleet-wide).
 *
 * The WKB fixture reproduces the exact byte LAYOUT production returns
 * (verified against real rows 2026-07-19; coordinates here are synthetic) —
 * if the Supabase serialisation ever changes shape again, these tests are
 * the tripwire.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { __resetLocationCache, resolveUserLocation } from './userLocation';

/** Minimal SupabaseClient stub returning one trips row (or an error). */
const dbReturning = (
  row: { start_location: unknown } | null,
  error = false,
): SupabaseClient =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => {
                  if (error) throw new Error('db down');
                  return { data: row };
                },
              }),
            }),
          }),
        }),
      }),
    }),
  }) as unknown as SupabaseClient;

// Synthetic EWKB hex in the exact layout PostgREST returns for
// trips.start_location (LE byte order, embedded SRID 4326). The point is
// Bucharest city centre — deliberately NOT real ride data.
const SAMPLE_WKB = '0101000020E610000097900F7A361B3A40C8073D9B55374640';

describe('resolveUserLocation', () => {
  beforeEach(() => {
    __resetLocationCache();
  });

  it('decodes the production EWKB hex serialisation (the #70 regression)', async () => {
    const loc = await resolveUserLocation(dbReturning({ start_location: SAMPLE_WKB }), 'u1');
    expect(loc.fromFallback).toBe(false);
    expect(loc.lat).toBeCloseTo(44.4323, 3);
    expect(loc.lon).toBeCloseTo(26.1063, 3);
  });

  it('decodes plain WKB hex without an embedded SRID', async () => {
    // Same point, type 00000001, no SRID word.
    const noSrid = '0101000000' + SAMPLE_WKB.slice(18);
    const loc = await resolveUserLocation(dbReturning({ start_location: noSrid }), 'u2');
    expect(loc.fromFallback).toBe(false);
    expect(loc.lat).toBeCloseTo(44.4323, 3);
    expect(loc.lon).toBeCloseTo(26.1063, 3);
  });

  it('still parses WKT strings (lon-first)', async () => {
    const loc = await resolveUserLocation(
      dbReturning({ start_location: 'POINT(26.10 44.43)' }),
      'u3',
    );
    expect(loc.fromFallback).toBe(false);
    expect(loc.lat).toBeCloseTo(44.43);
    expect(loc.lon).toBeCloseTo(26.1);
  });

  it('still parses GeoJSON objects', async () => {
    const loc = await resolveUserLocation(
      dbReturning({ start_location: { type: 'Point', coordinates: [25.46, 45.59] } }),
      'u4',
    );
    expect(loc.fromFallback).toBe(false);
    expect(loc.lat).toBeCloseTo(45.59);
    expect(loc.lon).toBeCloseTo(25.46);
  });

  it.each<[string, unknown]>([
    ['non-hex string', 'not-a-location'],
    ['truncated WKB', SAMPLE_WKB.slice(0, 20)],
    ['WKB of a non-Point geometry', '0102000020E6100000' + SAMPLE_WKB.slice(18)],
    ['WKB with out-of-range coords', '0101000020E6100000' + '0000000000006940' + '0000000000006940'], // lon=lat=200
    ['empty object', {}],
    ['null row value', null],
  ])('falls back to Bucharest on %s', async (_label, value) => {
    const loc = await resolveUserLocation(
      dbReturning(value === null ? null : { start_location: value }),
      `u-${_label}`,
    );
    expect(loc.fromFallback).toBe(true);
    expect(loc.lat).toBeCloseTo(44.43);
    expect(loc.lon).toBeCloseTo(26.1);
  });

  it('falls back to Bucharest when the query throws', async () => {
    const loc = await resolveUserLocation(dbReturning(null, true), 'u5');
    expect(loc.fromFallback).toBe(true);
  });

  it('caches a successful resolve per user', async () => {
    const db = dbReturning({ start_location: SAMPLE_WKB });
    await resolveUserLocation(db, 'u6');
    // Second call served from cache — even a now-broken DB doesn't matter.
    const loc = await resolveUserLocation(dbReturning(null, true), 'u6');
    expect(loc.lat).toBeCloseTo(44.4323, 3);
    expect(loc.fromFallback).toBe(false);
  });
});
