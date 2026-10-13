import { describe, expect, it } from 'vitest';

import {
  FIXMYSTREET_RESULT_CAP,
  FULL_SWEEP_LOOKBACK_MS,
  buildRequestsUrl,
  fetchFixMyStreetPage,
  planSweep,
} from './adapters/fixmystreet';
import { mapOpen311Request } from './adapters/open311';
import {
  CLOSING_COUNCIL_MAX_AGE_DAYS,
  TIMER_COUNCIL_MAX_AGE_DAYS,
  fixMyStreetExpiresAt,
  resolveFixMyStreetMapping,
} from './mappings/fixmystreet';
import { fixMyStreetAdapter } from './adapters/fixmystreet';
import { partitionUnpublishable, planReseenClosures } from './run';
import { AdapterFetchError, type ImportSourceRow, type RawReport } from './types';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const source: ImportSourceRow = {
  id: 'fixmystreet:uk',
  adapter: 'fixmystreet',
  endpoint: 'https://www.fixmystreet.com/open311/v2',
  jurisdiction: 'fixmystreet',
  country_code: 'GB',
  enabled: true,
  alert_eligible: true,
  coordinate_precision: 'pin',
  pagination_style: 'page',
  licence: 'UNCONFIRMED-OWNER-OVERRIDE-2026-10-13',
  attribution_text: 'FixMyStreet',
  attribution_url: 'https://www.fixmystreet.com',
  bbox_min_lat: 49.8,
  bbox_min_lon: -8.7,
  bbox_max_lat: 60.9,
  bbox_max_lon: 1.8,
  backstop_ttl_days: 28,
  cursor: {},
  last_run_at: null,
  last_ok_at: null,
  last_items_at: null,
  stale_after_days: 8,
  consecutive_failures: 0,
};

// Verbatim shape from the live feed, 2026-10-12 (description trimmed).
const liveRow = {
  service_request_id: 9940693,
  title: 'Pothole on a pavement - More than 100mm wide and more than 2',
  description: 'Pothole on a pavement - More than 100mm wide and more than 20mm deep',
  lat: '51.240185',
  long: '-0.567719',
  service_code: 'Pothole on a pavement - More than 100mm wide and 20mm deep - Potholes',
  service_name: 'Pothole on a pavement - More than 100mm wide and 20mm deep - Potholes',
  requested_datetime: '2026-08-13T05:56:07+01:00',
  updated_datetime: '2026-08-14T11:14:23+01:00',
  status: 'closed',
  agency_responsible: { recipient: ['Surrey County Council'] },
};

const report = (overrides: {
  category: string;
  title?: string;
  description?: string;
  council?: string;
  reportedAt?: string | null;
  status?: 'open' | 'closed';
  id?: string;
}): RawReport => ({
  externalId: overrides.id ?? '1',
  lat: 51.5,
  lon: -0.1,
  categoryKey: overrides.category,
  categoryLabel: overrides.category,
  title: overrides.title ?? null,
  description: overrides.description ?? null,
  address: null,
  status: overrides.status ?? 'open',
  reportedAt: overrides.reportedAt === undefined ? '2026-10-01T09:00:00.000Z' : overrides.reportedAt,
  updatedAt: null,
  mediaUrl: null,
  raw: { agency_responsible: { recipient: [overrides.council ?? 'Surrey County Council'] } },
});

const kindOf = (r: RawReport): string => {
  const outcome = resolveFixMyStreetMapping(r);
  return outcome.kind === 'type' ? outcome.hazardType : outcome.kind;
};

describe('mapOpen311Request on the FixMyStreet shape', () => {
  it('coerces the numeric id and string coordinates', () => {
    const mapped = mapOpen311Request(liveRow);
    expect(mapped?.externalId).toBe('9940693');
    expect(mapped?.lat).toBeCloseTo(51.240185, 5);
    expect(mapped?.lon).toBeCloseTo(-0.567719, 5);
    expect(mapped?.status).toBe('closed');
  });
});

