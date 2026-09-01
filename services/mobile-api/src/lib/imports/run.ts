/**
 * Hazard import runner.
 *
 * Invoked by POST /v1/imports/run (Cloud Scheduler, weekly).
 *
 * Design constraints that shaped this file:
 *
 * 1. CURSOR-BASED, PERSISTED PER PAGE. Cloud Scheduler's attempt deadline is
 *    300s and a cron that overruns it is TRUNCATED, not merely slow — without
 *    a cursor it re-grinds the same prefix every run and the tail is never
 *    processed, silently, because it still wrote rows before dying
 *    (error-log #82). We persist after every page and stop cleanly on budget.
 *
 * 2. ROUND-TRIPS, NOT QUERIES. Supabase is us-east-1, Cloud Run is
 *    europe-central2 — ~100ms each way. Staging writes and dedup lookups are
 *    batched with chunked `in (...)`, never per-item.
 *
 * 3. SILENCE IS THE DANGEROUS FAILURE. A run that "succeeds" while importing
 *    zero items because a source changed shape looks identical to a quiet
 *    week. Every drop reason is counted and logged, and a source that yields
 *    nothing twice running is escalated to a thrown error so the existing GCP
 *    "Cloud Scheduler job failed" alert policy fires.
 */
import type { FastifyBaseLogger } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';

import { config } from '../../config';
import { getAdapter } from './adapters';
import { classifyReport, resolveMapping, type ClassifyDeps } from './classify';
import {
  emptyCounters,
  type ClassificationResult,
  type ImportCursor,
  type ImportRunCounters,
  type ImportSourceRow,
  type ImportSourceRunResult,
  type RawReport,
  type SourceStatus,
} from './types';

const STAGING_CHUNK = 200;

// ---------------------------------------------------------------------------
// Coordinate validation
// ---------------------------------------------------------------------------

/**
 * Null-island and wrong-country guard.
 *
 * error-log #53: a stale GPS fix from another city added thousands of km and
 * awarded phantom badges. An external source we do not control deserves at
 * least the same suspicion — a mis-parsed coordinate lands a hazard marker in
 * the Gulf of Guinea or, worse, plausibly in the wrong city.
 */
export const isCoordinateAcceptable = (
  source: ImportSourceRow,
  lat: number,
  lon: number,
): boolean => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;

  const { bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon } = source;
  if (
    bbox_min_lat === null ||
    bbox_min_lon === null ||
    bbox_max_lat === null ||
    bbox_max_lon === null
  ) {
    return true; // no bbox configured — nothing further to assert
  }
  return (
    lat >= bbox_min_lat && lat <= bbox_max_lat && lon >= bbox_min_lon && lon <= bbox_max_lon
  );
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const loadEnabledSources = async (
  db: SupabaseClient,
  onlySourceId?: string,
): Promise<ImportSourceRow[]> => {
  let query = db.from('hazard_import_sources').select('*').eq('enabled', true);
  if (onlySourceId) query = query.eq('id', onlySourceId);
  const { data, error } = await query.order('id');
  if (error) throw new Error(`Failed to load import sources: ${error.message}`);
  return (data ?? []) as ImportSourceRow[];
};

const persistCursor = async (
  db: SupabaseClient,
  sourceId: string,
  cursor: ImportCursor,
): Promise<void> => {
  const { error } = await db
    .from('hazard_import_sources')
    .update({ cursor })
    .eq('id', sourceId);
  if (error) throw new Error(`Failed to persist cursor for ${sourceId}: ${error.message}`);
};

