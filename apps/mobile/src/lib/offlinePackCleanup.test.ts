import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { OfflineRegion } from '@defensivepedal/core';

import { cleanupOfflinePacks } from './offlinePackCleanup';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./offlinePacks', () => ({
  deleteOfflineRegion: vi.fn(),
}));

import { deleteOfflineRegion } from './offlinePacks';
const mockDelete = vi.mocked(deleteOfflineRegion);

// ---------------------------------------------------------------------------
// Constants (must match source module)
// ---------------------------------------------------------------------------

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const BYTES_PER_RESOURCE = 15 * 1024;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRegion = (
  id: string,
  overrides: Partial<OfflineRegion> = {},
): OfflineRegion => ({
  id,
  name: `Region ${id}`,
  bbox: [26.0, 44.4, 26.1, 44.5],
  minZoom: 11,
  maxZoom: 16,
  status: 'ready',
  updatedAt: new Date().toISOString(),
  ...overrides,
});

/**
 * Creates a region with the specified age (ms from now) and resource count.
 */
const makeRegionWithAge = (
  id: string,
  ageMs: number,
  completedResourceCount = 100,
): OfflineRegion =>
  makeRegion(id, {
    updatedAt: new Date(Date.now() - ageMs).toISOString(),
    completedResourceCount,
    requiredResourceCount: completedResourceCount,
  });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('offlinePackCleanup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockDelete.mockResolvedValue(undefined);
  });

  it('deletes packs older than 5 days', async () => {
    const oldRegion = makeRegionWithAge('old-1', FIVE_DAYS_MS + 1000);
    const freshRegion = makeRegionWithAge('fresh-1', FIVE_DAYS_MS - 60_000);

    const deleted = await cleanupOfflinePacks([oldRegion, freshRegion]);

    expect(deleted).toEqual(['old-1']);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith('old-1');
  });

  it('keeps packs newer than 5 days', async () => {
    const freshRegion = makeRegionWithAge('fresh-1', 1000);

    const deleted = await cleanupOfflinePacks([freshRegion]);

    expect(deleted).toEqual([]);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('evicts oldest packs first when over 200MB cap', async () => {
    // Each resource = 15KB, so ~13,654 resources = ~200MB
    // Create regions that together exceed 200MB, all recent (not expired)
    const resourcesFor100MB = Math.ceil((100 * 1024 * 1024) / BYTES_PER_RESOURCE);
    const resourcesFor80MB = Math.ceil((80 * 1024 * 1024) / BYTES_PER_RESOURCE);

    // 3 regions: oldest + middle + newest = 100 + 100 + 80 = 280 MB (over 200MB cap)
    const oldest = makeRegionWithAge('oldest', 4 * 24 * 60 * 60 * 1000, resourcesFor100MB); // 4 days old
    const middle = makeRegionWithAge('middle', 2 * 24 * 60 * 60 * 1000, resourcesFor100MB); // 2 days old
    const newest = makeRegionWithAge('newest', 1 * 60 * 60 * 1000, resourcesFor80MB); // 1 hour old

    const deleted = await cleanupOfflinePacks([oldest, middle, newest]);

    // Should evict oldest first until under 200MB
    // After removing oldest (100MB): 180MB — under cap, stop
    expect(deleted).toEqual(['oldest']);
    expect(mockDelete).toHaveBeenCalledWith('oldest');
  });

  it('does not evict when under storage cap regardless of count', async () => {
    // Many small regions that together are under 200MB
    const regions = Array.from({ length: 50 }, (_, i) =>
      makeRegionWithAge(`region-${i}`, i * 60_000, 10), // 10 resources each = 150KB
    );

    const deleted = await cleanupOfflinePacks(regions);

    expect(deleted).toEqual([]);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('returns empty array for empty pack list', async () => {
    const deleted = await cleanupOfflinePacks([]);

    expect(deleted).toEqual([]);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('continues processing other packs when deletion fails for one', async () => {
    mockDelete
      .mockRejectedValueOnce(new Error('disk error'))
      .mockResolvedValueOnce(undefined);

    // Two expired packs — first deletion will fail, second should still succeed
    const old1 = makeRegionWithAge('old-fail', FIVE_DAYS_MS + 2000);
    const old2 = makeRegionWithAge('old-ok', FIVE_DAYS_MS + 1000);

    const deleted = await cleanupOfflinePacks([old1, old2]);

    // Only old-ok succeeded
    expect(deleted).toEqual(['old-ok']);
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });
});
