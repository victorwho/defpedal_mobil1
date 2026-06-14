import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAnonMergePending, markAnonMergePending, readAnonMergePending } from './anonMerge';

const store = new Map<string, string>();

vi.mock('./storage', () => ({
  keyValueStorage: {
    getString: async (k: string) => store.get(k) ?? null,
    setString: async (k: string, v: string) => {
      store.set(k, v);
    },
    delete: async (k: string) => {
      store.delete(k);
    },
  },
}));

describe('anonMerge pending token', () => {
  beforeEach(() => {
    store.clear();
    vi.useRealTimers();
  });

  it('returns null when nothing is pending', async () => {
    expect(await readAnonMergePending()).toBeNull();
  });

  it('round-trips a captured token', async () => {
    await markAnonMergePending('anon-token-abc');
    expect(await readAnonMergePending()).toBe('anon-token-abc');
  });

  it('clears the token', async () => {
    await markAnonMergePending('anon-token-abc');
    await clearAnonMergePending();
    expect(await readAnonMergePending()).toBeNull();
  });

  it('expires + clears a token older than the TTL', async () => {
    // Write a record stamped > 1h ago directly.
    store.set(
      'defensivepedal.anonMergePending',
      JSON.stringify({
        anonAccessToken: 'stale-token',
        requestedAt: new Date(Date.now() - 61 * 60 * 1000).toISOString(),
      }),
    );
    expect(await readAnonMergePending()).toBeNull();
    // …and the stale record is purged.
    expect(store.has('defensivepedal.anonMergePending')).toBe(false);
  });

  it('discards a corrupt record', async () => {
    store.set('defensivepedal.anonMergePending', 'not-json');
    expect(await readAnonMergePending()).toBeNull();
  });
});
