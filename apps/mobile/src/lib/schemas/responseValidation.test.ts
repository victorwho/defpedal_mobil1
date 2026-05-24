/**
 * responseValidation — Unit tests
 *
 * Covers Phase 3c boundary validation. Verifies:
 *   - Happy path: schema match returns the data unchanged.
 *   - Sad path: schema mismatch captures to telemetry with the endpoint tag
 *     AND a capped issue list, then still returns the data unchanged (so a
 *     server shape drift never breaks user flow).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  ActivityFeedResponseSchema,
  FeedResponseSchema,
  LeaderboardResponseSchema,
  TiersResponseSchema,
} from './apiResponses';
import { validateResponse } from './responseValidation';

// Spy on telemetry.captureError without loading expo-constants etc.
const captureErrorSpy = vi.fn<(error: unknown, context?: Record<string, unknown>) => void>();
vi.mock('../telemetry', () => ({
  telemetry: {
    captureError: (...args: unknown[]) => captureErrorSpy(...(args as [unknown, Record<string, unknown> | undefined])),
  },
}));

beforeEach(() => {
  captureErrorSpy.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validateResponse — helper', () => {
  const passthroughSchema = z
    .object({
      items: z.array(z.unknown()),
      cursor: z.string().nullable(),
    })
    .passthrough();

  it('returns the input unchanged on schema match', () => {
    const data = { items: [], cursor: null };
    expect(validateResponse(passthroughSchema, data, '/v1/test')).toBe(data);
    expect(captureErrorSpy).not.toHaveBeenCalled();
  });

  it('returns the input unchanged on schema MISMATCH (lenient)', () => {
    const malformed = { items: 'not-an-array', cursor: 42 };
    expect(validateResponse(passthroughSchema, malformed, '/v1/test')).toBe(malformed);
  });

  it('captures a telemetry error on schema mismatch with the endpoint tag', () => {
    const malformed = { items: 'wrong', cursor: 42 };
    validateResponse(passthroughSchema, malformed, '/v1/test');

    expect(captureErrorSpy).toHaveBeenCalledOnce();
    const [error, context] = captureErrorSpy.mock.calls[0]!;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('/v1/test');
    expect(context).toMatchObject({
      feature: 'api_response_validation',
      endpoint: '/v1/test',
    });
    // Issues field is JSON-stringified; parse and verify shape.
    const issues = JSON.parse((context as { issues: string }).issues);
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('caps captured issues at 5 even when many fail', () => {
    // Build a schema with many required string fields → many issues.
    const deepSchema = z.object({
      a: z.string(),
      b: z.string(),
      c: z.string(),
      d: z.string(),
      e: z.string(),
      f: z.string(),
      g: z.string(),
      h: z.string(),
    });
    validateResponse(deepSchema, {}, '/v1/deep');

    expect(captureErrorSpy).toHaveBeenCalledOnce();
    const [, context] = captureErrorSpy.mock.calls[0]!;
    const issues = JSON.parse((context as { issues: string }).issues);
    expect(issues.length).toBe(5);
    // But issue_count records the true total.
    expect((context as { issue_count: number }).issue_count).toBeGreaterThanOrEqual(8);
  });

  it('handles null / undefined input gracefully', () => {
    expect(validateResponse(passthroughSchema, null, '/v1/null')).toBeNull();
    expect(validateResponse(passthroughSchema, undefined, '/v1/undef')).toBeUndefined();
    expect(captureErrorSpy).toHaveBeenCalledTimes(2);
  });
});

describe('FeedResponseSchema', () => {
  it('accepts a well-formed feed response', () => {
    expect(
      FeedResponseSchema.safeParse({
        items: [{ id: '1' }, { id: '2' }],
        cursor: 'next-page-token',
      }).success,
    ).toBe(true);
  });

  it('accepts cursor:null (end of feed)', () => {
    expect(FeedResponseSchema.safeParse({ items: [], cursor: null }).success).toBe(true);
  });

  it('rejects missing items', () => {
    expect(FeedResponseSchema.safeParse({ cursor: null }).success).toBe(false);
  });

  it('rejects items that is not an array', () => {
    expect(FeedResponseSchema.safeParse({ items: 'no', cursor: null }).success).toBe(false);
  });

  it('rejects cursor that is a number', () => {
    expect(FeedResponseSchema.safeParse({ items: [], cursor: 42 }).success).toBe(false);
  });

  it('allows extra fields (passthrough — server may add fields)', () => {
    expect(
      FeedResponseSchema.safeParse({ items: [], cursor: null, totalCount: 42 }).success,
    ).toBe(true);
  });
});

describe('ActivityFeedResponseSchema', () => {
  it('accepts a well-formed activity feed', () => {
    expect(
      ActivityFeedResponseSchema.safeParse({
        items: [{ kind: 'ride' }, { kind: 'badge_unlock' }],
        cursor: '2026-05-24T12:00:00Z',
      }).success,
    ).toBe(true);
  });

  it('accepts cursor:null (end of feed)', () => {
    expect(ActivityFeedResponseSchema.safeParse({ items: [], cursor: null }).success).toBe(true);
  });

  it('rejects missing cursor', () => {
    expect(ActivityFeedResponseSchema.safeParse({ items: [] }).success).toBe(false);
  });
});

describe('LeaderboardResponseSchema', () => {
  it('accepts a well-formed leaderboard response', () => {
    expect(
      LeaderboardResponseSchema.safeParse({
        entries: [{ rank: 1 }, { rank: 2 }],
        userRank: { rank: 42 },
        periodStart: '2026-05-01T00:00:00Z',
        periodEnd: '2026-05-31T23:59:59Z',
      }).success,
    ).toBe(true);
  });

  it('accepts userRank:null (user opted out or no rides)', () => {
    expect(
      LeaderboardResponseSchema.safeParse({
        entries: [],
        userRank: null,
        periodStart: '2026-05-01T00:00:00Z',
        periodEnd: '2026-05-31T23:59:59Z',
      }).success,
    ).toBe(true);
  });

  it('rejects missing periodStart / periodEnd', () => {
    expect(
      LeaderboardResponseSchema.safeParse({
        entries: [],
        userRank: null,
        periodStart: '2026-05-01T00:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('rejects non-array entries', () => {
    expect(
      LeaderboardResponseSchema.safeParse({
        entries: { rank: 1 },
        userRank: null,
        periodStart: '2026-05-01T00:00:00Z',
        periodEnd: '2026-05-31T23:59:59Z',
      }).success,
    ).toBe(false);
  });
});

describe('TiersResponseSchema', () => {
  it('accepts a well-formed tiers response', () => {
    expect(
      TiersResponseSchema.safeParse({
        tiers: [{ name: 'kickstand' }, { name: 'commuter' }],
        totalXp: 1234,
        riderTier: 'commuter',
        recentXp: [{ amount: 50, reason: 'ride_completed' }],
      }).success,
    ).toBe(true);
  });

  it('accepts totalXp=0 and empty recentXp (brand new user)', () => {
    expect(
      TiersResponseSchema.safeParse({
        tiers: [],
        totalXp: 0,
        riderTier: 'kickstand',
        recentXp: [],
      }).success,
    ).toBe(true);
  });

  it('rejects totalXp as a string ("123" vs 123 — common server shape bug)', () => {
    expect(
      TiersResponseSchema.safeParse({
        tiers: [],
        totalXp: '1234',
        riderTier: 'commuter',
        recentXp: [],
      }).success,
    ).toBe(false);
  });

  it('rejects missing riderTier', () => {
    expect(
      TiersResponseSchema.safeParse({
        tiers: [],
        totalXp: 0,
        recentXp: [],
      }).success,
    ).toBe(false);
  });
});
