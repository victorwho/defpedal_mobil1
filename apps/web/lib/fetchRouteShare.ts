import { routeSharePublicViewSchema, type RouteSharePublicView } from './routeShareTypes';

export type FetchRouteShareResult =
  | { status: 'ok'; data: RouteSharePublicView }
  | { status: 'not_found' }
  | { status: 'gone' }
  | { status: 'error'; message: string };

const API_BASE = process.env.NEXT_PUBLIC_MOBILE_API_URL;

export async function fetchRouteShare(code: string): Promise<FetchRouteShareResult> {
  if (!API_BASE) {
    return { status: 'error', message: 'NEXT_PUBLIC_MOBILE_API_URL is not configured' };
  }

  const url = `${API_BASE.replace(/\/$/, '')}/v1/route-shares/public/${encodeURIComponent(code)}`;

  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch (error: unknown) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Network error fetching share',
    };
  }

  if (response.status === 404) return { status: 'not_found' };
  if (response.status === 410) return { status: 'gone' };
  // A 400 here means the API rejected the code shape (share-code regex
  // mismatch). That happens when a user pastes a link with garbage after
  // the code — e.g. a trailing period from a sentence-wrapped paste. The
  // right UX is the "not found" card, not the scary error boundary;
  // treat 400 as not_found rather than throwing.
  if (response.status === 400) return { status: 'not_found' };

  if (!response.ok) {
    return { status: 'error', message: `Upstream HTTP ${response.status}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: 'error', message: 'Upstream returned non-JSON body' };
  }

  const parsed = routeSharePublicViewSchema.safeParse(body);
  if (!parsed.success) {
    return { status: 'error', message: `Invalid share payload: ${parsed.error.message}` };
  }
  return { status: 'ok', data: parsed.data };
}
