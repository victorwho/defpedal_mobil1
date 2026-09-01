/**
 * Hazard import pipeline — shared types.
 *
 * See docs/plans/hazard-import-pipeline.md for the design and decision record.
 *
 * The adapter seam exists so that adding a source is (ideally) a registry row
 * plus one file. Cologne ships as `open311`; `civia` is registered in the DB
 * but disabled pending consent, and its adapter is not implemented yet.
 */
import type { HazardType } from '@defensivepedal/core';

/** Valid `hazards.hazard_type` values, per the live CHECK constraint. */
export const IMPORTABLE_HAZARD_TYPES = [
  'illegally_parked_car',
  'blocked_bike_lane',
  'missing_bike_lane',
  'pothole',
  'poor_surface',
  'narrow_street',
  'dangerous_intersection',
  'aggro_dogs',
  'aggressive_traffic',
  'other',
] as const satisfies readonly HazardType[];

export type ImportableHazardType = (typeof IMPORTABLE_HAZARD_TYPES)[number];

/**
 * Guard against a mapping table or an LLM response naming a type the DB will
 * reject. `construction` is the live trap: it was REMOVED from
 * hazards_hazard_type_check by 202604210003 (swapped for `aggro_dogs`), so an
 * insert with it returns 400 — verified against production 2026-08-27.
 */
export const isImportableHazardType = (
  value: unknown,
): value is ImportableHazardType =>
  typeof value === 'string' &&
  (IMPORTABLE_HAZARD_TYPES as readonly string[]).includes(value);

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface ImportSourceRow {
  readonly id: string;
  readonly adapter: 'open311' | 'civia' | 'signalen';
  readonly endpoint: string;
  readonly jurisdiction: string | null;
  readonly country_code: string;
  readonly enabled: boolean;
  readonly alert_eligible: boolean;
  readonly coordinate_precision: 'pin' | 'geocoded';
  /**
   * How this Open311 implementation pages. GeoReport v2 does not standardise
   * it: Cologne honours `page=N`, Zaragoza IGNORES `page` and honours a Solr
   * -style `start=` row offset (verified live 2026-09-01). Sending the wrong
   * one is not an error — it silently returns page 1 forever.
   */
  readonly pagination_style: 'page' | 'offset';
  readonly licence: string;
  readonly attribution_text: string;
  readonly attribution_url: string;
  readonly bbox_min_lat: number | null;
  readonly bbox_min_lon: number | null;
  readonly bbox_max_lat: number | null;
  readonly bbox_max_lon: number | null;
  readonly backstop_ttl_days: number;
  readonly cursor: ImportCursor;
  readonly last_run_at: string | null;
  readonly last_ok_at: string | null;
  /** When this source last returned at least one report. */
  readonly last_items_at: string | null;
  /** Days of silence tolerated before a run is treated as failed. */
  readonly stale_after_days: number;
  readonly consecutive_failures: number;
}

/**
 * Opaque per-source resume point. Persisted after EVERY page, not at the end
 * of a run — a truncated cron must resume, not re-grind its own prefix
 * (error-log #82).
 */
export interface ImportCursor {
  /** ISO timestamp; the window start for the next fetch. */
  readonly since?: string;
  /** 1-based page within the current window. */
  readonly page?: number;
  /** Highest source id observed, for adapters with monotonic ids. */
  readonly lastExternalId?: string;
  /**
   * Pending bounding boxes for quadtree adapters (Amsterdam).
   *
   * Signalen caps every response at 4,000 features and offers no paging, so
   * coverage comes from splitting the city until each tile falls under the
   * cap. Each entry is [minLon, minLat, maxLon, maxLat]. Persisted like any
   * other cursor so a truncated run resumes mid-sweep instead of restarting.
   */
  readonly tiles?: readonly (readonly number[])[];
  /**
   * Remaining source ids for a one-off backfill sweep (Civia).
   *
   * Civia publishes only the 50 most recent sesizări in its feed, so first
   * contact enumerates sitemap.xml and works the back catalogue down in
   * batches. `undefined` (never set) means the sweep has not started;
   * an empty/absent list alongside `since` means it is finished and the
   * adapter has switched to polling the feed.
   */
  readonly pendingIds?: readonly string[];
}

// ---------------------------------------------------------------------------
// Adapter contract
// ---------------------------------------------------------------------------

/** One report as produced by an adapter, before classification. */
export interface RawReport {
  /** The source system's own stable identifier. */
  readonly externalId: string;
  readonly lat: number;
  readonly lon: number;
  /** Source-native category label; the deterministic map keys on this. */
  readonly categoryKey: string;
  readonly categoryLabel: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly address: string | null;
  /** Normalised: 'open' | 'closed' | null when the source has no signal. */
  readonly status: SourceStatus | null;
  readonly reportedAt: string | null;
  readonly updatedAt: string | null;
  readonly mediaUrl: string | null;
  /** Verbatim source payload, stored for audit and re-processing. */
  readonly raw: unknown;
}

