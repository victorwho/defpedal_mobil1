/**
 * Classification: deterministic first, LLM only for the ambiguous residue.
 *
 * The service_code mapping table does the bulk of the work — it is free,
 * auditable, deterministic, and reviewed once in code review. The model is
 * asked only to do the thing a lookup table genuinely cannot: read
 * multilingual free text to (a) reject off-topic items inside a plausible
 * category, (b) catch cycling hazards hiding in a generic bucket, and
 * (c) write a short neutral English summary for the hazard sheet.
 *
 * Hard rules, enforced here rather than trusted to the prompt:
 *   - The model NEVER supplies coordinates. Coordinates come only from the
 *     source. There is no code path by which a model output reaches lat/lon.
 *   - The model NEVER chooses expiry.
 *   - Its hazard_type is validated against the live CHECK list; anything else
 *     is downgraded to human review rather than published.
 *   - Any model error routes to review. Never dropped, never auto-published.
 */
import { config } from '../../config';
import { resolveAmsterdamMapping } from './mappings/amsterdam';
import { resolveKolnMapping } from './mappings/koln';
import {
  isImportableHazardType,
  type ClassificationResult,
  type ImportSourceRow,
  type LlmUsage,
  type LlmVerdict,
  type MappingOutcome,
  type RawReport,
} from './types';

/** A model call's verdict plus its measured token usage. */
export type LlmCallResult = LlmVerdict & { readonly usage?: LlmUsage | null };

/**
 * Turn measured tokens into a USD figure.
 *
 * The tokens are measured; this number is an ESTIMATE derived from a price
 * list in config that goes stale silently. Every log line carries the model
 * and the rates used alongside the result so a suspicious figure can always
 * be traced back to its inputs.
 */
export const estimateCostUsd = (promptTokens: number, completionTokens: number): number =>
  (promptTokens / 1_000_000) * config.imports.usdPer1mInputTokens +
  (completionTokens / 1_000_000) * config.imports.usdPer1mOutputTokens;

const SUMMARY_MAX = 280;

/** Per-source deterministic category map. */
export const resolveMapping = (
  source: ImportSourceRow,
  report: RawReport,
): MappingOutcome => {
  switch (source.id) {
    case 'open311:koln':
      return resolveKolnMapping(report.categoryKey);
    case 'signalen:amsterdam': {
      // categoryKey is "parentSlug/childSlug"; the parent lets an unmapped
      // child under a wholly non-cycling branch be dropped without a human.
      const [parentSlug, childSlug] = report.categoryKey.includes('/')
        ? report.categoryKey.split('/')
        : [null, report.categoryKey];
      return resolveAmsterdamMapping(childSlug, parentSlug);
    }
    default:
      // An Open311 city we have not written a map for yet: let the model read
      // everything rather than silently importing nothing or everything.
      return { kind: 'llm' };
  }
};

/**
 * Trim to the DB's 280-char CHECK, on a word boundary where possible.
 * The server-side guard exists because a model that overruns by two
 * characters should not turn into a 502 from the insert path.
 */
export const clampSummary = (value: string): string => {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= SUMMARY_MAX) return trimmed;
  const cut = trimmed.slice(0, SUMMARY_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > SUMMARY_MAX - 40 ? cut.slice(0, lastSpace) : cut).trimEnd();
};

/**
 * Last-resort summary, used only when neither the mapping table nor the model
 * supplied one (i.e. a model returned a valid type but an empty summary).
 *
 * Strips the source's report-number prefix and de-duplicates the category,
 * because Cologne emits `title` as `#<id> <service_name>` — so the naive
 * `category + title` join yields "Kfz-Ampel defekt — #19078-2026 Kfz-Ampel
 * defekt". Rider-facing text must never carry the source's ticket number.
 */
export const fallbackSummary = (report: RawReport): string => {
  const category = report.categoryLabel?.trim() ?? '';
  const rawTitle = report.title?.trim() ?? '';
  // Drop a leading "#12345-2026 " ticket reference.
  const title = rawTitle.replace(/^#\S+\s*/, '').trim();

  const parts: string[] = [];
  if (category) parts.push(category);
  // Only add the title when it says something the category does not.
  if (title && title.toLowerCase() !== category.toLowerCase()) parts.push(title);

  return clampSummary(parts.length > 0 ? parts.join(' — ') : 'Reported issue');
};

export const isLlmConfigured = (): boolean => Boolean(config.imports.openaiApiKey);

// ---------------------------------------------------------------------------
// Model call
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  'You classify municipal civic-issue reports for a cycling-safety app.',
  'The app shows hazards to people riding bicycles on city streets.',
  '',
  'Decide whether the report describes something that affects the safety of a',
  'person CYCLING PAST the location. Litter, graffiti, abandoned bikes, broken',
  'street lights, ticket machines, playground and park issues, and complaints',
  'about signal timing convenience are NOT cycling hazards.',
  '',
  'If relevant, pick the single best hazard_type from the allowed list and',
  'write summary_en: a neutral English sentence, at most 280 characters,',
  'describing what a rider will encounter. Do not include addresses, report',
  'numbers, reporter names, or the name of the source system.',
  '',
  'Never invent coordinates. Never guess a location. If the text does not make',
  'the hazard clear, set relevant=false or give a low confidence.',
].join('\n');

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['relevant', 'hazard_type', 'confidence', 'summary_en', 'reason'],
  properties: {
    relevant: { type: 'boolean' },
    hazard_type: {
      type: ['string', 'null'],
      enum: [
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
        null,
      ],
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    summary_en: { type: 'string', maxLength: SUMMARY_MAX },
    reason: { type: 'string', maxLength: 200 },
  },
} as const;

