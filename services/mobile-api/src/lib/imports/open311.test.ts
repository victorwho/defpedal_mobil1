import { describe, expect, it } from 'vitest';

import { defaultLookbackIso, mapOpen311Request, normaliseStatus } from './adapters/open311';
import { isCoordinateAcceptable, isSourceStale } from './run';
import type { ImportSourceRow } from './types';

const source: ImportSourceRow = {
  id: 'open311:koln',
  adapter: 'open311',
  endpoint: 'https://sags-uns.stadt-koeln.de/georeport/v2',
  jurisdiction: 'stadt-koeln.de',
  country_code: 'DE',
  enabled: true,
  alert_eligible: true,
  coordinate_precision: 'pin',
  licence: 'DL-DE-Zero-2.0',
  attribution_text: "Sag's uns – Stadt Köln",
  attribution_url: 'https://example.invalid',
  bbox_min_lat: 50.8,
  bbox_min_lon: 6.75,
  bbox_max_lat: 51.1,
  bbox_max_lon: 7.2,
  backstop_ttl_days: 30,
  cursor: {},
  last_run_at: null,
  last_ok_at: null,
  last_items_at: null,
  stale_after_days: 8,
  consecutive_failures: 0,
};

describe('mapOpen311Request', () => {
  // Verbatim shape from the live Cologne endpoint, 2026-08-27.
  const live = {
    service_request_id: '12504-2026',
    title: '#12504-2026 Kölner Grün',
    description: 'Mittlerweile wurde 2x die Hundewiese gemäht.',
    lat: 50.856229364647,
    long: 6.9741779565811,
    address_string: '50997 Köln - Godorf, Amselweg 3',
    service_name: 'Kölner Grün',
    service_code: '3.2',
    requested_datetime: '2026-05-29T08:29:06+02:00',
    updated_datetime: '2026-06-29T15:27:02+02:00',
    status: 'closed',
    media_url: 'https://example.invalid/IMG_6281.jpeg',
  };

  it('parses the live Cologne payload', () => {
    const result = mapOpen311Request(live);
    expect(result).not.toBeNull();
    expect(result?.externalId).toBe('12504-2026');
    expect(result?.lat).toBeCloseTo(50.856229, 5);
    expect(result?.lon).toBeCloseTo(6.974177, 5);
    expect(result?.categoryKey).toBe('3.2');
    expect(result?.status).toBe('closed');
    expect(result?.reportedAt).toBe('2026-05-29T06:29:06.000Z');
  });

  it('accepts string coordinates (some cities emit them)', () => {
    const result = mapOpen311Request({ ...live, lat: '50.9', long: '6.9' });
    expect(result?.lat).toBe(50.9);
    expect(result?.lon).toBe(6.9);
  });

  it('rejects a row with no id', () => {
    expect(mapOpen311Request({ ...live, service_request_id: '' })).toBeNull();
  });

  it('rejects a row with unusable coordinates', () => {
    expect(mapOpen311Request({ ...live, lat: undefined })).toBeNull();
    expect(mapOpen311Request({ ...live, long: 'not-a-number' })).toBeNull();
  });

  it('keeps media_url for reviewer triage', () => {
    expect(mapOpen311Request(live)?.mediaUrl).toBe('https://example.invalid/IMG_6281.jpeg');
  });
});

describe('normaliseStatus', () => {
  it('recognises closed-equivalent states', () => {
    expect(normaliseStatus('closed')).toBe('closed');
    expect(normaliseStatus('Resolved')).toBe('closed');
    expect(normaliseStatus('ARCHIVED')).toBe('closed');
  });

  it('treats unknown city-specific states as open, not closed', () => {
    // Wrongly expiring a live hazard is worse than carrying a stale one that
    // the backstop TTL and community downvotes will clear anyway.
    expect(normaliseStatus('in_progress')).toBe('open');
    expect(normaliseStatus('assigned')).toBe('open');
  });

  it('returns null when there is no status at all', () => {
    expect(normaliseStatus(undefined)).toBeNull();
    expect(normaliseStatus('')).toBeNull();
    expect(normaliseStatus(42)).toBeNull();
  });
});

describe('isCoordinateAcceptable', () => {
  it('accepts a coordinate inside the source bbox', () => {
    expect(isCoordinateAcceptable(source, 50.94, 6.96)).toBe(true);
  });

  it('rejects null island', () => {
    expect(isCoordinateAcceptable(source, 0, 0)).toBe(false);
  });

  it('rejects a coordinate in the wrong city (Bucharest against a Cologne source)', () => {
    expect(isCoordinateAcceptable(source, 44.43, 26.1)).toBe(false);
  });

  it('rejects non-finite and out-of-range values', () => {
    expect(isCoordinateAcceptable(source, Number.NaN, 6.9)).toBe(false);
    expect(isCoordinateAcceptable(source, 91, 6.9)).toBe(false);
    expect(isCoordinateAcceptable(source, 50.9, 181)).toBe(false);
  });

  it('accepts anything in range when no bbox is configured', () => {
    const noBbox = {
      ...source,
      bbox_min_lat: null,
      bbox_min_lon: null,
      bbox_max_lat: null,
      bbox_max_lon: null,
    };
    expect(isCoordinateAcceptable(noBbox, 44.43, 26.1)).toBe(true);
    expect(isCoordinateAcceptable(noBbox, 0, 0)).toBe(false);
  });
});

