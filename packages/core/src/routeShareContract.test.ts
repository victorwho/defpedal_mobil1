import { describe, it, expect } from 'vitest';
import {
  routeShareCreateSchema,
  routeShareRecordSchema,
  routeSharePublicViewSchema,
  routeShareClaimResponseSchema,
  type RouteShareCreate,
} from './routeShareContract';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validPlannedRoute = {
  origin: { lat: 44.4268, lon: 26.1025 },
  destination: { lat: 44.5, lon: 26.2 },
  geometryPolyline6: 'abc123',
  distanceMeters: 5000,
  durationSeconds: 1200,
  routingMode: 'safe' as const,
};

const validPlannedCreate: RouteShareCreate = {
  source: 'planned',
  route: validPlannedRoute,
};

const validRecord = {
  id: '00000000-0000-4000-8000-000000000000',
  code: 'abcd1234',
  ownerUserId: '00000000-0000-4000-8000-000000000001',
  source: 'planned' as const,
  createdAt: '2026-04-18T10:00:00.000Z',
  expiresAt: '2026-05-18T10:00:00.000Z',
  revokedAt: null,
  viewCount: 0,
  hideEndpoints: false,
};

const validPublicView = {
  code: 'abcd1234',
  source: 'planned' as const,
  sharerDisplayName: 'Jane',
  route: validPlannedRoute,
  endpointsHidden: false,
  fullLengthMeters: 5000,
  createdAt: '2026-04-18T10:00:00.000Z',
  expiresAt: null,
};

// ---------------------------------------------------------------------------
// routeShareCreateSchema — accept matrix
// ---------------------------------------------------------------------------

