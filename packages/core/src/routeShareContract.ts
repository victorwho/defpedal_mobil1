/**
 * Route-share contract schemas.
 *
 * Discriminated union on `source` — only `'planned'` is implemented in
 * slice 1. Slice 5 extends with `'saved'` and `'past_ride'` variants; the
 * discriminator is in place from day one so callers already switch on it.
 *
 * The contract is defined in zod; TS types are inferred via `z.infer`.
 */

import { z } from 'zod';
import { ROUTING_DISPLAY_MODES } from './routingProfile';
import { SHARE_CODE_REGEX } from './shareCodeGenerator';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const shareCodeSchema = z
  .string()
  .regex(SHARE_CODE_REGEX, 'Share code must be 8 characters of base62');

const coordinateSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lon: z.number().gte(-180).lte(180),
});

const riskSegmentSchema = z.object({
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().positive(),
  riskCategory: z.enum(['very_safe', 'safe', 'moderate', 'dangerous', 'extreme']),
});

export type RouteShareRiskSegment = z.infer<typeof riskSegmentSchema>;

/**
 * Colour-carrying risk range over the SERVED polyline's indices.
 *
 * Additive and separate from `riskSegmentSchema` above on purpose. That older
 * shape names a five-level category vocabulary (`very_safe`..`extreme`) which
 * the 2026-09-04 b46v1 re-anchoring retired and which `.claude/CLAUDE.md` says
 * must not reappear — so new data carries the SERVER's colour instead of any
 * label. Colours are safe to ship (they are painted in front of the rider
 * anyway); the score cuts behind them are the IP and stay server-side.
 *
 * The colour is regex-validated because it is interpolated straight into a map
 * paint property on the public web page. Anything that reaches a style value
 * from a stored payload gets checked.
 */
const riskColorSegmentSchema = z.object({
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().positive(),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
});

export type RouteShareRiskColorSegment = z.infer<typeof riskColorSegmentSchema>;
export type RouteShareRiskCategory = RouteShareRiskSegment['riskCategory'];

const plannedRoutePayloadSchema = z.object({
  origin: coordinateSchema,
  destination: coordinateSchema,
  geometryPolyline6: z.string().min(1),
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  routingMode: z.enum(ROUTING_DISPLAY_MODES),
  /** Per-segment risk category for safety-colored rendering. Optional — may be empty for unscored routes. */
  riskSegments: z.array(riskSegmentSchema).default([]),
  /**
   * Risk ranges indexed against `geometryPolyline6` AS SERVED, carrying server
   * colours. Computed server-side at share creation — see `createShare`.
   *
   * ⚠️ Two sets are stored because the RPC serves a TRIMMED polyline when
   * `hide_endpoints` is true (which is the DB default), and indices into the
   * full line are wrong for the trimmed one. The consumer picks by
   * `endpointsHidden`; getting this wrong paints the right colours in the wrong
   * places, which is worse than painting none.
   */
  riskColorSegments: z.array(riskColorSegmentSchema).default([]),
  /** As `riskColorSegments`, but indexed against the trimmed polyline. */
  trimmedRiskColorSegments: z.array(riskColorSegmentSchema).default([]),
  /** Aggregate 0-100 safety score. Null when the route wasn't safety-scored. */
  safetyScore: z.number().min(0).max(100).nullable().default(null),
});

// ---------------------------------------------------------------------------
// RouteShareCreate — request body when creating a new share
// ---------------------------------------------------------------------------
//
// Discriminated union on `source`. Slice 1 activated `'planned'`; slice 5a
// adds `'saved'` (savedRouteId + route payload identical to planned);
// `'past_ride'` stays stubbed with z.never until slice 5b delivers the
// server-side re-planning + ghost-polyline machinery.
//
// The `saved` shape intentionally re-uses plannedRoutePayloadSchema rather
// than a trimmed variant. Rationale: the mobile client fetches a fresh
// preview for the saved route before submitting, so origin / destination /
// polyline / risk segments / mode all come from the same source as planned.
// The only semantic difference is bookkeeping: the API persists `source='saved'`
// and `source_ref_id=<savedRouteId>` for analytics and for the Impact
// Dashboard's Ambassador-per-source breakdown in slice 8.