const recordRunOutcome = async (
  db: SupabaseClient,
  source: ImportSourceRow,
  ok: boolean,
  errorMessage: string | null,
  cursor: ImportCursor,
  sawItems: boolean,
): Promise<void> => {
  const nowIso = new Date().toISOString();
  await db
    .from('hazard_import_sources')
    .update({
      cursor,
      last_run_at: nowIso,
      ...(sawItems ? { last_items_at: nowIso } : {}),
      ...(ok
        ? { last_ok_at: nowIso, consecutive_failures: 0, last_error: null }
        : {
            consecutive_failures: source.consecutive_failures + 1,
            last_error: errorMessage?.slice(0, 500) ?? 'unknown',
          }),
    })
    .eq('id', source.id);
};

/**
 * Dead-endpoint detector.
 *
 * An empty run is NOT a fault: the cursor advances to `now` once a window is
 * exhausted, so any run shortly after a completed one legitimately fetches
 * nothing. What IS a fault is a source that has produced nothing for longer
 * than one collection cycle — for a city running ~670 reports/week, silence
 * for over a week means the endpoint changed, not that the city went quiet.
 *
 * The fast failure modes (non-JSON HTML from a migrated endpoint, HTTP errors)
 * already throw immediately inside the adapter; this covers only the slow one.
 */
export const isSourceStale = (
  source: ImportSourceRow,
  fetched: number,
  now: Date = new Date(),
): boolean => {
  if (fetched > 0) return false;
  const reference = source.last_items_at ?? source.last_ok_at;
  if (!reference) return false; // never yet succeeded — nothing to compare
  const ageMs = now.getTime() - new Date(reference).getTime();
  return ageMs > source.stale_after_days * 24 * 60 * 60 * 1000;
};

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

interface StagedRow {
  source_id: string;
  external_id: string;
  raw: unknown;
  lat: number;
  lon: number;
  source_status: string | null;
  reported_at: string | null;
  updated_at_src: string | null;
  media_url: string | null;
  mapped_type: string | null;
  llm_verdict: unknown;
  review_state: string;
  reject_reason: string | null;
  updated_at: string;
}

/** Which of these external ids do we already have staged? */
const findExistingExternalIds = async (
  db: SupabaseClient,
  sourceId: string,
  externalIds: readonly string[],
): Promise<Set<string>> => {
  const found = new Set<string>();
  for (let i = 0; i < externalIds.length; i += STAGING_CHUNK) {
    const chunk = externalIds.slice(i, i + STAGING_CHUNK);
    const { data, error } = await db
      .from('hazard_imports')
      .select('external_id')
      .eq('source_id', sourceId)
      .in('external_id', chunk);
    if (error) throw new Error(`Dedup lookup failed: ${error.message}`);
    for (const row of data ?? []) found.add((row as { external_id: string }).external_id);
  }
  return found;
};

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

const backstopExpiry = (source: ImportSourceRow): string =>
  new Date(Date.now() + source.backstop_ttl_days * 24 * 60 * 60 * 1000).toISOString();

/**
 * Write an approved import into `hazards`.
 *
 * Deliberately a direct table write, NOT a loop through POST /v1/hazards with
 * a service account. Every side effect on that route is gated behind
 * `if (user?.id)` — award_xp, qualifyStreakAsync, the post_hazard_thanks push,
 * and autoPublishHazardStandalone to the social feed (v1.ts:843-866). A
 * service identity would re-enable all four and spam the activity feed with
 * hazards nobody reported. user_id stays NULL, which suppresses them.
 *
 * `expires_at` is set explicitly, which migration 202608270001 made possible
 * by dropping the column default that used to pre-empt the trigger.
 */
export interface PublishCandidate {
  external_id: string;
  lat: number;
  lon: number;
  mapped_type: string;
  summary: string | null;
  reported_at: string | null;
}

const PUBLISH_CHUNK = 200;

