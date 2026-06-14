import type {
  ActivityFeedResponse,
  AutocompleteRequest,
  AutocompleteResponse,
  BadgeResponse,
  CityHeartbeat,
  CitySuggestionRequest,
  CitySuggestionResponse,
  CommunityStats,
  Coordinate,
  CoverageResponse,
  ErrorResponse,
  FeedComment,
  FeedCommentRequest,
  FeedResponse,
  FollowRequest,
  HazardReportRequest,
  HazardReportResponse,
  HazardValidationResponse,
  HazardVoteDirection,
  HazardVoteResponse,
  ImpactDashboard,
  LeaderboardMetric,
  LeaderboardPeriod,
  LeaderboardResponse,
  NavigationFeedbackRequest,
  NearbyCitySuggestion,
  NearbyHazard,
  NeighborhoodSafetyScore,
  ProfileResponse,
  ProfileUpdateRequest,
  QuizAnswer,
  QuizCountry,
  QuizQuestion,
  ReverseGeocodeRequest,
  ReverseGeocodeResponse,
  RideImpact,
  RideRecentDestination,
  SavedRoute,
  SavedRouteCreateRequest,
  ShareTripRequest,
  SuggestedUser,
  UserPublicProfile,
  TiersResponse,
  RerouteRequest,
  RouteShareClaimInviteeRewards,
  TripEndRequest,
  TripEndResponse,
  TripHistoryItem,
  TripStartRequest,
  TripStartResponse,
  TripTrackRequest,
  TripStatsDashboard,
  UserStats,
  RoutePreviewRequest,
  RoutePreviewResponse,
  WriteAckResponse,
} from '@defensivepedal/core';

import { ApiClientError } from './apiFetch';
import { mobileApiFetch } from './mobileApiFetch';
import { getMutationTimeoutMs } from './offlineSyncHelpers';
import {
  ActivityFeedResponseSchema,
  FeedResponseSchema,
  LeaderboardResponseSchema,
  TiersResponseSchema,
} from './schemas/apiResponses';
import { validateResponse } from './schemas/responseValidation';
import {
  mapboxAutocomplete,
  mapboxReverseGeocode,
  mapboxGetCoverage,
  reverseGeocodeLocality,
} from './mapbox-search';
import {
  directPreviewRoute,
  directReroute,
} from './mapbox-routing';

