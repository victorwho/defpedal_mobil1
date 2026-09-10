/**
 * Reading the loop stream on the handset.
 *
 * Three things here are worth more than the rest:
 *
 *   - a chunk boundary that lands mid-line must not break a search. It happens
 *     constantly on a real connection and produces a `JSON.parse` throw in the
 *     middle of an otherwise fine result;
 *   - a stream that ENDS without a terminal frame is a fault, not an empty
 *     result. They are indistinguishable unless the reader insists;
 *   - a failure must never quietly become the on-device path. That would make
 *     a broken rollout look healthy, which is the one outcome the flag exists
 *     to prevent.
 */
import type { GeneratedLoop, LoopStreamFrame } from '@defensivepedal/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./env', () => ({
  mobileEnv: { mobileApiUrl: 'https://api.test.local' },
}));
vi.mock('./supabase', () => ({
  getAccessToken: vi.fn().mockResolvedValue('rider-token'),
}));
// No native fetch module in a node test, so the reader takes its buffered
// path unless a test hands back a body. Both paths are exercised below.
vi.mock('./expoNativeModule', () => ({
  hasExpoNativeModule: vi.fn().mockReturnValue(false),
}));

import {
  LoopSearchRequestError,
  searchLoopsRemote,
} from './loop-generator-remote';

const request = {
  start: { lat: 44.4268, lon: 26.1025 },
  targetDistanceMeters: 15000,
  terrain: 'rolling' as const,
  surface: 'any' as const,
  heading: 'any' as const,
  locale: 'en',
};

const loop = (id: string, overrides: Partial<GeneratedLoop> = {}) =>
  ({
    id,
    route: {
      id,
      source: 'generated_loop',
      routingEngineVersion: 'safe-osrm-v1',
      routingProfileVersion: 'safety-profile-v1',
      mapDataVersion: 'osm-current',
      riskModelVersion: 'risk-model-v1',
      geometryPolyline6: 'abc',
      distanceMeters: 15100,
      durationSeconds: 3600,
      adjustedDurationSeconds: 3700,
      totalClimbMeters: 120,
      steps: [
        {
          id: 'step-0',
          instruction: 'Turn left onto Strada Lipscani',
          streetName: 'Strada Lipscani',
          distanceMeters: 120,
          durationSeconds: 30,
          maneuver: { type: 'turn', modifier: 'left', location: [26.1, 44.42] },
          geometry: { type: 'LineString', coordinates: [] },
          mode: 'cycling',
        },
      ],
      riskSegments: [],
      routeFeatures: [],
      warnings: [],
    },
    coordinates: [
      [26.1, 44.42],
      [26.11, 44.43],
    ],
    bearingDegrees: 90,
    distanceMeters: 15100,
    climbMeters: 120,
    highRiskMeters: 0,
    unpavedShare: 0.1,
    retracedShare: 0.05,
    ringRetracedShare: 0.05,
    spurShare: 0,
    pavedFallback: false,
    stemMeters: 0,
    scenicScore: 0,
    relaxation: 'none',
    terrain: 'rolling',
    measured: true,
    ...overrides,
  }) as unknown as GeneratedLoop;

const ndjson = (frames: LoopStreamFrame[]): string =>
  frames.map((frame) => `${JSON.stringify(frame)}\n`).join('');

/** A response whose body arrives in the exact chunks given. */
const streamingResponse = (chunks: string[]) => {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () =>
          index < chunks.length
            ? { done: false, value: encoder.encode(chunks[index++]!) }
            : { done: true, value: undefined },
      }),
    },
    text: async () => chunks.join(''),
    json: async () => JSON.parse(chunks.join('')),
  } as unknown as Response;
};

