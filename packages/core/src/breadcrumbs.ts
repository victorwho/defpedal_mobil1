/**
 * GPS breadcrumb sanitisation.
 *
 * A ride's distance is the sum of haversine segments between consecutive GPS
 * breadcrumbs. A single bad fix therefore corrupts the whole total: Android's
 * fused provider can surface a *cached last-known location* from a previous
 * ride/city (e.g. on the first fix after the navigation screen mounts, or after
 * a mid-ride signal gap). That injects a phantom "teleport" segment — a Bucharest
 * fix at the head of a Madrid ride adds ~2,470 km. These helpers drop such
 * physically-impossible steps before any distance is measured or stored.
 */
import { haversineDistance } from './distance';

/** Teleport ceiling: 30 m/s ≈ 108 km/h. No bike sustains this between fixes. */
export const MAX_CYCLING_SPEED_MPS = 30;

/**
 * Fallback per-segment cap (metres) used when timestamps are unavailable — e.g.
 * trails read back from `trip_tracks.gps_trail`, where the API maps the JSON to
 * `{ lat, lon }` and drops `ts`. 50 km is far above any plausible continuous-GPS
 * cycling segment yet far below a "wrong city" cached fix.
 */
export const MAX_SEGMENT_METERS = 50_000;

/** Minimal shape the sanitiser needs — accepts full `GpsBreadcrumb` or read-back `{ lat, lon }`. */
export type SanitisableCrumb = {
  readonly lat: number;
  readonly lon: number;
  readonly ts?: number;
};

/**
 * True when moving from `prev` to `next` is physically plausible for a cyclist.
 *
 * When both points carry a usable timestamp, this uses an implied-speed gate
 * (self-calibrating to the time gap). Otherwise it falls back to a hard distance
 * cap so it still works on timestamp-less trails read back from the database.
 */
export const isPlausibleStep = (prev: SanitisableCrumb, next: SanitisableCrumb): boolean => {
  const meters = haversineDistance([prev.lat, prev.lon], [next.lat, next.lon]);

  if (typeof prev.ts === 'number' && typeof next.ts === 'number' && next.ts > prev.ts) {
    const seconds = (next.ts - prev.ts) / 1000;
    return meters / seconds <= MAX_CYCLING_SPEED_MPS;
  }

  return meters <= MAX_SEGMENT_METERS;
};

/**
 * Drops breadcrumbs that imply teleportation (stale/cached GPS fixes).
 *
 * Strategy:
 *  1. Drop any fix stamped before the ride began (a hydrated last-known location).
 *  2. Trim a lone leading outlier: if the first step is implausible but the
 *     second is plausible, the head point is the suspect (the classic stale
 *     "first fix from the previous city") — start from the second point instead
 *     of anchoring on the bad one and discarding the whole real ride.
 *  3. Walk the rest keeping a running "last accepted" point, so a mid-trail
 *     outlier is skipped without shifting the baseline — the next real fix is
 *     validated against the last *good* position, not the bad one.
 *
 * @param crumbs      Ordered breadcrumb trail (oldest → newest).
 * @param startedAtMs Optional ride start (epoch ms). See step 1.
 */
export const sanitizeBreadcrumbs = <T extends SanitisableCrumb>(
  crumbs: readonly T[],
  startedAtMs?: number,
): T[] => {
  const candidates =
    startedAtMs != null
      ? crumbs.filter((c) => !(typeof c.ts === 'number' && c.ts < startedAtMs))
      : crumbs;

  // Step 2: detect a lone leading outlier (head stale fix).
  let startIndex = 0;
  if (
    candidates.length >= 3 &&
    !isPlausibleStep(candidates[0], candidates[1]) &&
    isPlausibleStep(candidates[1], candidates[2])
  ) {
    startIndex = 1;
  }

  // Step 3: skip-from-last-good pass.
  const out: T[] = [];
  for (let i = startIndex; i < candidates.length; i++) {
    const crumb = candidates[i];
    const last = out[out.length - 1];
    if (last && !isPlausibleStep(last, crumb)) {
      continue;
    }
    out.push(crumb);
  }

  return out;
};

/**
 * Halve a breadcrumb trail's resolution: keep every 2nd sample plus the final
 * one (index 0 — the ride's origin — is always even, so it survives).
 *
 * Used by the mobile trail buffers when they hit their memory cap (GPS audit
 * 2026-07-15 P1-1). The old ring-buffer eviction dropped the OLDEST samples,
 * so any ride longer than the buffer's time span (~66 min at 1 sample/2 s)
 * silently lost its opening kilometres — and with them distance/CO2/XP.
 * Thinning keeps the whole ride at progressively coarser resolution instead:
 * each pass doubles the time span the buffer can hold (66 min → 2.2 h → 4.4 h
 * → …) at the same memory cost, and a few extra seconds between samples
 * changes a road-following distance sum by well under 1%.
 *
 * The implied-speed sanitiser gates stay valid on thinned trails because
 * `isPlausibleStep` self-calibrates to the timestamp gap.
 */
export const thinBreadcrumbTrail = <T>(trail: readonly T[]): T[] => {
  if (trail.length < 3) return [...trail];
  const lastIndex = trail.length - 1;
  return trail.filter((_, index) => index % 2 === 0 || index === lastIndex);
};
