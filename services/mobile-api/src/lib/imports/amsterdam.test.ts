import { describe, expect, it, vi } from 'vitest';

import {
  buildSignalExternalId,
  isRecent,
  isTileTooSmall,
  mapSignalFeature,
  rootTile,
  subdivideTile,
} from './adapters/amsterdam';
import { classifyReport } from './classify';
import { resolveAmsterdamMapping } from './mappings/amsterdam';
import { isImportableHazardType, type ImportSourceRow, type RawReport } from './types';

const amsterdam: ImportSourceRow = {
  id: 'signalen:amsterdam',
  adapter: 'signalen',
  endpoint: 'https://api.meldingen.amsterdam.nl',
  jurisdiction: 'amsterdam.nl',
  country_code: 'NL',
  enabled: true,
  alert_eligible: true,
  coordinate_precision: 'pin',
  licence: 'PENDING-CONFIRMATION',
  attribution_text: 'Meldingen — Gemeente Amsterdam',
  attribution_url: 'https://meldingen.amsterdam.nl',
  bbox_min_lat: 52.28,
  bbox_min_lon: 4.72,
  bbox_max_lat: 52.43,
  bbox_max_lon: 5.07,
  backstop_ttl_days: 21,
  cursor: {},
  last_run_at: null,
  last_ok_at: null,
  last_items_at: null,
  stale_after_days: 8,
  consecutive_failures: 0,
};

// Verbatim shape from the live endpoint, 2026-08-27.
const liveFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [4.947806334, 52.380998368] },
  properties: {
    category: {
      name: 'Onduidelijke of gevaarlijke verkeerssituatie',
      slug: 'verkeerssituaties',
      parent: { name: 'Wegen, verkeer, straatmeubilair', slug: 'wegen-verkeer-straatmeubilair' },
    },
    created_at: '2026-08-26T18:15:07.609299+00:00',
  },
};

describe('mapSignalFeature', () => {
  it('parses the live Amsterdam payload', () => {
    const r = mapSignalFeature(liveFeature);
    expect(r).not.toBeNull();
    expect(r?.lat).toBeCloseTo(52.380998, 5);
    expect(r?.lon).toBeCloseTo(4.947806, 5);
    expect(r?.categoryKey).toBe('wegen-verkeer-straatmeubilair/verkeerssituaties');
    expect(r?.reportedAt).toBe('2026-08-26T18:15:07.609Z');
  });

  it('reports no status, because the feed has no status field', () => {
    // This is what makes Amsterdam TTL-only rather than status-synced.
    expect(mapSignalFeature(liveFeature)?.status).toBeNull();
  });

  it('carries no free text, so the model can never be invoked for it', () => {
    const r = mapSignalFeature(liveFeature);
    expect(r?.title).toBeNull();
    expect(r?.description).toBeNull();
    expect(r?.address).toBeNull();
  });

  it('rejects features with missing or malformed geometry', () => {
    expect(mapSignalFeature({ ...liveFeature, geometry: null })).toBeNull();
    expect(mapSignalFeature({ ...liveFeature, geometry: { coordinates: [4.9] } })).toBeNull();
    expect(
      mapSignalFeature({ ...liveFeature, geometry: { coordinates: ['a', 'b'] } as never }),
    ).toBeNull();
  });

  it('rejects a feature with no created_at, since the id depends on it', () => {
    expect(
      mapSignalFeature({ ...liveFeature, properties: { category: liveFeature.properties.category } }),
    ).toBeNull();
  });
});

describe('buildSignalExternalId', () => {
  it('is stable across refetches of the same signal', () => {
    const a = buildSignalExternalId(4.947806334, 52.380998368, '2026-08-26T18:15:07.609299+00:00');
    const b = buildSignalExternalId(4.947806334, 52.380998368, '2026-08-26T18:15:07.609299+00:00');
    expect(a).toBe(b);
  });

  it('survives a change in float formatting precision', () => {
    // Rounding to 7dp is what stops the API emitting more decimals from
    // minting a duplicate id for a signal we already have.
    const a = buildSignalExternalId(4.947806334, 52.380998368, 'T');
    const b = buildSignalExternalId(4.9478063341111, 52.3809983681111, 'T');
    expect(a).toBe(b);
  });

  it('distinguishes two signals at the same spot at different times', () => {
    expect(buildSignalExternalId(4.9, 52.3, 'T1')).not.toBe(
      buildSignalExternalId(4.9, 52.3, 'T2'),
    );
  });

  it('distinguishes two signals at the same time in different places', () => {
    expect(buildSignalExternalId(4.9, 52.3, 'T')).not.toBe(
      buildSignalExternalId(4.91, 52.3, 'T'),
    );
  });
});

