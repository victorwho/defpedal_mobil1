import { describe, it, expect } from 'vitest';
import {
  routeShareCreateSchema,
  routeShareRecordSchema,
  routeSharePublicViewSchema,
  routeShareClaimResponseSchema,
  myShareRowSchema,
  mySharesResponseSchema,
  ambassadorStatsSchema,
  routeShareViewBeaconResponseSchema,
  routeShareSignupFeedPayloadSchema,
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

  // ── Slice 5a — saved-route variant ──
  //
  // The slice-1 stub rejected `source: 'saved'` with z.never. Slice 5a
  // replaces it with a real schema: savedRouteId (uuid) + route payload
  // (same shape as planned). past_ride stays on z.never until slice 5b,
  // which adds the server-side re-planning + ghost polyline machinery.

  const validSavedRouteId = '550e8400-e29b-41d4-a716-446655440000';

  it('slice 5a: accepts a well-formed saved-route create request', () => {
    const result = routeShareCreateSchema.safeParse({
      source: 'saved',
      savedRouteId: validSavedRouteId,
      route: validPlannedRoute,
    });
    expect(result.success).toBe(true);
  });

  it('slice 5a: rejects saved-route request without savedRouteId', () => {
    const result = routeShareCreateSchema.safeParse({
      source: 'saved',
      route: validPlannedRoute,
    });
    expect(result.success).toBe(false);
  });

  it('slice 5a: rejects saved-route request without route payload', () => {
    const result = routeShareCreateSchema.safeParse({
      source: 'saved',
      savedRouteId: validSavedRouteId,
    });
    expect(result.success).toBe(false);
  });

  it('slice 5a: rejects saved-route request with non-UUID savedRouteId', () => {
    const result = routeShareCreateSchema.safeParse({
      source: 'saved',
      savedRouteId: 'not-a-uuid',
      route: validPlannedRoute,
    });
    expect(result.success).toBe(false);
  });

  it('slice 5a: rejects saved-route request with invalid route payload', () => {
    const result = routeShareCreateSchema.safeParse({
      source: 'saved',
      savedRouteId: validSavedRouteId,
      route: { ...validPlannedRoute, origin: { lat: 91, lon: 0 } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects source "past_ride" (stubbed with z.never until slice 5b)', () => {
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

  // ── Slice 4: private-profile pending-follow branch ──

  it('slice 4: accepts rewards.followPending=true (private sharer branch)', () => {
    const result = routeShareClaimResponseSchema.safeParse({
      ...validClaim,
      rewards: {
        inviteeXpAwarded: 50,
        inviteeNewBadges: [],
        followPending: true,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rewards.followPending).toBe(true);
    }
  });

  it('slice 4: accepts rewards.followPending=false (public sharer branch)', () => {
    const result = routeShareClaimResponseSchema.safeParse({
      ...validClaim,
      rewards: {
        inviteeXpAwarded: 50,
        inviteeNewBadges: [],
        followPending: false,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rewards.followPending).toBe(false);
    }
  });

  it('slice 4: followPending defaults to false when omitted (backward compat with slice 3 servers)', () => {
    const result = routeShareClaimResponseSchema.safeParse({
      ...validClaim,
      rewards: {
        inviteeXpAwarded: null,
        inviteeNewBadges: [],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rewards.followPending).toBe(false);
    }
  });

  it('slice 4: rejects non-boolean followPending', () => {
    const result = routeShareClaimResponseSchema.safeParse({
      ...validClaim,
      rewards: {
        inviteeXpAwarded: null,
        inviteeNewBadges: [],
        followPending: 'yes',
      },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Slice 8 — Ambassador observability schemas
// ---------------------------------------------------------------------------

const validMyShareRow = {
  id: '00000000-0000-4000-8000-000000000010',
  shortCode: 'abcd1234',
  sourceType: 'planned' as const,
  createdAt: '2026-04-19T04:54:28.298107+00:00',
  expiresAt: '2026-05-19T04:54:28.298107+00:00',
  viewCount: 3,
  signupCount: 1,
  revokedAt: null,
};

const validAmbassadorStats = {
  sharesSent: 2,
  opens: 10,
  signups: 3,
  xpEarned: 300,
};

describe('slice 8: myShareRowSchema', () => {
  it('accepts a well-formed row', () => {
    const result = myShareRowSchema.safeParse(validMyShareRow);
    expect(result.success).toBe(true);
  });

  it('accepts a revoked row (revokedAt set)', () => {
    const result = myShareRowSchema.safeParse({
      ...validMyShareRow,
      revokedAt: '2026-04-20T00:00:00+00:00',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a saved-source row', () => {
    const result = myShareRowSchema.safeParse({
      ...validMyShareRow,
      sourceType: 'saved',
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative view/signup counts', () => {
    expect(myShareRowSchema.safeParse({ ...validMyShareRow, viewCount: -1 }).success).toBe(false);
    expect(myShareRowSchema.safeParse({ ...validMyShareRow, signupCount: -1 }).success).toBe(false);
  });

  it('rejects non-uuid id', () => {
    const result = myShareRowSchema.safeParse({ ...validMyShareRow, id: 'nope' });
    expect(result.success).toBe(false);
  });

  it('rejects malformed short code', () => {
    const result = myShareRowSchema.safeParse({ ...validMyShareRow, shortCode: 'ABC' });
    expect(result.success).toBe(false);
  });
});

describe('slice 8: ambassadorStatsSchema', () => {
  it('accepts zeroed stats', () => {
    const result = ambassadorStatsSchema.safeParse({
      sharesSent: 0,
      opens: 0,
      signups: 0,
      xpEarned: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative values', () => {
    expect(
      ambassadorStatsSchema.safeParse({ ...validAmbassadorStats, opens: -1 }).success,
    ).toBe(false);
  });

  it('rejects non-integer xpEarned', () => {
    const result = ambassadorStatsSchema.safeParse({
      ...validAmbassadorStats,
      xpEarned: 12.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('slice 8: mySharesResponseSchema', () => {
  it('accepts a response with multiple shares', () => {
    const result = mySharesResponseSchema.safeParse({
      shares: [validMyShareRow, { ...validMyShareRow, id: '00000000-0000-4000-8000-000000000011', shortCode: 'aaaaaaaa' }],
      ambassadorStats: validAmbassadorStats,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty shares array', () => {
    const result = mySharesResponseSchema.safeParse({
      shares: [],
      ambassadorStats: validAmbassadorStats,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing ambassadorStats', () => {
    const result = mySharesResponseSchema.safeParse({ shares: [] });
    expect(result.success).toBe(false);
  });
});

describe('slice 8: routeShareViewBeaconResponseSchema', () => {
  it('accepts bumped=true firstView=true', () => {
    const result = routeShareViewBeaconResponseSchema.safeParse({
      bumped: true,
      firstView: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts bumped=false firstView=false', () => {
    const result = routeShareViewBeaconResponseSchema.safeParse({
      bumped: false,
      firstView: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-boolean bumped', () => {
    const result = routeShareViewBeaconResponseSchema.safeParse({
      bumped: 'true',
      firstView: false,
    });
    expect(result.success).toBe(false);
  });
});

describe('slice 8: routeShareSignupFeedPayloadSchema', () => {
  const valid = {
    sharerUserId: '00000000-0000-4000-8000-000000000020',
    inviteeUserId: '00000000-0000-4000-8000-000000000021',
    shareId: '00000000-0000-4000-8000-000000000022',
    routePreviewPolylineTrimmed: 'abc123',
  };

  it('accepts a well-formed payload', () => {
    const result = routeShareSignupFeedPayloadSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects empty trimmed polyline', () => {
    const result = routeShareSignupFeedPayloadSchema.safeParse({
      ...valid,
      routePreviewPolylineTrimmed: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid ids', () => {
    const result = routeShareSignupFeedPayloadSchema.safeParse({
      ...valid,
      shareId: 'not-uuid',
    });
    expect(result.success).toBe(false);
  });
});
