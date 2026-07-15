import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory keyValueStorage so the persist read-modify-write is observable.
const store = new Map<string, string>();
vi.mock('../storage', () => ({
  keyValueStorage: {
    getString: vi.fn(async (k: string) => store.get(k) ?? null),
    setString: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    delete: vi.fn(async (k: string) => {
      store.delete(k);
    }),
  },
}));

// expo-location / task-manager are native — the module's top-level
// defineTask guard must not throw under the test runtime.
vi.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 4 },
  ActivityType: { Fitness: 3 },
}));
vi.mock('expo-task-manager', () => ({
  isTaskDefined: () => true,
  defineTask: vi.fn(),
}));

import {
  clearPersistedNavigationHistory,
  getPersistedNavigationLocationHistory,
  persistNavigationLocationSamples,
} from '../backgroundNavigation';

const sample = (ts: number, lat = 44.4, lon = 26.1) => ({
  coordinate: { lat, lon },
  accuracyMeters: 5,
  speedMetersPerSecond: 4,
  heading: 90,
  timestamp: ts,
});

describe('persistNavigationLocationSamples', () => {
  beforeEach(() => {
    store.clear();
  });

  it('appends every sample in a batch (not just the last)', async () => {
    await persistNavigationLocationSamples([sample(1000), sample(2000), sample(3000)]);
    const history = await getPersistedNavigationLocationHistory();
    expect(history.map((s) => s.timestamp)).toEqual([1000, 2000, 3000]);
  });

  it('de-dups against the existing tail by timestamp (redelivered batch)', async () => {
    await persistNavigationLocationSamples([sample(1000), sample(2000)]);
    // Batch 2 redelivers ts 2000 and adds 3000.
    await persistNavigationLocationSamples([sample(2000), sample(3000)]);
    const history = await getPersistedNavigationLocationHistory();
    expect(history.map((s) => s.timestamp)).toEqual([1000, 2000, 3000]);
  });

  it('thins at the cap instead of evicting — first and last samples survive (GPS audit P1-1)', async () => {
    const batch = Array.from({ length: 1100 }, (_, i) => sample(i + 1));
    await persistNavigationLocationSamples(batch);
    const history = await getPersistedNavigationLocationHistory();
    // Bounded, at half resolution — not grown past the cap.
    expect(history.length).toBeLessThanOrEqual(1000);
    // The stretch's OPENING sample survives (the old ring buffer evicted it,
    // so a >33-min locked-screen stretch lost its earliest kilometres).
    expect(history[0].timestamp).toBe(1);
    // The newest sample survives too.
    expect(history[history.length - 1].timestamp).toBe(1100);
    // Order stays strictly increasing after thinning.
    for (let i = 1; i < history.length; i += 1) {
      expect(history[i].timestamp).toBeGreaterThan(history[i - 1].timestamp);
    }
  });

  it('clearPersistedNavigationHistory empties the trail', async () => {
    await persistNavigationLocationSamples([sample(1000)]);
    await clearPersistedNavigationHistory();
    const history = await getPersistedNavigationLocationHistory();
    expect(history).toEqual([]);
  });
});
