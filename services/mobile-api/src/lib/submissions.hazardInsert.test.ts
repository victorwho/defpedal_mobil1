// @vitest-environment node
/**
 * Unit tests for the Supabase branch of `submitHazardReport`.
 *
 * `__tests__/submissions.test.ts` mocks `supabaseAdmin` as null and therefore
 * only reaches the in-memory fallback — it can never see the row that is
 * actually written. These tests mock a capturing client instead, because the
 * insert payload is where the permanence feature (migration 202609020001)
 * lands: a dropped `is_permanent` is invisible at every other layer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type InsertCall = Record<string, unknown>;

const insertCalls: InsertCall[] = [];
const insertErrors: Array<null | { message: string }> = [];

vi.mock('./supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockImplementation((rows: InsertCall[]) => {
        insertCalls.push(rows[0]);
        return Promise.resolve({ error: insertErrors.shift() ?? null });
      }),
    }),
  },
}));

import { submitHazardReport } from './submissions';

const baseRequest = {
  coordinate: { lat: 44.4, lon: 26.1 },
  reportedAt: '2026-09-02T08:00:00.000Z',
  source: 'manual' as const,
  hazardType: 'dangerous_intersection' as const,
};

describe('submitHazardReport — is_permanent', () => {
  beforeEach(() => {
    insertCalls.length = 0;
    insertErrors.length = 0;
  });

  it('writes is_permanent=true when the reporter ticked the box', async () => {
    await submitHazardReport({ ...baseRequest, isPermanent: true }, 'user-1');

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({
      is_permanent: true,
      hazard_type: 'dangerous_intersection',
      user_id: 'user-1',
    });
    // expires_at is deliberately absent — the hazard_set_expiry BEFORE-INSERT
    // trigger derives it, and a column value here would pre-empt the trigger
    // exactly the way the DEFAULT did before migration 202608270001.
    expect(insertCalls[0]).not.toHaveProperty('expires_at');
  });

  it('omits the column entirely for an ordinary report, so the DB default applies', async () => {
    await submitHazardReport(baseRequest, 'user-1');

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).not.toHaveProperty('is_permanent');
  });

  it('omits the column when isPermanent is explicitly false', async () => {
    await submitHazardReport({ ...baseRequest, isPermanent: false }, 'user-1');

    expect(insertCalls[0]).not.toHaveProperty('is_permanent');
  });

  it('degrades to a report WITHOUT permanence rather than losing the category', async () => {
    // Migrations are applied by hand in this repo, so the server can run ahead
    // of the schema (error-log #83b). Stripping is_permanent must not also
    // strip hazard_type — that was the pre-existing fallback's behaviour.
    insertErrors.push({ message: 'column "is_permanent" of relation "hazards" does not exist' });

    await submitHazardReport({ ...baseRequest, isPermanent: true }, 'user-1');

    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0]).toHaveProperty('is_permanent', true);
    expect(insertCalls[1]).not.toHaveProperty('is_permanent');
    expect(insertCalls[1]).toHaveProperty('hazard_type', 'dangerous_intersection');
  });

  it('does not retry on an error unrelated to a missing column', async () => {
    insertErrors.push({ message: 'duplicate key value violates unique constraint' });

    await expect(
      submitHazardReport({ ...baseRequest, isPermanent: true }, 'user-1'),
    ).rejects.toThrow(/duplicate key/);
    expect(insertCalls).toHaveLength(1);
  });
});
