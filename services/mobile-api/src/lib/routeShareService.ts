/**
 * Route-share service.
 *
 * Injection-friendly — all Supabase access goes through a `SupabaseLike`
 * shape so unit tests can pass in a stub without real network. In
 * production the `supabaseAdmin` client is injected from the route module.
 *
 * Responsibilities:
 *   - `createShare`   — generate a unique 8-char code, compute the 200m
 *     privacy-trimmed polyline, insert the row.
 *   - `getPublicShare` — call get_public_route_share(p_code) and translate
 *     the RPC's SHARE_NOT_FOUND / SHARE_REVOKED / SHARE_EXPIRED errors
 *     into typed error values for the route layer.
 */

import {
  decodePolyline,
  encodePolyline,
  generateUniqueShareCode,
  trimPrivacyZone,
} from '@defensivepedal/core';
import type { RouteShareCreateRequest } from './routeShareSchemas';

// ---------------------------------------------------------------------------
// Minimal shape of the Supabase admin client we rely on. Declaring this
// instead of importing `SupabaseClient` keeps the service framework-free.
// ---------------------------------------------------------------------------

export type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string, opts?: { count?: 'exact'; head?: boolean }) => {
      eq: (column: string, value: unknown) => Promise<{
        count?: number | null;
        error: { message: string } | null;
      }>;
    };
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  rpc: (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
};

// ---------------------------------------------------------------------------
// Public error enum returned by getPublicShare so the route can map to HTTP.
// ---------------------------------------------------------------------------

export type PublicShareError = 'NOT_FOUND' | 'EXPIRED' | 'REVOKED';

export type GetPublicShareResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: PublicShareError };

// ---------------------------------------------------------------------------
// createShare
// ---------------------------------------------------------------------------

export type CreateShareInput = {
  userId: string;
  request: RouteShareCreateRequest;
};

export type CreateShareRow = {
  id: string;
  code: string;
  source: 'planned' | 'saved' | 'past_ride';
  createdAt: string;
  expiresAt: string;
};

export type RouteShareService = {
  createShare: (input: CreateShareInput) => Promise<CreateShareRow>;
  getPublicShare: (code: string) => Promise<GetPublicShareResult>;
  claimShare: (input: ClaimShareInput) => Promise<ClaimShareResult>;
};

// ---------------------------------------------------------------------------
// claimShare — wraps claim_route_share RPC (slice 2)
//
// Errors emitted by the RPC map to typed discriminated-union results so the
// route layer can pick HTTP statuses without inspecting the raw PG error
// string:
//   SHARE_NOT_FOUND  → { status: 'not_found' }                    → HTTP 404
//   SHARE_EXPIRED    → { status: 'gone',   reason: 'expired' }    → HTTP 410
//   SHARE_REVOKED    → { status: 'gone',   reason: 'revoked' }    → HTTP 410
//   SELF_REFERRAL    → { status: 'invalid',reason: 'self_referral'} → HTTP 422
//   happy path       → { status: 'ok', data: <RPC return shape> }
// Unknown RPC errors re-throw so the route's errorHandler yields 502.
// ---------------------------------------------------------------------------

export type ClaimShareInput = {
  code: string;
  inviteeUserId: string;
};

export type ClaimRewardBadge = {
  badgeKey: string;
  name: string;
  flavorText: string;
  iconKey: string;
  tier: number;
};

// Full reward shape returned by the claim_route_share RPC.
// The API strips the `inviter*` fields before forwarding to the invitee —
// those are consumed server-side to drive the push notification to the sharer
// (see route-shares.ts claim handler). `followPending` (slice 4) is an
// invitee-facing field that stays in the response.
export type ClaimRewardsAll = {
  inviteeXpAwarded: number | null;
  inviteeNewBadges: ClaimRewardBadge[];
  inviterXpAwarded: number | null;
  inviterNewBadges: ClaimRewardBadge[];
  inviterUserId: string;
  miaMilestoneAdvanced: boolean;
  followPending: boolean;
};

export type ClaimSharePayload = {
  code: string;
  routePayload: Record<string, unknown>;
  sharerDisplayName: string | null;
  sharerAvatarUrl: string | null;
  alreadyClaimed: boolean;
  rewards: ClaimRewardsAll;
};

export type ClaimShareResult =
  | { status: 'ok'; data: ClaimSharePayload }
  | { status: 'not_found' }
  | { status: 'gone'; reason: 'expired' | 'revoked' }
  | { status: 'invalid'; reason: 'self_referral' };

