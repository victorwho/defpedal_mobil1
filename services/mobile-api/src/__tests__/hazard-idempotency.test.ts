// @vitest-environment node
/**
 * P1-12 — the hazard report is idempotent on the offline queue's mutation id.
 *
 * `POST /v1/hazards` is delivered at-least-once, so a request that lands and
 * then times out is retried. Before this, every retry created a SECOND hazard
 * pin at the same spot — splitting the community votes that decide whether the
 * hazard is real — and refired the streak, the thank-you push, the XP award and
 * the activity-feed card.
 *
 * What is asserted here is the part a row-level fix alone would miss: the write
 * must be an ON CONFLICT DO NOTHING upsert inferred on the right index, and it
 * must REPORT the outcome, because the route gates four side effects on it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface QueuedResult {
  data: unknown;
  error: null | { message: string };
}

const resultQueue: QueuedResult[] = [];
/** Every write the code under test issued, in order. */
const calls: Array<{
  table: string;
  op: 'insert' | 'upsert';
  rows: Record<string, unknown>[];
  options?: Record<string, unknown>;
  selected?: string;
}> = [];

vi.mock('../lib/supabaseAdmin', () => {
  const makeChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    let current: (typeof calls)[number] | null = null;

    chain.from = vi.fn().mockImplementation((table: string) => {
      current = { table, op: 'insert', rows: [] };
      return chain;
    });
    chain.insert = vi.fn().mockImplementation((rows: Record<string, unknown>[]) => {
      if (current) {
        current.op = 'insert';
        current.rows = rows;
        calls.push(current);
      }
      return chain;
    });
    chain.upsert = vi
      .fn()
      .mockImplementation((rows: Record<string, unknown>[], options?: Record<string, unknown>) => {
        if (current) {
          current.op = 'upsert';
          current.rows = rows;
          current.options = options;
          calls.push(current);
        }
        return chain;
      });
    chain.select = vi.fn().mockImplementation((selected?: string) => {
      const last = calls[calls.length - 1];
      if (last) last.selected = selected;
      return chain;
    });
    (chain as unknown as { then: unknown }).then = (
      resolve: (v: unknown) => unknown,
      reject: (v: unknown) => unknown,
    ) =>
      Promise.resolve(resultQueue.shift() ?? { data: [{ id: 'row-1' }], error: null }).then(
        resolve,
        reject,
      );
    return chain;
  };

  return { supabaseAdmin: makeChain() };
});

const { submitHazardReport } = await import('../lib/submissions');

const REQUEST = {
  coordinate: { lat: 44.43, lon: 26.1 },
  reportedAt: '2026-09-26T10:00:00.000Z',
  source: 'manual' as const,
  hazardType: 'pothole' as const,
};

beforeEach(() => {
  resultQueue.length = 0;
  calls.length = 0;
});

describe('submitHazardReport idempotency', () => {
  it('upserts ON CONFLICT DO NOTHING against the client_hazard_id index', async () => {
    resultQueue.push({ data: [{ id: 'row-1' }], error: null });

    await submitHazardReport({ ...REQUEST, clientHazardId: 'hazard-abc' }, 'user-1');

    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe('upsert');
    expect(calls[0].rows[0].client_hazard_id).toBe('hazard-abc');
    // Both halves matter. `onConflict` names the index Postgres must infer, and
    // `ignoreDuplicates` is what makes it DO NOTHING rather than DO UPDATE — a
    // DO UPDATE would let a caller presenting an id it does not own overwrite
    // the original report.
    expect(calls[0].options).toMatchObject({
      onConflict: 'client_hazard_id',
      ignoreDuplicates: true,
    });
    // Without a select the conflict is indistinguishable from a fresh insert.
    expect(calls[0].selected).toBe('id');
  });

  it('reports duplicate=false when a row was actually written', async () => {
    resultQueue.push({ data: [{ id: 'row-1' }], error: null });

    const result = await submitHazardReport(
      { ...REQUEST, clientHazardId: 'hazard-abc' },
      'user-1',
    );

    expect(result.duplicate).toBe(false);
  });

  it('reports duplicate=true on a retry, which is how the side effects are gated', async () => {
    // ON CONFLICT DO NOTHING returns zero rows. This is THE signal the route
    // uses to skip the streak, the push, the XP award and the feed card.
    resultQueue.push({ data: [], error: null });

    const result = await submitHazardReport(
      { ...REQUEST, clientHazardId: 'hazard-abc' },
      'user-1',
    );

    expect(result.duplicate).toBe(true);
    expect(result.reportId).toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it('falls back to a plain insert when the client sends no key (older app)', async () => {
    resultQueue.push({ data: [{ id: 'row-1' }], error: null });

    const result = await submitHazardReport(REQUEST, 'user-1');

    expect(calls[0].op).toBe('insert');
    expect(calls[0].rows[0]).not.toHaveProperty('client_hazard_id');
    // An unkeyed write cannot be known to be a duplicate, so it must never
    // claim to be one — that would suppress a real report's side effects.
    expect(result.duplicate).toBe(false);
  });

  it('drops the KEY, not the report, on an unmigrated database', async () => {
    // error-log #83b: this repo applies migrations by hand, so the server can
    // run ahead of the schema. A duplicate pin is a better outcome than a lost
    // hazard, so the idempotency key is what gets sacrificed.
    resultQueue.push({
      data: null,
      error: { message: "Could not find the 'client_hazard_id' column of 'hazards'" },
    });
    resultQueue.push({ data: [{ id: 'row-1' }], error: null });

    const result = await submitHazardReport(
      { ...REQUEST, clientHazardId: 'hazard-abc' },
      'user-1',
    );

    expect(result.duplicate).toBe(false);
    const ops = calls.map((c) => c.op);
    expect(ops).toEqual(['upsert', 'insert']);
    // The rider's actual report survives the retry intact.
    expect(calls[1].rows[0].hazard_type).toBe('pothole');
    expect(calls[1].rows[0]).not.toHaveProperty('client_hazard_id');
  });

  it('still throws on an error that is not about a missing column', async () => {
    resultQueue.push({ data: null, error: { message: 'permission denied for table hazards' } });

    await expect(
      submitHazardReport({ ...REQUEST, clientHazardId: 'hazard-abc' }, 'user-1'),
    ).rejects.toThrow(/permission denied/);
  });
});
