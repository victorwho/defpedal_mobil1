/**
 * Open311 GeoReport v2 adapter — config-driven, city-agnostic.
 *
 * Adding any surviving EU Open311 city is a `hazard_import_sources` row; no
 * code change. That matters because endpoint rot is severe: of the seven
 * German endpoints on the canonical open311status list, only Cologne still
 * serves the API (Bonn, Gießen, Siegburg and Brühl migrated to Next.js apps
 * and dropped it; Annaberg-Buchholz was unreachable). Verified 2026-08-27.
 *
 * Cologne response shape (verified live):
 *   { service_request_id, title, description, lat, long, address_string,
 *     service_name, service_code, requested_datetime, updated_datetime,
 *     status, media_url, status_note }
 *
 * Pagination: `?start_date=&end_date=&page=N` returns disjoint, time-ordered
 * pages of 100. A short page means end-of-data.
 */
import type {
  FetchPageResult,
  HazardSourceAdapter,
  ImportCursor,
  ImportSourceRow,
  RawReport,
  SourceStatus,
} from '../types';

const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Identify honestly. A civic data source should be able to see who we are and
 * reach us, rather than discovering an anonymous scraper in their logs.
 */
const USER_AGENT =
  'DefensivePedalBot/1.0 (+https://defensivepedal.com; cycling-safety hazard import)';

/**
 * Field types vary by city even within GeoReport v2. Cologne returns
 * `service_request_id` and `service_code` as STRINGS; Zaragoza returns both as
 * JSON NUMBERS (verified live 2026-09-01). Typed as the union and coerced
 * below — the previous string-only handling silently dropped every Zaragoza
 * row and reported a clean run.
 */
interface Open311Request {
  service_request_id?: string | number;
  title?: string;
  description?: string;
  lat?: number | string;
  long?: number | string;
  address_string?: string;
  service_name?: string;
  service_code?: string | number;
  requested_datetime?: string;
  updated_datetime?: string;
  status?: string;
  media_url?: string;
}

/** Coerce a string|number|null field to a trimmed string. */
const toTrimmedString = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * Open311 `status` is spec'd as 'open' | 'closed'. Cities extend it freely
 * ('in_progress', 'archived', ...). Anything not explicitly closed is treated
 * as open: wrongly expiring a live hazard is worse than carrying a stale one
 * that the backstop TTL and community downvotes will clear anyway.
 */
export const normaliseStatus = (value: unknown): SourceStatus | null => {
  if (typeof value !== 'string') return null;
  const normalised = value.trim().toLowerCase();
  if (!normalised) return null;
  if (normalised === 'closed' || normalised === 'resolved' || normalised === 'archived') {
    return 'closed';
  }
  return 'open';
};

/**
 * ISO8601 WITHOUT fractional seconds.
 *
 * Zaragoza's date parser rejects milliseconds with HTTP 400 — verified:
 * `2026-08-02T19:22:14.741Z` 400, `2026-08-02T19:22:14Z` 200. Cologne accepts
 * both, so second precision is safe for every source.
 */
export const toSecondPrecisionIso = (iso: string): string =>
  iso.replace(/\.\d{1,6}(?=Z|[+-]\d{2}:?\d{2}$)/, '');

const toIsoOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

export const mapOpen311Request = (row: Open311Request): RawReport | null => {
  const externalId = toTrimmedString(row.service_request_id);
  if (!externalId) return null;

  const lat = toNumber(row.lat);
  const lon = toNumber(row.long);
  if (lat === null || lon === null) return null;

  return {
    externalId,
    lat,
    lon,
    categoryKey: toTrimmedString(row.service_code),
    categoryLabel: toTrimmedString(row.service_name),
    title: toTrimmedString(row.title) || null,
    description: toTrimmedString(row.description) || null,
    address: toTrimmedString(row.address_string) || null,
    status: normaliseStatus(row.status),
    reportedAt: toIsoOrNull(row.requested_datetime),
    updatedAt: toIsoOrNull(row.updated_datetime),
    mediaUrl: row.media_url?.trim() || null,
    raw: row,
  };
};

const buildRequestsUrl = (
  source: ImportSourceRow,
  params: Record<string, string>,
): string => {
  const base = source.endpoint.replace(/\/+$/, '');
  const url = new URL(`${base}/requests.json`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
};

const fetchJson = async (url: string, signal: AbortSignal): Promise<unknown> => {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined = AbortSignal.any([signal, timeout]);
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: combined,
  });
  if (!response.ok) {
    throw new Error(`Open311 request failed: HTTP ${response.status} for ${url}`);
  }
  const text = await response.text();
  // Dead endpoints in this ecosystem do not 404 — they 200 with a Next.js HTML
  // shell (Bonn and Gießen both do exactly this). Detect it explicitly so the
  // failure is loud rather than "0 items imported, all good".
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
    throw new Error(
      `Open311 endpoint returned non-JSON (likely a migrated/dead endpoint): ${url}`,
    );
  }
  return JSON.parse(text) as unknown;
};

