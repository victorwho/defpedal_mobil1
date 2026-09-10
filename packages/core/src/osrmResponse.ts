/**
 * Reading an OSRM answer, in the one order that works.
 *
 * ## The bug this exists to make impossible
 *
 * OSRM reports "nothing connects these points under the constraints you gave"
 * as **HTTP 400** with `{"code":"NoRoute"}` in the body. Every fetcher in this
 * codebase was written status-first:
 *
 *     if (!response.ok) throw ...            // <- 400 lands here
 *     const data = await response.json();
 *     if (avoidUnpaved && isNoRoute(data.code)) { retry without it }   // dead
 *
 * So the retry that exists precisely for that case was unreachable, in three
 * separate fetchers, for the whole life of each. On a loop the candidate was
 * dropped in silence and the rider was told no loops exist here rather than
 * that their surface constraint removed them. On a point-to-point route it was
 * worse: the throw propagates and the whole route preview fails.
 *
 * Measured against the live router on 2026-09-10: 78 of 216 paved-only rings
 * across twelve start points answered NoRoute, and two of those start points
 * answered NoRoute for every single ring — a rider standing there got nothing
 * at all. On point-to-point routes, every pair touching one particular
 * Bucharest coordinate failed while every pair without it succeeded, which is
 * what a start snapped to an unpaved edge looks like.
 *
 * ## The rule
 *
 * Read the body FIRST, then decide. A status alone cannot tell "there is no
 * paved way through here", which is a normal answer with a defined response,
 * apart from "your request was malformed", which is not. Both are 400.
 *
 * Codes seen from the live router at 400, all distinguishable and all needing
 * different treatment: `NoRoute`, `InvalidValue` (an exclude class the profile
 * does not define), `InvalidQuery` (malformed coordinates), `InvalidOptions`
 * (fewer than two coordinates).
 */

/** The part of a fetch Response this needs. Structural, so tests need no DOM. */
export interface OsrmHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

interface OsrmBody {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly routes?: unknown;
}

/**
 * OSRM's answer when no route exists under the constraints given.
 *
 * `NoSegment` joins `NoRoute` because it means the same thing to a caller: one
 * of the coordinates could not be snapped to a usable road, which under
 * `exclude=unpaved` is exactly the "nothing paved here" case.
 */
export const isOsrmNoRouteCode = (code: unknown): boolean =>
  code === 'NoRoute' || code === 'NoSegment';

export type OsrmAnswer<T> =
  /** A usable route response. */
  | { readonly outcome: 'ok'; readonly data: T }
  /**
   * No route exists under these constraints. NOT an error: it is the trigger
   * for dropping a constraint and asking again, and the caller that has a
   * fallback must be able to reach it.
   */
  | { readonly outcome: 'no_route'; readonly code: string }
  /**
   * The router answered successfully and returned nothing.
   *
   * Separate from `failed` so the caller can say "no routes" rather than
   * quoting an HTTP status that was 200 — the request worked, the answer was
   * empty. Not folded into `no_route` either, because that one is a licence to
   * drop a constraint and ask again, and this is not.
   */
  | { readonly outcome: 'empty'; readonly code: string }
  /** Anything else. `code` is null when the body was not OSRM JSON at all. */
  | {
      readonly outcome: 'failed';
      readonly status: number;
      readonly code: string | null;
      readonly detail: string;
    };

/** How much of an unparseable body to quote back in an error message. */
const MAX_DETAIL_CHARS = 200;

/**
 * Classify one OSRM response.
 *
 * The body is read exactly once, as text, and parsed here. That is also why
 * the old shape could not simply be reordered: it called `response.json()` on
 * the success path and `response.text()` on the error path, and a body can
 * only be consumed once.
 *
 * A body that is not JSON at all — a proxy error page, an empty 502 — is a
 * `failed` with a null code and the first part of the text, which is what
 * makes an infrastructure failure diagnosable rather than a mystery.
 */
export const readOsrmResponse = async <T>(
  response: OsrmHttpResponse,
): Promise<OsrmAnswer<T>> => {
  const text = await response.text().catch(() => '');

  let body: OsrmBody | null = null;
  try {
    body = text ? (JSON.parse(text) as OsrmBody) : null;
  } catch {
    body = null;
  }

  const code = typeof body?.code === 'string' ? body.code : null;
  const routes = Array.isArray(body?.routes) ? body.routes : [];

  if (response.ok && code === 'Ok') {
    return routes.length > 0
      ? { outcome: 'ok', data: body as unknown as T }
      : { outcome: 'empty', code };
  }

  // Checked BEFORE the status, which is the whole point of this module.
  if (isOsrmNoRouteCode(code)) {
    return { outcome: 'no_route', code: code as string };
  }

  const message = typeof body?.message === 'string' ? body.message : '';
  return {
    outcome: 'failed',
    status: response.status,
    code,
    detail: message || text.slice(0, MAX_DETAIL_CHARS) || `HTTP ${response.status}`,
  };
};

/** A one-line description of a failure, for an error message. */
export const describeOsrmFailure = (
  answer: Extract<OsrmAnswer<unknown>, { outcome: 'failed' }>,
): string =>
  `HTTP ${answer.status}${answer.code ? ` ${answer.code}` : ''}: ${answer.detail}`;
