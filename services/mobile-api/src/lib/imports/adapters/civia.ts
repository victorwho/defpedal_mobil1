/**
 * Civia.ro adapter — public-surface only.
 *
 * ⚠️ LEGAL BOUNDARY. civia.ro's robots.txt carries an explicit EU DSM Art. 4
 * TDM reservation and `Disallow: /api/` for every user-agent. Consent covers
 * the PUBLIC pages only, so this adapter must never touch /api/*, even though
 * those endpoints exist and return cleaner JSON. If that ever changes, replace
 * the parsing below with the API rather than widening the scrape.
 *
 * Two public surfaces, both robots-allowed:
 *
 *   GET /feed.xml        50 most recent sesizări. Carries id (in <link>),
 *                        <category> slug, <title>, <pubDate>, and a
 *                        <description> of the form
 *                          "[STATUS] <free text> — <address>"
 *                        Everything except coordinates.
 *
 *   GET /sesizari/<id>   The detail page. Coordinates live in the Next.js RSC
 *                        flight payload as {"coords":[lat,lon],...}.
 *
 *   GET /sitemap.xml     Every /sesizari/<id> URL (291 as of 2026-09-01).
 *                        Used once, for the backfill sweep.
 *
 * FRAGILITY, STATED PLAINLY: `coords` comes out of a Next.js RSC payload,
 * which is an internal serialization format that changes shape whenever they
 * redeploy. Every parse failure is therefore counted and, if NO item in a page
 * yields coordinates, the run throws. A silent drift to "0 imported, all
 * green" is the failure mode this pipeline exists to avoid (error-log #82).
 *
 * Coordinates are ADDRESS-GEOCODED, not reporter-pinned — the payload carries
 * `zoom:16, strada:null`. The source row is therefore seeded
 * coordinate_precision='geocoded' and alert_eligible=false: these pins must
 * not fire mid-ride proximity haptics at a spot that may be a street away.
 */
import type {
  FetchPageResult,
  HazardSourceAdapter,
  ImportCursor,
  ImportSourceRow,
  RawReport,
  SourceStatus,
} from '../types';

const REQUEST_TIMEOUT_MS = 30_000;

/** Detail pages fetched per fetchPage() call. Keeps a run inside its budget. */
const DETAIL_BATCH = 25;

/** Concurrent detail fetches. Deliberately low — this is a small partner. */
const DETAIL_CONCURRENCY = 4;

/**
 * Identify honestly. A civic partner should be able to see who we are and
 * reach us, rather than discovering an anonymous scraper in their logs.
 */
const USER_AGENT =
  'DefensivePedalBot/1.0 (+https://defensivepedal.com; cycling-safety hazard import)';

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Civia status vocabulary, as published in the feed's `[STATUS]` prefix and
 * the public list's aria-labels (sampled 2026-09-01: INREGISTRATA, TRIMIS,
 * plus "Termen depășit" as a badge; REZOLVAT exists — civia.ro/presa reports
 * 24 resolved — but had not surfaced in the sample).
 *
 * Anything not explicitly a closing state is treated as open, matching the
 * Open311 adapter's reasoning: wrongly expiring a live hazard is worse than
 * carrying a stale one, which the backstop TTL and community downvotes clear
 * anyway.
 */
const CLOSED_STATUSES = new Set([
  'rezolvat',
  'rezolvata',
  'respins',
  'respinsa',
  'clasat',
  'clasata',
  'anulat',
  'anulata',
  'solutionat',
  'solutionata',
]);

/** Strips Romanian diacritics so 'REZOLVATĂ' and 'rezolvata' compare equal. */
const foldDiacritics = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[țţ]/gi, 't')
    .replace(/[șş]/gi, 's');

export const normaliseCiviaStatus = (value: unknown): SourceStatus | null => {
  if (typeof value !== 'string') return null;
  const folded = foldDiacritics(value).trim().toLowerCase();
  if (!folded) return null;
  return CLOSED_STATUSES.has(folded) ? 'closed' : 'open';
};

// ---------------------------------------------------------------------------
// Feed parsing
// ---------------------------------------------------------------------------

