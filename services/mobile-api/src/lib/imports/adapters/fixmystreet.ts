/**
 * FixMyStreet (mySociety) adapter — UK-wide, via its public Open311 feed.
 *
 * Why not the generic `open311` adapter: three properties of this source, all
 * measured against the live feed on 2026-10-12/13.
 *
 * 1. A query returns at most 1,000 reports, newest first, and the UK files
 *    ~3,100 a day. Time windows are therefore fetched one at a time and a
 *    window that comes back full is SPLIT in half and re-fetched, until every
 *    window fits. Paging parameters are not used.
 *
 * 2. Status sync by id does not scale. ~13,000 hazards are live at once, and
 *    the per-id lookup the open311 adapter uses would be ~13,000 requests per
 *    sweep. Re-reading the windows returns every report with its CURRENT
 *    status, so closures arrive in bulk with the sweep instead: the runner
 *    expires a published hazard when a re-seen report comes back closed.
 *    `fetchStatuses` is therefore a deliberate no-op.
 *
 * 3. The volume needs its own schedule. A full 8-week sweep is ~330 requests;
 *    sharing the weekly all-sources run would starve Cologne and Amsterdam of
 *    the shared time budget, so this source runs only when called by id.
 *
 * Sweeps. Each run resumes the pending window list. When it is empty a new
 * sweep starts: a FULL sweep over the last 8 weeks (to catch closures of older
 * reports) when the last one is a week old, otherwise an INCREMENTAL sweep
 * from 12 hours before the previous sweep's end up to now. A new sweep starts
 * at most every MIN_SWEEP_GAP; in between a run does nothing. That holds load
 * on a volunteer-run service to roughly 70 requests a day.
 */
import { fixMyStreetExpiresAt } from '../mappings/fixmystreet';
import { mapOpen311Request, toSecondPrecisionIso } from './open311';
import {
  AdapterFetchError,
  type FetchPageResult,
  type HazardSourceAdapter,
  type ImportCursor,
  type ImportSourceRow,
  type RawReport,
  type SourceStatus,
} from '../types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The feed's hard per-query cap. A response this size may be truncated. */
export const FIXMYSTREET_RESULT_CAP = 1000;
export const FULL_SWEEP_LOOKBACK_MS = 56 * DAY_MS;
export const FULL_SWEEP_INTERVAL_MS = 7 * DAY_MS;
export const INCREMENTAL_OVERLAP_MS = 12 * HOUR_MS;
export const MIN_SWEEP_GAP_MS = 6 * HOUR_MS;
export const WINDOW_MS = 6 * HOUR_MS;
/** Below this a full window is accepted rather than split further. */
const MIN_SPLIT_MS = 2 * 60 * 1000;
/** A window that fails this many times running is skipped (and logged). */
export const MAX_WINDOW_FAILURES = 3;
/** Pause before each request: this is a free, volunteer-run public service. */
export const POLITE_DELAY_MS = 1500;
const REQUEST_TIMEOUT_MS = 60_000;

const USER_AGENT =
  'DefensivePedalBot/1.0 (+https://defensivepedal.com; cycling-safety hazard import)';

/** [startMs, endMs) pairs, oldest first. */
type Window = readonly [number, number];

export const buildWindows = (startMs: number, endMs: number): Window[] => {
  const windows: Window[] = [];
  for (let t = startMs; t < endMs; t += WINDOW_MS) {
    windows.push([t, Math.min(t + WINDOW_MS, endMs)]);
  }
  return windows;
};

/**
 * Decide what the next sweep covers, or null when it is too soon for one.
 * Pure, so the cadence rules are testable without a network.
 */
export const planSweep = (
  cursor: ImportCursor,
  nowMs: number,
): { kind: 'full' | 'incremental'; windows: Window[] } | null => {
  const lastEnd = cursor.lastSweepEndedAt ? Date.parse(cursor.lastSweepEndedAt) : NaN;
  const lastFull = cursor.lastFullSweepAt ? Date.parse(cursor.lastFullSweepAt) : NaN;

  if (Number.isFinite(lastEnd) && nowMs - lastEnd < MIN_SWEEP_GAP_MS) return null;

  if (!Number.isFinite(lastFull) || nowMs - lastFull >= FULL_SWEEP_INTERVAL_MS || !Number.isFinite(lastEnd)) {
    return { kind: 'full', windows: buildWindows(nowMs - FULL_SWEEP_LOOKBACK_MS, nowMs) };
  }
  return {
    kind: 'incremental',
    windows: buildWindows(Math.max(lastEnd - INCREMENTAL_OVERLAP_MS, nowMs - FULL_SWEEP_LOOKBACK_MS), nowMs),
  };
};

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

export const buildRequestsUrl = (source: ImportSourceRow, window: Window): string => {
  const url = new URL(`${source.endpoint.replace(/\/+$/, '')}/requests.json`);
  if (source.jurisdiction) url.searchParams.set('jurisdiction_id', source.jurisdiction);
  url.searchParams.set('start_date', toSecondPrecisionIso(new Date(window[0]).toISOString()));
  url.searchParams.set('end_date', toSecondPrecisionIso(new Date(window[1]).toISOString()));
  return url.toString();
};

