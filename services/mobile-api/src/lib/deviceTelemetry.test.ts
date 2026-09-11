// @vitest-environment node
/**
 * The row written here is the whole privacy surface of this feature, so the
 * shape is asserted rather than assumed: no behaviour, no location, no device
 * id, and no client timestamp (the server stamps `created_at`, so a wrong
 * device clock cannot move a user across a day boundary).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
const rows: Row[] = [];
const errors: Array<null | { message: string }> = [];

vi.mock('./supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockImplementation((batch: Row[]) => {
        rows.push(batch[0]!);
        return Promise.resolve({ error: errors.shift() ?? null });
      }),
    }),
  },
}));

import { ACCEPTED_DEVICE_EVENTS, recordDeviceTelemetry } from './deviceTelemetry';

describe('recordDeviceTelemetry', () => {
  beforeEach(() => {
    rows.length = 0;
    errors.length = 0;
  });

  it('writes an app_open row keyed to the user', async () => {
    const result = await recordDeviceTelemetry(
      { event: 'app_open', appEnvironment: 'production', appVersion: '0.2.160', appPlatform: 'android' },
      'user-1',
    );
    expect(result).toEqual({ recorded: true });
    expect(rows[0]).toMatchObject({
      user_id: 'user-1',
      event_type: 'app_open',
      app_environment: 'production',
      app_version: '0.2.160',
      app_platform: 'android',
    });
  });

  /** Data minimisation is part of the lawful basis, not a preference. */
  it('sends no timestamp and no properties — the server stamps and defaults them', async () => {
    await recordDeviceTelemetry({ event: 'app_open' }, 'user-1');
    const keys = Object.keys(rows[0]!);
    expect(keys).not.toContain('created_at');
    expect(keys).not.toContain('occurred_at');
    expect(keys).not.toContain('properties');
  });

  it('carries nothing describing location, device or behaviour', async () => {
    await recordDeviceTelemetry({ event: 'app_open' }, 'user-1');
    for (const banned of ['lat', 'lon', 'coordinate', 'device_id', 'ip', 'screen', 'route']) {
      expect(Object.keys(rows[0]!)).not.toContain(banned);
    }
  });

  /**
   * The caller fires this without awaiting a meaningful result. A throw would
   * surface on a path the rider never asked for.
   */
  it('reports failure instead of throwing', async () => {
    errors.push({ message: 'insert failed' });
    await expect(
      recordDeviceTelemetry({ event: 'app_open' }, 'user-1'),
    ).resolves.toEqual({ recorded: false });
  });

  it('accepts only allowlisted events', () => {
    expect([...ACCEPTED_DEVICE_EVENTS]).toEqual(['app_open']);
  });
});