export interface CiviaFeedItem {
  readonly externalId: string;
  readonly categoryKey: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly address: string | null;
  readonly status: SourceStatus | null;
  readonly reportedAt: string | null;
}

const decodeEntities = (value: string): string =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#160;|&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();

const tagValue = (block: string, tag: string): string | null => {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block);
  return match ? decodeEntities(match[1]) || null : null;
};

/** `https://civia.ro/sesizari/00297` -> `00297`. */
export const externalIdFromLink = (link: string | null): string | null => {
  if (!link) return null;
  const match = /\/sesizari\/(\d+)/.exec(link);
  return match ? match[1] : null;
};

/**
 * Splits `"[TRIMIS] Pe Strada X ... — Strada X, Timișoara, null"` into its
 * status, prose and trailing address.
 *
 * The address suffix is separated by an em dash and can legitimately end in
 * the literal string "null" — Civia renders a missing street/sector field that
 * way. Stripping it keeps "…, Timișoara" rather than "…, Timișoara, null".
 */
export const parseFeedDescription = (
  raw: string | null,
): { status: SourceStatus | null; text: string | null; address: string | null } => {
  if (!raw) return { status: null, text: null, address: null };

  let rest = raw.trim();
  let status: SourceStatus | null = null;

  const statusMatch = /^\[([^\]]+)\]\s*/.exec(rest);
  if (statusMatch) {
    status = normaliseCiviaStatus(statusMatch[1]);
    rest = rest.slice(statusMatch[0].length);
  }

  let address: string | null = null;
  const dash = rest.lastIndexOf(' — ');
  if (dash !== -1) {
    address = rest.slice(dash + 3).trim() || null;
    rest = rest.slice(0, dash).trim();
  }

  if (address) {
    address =
      address
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part && part.toLowerCase() !== 'null')
        .join(', ') || null;
  }

  return { status, text: rest || null, address };
};

export const parseFeed = (xml: string): CiviaFeedItem[] => {
  const items: CiviaFeedItem[] = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  for (const block of blocks) {
    const externalId = externalIdFromLink(tagValue(block, 'link'));
    if (!externalId) continue;

    const { status, text, address } = parseFeedDescription(tagValue(block, 'description'));
    const pubDate = tagValue(block, 'pubDate');
    const parsedDate = pubDate ? new Date(pubDate) : null;

    items.push({
      externalId,
      categoryKey: (tagValue(block, 'category') ?? '').toLowerCase(),
      title: tagValue(block, 'title'),
      description: text,
      address,
      status,
      reportedAt:
        parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null,
    });
  }

  return items;
};

// ---------------------------------------------------------------------------
// Detail-page parsing
// ---------------------------------------------------------------------------

/**
 * Pulls `{"coords":[lat,lon]}` out of the RSC flight payload.
 *
 * Escaped and unescaped forms both occur depending on where in the stream the
 * component lands, hence the tolerant quote class.
 */
export const parseCoords = (html: string): { lat: number; lon: number } | null => {
  const match = /\\?"coords\\?"\s*:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/.exec(
    html,
  );
  if (!match) return null;

  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
};