const fetchWindow = async (
  source: ImportSourceRow,
  window: Window,
  signal: AbortSignal,
): Promise<unknown[]> => {
  const url = buildRequestsUrl(source, window);
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  });
  if (!response.ok) {
    throw new Error(`FixMyStreet request failed: HTTP ${response.status} for ${url}`);
  }
  const text = await response.text();
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    throw new Error(`FixMyStreet returned non-JSON (endpoint changed?): ${url}`);
  }
  const payload = JSON.parse(text) as { service_requests?: unknown } | unknown[];
  const rows = Array.isArray(payload) ? payload : payload.service_requests;
  if (!Array.isArray(rows)) {
    throw new Error(`FixMyStreet response has no service_requests array: ${url}`);
  }
  return rows;
};

/**
 * One window -> the next cursor. Exported for tests; `fetcher` is injectable
 * so splitting and sweep completion can be exercised without the network.
 */
export const fetchFixMyStreetPage = async (
  source: ImportSourceRow,
  cursor: ImportCursor,
  signal: AbortSignal,
  options: {
    readonly nowMs?: number;
    readonly fetcher?: (window: Window) => Promise<unknown[]>;
    readonly delayMs?: number;
  } = {},
): Promise<FetchPageResult> => {
  const nowMs = options.nowMs ?? Date.now();
  let windows: Window[] = (cursor.windows ?? []).map((w) => [w[0], w[1]] as const);
  let state: ImportCursor = cursor;

  if (windows.length === 0) {
    const plan = planSweep(cursor, nowMs);
    if (!plan) {
      // Too soon for another sweep: nothing to do this run, state unchanged.
      return { items: [], nextCursor: null, idleCursor: cursor };
    }
    windows = plan.windows;
    state = {
      ...cursor,
      sweepKind: plan.kind,
      sweepStartedAt: new Date(nowMs).toISOString(),
      sweepEndMs: plan.windows.at(-1)?.[1],
    };
  }

  const [current, ...rest] = windows;
  if (!current) return { items: [], nextCursor: null, idleCursor: state };

  await sleep(options.delayMs ?? POLITE_DELAY_MS, signal);
  let rows: unknown[];
  try {
    rows = options.fetcher
      ? await options.fetcher(current)
      : await fetchWindow(source, current, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    // Count failures per window and keep the count across runs, so one window
    // that always errors is skipped after MAX_WINDOW_FAILURES rather than
    // blocking every later sweep (and with them, closures). Every failure
    // still fails the run, so a whole-site outage pages as before.
    const failures = (cursor.windowFailures ?? 0) + 1;
    const skip = failures >= MAX_WINDOW_FAILURES;
    const kept: ImportCursor = skip
      ? {
          ...state,
          windows: rest,
          windowFailures: 0,
          skippedWindowCount: (state.skippedWindowCount ?? 0) + 1,
        }
      : { ...state, windows, windowFailures: failures };
    const span = `${new Date(current[0]).toISOString()}..${new Date(current[1]).toISOString()}`;
    throw new AdapterFetchError(
      `FixMyStreet window ${span} failed (attempt ${failures}/${MAX_WINDOW_FAILURES}` +
        `${skip ? ', window skipped' : ''}): ${error instanceof Error ? error.message : 'unknown'}`,
      kept,
    );
  }

  const fitsCap = rows.length < FIXMYSTREET_RESULT_CAP;
  if (!fitsCap && current[1] - current[0] > MIN_SPLIT_MS) {
    // Possibly truncated: split and re-fetch both halves, oldest first.
    const mid = current[0] + Math.floor((current[1] - current[0]) / 2);
    const split: Window[] = [[current[0], mid], [mid, current[1]], ...rest];
    return { items: [], nextCursor: { ...state, windows: split, windowFailures: 0 } };
  }

  // At the split floor a full response may still be missing its oldest rows
  // (the feed is newest-first). Rare, since ~2 reports a minute is normal, but
  // a council bulk upload could do it, so say so rather than lose them quietly.
  const warnings = fitsCap
    ? undefined
    : [
        `FixMyStreet window ${new Date(current[0]).toISOString()}..` +
          `${new Date(current[1]).toISOString()} returned ${rows.length} rows at the ` +
          'split floor; its oldest reports may be missing',
      ];

  const items = rows
    .map((row) => mapOpen311Request(row as Parameters<typeof mapOpen311Request>[0]))
    .filter((item): item is RawReport => item !== null);

  if (rest.length > 0) {
    return { items, nextCursor: { ...state, windows: rest, windowFailures: 0 }, warnings };
  }

  // Sweep complete. Record when it ended (its last window's end, not "now",
  // so the next incremental sweep's overlap is measured from data actually
  // covered) and, for a full sweep, when it began.
  const finished: ImportCursor = {
    ...state,
    windows: [],
    windowFailures: 0,
    lastSweepEndedAt: new Date(state.sweepEndMs ?? current[1]).toISOString(),
    ...(state.sweepKind === 'full' ? { lastFullSweepAt: state.sweepStartedAt } : {}),
  };
  return { items, nextCursor: null, idleCursor: finished, warnings };
};

export const fixMyStreetAdapter: HazardSourceAdapter = {
  id: 'fixmystreet',
  dedicatedSchedule: true,
  stageCategoryIrrelevant: false,

  fetchPage(source, cursor, signal) {
    return fetchFixMyStreetPage(source, cursor, signal);
  },

  /** Closures arrive with the sweeps; see point 2 in the file header. */
  async fetchStatuses(): Promise<Map<string, SourceStatus>> {
    return new Map();
  },

  expiresAt(report: RawReport): string | null {
    return fixMyStreetExpiresAt(report);
  },
};