/**
 * Write approved imports into `hazards`, in batches.
 *
 * Deliberately a direct table write, NOT a loop through POST /v1/hazards with
 * a service account. Every side effect on that route is gated behind
 * `if (user?.id)` — award_xp, qualifyStreakAsync, the post_hazard_thanks push,
 * and autoPublishHazardStandalone to the social feed (v1.ts:843-866). A
 * service identity would re-enable all four and spam the activity feed with
 * hazards nobody reported. user_id stays NULL, which suppresses them.
 *
 * `expires_at` is set explicitly, which migration 202608270001 made possible
 * by dropping the column default that used to pre-empt the trigger.
 *
 * BATCHED, not per-item: Supabase is us-east-1 and Cloud Run europe-central2,
 * so every round-trip is ~100 ms. Amsterdam publishes ~2,000 hazards per
 * sweep; at two round-trips each that is ~400 s against a 240 s budget, i.e.
 * a run that could never finish. Two chunked statements per 200 rows instead.
 *
 * Returns external_id -> hazard id for the rows that were written.
 */
export const publishImports = async (
  db: SupabaseClient,
  source: ImportSourceRow,
  candidates: readonly PublishCandidate[],
): Promise<Map<string, string>> => {
  const idByExternalId = new Map<string, string>();
  if (candidates.length === 0) return idByExternalId;

  const expiresAt = backstopExpiry(source);
  const nowIso = new Date().toISOString();

  for (let i = 0; i < candidates.length; i += PUBLISH_CHUNK) {
    const chunk = candidates.slice(i, i + PUBLISH_CHUNK);
    const rows = chunk.map((c) => ({
      user_id: null,
      location: { latitude: c.lat, longitude: c.lon },
      hazard_type: c.mapped_type,
      description: c.summary,
      source: 'manual',
      import_source: source.id,
      import_external_id: c.external_id,
      alert_eligible: source.alert_eligible,
      reported_at: c.reported_at ?? nowIso,
      expires_at: expiresAt,
    }));

    const { data, error } = await db
      .from('hazards')
      .upsert(rows, { onConflict: 'import_source,import_external_id' })
      .select('id, import_external_id');

    if (error) {
      throw new Error(`Publish batch failed (${chunk.length} rows): ${error.message}`);
    }

    for (const row of (data ?? []) as { id: string; import_external_id: string }[]) {
      idByExternalId.set(row.import_external_id, row.id);
    }
  }

  return idByExternalId;
};

// ---------------------------------------------------------------------------
// Status sync
// ---------------------------------------------------------------------------

/**
 * Re-poll the source for every published-and-still-live import and expire the
 * ones the city has closed.
 *
 * This is the real payoff of Open311 over scraping: expiry stops being a
 * guessed TTL and becomes "the city says the pothole is fixed".
 */
export const syncStatuses = async (
  db: SupabaseClient,
  source: ImportSourceRow,
  counters: ImportRunCounters,
  signal: AbortSignal,
  log: FastifyBaseLogger,
): Promise<void> => {
  const adapter = getAdapter(source.adapter);
  if (!adapter) return;

  const { data, error } = await db
    .from('hazards')
    .select('id, import_external_id')
    .eq('import_source', source.id)
    .gt('expires_at', new Date().toISOString())
    .limit(500);
  if (error) throw new Error(`Status-sync lookup failed: ${error.message}`);

  const live = (data ?? []) as { id: string; import_external_id: string }[];
  if (live.length === 0) return;

  const ids = live.map((row) => row.import_external_id);
  let statuses: Map<string, SourceStatus>;
  try {
    statuses = await adapter.fetchStatuses(source, ids, signal);
  } catch (statusError) {
    // Non-fatal: a status-sync outage must not fail the whole ingest run.
    // The backstop TTL still bounds every imported hazard.
    log.warn(
      { event: 'hazard_import_status_sync_failed', sourceId: source.id, err: statusError },
      'status sync failed; backstop TTL still applies',
    );
    return;
  }

  counters.statusChecked += statuses.size;

  const toExpire = live
    .filter((row) => statuses.get(row.import_external_id) === 'closed')
    .map((row) => row.id);

  if (toExpire.length > 0) {
    const nowIso = new Date().toISOString();
    const { error: expireError } = await db
      .from('hazards')
      .update({ expires_at: nowIso })
      .in('id', toExpire);
    if (expireError) {
      log.warn(
        { event: 'hazard_import_expire_failed', sourceId: source.id, err: expireError.message },
        'failed to expire resolved imports',
      );
    } else {
      counters.expiredByStatus += toExpire.length;
    }
  }
};