describe('quadtree', () => {
  it('splits a tile into four covering quadrants', () => {
    const kids = subdivideTile([0, 0, 10, 10]);
    expect(kids).toHaveLength(4);
    expect(kids).toContainEqual([0, 0, 5, 5]);
    expect(kids).toContainEqual([5, 5, 10, 10]);
    // Area is preserved: 4 quadrants of 25 = the original 100.
    const area = (t: readonly number[]) => (t[2] - t[0]) * (t[3] - t[1]);
    expect(kids.reduce((s, k) => s + area(k), 0)).toBeCloseTo(area([0, 0, 10, 10]), 6);
  });

  it('stops subdividing below the minimum span', () => {
    // Guards against infinite recursion on a pathological hotspot that stays
    // at the 4,000 cap however small the tile gets.
    expect(isTileTooSmall([0, 0, 0.004, 0.004])).toBe(true);
    expect(isTileTooSmall([0, 0, 0.05, 0.05])).toBe(false);
  });

  it('derives the root tile from the source bbox', () => {
    expect(rootTile(amsterdam)).toEqual([4.72, 52.28, 5.07, 52.43]);
  });

  it('returns null when the source has no bbox, so the sweep fails loudly', () => {
    expect(
      rootTile({ ...amsterdam, bbox_min_lon: null, bbox_max_lon: null }),
    ).toBeNull();
  });
});

describe('isRecent', () => {
  const now = new Date('2026-08-27T00:00:00Z');

  it('keeps a signal inside the lookback window', () => {
    expect(isRecent('2026-08-20T00:00:00Z', now)).toBe(true);
  });

  it('drops one outside it', () => {
    // Date filtering is impossible server-side — the API ignores every date
    // param and returns everything back to 2021 — so this filter is the only
    // thing stopping five-year-old signals being imported.
    expect(isRecent('2021-05-21T00:00:00Z', now)).toBe(false);
  });

  it('drops unusable timestamps rather than admitting them', () => {
    expect(isRecent(null, now)).toBe(false);
    expect(isRecent('not-a-date', now)).toBe(false);
  });
});

