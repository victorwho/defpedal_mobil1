/**
 * POST /v1/imports/run — Cloud Scheduler only (weekly).
 *
 * Runs the hazard import pipeline across every enabled source in
 * `hazard_import_sources`. See docs/plans/hazard-import-pipeline.md.
 *
 * Failure policy: this endpoint THROWS on a source-level failure so the
 * existing GCP "Cloud Scheduler job failed" alert policy (10278737109769293908,
 * which covers all jobs) fires. The dangerous failure mode here is not a
 * crash — it is a run that reports success while importing nothing because a
 * source silently changed shape, so "0 items twice running" is escalated to a
 * failure inside runSource().
 */
import type { ErrorResponse } from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import { config } from '../config';
import { verifyCronAuth } from '../lib/cronAuth';
import type { MobileApiDependencies } from '../lib/dependencies';
import { errorResponseSchema } from '../lib/feedSchemas';
import { HttpError } from '../lib/http';
import { estimateCostUsd, isLlmConfigured } from '../lib/imports/classify';
import { loadEnabledSources, runSource } from '../lib/imports/run';
import type { ImportSourceRunResult } from '../lib/imports/types';
import { ensureSupabase } from './feed-helpers';

interface ImportRunReply {
  runAt: string;
  llmConfigured: boolean;
  durationMs: number;
  /** Measured token spend across every source in this run. */
  tokenUsage: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    /** Derived from config price list — see estimateCostUsd(). */
    estimatedCostUsd: number;
    usdPer1mInput: number;
    usdPer1mOutput: number;
  };
  sources: {
    sourceId: string;
    ok: boolean;
    error: string | null;
    pagesFetched: number;
    truncated: boolean;
    counters: Record<string, number>;
  }[];
}

const runResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sourceId', 'ok', 'error', 'pagesFetched', 'truncated', 'counters'],
  properties: {
    sourceId: { type: 'string' },
    ok: { type: 'boolean' },
    error: { type: ['string', 'null'] },
    pagesFetched: { type: 'integer' },
    truncated: { type: 'boolean' },
    // Counters are declared as a free-form integer map on purpose: Fastify
    // strips undeclared properties (Gotcha #9), and adding a new drop-reason
    // counter should not require a schema edit to become visible in the logs.
    counters: {
      type: 'object',
      additionalProperties: { type: 'integer' },
    },
  },
} as const;

const buildTokenUsage = (
  promptTokens: number,
  completionTokens: number,
): ImportRunReply['tokenUsage'] => ({
  model: config.imports.openaiModel,
  promptTokens,
  completionTokens,
  // Rounded to micro-dollars: at ~$0.00014/call, cents would round everything
  // to zero and make the figure useless.
  estimatedCostUsd: Number(estimateCostUsd(promptTokens, completionTokens).toFixed(6)),
  usdPer1mInput: config.imports.usdPer1mInputTokens,
  usdPer1mOutput: config.imports.usdPer1mOutputTokens,
});