export const open311Adapter: HazardSourceAdapter = {
  id: 'open311',

  async fetchPage(
    source: ImportSourceRow,
    cursor: ImportCursor,
    signal: AbortSignal,
  ): Promise<FetchPageResult> {
    const page = cursor.page && cursor.page > 0 ? cursor.page : 1;
    const since = cursor.since ?? defaultLookbackIso();

    // GeoReport v2 leaves paging undefined; implementations differ. `page`
    // works for Cologne and is silently IGNORED by Zaragoza, which would mean
    // re-reading page 1 until the page cap. See ImportSourceRow.pagination_style.
    const paging: Record<string, string> =
      source.pagination_style === 'offset'
        ? { rows: String(PAGE_SIZE), start: String((page - 1) * PAGE_SIZE) }
        : { page: String(page) };

    const url = buildRequestsUrl(source, {
      start_date: toSecondPrecisionIso(since),
      end_date: toSecondPrecisionIso(new Date().toISOString()),
      ...paging,
    });

    const payload = await fetchJson(url, signal);
    if (!Array.isArray(payload)) {
      throw new Error(`Open311 requests.json did not return an array: ${url}`);
    }

    const items = payload
      .map((row) => mapOpen311Request(row as Open311Request))
      .filter((item): item is RawReport => item !== null);

    // A short page means we have reached the end of this window. Advance
    // `since` to now so the next run starts a fresh window, and reset page.
    const exhausted = payload.length < PAGE_SIZE;
    const nextCursor: ImportCursor | null = exhausted
      ? null
      : { since, page: page + 1, lastExternalId: items.at(-1)?.externalId };

    return { items, nextCursor };
  },

  /**
   * Resolve current status per report via the GeoReport v2 single-request
   * endpoint: `GET /requests/{service_request_id}.json`.
   *
   * NOT the comma-separated `?service_request_id=a,b,c` filter on
   * /requests.json. Cologne ACCEPTS that parameter and silently IGNORES it,
   * returning the default 100 most-recent reports instead (verified
   * 2026-08-27: filtering for three known ids returned 100 rows, none of them
   * the requested ones). Because results are matched back by id, that made
   * status-sync a no-op that still reported a healthy `statusChecked` count —
   * work that looks done and isn't.
   *
   * One request per id is more round-trips, but it is what the spec defines
   * and it actually returns the right row. Bounded concurrency keeps a few
   * hundred lookups to a few seconds; a single id's failure is skipped rather
   * than failing the sweep, since the backstop TTL still bounds every import.
   */
  async fetchStatuses(
    source: ImportSourceRow,
    externalIds: readonly string[],
    signal: AbortSignal,
  ): Promise<Map<string, SourceStatus>> {
    const statuses = new Map<string, SourceStatus>();
    if (externalIds.length === 0) return statuses;

    const base = source.endpoint.replace(/\/+$/, '');
    const CONCURRENCY = 8;

    for (let index = 0; index < externalIds.length; index += CONCURRENCY) {
      const slice = externalIds.slice(index, index + CONCURRENCY);
      const settled = await Promise.allSettled(
        slice.map(async (externalId) => {
          const url = `${base}/requests/${encodeURIComponent(externalId)}.json`;
          const payload = await fetchJson(url, signal);
          const rows = Array.isArray(payload) ? payload : [payload];
          const row = rows[0] as Open311Request | undefined;
          const returnedId = toTrimmedString(row?.service_request_id);
          // Guard against an endpoint that ignores the path segment too:
          // only trust a row that identifies itself as the one we asked for.
          if (returnedId !== externalId) return null;
          const status = normaliseStatus(row?.status);
          return status ? ([externalId, status] as const) : null;
        }),
      );
      for (const result of settled) {
        if (result.status === 'fulfilled' && result.value) {
          statuses.set(result.value[0], result.value[1]);
        }
      }
    }

    return statuses;
  },
};

/**
 * First-run lookback. A report older than this is either long fixed or so
 * permanent it belongs in road_risk_data, not the transient hazard layer.
 */
const LOOKBACK_DAYS = 30;

export const defaultLookbackIso = (now: Date = new Date()): string =>
  new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
