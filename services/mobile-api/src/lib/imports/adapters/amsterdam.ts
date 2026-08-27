/**
 * Amsterdam "Signalen" adapter.
 *
 * Endpoint (verified live 2026-08-27):
 *   GET /signals/v1/public/signals/geography?bbox=minLon,minLat,maxLon,maxLat
 *   -> GeoJSON FeatureCollection
 *      feature.geometry            Point [lon, lat]
 *      feature.properties.category { name, slug, parent: { name, slug } }
 *      feature.properties.created_at
 *
 * Signalen is open source (signalen.org) and used by several Dutch
 * municipalities, so this adapter should port to them by changing the endpoint
 * and the category map.
 *
 * THREE CONSTRAINTS, all verified rather than assumed, that shape this file:
 *
 * 1. HARD 4,000-FEATURE CAP, NO PAGING. Whole-city and quarter-city requests
 *    both returned exactly 4,000. Coverage therefore comes from splitting the
 *    area until each tile falls under the cap — see the quadtree below. The
 *    bbox IS honoured: two disjoint tiles returned zero overlapping points and
 *    every point fell inside its requested box.
 *
 * 2. DATE FILTERS ARE IGNORED. `created_after`, `created_at_after` and
 *    `start_date` all returned the identical 4,000 features spanning
 *    2021 -> now. Recency filtering must happen client-side, after download.
 *
 * 3. NO ID, NO STATUS, NO TEXT. The payload carries category + timestamp only.
 *    So the external id is synthesised (below), expiry is TTL-only, and the
 *    model is never invoked — the mapping table decides everything.
 */
import type {
  FetchPageResult,
  HazardSourceAdapter,
  ImportCursor,
  ImportSourceRow,
  RawReport,
  SourceStatus,
} from '../types';

/** Signalen truncates every response at this many features. */
const FEATURE_CAP = 4000;

/**
 * Stop subdividing below this span (~500 m). A tile this small that is still
 * at the cap means a pathological hotspot; we take the 4,000 and move on
 * rather than recursing forever.
 */
const MIN_TILE_SPAN_DEG = 0.005;

/** Only ingest signals newer than this. Matches the Open311 lookback. */
const LOOKBACK_DAYS = 30;

const REQUEST_TIMEOUT_MS = 45_000;

const USER_AGENT =
  'DefensivePedalBot/1.0 (+https://defensivepedal.com; cycling-safety hazard import)';

type Tile = readonly number[]; // [minLon, minLat, maxLon, maxLat]

interface SignalFeature {
  geometry?: { type?: string; coordinates?: number[] } | null;
  properties?: {
    created_at?: string;
    category?: {
      name?: string;
      slug?: string;
      parent?: { name?: string; slug?: string };
    };
  };
}

/**
 * Synthesised stable identity.
 *
 * Signalen exposes no identifier on the public feed. Coordinates are fixed at
 * creation and `created_at` is microsecond-precision, so the pair is
 * effectively unique and — critically — IDENTICAL on every refetch, which is
 * what makes re-reading the same 4,000 features each run idempotent.
 *
 * Coordinates are rounded to 7dp (~1 cm) so a change in the API's float
 * formatting cannot silently mint duplicate ids for the same signal.
 */
export const buildSignalExternalId = (
  lon: number,
  lat: number,
  createdAt: string,
): string => `${lon.toFixed(7)}:${lat.toFixed(7)}:${createdAt}`;

export const mapSignalFeature = (feature: SignalFeature): RawReport | null => {
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lon, lat] = coords;
  if (typeof lon !== 'number' || typeof lat !== 'number') return null;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

  const createdAt = feature.properties?.created_at;
  if (typeof createdAt !== 'string' || !createdAt) return null;

  const category = feature.properties?.category;
  const slug = (category?.slug ?? '').trim();
  const parentSlug = (category?.parent?.slug ?? '').trim();

  return {
    externalId: buildSignalExternalId(lon, lat, createdAt),
    lat,
    lon,
    // categoryKey carries "parent/child" so the mapping can fall back to the
    // parent for an unrecognised child slug.
    categoryKey: parentSlug ? `${parentSlug}/${slug}` : slug,
    categoryLabel: category?.name ?? '',
    title: null,
    description: null,
    address: null,
    // No status field exists on this feed — expiry is TTL-only.
    status: null,
    reportedAt: new Date(createdAt).toISOString(),
    updatedAt: null,
    mediaUrl: null,
    raw: {
      service_name: category?.name ?? '',
      service_code: slug,
      parent_slug: parentSlug,
      created_at: createdAt,
    },
  };
};

