// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

import {
  createRouteShareService,
  type SupabaseLike,
} from '../lib/routeShareService';
import type { RouteShareCreateRequest } from '../lib/routeShareSchemas';

// ---------------------------------------------------------------------------
// SupabaseLike stub — configurable per-test via a small DSL
// ---------------------------------------------------------------------------

type InsertOutcome = {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
};

type SelectOutcome = {
  count: number | null;
  error: { message: string } | null;
};

type RpcOutcome = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

type StubOptions = {
  selectOutcomes?: SelectOutcome[];
  insertOutcome?: InsertOutcome;
  rpcOutcome?: RpcOutcome;
};

const makeSupabaseStub = (options: StubOptions = {}): SupabaseLike => {
  const selectOutcomes = options.selectOutcomes ?? [
    { count: 0, error: null }, // default: code is unique
  ];
  let selectIdx = 0;

  const insertOutcome: InsertOutcome = options.insertOutcome ?? {
    data: {
      id: '00000000-0000-4000-8000-000000000001',
      code: 'abcd1234',
      source: 'planned',
      created_at: '2026-04-18T10:00:00.000Z',
      expires_at: '2026-05-18T10:00:00.000Z',
    },
    error: null,
  };

  const rpcOutcome: RpcOutcome = options.rpcOutcome ?? {
    data: null,
    error: null,
  };

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(async () => {
          const o = selectOutcomes[selectIdx] ?? selectOutcomes[selectOutcomes.length - 1];
          selectIdx += 1;
          return o;
        }),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => insertOutcome),
        })),
      })),
    })),
    rpc: vi.fn(async () => rpcOutcome),
  } as unknown as SupabaseLike;
};

// Deterministic "abc12345"-ish codes
const det = () => 0.5;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// A valid short polyline6 that decodes cleanly. Use the core encoder so the
// round-trip is guaranteed to work in the service under test.
import { encodePolyline } from '@defensivepedal/core';

const shortPolyline = encodePolyline([
  [26.1025, 44.4268],
  [26.1035, 44.4278],
]);

const validCreateRequest: RouteShareCreateRequest = {
  source: 'planned',
  route: {
    origin: { lat: 44.4268, lon: 26.1025 },
    destination: { lat: 44.4278, lon: 26.1035 },
    geometryPolyline6: shortPolyline,
    distanceMeters: 150, // below 400m threshold → trimPrivacyZone no-ops
    durationSeconds: 60,
    routingMode: 'safe',
  },
};

// ---------------------------------------------------------------------------
// createShare
// ---------------------------------------------------------------------------

describe('routeShareService.createShare', () => {
  it('returns the inserted row mapped to camelCase', async () => {
    const supabase = makeSupabaseStub();
    const service = createRouteShareService({ supabase, randomSource: det });

    const row = await service.createShare({
      userId: 'user-1',
      request: validCreateRequest,
    });

    expect(row).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      code: 'abcd1234',
      source: 'planned',
      createdAt: '2026-04-18T10:00:00.000Z',
      expiresAt: '2026-05-18T10:00:00.000Z',
    });
  });

  it('retries code generation on collision', async () => {
    const supabase = makeSupabaseStub({
      selectOutcomes: [
        { count: 1, error: null }, // first candidate taken
        { count: 0, error: null }, // second succeeds
      ],
    });
    const service = createRouteShareService({ supabase, randomSource: det });

    await service.createShare({ userId: 'user-1', request: validCreateRequest });

    // 2 select calls (first collision + success) then 1 insert
    expect(supabase.from).toHaveBeenCalledTimes(3);
  });

  it('throws when uniqueness check returns a DB error', async () => {
    const supabase = makeSupabaseStub({
      selectOutcomes: [{ count: null, error: { message: 'boom' } }],
    });
    const service = createRouteShareService({ supabase, randomSource: det });

    await expect(
      service.createShare({ userId: 'user-1', request: validCreateRequest }),
    ).rejects.toThrow(/uniqueness check failed/i);
  });

  it('throws when insert returns an error', async () => {
    const supabase = makeSupabaseStub({
      insertOutcome: { data: null, error: { message: 'insert broke' } },
    });
    const service = createRouteShareService({ supabase, randomSource: det });

    await expect(
      service.createShare({ userId: 'user-1', request: validCreateRequest }),
    ).rejects.toThrow(/insert broke/);
  });

  it('passes a payload with both full and trimmed polyline to the insert call', async () => {
    const insertSpy = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: {
            id: 'x', code: 'abcd1234', source: 'planned',
            created_at: 't1', expires_at: 't2',
          },
          error: null,
        })),
      })),
    }));
    const fromStub = vi.fn((_table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({ count: 0, error: null })),
      })),
      insert: insertSpy,
    }));
    const supabase = {
      from: fromStub,
      rpc: vi.fn(),
    } as unknown as SupabaseLike;

    const service = createRouteShareService({ supabase, randomSource: det });
    await service.createShare({ userId: 'user-1', request: validCreateRequest });

    const firstInsertCall = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstInsertCall).toBeDefined();
    expect(firstInsertCall.user_id).toBe('user-1');
    expect(firstInsertCall.source).toBe('planned');
    expect(firstInsertCall.short_code).toMatch(/^[0-9A-Za-z]{8}$/);

    const payload = firstInsertCall.payload as Record<string, unknown>;
    expect(payload.geometryPolyline6).toBe(shortPolyline);
    expect(typeof payload.trimmedGeometryPolyline6).toBe('string');
    // For a short route (<400m), trimPrivacyZone no-ops but still re-encodes —
    // the value should be non-empty and decode to the same 2 points.
    expect((payload.trimmedGeometryPolyline6 as string).length).toBeGreaterThan(0);
    // Normalized defaults for the extended contract (riskSegments + safetyScore)
    expect(payload.riskSegments).toEqual([]);
    expect(payload.safetyScore).toBeNull();
  });

  it('passes through riskSegments + safetyScore to the stored payload', async () => {
    const insertSpy = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: {
            id: 'x', code: 'abcd1234', source: 'planned',
            created_at: 't1', expires_at: 't2',
          },
          error: null,
        })),
      })),
    }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ count: 0, error: null })),
        })),
        insert: insertSpy,
      })),
      rpc: vi.fn(),
    } as unknown as SupabaseLike;

    const service = createRouteShareService({ supabase, randomSource: det });

    await service.createShare({
      userId: 'user-1',
      request: {
        ...validCreateRequest,
        route: {
          ...validCreateRequest.route,
          riskSegments: [
            { startIndex: 0, endIndex: 2, riskCategory: 'safe' },
            { startIndex: 2, endIndex: 5, riskCategory: 'moderate' },
          ],
          safetyScore: 72.5,
        },
      },
    });

    const insertedPayload = (insertSpy.mock.calls[0]![0] as {
      payload: Record<string, unknown>;
    }).payload;

    expect(insertedPayload.riskSegments).toEqual([
      { startIndex: 0, endIndex: 2, riskCategory: 'safe' },
      { startIndex: 2, endIndex: 5, riskCategory: 'moderate' },
    ]);
    expect(insertedPayload.safetyScore).toBe(72.5);
  });
});