/** A response with no readable body, which is React Native's own fetch. */
const bufferedResponse = (payload: string, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    body: null,
    text: async () => payload,
    json: async () => JSON.parse(payload),
  }) as unknown as Response;

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchLoopsRemote', () => {
  it('makes exactly one request for a whole search', async () => {
    fetchMock.mockResolvedValue(
      bufferedResponse(
        ndjson([
          { type: 'candidate', loop: loop('a') },
          { type: 'progress', resolved: 1, attempted: 1 },
          {
            type: 'result',
            status: 'ok',
            loops: [loop('a')],
            relaxation: 'none',
            checked: 1,
          },
        ]),
      ),
    );

    const outcome = await searchLoopsRemote(request);

    // The whole point of the move: the app used to make up to sixty OSRM
    // requests and fifteen enrichment calls for this.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe('ok');
  });

  it('sends the rider choices and their bearer token', async () => {
    fetchMock.mockResolvedValue(bufferedResponse(ndjson([{ type: 'empty' }])));

    await searchLoopsRemote({
      ...request,
      terrain: 'hilly',
      surface: 'paved',
      heading: 'SW',
      locale: 'ro',
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.test.local/v1/loops');
    expect(init.headers.authorization).toBe('Bearer rider-token');
    expect(JSON.parse(init.body)).toEqual({
      start: { lat: 44.4268, lon: 26.1025 },
      targetDistanceMeters: 15000,
      terrain: 'hilly',
      surface: 'paved',
      heading: 'SW',
      locale: 'ro',
    });
  });

  it('draws candidates as they arrive, not at the end', async () => {
    const drawn: string[] = [];
    fetchMock.mockResolvedValue(
      streamingResponse([
        ndjson([{ type: 'candidate', loop: loop('a') }]),
        ndjson([{ type: 'candidate', loop: loop('b') }]),
        ndjson([
          {
            type: 'result',
            status: 'ok',
            loops: [loop('a'), loop('b')],
            relaxation: 'none',
            checked: 2,
          },
        ]),
      ]),
    );

    await searchLoopsRemote(request, {
      onCandidate: (l) => drawn.push(l.id),
    });

    expect(drawn).toEqual(['a', 'b']);
  });

  it('survives a chunk boundary in the middle of a line', async () => {
    // The single most likely thing to go wrong on a real connection, and it
    // would surface as a JSON parse error in the middle of a good search.
    const payload = ndjson([
      { type: 'candidate', loop: loop('a') },
      { type: 'progress', resolved: 1, attempted: 1 },
      {
        type: 'result',
        status: 'ok',
        loops: [loop('a')],
        relaxation: 'none',
        checked: 1,
      },
    ]);
    const cut = Math.floor(payload.length / 2);
    fetchMock.mockResolvedValue(
      streamingResponse([payload.slice(0, cut), payload.slice(cut)]),
    );

    const drawn: string[] = [];
    const outcome = await searchLoopsRemote(request, {
      onCandidate: (l) => drawn.push(l.id),
    });

    expect(drawn).toEqual(['a']);
    expect(outcome.status).toBe('ok');
  });

  it('reads a final line that arrives without a trailing newline', async () => {
    const payload = ndjson([{ type: 'empty' }]).trimEnd();
    fetchMock.mockResolvedValue(streamingResponse([payload]));
    const outcome = await searchLoopsRemote(request);
    expect(outcome.status).toBe('empty');
  });

  it('reports progress for the counter', async () => {
    const progress: [number, number][] = [];
    fetchMock.mockResolvedValue(
      bufferedResponse(
        ndjson([
          { type: 'progress', resolved: 1, attempted: 3 },
          { type: 'progress', resolved: 2, attempted: 5 },
          { type: 'empty' },
        ]),
      ),
    );

    await searchLoopsRemote(request, {
      onProgress: (resolved, attempted) => progress.push([resolved, attempted]),
    });

    expect(progress).toEqual([
      [1, 3],
      [2, 5],
    ]);
  });

  it('rebuilds turn instructions in the rider locale', async () => {
    fetchMock.mockResolvedValue(
      bufferedResponse(
        ndjson([
          {
            type: 'result',
            status: 'ok',
            loops: [loop('a')],
            relaxation: 'none',
            checked: 1,
          },
        ]),
      ),
    );

    const outcome = await searchLoopsRemote({ ...request, locale: 'ro' });
    if (outcome.status !== 'ok') throw new Error('expected ok');

    const instruction = outcome.loops[0]!.route.steps[0]!.instruction;
    // OSRM ships no instruction text and the phrase catalogue lives in this
    // app, so the server sends an English fallback. Rendering it would put
    // English turn cues in front of every Romanian and Spanish rider.
    expect(instruction).not.toBe('Turn left onto Strada Lipscani');
    expect(instruction).toContain('Strada Lipscani');
  });

  it('keeps the marker that stops a loop being rerouted home', async () => {
    fetchMock.mockResolvedValue(
      bufferedResponse(
        ndjson([
          {
            type: 'result',
            status: 'ok',
            loops: [loop('a')],
            relaxation: 'none',
            checked: 1,
          },
        ]),
      ),
    );

    const outcome = await searchLoopsRemote(request);
    if (outcome.status !== 'ok') throw new Error('expected ok');
    // Localising the steps rebuilds the route object, and a spread that
    // dropped this would silently re-enable reroute on a loop.
    expect(outcome.loops[0]!.route.source).toBe('generated_loop');
  });

  it('reports an empty result as empty, not as a failure', async () => {
    fetchMock.mockResolvedValue(bufferedResponse(ndjson([{ type: 'empty' }])));
    const outcome = await searchLoopsRemote(request);
    expect(outcome.status).toBe('empty');
  });
});