export const routeShareCreatePlannedSchema = z.object({
  source: z.literal('planned'),
  route: plannedRoutePayloadSchema,
});

export const routeShareCreateSavedSchema = z.object({
  source: z.literal('saved'),
  savedRouteId: z.string().uuid(),
  route: plannedRoutePayloadSchema,
});

const routeShareCreatePastRideStubSchema = z.object({
  source: z.literal('past_ride'),
  tripId: z.never(),
});

export const routeShareCreateSchema = z.discriminatedUnion('source', [
  routeShareCreatePlannedSchema,
  routeShareCreateSavedSchema,
  routeShareCreatePastRideStubSchema,
]);

export type RouteShareCreate = z.infer<typeof routeShareCreateSchema>;
export type RouteShareCreatePlanned = z.infer<
  typeof routeShareCreatePlannedSchema
>;
export type RouteShareCreateSaved = z.infer<
  typeof routeShareCreateSavedSchema
>;

// ---------------------------------------------------------------------------
// RouteShareRecord — DB row shape returned to the owner
// ---------------------------------------------------------------------------

// `.datetime({ offset: true })` accepts both `Z` suffix (ISO UTC) and `+HH:MM`
// offset form. Postgres `timestamptz` serializes as offset form (e.g.
// `2026-04-19T04:54:28.298107+00:00`), which the default strict `.datetime()`
// rejects — so anything coming back from Supabase needs the offset allowance.
const isoDateTime = z.string().datetime({ offset: true });

export const routeShareRecordSchema = z.object({
  id: z.string().uuid(),
  code: shareCodeSchema,
  ownerUserId: z.string().uuid(),
  source: z.enum(['planned', 'saved', 'past_ride']),
  createdAt: isoDateTime,
  expiresAt: isoDateTime.nullable(),
  revokedAt: isoDateTime.nullable(),
  viewCount: z.number().int().nonnegative(),
  hideEndpoints: z.boolean(),
});

export type RouteShareRecord = z.infer<typeof routeShareRecordSchema>;

// ---------------------------------------------------------------------------
// RouteSharePublicView — payload served to anonymous /r/:code consumers
// ---------------------------------------------------------------------------

export const routeSharePublicViewSchema = z.object({
  code: shareCodeSchema,
  source: z.enum(['planned', 'saved', 'past_ride']),
  sharerDisplayName: z.string().nullable(),
  /** URL to sharer's avatar image. Null when unset or profile is private. */
  sharerAvatarUrl: z.string().url().nullable().default(null),
  route: plannedRoutePayloadSchema,
  /** True when origin/destination endpoints were trimmed for privacy. */
  endpointsHidden: z.boolean(),
  /** Full route length in meters before any trimming. */
  fullLengthMeters: z.number().nonnegative(),
  /** Accumulated public views. Drives slice 8 first-view push notification. */
  viewCount: z.number().int().nonnegative().default(0),
  createdAt: isoDateTime,
  expiresAt: isoDateTime.nullable(),
});

export type RouteSharePublicView = z.infer<typeof routeSharePublicViewSchema>;

// ---------------------------------------------------------------------------
// RouteShareClaimResponse — payload returned from POST /r/:code/claim
//
// Returned on HTTP 200 (both first-time claim and idempotent re-claim).
// `routePayload` is the same shape as the public-view `route` object: full
// polyline when `hide_endpoints=false`, trimmed 200m both ends otherwise.
// `alreadyClaimed=true` means the invitee had already claimed this share
// before — the API skipped side effects (no duplicate saved_route,
// user_follow, signup_count++) and just echoed the payload.
// ---------------------------------------------------------------------------

