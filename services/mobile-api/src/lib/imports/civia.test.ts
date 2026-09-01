// @vitest-environment node
/**
 * Civia adapter + mapping — unit tests.
 *
 * Fixtures are verbatim excerpts captured from civia.ro on 2026-09-01. The
 * parsers exist because Civia has no public API, so these tests are the only
 * thing standing between a site redesign and a silent "0 imported, all green".
 */
import { describe, expect, it } from 'vitest';

import {
  externalIdFromLink,
  normaliseCiviaStatus,
  parseCoords,
  parseDetailStatus,
  parseFeed,
  parseFeedDescription,
  slugToCategoryKey,
} from './adapters/civia';
import { CIVIA_CATEGORY_MAP, resolveCiviaMapping } from './mappings/civia';
import { IMPORTABLE_HAZARD_TYPES } from './types';

// Verbatim from https://civia.ro/feed.xml, 2026-09-01.
const FEED_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
      <title>Mașini parcate neregulamentar pe trotuar</title>
      <link>https://civia.ro/sesizari/00297</link>
      <guid isPermaLink="true">https://civia.ro/sesizari/00297</guid>
      <pubDate>Tue, 01 Sep 2026 14:29:09 GMT</pubDate>
      <category>parcare</category>
      <description>[TRIMIS] Pe Strada Anișoara Odeanu din Timișoara, mai multe autovehicule sunt staționate pe trotuar. — Strada Anișoara Odeanu, Timișoara, null</description>
    </item>
  <item>
      <title>Groapă în carosabil</title>
      <link>https://civia.ro/sesizari/00296</link>
      <pubDate>Mon, 31 Aug 2026 09:00:00 GMT</pubDate>
      <category>groapa</category>
      <description>[INREGISTRATA] Groapă adâncă pe carosabil. — Bulevardul Unirii, București</description>
    </item>
