/**
 * OfflinePackCleanup — manages offline map pack storage hygiene.
 *
 * Runs on app launch (non-blocking). Two policies:
 *   1. Delete Mapbox offline packs older than 5 days
 *   2. If total storage exceeds 200MB, evict LRU packs until under budget
 *
 * Returns IDs of deleted regions for telemetry/logging.
 */
import type { OfflineRegion } from '@defensivepedal/core';

import { deleteOfflineRegion } from './offlinePacks';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000; // 5 days
const MAX_STORAGE_BYTES = 200 * 1024 * 1024; // 200 MB

// Estimated average size per tile resource — must match offline-maps.tsx display
const BYTES_PER_RESOURCE = 15 * 1024; // 15 KB

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getRegionAge = (region: OfflineRegion): number => {
  const updatedAt = region.updatedAt ? new Date(region.updatedAt).getTime() : 0;
  return Date.now() - updatedAt;
};

const estimateRegionSizeBytes = (region: OfflineRegion): number => {
  const resourceCount = region.completedResourceCount ?? region.requiredResourceCount ?? 0;
  return resourceCount * BYTES_PER_RESOURCE;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function cleanupOfflinePacks(
  regions: readonly OfflineRegion[],
): Promise<readonly string[]> {
  const deletedIds: string[] = [];

  // ── Phase 1: Delete packs older than 5 days ──
  const expiredRegions = regions.filter((region) => getRegionAge(region) > MAX_AGE_MS);

  for (const region of expiredRegions) {
    try {
      await deleteOfflineRegion(region.id);
      deletedIds.push(region.id);
    } catch {
      // Deletion failed — skip, don't block other cleanups
    }
  }

  // ── Phase 2: LRU eviction if over storage budget ──
  // Work with surviving regions (exclude already-deleted ones)
  const deletedIdSet = new Set(deletedIds);
  const survivingRegions = regions.filter((region) => !deletedIdSet.has(region.id));

  let totalSizeBytes = survivingRegions.reduce(
    (sum, region) => sum + estimateRegionSizeBytes(region),
    0,
  );

  if (totalSizeBytes > MAX_STORAGE_BYTES) {
    // Sort by updatedAt ascending (least recently used first)
    const sortedByAge = [...survivingRegions].sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return aTime - bTime;
    });

    for (const region of sortedByAge) {
      if (totalSizeBytes <= MAX_STORAGE_BYTES) {
        break;
      }

      try {
        const regionSize = estimateRegionSizeBytes(region);
        await deleteOfflineRegion(region.id);
        deletedIds.push(region.id);
        totalSizeBytes -= regionSize;
      } catch {
        // Deletion failed — continue with next region
      }
    }
  }

  return deletedIds;
}