/**
 * Re-classify staged rows that stalled for a TRANSIENT reason.
 *
 * Without this they stall forever: `findExistingExternalIds` counts anything
 * already staged as a duplicate, so a row parked as `pending` because the run
 * budget ran out, the model key was missing, or the provider errored would
 * never be looked at again — it is neither re-fetched nor re-classified. The
 * first live run left 40 items in exactly that state.
 *
 * Only transient reasons are retried. `llm_low_confidence` and
 * `llm_invalid_type` are genuine human-review states and must NOT be silently
 * retried into an auto-publish.
 */
const TRANSIENT_REJECT_PREFIXES = ['run_budget_exhausted', 'llm_unconfigured', 'llm_error'];

export const reprocessStalled = async (
  db: SupabaseClient,
  source: ImportSourceRow,
  counters: ImportRunCounters,
  options: RunOptions,
  log: FastifyBaseLogger,
): Promise<void> => {
  const { data, error } = await db
    .from('hazard_imports')
    .select('external_id, raw, lat, lon, source_status, reported_at, media_url, reject_reason')
    .eq('source_id', source.id)
    .eq('review_state', 'pending')
    .is('hazard_id', null)
    .limit(500);
  if (error) throw new Error(`Stalled-item lookup failed: ${error.message}`);

  const stalled = (data ?? []).filter((row) => {
    const reason = (row as { reject_reason: string | null }).reject_reason ?? '';
    return TRANSIENT_REJECT_PREFIXES.some((prefix) => reason.startsWith(prefix));
  });
  if (stalled.length === 0) return;

  log.info(
    { event: 'hazard_import_reprocess_stalled', sourceId: source.id, count: stalled.length },
    're-classifying items stalled on a transient failure',
  );

  const reports: RawReport[] = stalled.map((row) => {
    const raw = (row as { raw: Record<string, unknown> }).raw ?? {};
    const typed = row as {
      external_id: string;
      lat: number;
      lon: number;
      source_status: string | null;
      reported_at: string | null;
      media_url: string | null;
    };
    return {
      externalId: typed.external_id,
      lat: typed.lat,
      lon: typed.lon,
      categoryKey: String(raw.service_code ?? ''),
      categoryLabel: String(raw.service_name ?? ''),
      title: raw.title ? String(raw.title) : null,
      description: raw.description ? String(raw.description) : null,
      address: raw.address_string ? String(raw.address_string) : null,
      status: typed.source_status === 'closed' ? 'closed' : typed.source_status === 'open' ? 'open' : null,
      reportedAt: typed.reported_at,
      updatedAt: null,
      mediaUrl: typed.media_url,
      raw,
    };
  });

  await processClassified(db, source, reports, counters, options, log, { restage: true });
};

// ---------------------------------------------------------------------------
// Per-source run
// ---------------------------------------------------------------------------

export interface RunOptions {
  readonly deadline: number;
  readonly classifyDeps?: ClassifyDeps;
  readonly signal: AbortSignal;
}

