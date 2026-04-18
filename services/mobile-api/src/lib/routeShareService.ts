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
};

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

  const createShare: RouteShareService['createShare'] = async ({ userId, request }) => {
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

    const { data, error } = await supabase
      .from('route_shares')
      .insert({
        user_id: userId,
        source: request.source,
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

  return { createShare, getPublicShare };
};
