// Audit SCALE-18. `checkReceipts` shipped 2026-06-12 with zero callers because
// nothing persisted the ticket_id -> token mapping a receipt needs. These tests
// pin the drain semantics, especially the two that are easy to get wrong:
//   - a ticket Expo has NOT yet generated a receipt for must stay queued
//     (dropping it silently discards the failures this cron exists to catch)
//   - a dead token must be deleted scoped to its owner, because push_tokens is
//     UNIQUE(user_id, device_id) and the token alone is not unique
import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkReceipts = vi.fn();
vi.mock('./push', () => ({
  checkReceipts: (...a: unknown[]) => checkReceipts(...a),
}));

import { processPushReceipts, recordPushTicket, RECEIPT_MIN_AGE_MS } from './pushReceipts';

interface Row { ticket_id: string; user_id: string; expo_push_token: string }

let pendingRows: Row[] = [];
let expiredRows: Array<{ ticket_id: string }> = [];
let deletedTokens: Array<{ user_id: string; expo_push_token: string }> = [];
let deletedReceiptIds: string[] = [];
let upserted: unknown[] = [];
let receiptDeleteFilter: 'in' | 'lt' | null = null;

const makeChain = (table: string) => {
  const chain: Record<string, unknown> = {};
  let mode: 'select' | 'delete' = 'select';
  const pending: { user_id?: string; token?: string } = {};

  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.upsert = vi.fn((row: unknown) => { upserted.push(row); return Promise.resolve({ error: null }); });
  chain.delete = vi.fn(() => { mode = 'delete'; return chain; });
  chain.eq = vi.fn((col: string, val: string) => {
    if (col === 'user_id') pending.user_id = val;
    if (col === 'expo_push_token') pending.token = val;
    if (table === 'push_tokens' && mode === 'delete' && pending.user_id && pending.token) {
      deletedTokens.push({ user_id: pending.user_id, expo_push_token: pending.token });
      return Promise.resolve({ error: null });
    }
    return chain;
  });
  chain.in = vi.fn((_col: string, vals: string[]) => {
    receiptDeleteFilter = 'in';
    deletedReceiptIds.push(...vals);
    return Promise.resolve({ error: null });
  });
  chain.lt = vi.fn(() => { receiptDeleteFilter = 'lt'; return chain; });

  (chain as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (v: unknown) => unknown) => {
    // the only awaited SELECT is the pending-rows read; the only awaited
    // delete-with-select is the expiry sweep
    const value = mode === 'delete' && receiptDeleteFilter === 'lt'
      ? { data: expiredRows, error: null }
      : { data: pendingRows, error: null };
    return Promise.resolve(value).then(res, rej);
  };
  return chain;
};

const db = { from: (table: string) => makeChain(table) };

describe('processPushReceipts', () => {
  beforeEach(() => {
    pendingRows = [];
    expiredRows = [];
    deletedTokens = [];
    deletedReceiptIds = [];
    upserted = [];
    receiptDeleteFilter = null;
    checkReceipts.mockReset();
  });

  it('prunes a dead token scoped to its owner and clears the resolved row', async () => {
    pendingRows = [{ ticket_id: 't1', user_id: 'user-1', expo_push_token: 'ExpoTok[a]' }];
    checkReceipts.mockResolvedValue({ deadTokens: ['ExpoTok[a]'], resolvedIds: ['t1'] });

    const result = await processPushReceipts(db, new Date());

    expect(deletedTokens).toEqual([{ user_id: 'user-1', expo_push_token: 'ExpoTok[a]' }]);
    expect(deletedReceiptIds).toEqual(['t1']);
    expect(result).toMatchObject({ polled: 1, resolved: 1, pruned: 1 });
  });

  it('keeps a ticket queued when Expo has no receipt for it yet', async () => {
    pendingRows = [{ ticket_id: 't-unready', user_id: 'user-2', expo_push_token: 'ExpoTok[b]' }];
    checkReceipts.mockResolvedValue({ deadTokens: [], resolvedIds: [] });

    const result = await processPushReceipts(db, new Date());

    expect(deletedReceiptIds).toEqual([]);       // not forgotten
    expect(deletedTokens).toEqual([]);           // nothing condemned
    expect(result).toMatchObject({ polled: 1, resolved: 0, pruned: 0 });
  });

  it('leaves a healthy token alone but still clears its row', async () => {
    pendingRows = [{ ticket_id: 't2', user_id: 'user-3', expo_push_token: 'ExpoTok[c]' }];
    checkReceipts.mockResolvedValue({ deadTokens: [], resolvedIds: ['t2'] });

    const result = await processPushReceipts(db, new Date());

    expect(deletedTokens).toEqual([]);
    expect(deletedReceiptIds).toEqual(['t2']);
    expect(result).toMatchObject({ resolved: 1, pruned: 0 });
  });

  it('does not call Expo when nothing is due', async () => {
    pendingRows = [];

    const result = await processPushReceipts(db, new Date());

    expect(checkReceipts).not.toHaveBeenCalled();
    expect(result).toMatchObject({ polled: 0, resolved: 0, pruned: 0 });
  });

  it('reports rows aged out past Expo receipt retention', async () => {
    pendingRows = [];
    expiredRows = [{ ticket_id: 'old-1' }, { ticket_id: 'old-2' }];

    const result = await processPushReceipts(db, new Date());

    expect(result.expired).toBe(2);
  });

  it('only polls tickets older than the minimum age', async () => {
    expect(RECEIPT_MIN_AGE_MS).toBeGreaterThanOrEqual(10 * 60 * 1000);
  });
});

describe('recordPushTicket', () => {
  beforeEach(() => { upserted = []; });

  it('stores ticket, user and token together', async () => {
    await recordPushTicket(db, { ticketId: 't9', userId: 'user-9', token: 'ExpoTok[z]' });
    expect(upserted).toEqual([
      { ticket_id: 't9', user_id: 'user-9', expo_push_token: 'ExpoTok[z]' },
    ]);
  });

  it('never throws when the insert fails (delivery must not depend on bookkeeping)', async () => {
    const boom = { from: () => { throw new Error('db down'); } };
    await expect(
      recordPushTicket(boom, { ticketId: 't', userId: 'u', token: 'k' }),
    ).resolves.toBeUndefined();
  });
});