describe('searchLoopsRemote — failures stay visible', () => {
  it('throws on a refusal rather than returning empty', async () => {
    fetchMock.mockResolvedValue(
      bufferedResponse(
        JSON.stringify({ error: 'Rate limit exceeded', code: 'RATE_LIMITED' }),
        429,
      ),
    );

    await expect(searchLoopsRemote(request)).rejects.toMatchObject({
      name: 'LoopSearchRequestError',
      reason: 'rejected',
      status: 429,
    });
  });

  it('names a transport failure as offline', async () => {
    fetchMock.mockRejectedValue(new Error('Network request failed'));
    await expect(searchLoopsRemote(request)).rejects.toMatchObject({
      reason: 'offline',
    });
  });

  it('throws when the stream ends with no terminal frame', async () => {
    // Truncation and "no loops here" look identical without this. One is a
    // fault and the other is an answer, and a rider told the second when the
    // first happened will change their distance and try forever.
    fetchMock.mockResolvedValue(
      streamingResponse([ndjson([{ type: 'candidate', loop: loop('a') }])]),
    );

    await expect(searchLoopsRemote(request)).rejects.toMatchObject({
      reason: 'truncated',
    });
  });

  it('surfaces an error frame from the middle of a search', async () => {
    fetchMock.mockResolvedValue(
      bufferedResponse(
        ndjson([
          { type: 'candidate', loop: loop('a') },
          { type: 'error', message: 'OSRM went away' },
        ]),
      ),
    );

    await expect(searchLoopsRemote(request)).rejects.toMatchObject({
      reason: 'server',
      message: 'OSRM went away',
    });
  });

  it('reports a cancelled search as cancelled, never as a failure', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      throw new Error('Aborted');
    });

    const outcome = await searchLoopsRemote(request, {
      signal: controller.signal,
    });
    // A rider tapping Cancel is not a fault, and charging or alarming for it
    // would be wrong.
    expect(outcome.status).toBe('cancelled');
  });

  it('stops reading as soon as the rider cancels mid-stream', async () => {
    const controller = new AbortController();
    let reads = 0;
    const encoder = new TextEncoder();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            reads += 1;
            if (reads === 1) {
              return {
                done: false,
                value: encoder.encode(
                  ndjson([{ type: 'candidate', loop: loop('a') }]),
                ),
              };
            }
            return {
              done: false,
              value: encoder.encode(
                ndjson([{ type: 'candidate', loop: loop('b') }]),
              ),
            };
          },
        }),
      },
    } as unknown as Response);

    const drawn: string[] = [];
    const outcome = await searchLoopsRemote(request, {
      signal: controller.signal,
      onCandidate: (l) => {
        drawn.push(l.id);
        controller.abort();
      },
    });

    expect(outcome.status).toBe('cancelled');
    // Whatever drew before the tap stays on the map; nothing after it arrives.
    expect(drawn).toEqual(['a']);
  });
});