describe('resolveFixMyStreetMapping', () => {
  it('publishes a road pothole directly', () => {
    expect(
      kindOf(report({ category: 'Pothole on a road - More than 150mm wide and 40mm deep - Potholes' })),
    ).toBe('pothole');
    expect(kindOf(report({ category: 'Potholes', description: 'Deep pothole at the junction' }))).toBe(
      'pothole',
    );
  });

  it('drops a pavement pothole filed beside the road one (live Surrey categories)', () => {
    const mapped = mapOpen311Request(liveRow);
    expect(mapped).not.toBeNull();
    expect(kindOf(mapped as RawReport)).toBe('irrelevant');
  });

  it('drops footway-coded potholes ("FW6") but keeps carriageway ones ("CW6")', () => {
    expect(kindOf(report({ category: 'TMC - Defects -FW6 Potholes' }))).toBe('irrelevant');
    expect(kindOf(report({ category: 'TMC - Defects -CW6 Potholes' }))).toBe('pothole');
  });

  it('drops a pothole whose text only ever talks about the pavement', () => {
    expect(
      kindOf(report({ category: 'Potholes', description: 'Big hole in the pavement outside number 12' })),
    ).toBe('irrelevant');
  });

  it('treats a cycleway pothole as a hazard', () => {
    expect(kindOf(report({ category: 'Pothole on road/cycleway' }))).toBe('pothole');
  });

  it('does not mistake abandoned hire bikes for a cycling hazard', () => {
    expect(kindOf(report({ category: 'Abandoned Lime bike or scooter' }))).toBe('irrelevant');
    expect(kindOf(report({ category: 'Abandoned Forest bike' }))).toBe('irrelevant');
  });

  it('does not read "Damaged road sign" as road damage', () => {
    expect(kindOf(report({ category: 'Damaged road sign, not causing obstruction' }))).toBe(
      'irrelevant',
    );
  });

  it('drops pavement surface categories', () => {
    expect(kindOf(report({ category: 'Trip hazard/uneven surface' }))).toBe('irrelevant');
    expect(kindOf(report({ category: 'Slabs - Uneven / Damaged / Cracked' }))).toBe('irrelevant');
  });

  it('maps road-surface defects with a summary that fits the defect', () => {
    const drain = resolveFixMyStreetMapping(report({ category: 'Blocked drain' }));
    expect(drain).toMatchObject({ kind: 'type', hazardType: 'poor_surface' });
    expect(drain.kind === 'type' && drain.summaryEn).toMatch(/drain/i);

    const cover = resolveFixMyStreetMapping(report({ category: 'Manhole cover - sunken, loose or rattling' }));
    expect(cover.kind === 'type' && cover.summaryEn).toMatch(/manhole/i);
  });

  it('keeps "Other road surface issue" although a bare "Other" is dropped', () => {
    expect(kindOf(report({ category: 'Other road surface issue' }))).toBe('poor_surface');
    expect(kindOf(report({ category: 'Other' }))).toBe('irrelevant');
  });

  it('sends mixed road/pavement categories to the model', () => {
    expect(kindOf(report({ category: 'Trees' }))).toBe('llm');
    expect(kindOf(report({ category: 'Traffic lights' }))).toBe('llm');
    expect(kindOf(report({ category: 'Hedges' }))).toBe('llm');
    expect(kindOf(report({ category: 'Pavement and Cycle path' }))).toBe('llm');
  });

  it('drops private vegetation outright', () => {
    expect(kindOf(report({ category: 'Overgrown Private Vegetation' }))).toBe('irrelevant');
  });

  it('reads a category that names both road and pavement instead of dropping it', () => {
    expect(kindOf(report({ category: 'Road and pavement defects' }))).toBe('llm');
    expect(kindOf(report({ category: 'Carriageway & footway faults' }))).toBe('llm');
  });

  it('is not fooled by a street name: "Station Road" is not evidence of the road surface', () => {
    expect(
      kindOf(report({ category: 'Potholes', description: 'Pavement outside 12 Station Road is broken' })),
    ).toBe('irrelevant');
    expect(
      kindOf(report({ category: 'Potholes', description: 'Hole in the road outside 12 Station Road, pavement fine' })),
    ).toBe('pothole');
  });

  it('sends parking to the model only when it names a cycle lane', () => {
    expect(kindOf(report({ category: 'Car parking', title: 'Cars parked in bike lane.' }))).toBe('llm');
    expect(
      kindOf(report({ category: 'Parking enforcement', description: 'Van blocking my garage entrance' })),
    ).toBe('irrelevant');
  });
});

describe('fixMyStreetExpiresAt', () => {
  const reportedAt = '2026-10-01T09:00:00.000Z';
  const plusDays = (days: number) => new Date(Date.parse(reportedAt) + days * DAY).toISOString();

  it('gives councils that close reports 8 weeks from the report date', () => {
    expect(fixMyStreetExpiresAt(report({ category: 'Potholes', council: 'Surrey County Council', reportedAt }))).toBe(
      plusDays(CLOSING_COUNCIL_MAX_AGE_DAYS),
    );
  });

  it('puts silent and unknown councils on a 4-week timer', () => {
    expect(fixMyStreetExpiresAt(report({ category: 'Potholes', council: 'Essex County Council', reportedAt }))).toBe(
      plusDays(TIMER_COUNCIL_MAX_AGE_DAYS),
    );
    expect(fixMyStreetExpiresAt(report({ category: 'Potholes', council: 'Nowhere Council', reportedAt }))).toBe(
      plusDays(TIMER_COUNCIL_MAX_AGE_DAYS),
    );
  });

  it('puts Dumfries and Galloway on the timer: it closes reports on receipt', () => {
    expect(
      fixMyStreetExpiresAt(report({ category: 'Potholes', council: 'Dumfries and Galloway Council', reportedAt })),
    ).toBe(plusDays(TIMER_COUNCIL_MAX_AGE_DAYS));
  });

  it('returns null without a report date, so the backstop applies', () => {
    expect(fixMyStreetExpiresAt(report({ category: 'Potholes', reportedAt: null }))).toBeNull();
  });
});

