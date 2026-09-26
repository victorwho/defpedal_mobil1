/**
 * Auto-publish service: creates activity_feed entries when events occur.
 *
 * Called from:
 * - Ride completion (POST /v1/rides/:tripId/impact) → ride + hazard_batch
 * - Hazard reporting (POST /v1/hazards) → hazard_standalone (armchair/manual only)
 * - Badge award (check_and_award_badges result processing) → badge_unlock
 * - XP award (award_ride_xp result processing) → tier_up
 */

import { SHARE_TRIM_METERS, trimPolylineEndpoints } from '@defensivepedal/core';

import { parseGeographyPoint } from './nudges/userLocation';
import { supabaseAdmin } from './supabaseAdmin';
import { captureServerException } from './sentry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AutoPublishRideParams {
  readonly userId: string;
  readonly tripId: string | null;
  readonly title: string;
  readonly startLocationText: string;
  readonly destinationText: string;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly elevationGainMeters: number | null;
  readonly averageSpeedMps: number | null;
  readonly safetyRating: number | null;
  readonly safetyTags: readonly string[];
  readonly geometryPolyline6: string;
  readonly note: string | null;
  readonly co2SavedKg: number | null;
  readonly startLat: number;
  readonly startLon: number;
}

interface AutoPublishHazardBatchParams {
  readonly userId: string;
  readonly rideActivityId: string | null;
  readonly hazards: readonly {
    readonly hazardType: string;
    readonly lat: number;
    readonly lon: number;
    readonly reportedAt: string;
  }[];
  readonly startLat: number;
  readonly startLon: number;
}

interface AutoPublishHazardStandaloneParams {
  readonly userId: string;
  readonly hazardType: string;
  readonly lat: number;
  readonly lon: number;
  readonly reportedAt: string;
}

interface AutoPublishBadgeParams {
  readonly userId: string;
  readonly badgeKey: string;
  readonly badgeName: string;
  readonly iconKey: string;
  readonly category: string;
  readonly flavorText: string;
}

interface AutoPublishTierUpParams {
  readonly userId: string;
  readonly tierName: string;
  readonly tierLevel: number;
  readonly tierDisplayName: string;
  readonly tierColor: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toPointWkt = (lat: number, lon: number) => `POINT(${lon} ${lat})`;

/**
 * WKT for a real coordinate, or null for the 0/0 sentinel / non-finite
 * input. POINT(0 0) ("Null Island") is never a real ride start — it was
 * the artifact of reading a WKB-hex geography as an object (error-log
 * #70) and polluted 112 ride + 165 badge rows before 2026-07-19. A NULL
 * location keeps the item follower-only rather than mislocating it.
 */
const toPointWktOrNull = (lat: number, lon: number): string | null => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 && lon === 0) return null;
  return toPointWkt(lat, lon);
};

const getUserProfile = async (userId: string) => {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('auto_share_rides, trim_route_endpoints, is_private')
    .eq('id', userId)
    .single();

  // Returning null stays correct on failure -- every caller reads
  // `!profile?.auto_share_rides` and declines to publish, and publishing for
  // someone who may have opted OUT is the one outcome that must never happen.
  // What was wrong is that it was SILENT: a DB/RLS failure was indistinguishable
  // from "opted out", so rides simply never appeared in the feed with nothing
  // recorded anywhere. Every caller is fire-and-forget behind a `catch {}`, and
  // nothing here returns a 5xx, so GCP's alert policy cannot see it either --
  // Sentry is the only seam that can, which is what the first-seen-issue rule
  // exists for. PGRST116 (no profile row) is a different, non-transient problem
  // and is reported too, but not as a transport error.
  // See docs/plans/external-review-triage-2026-09-25.md P1-6.
  if (error) {
    captureServerException(error, {
      source: 'autoPublish.getUserProfile',
      userId,
      consequence: 'ride not auto-published (treated as opted out)',
    });
    return null;
  }

  return data as { auto_share_rides: boolean; trim_route_endpoints: boolean; is_private: boolean } | null;
};

