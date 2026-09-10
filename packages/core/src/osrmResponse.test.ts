/**
 * The order in which an OSRM answer is read.
 *
 * Every case below is a shape captured from the live router on 2026-09-10, not
 * an invented one. The bug this module exists to prevent was caused by
 * assuming a 400 means "your request was wrong", when the router uses it for
 * "there is no route under your constraints" as well.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  describeOsrmFailure,
  isOsrmNoRouteCode,
  readOsrmResponse,
  type OsrmHttpResponse,
} from './osrmResponse';

/** A response that hands back `text` exactly once, like a real one. */
const responseOf = (status: number, body: string): OsrmHttpResponse => {
  let consumed = false;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => {
      if (consumed) throw new Error('body already consumed');
      consumed = true;
      return body;
    },
  };
};

const okBody = JSON.stringify({
  code: 'Ok',
  routes: [{ distance: 12345, legs: [], geometry: { coordinates: [] } }],
});

describe('readOsrmResponse', () => {
  it('returns the routes on a normal answer', async () => {
    const answer = await readOsrmResponse<{ routes: { distance: number }[] }>(
      responseOf(200, okBody),
    );
    expect(answer.outcome).toBe('ok');
    if (answer.outcome !== 'ok') return;
    expect(answer.data.routes[0]!.distance).toBe(12345);
  });

  it('reads NoRoute out of an HTTP 400, which is the whole bug', async () => {
    // Captured verbatim: an unroutable paved ring answers exactly this.
    const answer = await readOsrmResponse(
      responseOf(
        400,
        JSON.stringify({ message: 'No route found between points', code: 'NoRoute' }),
      ),
    );
    expect(answer.outcome).toBe('no_route');
    if (answer.outcome !== 'no_route') return;
    expect(answer.code).toBe('NoRoute');
  });

  it('treats NoSegment the same way', async () => {
    // A coordinate that cannot be snapped to a usable road, which under
    // `exclude=unpaved` means the same thing to the caller.
    const answer = await readOsrmResponse(
      responseOf(400, JSON.stringify({ code: 'NoSegment' })),
    );
    expect(answer.outcome).toBe('no_route');
  });

  it.each([
    ['InvalidValue', 'Exclude flag combination is not supported.'],
    ['InvalidQuery', 'Query string malformed close to position 18'],
    ['InvalidOptions', 'Number of coordinates needs to be at least two.'],
  ])('still fails a malformed request that also answers 400: %s', async (code, message) => {
    // These arrive at the SAME status as NoRoute, so a fix that simply
    // stopped throwing on 400 would swallow real bugs. All three captured
    // from the live router.
    const answer = await readOsrmResponse(
      responseOf(400, JSON.stringify({ code, message })),
    );
    expect(answer.outcome).toBe('failed');
    if (answer.outcome !== 'failed') return;
    expect(answer.code).toBe(code);
    expect(answer.detail).toBe(message);
  });

  it('calls a successful answer with no routes empty, not failed', async () => {
    // The request worked; the answer was nothing. Quoting an HTTP status in
    // that error would be misleading, and treating it as `no_route` would be
    // worse — it would licence dropping a constraint that was never the cause.
    const answer = await readOsrmResponse(
      responseOf(200, JSON.stringify({ code: 'Ok', routes: [] })),
    );
    expect(answer.outcome).toBe('empty');
    if (answer.outcome !== 'empty') return;
    expect(answer.code).toBe('Ok');
  });

  it('keeps a non-JSON body diagnosable instead of a mystery', async () => {
    // A proxy error page, an empty 502. Without the text an infrastructure
    // failure reads as an unexplained routing failure.
    const answer = await readOsrmResponse(
      responseOf(502, '<html><body>Bad Gateway</body></html>'),
    );
    expect(answer.outcome).toBe('failed');
    if (answer.outcome !== 'failed') return;
    expect(answer.code).toBeNull();
    expect(answer.status).toBe(502);
    expect(answer.detail).toContain('Bad Gateway');
  });

  it('survives an empty body', async () => {
    const answer = await readOsrmResponse(responseOf(504, ''));
    expect(answer.outcome).toBe('failed');
    if (answer.outcome !== 'failed') return;
    expect(answer.detail).toBe('HTTP 504');
  });

  it('survives a body that cannot be read at all', async () => {
    const answer = await readOsrmResponse({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error('stream broke');
      },
    });
    expect(answer.outcome).toBe('failed');
  });

  it('reads the body exactly once', async () => {
    // The old shape called `.json()` on the success path and `.text()` on the
    // error path, which is also why it could not simply be reordered: a body
    // can only be consumed once.
    const text = vi.fn().mockResolvedValue(okBody);
    await readOsrmResponse({ ok: true, status: 200, text });
    expect(text).toHaveBeenCalledTimes(1);
  });

  it('does not mistake a 200 NoRoute for a failure', async () => {
    // Not observed from this router, but other OSRM builds answer 200 with a
    // NoRoute code. The classification must not depend on the status.
    const answer = await readOsrmResponse(
      responseOf(200, JSON.stringify({ code: 'NoRoute' })),
    );
    expect(answer.outcome).toBe('no_route');
  });
});

describe('isOsrmNoRouteCode', () => {
  it('accepts the two codes that mean nothing connects these points', () => {
    expect(isOsrmNoRouteCode('NoRoute')).toBe(true);
    expect(isOsrmNoRouteCode('NoSegment')).toBe(true);
  });

  it('rejects everything else, including nothing at all', () => {
    for (const code of ['Ok', 'InvalidValue', 'InvalidQuery', 'TooBig', '', null, undefined]) {
      expect(isOsrmNoRouteCode(code)).toBe(false);
    }
  });
});

describe('describeOsrmFailure', () => {
  it('puts the status, the code and the message in one line', () => {
    expect(
      describeOsrmFailure({
        outcome: 'failed',
        status: 400,
        code: 'InvalidValue',
        detail: 'Exclude flag combination is not supported.',
      }),
    ).toBe('HTTP 400 InvalidValue: Exclude flag combination is not supported.');
  });

  it('omits a code it never had', () => {
    expect(
      describeOsrmFailure({
        outcome: 'failed',
        status: 502,
        code: null,
        detail: 'Bad Gateway',
      }),
    ).toBe('HTTP 502: Bad Gateway');
  });
});
