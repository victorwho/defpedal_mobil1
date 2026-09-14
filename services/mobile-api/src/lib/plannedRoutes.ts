/**
 * First-party recording of "a rider planned a route".
 *
 * Why this exists: `trips` is written at trip_start and `trip_shares` only when
 * a rider shares, so the widest signal of intent the app produces — planning a
 * route at all — was recorded nowhere. City Heartbeat could show 480 shared and
 * 1,419 started, and had no answer for planned.
 *
 * ⚠️ PRIVACY. This is ride data (Privacy Policy: "Ride data: planned routes"),
 * NOT the minimal-by-construction `user_telemetry_events` — mixing location
 * into that table was explicitly ruled out (lib/deviceTelemetry.ts). It stays
 * defensible by being minimised at the source: the ORIGIN is stored and the
 * DESTINATION is not. The heartbeat needs a coordinate only to answer "is this
 * near the viewer", which the origin satisfies; the destination is the more
 * revealing half — where a person intended to go, including places they never
 * went — and it buys nothing. Do not add it, the geometry, or search text
 * without a Privacy Policy change in the same commit.
 */
import { supabaseAdmin } from './supabaseAdmin';

/**
 * Window inside which an identical `dedupeKey` from the same user counts as the
 * SAME plan rather than a new one.
 *
 * This is the number's credibility, not an optimisation. The route-preview
 * screen refetches whenever the rider cycles Safe/Fast/Flat — the query key
 * includes `mode` and `avoidHills` — so a rider comparing all three modes on
 * one destination fires three previews. Counting those as three planned routes
 * would inflate the figure by whatever fraction of riders happen to fiddle with
 * the toggle, which is exactly the kind of number that cannot be defended.
 *
 * One hour: long enough to absorb a rider returning to the same preview after
 * walking away from their phone, short enough that genuinely re-planning the
 * same commute the next morning counts again (it is a real second intent).
 */
export const PLAN_DEDUPE_WINDOW_MS = 60 * 60 * 1000;

/** Routing modes the endpoint will store. Free text is rejected at the edge. */
export const ACCEPTED_PLAN_MODES = ['safe', 'fast', 'flat', 'loop', 'course'] as const;
export type PlannedRouteMode = (typeof ACCEPTED_PLAN_MODES)[number];

export type PlannedRouteWrite = {
  readonly lat: number;
  readonly lon: number;
  readonly routingMode?: PlannedRouteMode | null;
  readonly distanceMeters?: number | null;
  /** Device-hashed plan key (16 hex chars). Compared for equality only. */
  readonly dedupeKey?: string | null;
};

export type PlannedRouteResult = {
  readonly recorded: boolean;
  /** True when an identical plan was already recorded inside the window. */
  readonly deduped: boolean;
};

/** PostGIS point literal. Longitude first — the classic ordering bug. */
const toPointWkt = (lat: number, lon: number): string => `SRID=4326;POINT(${lon} ${lat})`;

/**
 * Record one planned route.
 *
 * Dedupe is enforced HERE rather than trusted from the client. The client does
 * throttle (see apps/mobile/src/lib/routePlanTelemetry.ts), but a client-side
 * guard is lost on every app restart and absent entirely on an older build, and
 * this number's whole value is that it can be quoted. One extra read on a
 * fire-and-forget path is a cheap price for a count nobody has to caveat.
 *
 * Never throws. A rider planning a route did not ask us to record it, so a
 * failure must never surface to them; the caller fires this and ignores it.
 */
export const recordPlannedRoute = async (
  write: PlannedRouteWrite,
  userId: string,
  now: Date = new Date(),
): Promise<PlannedRouteResult> => {
  if (!supabaseAdmin) return { recorded: false, deduped: false };

  try {
    if (write.dedupeKey) {
      const since = new Date(now.getTime() - PLAN_DEDUPE_WINDOW_MS).toISOString();
      const { data: existing, error: lookupError } = await supabaseAdmin
        .from('planned_routes')
        .select('id')
        .eq('user_id', userId)
        .eq('dedupe_key', write.dedupeKey)
        .gte('created_at', since)
        .limit(1);

      // A failed lookup must not silently become a duplicate row: if we cannot
      // prove this is new, we do not write it. Under-counting is recoverable;
      // an inflated count is the failure mode this table cannot have.
      if (lookupError) return { recorded: false, deduped: false };
      if (existing && existing.length > 0) return { recorded: false, deduped: true };
    }

    const { error } = await supabaseAdmin.from('planned_routes').insert([
      {
        user_id: userId,
        start_location: toPointWkt(write.lat, write.lon),
        routing_mode: write.routingMode ?? null,
        distance_meters: write.distanceMeters ?? null,
        dedupe_key: write.dedupeKey ?? null,
        // created_at takes the column default — server time. A device clock
        // wrong by hours would otherwise move a plan across a day boundary and
        // corrupt the per-day counts this table exists to produce.
      },
    ]);

    return { recorded: !error, deduped: false };
  } catch {
    return { recorded: false, deduped: false };
  }
};