export const runSource = async (
  db: SupabaseClient,
  source: ImportSourceRow,
  log: FastifyBaseLogger,
  options: RunOptions,
): Promise<ImportSourceRunResult> => {
  const counters = emptyCounters();
  let cursor: ImportCursor = source.cursor ?? {};
  let pagesFetched = 0;
  let truncated = false;

  const adapter = getAdapter(source.adapter);
  if (!adapter) {
    const message = `No adapter registered for '${source.adapter}' (source ${source.id}). ` +
      'Enabling a source before its adapter exists imports nothing.';
    await recordRunOutcome(db, source, false, message, cursor, false);
    return { sourceId: source.id, ok: false, error: message, counters, pagesFetched, truncated };
  }

  try {
    // Retry anything that stalled on a transient failure BEFORE fetching new
    // pages, so a backlog can never be starved by fresh data.
    await reprocessStalled(db, source, counters, options, log);

    for (let page = 0; page < config.imports.maxPagesPerSource; page += 1) {
      if (Date.now() > options.deadline) {
        truncated = true;
        break;
      }

      const { items, nextCursor } = await adapter.fetchPage(source, cursor, options.signal);
      pagesFetched += 1;
      counters.fetched += items.length;

      await processBatch(db, source, items, counters, options, log);

      // Persist AFTER the batch is durably staged, so a crash re-processes at
      // most one page rather than skipping it.
      cursor = nextCursor ?? { since: new Date().toISOString(), page: 1 };
      await persistCursor(db, source.id, cursor);

      if (!nextCursor) break;
      if (page === config.imports.maxPagesPerSource - 1) truncated = true;
    }

    await syncStatuses(db, source, counters, options.signal, log);

    const sawItems = counters.fetched > 0;

    if (isSourceStale(source, counters.fetched)) {
      const message =
        `Source ${source.id} has produced no items since ` +
        `${source.last_items_at ?? source.last_ok_at} (> ${source.stale_after_days}d). ` +
        'Likely a changed or dead endpoint, not a quiet period.';
      await recordRunOutcome(db, source, false, message, cursor, sawItems);
      return { sourceId: source.id, ok: false, error: message, counters, pagesFetched, truncated };
    }

    await recordRunOutcome(db, source, true, null, cursor, sawItems);
    return { sourceId: source.id, ok: true, error: null, counters, pagesFetched, truncated };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    await recordRunOutcome(db, source, false, message, cursor, counters.fetched > 0);
    return { sourceId: source.id, ok: false, error: message, counters, pagesFetched, truncated };
  }
};

/**
 * Drop imports that came from our own riders.
 *
 * Defensive Pedal pushes riders TO civia.ro: report a pothole in the app, tap
 * "Fa o sesizare", and the same pothole becomes a public sesizare. Importing
 * that back would put a second pin beside the rider's own hazard and — worse —
 * make our own outbound volume look like independent corroboration.
 *
 * `sesizari` records exactly what we sent (coordinate, hazard type, the moment
 * of the hand-off), so the match is: same hazard type, within
 * ROUND_TRIP_RADIUS_METERS, handed off within ROUND_TRIP_WINDOW_DAYS before
 * the platform published it. Deliberately narrow — a false positive silently
 * hides a real report, which is worse than the duplicate it prevents.
 *
 * Only meaningful for Romanian sources; everywhere else the query returns
 * nothing and the whole step is skipped.
 */
const ROUND_TRIP_RADIUS_METERS = 120;
const ROUND_TRIP_WINDOW_DAYS = 30;