export type SourceStatus = 'open' | 'closed';

export interface FetchPageResult {
  readonly items: readonly RawReport[];
  /** null signals end-of-data for this run. */
  readonly nextCursor: ImportCursor | null;
}

export interface HazardSourceAdapter {
  readonly id: string;
  /** Fetch one page. Adapters must not retry internally; the runner decides. */
  fetchPage(
    source: ImportSourceRow,
    cursor: ImportCursor,
    signal: AbortSignal,
  ): Promise<FetchPageResult>;
  /** Re-poll status for already-published imports (drives real expiry). */
  fetchStatuses(
    source: ImportSourceRow,
    externalIds: readonly string[],
    signal: AbortSignal,
  ): Promise<Map<string, SourceStatus>>;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Outcome of the deterministic category map.
 *
 * A 'type' outcome carries its own English `summaryEn`. That is deliberate:
 * the deterministic path never calls the model, so without a written phrase
 * the only material available is the source's own fields — and Cologne's
 * `title` is literally `#<id> <service_name>`, which produced descriptions
 * like "Kfz-Ampel defekt — #19078-2026 Kfz-Ampel defekt": German, duplicated,
 * and leaking the city's report number into a rider-facing sheet.
 */
export type MappingOutcome =
  | {
      readonly kind: 'type';
      readonly hazardType: ImportableHazardType;
      readonly summaryEn: string;
    }
  | { readonly kind: 'irrelevant' }
  /** Category is generic/ambiguous — read the free text. */
  | { readonly kind: 'llm' }
  /**
   * Cannot be decided automatically AND there is no text for a model to read.
   *
   * Needed for sources like Amsterdam's Signalen feed, whose public payload
   * carries a category and a timestamp and nothing else. An unrecognised
   * category there cannot be resolved by the model — there is no prose — so
   * it goes to a human, who then extends the mapping table. Dropping it
   * silently would hide every new category the city introduces.
   */
  | { readonly kind: 'review'; readonly reason: string };

/**
 * Token usage for one model call, straight from the provider's `usage` block.
 *
 * Authoritative — unlike any cost figure derived from it, which depends on a
 * price list that goes stale silently. Null when the provider omitted usage.
 */
export interface LlmUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface LlmVerdict {
  readonly relevant: boolean;
  readonly hazard_type: string | null;
  readonly confidence: number;
  readonly summary_en: string;
  readonly reason: string;
}

export type ReviewState =
  | 'pending'
  | 'auto_approved'
  | 'approved'
  | 'rejected'
  | 'irrelevant';

export interface ClassificationResult {
  readonly reviewState: ReviewState;
  readonly hazardType: ImportableHazardType | null;
  readonly summaryEn: string | null;
  readonly verdict: LlmVerdict | null;
  readonly rejectReason: string | null;
  /**
   * Whether the model was actually invoked. Counted separately from `verdict`
   * because a failed call produces no verdict but still costs time and money —
   * the first live run reported llmCalled:0 alongside llmError:352, which is
   * exactly the kind of counter that hides a problem.
   */
  readonly modelInvoked: boolean;
  /** Token usage for this item's model call; null when none was made. */
  readonly usage: LlmUsage | null;
}

// ---------------------------------------------------------------------------
// Run reporting
// ---------------------------------------------------------------------------

/**
 * Per-run counters. Every drop reason is counted separately and logged:
 * a silent cap reads as "covered everything" when it didn't.
 */
export interface ImportRunCounters {
  fetched: number;
  staged: number;
  duplicate: number;
  /**
   * Imports skipped because WE produced them: a rider used the in-app
   * sesizare hand-off, so the hazard already exists on our map and the
   * platform copy would be a second pin beside it. See suppressRoundTrips().
   */
  roundTrip: number;
  badCoords: number;
  outOfBbox: number;
  irrelevant: number;
  llmCalled: number;
  llmError: number;
  /** Measured prompt/completion tokens across every model call this run. */
  llmPromptTokens: number;
  llmCompletionTokens: number;
  autoApproved: number;
  queuedForReview: number;
  published: number;
  publishFailed: number;
  statusChecked: number;
  expiredByStatus: number;
}

export const emptyCounters = (): ImportRunCounters => ({
  fetched: 0,
  staged: 0,
  duplicate: 0,
  roundTrip: 0,
  badCoords: 0,
  outOfBbox: 0,
  irrelevant: 0,
  llmCalled: 0,
  llmError: 0,
  llmPromptTokens: 0,
  llmCompletionTokens: 0,
  autoApproved: 0,
  queuedForReview: 0,
  published: 0,
  publishFailed: 0,
  statusChecked: 0,
  expiredByStatus: 0,
});

export interface ImportSourceRunResult {
  readonly sourceId: string;
  readonly ok: boolean;
  readonly error: string | null;
  readonly counters: ImportRunCounters;
  readonly pagesFetched: number;
  readonly truncated: boolean;
}