describe('defaultLookbackIso', () => {
  it('looks back 30 days from the given instant', () => {
    const now = new Date('2026-08-27T00:00:00.000Z');
    expect(defaultLookbackIso(now)).toBe('2026-07-28T00:00:00.000Z');
  });
});


describe('isSourceStale', () => {
  const now = new Date('2026-08-27T00:00:00.000Z');

  it('is never stale when the run fetched items', () => {
    expect(isSourceStale({ ...source, last_items_at: '2026-01-01T00:00:00Z' }, 100, now))
      .toBe(false);
  });

  it('does NOT flag an empty run right after a successful one', () => {
    // Regression: the cursor advances to `now` when a window is exhausted, so
    // a back-to-back run legitimately fetches nothing. The old run-count
    // escalation counted this as a source failure and would have thrown a 502
    // and fired the GCP alert on a perfectly healthy pipeline.
    expect(isSourceStale({ ...source, last_items_at: '2026-08-26T23:00:00Z' }, 0, now))
      .toBe(false);
  });

  it('flags a source silent for longer than its stale window', () => {
    expect(isSourceStale({ ...source, last_items_at: '2026-08-10T00:00:00Z' }, 0, now))
      .toBe(true);
  });

  it('respects a per-source stale window', () => {
    const patient = { ...source, stale_after_days: 30, last_items_at: '2026-08-10T00:00:00Z' };
    expect(isSourceStale(patient, 0, now)).toBe(false);
  });

  it('falls back to last_ok_at when the source has never recorded items', () => {
    expect(isSourceStale({ ...source, last_items_at: null, last_ok_at: '2026-08-01T00:00:00Z' }, 0, now))
      .toBe(true);
  });

  it('never flags a source that has never succeeded at all', () => {
    // A brand-new source must get a chance to run before being called dead.
    expect(isSourceStale({ ...source, last_items_at: null, last_ok_at: null }, 0, now))
      .toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Field-type variance across cities (Zaragoza, 2026-09-01)
// ---------------------------------------------------------------------------

describe('mapOpen311Request — numeric ids and codes', () => {
  /**
   * Zaragoza returns service_request_id and service_code as JSON NUMBERS;
   * Cologne returns both as strings. The adapter used to require a string, so
   * every Zaragoza row mapped to null and the run reported a clean zero
   * import — the exact silent failure this pipeline exists to prevent.
   */
  const zaragozaRow = {
    service_request_id: 946212,
    status: 'open',
    service_code: 1000007,
    service_name: 'Movilidad Urbana: Señalización',
    title: 'Señal prohibido aparcar',
    description: 'Aparcan constantemente vehículos en zona peatonal.',
    requested_datetime: '2026-09-01T11:14:27Z',
    updated_datetime: '2026-09-01T11:15:29Z',
    lat: 41.647860628714234,
    long: -0.8911971936438581,
    address_string: 'CALLE ANTONIO CÁNOVAS, 7',
  };

  it('maps a row whose id and code are numbers', () => {
    const mapped = mapOpen311Request(zaragozaRow);
    expect(mapped).not.toBeNull();
    expect(mapped?.externalId).toBe('946212');
    expect(mapped?.categoryKey).toBe('1000007');
    // Passed through unchanged — no rounding anywhere in the mapper.
    expect(mapped?.lat).toBe(41.647860628714234);
    expect(mapped?.lon).toBe(-0.8911971936438581);
    expect(mapped?.address).toBe('CALLE ANTONIO CÁNOVAS, 7');
  });

  it('still maps Cologne-style string ids', () => {
    const mapped = mapOpen311Request({
      ...zaragozaRow,
      service_request_id: '19078-2026',
      service_code: '2.4.4',
    });
    expect(mapped?.externalId).toBe('19078-2026');
    expect(mapped?.categoryKey).toBe('2.4.4');
  });

  it('drops a row with no coordinates — 54% of Zaragoza requests have none', () => {
    // The "only import requests with coordinates" rule, enforced at the
    // adapter. The runner's badCoords gate is the second line of defence.
    expect(mapOpen311Request({ ...zaragozaRow, lat: null, long: null })).toBeNull();
    expect(mapOpen311Request({ ...zaragozaRow, lat: undefined, long: undefined })).toBeNull();
  });

  it('drops a row with no id, whatever its type', () => {
    expect(mapOpen311Request({ ...zaragozaRow, service_request_id: undefined })).toBeNull();
    expect(mapOpen311Request({ ...zaragozaRow, service_request_id: '' })).toBeNull();
  });
});