const buildUserPrompt = (report: RawReport): string =>
  [
    `Category: ${report.categoryLabel || '(none)'}`,
    `Title: ${report.title ?? '(none)'}`,
    `Description: ${report.description ?? '(none)'}`,
    // Address is included as disambiguating context only ("on the cycle path
    // by X"). It must never be echoed into summary_en — see SYSTEM_PROMPT.
    `Address context: ${report.address ?? '(none)'}`,
  ].join('\n');

export const callLlm = async (
  report: RawReport,
  signal: AbortSignal,
): Promise<LlmCallResult> => {
  const response = await fetch(`${config.imports.openaiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.imports.openaiApiKey}`,
      'content-type': 'application/json',
    },
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    body: JSON.stringify({
      model: config.imports.openaiModel,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(report) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'hazard_classification',
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenAI HTTP ${response.status}: ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no content');

  const promptTokens = payload.usage?.prompt_tokens;
  const completionTokens = payload.usage?.completion_tokens;
  const usage: LlmUsage | null =
    typeof promptTokens === 'number' && typeof completionTokens === 'number'
      ? { promptTokens, completionTokens }
      : null; // provider omitted usage — report nothing rather than guess

  const parsed = JSON.parse(content) as LlmVerdict;
  return {
    relevant: Boolean(parsed.relevant),
    hazard_type: typeof parsed.hazard_type === 'string' ? parsed.hazard_type : null,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    summary_en: typeof parsed.summary_en === 'string' ? parsed.summary_en : '',
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    usage,
  };
};

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface ClassifyDeps {
  /**
   * `usage` is optional so a test double can return a bare verdict; a missing
   * block simply means "no measured tokens for this call".
   */
  readonly llm?: (report: RawReport, signal: AbortSignal) => Promise<LlmCallResult>;
}

export const classifyReport = async (
  source: ImportSourceRow,
  report: RawReport,
  signal: AbortSignal,
  deps: ClassifyDeps = {},
): Promise<ClassificationResult> => {
  const mapping = resolveMapping(source, report);

  if (mapping.kind === 'irrelevant') {
    return {
      reviewState: 'irrelevant',
      hazardType: null,
      summaryEn: null,
      verdict: null,
      rejectReason: 'category_mapped_irrelevant',
      modelInvoked: false,
      usage: null,
    };
  }

  if (mapping.kind === 'review') {
    // No free text exists for this source, so the model cannot help. A human
    // decides, then extends the mapping table.
    return {
      reviewState: 'pending',
      hazardType: null,
      summaryEn: null,
      verdict: null,
      rejectReason: mapping.reason,
      modelInvoked: false,
      usage: null,
    };
  }

  if (mapping.kind === 'type') {
    // Deterministic hit — the bulk of Cologne. No model call at all.
    return {
      reviewState: 'auto_approved',
      hazardType: mapping.hazardType,
      // The reviewed English phrase from the mapping table — never derived
      // from the source's own fields. Cologne's `title` is `#<id> <category>`,
      // which produced German, self-duplicating descriptions leaking the
      // city's report number into the rider-facing sheet.
      summaryEn: clampSummary(mapping.summaryEn),
      verdict: null,
      rejectReason: null,
      modelInvoked: false,
      usage: null,
    };
  }

  // mapping.kind === 'llm'
  const llm = deps.llm ?? (isLlmConfigured() ? callLlm : null);
  if (!llm) {
    // No key configured: degrade to review rather than guessing. The import
    // is preserved, just unpublished, so nothing is lost when a key arrives.
    return {
      reviewState: 'pending',
      hazardType: null,
      summaryEn: null,
      verdict: null,
      rejectReason: 'llm_unconfigured',
      modelInvoked: false,
      usage: null,
    };
  }

  let verdict: LlmCallResult;
  try {
    verdict = await llm(report, signal);
  } catch (error) {
    return {
      reviewState: 'pending',
      hazardType: null,
      summaryEn: null,
      verdict: null,
      rejectReason: `llm_error: ${error instanceof Error ? error.message : 'unknown'}`.slice(0, 200),
      modelInvoked: true,
      // A failed call returns no usage block. Tokens may still have been
      // billed; we report null rather than invent a number.
      usage: null,
    };
  }

  if (!verdict.relevant) {
    return {
      reviewState: 'irrelevant',
      hazardType: null,
      summaryEn: null,
      verdict,
      rejectReason: 'llm_not_relevant',
      modelInvoked: true,
      usage: verdict.usage ?? null,
    };
  }

  // Validate against the LIVE CHECK list. A model naming `construction` (a
  // plausible-looking value that the DB rejects with a 400) must not reach
  // the insert path.
  if (!isImportableHazardType(verdict.hazard_type)) {
    return {
      reviewState: 'pending',
      hazardType: null,
      summaryEn: verdict.summary_en ? clampSummary(verdict.summary_en) : null,
      verdict,
      rejectReason: `llm_invalid_type: ${String(verdict.hazard_type).slice(0, 60)}`,
      modelInvoked: true,
      usage: verdict.usage ?? null,
    };
  }

  const summary = verdict.summary_en?.trim()
    ? clampSummary(verdict.summary_en)
    : fallbackSummary(report);

  if (verdict.confidence < config.imports.confidenceThreshold) {
    return {
      reviewState: 'pending',
      hazardType: verdict.hazard_type,
      summaryEn: summary,
      verdict,
      rejectReason: 'llm_low_confidence',
      modelInvoked: true,
      usage: verdict.usage ?? null,
    };
  }

  return {
    reviewState: 'auto_approved',
    hazardType: verdict.hazard_type,
    summaryEn: summary,
    verdict,
    rejectReason: null,
    modelInvoked: true,
    usage: verdict.usage ?? null,
  };
};
