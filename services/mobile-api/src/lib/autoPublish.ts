/**
 * Auto-publish service: creates activity_feed entries when events occur.
 *
 * Called from:
 * - Ride completion (POST /v1/rides/:tripId/impact) → ride + hazard_batch
 * - Hazard reporting (POST /v1/hazards) → hazard_standalone (armchair/manual only)
 * - Badge award (check_and_award_badges result processing) → badge_unlock
 * - XP award (award_ride_xp result processing) → tier_up
 */

import { trimPolylineEndpoints } from '@defensivepedal/core';

import { parseGeographyPoint } from './nudges/userLocation';
import { supabaseAdmin } from './supabaseAdmin';

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
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('auto_share_rides, trim_route_endpoints, is_private')
    .eq('id', userId)
    .single();
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
    ? trimPolylineEndpoints(params.geometryPolyline6, 200)
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