export type CreateRouteShareServiceOptions = {
  supabase: SupabaseLike;
  /** Test-only deterministic random source for code generation. */
  randomSource?: () => number;
};

/**
 * Compute the 200m-trimmed polyline from the client-supplied full polyline.
 *
 * Both `decodePolyline` and `encodePolyline` in `@defensivepedal/core` use
 * `[lon, lat]` (GeoJSON order), which is also what `trimPrivacyZone`
 * consumes and produces — no coordinate swap needed.
 *
 * `trimPrivacyZone` with trimMeters=200 no-ops on polylines shorter than
 * 400m (returns them unchanged), matching the 400m threshold baked into
 * the migration.
 */
const computeTrimmedPolyline6 = (fullPolyline6: string): string => {
  const lonLatPoints = decodePolyline(fullPolyline6) as [number, number][];
  const trimmed = trimPrivacyZone(lonLatPoints, 200);
  return encodePolyline(trimmed);
};

export const createRouteShareService = (
  options: CreateRouteShareServiceOptions,
): RouteShareService => {
  const { supabase, randomSource } = options;

  const isCodeUnique = async (candidate: string): Promise<boolean> => {
    const { count, error } = await supabase
      .from('route_shares')
      .select('id', { count: 'exact', head: true })
      .eq('short_code', candidate);

    if (error) {
      throw new Error(`Share code uniqueness check failed: ${error.message}`);
    }

    return (count ?? 0) === 0;
  };

  // Slice 5a: ownership check for saved-route shares. RLS on saved_routes
  // would also block cross-user reads, but going through a dedicated
  // lookup lets us map the three failure modes (not found, wrong owner, DB
  // error) to clean API errors instead of a generic upstream 502.
  const validateSavedRouteOwnership = async (
    savedRouteId: string,
    userId: string,
  ): Promise<void> => {
    const { data, error } = await (
      supabase.from('saved_routes') as unknown as {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{
                data: { id: string; user_id: string } | null;
                error: { message: string; code?: string } | null;
              }>;
            };
          };
        };
      }
    )
      .select('id, user_id')
      .eq('id', savedRouteId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Saved route ownership check failed: ${error.message}`,
      );
    }
    if (!data) {
      throw new Error(
        'Saved route not found or not authorised for this user',
      );
    }
    // Belt-and-suspenders: even though the query filters on both id AND
    // user_id, re-check the returned row's user_id. This guards against
    // any future query refactor that accidentally relaxes the filter.
    if (data.user_id !== userId) {
      throw new Error(
        'Saved route not found or not authorised for this user',
      );
    }
  };

  const createShare: RouteShareService['createShare'] = async ({ userId, request }) => {
    // Slice 5a: gate saved-source creates on the saved_routes ownership
    // check. Planned (slice 1) short-circuits straight to code generation.
    if (request.source === 'saved') {
      await validateSavedRouteOwnership(request.savedRouteId, userId);
    }

    const code = await generateUniqueShareCode({ isCodeUnique, randomSource });

    const fullPolyline = request.route.geometryPolyline6;
    const trimmedPolyline = computeTrimmedPolyline6(fullPolyline);

    // Payload mirrors the shape documented in migration 2026041801_route_shares.sql
    // The RPC picks geometryPolyline6 vs trimmedGeometryPolyline6 based on hide_endpoints.
    //
    // `riskSegments` and `safetyScore` drive the web viewer's safety-colored
    // polyline + stats bar (core routeShareContract extension). They are
    // optional on the create request; we normalize undefined → [] / null so
    // the stored payload always has both keys.
    const payload = {
      origin: request.route.origin,
      destination: request.route.destination,
      geometryPolyline6: fullPolyline,
      trimmedGeometryPolyline6: trimmedPolyline,
      distanceMeters: request.route.distanceMeters,
      durationSeconds: request.route.durationSeconds,
      routingMode: request.route.routingMode,
      riskSegments: request.route.riskSegments ?? [],
      safetyScore: request.route.safetyScore ?? null,
    };

    // Slice 5a: `source_ref_id` tracks which saved_route this share was
    // generated from, null for planned. Feeds analytics + the slice-8
    // Ambassador-per-source breakdown; the RPC itself doesn't consult it.
    const sourceRefId =
      request.source === 'saved' ? request.savedRouteId : null;

    const { data, error } = await supabase
      .from('route_shares')
      .insert({
        user_id: userId,
        source: request.source,
        source_ref_id: sourceRefId,
        payload,
        short_code: code,
        // hide_endpoints defaults to true at the DB layer; letting the
        // default apply keeps the privacy guarantee unambiguous.
      })
      .select('id, code:short_code, source, created_at, expires_at')
      .single();

    if (error || !data) {
      throw new Error(
        `Failed to insert route_shares row: ${error?.message ?? 'no row returned'}`,
      );
    }

    return {
      id: String(data.id),
      code: String(data.code),
      source: data.source as CreateShareRow['source'],
      createdAt: String(data.created_at),
      expiresAt: String(data.expires_at),
    };
  };

  const getPublicShare: RouteShareService['getPublicShare'] = async (code) => {
    const { data, error } = await supabase.rpc('get_public_route_share', {
      p_code: code,
    });

    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('SHARE_NOT_FOUND')) return { ok: false, error: 'NOT_FOUND' };
      if (msg.includes('SHARE_EXPIRED'))   return { ok: false, error: 'EXPIRED' };
      if (msg.includes('SHARE_REVOKED'))   return { ok: false, error: 'REVOKED' };
      // Unknown DB error — rethrow so the route's errorHandler returns 502.
      throw new Error(`get_public_route_share RPC failed: ${msg}`);
    }

    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'NOT_FOUND' };
    }

    return { ok: true, value: data as Record<string, unknown> };
  };

  const claimShare: RouteShareService['claimShare'] = async ({
    code,
    inviteeUserId,
  }) => {
    const { data, error } = await supabase.rpc('claim_route_share', {
      p_code: code,
      p_invitee_id: inviteeUserId,
    });

    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('SHARE_NOT_FOUND')) return { status: 'not_found' };
      if (msg.includes('SHARE_EXPIRED'))
        return { status: 'gone', reason: 'expired' };
      if (msg.includes('SHARE_REVOKED'))
        return { status: 'gone', reason: 'revoked' };
      if (msg.includes('SELF_REFERRAL'))
        return { status: 'invalid', reason: 'self_referral' };
      throw new Error(`claim_route_share RPC failed: ${msg}`);
    }

    if (!data || typeof data !== 'object') {
      // RPC returned no row but no error either — treat as not found to be
      // defensive. In practice the RPC always returns JSONB or raises.
      return { status: 'not_found' };
    }

    const raw = data as Record<string, unknown>;
    // The RPC (slice 3) returns { routePayload, sharerDisplayName,
    // sharerAvatarUrl, alreadyClaimed, rewards } — we re-attach the `code`
    // from the path so the response envelope is self-contained (client
    // doesn't need to remember which code it posted).
    const rawRewards = (raw.rewards ?? {}) as Record<string, unknown>;
    const rewards: ClaimRewardsAll = {
      inviteeXpAwarded:
        typeof rawRewards.inviteeXpAwarded === 'number'
          ? rawRewards.inviteeXpAwarded
          : null,
      inviteeNewBadges: Array.isArray(rawRewards.inviteeNewBadges)
        ? (rawRewards.inviteeNewBadges as ClaimRewardBadge[])
        : [],
      inviterXpAwarded:
        typeof rawRewards.inviterXpAwarded === 'number'
          ? rawRewards.inviterXpAwarded
          : null,
      inviterNewBadges: Array.isArray(rawRewards.inviterNewBadges)
        ? (rawRewards.inviterNewBadges as ClaimRewardBadge[])
        : [],
      inviterUserId:
        typeof rawRewards.inviterUserId === 'string'
          ? rawRewards.inviterUserId
          : '',
      miaMilestoneAdvanced: Boolean(rawRewards.miaMilestoneAdvanced),
      // Slice 4: defaults to false so a slice-3-era RPC (no followPending in
      // the JSON) doesn't flip the mobile toast copy on public-sharer claims.
      followPending: Boolean(rawRewards.followPending),
    };

    return {
      status: 'ok',
      data: {
        code,
        routePayload: (raw.routePayload ?? {}) as Record<string, unknown>,
        sharerDisplayName:
          (raw.sharerDisplayName as string | null | undefined) ?? null,
        sharerAvatarUrl:
          (raw.sharerAvatarUrl as string | null | undefined) ?? null,
        alreadyClaimed: Boolean(raw.alreadyClaimed),
        rewards,
      },
    };
  };

  return { createShare, getPublicShare, claimShare };
};
