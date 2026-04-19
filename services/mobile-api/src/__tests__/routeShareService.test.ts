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

  // ──────────────────────────────────────────────────────────────────────
  // Slice 5a — saved-route source variant
  //
  // `source: 'saved'` branches the pre-insert flow:
  //   1. SELECT saved_routes WHERE id=<savedRouteId> AND user_id=<caller>
  //      (ownership check; RLS would also block cross-user reads at the
  //      DB, but we belt-and-suspenders here so the API can return a
  //      clean error instead of a DB upstream failure)
  //   2. INSERT route_shares with source='saved' AND source_ref_id=<savedRouteId>
  //
  // The route payload shape is identical to planned — the difference is
  // tracking/analytics (source column + source_ref_id) and the mobile-side
  // caption. No web-viewer changes.
  // ──────────────────────────────────────────────────────────────────────

  const savedCreateRequest: RouteShareCreateRequest = {
    source: 'saved',
    savedRouteId: '550e8400-e29b-41d4-a716-446655440000',
    route: validCreateRequest.route,
  };

  // Per-test stub factory — models two tables:
  //   route_shares: standard select-uniqueness + insert path
  //   saved_routes: single .select().eq().eq().single() for ownership
  type SavedRoutesOutcome =
    | { data: { id: string; user_id: string }; error: null }
    | { data: null; error: { message: string; code?: string } | null };

  const makeSavedStub = (opts: {
    savedLookup: SavedRoutesOutcome;
    insertSpy?: ReturnType<typeof vi.fn>;
  }) => {
    const insertSpy =
      opts.insertSpy ??
      vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: {
              id: 'ins-1',
              code: 'abcd1234',
              source: 'saved',
              created_at: 't',
              expires_at: 't2',
            },
            error: null,
          })),
        })),
      }));

    const from = vi.fn((table: string) => {
      if (table === 'saved_routes') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => opts.savedLookup),
              })),
            })),
          })),
        } as unknown as ReturnType<typeof vi.fn>;
      }
      // route_shares path — uniqueness select + insert
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ count: 0, error: null })),
        })),
        insert: insertSpy,
      };
    });

    return { supabase: { from, rpc: vi.fn() } as unknown as SupabaseLike, insertSpy };
  };

  it('slice 5a: saved source — validates ownership and persists source_ref_id', async () => {
    const { supabase, insertSpy } = makeSavedStub({
      savedLookup: {
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          user_id: 'user-1',
        },
        error: null,
      },
    });
    const service = createRouteShareService({ supabase, randomSource: det });

    const row = await service.createShare({
      userId: 'user-1',
      request: savedCreateRequest,
    });
    expect(row.source).toBe('saved');

    const firstCall = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstCall.source).toBe('saved');
    expect(firstCall.source_ref_id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('slice 5a: saved source — rejects when saved_route belongs to another user', async () => {
    const { supabase } = makeSavedStub({
      savedLookup: {
        data: { id: 'x', user_id: 'someone-else' },
        error: null,
      },
    });
    const service = createRouteShareService({ supabase, randomSource: det });

    await expect(
      service.createShare({ userId: 'user-1', request: savedCreateRequest }),
    ).rejects.toThrow(/saved route not found|not authorised|forbidden/i);
  });

  it('slice 5a: saved source — rejects when saved_route does not exist', async () => {
    const { supabase } = makeSavedStub({
      savedLookup: { data: null, error: null },
    });
    const service = createRouteShareService({ supabase, randomSource: det });

    await expect(
      service.createShare({ userId: 'user-1', request: savedCreateRequest }),
    ).rejects.toThrow(/saved route not found/i);
  });

  it('slice 5a: saved source — propagates DB errors from the ownership check', async () => {
    const { supabase } = makeSavedStub({
      savedLookup: { data: null, error: { message: 'db timeout' } },
    });
    const service = createRouteShareService({ supabase, randomSource: det });

    await expect(
      service.createShare({ userId: 'user-1', request: savedCreateRequest }),
    ).rejects.toThrow(/db timeout|ownership check/i);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Slice 6 — hideEndpoints flag
  //
  // The API now accepts an optional `hideEndpoints` boolean on the create
  // request. True (default) = `route_shares.hide_endpoints` column set to
  // true and the RPC selects the trimmed polyline for public reads.
  // False = column set to false, RPC returns the full polyline.
  //
  // The column itself defaults to true at the DB level, so omitting the
  // flag continues to produce a privacy-safe share (existing slice-1
  // behavior preserved).
  // ──────────────────────────────────────────────────────────────────────

  it('slice 6: persists hide_endpoints=false when caller opts out', async () => {
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
      request: { ...validCreateRequest, hideEndpoints: false },
    });

    const firstCall = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstCall.hide_endpoints).toBe(false);
  });

  it('slice 6: persists hide_endpoints=true when caller explicitly opts in', async () => {
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
      request: { ...validCreateRequest, hideEndpoints: true },
    });

    const firstCall = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstCall.hide_endpoints).toBe(true);
  });

  it('slice 6: omits hide_endpoints from the insert when caller does not specify (column default applies)', async () => {
    // Backward-compat: every slice-1 caller omitted the flag. The service
    // should let the DB default (true) apply — NOT inject hide_endpoints=true
    // explicitly, so DB-side default changes remain authoritative.
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
      request: validCreateRequest,
    });

    const firstCall = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstCall).not.toHaveProperty('hide_endpoints');
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