export const mobileApi = {
  getCoverage: (lat: number, lon: number, countryHint?: string) =>
    mapboxGetCoverage(lat, lon, countryHint),
  previewRoute: (payload: RoutePreviewRequest) =>
    directPreviewRoute(payload),
  reroute: (payload: RerouteRequest) =>
    directReroute(payload),
  autocomplete: (payload: AutocompleteRequest) =>
    mapboxAutocomplete(payload),
  reverseGeocode: (payload: ReverseGeocodeRequest) =>
    mapboxReverseGeocode(payload),
  reportHazard: (payload: HazardReportRequest) =>
    mobileApiFetch<HazardReportResponse>('/v1/hazards', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  // Trip mutations carry their per-type sync timeout (30s) so the underlying
  // apiFetch AbortController survives Cloud Run cold starts (15-25s). Without
  // this, apiFetch's 8s default re-introduces MOBILE-7 regardless of the
  // outer withMutationTimeout ceiling in OfflineMutationSyncManager.
  startTrip: (payload: TripStartRequest) =>
    mobileApiFetch<TripStartResponse>('/v1/trips/start', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: getMutationTimeoutMs('trip_start'),
    }),
  endTrip: (payload: TripEndRequest) =>
    mobileApiFetch<TripEndResponse>('/v1/trips/end', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: getMutationTimeoutMs('trip_end'),
    }),
  getTripHistory: () =>
    mobileApiFetch<TripHistoryItem[]>('/v1/trips/history'),
  deleteTrip: (tripId: string) =>
    mobileApiFetch<{ deletedAt: string }>(`/v1/trips/${encodeURIComponent(tripId)}`, {
      method: 'DELETE',
    }),
  getUserStats: () =>
    mobileApiFetch<UserStats>('/v1/stats'),
  getStatsDashboard: (tz?: string) =>
    mobileApiFetch<TripStatsDashboard>(`/v1/stats/dashboard${tz ? `?tz=${tz}` : ''}`),
  saveTripTrack: (payload: TripTrackRequest) =>
    mobileApiFetch<WriteAckResponse>('/v1/trips/track', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: getMutationTimeoutMs('trip_track'),
    }),
  // Pedal Nudge tap telemetry (review 2026-06-12 item 23): the funnel was
  // dead end-to-end — no nudgeLogId in the push payload and no mobile caller.
  // Now the dispatcher stamps nudgeLogId into the push data and the tap
  // handler reports 'tapped' here so the attribution sweep can close the loop.
  postNudgeTelemetry: (nudgeLogId: string, event: 'tapped' | 'action_completed') =>
    mobileApiFetch<{ ok: boolean }>('/v1/nudges/telemetry', {
      method: 'POST',
      body: JSON.stringify({ nudgeLogId, event }),
    }),
  submitFeedback: (payload: NavigationFeedbackRequest) =>
    mobileApiFetch<WriteAckResponse>('/v1/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ── Account ──

  // Re-parents an anonymous account's data onto the caller's (new) account.
  // Authenticated as the new account; the anonymous access token proves
  // ownership of the source. Server only merges into a fresh target.
  mergeAnonymousAccount: (anonymousAccessToken: string) =>
    mobileApiFetch<{ merged: boolean; reason?: string }>('/v1/account/merge-anonymous', {
      method: 'POST',
      body: JSON.stringify({ anonymousAccessToken }),
    }),

  // ── Hazard Alerts ──

  getNearbyHazards: (lat: number, lon: number, radiusMeters = 1000) =>
    mobileApiFetch<{ hazards: NearbyHazard[] }>(
      `/v1/hazards/nearby?lat=${lat}&lon=${lon}&radiusMeters=${radiusMeters}`,
    ).then((res) => res.hazards),

  validateHazard: (hazardId: string, response: HazardValidationResponse) =>
    mobileApiFetch<WriteAckResponse>(`/v1/hazards/${hazardId}/validate`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    }),

  voteHazard: (
    hazardId: string,
    direction: HazardVoteDirection,
    clientSubmittedAt?: string,
  ) =>
    mobileApiFetch<HazardVoteResponse>(`/v1/hazards/${hazardId}/vote`, {
      method: 'POST',
      body: JSON.stringify({
        direction,
        ...(clientSubmittedAt ? { clientSubmittedAt } : {}),
      }),
    }),

  // ── City Suggestions ──

  submitCitySuggestion: (payload: CitySuggestionRequest) =>
    mobileApiFetch<CitySuggestionResponse>('/v1/city-suggestions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getNearbyCitySuggestions: (lat: number, lon: number, radiusMeters = 1000) =>
    mobileApiFetch<NearbyCitySuggestion[]>(
      `/v1/city-suggestions/nearby?lat=${lat}&lon=${lon}&radius=${radiusMeters}`,
    ),

  // ── Community Feed ──

  getFeed: (lat: number, lon: number, cursor?: string, limit?: number) => {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', String(limit));
    return mobileApiFetch<FeedResponse>(`/v1/feed?${params.toString()}`).then((data) =>
      validateResponse<FeedResponse>(FeedResponseSchema, data, '/v1/feed'),
    );
  },
  shareTripToFeed: (payload: ShareTripRequest) =>
    mobileApiFetch<{ id: string; sharedAt: string }>('/v1/feed/share', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  likeFeedItem: (tripShareId: string) =>
    mobileApiFetch<WriteAckResponse>(`/v1/feed/${tripShareId}/like`, {
      method: 'POST',
    }),
  unlikeFeedItem: (tripShareId: string) =>
    mobileApiFetch<WriteAckResponse>(`/v1/feed/${tripShareId}/like`, {
      method: 'DELETE',
    }),
  loveFeedItem: (tripShareId: string) =>
    mobileApiFetch<WriteAckResponse>(`/v1/feed/${tripShareId}/love`, {
      method: 'POST',
    }),
  unloveFeedItem: (tripShareId: string) =>
    mobileApiFetch<WriteAckResponse>(`/v1/feed/${tripShareId}/love`, {
      method: 'DELETE',
    }),
  getFeedComments: (tripShareId: string) =>
    mobileApiFetch<{ comments: FeedComment[] }>(`/v1/feed/${tripShareId}/comments`),
  postFeedComment: (tripShareId: string, payload: FeedCommentRequest) =>
    mobileApiFetch<WriteAckResponse>(`/v1/feed/${tripShareId}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getProfile: () =>
    mobileApiFetch<ProfileResponse>('/v1/profile'),
  updateProfile: (payload: ProfileUpdateRequest) =>
    mobileApiFetch<ProfileResponse>('/v1/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  // Irreversible account deletion. Body must contain { confirmation: 'DELETE' }
  // (verbatim) so accidental calls are rejected with 400.
  deleteAccount: () =>
    mobileApiFetch<{ deletedAt: string }>('/v1/profile', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation: 'DELETE' }),
    }),

  // ── UGC moderation (compliance plan item 7) ─────────────────────────────
  reportContent: (payload: {
    targetType: 'comment' | 'hazard' | 'trip_share' | 'profile';
    targetId: string;
    reason: 'spam' | 'harassment' | 'hate' | 'sexual' | 'violence' | 'illegal' | 'other';
    details?: string;
  }) =>
    mobileApiFetch<{ acceptedAt: string }>('/v1/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  blockUser: (userId: string) =>
    mobileApiFetch<{ acceptedAt: string }>(`/v1/users/${userId}/block`, {
      method: 'POST',
    }),
  unblockUser: (userId: string) =>
    mobileApiFetch<{ acceptedAt: string }>(`/v1/users/${userId}/block`, {
      method: 'DELETE',
    }),
  getBlockedUsers: () =>
    mobileApiFetch<{
      blocked: Array<{
        userId: string;
        displayName: string;
        username: string | null;
        avatarUrl: string | null;
        blockedAt: string;
      }>;
    }>('/v1/users/blocked'),

  // Push notifications
  registerPushToken: (expoPushToken: string, deviceId: string, platform: string) =>
    mobileApiFetch<WriteAckResponse>('/v1/push-token', {
      method: 'PUT',
      body: JSON.stringify({ expoPushToken, deviceId, platform }),
    }),
  unregisterPushToken: (deviceId: string) =>
    mobileApiFetch<WriteAckResponse>('/v1/push-token', {
      method: 'DELETE',
      body: JSON.stringify({ deviceId }),
    }),

  // ── Recent Destinations (from rides) ──

  getRecentDestinations: () =>
    mobileApiFetch<{ destinations: RideRecentDestination[] }>('/v1/recent-destinations')
      .then((res) => res.destinations),

  // ── Community Stats ──

  getCommunityStats: (lat: number, lon: number, radiusKm = 15) => {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      radiusKm: String(radiusKm),
    });
    return mobileApiFetch<CommunityStats>(`/v1/community/stats?${params.toString()}`);
  },

  reverseGeocodeLocality: (lat: number, lon: number) =>
    reverseGeocodeLocality(lat, lon),

  getCityHeartbeat: (lat: number, lon: number, radiusKm = 15, days = 7) => {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      radiusKm: String(radiusKm),
      days: String(days),
    });
    return mobileApiFetch<CityHeartbeat>(`/v1/community/heartbeat?${params.toString()}`);
  },

  // ── Habit Engine ──

  fetchLoopRoute: (origin: Coordinate, distanceMeters: number, safetyFloor?: number) =>
    mobileApiFetch<RoutePreviewResponse>('/v1/loop-route', {
      method: 'POST',
      body: JSON.stringify({
        origin,
        distancePreferenceMeters: distanceMeters,
        ...(safetyFloor != null ? { safetyFloor } : {}),
      }),
    }),

  fetchSafetyScore: (lat: number, lon: number, radiusKm?: number) => {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (radiusKm != null) params.set('radiusKm', String(radiusKm));
    return mobileApiFetch<NeighborhoodSafetyScore>(`/v1/safety-score?${params.toString()}`);
  },

  fetchRiskMap: async (lat: number, lon: number, radiusKm?: number): Promise<GeoJSON.FeatureCollection> => {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (radiusKm != null) params.set('radiusKm', String(radiusKm));
    try {
      return await mobileApiFetch<GeoJSON.FeatureCollection>(`/v1/risk-map?${params.toString()}`);
    } catch {
      return { type: 'FeatureCollection', features: [] };
    }
  },

  recordRideImpact: (
    tripId: string,
    distanceMeters: number,
    meta?: {
      elevationGainM?: number;
      weatherCondition?: string;
      windSpeedKmh?: number;
      temperatureC?: number;
      aqiLevel?: string;
      rideStartHour?: number;
      durationMinutes?: number;
      routeType?: 'safe' | 'fast';
      hadDestination?: boolean;
    },
  ) =>
    mobileApiFetch<RideImpact>(`/v1/rides/${tripId}/impact`, {
      method: 'POST',
      body: JSON.stringify({ distanceMeters, ...meta }),
    }),

  fetchRideImpact: (tripId: string) =>
    mobileApiFetch<RideImpact>(`/v1/rides/${tripId}/impact`),

  fetchElevationProfile: (coordinates: ReadonlyArray<[number, number]>) =>
    mobileApiFetch<{ elevationProfile: number[]; elevationGain: number; elevationLoss: number }>(
      '/v1/elevation-profile',
      {
        method: 'POST',
        body: JSON.stringify({ coordinates }),
      },
    ),

  fetchBadges: () =>
    mobileApiFetch<BadgeResponse>('/v1/badges'),

  fetchTiers: () =>
    mobileApiFetch<TiersResponse>('/v1/tiers').then((data) =>
      validateResponse<TiersResponse>(TiersResponseSchema, data, '/v1/tiers'),
    ),

  fetchImpactDashboard: (timeZone?: string) => {
    const params = timeZone ? `?tz=${encodeURIComponent(timeZone)}` : '';
    return mobileApiFetch<ImpactDashboard>(`/v1/impact-dashboard${params}`);
  },

  fetchDailyQuiz: (country: QuizCountry, locale: 'en' | 'ro' | 'es' = 'en') =>
    mobileApiFetch<QuizQuestion>(`/v1/quiz/daily?country=${country}&locale=${locale}`),

  submitQuizAnswer: (
    questionId: string,
    selectedIndex: number,
    country: QuizCountry,
    locale: 'en' | 'ro' | 'es' = 'en',
  ) =>
    mobileApiFetch<QuizAnswer>('/v1/quiz/answer', {
      method: 'POST',
      body: JSON.stringify({ questionId, selectedIndex, country, locale }),
    }),

  // ── Social ──

  followUser: (userId: string) =>
    mobileApiFetch<{ status: string; actionAt: string }>(`/v1/users/${userId}/follow`, { method: 'POST' }),

  unfollowUser: (userId: string) =>
    mobileApiFetch<{ unfollowedAt: string }>(`/v1/users/${userId}/follow`, { method: 'DELETE' }),

  approveFollowRequest: (userId: string) =>
    mobileApiFetch<{ actionAt: string }>(`/v1/users/${userId}/follow/approve`, { method: 'POST' }),

  declineFollowRequest: (userId: string) =>
    mobileApiFetch<{ actionAt: string }>(`/v1/users/${userId}/follow/decline`, { method: 'POST' }),

  getFollowRequests: () =>
    mobileApiFetch<{ requests: FollowRequest[] }>('/v1/profile/follow-requests'),

  getUserProfile: (userId: string) =>
    mobileApiFetch<UserPublicProfile>(`/v1/users/${userId}/profile`),

  getSuggestedUsers: (lat: number, lon: number, limit?: number) => {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (limit) params.set('limit', String(limit));
    return mobileApiFetch<{ users: SuggestedUser[] }>(`/v1/feed/suggested-users?${params.toString()}`);
  },

  // ── Activity Feed (v2) ──

  getActivityFeed: (lat: number, lon: number, cursorScore?: number, cursorId?: string, limit?: number) => {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (cursorScore != null) params.set('cursorScore', String(cursorScore));
    if (cursorId) params.set('cursorId', cursorId);
    if (limit) params.set('limit', String(limit));
    return mobileApiFetch<ActivityFeedResponse>(`/v1/v2/feed?${params.toString()}`).then(
      (data) =>
        validateResponse<ActivityFeedResponse>(
          ActivityFeedResponseSchema,
          data,
          '/v1/v2/feed',
        ),
    );
  },

  reactToActivity: (activityId: string, type: 'like' | 'love') =>
    mobileApiFetch<WriteAckResponse>(`/v1/v2/feed/${activityId}/react`, {
      method: 'POST',
      body: JSON.stringify({ type }),
    }),

  unreactToActivity: (activityId: string, type: 'like' | 'love') =>
    mobileApiFetch<WriteAckResponse>(`/v1/v2/feed/${activityId}/react/${type}`, {
      method: 'DELETE',
    }),

  getActivityComments: (activityId: string) =>
    mobileApiFetch<{ comments: FeedComment[] }>(`/v1/v2/feed/${activityId}/comments`),

  postActivityComment: (activityId: string, body: string) =>
    mobileApiFetch<WriteAckResponse>(`/v1/v2/feed/${activityId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  // ── Saved Routes ──

  getSavedRoutes: () =>
    mobileApiFetch<{ routes: SavedRoute[] }>('/v1/saved-routes').then((res) => res.routes),

  saveRoute: (payload: SavedRouteCreateRequest) =>
    mobileApiFetch<SavedRoute>('/v1/saved-routes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteSavedRoute: (id: string) =>
    mobileApiFetch<WriteAckResponse>(`/v1/saved-routes/${id}`, {
      method: 'DELETE',
    }),

  useSavedRoute: (id: string) =>
    mobileApiFetch<WriteAckResponse>(`/v1/saved-routes/${id}/use`, {
      method: 'PATCH',
    }),

  // ── Leaderboard ──

  fetchLeaderboard: (
    lat: number,
    lon: number,
    metric: LeaderboardMetric,
    period: LeaderboardPeriod,
    radiusKm = 15,
  ) => {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      metric,
      period,
      radiusKm: String(radiusKm),
    });
    return mobileApiFetch<LeaderboardResponse>(`/v1/leaderboard?${params.toString()}`).then(
      (data) =>
        validateResponse<LeaderboardResponse>(
          LeaderboardResponseSchema,
          data,
          '/v1/leaderboard',
        ),
    );
  },

  // ── Route Shares (slice 1) ──

  createRouteShare: (payload: RouteShareCreatePayload) =>
    mobileApiFetch<RouteShareCreateResult>('/v1/route-shares', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getPublicRouteShare: (code: string) =>
    mobileApiFetch<PublicRouteShare>(
      `/v1/route-shares/public/${encodeURIComponent(code)}`,
    ),

  // ── Route Share Claim (slice 2) ──
  //
  // Separate from the generic mobileApiFetch helpers because we care about
  // discriminating on HTTP status (404 / 410 / 422) rather than throwing.
  // Returns a `ClaimRouteShareResult` discriminated union that mirrors the
  // server-side `ClaimShareResult`. Internally wraps mobileApiFetch and
  // converts ApiClientError statuses into the discriminated branches.
  claimRouteShare: (code: string): Promise<ClaimRouteShareResult> =>
    claimRouteShareImpl(code),

  // ── Slice 8: My Shares + Revoke ──

  listMyShares: () => mobileApiFetch<MySharesResult>('/v1/route-shares/mine'),

  revokeMyShare: (id: string): Promise<RevokeRouteShareResult> =>
    revokeMyShareImpl(id),
};

// ---------------------------------------------------------------------------
// claimRouteShare — implementation
// ---------------------------------------------------------------------------

export type ClaimRouteShareSuccess = {
  status: 'ok';
  data: RouteShareClaimResponseBody;
};

export type ClaimRouteShareGone = {
  status: 'gone';
  reason: 'expired' | 'revoked';
};

export type ClaimRouteShareResult =
  | ClaimRouteShareSuccess
  | { status: 'not_found' }
  | ClaimRouteShareGone
  | { status: 'invalid'; reason: 'self_referral' }
  | { status: 'auth_required' }
  | { status: 'network_error'; message: string };

export type RouteShareClaimResponseBody = {
  code: string;
  routePayload: PublicRouteShare['route'];
  sharerDisplayName: string | null;
  sharerAvatarUrl: string | null;
  alreadyClaimed: boolean;
  rewards: RouteShareClaimInviteeRewards;
};

const claimRouteShareImpl = async (
  code: string,
): Promise<ClaimRouteShareResult> => {
  try {
    const body = await mobileApiFetch<RouteShareClaimResponseBody>(
      `/v1/route-shares/${encodeURIComponent(code)}/claim`,
      { method: 'POST' },
    );
    return { status: 'ok', data: body };
  } catch (err) {
    if (!(err instanceof ApiClientError)) {
      return {
        status: 'network_error',
        message: err instanceof Error ? err.message : 'Network error',
      };
    }

    if (err.kind !== 'http' || err.status == null) {
      return { status: 'network_error', message: err.message };
    }

    const status = err.status;
    if (status === 401 || status === 403) return { status: 'auth_required' };
    if (status === 404) return { status: 'not_found' };
    if (status === 410) {
      // Parse the `details: [reason]` emitted by the route handler to
      // distinguish expired vs revoked. Fall back to 'expired' if the detail
      // is missing — the UX message is the same either way ("no longer
      // available"), but analytics benefit from the finer grain.
      let reason: 'expired' | 'revoked' = 'expired';
      try {
        const parsed = JSON.parse(err.body ?? '') as ErrorResponse;
        const detail = parsed.details?.[0];
        if (detail === 'revoked') reason = 'revoked';
        else if (detail === 'expired') reason = 'expired';
      } catch {
        // Keep default `expired` on parse failure.
      }
      return { status: 'gone', reason };
    }
    if (status === 422) return { status: 'invalid', reason: 'self_referral' };

    // 500 / 502 / anything else → surface as network_error so the caller
    // retries with backoff.
    return {
      status: 'network_error',
      message: err.body || `Claim failed with HTTP ${status}`,
    };
  }
};

// ---------------------------------------------------------------------------
// Route-share client types — mirror the API wire format declared in
// services/mobile-api/src/lib/routeShareSchemas.ts
// ---------------------------------------------------------------------------

export type RouteShareRiskCategory =
  | 'very_safe'
  | 'safe'
  | 'moderate'
  | 'dangerous'
  | 'extreme';

export type RouteShareRiskSegment = {
  startIndex: number;
  endIndex: number;
  riskCategory: RouteShareRiskCategory;
};

export type RouteShareRoutePayload = {
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  geometryPolyline6: string;
  distanceMeters: number;
  durationSeconds: number;
  routingMode: 'safe' | 'fast' | 'flat';
  /** Optional per-segment risk data (drives web viewer's safety colors). */
  riskSegments?: RouteShareRiskSegment[];
  /** Optional aggregate 0-100 safety score. Null when unscored. */
  safetyScore?: number | null;
};

// Slice 5a: discriminated union. 'saved' carries a savedRouteId so the API
// can validate ownership + persist source_ref_id for analytics. 'past_ride'
// stays off the client contract until slice 5b lands the server-side
// re-planning path.
//
// Slice 6: optional `hideEndpoints` override. Omitted → server DB default
// (true) wins; false → public viewer sees full polyline with real
// endpoints. Toggled per-share from the route-preview screen.
export type RouteShareCreatePayload = (
  | {
      source: 'planned';
      route: RouteShareRoutePayload;
    }
  | {
      source: 'saved';
      savedRouteId: string;
      route: RouteShareRoutePayload;
    }
) & {
  hideEndpoints?: boolean;
};

export type RouteShareCreateResult = {
  id: string;
  code: string;
  source: 'planned' | 'saved' | 'past_ride';
  appUrl: string;
  webUrl: string;
  createdAt: string;
  expiresAt: string;
};

export type PublicRouteShare = {
  code: string;
  source: 'planned' | 'saved' | 'past_ride';
  sharerDisplayName: string | null;
  sharerAvatarUrl: string | null;
  route: Required<
    Omit<RouteShareRoutePayload, 'riskSegments' | 'safetyScore'>
  > & {
    riskSegments: RouteShareRiskSegment[];
    safetyScore: number | null;
  };
  endpointsHidden: boolean;
  fullLengthMeters: number;
  viewCount: number;
  createdAt: string;
  expiresAt: string | null;
};

// ---------------------------------------------------------------------------
// Slice 8 — My Shares client types (mirror mobile-api wire format)
// ---------------------------------------------------------------------------

export type MyShareRowClient = {
  id: string;
  shortCode: string;
  sourceType: 'planned' | 'saved' | 'past_ride';
  createdAt: string;
  expiresAt: string | null;
  viewCount: number;
  signupCount: number;
  revokedAt: string | null;
};

export type AmbassadorStatsClient = {
  sharesSent: number;
  opens: number;
  signups: number;
  xpEarned: number;
};

export type MySharesResult = {
  shares: MyShareRowClient[];
  ambassadorStats: AmbassadorStatsClient;
};

// ---------------------------------------------------------------------------
// Slice 8 — revokeMyShare
//
// Returns a discriminated union so the hook can tell 204 (ok) from 404
// (not_found) without a throw-on-error dance. 401 surfaces as auth_required
// (consistent with claimRouteShare's shape).
// ---------------------------------------------------------------------------

export type RevokeRouteShareResult =
  | { status: 'ok' }
  | { status: 'not_found' }
  | { status: 'auth_required' }
  | { status: 'network_error'; message: string };

const revokeMyShareImpl = async (
  id: string,
): Promise<RevokeRouteShareResult> => {
  try {
    await mobileApiFetch<unknown>(
      `/v1/route-shares/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
    return { status: 'ok' };
  } catch (err) {
    if (!(err instanceof ApiClientError)) {
      return {
        status: 'network_error',
        message: err instanceof Error ? err.message : 'Network error',
      };
    }

    if (err.kind !== 'http' || err.status == null) {
      return { status: 'network_error', message: err.message };
    }

    // 204 No Content is the success signal for DELETE — apiFetch surfaces it
    // as an http error because `response.json()` chokes on the empty body.
    // Treat it as success here. 200/2xx with a body lands in the try branch
    // above unaffected.
    if (err.status === 204) return { status: 'ok' };
    if (err.status === 401 || err.status === 403) return { status: 'auth_required' };
    if (err.status === 404) return { status: 'not_found' };

    return {
      status: 'network_error',
      message: err.body || `Revoke failed with HTTP ${err.status}`,
    };
  }
};