/** Split a tile into four quadrants. */
export const subdivideTile = (tile: Tile): Tile[] => {
  const [minLon, minLat, maxLon, maxLat] = tile as [number, number, number, number];
  const midLon = (minLon + maxLon) / 2;
  const midLat = (minLat + maxLat) / 2;
  return [
    [minLon, minLat, midLon, midLat],
    [midLon, minLat, maxLon, midLat],
    [minLon, midLat, midLon, maxLat],
    [midLon, midLat, maxLon, maxLat],
  ];
};

export const isTileTooSmall = (tile: Tile): boolean =>
  tile[2] - tile[0] < MIN_TILE_SPAN_DEG || tile[3] - tile[1] < MIN_TILE_SPAN_DEG;

/** The whole-city tile, taken from the source registry's bbox. */
export const rootTile = (source: ImportSourceRow): Tile | null => {
  const { bbox_min_lon, bbox_min_lat, bbox_max_lon, bbox_max_lat } = source;
  if (
    bbox_min_lon === null ||
    bbox_min_lat === null ||
    bbox_max_lon === null ||
    bbox_max_lat === null
  ) {
    return null;
  }
  return [bbox_min_lon, bbox_min_lat, bbox_max_lon, bbox_max_lat];
};

export const isRecent = (
  reportedAt: string | null,
  now: Date = new Date(),
  lookbackDays: number = LOOKBACK_DAYS,
): boolean => {
  if (!reportedAt) return false;
  const t = new Date(reportedAt).getTime();
  if (Number.isNaN(t)) return false;
  return t >= now.getTime() - lookbackDays * 24 * 60 * 60 * 1000;
};

const fetchTile = async (
  source: ImportSourceRow,
  tile: Tile,
  signal: AbortSignal,
): Promise<SignalFeature[]> => {
  const base = source.endpoint.replace(/\/+$/, '');
  const url = `${base}/signals/v1/public/signals/geography?bbox=${tile.join(',')}`;
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  });
  if (!response.ok) {
    throw new Error(`Signalen request failed: HTTP ${response.status} for ${url}`);
  }
  const text = await response.text();
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('{')) {
    throw new Error(`Signalen returned non-JSON (likely a moved endpoint): ${url}`);
  }
  const payload = JSON.parse(text) as { features?: SignalFeature[] };
  return Array.isArray(payload.features) ? payload.features : [];
};

export const amsterdamAdapter: HazardSourceAdapter = {
  id: 'signalen',

  /**
   * One "page" is one tile of the quadtree sweep.
   *
   * A tile that comes back AT the cap is incomplete, so it is split into four
   * and the children are queued. Its 4,000 features are still returned — they
   * are real, and the dedup key makes the overlap with the children free.
   */
  async fetchPage(
    source: ImportSourceRow,
    cursor: ImportCursor,
    signal: AbortSignal,
  ): Promise<FetchPageResult> {
    const queued: Tile[] = cursor.tiles ? cursor.tiles.map((t) => [...t]) : [];

    if (queued.length === 0) {
      const root = rootTile(source);
      if (!root) {
        throw new Error(
          `Source ${source.id} has no bbox configured; the Signalen adapter needs one to sweep.`,
        );
      }
      queued.push(root);
    }

    const tile = queued.shift() as Tile;
    const features = await fetchTile(source, tile, signal);

    if (features.length >= FEATURE_CAP && !isTileTooSmall(tile)) {
      queued.push(...subdivideTile(tile));
    }

    const now = new Date();
    const items = features
      .map(mapSignalFeature)
      .filter((item): item is RawReport => item !== null)
      // Date filtering is impossible server-side, so it happens here. Without
      // it every run would re-offer signals going back to 2021.
      .filter((item) => isRecent(item.reportedAt, now));

    return {
      items,
      nextCursor: queued.length > 0 ? { tiles: queued } : null,
    };
  },

  /**
   * Signalen's public feed has no status field, so there is nothing to poll.
   * Imported hazards expire on the per-source backstop TTL alone.
   *
   * NOTE a tempting but rejected alternative: the feed appears to carry only
   * currently-open signals, so absence could imply "resolved". That is not
   * implemented because it is unverified AND unsafe — one failed tile fetch
   * would make everything inside it look resolved and mass-expire real
   * hazards. If it is ever confirmed, it must be gated on a fully successful
   * sweep of every tile.
   */
  async fetchStatuses(): Promise<Map<string, SourceStatus>> {
    return new Map();
  },
};