</channel></rss>`;

// Verbatim from https://civia.ro/sesizari/00297 (RSC flight payload excerpt).
const DETAIL_FIXTURE =
  '["$","$L5d",null,{"coords":[45.7283665975543,21.2408217796027],' +
  '"label":"Mașini parcate neregulamentar pe trotuar","color":"#0E7490",' +
  '"zoom":16,"height":"320px","strada":null}]';

describe('civia — feed parsing', () => {
  it('extracts both items with ids, categories and dates', () => {
    const items = parseFeed(FEED_FIXTURE);
    expect(items).toHaveLength(2);
    expect(items[0].externalId).toBe('00297');
    expect(items[0].categoryKey).toBe('parcare');
    expect(items[0].reportedAt).toBe('2026-09-01T14:29:09.000Z');
    expect(items[1].externalId).toBe('00296');
    expect(items[1].categoryKey).toBe('groapa');
  });

  it('splits the [STATUS] prefix, prose and trailing address', () => {
    const items = parseFeed(FEED_FIXTURE);
    expect(items[0].status).toBe('open');
    expect(items[0].description).toBe(
      'Pe Strada Anișoara Odeanu din Timișoara, mai multe autovehicule sunt staționate pe trotuar.',
    );
    expect(items[0].address).toBe('Strada Anișoara Odeanu, Timișoara');
  });

  it('drops the literal "null" Civia emits for a missing street field', () => {
    // Left in, the address reads "…, Timișoara, null" on the detail sheet.
    const parsed = parseFeedDescription('[TRIMIS] Ceva. — Strada X, Timișoara, null');
    expect(parsed.address).toBe('Strada X, Timișoara');
  });

  it('survives a description with no status prefix and no address', () => {
    const parsed = parseFeedDescription('Doar text simplu');
    expect(parsed).toEqual({ status: null, text: 'Doar text simplu', address: null });
  });

  it('returns nothing for a feed whose item shape changed', () => {
    expect(parseFeed('<rss><channel><entry>nope</entry></channel></rss>')).toEqual([]);
  });

  it('pulls the id out of a permalink', () => {
    expect(externalIdFromLink('https://civia.ro/sesizari/00297')).toBe('00297');
    expect(externalIdFromLink('https://civia.ro/petitii/12')).toBeNull();
    expect(externalIdFromLink(null)).toBeNull();
  });
});

describe('civia — status normalisation', () => {
  it('treats resolved-like statuses as closed, with or without diacritics', () => {
    for (const value of ['REZOLVAT', 'Rezolvată', 'rezolvata', 'Respinsă', 'CLASAT']) {
      expect(normaliseCiviaStatus(value)).toBe('closed');
    }
  });

  it('treats everything else as open — never expire a live hazard on a guess', () => {
    for (const value of ['INREGISTRATA', 'TRIMIS', 'Termen depășit', 'ceva nou']) {
      expect(normaliseCiviaStatus(value)).toBe('open');
    }
  });

  it('returns null for absent input', () => {
    expect(normaliseCiviaStatus(null)).toBeNull();
    expect(normaliseCiviaStatus('   ')).toBeNull();
  });

  it('reads a closing status off a detail page', () => {
    expect(parseDetailStatus('<span>Rezolvată</span>')).toBe('closed');
  });
});

describe('civia — coordinate parsing', () => {
  it('extracts coords from the RSC payload', () => {
    expect(parseCoords(DETAIL_FIXTURE)).toEqual({
      lat: 45.7283665975543,
      lon: 21.2408217796027,
    });
  });

  it('handles the escaped-quote form the flight stream also emits', () => {
    expect(parseCoords('\\"coords\\":[44.4612,26.1109]')).toEqual({
      lat: 44.4612,
      lon: 26.1109,
    });
  });

  it('returns null when the payload shape moves — the caller then throws', () => {
    // This is the whole point: a Next.js redeploy that renames `coords` must
    // surface as a failed run, not as a quiet zero-import.
    expect(parseCoords('{"position":[45.7,21.2]}')).toBeNull();
    expect(parseCoords('')).toBeNull();
  });
});

describe('civia — category mapping', () => {
  it('maps the cycling-relevant categories to valid hazard types', () => {
    const expected = {
      groapa: 'pothole',
      trotuar: 'poor_surface',
      parcare: 'illegally_parked_car',
      parcare_trasata: 'illegally_parked_car',
      masina_abandonata: 'illegally_parked_car',
      ocupare_domeniu: 'blocked_bike_lane',
      semafor: 'dangerous_intersection',
      trecere_pietoni: 'dangerous_intersection',
      caini: 'aggro_dogs',
    } as const;

    for (const [slug, hazardType] of Object.entries(expected)) {
      const outcome = resolveCiviaMapping(slug);
      expect(outcome.kind, slug).toBe('type');
      if (outcome.kind === 'type') expect(outcome.hazardType, slug).toBe(hazardType);
    }
  });

  it('only ever names hazard types the DB will accept', () => {
    for (const entry of Object.values(CIVIA_CATEGORY_MAP)) {
      if (typeof entry === 'object') {
        expect(IMPORTABLE_HAZARD_TYPES).toContain(entry.type);
      }
    }
  });

  it('drops stalpisori — a REQUEST for bollards, not a present hazard', () => {
    // 36% of the feed. Pinning these would claim something is there that
    // isn't; the underlying complaint arrives as `parcare` when a person
    // reports it as a hazard.
    expect(resolveCiviaMapping('stalpisori')).toEqual({ kind: 'irrelevant' });
  });

  it('drops the non-cycling categories', () => {
    for (const slug of ['gunoi', 'canalizare', 'copac', 'mediu', 'transport', 'mobilier']) {
      expect(resolveCiviaMapping(slug), slug).toEqual({ kind: 'irrelevant' });
    }
  });

  it('sends the catch-all category to the model rather than dropping it', () => {
    expect(resolveCiviaMapping('altele')).toEqual({ kind: 'llm' });
  });

  it('sends an UNKNOWN category to human review, not to irrelevant', () => {
    // Civia is young and still adding categories; silently dropping a new one
    // would hide it forever.
    const outcome = resolveCiviaMapping('categorie_noua_2027');
    expect(outcome.kind).toBe('review');
    if (outcome.kind === 'review') expect(outcome.reason).toContain('categorie_noua_2027');
  });

  it('gives every mapped entry a rider-facing English summary', () => {
    for (const entry of Object.values(CIVIA_CATEGORY_MAP)) {
      if (typeof entry === 'object') {
        expect(entry.summary.length).toBeGreaterThan(10);
        expect(entry.summary).not.toMatch(/[ăâîșț]/i);
      }
    }
  });
});

describe('civia — slug normalisation', () => {
  it('folds the detail page long slug onto the feed short key', () => {
    expect(slugToCategoryKey('groapa-in-asfalt')).toBe('groapa');
    expect(slugToCategoryKey('parcare-pe-trotuar')).toBe('parcare');
    expect(slugToCategoryKey('caini-fara-stapan')).toBe('caini');
  });

  it('passes an already-short key through untouched', () => {
    expect(slugToCategoryKey('groapa')).toBe('groapa');
  });

  it('maps every long slug onto a key the mapping table knows', () => {
    for (const long of ['groapa-in-asfalt', 'semafor-defect', 'stalpisori-anti-parcare']) {
      const outcome = resolveCiviaMapping(slugToCategoryKey(long));
      expect(outcome.kind, long).not.toBe('review');
    }
  });
});

// ---------------------------------------------------------------------------
// Round-trip suppression
// ---------------------------------------------------------------------------

import { suppressRoundTrips } from './run';
import type { ImportSourceRow, RawReport } from './types';

const civiaSource = (overrides: Partial<ImportSourceRow> = {}): ImportSourceRow =>
  ({
    id: 'civia',
    adapter: 'civia',
    endpoint: 'https://civia.ro',
    jurisdiction: 'civia.ro',
    country_code: 'RO',
    enabled: true,
    alert_eligible: false,
    coordinate_precision: 'geocoded',
    licence: 'consent',
    attribution_text: 'Civia.ro',
    attribution_url: 'https://civia.ro',
    bbox_min_lat: 43.6,
    bbox_min_lon: 20.2,
    bbox_max_lat: 48.3,
    bbox_max_lon: 29.75,
    backstop_ttl_days: 30,
    cursor: {},
    last_run_at: null,
    last_ok_at: null,
    last_items_at: null,
    stale_after_days: 7,
    consecutive_failures: 0,
    ...overrides,
  }) as ImportSourceRow;

const report = (lat: number, lon: number, categoryKey: string): RawReport => ({
  externalId: `${lat},${lon},${categoryKey}`,
  lat,
  lon,
  categoryKey,
  categoryLabel: categoryKey,
  title: null,
  description: null,
  address: null,
  status: 'open',
  reportedAt: null,
  updatedAt: null,
  mediaUrl: null,
  raw: {},
});

/** Minimal stand-in for `db.from('sesizari').select(...).gte(...)`. */
const dbReturning = (rows: unknown, error: unknown = null) =>
  ({
    from: () => ({
      select: () => ({
        gte: () => Promise.resolve({ data: rows, error }),
      }),
    }),
  }) as never;

const BUCHAREST = { lat: 44.4612, lon: 26.1109 };

describe('suppressRoundTrips', () => {
  it('drops an import that matches one of our own hand-offs', async () => {
    const db = dbReturning([
      { hazard_type: 'pothole', lat: BUCHAREST.lat, lon: BUCHAREST.lon },
    ]);
    const { kept, suppressed } = await suppressRoundTrips(db, civiaSource(), [
      report(BUCHAREST.lat, BUCHAREST.lon, 'groapa'),
    ]);
    expect(suppressed).toBe(1);
    expect(kept).toHaveLength(0);
  });

  it('keeps a DIFFERENT hazard type at the same spot', async () => {
    // The bug this pins: matching on distance alone would let a rider's
    // parking sesizare hide an unrelated pothole across the street.
    const db = dbReturning([
      { hazard_type: 'illegally_parked_car', lat: BUCHAREST.lat, lon: BUCHAREST.lon },
    ]);
    const { kept, suppressed } = await suppressRoundTrips(db, civiaSource(), [
      report(BUCHAREST.lat, BUCHAREST.lon, 'groapa'),
    ]);
    expect(suppressed).toBe(0);
    expect(kept).toHaveLength(1);
  });

  it('keeps the same type far enough away', async () => {
    const db = dbReturning([
      { hazard_type: 'pothole', lat: BUCHAREST.lat, lon: BUCHAREST.lon },
    ]);
    // ~1.1 km north.
    const { kept, suppressed } = await suppressRoundTrips(db, civiaSource(), [
      report(BUCHAREST.lat + 0.01, BUCHAREST.lon, 'groapa'),
    ]);
    expect(suppressed).toBe(0);
    expect(kept).toHaveLength(1);
  });

  it('keeps ambiguous categories — a duplicate beats hiding a real report', async () => {
    const db = dbReturning([
      { hazard_type: 'pothole', lat: BUCHAREST.lat, lon: BUCHAREST.lon },
    ]);
    const { kept, suppressed } = await suppressRoundTrips(db, civiaSource(), [
      report(BUCHAREST.lat, BUCHAREST.lon, 'altele'),
    ]);
    expect(suppressed).toBe(0);
    expect(kept).toHaveLength(1);
  });

  it('skips the lookup entirely for non-Romanian sources', async () => {
    let queried = false;
    const db = {
      from: () => {
        queried = true;
        return { select: () => ({ gte: () => Promise.resolve({ data: [], error: null }) }) };
      },
    } as never;
    const { kept } = await suppressRoundTrips(db, civiaSource({ country_code: 'DE' }), [
      report(50.9, 6.9, 'groapa'),
    ]);
    expect(queried).toBe(false);
    expect(kept).toHaveLength(1);
  });

  it('imports everything when the lookup fails — never lose a hazard to it', async () => {
    const db = dbReturning(null, { message: 'boom' });
    const { kept, suppressed } = await suppressRoundTrips(db, civiaSource(), [
      report(BUCHAREST.lat, BUCHAREST.lon, 'groapa'),
    ]);
    expect(suppressed).toBe(0);
    expect(kept).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Zaragoza mapping (added 2026-09-01 alongside the Spain sweep)
// ---------------------------------------------------------------------------

import { ZARAGOZA_SERVICE_MAP, resolveZaragozaMapping } from './mappings/zaragoza';

describe('zaragoza — category mapping', () => {
  it('maps holes in the riding surface to pothole', () => {
    // 11 = Bache under Acera, 61 = Bache under Calzada, 81/93 = missing
    // manhole / chamber lid — the same thing to a wheel, and worse.
    for (const code of ['11', '61', '81', '93', '83']) {
      const outcome = resolveZaragozaMapping(code);
      expect(outcome.kind, code).toBe('type');
      if (outcome.kind === 'type') expect(outcome.hazardType, code).toBe('pothole');
    }
  });

  it('maps degraded surfaces, ice and oil spills to poor_surface', () => {
    for (const code of ['12', '22', '51', '62', '63', '262', '1000023']) {
      const outcome = resolveZaragozaMapping(code);
      expect(outcome.kind, code).toBe('type');
      if (outcome.kind === 'type') expect(outcome.hazardType, code).toBe('poor_surface');
    }
  });

  it('maps the traffic-signal category to dangerous_intersection', () => {
    const outcome = resolveZaragozaMapping('103677952');
    expect(outcome.kind).toBe('type');
    if (outcome.kind === 'type') expect(outcome.hazardType).toBe('dangerous_intersection');
  });

  it('sends generic parents to the model rather than guessing a defect', () => {
    // The reporter picked an object but no defect.
    for (const code of ['10', '60', '80', '7733248']) {
      expect(resolveZaragozaMapping(code), code).toEqual({ kind: 'llm' });
    }
  });

  it('sends Bicicletas to the model — it is policy suggestions, not a jackpot', () => {
    // The sampled report was prose about network planning with a null
    // location. A dedicated cycling category is tempting precisely because it
    // looks like a win; the model filters the suggestions out.
    expect(resolveZaragozaMapping('9043969')).toEqual({ kind: 'llm' });
  });

  it('drops the non-cycling categories', () => {
    for (const code of ['234', '254', '90', '97550336', '5144576']) {
      expect(resolveZaragozaMapping(code), code).toEqual({ kind: 'irrelevant' });
    }
  });

  it('sends an unknown code to review — the codes are flat, nothing to inherit', () => {
    const outcome = resolveZaragozaMapping('99999999');
    expect(outcome.kind).toBe('review');
    if (outcome.kind === 'review') expect(outcome.reason).toContain('99999999');
  });

  it('only ever names hazard types the DB will accept', () => {
    for (const entry of Object.values(ZARAGOZA_SERVICE_MAP)) {
      if (typeof entry === 'object') expect(IMPORTABLE_HAZARD_TYPES).toContain(entry.type);
    }
  });

  it('gives every mapped entry a rider-facing English summary', () => {
    for (const entry of Object.values(ZARAGOZA_SERVICE_MAP)) {
      if (typeof entry === 'object') {
        expect(entry.summary.length).toBeGreaterThan(10);
        expect(entry.summary).not.toMatch(/[áéíóúñ]/i);
      }
    }
  });
});
