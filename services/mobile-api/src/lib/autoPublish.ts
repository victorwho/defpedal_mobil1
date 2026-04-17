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
      location: toPointWkt(params.startLat, params.startLon),
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
      location: toPointWkt(params.startLat, params.startLon),
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
      location: toPointWkt(params.lat, params.lon),
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

  const { data, error } = await supabaseAdmin
    .from('activity_feed')
    .insert({
      user_id: params.userId,
      type: 'badge_unlock',
      payload,
      // No location for badge unlocks
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

  const { data, error } = await supabaseAdmin
    .from('activity_feed')
    .insert({
      user_id: params.userId,
      type: 'tier_up',
      payload,
      // No location for tier promotions
    })
    .select('id')
    .single();

  if (error) return null;
  return (data as { id: string }).id;
};