export const buildImportRoutes = (
  _dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {
    app.post<{
      Querystring: { sourceId?: string };
      Reply: ImportRunReply | ErrorResponse;
    }>(
      '/imports/run',
      {
        schema: {
          querystring: {
            type: 'object',
            additionalProperties: false,
            properties: {
              // Manual single-source run, for backfilling a newly enabled
              // source without waiting for the weekly tick.
              sourceId: { type: 'string', maxLength: 64 },
            },
          },
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['runAt', 'llmConfigured', 'durationMs', 'tokenUsage', 'sources'],
              properties: {
                runAt: { type: 'string', format: 'date-time' },
                llmConfigured: { type: 'boolean' },
                durationMs: { type: 'integer' },
                tokenUsage: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'model', 'promptTokens', 'completionTokens',
                    'estimatedCostUsd', 'usdPer1mInput', 'usdPer1mOutput',
                  ],
                  properties: {
                    model: { type: 'string' },
                    promptTokens: { type: 'integer' },
                    completionTokens: { type: 'integer' },
                    estimatedCostUsd: { type: 'number' },
                    usdPer1mInput: { type: 'number' },
                    usdPer1mOutput: { type: 'number' },
                  },
                },
                sources: { type: 'array', items: runResultSchema },
              },
            },
            401: errorResponseSchema,
            500: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        verifyCronAuth(request);
        const db = ensureSupabase();

        const startedAt = Date.now();
        const deadline = startedAt + config.imports.runBudgetMs;
        const controller = new AbortController();

        let sources;
        try {
          sources = await loadEnabledSources(db, request.query.sourceId);
        } catch (error) {
          throw new HttpError('Failed to load import sources.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error instanceof Error ? error.message : 'unknown'],
          });
        }

        if (sources.length === 0) {
          request.log.warn(
            { event: 'hazard_import_no_sources', requested: request.query.sourceId ?? null },
            'no enabled import sources',
          );
          return {
            runAt: new Date().toISOString(),
            llmConfigured: isLlmConfigured(),
            durationMs: Date.now() - startedAt,
            tokenUsage: buildTokenUsage(0, 0),
            sources: [],
          };
        }

        if (!isLlmConfigured()) {
          // Not fatal — deterministic mapping still publishes the bulk — but
          // it must be visible, because the symptom (ambiguous categories
          // quietly piling up in the review queue) is otherwise silent.
          request.log.warn(
            { event: 'hazard_import_llm_unconfigured' },
            'OPENAI_API_KEY not set: free-text classification disabled, ambiguous items go to review',
          );
        }

        const results: ImportSourceRunResult[] = [];
        for (const source of sources) {
          const result = await runSource(db, source, request.log, {
            deadline,
            signal: controller.signal,
          });
          results.push(result);

          request.log.info(
            {
              event: 'hazard_import_source_complete',
              sourceId: result.sourceId,
              ok: result.ok,
              error: result.error,
              pagesFetched: result.pagesFetched,
              truncated: result.truncated,
              ...result.counters,
            },
            'hazard import source complete',
          );
        }

        const promptTokens = results.reduce((sum, r) => sum + r.counters.llmPromptTokens, 0);
        const completionTokens = results.reduce(
          (sum, r) => sum + r.counters.llmCompletionTokens,
          0,
        );
        const tokenUsage = buildTokenUsage(promptTokens, completionTokens);

        // Spend is logged as its own event so it can be charted independently
        // of the per-source counters, and carries the model + price list that
        // produced the estimate so a stale figure is traceable.
        request.log.info(
          { event: 'hazard_import_token_usage', ...tokenUsage, calls: results.reduce((s2, r) => s2 + r.counters.llmCalled, 0) },
          'hazard import model spend',
        );

        const payload: ImportRunReply = {
          runAt: new Date().toISOString(),
          llmConfigured: isLlmConfigured(),
          durationMs: Date.now() - startedAt,
          tokenUsage,
          sources: results.map((result) => ({
            sourceId: result.sourceId,
            ok: result.ok,
            error: result.error,
            pagesFetched: result.pagesFetched,
            truncated: result.truncated,
            counters: { ...result.counters },
          })),
        };

        const failed = results.filter((result) => !result.ok);
        if (failed.length > 0) {
          // Throw so Cloud Scheduler records a failed attempt and the existing
          // GCP alert policy fires. The per-source detail is already in the
          // structured logs above.
          request.log.error(
            { event: 'hazard_import_run_failed', failed: failed.map((f) => f.sourceId) },
            'hazard import run had source failures',
          );
          throw new HttpError('Hazard import run had source failures.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: failed.map((f) => `${f.sourceId}: ${f.error ?? 'unknown'}`),
          });
        }

        if (results.some((result) => result.truncated)) {
          // Not an error: the cursor is persisted, so the next run resumes.
          // Logged loudly anyway — a permanently truncated run means the
          // weekly cadence is no longer keeping up with the source.
          request.log.warn(
            {
              event: 'hazard_import_truncated',
              sources: results.filter((r) => r.truncated).map((r) => r.sourceId),
            },
            'import run hit its budget; cursor persisted, next run resumes',
          );
        }

        return payload;
      },
    );
  };

  return routes;
};