// ---------------------------------------------------------------------------
// getPublicShare
// ---------------------------------------------------------------------------

describe('routeShareService.getPublicShare', () => {
  const samplePayload = {
    code: 'abcd1234',
    source: 'planned',
    sharerDisplayName: 'Jane',
    route: {
      origin: { lat: 44, lon: 26 },
      destination: { lat: 44.1, lon: 26.1 },
      geometryPolyline6: shortPolyline,
      distanceMeters: 150,
      durationSeconds: 60,
      routingMode: 'safe',
    },
    endpointsHidden: true,
    fullLengthMeters: 150,
    createdAt: '2026-04-18T10:00:00.000Z',
    expiresAt: '2026-05-18T10:00:00.000Z',
  };

  it('returns ok: true with the RPC payload when the share is live', async () => {
    const supabase = makeSupabaseStub({
      rpcOutcome: { data: samplePayload, error: null },
    });
    const service = createRouteShareService({ supabase });

    const result = await service.getPublicShare('abcd1234');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(samplePayload);
    }
  });

  it('maps SHARE_NOT_FOUND RPC error to NOT_FOUND', async () => {
    const supabase = makeSupabaseStub({
      rpcOutcome: { data: null, error: { message: 'SHARE_NOT_FOUND' } },
    });
    const service = createRouteShareService({ supabase });

    const result = await service.getPublicShare('abcd1234');
    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('maps SHARE_EXPIRED RPC error to EXPIRED', async () => {
    const supabase = makeSupabaseStub({
      rpcOutcome: { data: null, error: { message: 'SHARE_EXPIRED' } },
    });
    const service = createRouteShareService({ supabase });

    const result = await service.getPublicShare('abcd1234');
    expect(result).toEqual({ ok: false, error: 'EXPIRED' });
  });

  it('maps SHARE_REVOKED RPC error to REVOKED', async () => {
    const supabase = makeSupabaseStub({
      rpcOutcome: { data: null, error: { message: 'SHARE_REVOKED' } },
    });
    const service = createRouteShareService({ supabase });

    const result = await service.getPublicShare('abcd1234');
    expect(result).toEqual({ ok: false, error: 'REVOKED' });
  });

  it('rethrows on unknown RPC errors so the route returns 502', async () => {
    const supabase = makeSupabaseStub({
      rpcOutcome: { data: null, error: { message: 'connection refused' } },
    });
    const service = createRouteShareService({ supabase });

    await expect(service.getPublicShare('abcd1234')).rejects.toThrow(
      /connection refused/,
    );
  });

  it('returns NOT_FOUND when RPC resolves with null data (defensive)', async () => {
    const supabase = makeSupabaseStub({
      rpcOutcome: { data: null, error: null },
    });
    const service = createRouteShareService({ supabase });

    const result = await service.getPublicShare('abcd1234');
    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// claimShare
// ---------------------------------------------------------------------------

describe('routeShareService.claimShare', () => {
  const rpcOk = {
    routePayload: {
      origin: { lat: 44, lon: 26 },
      destination: { lat: 44.1, lon: 26.1 },
      geometryPolyline6: shortPolyline,
      distanceMeters: 150,
      durationSeconds: 60,
      routingMode: 'safe',
      riskSegments: [],
      safetyScore: null,
    },
    sharerDisplayName: 'Jane',
    sharerAvatarUrl: 'https://cdn.example/avatar.png',
    alreadyClaimed: false,
  };

  it('returns status="ok" with the RPC payload on first-time claim', async () => {
    const supabase = makeSupabaseStub({
      rpcOutcome: { data: rpcOk, error: null },
    });
    const service = createRouteShareService({ supabase });

    const result = await service.claimShare({
      code: 'abcd1234',
      inviteeUserId: 'user-2',
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      // `code` is re-attached from the path so the response envelope is
      // self-contained on the wire — the RPC itself doesn't return it.
      expect(result.data.code).toBe('abcd1234');
      expect(result.data.alreadyClaimed).toBe(false);
      expect(result.data.sharerDisplayName).toBe('Jane');
      expect(result.data.sharerAvatarUrl).toBe(
        'https://cdn.example/avatar.png',
      );
      expect(result.data.routePayload).toEqual(rpcOk.routePayload);
    }
  });

  it('returns alreadyClaimed=true on idempotent re-claim', async () => {
    const supabase = makeSupabaseStub({
      rpcOutcome: {
        data: { ...rpcOk, alreadyClaimed: true },
        error: null,
      },
    });
    const service = createRouteShareService({ supabase });

    const result = await service.claimShare({
      code: 'abcd1234',
      inviteeUserId: 'user-2',
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.data.alreadyClaimed).toBe(true);
    }
  });

  it('maps SHARE_NOT_FOUND to status="not_found"', async () => {
    const supabase = makeSupabaseStub({
      rpcOutcome: { data: null, error: { message: 'SHARE_NOT_FOUND' } },
    });
    const service = createRouteShareService({ supabase });

    const result = await service.claimShare({
      code: 'abcd1234',
      inviteeUserId: 'user-2',
    });
    expect(result).toEqual({ status: 'not_found' });
  });

  it('maps SHARE_EXPIRED to status=gone,reason=expired', async () => {
    const supabase = makeSupabaseStub({
      rpcOutcome: { data: null, error: { message: 'SHARE_EXPIRED' } },
    });
    const service = createRouteShareService({ supabase });

    const result = await service.claimShare({
      code: 'abcd1234',
      inviteeUserId: 'user-2',
    });
    expect(result).toEqual({ status: 'gone', reason: 'expired' });
  });

  it('maps SHARE_REVOKED to status=gone,reason=revoked', async () => {
    const supabase = makeSupabaseStub({
      rpcOutcome: { data: null, error: { message: 'SHARE_REVOKED' } },
    });
    const service = createRouteShareService({ supabase });

    const result = await service.claimShare({
      code: 'abcd1234',
      inviteeUserId: 'user-2',
    });
    expect(result).toEqual({ status: 'gone', reason: 'revoked' });
  });

  it('maps SELF_REFERRAL to status=invalid,reason=self_referral', async () => {
    const supabase = makeSupabaseStub({
      rpcOutcome: { data: null, error: { message: 'SELF_REFERRAL' } },
    });
    const service = createRouteShareService({ supabase });

    const result = await service.claimShare({
      code: 'abcd1234',
      inviteeUserId: 'user-1',
    });
    expect(result).toEqual({ status: 'invalid', reason: 'self_referral' });
  });

  it('rethrows unknown RPC errors so the route returns 502', async () => {
    const supabase = makeSupabaseStub({
      rpcOutcome: { data: null, error: { message: 'connection refused' } },
    });
    const service = createRouteShareService({ supabase });

    await expect(
      service.claimShare({ code: 'abcd1234', inviteeUserId: 'user-2' }),
    ).rejects.toThrow(/connection refused/);
  });

  it('treats null RPC data with no error as not_found (defensive)', async () => {
    const supabase = makeSupabaseStub({
      rpcOutcome: { data: null, error: null },
    });
    const service = createRouteShareService({ supabase });

    const result = await service.claimShare({
      code: 'abcd1234',
      inviteeUserId: 'user-2',
    });
    expect(result).toEqual({ status: 'not_found' });
  });

  it('calls the claim_route_share RPC with the expected params', async () => {
    const rpcSpy = vi.fn(async () => ({ data: rpcOk, error: null }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ count: 0, error: null })),
        })),
        insert: vi.fn(),
      })),
      rpc: rpcSpy,
    } as unknown as SupabaseLike;

    const service = createRouteShareService({ supabase });
    await service.claimShare({
      code: 'abcd1234',
      inviteeUserId: 'user-2',
    });

    expect(rpcSpy).toHaveBeenCalledWith('claim_route_share', {
      p_code: 'abcd1234',
      p_invitee_id: 'user-2',
    });
  });
});
