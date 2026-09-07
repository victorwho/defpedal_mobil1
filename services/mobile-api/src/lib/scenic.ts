/**
 * Scenic scoring for recreational loop selection.
 *
 * Deliberately separate from `risk.ts` and from the routing graph. Scenic never
 * changes what is routable or how the safety profile weights a road — it only
 * reorders candidate loops the safety graph has already produced, and supplies
 * via-point suggestions. That separation is the whole safety argument: a bad
 * scenic score can make a loop less likely to be *offered*, never less safe.
 *
 * Unlike risk, the raw score is NOT IP-sensitive: it is derived entirely from
 * public OSM tags by `OSRM_Server/generate_way_scenic_scores.py`, so there is
 * nothing to quantize or withhold. The endpoint is still auth'd and rate
 * limited, because it is a database-backed spatial query like any other.
 */
import type { GeoJsonLineString } from '@defensivepedal/core';

import { supabaseAdmin } from './supabaseAdmin';

interface MinimalLogger {
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const fallbackLogger: MinimalLogger = {
  warn: () => {},
  error: () => {},
};

/** One stretch of a route with the scenic score of its nearest scored way. */
export interface ScenicSegment {
  readonly id: string;
  /** [-1, 1]. Negative is actively unpleasant, not merely unremarkable. */
  readonly scenicScore: number;
  readonly geometry: GeoJsonLineString;
}

/** A scenic place worth routing a loop through. */
export interface ScenicVia {
  readonly wayId: number;
  readonly scenicScore: number;
  readonly name: string | null;
  readonly lat: number;
  readonly lon: number;
  /** 0-7 clockwise from north — used to spread vias around the ring. */
  readonly sector: number;
  readonly distanceMeters: number;
}

interface ScenicFeature {
  geometry?: GeoJsonLineString;
  properties?: { scenic_score?: number };
}

/**
 * Per-segment scenic scores along a route.
 *
 * Returns `[]` rather than throwing when the table is empty or absent for the
 * area: scenic is an enhancement, and a region with no coverage must rank on
 * safety and distance exactly as it did before, not fail.
 */
export const fetchScenicSegments = async (
  routeGeometry: GeoJsonLineString,
  logger: MinimalLogger = fallbackLogger,
): Promise<ScenicSegment[]> => {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin.rpc('get_segmented_scenic_route', {
    route_geojson: routeGeometry,
  });

  if (error) {
    logger.error(
      { code: error.code },
      '[scenic] Supabase RPC error: %s',
      error.message,
    );
    return [];
  }
  if (!data) return [];

  const collection = data as { features?: ScenicFeature[] };
  const features = collection.features ?? [];

  return features.flatMap((feature, index) => {
    const raw = Number(feature.properties?.scenic_score);
    if (!Number.isFinite(raw) || !feature.geometry) return [];
    return [
      {
        id: `scenic-${index}`,
        scenicScore: Math.max(-1, Math.min(1, raw)),
        geometry: feature.geometry,
      },
    ];
  });
};

/**
 * Scenic via-point candidates on a ring around a start.
 *
 * The RPC spreads results across eight compass sectors so a caller cannot draw
 * every via from one direction and fold the loop back on itself.
 */
export const fetchScenicVias = async (
  start: { lat: number; lon: number },
  ringRadiusMeters: number,
  options: { toleranceMeters?: number; minScore?: number; perSector?: number } = {},
  logger: MinimalLogger = fallbackLogger,
): Promise<ScenicVia[]> => {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin.rpc('get_scenic_vias', {
    start_lat: start.lat,
    start_lon: start.lon,
    ring_radius_m: ringRadiusMeters,
    ring_tolerance_m: options.toleranceMeters ?? 3000,
    min_score: options.minScore ?? 0.6,
    max_per_sector: options.perSector ?? 2,
  });

  if (error) {
    logger.error(
      { code: error.code },
      '[scenic] via RPC error: %s',
      error.message,
    );
    return [];
  }
  if (!Array.isArray(data)) return [];

  return (data as ScenicVia[]).filter(
    (v) => Number.isFinite(v?.lat) && Number.isFinite(v?.lon),
  );
};

/**
 * Length-weighted mean scenic score over a set of scored segments.
 *
 * Length-weighted, not a plain mean: OSRM segments vary from a few metres to
 * hundreds, so averaging them equally would let a cluster of short segments at
 * a junction outvote a kilometre of riverside.
 *
 * Exported for the validation harness as well as the API.
 */
export const lengthWeightedScenic = (
  segments: readonly ScenicSegment[],
): number => {
  let weighted = 0;
  let total = 0;
  for (const segment of segments) {
    const coords = segment.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    let length = 0;
    for (let i = 1; i < coords.length; i += 1) {
      const [x0, y0] = coords[i - 1] as [number, number];
      const [x1, y1] = coords[i] as [number, number];
      // Planar is fine here: these are metre-scale segments used only as
      // relative weights, so the projection error cancels.
      length += Math.hypot(x1 - x0, y1 - y0);
    }
    if (length <= 0) continue;
    weighted += segment.scenicScore * length;
    total += length;
  }
  return total > 0 ? weighted / total : 0;
};
