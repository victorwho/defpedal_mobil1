/**
 * loop-generator-remote — the same search, done by the server.
 *
 * Signature-compatible with `searchLoops` in `loop-generator.ts` on purpose:
 * `/loop-planner` picks one or the other and everything downstream — the map,
 * the result list, the ride hand-off — is unchanged. When the rollout finishes,
 * the client generator is deleted and this stays.
 *
 * ## What it moves
 *
 * The app used to make up to sixty OSRM requests and fifteen enrichment calls
 * per search. Measured on a 15 km Bucharest ring, one OSRM response is about
 * 165 KB, so a single search pulled megabytes over mobile data to show five
 * rows. Now it makes one request.
 *
 * ## Why it still streams
 *
 * The planner draws each loop onto the map as it is found, under a live
 * counter. That is the whole texture of the wait, so the response is
 * newline-delimited JSON and this reads it as it arrives rather than waiting
 * for the end.
 *
 * ## Two things that are deliberately NOT like the client path
 *
 * It THROWS on failure instead of returning `empty`. The two are completely
 * different to a rider — "there are no loops here" is an answer, "we could not
 * reach the server" is a fault — and the client generator conflates them
 * because every failure there is one dead bearing out of many. Silently
 * degrading to the on-device path would also hide exactly the failures this
 * rollout exists to observe.
 *
 * And it localises the turn instructions here. OSRM ships none, and the phrase
 * catalogue lives in this app's i18n layer, so the server sends an English
 * fallback and the rider-visible string is rebuilt below. Rendering what the
 * server sent would put English turn cues in front of every Romanian and
 * Spanish rider.
 */
import type {
  GeneratedLoop,
  LoopSearchOutcome,
  LoopSearchRequest,
  LoopStreamFrame,
  NavigationStep,
  RouteOption,
  Step,
} from '@defensivepedal/core';

import { mobileEnv } from './env';
import { hasExpoNativeModule } from './expoNativeModule';
import { buildManeuverInstruction } from './maneuverInstructions';
import { getAccessToken } from './supabase';
import type { Locale } from '../i18n';
import { SUPPORTED_LOCALES } from '../i18n';

/** Same callbacks the on-device generator takes, so the screen does not care. */
export interface RemoteLoopSearchCallbacks {
  readonly onCandidate?: (loop: GeneratedLoop) => void;
  readonly onProgress?: (resolved: number, attempted: number) => void;
  readonly signal?: AbortSignal;
}

/**
 * A failure the rider should be told about, as opposed to an empty result.
 *
 * Carries `reason` so the screen can distinguish "you are offline" from "the
 * server said no" without parsing a message string.
 */
export class LoopSearchRequestError extends Error {
  readonly reason: 'offline' | 'rejected' | 'truncated' | 'server';
  readonly status?: number;

  constructor(
    reason: LoopSearchRequestError['reason'],
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = 'LoopSearchRequestError';
    this.reason = reason;
    this.status = status;
  }
}

/**
 * Rebuild the rider-visible instruction for one step.
 *
 * `buildManeuverInstruction` wants an OSRM step; a `NavigationStep` carries the
 * same two fields it reads, so this adapts rather than duplicating the phrase
 * table. Steps that already carry a localised instruction are left alone, which
 * keeps this safe if the server ever starts sending one.
 */
const localiseStep = (step: NavigationStep, locale: Locale): NavigationStep => ({
  ...step,
  instruction: buildManeuverInstruction(
    { maneuver: step.maneuver, name: step.streetName } as Step,
    locale,
  ),
});

const localiseRoute = (route: RouteOption, locale: Locale): RouteOption => ({
  ...route,
  steps: route.steps.map((step) => localiseStep(step, locale)),
});

const localiseLoop = (loop: GeneratedLoop, locale: Locale): GeneratedLoop => ({
  ...loop,
  route: localiseRoute(loop.route, locale),
});

const resolveLocale = (raw: string): Locale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(raw) ? (raw as Locale) : 'en';

/**
 * A fetch that can hand back a readable body.
 *
 * React Native's own `fetch` always resolves `response.body` to null, so a
 * stream has to come from `expo/fetch`. That module resolves its native module
 * at import time and throws uncatchably on Android when it is absent, so it is
 * required lazily behind a presence probe — the exact shape error-log #21b and
 * #2b are about. When it is missing the caller falls back to reading the whole
 * body at once, which costs the progressive draw and nothing else.
 */
const streamingFetch = ():
  | ((url: string, init: RequestInit) => Promise<Response>)
  | null => {
  if (!hasExpoNativeModule('ExpoFetchModule')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo/fetch') as {
      fetch?: (url: string, init: RequestInit) => Promise<Response>;
    };
    return typeof mod.fetch === 'function' ? mod.fetch : null;
  } catch {
    return null;
  }
};

interface StreamHandlers {
  readonly onFrame: (frame: LoopStreamFrame) => void;
}