const countAcceptedFollowers = async (userId: string): Promise<number> => {
  if (!supabaseAdmin) return 0;
  const { count } = await supabaseAdmin
    .from('user_follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', userId)
    .eq('status', 'accepted');
  return count ?? 0;
};

/**
 * Location to stamp on badge_unlock / tier_up rows so get_ranked_feed can
 * show them to NEARBY riders, not just followers (feed densification,
 * 2026-07-19). Privacy: only when the user's sharing toggle is on — a
 * location-NULL row stays follower-only in the ranked feed.
 *
 * The value is the user's latest located ride activity, echoed verbatim
 * (PostgREST returns geography as WKB hex — see error-log #70 — which
 * PostGIS accepts back as input, so no parsing is needed). Used only for
 * spatial filtering; never rendered.
 */
const getShareableLocation = async (userId: string): Promise<string | null> => {
  if (!supabaseAdmin) return null;
  const profile = await getUserProfile(userId);
  if (!profile?.auto_share_rides) return null;

  const { data } = await supabaseAdmin
    .from('activity_feed')
    .select('location')
    .eq('user_id', userId)
    .eq('type', 'ride')
    .not('location', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const location = (data as { location: string } | null)?.location ?? null;
  if (!location) return null;

  // Belt-and-suspenders vs the Null Island artifact (see toPointWktOrNull):
  // never propagate a 0/0 or unparseable location onto badge/tier rows.
  const parsed = parseGeographyPoint(location);
  if (!parsed || (parsed.lat === 0 && parsed.lon === 0)) return null;

  return location;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Auto-publish a completed ride to the activity feed.
 * Respects auto_share_rides, trim_route_endpoints, and private profile settings.
 * Returns the activity_feed ID if published, null if skipped.
 */
export const autoPublishRide = async (params: AutoPublishRideParams): Promise<string | null> => {
  if (!supabaseAdmin) return null;

  // One ride, one feed card.
  //
  // ⚠️ This was a plain INSERT keyed by nothing, and the triage plan ranked it
  // "plausible but not demonstrated in production". It was demonstrated:
  // measured 2026-09-26, 21 duplicate (user_id, tripId) groups holding 141
  // EXCESS cards against 396 ride cards in total — 36% of the feed was
  // duplicates. Two distinct patterns, and this check covers both: fast retries
  // (spans of 0.2-5 s) and much later re-posts (spans of hours to days, which no
  // transport-level retry explains). One account alone held 116 copies of a
  // single ride, 82% of the excess.
  //
  // ⚠️ This NARROWS the window rather than closing it — two genuinely
  // concurrent publishes can still both miss, and the 0.2 s pair suggests
  // near-simultaneous delivery does happen. The airtight fix is a unique index
  // on (user_id, (payload->>'tripId')) WHERE type = 'ride', which cannot be
  // created until the 141 existing duplicates are removed; that deletes
  // rider-visible cards and cascades their reactions, so it is a decision to
  // take deliberately rather than a side effect of this repair.
  // Guarded on a non-null tripId: the field is nullable on this type, and
  // `.eq(..., null)` would compare against the literal string rather than mean
  // "no trip". A card with no tripId is not identifiable, so it cannot be
  // deduplicated and must not be suppressed by a bad match either.
  if (params.tripId) {
    const { data: existing } = await supabaseAdmin
      .from('activity_feed')
      .select('id')
      .eq('user_id', params.userId)
      .eq('type', 'ride')
      .eq('payload->>tripId', params.tripId)
      .limit(1)
      .maybeSingle();

    if (existing) return (existing as { id: string }).id;
  }

  const profile = await getUserProfile(params.userId);
  if (!profile) return null;

  // Skip if user opted out of auto-publish
  if (!profile.auto_share_rides) return null;

  // Skip if private and no followers (no audience)
  if (profile.is_private) {
    const followers = await countAcceptedFollowers(params.userId);
    if (followers === 0) return null;
  }

  // Apply endpoint trimming if enabled
  const polyline = profile.trim_route_endpoints
    ? trimPolylineEndpoints(params.geometryPolyline6, SHARE_TRIM_METERS)
    : params.geometryPolyline6;

  const payload = {
    title: params.title,
    startLocationText: params.startLocationText,
    destinationText: params.destinationText,
    distanceMeters: params.distanceMeters,
    durationSeconds: params.durationSeconds,
    elevationGainMeters: params.elevationGainMeters,
    averageSpeedMps: params.averageSpeedMps,
    safetyRating: params.safetyRating,
    safetyTags: [...params.safetyTags],
    geometryPolyline6: polyline,
    note: params.note,
    tripId: params.tripId,
    co2SavedKg: params.co2SavedKg,
  };

  const { data, error } = await supabaseAdmin
    .from('activity_feed')
    .insert({
      user_id: params.userId,
      type: 'ride',
      payload,
      location: toPointWktOrNull(params.startLat, params.startLon),
    })
    .select('id')
    .single();

  if (error) {
    // Non-fatal — log but don't throw
    return null;
  }

  return (data as { id: string }).id;
};

/**
 * Auto-publish a batch of in-ride hazard reports.
 * Only called when hazards.length > 0.
 */
export const autoPublishHazardBatch = async (params: AutoPublishHazardBatchParams): Promise<string | null> => {
  if (!supabaseAdmin || params.hazards.length === 0) return null;

  const payload = {
    rideActivityId: params.rideActivityId,
    hazards: params.hazards.map((h) => ({
      hazardType: h.hazardType,
      lat: h.lat,
      lon: h.lon,
      reportedAt: h.reportedAt,
    })),
  };

  const { data, error } = await supabaseAdmin
    .from('activity_feed')
    .insert({
      user_id: params.userId,
      type: 'hazard_batch',
      payload,
      location: toPointWktOrNull(params.startLat, params.startLon),
    })
    .select('id')
    .single();

  if (error) return null;
  return (data as { id: string }).id;
};

/**
 * Auto-publish a standalone hazard report (armchair or manual, not during a ride).
 */
export const autoPublishHazardStandalone = async (params: AutoPublishHazardStandaloneParams): Promise<string | null> => {
  if (!supabaseAdmin) return null;

  const payload = {
    hazardType: params.hazardType,
    lat: params.lat,
    lon: params.lon,
    reportedAt: params.reportedAt,
  };

  const { data, error } = await supabaseAdmin
    .from('activity_feed')
    .insert({
      user_id: params.userId,
      type: 'hazard_standalone',
      payload,
      location: toPointWktOrNull(params.lat, params.lon),
    })
    .select('id')
    .single();

  if (error) return null;
  return (data as { id: string }).id;
};

/**
 * Auto-publish a badge unlock announcement.
 */
export const autoPublishBadgeUnlock = async (params: AutoPublishBadgeParams): Promise<string | null> => {
  if (!supabaseAdmin) return null;

  const payload = {
    badgeKey: params.badgeKey,
    badgeName: params.badgeName,
    iconKey: params.iconKey,
    category: params.category,
    flavorText: params.flavorText,
  };

  // Stamped only when auto_share_rides is on (null = follower-only).
  const location = await getShareableLocation(params.userId);

  const { data, error } = await supabaseAdmin
    .from('activity_feed')
    .insert({
      user_id: params.userId,
      type: 'badge_unlock',
      payload,
      location,
    })
    .select('id')
    .single();

  if (error) return null;
  return (data as { id: string }).id;
};

/**
 * Auto-publish a tier promotion announcement.
 */
export const autoPublishTierUp = async (params: AutoPublishTierUpParams): Promise<string | null> => {
  if (!supabaseAdmin) return null;

  const payload = {
    tierName: params.tierName,
    tierLevel: params.tierLevel,
    tierDisplayName: params.tierDisplayName,
    tierColor: params.tierColor,
  };

  // Stamped only when auto_share_rides is on (null = follower-only).
  const location = await getShareableLocation(params.userId);

  const { data, error } = await supabaseAdmin
    .from('activity_feed')
    .insert({
      user_id: params.userId,
      type: 'tier_up',
      payload,
      location,
    })
    .select('id')
    .single();

  if (error) return null;
  return (data as { id: string }).id;
};
