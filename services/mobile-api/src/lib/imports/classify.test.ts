import { describe, expect, it, vi } from 'vitest';

import {
  clampSummary,
  classifyReport,
  fallbackSummary,
  resolveMapping,
} from './classify';
import { resolveKolnMapping } from './mappings/koln';
import { isImportableHazardType, type ImportSourceRow, type RawReport } from './types';

const koln: ImportSourceRow = {
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
  consecutive_failures: 0,
};

const report = (over: Partial<RawReport> = {}): RawReport => ({
  externalId: '12345-2026',
  lat: 50.94,
  lon: 6.96,
  categoryKey: '2.4.3',
  categoryLabel: 'Defekte Oberfläche',
  title: 'Loch im Radweg',
  description: 'Tiefes Schlagloch auf dem Radweg.',
  address: 'Aachener Str. 1',
  status: 'open',
  reportedAt: '2026-08-20T10:00:00.000Z',
  updatedAt: null,
  mediaUrl: null,
  raw: {},
  ...over,
});

describe('resolveKolnMapping', () => {
  it('maps defective surface to poor_surface', () => {
    const outcome = resolveKolnMapping('2.4.3');
    expect(outcome.kind).toBe('type');
    expect(outcome).toMatchObject({ hazardType: 'poor_surface' });
  });

  it('maps the cyclist traffic light to dangerous_intersection', () => {
    expect(resolveKolnMapping('2.1.2')).toMatchObject({
      kind: 'type',
      hazardType: 'dangerous_intersection',
    });
  });

  it('maps roadworks and cycle chicanes to narrow_street, never construction', () => {
    // `construction` was removed from hazards_hazard_type_check by 202604210003
    // and is rejected with a 400 by the live DB.
    expect(resolveKolnMapping('2.5')).toMatchObject({ kind: 'type', hazardType: 'narrow_street' });
    expect(resolveKolnMapping('2.7')).toMatchObject({ kind: 'type', hazardType: 'narrow_street' });
  });

  it('gives every mapped category a rider-facing English phrase', () => {
    // Regression: the deterministic path used to derive its description from
    // the source, producing German text that leaked Cologne's ticket number:
    //   "Kfz-Ampel defekt - #19078-2026 Kfz-Ampel defekt"
    for (const code of ['1.6', '2.1.1', '2.1.2', '2.1.3', '2.1.6', '2.4.3', '2.5', '2.7']) {
      const outcome = resolveKolnMapping(code);
      expect(outcome.kind).toBe('type');
      if (outcome.kind !== 'type') continue;
      expect(outcome.summaryEn.length).toBeGreaterThan(20);
      expect(outcome.summaryEn.length).toBeLessThanOrEqual(280);
      expect(outcome.summaryEn).not.toMatch(/#\d/);        // no ticket numbers
      expect(outcome.summaryEn).not.toMatch(/defekt|Ampel/i); // not German
    }
  });

  it('drops the high-volume non-cycling categories before the model', () => {
    for (const code of ['1.1', '1.2', '1.5', '2.2', '2.6.1', '3.2']) {
      expect(resolveKolnMapping(code)).toEqual({ kind: 'irrelevant' });
    }
  });

  it('routes genuinely ambiguous categories to the model', () => {
    for (const code of ['2.4.1', '2.4.2', '2.3', '2']) {
      expect(resolveKolnMapping(code)).toEqual({ kind: 'llm' });
    }
  });

  it('inherits the parent mapping for an unseen subcategory', () => {
    // A new '2.6.4' lighting subcategory should stay irrelevant, not become
    // a surprise model call.
    expect(resolveKolnMapping('2.6.4')).toEqual({ kind: 'irrelevant' });
    expect(resolveKolnMapping('1.3.9')).toEqual({ kind: 'irrelevant' });
  });

  it('falls back to the model for a wholly unknown code rather than dropping it', () => {
    expect(resolveKolnMapping('9.9.9')).toEqual({ kind: 'llm' });
    expect(resolveKolnMapping('')).toEqual({ kind: 'llm' });
    expect(resolveKolnMapping(null)).toEqual({ kind: 'llm' });
  });

  it('every mapped hazard type is accepted by the live CHECK constraint', () => {
    for (const outcome of ['2.4.3', '2.1.2', '2.5', '2.7', '1.6'].map(resolveKolnMapping)) {
      expect(outcome.kind).toBe('type');
      if (outcome.kind === 'type') {
        expect(isImportableHazardType(outcome.hazardType)).toBe(true);
      }
    }
  });
});

describe('clampSummary', () => {
  it('collapses whitespace and leaves short text alone', () => {
    expect(clampSummary('  a   b  ')).toBe('a b');
  });

  it('never exceeds the 280-char DB constraint', () => {
    const long = 'word '.repeat(200);
    expect(clampSummary(long).length).toBeLessThanOrEqual(280);
  });

  it('prefers a word boundary when truncating', () => {
    const long = `${'x'.repeat(250)} ${'y'.repeat(60)}`;
    expect(clampSummary(long).endsWith(' ')).toBe(false);
  });
});

describe('fallbackSummary', () => {
  it('uses category and title when they carry distinct information', () => {
    expect(fallbackSummary(report())).toBe('Defekte Oberfläche — Loch im Radweg');
  });

  it("strips the source's ticket-number prefix", () => {
    // Cologne emits title as "#<id> <service_name>".
    expect(
      fallbackSummary(report({ categoryLabel: 'Kfz-Ampel defekt', title: '#19078-2026 Kfz-Ampel defekt' })),
    ).toBe('Kfz-Ampel defekt');
  });

  it('does not repeat the category when the title adds nothing', () => {
    expect(
      fallbackSummary(report({ categoryLabel: 'Graffiti', title: '#1-2026 graffiti' })),
    ).toBe('Graffiti');
  });

  it('degrades gracefully with no category or title', () => {
    expect(fallbackSummary(report({ categoryLabel: '', title: null }))).toBe('Reported issue');
  });
});

describe('classifyReport', () => {
  it('auto-approves a deterministic mapping without calling the model', async () => {
    const llm = vi.fn();
    const result = await classifyReport(koln, report(), AbortSignal.timeout(1000), { llm });
    expect(result.reviewState).toBe('auto_approved');
    expect(result.hazardType).toBe('poor_surface');
    expect(llm).not.toHaveBeenCalled();
    // Uses the reviewed English phrase, never the German source text.
    expect(result.summaryEn).toBe('Damaged road surface reported here.');
    expect(result.modelInvoked).toBe(false);
  });

  it('drops an irrelevant category without calling the model', async () => {
    const llm = vi.fn();
    const result = await classifyReport(
      koln,
      report({ categoryKey: '1.1', categoryLabel: 'Wilder Müll' }),
      AbortSignal.timeout(1000),
      { llm },
    );
    expect(result.reviewState).toBe('irrelevant');
    expect(llm).not.toHaveBeenCalled();
  });

  it('auto-approves a confident, relevant model verdict', async () => {
    const llm = vi.fn().mockResolvedValue({
      relevant: true,
      hazard_type: 'missing_bike_lane',
      confidence: 0.9,
      summary_en: 'Faded cycle lane markings.',
      reason: 'markings',
    });
    const result = await classifyReport(
      koln,
      report({ categoryKey: '2.4.1' }),
      AbortSignal.timeout(1000),
      { llm },
    );
    expect(result.reviewState).toBe('auto_approved');
    expect(result.hazardType).toBe('missing_bike_lane');
    expect(result.summaryEn).toBe('Faded cycle lane markings.');
  });

  it('queues a low-confidence verdict for review instead of publishing', async () => {
    const llm = vi.fn().mockResolvedValue({
      relevant: true,
      hazard_type: 'pothole',
      confidence: 0.2,
      summary_en: 'Maybe a pothole.',
      reason: 'unclear',
    });
    const result = await classifyReport(
      koln,
      report({ categoryKey: '2.4.1' }),
      AbortSignal.timeout(1000),
      { llm },
    );
    expect(result.reviewState).toBe('pending');
    expect(result.rejectReason).toBe('llm_low_confidence');
  });

  it('refuses a hazard_type the DB would reject, even at high confidence', async () => {
    const llm = vi.fn().mockResolvedValue({
      relevant: true,
      hazard_type: 'construction', // removed from the CHECK list in 202604210003
      confidence: 0.99,
      summary_en: 'Road works.',
      reason: 'works',
    });
    const result = await classifyReport(
      koln,
      report({ categoryKey: '2.4.1' }),
      AbortSignal.timeout(1000),
      { llm },
    );
    expect(result.reviewState).toBe('pending');
    expect(result.hazardType).toBeNull();
    expect(result.rejectReason).toContain('llm_invalid_type');
  });

  it('routes a model error to review rather than dropping or publishing', async () => {
    const llm = vi.fn().mockRejectedValue(new Error('rate limited'));
    const result = await classifyReport(
      koln,
      report({ categoryKey: '2.4.1' }),
      AbortSignal.timeout(1000),
      { llm },
    );
    expect(result.reviewState).toBe('pending');
    expect(result.rejectReason).toContain('llm_error');
  });

  it('marks an explicitly irrelevant model verdict as irrelevant', async () => {
    const llm = vi.fn().mockResolvedValue({
      relevant: false,
      hazard_type: null,
      confidence: 0.9,
      summary_en: '',
      reason: 'litter',
    });
    const result = await classifyReport(
      koln,
      report({ categoryKey: '2.4.1' }),
      AbortSignal.timeout(1000),
      { llm },
    );
    expect(result.reviewState).toBe('irrelevant');
  });

  it('never lets a model response influence coordinates', async () => {
    const llm = vi.fn().mockResolvedValue({
      relevant: true,
      hazard_type: 'pothole',
      confidence: 0.95,
      summary_en: 'Pothole.',
      reason: 'x',
      // A hostile/confused model trying to supply geometry:
      lat: 0,
      lon: 0,
    });
    const result = await classifyReport(
      koln,
      report({ categoryKey: '2.4.1' }),
      AbortSignal.timeout(1000),
      { llm },
    );
    // ClassificationResult has no coordinate field at all — the only path from
    // a report to lat/lon is the adapter's own parsed value.
    expect(Object.keys(result)).not.toContain('lat');
    expect(result.reviewState).toBe('auto_approved');
  });
});

describe('resolveMapping', () => {
  it('sends an unmapped source entirely to the model rather than guessing', () => {
    const unknown = { ...koln, id: 'open311:somewhere' };
    expect(resolveMapping(unknown, report())).toEqual({ kind: 'llm' });
  });
});
