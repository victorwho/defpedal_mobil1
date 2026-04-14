import type { FeedItem, SafetyTag } from '@defensivepedal/core';
import { calculateCo2SavedKg } from '@defensivepedal/core';

import { requireAuthenticatedUser } from '../lib/auth';
import type { MobileApiDependencies } from '../lib/dependencies';
import { HttpError } from '../lib/http';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export const requireUser = (
  request: Parameters<typeof requireAuthenticatedUser>[0],
  dependencies: MobileApiDependencies,
) => requireAuthenticatedUser(request, dependencies.authenticateUser);

export const ensureSupabase = () => {
  if (!supabaseAdmin) {
    throw new HttpError('Database unavailable.', {
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    });
  }
  return supabaseAdmin;
};

export const toPointWkt = (lat: number, lon: number) => `POINT(${lon} ${lat})`;

export type ChampionLookup = ReadonlyMap<string, string>;

export const mapFeedRow = (
  row: Record<string, unknown>,
  userId: string,
  championLookup: ChampionLookup = new Map(),
): FeedItem => {
  const profile = row.profiles as Record<string, unknown> | null;
  const username = profile?.username as string | null;
  const rowUserId = row.user_id as string;
  const rawChampionMetric = championLookup.get(rowUserId) ?? null;
  const championMetric = (rawChampionMetric === 'co2' || rawChampionMetric === 'hazards')
    ? rawChampionMetric
    : null;
  return {
    id: row.id as string,
    user: {
      id: rowUserId,
      displayName: username ? `@${username}` : (profile?.display_name as string) ?? 'Rider',
      avatarUrl: (profile?.avatar_url as string) ?? null,
      riderTier: (profile?.rider_tier as import('@defensivepedal/core').RiderTierName | undefined) ?? undefined,
    },
    title: (row.title as string) ?? '',
    startLocationText: (row.start_location_text as string) ?? '',
    destinationText: (row.destination_text as string) ?? '',
    distanceMeters: Number(row.distance_meters) || 0,
    durationSeconds: Number(row.duration_seconds) || 0,
    elevationGainMeters: row.elevation_gain_meters != null ? Number(row.elevation_gain_meters) : null,
    averageSpeedMps: row.average_speed_mps != null ? Number(row.average_speed_mps) : null,
    safetyRating: row.safety_rating != null ? Number(row.safety_rating) : null,
    safetyTags: (row.safety_tags as SafetyTag[]) ?? [],
    geometryPolyline6: row.geometry_polyline6 as string,
    note: (row.note as string) ?? null,
    sharedAt: row.shared_at as string,
    likeCount: Number(row.like_count ?? 0),
    loveCount: Number(row.love_count ?? 0),
    co2SavedKg: calculateCo2SavedKg(Number(row.distance_meters) || 0),
    commentCount: Number(row.comment_count ?? 0),
    likedByMe: Boolean(row.liked_by_me),
    lovedByMe: Boolean(row.loved_by_me ?? false),
    isWeeklyChampion: championMetric !== null,
    championMetric,
  };
};