/**
 * Split a growing buffer into whole lines, keeping any partial tail.
 *
 * A chunk boundary lands mid-line often enough that this is not an edge case,
 * and a partial line handed to `JSON.parse` throws in the middle of a search
 * that is otherwise fine.
 */
const createLineReader = ({ onFrame }: StreamHandlers) => {
  let buffer = '';
  const consume = (text: string) => {
    buffer += text;
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.length > 0) onFrame(JSON.parse(line) as LoopStreamFrame);
      newline = buffer.indexOf('\n');
    }
  };
  const finish = () => {
    const line = buffer.trim();
    buffer = '';
    if (line.length > 0) onFrame(JSON.parse(line) as LoopStreamFrame);
  };
  return { consume, finish };
};

const buildBody = (request: LoopSearchRequest) => ({
  start: { lat: request.start.lat, lon: request.start.lon },
  targetDistanceMeters: request.targetDistanceMeters,
  terrain: request.terrain,
  surface: request.surface,
  heading: request.heading,
  locale: request.locale,
});

/**
 * Run one loop search on the server.
 *
 * Resolves with the same outcome shape the on-device generator produces, or
 * throws `LoopSearchRequestError`. A cancelled search resolves `cancelled`
 * rather than throwing, because the rider asking to stop is not a fault.
 */
export const searchLoopsRemote = async (
  request: LoopSearchRequest,
  callbacks: RemoteLoopSearchCallbacks = {},
): Promise<LoopSearchOutcome> => {
  const { onCandidate, onProgress, signal } = callbacks;
  const locale = resolveLocale(request.locale);

  if (!mobileEnv.mobileApiUrl) {
    throw new LoopSearchRequestError('offline', 'No API URL configured.');
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/x-ndjson',
  };
  const token = await getAccessToken();
  if (token) headers.authorization = `Bearer ${token}`;

  const url = `${mobileEnv.mobileApiUrl}/v1/loops`;
  const init: RequestInit = {
    method: 'POST',
    headers,
    body: JSON.stringify(buildBody(request)),
    signal,
  };

  let outcome: LoopSearchOutcome | null = null;
  let streamError: string | null = null;

  const handleFrame = (frame: LoopStreamFrame) => {
    switch (frame.type) {
      case 'candidate':
        onCandidate?.(localiseLoop(frame.loop, locale));
        break;
      case 'progress':
        onProgress?.(frame.resolved, frame.attempted);
        break;
      case 'result':
        outcome = {
          status: 'ok',
          loops: frame.loops.map((loop) => localiseLoop(loop, locale)),
          relaxation: frame.relaxation,
          checked: frame.checked,
        };
        break;
      case 'empty':
        outcome = { status: 'empty' };
        break;
      case 'error':
        streamError = frame.message;
        break;
    }
  };

  const reader = createLineReader({ onFrame: handleFrame });
  const doFetch = streamingFetch() ?? fetch;

  let response: Response;
  try {
    response = await doFetch(url, init);
  } catch (error) {
    if (signal?.aborted) return { status: 'cancelled' };
    throw new LoopSearchRequestError(
      'offline',
      error instanceof Error ? error.message : 'Could not reach the server.',
    );
  }

  if (!response.ok) {
    // Everything checkable happens before the stream opens, so a status here
    // is a real refusal — auth, validation, the rate limit, coverage — and it
    // is worth surfacing rather than retrying.
    let detail = '';
    try {
      detail = JSON.stringify(await response.json());
    } catch {
      detail = `HTTP ${response.status}`;
    }
    throw new LoopSearchRequestError(
      'rejected',
      `Loop search refused (${response.status}): ${detail}`,
      response.status,
    );
  }

  try {
    const body = response.body as ReadableStream<Uint8Array> | null;
    if (body) {
      const decoder = new TextDecoder();
      const streamReader = body.getReader();
      for (;;) {
        const { done, value } = await streamReader.read();
        if (done) break;
        reader.consume(decoder.decode(value, { stream: true }));
        // Frames already delivered stay delivered; the rider keeps whatever
        // drew before they cancelled.
        if (signal?.aborted) return { status: 'cancelled' };
      }
    } else {
      // No readable body on this runtime. The search still works; it simply
      // arrives all at once, so the map fills in one step instead of five.
      reader.consume(await response.text());
    }
    reader.finish();
  } catch (error) {
    if (signal?.aborted) return { status: 'cancelled' };
    throw new LoopSearchRequestError(
      'truncated',
      error instanceof Error ? error.message : 'The loop stream broke.',
    );
  }

  if (streamError) {
    throw new LoopSearchRequestError('server', streamError);
  }

  if (!outcome) {
    // The stream ended without a terminal frame. That is a truncated response,
    // not an empty result, and the two are indistinguishable unless we insist
    // on the frame — which is why the server always writes one.
    if (signal?.aborted) return { status: 'cancelled' };
    throw new LoopSearchRequestError(
      'truncated',
      'The loop search ended without a result.',
    );
  }

  return outcome;
};