describe('planSweep', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');

  it('starts with a full 8-week sweep', () => {
    const plan = planSweep({}, now);
    expect(plan?.kind).toBe('full');
    expect(plan?.windows[0]?.[0]).toBe(now - FULL_SWEEP_LOOKBACK_MS);
    expect(plan?.windows.at(-1)?.[1]).toBe(now);
  });

  it('does nothing within 6 hours of the last sweep', () => {
    const lastSweepEndedAt = new Date(now - 2 * HOUR).toISOString();
    expect(planSweep({ lastSweepEndedAt, lastFullSweepAt: lastSweepEndedAt }, now)).toBeNull();
  });

  it('runs an incremental sweep with a 12-hour overlap between full ones', () => {
    const plan = planSweep(
      {
        lastSweepEndedAt: new Date(now - 7 * HOUR).toISOString(),
        lastFullSweepAt: new Date(now - 3 * DAY).toISOString(),
      },
      now,
    );
    expect(plan?.kind).toBe('incremental');
    expect(plan?.windows[0]?.[0]).toBe(now - 19 * HOUR);
  });

  it('runs a full sweep again once the last one is a week old', () => {
    const plan = planSweep(
      {
        lastSweepEndedAt: new Date(now - 7 * HOUR).toISOString(),
        lastFullSweepAt: new Date(now - 8 * DAY).toISOString(),
      },
      now,
    );
    expect(plan?.kind).toBe('full');
  });
});

describe('fetchFixMyStreetPage', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  const signal = new AbortController().signal;
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ ...liveRow, service_request_id: 1000 + i, status: 'open' }));

  it('splits a window that comes back at the cap, without emitting items', async () => {
    const result = await fetchFixMyStreetPage(
      source,
      { windows: [[0, 6 * HOUR], [6 * HOUR, 12 * HOUR]] },
      signal,
      { nowMs: now, delayMs: 0, fetcher: async () => rows(FIXMYSTREET_RESULT_CAP) },
    );
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor?.windows).toEqual([[0, 3 * HOUR], [3 * HOUR, 6 * HOUR], [6 * HOUR, 12 * HOUR]]);
  });

  it('emits a window under the cap and moves on to the next', async () => {
    const result = await fetchFixMyStreetPage(
      source,
      { windows: [[0, HOUR], [HOUR, 2 * HOUR]] },
      signal,
      { nowMs: now, delayMs: 0, fetcher: async () => rows(3) },
    );
    expect(result.items).toHaveLength(3);
    expect(result.nextCursor?.windows).toEqual([[HOUR, 2 * HOUR]]);
  });

  it('records a completed full sweep in the idle cursor', async () => {
    const result = await fetchFixMyStreetPage(
      source,
      {
        windows: [[now - HOUR, now]],
        sweepKind: 'full',
        sweepStartedAt: '2026-10-13T05:00:00.000Z',
        sweepEndMs: now,
      },
      signal,
      { nowMs: now, delayMs: 0, fetcher: async () => rows(2) },
    );
    expect(result.nextCursor).toBeNull();
    expect(result.idleCursor?.lastSweepEndedAt).toBe(new Date(now).toISOString());
    expect(result.idleCursor?.lastFullSweepAt).toBe('2026-10-13T05:00:00.000Z');
    expect(result.idleCursor?.windows).toEqual([]);
  });

  it('fetches nothing and keeps its state when it is too soon for a sweep', async () => {
    const cursor = {
      lastSweepEndedAt: new Date(now - HOUR).toISOString(),
      lastFullSweepAt: new Date(now - DAY).toISOString(),
    };
    let called = false;
    const result = await fetchFixMyStreetPage(source, cursor, signal, {
      nowMs: now,
      delayMs: 0,
      fetcher: async () => {
        called = true;
        return [];
      },
    });
    expect(called).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.idleCursor).toEqual(cursor);
  });

  it('counts a failed window across runs and keeps the run failing', async () => {
    const cursor = { windows: [[0, HOUR], [HOUR, 2 * HOUR]] };
    const error = await fetchFixMyStreetPage(source, cursor, signal, {
      nowMs: now,
      delayMs: 0,
      fetcher: async () => {
        throw new Error('HTTP 500');
      },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdapterFetchError);
    expect((error as AdapterFetchError).cursor.windowFailures).toBe(1);
    expect((error as AdapterFetchError).cursor.windows).toEqual(cursor.windows);
  });

  it('skips a window after three failures instead of blocking the source', async () => {
    const error = await fetchFixMyStreetPage(
      source,
      { windows: [[0, HOUR], [HOUR, 2 * HOUR]], windowFailures: 2 },
      signal,
      {
        nowMs: now,
        delayMs: 0,
        fetcher: async () => {
          throw new Error('HTTP 500');
        },
      },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdapterFetchError);
    const kept = (error as AdapterFetchError).cursor;
    expect(kept.windows).toEqual([[HOUR, 2 * HOUR]]);
    expect(kept.windowFailures).toBe(0);
    expect(kept.skippedWindowCount).toBe(1);
    expect((error as AdapterFetchError).message).toMatch(/window skipped/);
  });

  it('resets the failure count once a window succeeds', async () => {
    const result = await fetchFixMyStreetPage(
      source,
      { windows: [[0, HOUR], [HOUR, 2 * HOUR]], windowFailures: 2 },
      signal,
      { nowMs: now, delayMs: 0, fetcher: async () => rows(1) },
    );
    expect(result.nextCursor?.windowFailures).toBe(0);
  });

  it('warns when a window at the split floor is still full', async () => {
    const result = await fetchFixMyStreetPage(
      source,
      { windows: [[0, 60_000], [60_000, HOUR]] },
      signal,
      { nowMs: now, delayMs: 0, fetcher: async () => rows(FIXMYSTREET_RESULT_CAP) },
    );
    expect(result.items).toHaveLength(FIXMYSTREET_RESULT_CAP);
    expect(result.warnings?.[0]).toMatch(/split floor/);
  });

  it('asks for the jurisdiction and second-precision dates', () => {
    const url = new URL(buildRequestsUrl(source, [Date.parse('2026-10-01T00:00:00.123Z'), Date.parse('2026-10-01T06:00:00Z')]));
    expect(url.searchParams.get('jurisdiction_id')).toBe('fixmystreet');
    expect(url.searchParams.get('start_date')).toBe('2026-10-01T00:00:00Z');
  });
});

