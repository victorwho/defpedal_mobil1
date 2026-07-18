import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { dispatchNudge } from './dispatcher';
import { sendPushNotification } from '../push';

vi.mock('../push', () => ({
  sendPushNotification: vi.fn(),
  isDeadTokenError: (code?: string) => code === 'DeviceNotRegistered',
}));

const mockSend = vi.mocked(sendPushNotification);

/**
 * Minimal chainable Supabase fake capturing nudge_log inserts/updates and
 * push_tokens deletes — just enough surface for the dispatcher.
 */
const createDbMock = () => {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const deletes: Array<{ table: string }> = [];

  const db = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          return {
            select: () => ({
              single: async () => ({ data: { id: 'log-1' }, error: null }),
            }),
          };
        },
        update(patch: Record<string, unknown>) {
          updates.push({ table, patch });
          return { eq: async () => ({ error: null }) };
        },
        delete() {
          deletes.push({ table });
          return { eq: () => ({ in: async () => ({ error: null }) }) };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { db, inserts, updates, deletes };
};

const baseRequest = {
  userId: 'user-1',
  trigger: 'city_riders_pulse' as const,
  context: { city: 'Bucharest', n: 1240 },
  locale: 'en' as const,
  sassy: true,
  outcome: 'scheduled' as const,
};

describe('dispatchNudge — per-token delivery telemetry (error-log #69)', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('records the fan-out summary when some tokens fail but one delivers', async () => {
    mockSend
      .mockResolvedValueOnce({
        token: 'ExponentPushToken[deadbeef0001]',
        ticketId: null,
        errorCode: 'InvalidCredentials',
      })
      .mockResolvedValueOnce({
        token: 'ExponentPushToken[cafebabe0002]',
        ticketId: 'ticket-2',
      });

    const { db, updates } = createDbMock();
    const result = await dispatchNudge(db, {
      ...baseRequest,
      pushTokens: ['ExponentPushToken[deadbeef0001]', 'ExponentPushToken[cafebabe0002]'],
    });

    expect(result.outcome).toBe('sent');
    expect(result.ticketId).toBe('ticket-2');

    const finalUpdate = updates.find((u) => u.table === 'nudge_log');
    expect(finalUpdate).toBeDefined();
    const context = finalUpdate!.patch.context as {
      delivery: { tokens: number; tickets: number; errors?: Array<{ token: string; code: string }> };
      city: string;
    };
    // Original context preserved, delivery summary folded in.
    expect(context.city).toBe('Bucharest');
    expect(context.delivery.tokens).toBe(2);
    expect(context.delivery.tickets).toBe(1);
    expect(context.delivery.errors).toHaveLength(1);
    expect(context.delivery.errors![0]!.code).toBe('InvalidCredentials');
    // Token is masked — never the full send-capable token.
    expect(context.delivery.errors![0]!.token).toBe('…ef0001');
    expect(JSON.stringify(context)).not.toContain('ExponentPushToken');
  });

  it('records all failures on expo_error (zero tickets)', async () => {
    mockSend.mockResolvedValue({
      token: 'ExponentPushToken[deadbeef0001]',
      ticketId: null,
      errorCode: 'InvalidCredentials',
    });

    const { db, updates } = createDbMock();
    const result = await dispatchNudge(db, {
      ...baseRequest,
      pushTokens: ['ExponentPushToken[deadbeef0001]', 'ExponentPushToken[deadbeef0001]'],
    });

    expect(result.outcome).toBe('expo_error');
    const finalUpdate = updates.find((u) => u.table === 'nudge_log');
    const patch = finalUpdate!.patch as { sent_at: string | null; context: { delivery: { tickets: number; errors?: unknown[] } } };
    expect(patch.sent_at).toBeNull();
    expect(patch.context.delivery.tickets).toBe(0);
    expect(patch.context.delivery.errors).toHaveLength(2);
  });

  it('omits the errors array when every token delivers', async () => {
    mockSend
      .mockResolvedValueOnce({ token: 'ExponentPushToken[t1]', ticketId: 'ticket-1' })
      .mockResolvedValueOnce({ token: 'ExponentPushToken[t2]', ticketId: 'ticket-2' });

    const { db, updates } = createDbMock();
    const result = await dispatchNudge(db, {
      ...baseRequest,
      pushTokens: ['ExponentPushToken[t1]', 'ExponentPushToken[t2]'],
    });

    expect(result.outcome).toBe('sent');
    const context = updates.find((u) => u.table === 'nudge_log')!.patch.context as {
      delivery: { tokens: number; tickets: number; errors?: unknown };
    };
    expect(context.delivery).toEqual({ tokens: 2, tickets: 2 });
  });

  it('still prunes dead tokens and reports them in the summary', async () => {
    mockSend
      .mockResolvedValueOnce({
        token: 'ExponentPushToken[gone000001]',
        ticketId: null,
        errorCode: 'DeviceNotRegistered',
      })
      .mockResolvedValueOnce({ token: 'ExponentPushToken[live000002]', ticketId: 'ticket-9' });

    const { db, updates, deletes } = createDbMock();
    const result = await dispatchNudge(db, {
      ...baseRequest,
      pushTokens: ['ExponentPushToken[gone000001]', 'ExponentPushToken[live000002]'],
    });

    expect(result.outcome).toBe('sent');
    expect(deletes.some((d) => d.table === 'push_tokens')).toBe(true);
    const context = updates.find((u) => u.table === 'nudge_log')!.patch.context as {
      delivery: { errors?: Array<{ code: string }> };
    };
    expect(context.delivery.errors![0]!.code).toBe('DeviceNotRegistered');
  });

  it('suppression outcomes write no delivery summary and send nothing', async () => {
    const { db, inserts, updates } = createDbMock();
    const result = await dispatchNudge(db, {
      ...baseRequest,
      pushTokens: [],
      outcome: 'suppressed_weather',
    });

    expect(result.outcome).toBe('suppressed_weather');
    expect(mockSend).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    const row = inserts.find((i) => i.table === 'nudge_log')!.row as { context: Record<string, unknown> };
    expect(row.context).not.toHaveProperty('delivery');
  });
});