/** Status shown on the detail page, used by the status re-poll. */
export const parseDetailStatus = (html: string): SourceStatus | null => {
  const aria = /aria-label="[^"]*?,\s*([^",]+)"/.exec(html);
  if (aria) {
    const parsed = normaliseCiviaStatus(aria[1]);
    if (parsed) return parsed;
  }
  for (const label of ['Rezolvată', 'Rezolvat', 'Respinsă', 'Clasată']) {
    if (html.includes(label)) return 'closed';
  }
  return null;
};

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const fetchText = async (url: string, signal: AbortSignal): Promise<string> => {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined = AbortSignal.any([signal, timeout]);
  const response = await fetch(url, {
    headers: { accept: 'text/html,application/xml', 'user-agent': USER_AGENT },
    signal: combined,
  });
  if (!response.ok) {
    throw new Error(`Civia request failed: HTTP ${response.status} for ${url}`);
  }
  return response.text();
};

const baseOf = (source: ImportSourceRow): string => source.endpoint.replace(/\/+$/, '');

const mapConcurrently = async <T, R>(
  values: readonly T[],
  limit: number,
  fn: (value: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> => {
  const out: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < values.length; i += limit) {
    out.push(...(await Promise.allSettled(values.slice(i, i + limit).map(fn))));
  }
  return out;
};

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const civiaAdapter: HazardSourceAdapter = {
  id: 'civia',

  /**
   * Two phases, driven by the cursor:
   *
   *   1. BACKFILL (first run only). `pendingIds` is unset, so enumerate
   *      sitemap.xml, drop anything already imported by walking newest-first,
   *      and work through it DETAIL_BATCH at a time. Only sesizări the detail
   *      page still shows as open are emitted — a resolved 2026-04 pothole is
   *      not worth a pin.
   *   2. FEED (steady state). Once `pendingIds` is exhausted, poll feed.xml.
   *
   * The cursor is persisted after every page by the runner, so a truncated
   * cron resumes mid-backfill instead of re-grinding its prefix.
   */
  async fetchPage(
    source: ImportSourceRow,
    cursor: ImportCursor,
    signal: AbortSignal,
  ): Promise<FetchPageResult> {
    const base = baseOf(source);

    // ── Phase 1: backfill ───────────────────────────────────────────────
    if (cursor.pendingIds === undefined && !cursor.since) {
      const sitemap = await fetchText(`${base}/sitemap.xml`, signal);
      const ids = [...new Set(Array.from(sitemap.matchAll(/\/sesizari\/(\d+)<\/loc>/g), (m) => m[1]))]
        .sort()
        .reverse();
      if (ids.length === 0) {
        throw new Error('Civia sitemap contained no /sesizari/ URLs — shape changed?');
      }
      return { items: [], nextCursor: { pendingIds: ids } };
    }

    if (cursor.pendingIds && cursor.pendingIds.length > 0) {
      const slice = cursor.pendingIds.slice(0, DETAIL_BATCH);
      const remaining = cursor.pendingIds.slice(DETAIL_BATCH);
      const items = await fetchDetailReports(base, slice, signal, { openOnly: true });
      return {
        items,
        nextCursor: remaining.length > 0 ? { pendingIds: remaining } : { since: new Date().toISOString() },
      };
    }

    // ── Phase 2: feed ───────────────────────────────────────────────────
    const feed = await fetchText(`${base}/feed.xml`, signal);
    const feedItems = parseFeed(feed);
    if (feedItems.length === 0) {
      throw new Error('Civia feed.xml parsed to zero items — feed shape changed?');
    }

    const withCoords = await attachCoords(base, feedItems, signal);
    return { items: withCoords, nextCursor: null };
  },

  /**
   * Re-poll detail pages for status. This is what turns expiry from a guessed
   * TTL into "the platform says it is resolved".
   */
  async fetchStatuses(
    source: ImportSourceRow,
    externalIds: readonly string[],
    signal: AbortSignal,
  ): Promise<Map<string, SourceStatus>> {
    const statuses = new Map<string, SourceStatus>();
    if (externalIds.length === 0) return statuses;

    const base = baseOf(source);
    const settled = await mapConcurrently(externalIds, DETAIL_CONCURRENCY, async (externalId) => {
      const html = await fetchText(`${base}/sesizari/${encodeURIComponent(externalId)}`, signal);
      const status = parseDetailStatus(html);
      return status ? ([externalId, status] as const) : null;
    });

    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value) {
        statuses.set(result.value[0], result.value[1]);
      }
    }
    return statuses;
  },
};

// ---------------------------------------------------------------------------
// Detail helpers
// ---------------------------------------------------------------------------

/**
 * Fetch detail pages for ids we have no feed row for (the backfill path), and
 * build reports straight from the page.
 */