export const suppressRoundTrips = async (
  db: SupabaseClient,
  source: ImportSourceRow,
  items: readonly RawReport[],
): Promise<{ kept: RawReport[]; suppressed: number }> => {
  if (source.country_code !== 'RO' || items.length === 0) {
    return { kept: [...items], suppressed: 0 };
  }

  const since = new Date(
    Date.now() - ROUND_TRIP_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await db
    .from('sesizari')
    .select('hazard_type, lat, lon, created_at')
    .gte('created_at', since);

  // Best-effort: a failed lookup must not stop the import. The cost of missing
  // it is a duplicate pin, not a lost hazard.
  if (error || !data) return { kept: [...items], suppressed: 0 };

  const ours = data as { hazard_type: string; lat: number; lon: number }[];
  if (ours.length === 0) return { kept: [...items], suppressed: 0 };

  const kept: RawReport[] = [];
  let suppressed = 0;
  for (const item of items) {
    // The report is not classified yet, so use the deterministic map to learn
    // what it WOULD become. When the category is ambiguous ('llm'/'review')
    // the type is unknowable here, so we keep the item: a duplicate pin is a
    // cheaper mistake than silently hiding a genuine report.
    const outcome = resolveMapping(source, item);
    if (outcome.kind !== 'type') {
      kept.push(item);
      continue;
    }

    const mine = ours.some(
      (row) =>
        row.hazard_type === outcome.hazardType &&
        distanceMeters(item.lat, item.lon, row.lat, row.lon) <= ROUND_TRIP_RADIUS_METERS,
    );
    if (mine) {
      suppressed += 1;
      continue;
    }
    kept.push(item);
  }
  return { kept, suppressed };
};

/** Haversine, metres. */
const distanceMeters = (
  latA: number,
  lonA: number,
  latB: number,
  lonB: number,
): number => {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(latB - latA);
  const dLon = toRad(lonB - lonA);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const processBatch = async (
  db: SupabaseClient,
  source: ImportSourceRow,
  items: readonly RawReport[],
  counters: ImportRunCounters,
  options: RunOptions,
  log: FastifyBaseLogger,
): Promise<void> => {
  if (items.length === 0) return;

  const existing = await findExistingExternalIds(
    db,
    source.id,
    items.map((item) => item.externalId),
  );

  const fresh: RawReport[] = [];
  for (const item of items) {
    if (existing.has(item.externalId)) {
      counters.duplicate += 1;
      continue;
    }
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) {
      counters.badCoords += 1;
      continue;
    }
    if (!isCoordinateAcceptable(source, item.lat, item.lon)) {
      counters.outOfBbox += 1;
      continue;
    }
    fresh.push(item);
  }

  if (fresh.length === 0) return;

  // Our own riders' sesizări must not come back as a second pin.
  const { kept, suppressed } = await suppressRoundTrips(db, source, fresh);
  counters.roundTrip += suppressed;
  if (kept.length === 0) return;

  await processClassified(db, source, kept, counters, options, log, { restage: false });
};

/**
 * Classify a set of reports, stage them, and publish the approved ones.
 *
 * Shared by the fetch path and the stalled-item retry path, so a retried item
 * goes through exactly the same gates as a fresh one — no second, divergent
 * code path that could publish something the main path would not.
 */
const processClassified = async (
  db: SupabaseClient,
  source: ImportSourceRow,
  fresh: readonly RawReport[],
  counters: ImportRunCounters,
  options: RunOptions,
  log: FastifyBaseLogger,
  { restage }: { restage: boolean },
): Promise<void> => {
  if (fresh.length === 0) return;

  const rows: StagedRow[] = [];
  const publishable: PublishCandidate[] = [];

  // Classify with bounded concurrency.
  //
  // The deterministic path is synchronous and free, but the model path is a
  // network round-trip each. The first live Cologne run needed 352 of them in
  // one batch — sequentially that is ~6-12 minutes, far past the 240s budget
  // and the 300s Cloud Scheduler deadline. The 401s returned instantly and
  // hid it. Small pool: enough to stay inside budget, gentle enough not to
  // trip provider rate limits (which would just become llm_error -> review).
  const CLASSIFY_CONCURRENCY = 6;

  const classified: (ClassificationResult & { item: RawReport })[] = [];
  let budgetExhausted = false;

  for (let i = 0; i < fresh.length; i += CLASSIFY_CONCURRENCY) {
    if (Date.now() > options.deadline) {
      budgetExhausted = true;
      // Remaining items are still STAGED below (as pending) rather than
      // dropped, so nothing is lost — the next run picks them up from the
      // review queue instead of re-fetching them.
      for (const item of fresh.slice(i)) {
        classified.push({
          item,
          reviewState: 'pending',
          hazardType: null,
          summaryEn: null,
          verdict: null,
          rejectReason: 'run_budget_exhausted',
          modelInvoked: false,
          usage: null,
        });
      }
      break;
    }
    const slice = fresh.slice(i, i + CLASSIFY_CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (item) => ({
        item,
        ...(await classifyReport(source, item, options.signal, options.classifyDeps)),
      })),
    );
    classified.push(...results);
  }

  if (budgetExhausted) {
    log.warn(
      { event: 'hazard_import_classify_budget_exhausted', sourceId: source.id },
      'run budget hit mid-batch; remaining items staged for review, not dropped',
    );
  }

  for (const result of classified) {
    const { item } = result;
    if (result.modelInvoked) counters.llmCalled += 1;
    if (result.usage) {
      counters.llmPromptTokens += result.usage.promptTokens;
      counters.llmCompletionTokens += result.usage.completionTokens;
    }
    if (result.rejectReason?.startsWith('llm_error')) counters.llmError += 1;
    if (result.reviewState === 'irrelevant') counters.irrelevant += 1;
    if (result.reviewState === 'pending') counters.queuedForReview += 1;
    if (result.reviewState === 'auto_approved') counters.autoApproved += 1;

    rows.push({
      source_id: source.id,
      external_id: item.externalId,
      raw: item.raw,
      lat: item.lat,
      lon: item.lon,
      source_status: item.status,
      reported_at: item.reportedAt,
      updated_at_src: item.updatedAt,
      media_url: item.mediaUrl,
      mapped_type: result.hazardType,
      llm_verdict: result.verdict,
      review_state: result.reviewState,
      reject_reason: result.rejectReason,
      updated_at: new Date().toISOString(),
    });

    // Only publish items the source still considers open. Importing an
    // already-closed report would put a hazard on the map that the city has
    // already fixed.
    if (result.reviewState === 'auto_approved' && result.hazardType && item.status !== 'closed') {
      publishable.push({
        external_id: item.externalId,
        lat: item.lat,
        lon: item.lon,
        mapped_type: result.hazardType,
        summary: result.summaryEn,
        reported_at: item.reportedAt,
      });
    }
  }

  for (let i = 0; i < rows.length; i += STAGING_CHUNK) {
    const chunk = rows.slice(i, i + STAGING_CHUNK);
    const { error } = await db
      .from('hazard_imports')
      .upsert(chunk, { onConflict: 'source_id,external_id' });
    if (error) throw new Error(`Staging upsert failed: ${error.message}`);
    // A retried row is re-staged in place, not newly staged — counting it
    // again would inflate `staged` above `fetched` and make the run report
    // look wrong.
    if (!restage) counters.staged += chunk.length;
  }

  try {
    const idByExternalId = await publishImports(db, source, publishable);
    counters.published += idByExternalId.size;
    counters.publishFailed += publishable.length - idByExternalId.size;

    // Link staging rows back to their hazards, also batched. Grouped by
    // hazard id so this is one statement per row only in the worst case;
    // in practice the ids differ so we chunk on external_id instead.
    const linkable = [...idByExternalId.entries()];
    for (let i = 0; i < linkable.length; i += PUBLISH_CHUNK) {
      const chunk = linkable.slice(i, i + PUBLISH_CHUNK);
      await Promise.all(
        chunk.map(([externalId, hazardId]) =>
          db
            .from('hazard_imports')
            .update({ hazard_id: hazardId })
            .eq('source_id', source.id)
            .eq('external_id', externalId),
        ),
      );
    }
  } catch (error) {
    counters.publishFailed += publishable.length;
    log.warn(
      {
        event: 'hazard_import_publish_failed',
        sourceId: source.id,
        count: publishable.length,
        err: error instanceof Error ? error.message : 'unknown',
      },
      'failed to publish imported hazard batch',
    );
  }
};