describe('routeShareCreateSchema — accept', () => {
  it('accepts a well-formed planned share', () => {
    const result = routeShareCreateSchema.safeParse(validPlannedCreate);
    expect(result.success).toBe(true);
  });

  it('accepts routingMode "safe" | "fast" | "flat"', () => {
    for (const mode of ['safe', 'fast', 'flat'] as const) {
      const result = routeShareCreateSchema.safeParse({
        ...validPlannedCreate,
        route: { ...validPlannedRoute, routingMode: mode },
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts zero distance and zero duration (degenerate but valid)', () => {
    const result = routeShareCreateSchema.safeParse({
      ...validPlannedCreate,
      route: { ...validPlannedRoute, distanceMeters: 0, durationSeconds: 0 },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// routeShareCreateSchema — reject matrix
// ---------------------------------------------------------------------------

describe('routeShareCreateSchema — reject', () => {
  it('rejects missing source discriminator', () => {
    const result = routeShareCreateSchema.safeParse({
      route: validPlannedRoute,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown source discriminator value', () => {
    const result = routeShareCreateSchema.safeParse({
      source: 'something-else',
      route: validPlannedRoute,
    });
    expect(result.success).toBe(false);
  });

  it('rejects source "saved" in slice 1 (stubbed with z.never)', () => {
    // Slice 5 will replace the stub with a real savedRouteId schema.
    const result = routeShareCreateSchema.safeParse({
      source: 'saved',
      savedRouteId: 'some-id',
    });
    expect(result.success).toBe(false);
  });

  it('rejects source "past_ride" in slice 1 (stubbed with z.never)', () => {
    const result = routeShareCreateSchema.safeParse({
      source: 'past_ride',
      tripId: 'some-trip-id',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid coordinates (lat > 90)', () => {
    const result = routeShareCreateSchema.safeParse({
      source: 'planned',
      route: { ...validPlannedRoute, origin: { lat: 91, lon: 0 } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid coordinates (lon < -180)', () => {
    const result = routeShareCreateSchema.safeParse({
      source: 'planned',
      route: { ...validPlannedRoute, destination: { lat: 0, lon: -181 } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative distanceMeters', () => {
    const result = routeShareCreateSchema.safeParse({
      source: 'planned',
      route: { ...validPlannedRoute, distanceMeters: -1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty geometryPolyline6', () => {
    const result = routeShareCreateSchema.safeParse({
      source: 'planned',
      route: { ...validPlannedRoute, geometryPolyline6: '' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown routingMode', () => {
    const result = routeShareCreateSchema.safeParse({
      source: 'planned',
      route: { ...validPlannedRoute, routingMode: 'scenic' },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// routeShareRecordSchema
// ---------------------------------------------------------------------------

describe('routeShareRecordSchema', () => {
  it('accepts a well-formed record', () => {
    const result = routeShareRecordSchema.safeParse(validRecord);
    expect(result.success).toBe(true);
  });

  it('accepts null expiresAt and null revokedAt (never-expiring, active share)', () => {
    const result = routeShareRecordSchema.safeParse({
      ...validRecord,
      expiresAt: null,
      revokedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects malformed share code', () => {
    const result = routeShareRecordSchema.safeParse({
      ...validRecord,
      code: 'too-short',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID id', () => {
    const result = routeShareRecordSchema.safeParse({
      ...validRecord,
      id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative viewCount', () => {
    const result = routeShareRecordSchema.safeParse({
      ...validRecord,
      viewCount: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown source', () => {
    const result = routeShareRecordSchema.safeParse({
      ...validRecord,
      source: 'banana',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// routeSharePublicViewSchema
// ---------------------------------------------------------------------------

describe('routeSharePublicViewSchema', () => {
  it('accepts a well-formed public view', () => {
    const result = routeSharePublicViewSchema.safeParse(validPublicView);
    expect(result.success).toBe(true);
  });

  it('accepts null sharerDisplayName (anonymous sharer)', () => {
    const result = routeSharePublicViewSchema.safeParse({
      ...validPublicView,
      sharerDisplayName: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null expiresAt (never-expiring share)', () => {
    const result = routeSharePublicViewSchema.safeParse({
      ...validPublicView,
      expiresAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts endpointsHidden=true (privacy trim applied)', () => {
    const result = routeSharePublicViewSchema.safeParse({
      ...validPublicView,
      endpointsHidden: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing fullLengthMeters', () => {
    // Rebuild without the field so TS + runtime both reject.
    const {
      fullLengthMeters: _omit,
      ...rest
    } = validPublicView;
    void _omit;
    const result = routeSharePublicViewSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects malformed ISO datetime on createdAt', () => {
    const result = routeSharePublicViewSchema.safeParse({
      ...validPublicView,
      createdAt: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// routeShareClaimResponseSchema
// ---------------------------------------------------------------------------

describe('routeShareClaimResponseSchema', () => {
  const validClaim = {
    code: 'abcd1234',
    routePayload: validPlannedRoute,
    sharerDisplayName: 'Jane',
    sharerAvatarUrl: 'https://cdn.example/avatar.png',
    alreadyClaimed: false,
  };

  it('accepts a well-formed first-time claim response', () => {
    const result = routeShareClaimResponseSchema.safeParse(validClaim);
    expect(result.success).toBe(true);
  });

  it('accepts alreadyClaimed=true (idempotent re-claim)', () => {
    const result = routeShareClaimResponseSchema.safeParse({
      ...validClaim,
      alreadyClaimed: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null sharerDisplayName and null sharerAvatarUrl', () => {
    const result = routeShareClaimResponseSchema.safeParse({
      ...validClaim,
      sharerDisplayName: null,
      sharerAvatarUrl: null,
    });
    expect(result.success).toBe(true);
  });

  it('defaults sharerAvatarUrl to null when omitted', () => {
    const { sharerAvatarUrl: _omit, ...rest } = validClaim;
    void _omit;
    const result = routeShareClaimResponseSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sharerAvatarUrl).toBeNull();
    }
  });

  it('rejects malformed share code', () => {
    const result = routeShareClaimResponseSchema.safeParse({
      ...validClaim,
      code: 'too-short',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid routePayload (missing routingMode)', () => {
    const { routingMode: _omit, ...routeRest } = validPlannedRoute;
    void _omit;
    const result = routeShareClaimResponseSchema.safeParse({
      ...validClaim,
      routePayload: routeRest,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean alreadyClaimed', () => {
    const result = routeShareClaimResponseSchema.safeParse({
      ...validClaim,
      alreadyClaimed: 'yes',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-URL sharerAvatarUrl string', () => {
    const result = routeShareClaimResponseSchema.safeParse({
      ...validClaim,
      sharerAvatarUrl: 'not a url',
    });
    expect(result.success).toBe(false);
  });
});