// Slice 3: invitee-facing reward summary. Inviter-side reward info from the
// claim_route_share RPC (inviterXpAwarded / inviterNewBadges / inviterUserId /
// miaMilestoneAdvanced) is consumed server-side to dispatch the push
// notification to the sharer and is stripped before the claim response is
// returned to the invitee.
const claimRewardBadgeSchema = z.object({
  badgeKey: z.string(),
  name: z.string(),
  flavorText: z.string(),
  iconKey: z.string(),
  tier: z.number().int(),
});

const claimInviteeRewardsSchema = z.object({
  inviteeXpAwarded: z.number().int().nullable().default(null),
  inviteeNewBadges: z.array(claimRewardBadgeSchema).default([]),
  // Slice 4: `true` when the sharer has a private profile — the follow
  // relationship was inserted as 'pending' instead of 'accepted'. Route
  // access, XP, and badges are NOT gated on follow approval; this flag
  // only drives the mobile toast copy on the invitee side.
  followPending: z.boolean().default(false),
});

export type RouteShareClaimRewardBadge = z.infer<typeof claimRewardBadgeSchema>;
export type RouteShareClaimInviteeRewards = z.infer<
  typeof claimInviteeRewardsSchema
>;

export const routeShareClaimResponseSchema = z.object({
  code: shareCodeSchema,
  routePayload: plannedRoutePayloadSchema,
  sharerDisplayName: z.string().nullable(),
  sharerAvatarUrl: z.string().url().nullable().default(null),
  alreadyClaimed: z.boolean(),
  rewards: claimInviteeRewardsSchema.default({
    inviteeXpAwarded: null,
    inviteeNewBadges: [],
    followPending: false,
  }),
});

export type RouteShareClaimResponse = z.infer<
  typeof routeShareClaimResponseSchema
>;

// ---------------------------------------------------------------------------
// Slice 8 — Ambassador observability + control
// ---------------------------------------------------------------------------

// Per-row stats surfaced on My Shares.
export const myShareRowSchema = z.object({
  id: z.string().uuid(),
  shortCode: shareCodeSchema,
  sourceType: z.enum(['planned', 'saved', 'past_ride']),
  createdAt: isoDateTime,
  expiresAt: isoDateTime.nullable(),
  viewCount: z.number().int().nonnegative(),
  signupCount: z.number().int().nonnegative(),
  revokedAt: isoDateTime.nullable(),
});

export type MyShareRow = z.infer<typeof myShareRowSchema>;

// Lifetime aggregates for the Ambassador Impact tile.
export const ambassadorStatsSchema = z.object({
  sharesSent: z.number().int().nonnegative(),
  opens: z.number().int().nonnegative(),
  signups: z.number().int().nonnegative(),
  xpEarned: z.number().int().nonnegative(),
});

export type AmbassadorStats = z.infer<typeof ambassadorStatsSchema>;

// Envelope returned by GET /v1/route-shares/mine.
export const mySharesResponseSchema = z.object({
  shares: z.array(myShareRowSchema),
  ambassadorStats: ambassadorStatsSchema,
});

export type MySharesResponse = z.infer<typeof mySharesResponseSchema>;

// Envelope returned by POST /v1/route-shares/:code/view.
export const routeShareViewBeaconResponseSchema = z.object({
  bumped: z.boolean(),
  firstView: z.boolean(),
});

export type RouteShareViewBeaconResponse = z.infer<
  typeof routeShareViewBeaconResponseSchema
>;

// Payload stored inside activity_feed rows of type 'route_share_signup'.
// Consumed by the mobile feed to render a conversion card.
export const routeShareSignupFeedPayloadSchema = z.object({
  sharerUserId: z.string().uuid(),
  inviteeUserId: z.string().uuid(),
  shareId: z.string().uuid(),
  routePreviewPolylineTrimmed: z.string().min(1),
});

export type RouteShareSignupFeedPayload = z.infer<
  typeof routeShareSignupFeedPayloadSchema
>;