describe('resolveAmsterdamMapping', () => {
  it('maps the cycle-path maintenance category', () => {
    expect(resolveAmsterdamMapping('onderhoud-fietspad')).toMatchObject({
      kind: 'type',
      hazardType: 'poor_surface',
    });
  });

  it('maps the dangerous-traffic-situation category', () => {
    expect(resolveAmsterdamMapping('verkeerssituaties')).toMatchObject({
      kind: 'type',
      hazardType: 'dangerous_intersection',
    });
  });

  it('maps the highest-volume category (diversions) to narrow_street', () => {
    expect(resolveAmsterdamMapping('omleiding')).toMatchObject({
      kind: 'type',
      hazardType: 'narrow_street',
    });
  });

  it('handles the live spelling variant of the drain category', () => {
    // The published tree says `put-riolering-verstopt`; live data emits
    // `putrioleringverstopt`.
    expect(resolveAmsterdamMapping('putrioleringverstopt')).toMatchObject({ kind: 'type' });
    expect(resolveAmsterdamMapping('put-riolering-verstopt')).toMatchObject({ kind: 'type' });
  });

  it('drops the high-volume non-cycling categories', () => {
    for (const slug of ['lantaarnpaal-straatverlichting', 'veegzwerfvuil', 'grofvuil', 'ratten']) {
      expect(resolveAmsterdamMapping(slug)).toEqual({ kind: 'irrelevant' });
    }
  });

  it('sends an UNKNOWN slug to review, never to irrelevant', () => {
    // There is no free text here, so a model cannot resolve it. Dropping it
    // silently would hide every new category the city introduces.
    expect(resolveAmsterdamMapping('een-nieuwe-categorie')).toMatchObject({ kind: 'review' });
    expect(resolveAmsterdamMapping('')).toMatchObject({ kind: 'review' });
  });

  it('drops an unknown slug under any non-hazard-bearing parent', () => {
    // Allowlist, not blocklist: only 3 of Amsterdam's 14 parents can contain a
    // riding hazard, so a new slug under any of the other 11 drops without a
    // human — whatever the city names it.
    for (const parent of [
      'afval', 'overlast-van-dieren', 'openbaar-groen-en-water', 'schoon',
      'wonen', 'overlast-op-het-water', 'overlast-van-en-door-personen-of-groepen',
      'overlast-bedrijven-en-horeca', 'ondermijning', 'overig',
      'boom-doodontbreektinspectie',
    ]) {
      expect(resolveAmsterdamMapping('een-heel-nieuwe-slug', parent)).toEqual({
        kind: 'irrelevant',
      });
    }
  });

  it('reviews an unknown slug under each hazard-bearing parent', () => {
    for (const parent of [
      'wegen-verkeer-straatmeubilair',
      'civiele-constructies',
      'overlast-in-de-openbare-ruimte',
    ]) {
      expect(resolveAmsterdamMapping('een-heel-nieuwe-slug', parent)).toMatchObject({
        kind: 'review',
      });
    }
  });

  it('decides the slugs the first live sweep surfaced, so they leave the queue', () => {
    for (const slug of [
      'fietswrak', 'straatmeubilair', 'bruggen', 'graffitiwildplak',
      'uitwerpselen', 'daklozen-bedelen', 'jongerenoverlast', 'overig',
      'overige-overlast-door-personen', 'overig-boten',
    ]) {
      expect(resolveAmsterdamMapping(slug)).toEqual({ kind: 'irrelevant' });
    }
  });

  it('still reviews an unknown slug under a road/traffic parent', () => {
    expect(
      resolveAmsterdamMapping('iets-nieuws', 'wegen-verkeer-straatmeubilair'),
    ).toMatchObject({ kind: 'review' });
  });

  it('only emits hazard types the live CHECK constraint accepts', () => {
    for (const slug of [
      'omleiding',
      'verkeerssituaties',
      'onderhoud-fietspad',
      'onderhoud-stoep-straat-en-fietspad',
      'putrioleringverstopt',
      'hinderlijk-geplaatst-object',
      'parkeeroverlast',
      'verkeerslicht',
    ]) {
      const o = resolveAmsterdamMapping(slug);
      expect(o.kind).toBe('type');
      if (o.kind === 'type') expect(isImportableHazardType(o.hazardType)).toBe(true);
    }
  });
});

describe('classifyReport for Amsterdam', () => {
  const report = (categoryKey: string): RawReport => ({
    ...(mapSignalFeature(liveFeature) as RawReport),
    categoryKey,
  });

  it('auto-approves a mapped category without touching the model', async () => {
    const llm = vi.fn();
    const r = await classifyReport(
      amsterdam,
      report('wegen-verkeer-straatmeubilair/verkeerssituaties'),
      AbortSignal.timeout(1000),
      { llm },
    );
    expect(r.reviewState).toBe('auto_approved');
    expect(r.hazardType).toBe('dangerous_intersection');
    expect(llm).not.toHaveBeenCalled();
    expect(r.usage).toBeNull();
  });

  it('queues an unknown category for review without calling the model', async () => {
    const llm = vi.fn();
    const r = await classifyReport(
      amsterdam,
      report('wegen-verkeer-straatmeubilair/onbekend'),
      AbortSignal.timeout(1000),
      { llm },
    );
    expect(r.reviewState).toBe('pending');
    expect(r.rejectReason).toContain('amsterdam_unmapped_slug');
    // Critically: no model call. There is nothing for it to read.
    expect(llm).not.toHaveBeenCalled();
    expect(r.modelInvoked).toBe(false);
  });

  it('never invokes the model for this source at all', async () => {
    const llm = vi.fn();
    for (const key of [
      'wegen-verkeer-straatmeubilair/omleiding',
      'afval/grofvuil',
      'afval/heel-nieuw',
      'wegen-verkeer-straatmeubilair/onbekend',
    ]) {
      await classifyReport(amsterdam, report(key), AbortSignal.timeout(1000), { llm });
    }
    expect(llm).not.toHaveBeenCalled();
  });
});