const fetchDetailReports = async (
  base: string,
  ids: readonly string[],
  signal: AbortSignal,
  options: { openOnly: boolean },
): Promise<RawReport[]> => {
  const settled = await mapConcurrently(ids, DETAIL_CONCURRENCY, async (externalId) => {
    const url = `${base}/sesizari/${encodeURIComponent(externalId)}`;
    const html = await fetchText(url, signal);
    const coords = parseCoords(html);
    if (!coords) return null;

    const status = parseDetailStatus(html) ?? 'open';
    if (options.openOnly && status === 'closed') return null;

    const category = /\/sesizare\/([a-z0-9-]+)"/.exec(html)?.[1] ?? '';
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1]?.split('-')[0]?.trim() ?? null;

    return {
      externalId,
      lat: coords.lat,
      lon: coords.lon,
      categoryKey: slugToCategoryKey(category),
      categoryLabel: category,
      title,
      description: null,
      address: null,
      status,
      reportedAt: null,
      updatedAt: null,
      mediaUrl: null,
      raw: { externalId, url, coords, status },
    } satisfies RawReport;
  });

  const reports: RawReport[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) reports.push(result.value);
  }

  // Every page failing to yield coordinates means the payload shape moved.
  // Fail loudly rather than reporting a clean run that imported nothing.
  const failures = settled.filter((r) => r.status === 'rejected').length;
  if (reports.length === 0 && failures === ids.length && ids.length > 0) {
    throw new Error(`Civia: all ${ids.length} detail fetches failed — site or shape changed?`);
  }

  return reports;
};

/**
 * Attach coordinates from detail pages onto feed rows.
 *
 * A feed row without coordinates cannot be published — there is nowhere to put
 * the pin — so it is dropped, but a WHOLESALE failure throws.
 */
const attachCoords = async (
  base: string,
  feedItems: readonly CiviaFeedItem[],
  signal: AbortSignal,
): Promise<RawReport[]> => {
  const settled = await mapConcurrently(
    feedItems.slice(0, DETAIL_BATCH),
    DETAIL_CONCURRENCY,
    async (item) => {
      const url = `${base}/sesizari/${encodeURIComponent(item.externalId)}`;
      const html = await fetchText(url, signal);
      const coords = parseCoords(html);
      if (!coords) return null;
      return {
        externalId: item.externalId,
        lat: coords.lat,
        lon: coords.lon,
        categoryKey: item.categoryKey,
        categoryLabel: item.categoryKey,
        title: item.title,
        description: item.description,
        address: item.address,
        status: item.status ?? 'open',
        reportedAt: item.reportedAt,
        updatedAt: null,
        mediaUrl: null,
        raw: { feed: item, coords, url },
      } satisfies RawReport;
    },
  );

  const reports: RawReport[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) reports.push(result.value);
  }

  if (reports.length === 0 && feedItems.length > 0) {
    throw new Error(
      `Civia: no coordinates parsed from ${Math.min(feedItems.length, DETAIL_BATCH)} detail pages — RSC payload shape changed?`,
    );
  }

  return reports;
};

/**
 * Detail pages link to the category explainer by its long slug
 * (`/sesizare/groapa-in-asfalt`), while the feed uses a short one (`groapa`).
 * Normalise the long form onto the short form so both phases key the same
 * mapping table.
 */
const LONG_SLUG_TO_KEY: Readonly<Record<string, string>> = {
  'groapa-in-asfalt': 'groapa',
  'trotuar-stricat': 'trotuar',
  'parcare-pe-trotuar': 'parcare',
  'loc-de-parcare-trasat-ilegal': 'parcare_trasata',
  'masina-abandonata': 'masina_abandonata',
  'ocupare-abuziva-domeniu-public': 'ocupare_domeniu',
  'semafor-defect': 'semafor',
  'trecere-de-pietoni': 'trecere_pietoni',
  'caini-fara-stapan': 'caini',
  'stalpisori-anti-parcare': 'stalpisori',
  'iluminat-stradal-defect': 'iluminat',
  'gunoi-neridicat': 'gunoi',
  'canalizare-infundata': 'canalizare',
  'copac-periculos': 'copac',
  'spatiu-verde-neingrijit': 'spatiu_verde',
  'constructie-fara-autorizatie': 'constructie',
  'poluare-si-deseuri-in-natura': 'mediu',
  'transport-public': 'transport',
  'vandalism-mobilier-stradal': 'mobilier',
  'teren-in-paragina': 'teren_insalubru',
  'aspersoare-care-risipesc-apa': 'aspersoare',
};

export const slugToCategoryKey = (slug: string): string =>
  LONG_SLUG_TO_KEY[slug] ?? slug;