describe('planReseenClosures', () => {
  const closed = (id: string) => report({ category: 'Potholes', id, status: 'closed' });
  const open = (id: string) => report({ category: 'Potholes', id, status: 'open' });

  it('expires a published hazard whose report has since been closed', () => {
    const plan = planReseenClosures(
      [closed('a')],
      new Map([['a', { hazardId: 'h1', sourceStatus: 'open' }]]),
    );
    expect(plan).toEqual({ closedExternalIds: ['a'], hazardIdsToExpire: ['h1'] });
  });

  it('marks an unpublished staged report closed without touching hazards', () => {
    const plan = planReseenClosures(
      [closed('b')],
      new Map([['b', { hazardId: null, sourceStatus: 'open' }]]),
    );
    expect(plan).toEqual({ closedExternalIds: ['b'], hazardIdsToExpire: [] });
  });

  it('ignores reports still open, already closed, or never staged', () => {
    const plan = planReseenClosures(
      [open('c'), closed('d'), closed('e')],
      new Map([
        ['c', { hazardId: 'h3', sourceStatus: 'open' }],
        ['d', { hazardId: 'h4', sourceStatus: 'closed' }],
      ]),
    );
    expect(plan).toEqual({ closedExternalIds: [], hazardIdsToExpire: [] });
  });
});

describe('partitionUnpublishable', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  const items = [
    report({ category: 'Potholes', id: 'open-recent', reportedAt: '2026-10-10T09:00:00.000Z' }),
    report({ category: 'Potholes', id: 'closed', status: 'closed' }),
    // Silent council, reported 6 weeks ago: past its 4-week timer.
    report({ category: 'Potholes', id: 'too-old', council: 'Essex County Council', reportedAt: '2026-09-01T09:00:00.000Z' }),
  ];

  it('leaves every report to classification for sources that stage everything', () => {
    const result = partitionUnpublishable(items, { stageUnpublishable: undefined }, now);
    expect(result.candidates.map((r) => r.externalId)).toEqual(['open-recent', 'closed', 'too-old']);
  });

  it('drops closed and expired reports before classification for FixMyStreet', () => {
    const result = partitionUnpublishable(items, fixMyStreetAdapter, now);
    expect(result.candidates.map((r) => r.externalId)).toEqual(['open-recent']);
    expect(result.closed).toBe(1);
    expect(result.expired).toBe(1);
  });
});
