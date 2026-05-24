import type { ZodType } from 'zod';

import { telemetry } from '../telemetry';

/**
 * Runs `schema.safeParse(data)` purely for observability of API response
 * shape drift. **Always passes the input through unchanged** — a parse
 * failure logs to Sentry/PostHog but does NOT throw, so a server-side
 * shape change can't break the user's screen.
 *
 * The intent is to catch "field missing", "field renamed", or "wrong
 * top-level type" — the class of bug that would explode a list render or
 * destructure. Deep field-by-field validation is intentionally out of
 * scope here; keep the schemas to the response envelope.
 *
 * Phase 3c of the error-reduction plan. If we observe non-trivial drift
 * signal in Sentry from this, that's the green light to harden specific
 * fields later — for now, observability without behavior change.
 *
 * @param schema  Zod schema to run against `data`.
 * @param data    The decoded response body.
 * @param endpoint Logical endpoint name (used as a Sentry tag).
 * @returns       `data` cast to `T`, unchanged.
 */
export const validateResponse = <T>(
  schema: ZodType<unknown>,
  data: unknown,
  endpoint: string,
): T => {
  const result = schema.safeParse(data);

  if (!result.success) {
    // Cap the issues payload — a deeply malformed response could produce
    // hundreds of zod issues, blowing up the telemetry event size.
    const issues = result.error.issues.slice(0, 5).map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code,
      message: issue.message,
    }));

    telemetry.captureError(
      new Error(`API response shape mismatch: ${endpoint}`),
      {
        feature: 'api_response_validation',
        endpoint,
        issue_count: result.error.issues.length,
        issues: JSON.stringify(issues),
      },
    );
  }

  return data as T;
};
