import type {
  ActivityFeedResponse,
  AutocompleteRequest,
  AutocompleteResponse,
  BadgeResponse,
  CityHeartbeat,
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
  ImpactDashboard,
  LeaderboardMetric,
  LeaderboardPeriod,
  LeaderboardResponse,
  MiaDetectionSource,
  MiaJourneyState,
  NavigationFeedbackRequest,
  NearbyHazard,
  NeighborhoodSafetyScore,
  ProfileResponse,
  ProfileUpdateRequest,
  QuizAnswer,
  QuizQuestion,
  ReverseGeocodeRequest,
  ReverseGeocodeResponse,
  RideImpact,
  RideRecentDestination,
  SavedRoute,
  SavedRouteCreateRequest,
  ShareTripRequest,
  SuggestedUser,
  TelemetryEvent,
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

import { mobileEnv } from './env';
import { getAccessToken, refreshAccessToken } from './supabase';
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

const REQUEST_TIMEOUT_MS = 8000;

type RequestResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: <TResponse>() => Promise<TResponse>;
};

const ensureBaseUrl = (): string => {
  if (!mobileEnv.mobileApiUrl) {
    throw new Error(
      'EXPO_PUBLIC_MOBILE_API_URL is not configured. Set it before using mobile API calls.',
    );
  }

  return mobileEnv.mobileApiUrl.replace(/\/$/, '');
};

const formatErrorMessage = (status: number, parsedError: ErrorResponse | null, rawError: string) => {
  const fallbackMessage = rawError || `Request failed with ${status}`;

  if (!parsedError) {
    return fallbackMessage;
  }

  const detail = parsedError.details?.find((entry) => Boolean(entry?.trim()));
  return detail ? `${parsedError.error} ${detail}` : parsedError.error;
};

const normalizeHeaders = (headers?: HeadersInit): Record<string, string> => {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return Object.entries(headers).reduce<Record<string, string>>((nextHeaders, [key, value]) => {
    if (typeof value === 'string') {
      nextHeaders[key] = value;
    }

    return nextHeaders;
  }, {});
};

const getDefaultRequestHeaders = (accessToken: string | null): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(mobileEnv.usesNgrokTunnel
    ? {
        'ngrok-skip-browser-warning': 'true',
      }
    : {}),
  ...(accessToken
    ? {
        Authorization: `Bearer ${accessToken}`,
      }
    : {}),
});

const requestWithXmlHttpRequest = (
  url: string,
  init: RequestInit | undefined,
  accessToken: string | null,
): Promise<RequestResponse> =>
  new Promise((resolve, reject) => {
    if (typeof XMLHttpRequest === 'undefined') {
      reject(new Error('XMLHttpRequest is unavailable in this runtime.'));
      return;
    }

    const request = new XMLHttpRequest();
    const timeoutErrorMessage = `Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`;
    const headers = normalizeHeaders(init?.headers);
    const requestHeaders: Record<string, string> = {
      ...getDefaultRequestHeaders(accessToken),
      ...headers,
    };

    request.open(init?.method ?? 'GET', url, true);
    request.timeout = REQUEST_TIMEOUT_MS;

    Object.entries(requestHeaders).forEach(([key, value]) => {
      request.setRequestHeader(key, value);
    });

    request.onload = () => {
      const responseText = request.responseText ?? '';

      resolve({
        ok: request.status >= 200 && request.status < 300,
        status: request.status,
        text: async () => responseText,
        json: async <TResponse>() => {
          try {
            return JSON.parse(responseText) as TResponse;
          } catch {
            throw new Error(`Invalid JSON response: ${responseText.slice(0, 200)}`);
          }
        },
      });
    };

    request.onerror = () => {
      reject(new Error('Network request failed.'));
    };

    request.ontimeout = () => {
      reject(new Error(timeoutErrorMessage));
    };

    request.onabort = () => {
      reject(new Error(timeoutErrorMessage));
    };

    request.send(typeof init?.body === 'string' ? init.body : null);
  });

const requestWithFetch = async (
  url: string,
  init: RequestInit | undefined,
  accessToken: string | null,
): Promise<RequestResponse> => {
  const controller = new AbortController();
  const timeoutErrorMessage = `Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`;
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        ...getDefaultRequestHeaders(accessToken),
        ...(init?.headers ?? {}),
      },
      ...init,
      signal: controller.signal,
    });

    return {
      ok: response.ok,
      status: response.status,
      text: () => response.text(),
      json: <TResponse>() => response.json() as Promise<TResponse>,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(timeoutErrorMessage);
    }

    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

type TransportResult = {
  response: RequestResponse;
  lastTransportError: unknown;
};

const executeTransport = async (
  url: string,
  init: RequestInit | undefined,
  accessToken: string | null,
): Promise<TransportResult> => {
  let response: RequestResponse;
  let lastTransportError: unknown = null;

  if (typeof fetch === 'function') {
    try {
      response = await requestWithFetch(url, init, accessToken);
    } catch (error) {
      lastTransportError = error;

      if (typeof XMLHttpRequest !== 'undefined') {
        response = await requestWithXmlHttpRequest(url, init, accessToken);
      } else {
        throw error;
      }
    }
  } else if (typeof XMLHttpRequest !== 'undefined') {
    try {
      response = await requestWithXmlHttpRequest(url, init, accessToken);
    } catch (error) {
      lastTransportError = error;
      throw error;
    }
  } else {
    throw new Error('No supported network transport is available in this runtime.');
  }

  return { response: response!, lastTransportError };
};

const requestJson = async <TResponse>(
  path: string,
  init?: RequestInit,
): Promise<TResponse> => {
  const accessToken = await getAccessToken();
  const url = `${ensureBaseUrl()}${path}`;

  let { response, lastTransportError } = await executeTransport(url, init, accessToken);

  // On 401, attempt to refresh the Supabase token and retry once
  if (response.status === 401) {
    const refreshedToken = await refreshAccessToken();

    if (refreshedToken) {
      const retryResult = await executeTransport(url, init, refreshedToken);
      response = retryResult.response;
      lastTransportError = retryResult.lastTransportError;
    }
  }

  if (!response.ok) {
    const rawError = await response.text();
    let parsedError: ErrorResponse | null = null;

    try {
      parsedError = JSON.parse(rawError) as ErrorResponse;
    } catch {
      parsedError = null;
    }

    const errorMessage = formatErrorMessage(response.status, parsedError, rawError);
    throw new Error(errorMessage);
  }

  try {
    return response.json() as Promise<TResponse>;
  } catch (error) {
    if (lastTransportError instanceof Error) {
      throw new Error(`${lastTransportError.message} ${error instanceof Error ? error.message : ''}`.trim());
    }

    throw error;
  }
};

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
    requestJson<HazardReportResponse>('/v1/hazards', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  startTrip: (payload: TripStartRequest) =>
    requestJson<TripStartResponse>('/v1/trips/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  endTrip: (payload: TripEndRequest) =>
    requestJson<TripEndResponse>('/v1/trips/end', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getTripHistory: () =>
    requestJson<TripHistoryItem[]>('/v1/trips/history'),
  getUserStats: () =>
    requestJson<UserStats>('/v1/stats'),
  getStatsDashboard: (tz?: string) =>
    requestJson<TripStatsDashboard>(`/v1/stats/dashboard${tz ? `?tz=${tz}` : ''}`),
  saveTripTrack: (payload: TripTrackRequest) =>
    requestJson<WriteAckResponse>('/v1/trips/track', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  submitFeedback: (payload: NavigationFeedbackRequest) =>
    requestJson<WriteAckResponse>('/v1/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ── Hazard Alerts ──

  getNearbyHazards: (lat: number, lon: number, radiusMeters = 1000) =>
    requestJson<{ hazards: NearbyHazard[] }>(
      `/v1/hazards/nearby?lat=${lat}&lon=${lon}&radiusMeters=${radiusMeters}`,
    ).then((res) => res.hazards),

  validateHazard: (hazardId: string, response: HazardValidationResponse) =>
    requestJson<WriteAckResponse>(`/v1/hazards/${hazardId}/validate`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    }),

  // ── Community Feed ──

  getFeed: (lat: number, lon: number, cursor?: string, limit?: number) => {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', String(limit));
    return requestJson<FeedResponse>(`/v1/feed?${params.toString()}`);
  },
  shareTripToFeed: (payload: ShareTripRequest) =>
    requestJson<{ id: string; sharedAt: string }>('/v1/feed/share', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  likeFeedItem: (tripShareId: string) =>
    requestJson<WriteAckResponse>(`/v1/feed/${tripShareId}/like`, {
      method: 'POST',
    }),
  unlikeFeedItem: (tripShareId: string) =>
    requestJson<WriteAckResponse>(`/v1/feed/${tripShareId}/like`, {
      method: 'DELETE',
    }),
  loveFeedItem: (tripShareId: string) =>
    requestJson<WriteAckResponse>(`/v1/feed/${tripShareId}/love`, {
      method: 'POST',
    }),
  unloveFeedItem: (tripShareId: string) =>
    requestJson<WriteAckResponse>(`/v1/feed/${tripShareId}/love`, {
      method: 'DELETE',
    }),
  getFeedComments: (tripShareId: string) =>
    requestJson<{ comments: FeedComment[] }>(`/v1/feed/${tripShareId}/comments`),
  postFeedComment: (tripShareId: string, payload: FeedCommentRequest) =>
    requestJson<WriteAckResponse>(`/v1/feed/${tripShareId}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getProfile: () =>
    requestJson<ProfileResponse>('/v1/profile'),
  updateProfile: (payload: ProfileUpdateRequest) =>
    requestJson<ProfileResponse>('/v1/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // Push notifications
  registerPushToken: (expoPushToken: string, deviceId: string, platform: string) =>
    requestJson<WriteAckResponse>('/v1/push-token', {
      method: 'PUT',
      body: JSON.stringify({ expoPushToken, deviceId, platform }),
    }),
  unregisterPushToken: (deviceId: string) =>
    requestJson<WriteAckResponse>('/v1/push-token', {
      method: 'DELETE',
      body: JSON.stringify({ deviceId }),
    }),

  // ── Recent Destinations (from rides) ──

  getRecentDestinations: () =>
    requestJson<{ destinations: RideRecentDestination[] }>('/v1/recent-destinations')
      .then((res) => res.destinations),

  // ── Community Stats ──

  getCommunityStats: (lat: number, lon: number, radiusKm = 15) => {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      radiusKm: String(radiusKm),
    });
    return requestJson<CommunityStats>(`/v1/community/stats?${params.toString()}`);
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
    return requestJson<CityHeartbeat>(`/v1/community/heartbeat?${params.toString()}`);
  },

  // ── Habit Engine ──

  fetchLoopRoute: (origin: Coordinate, distanceMeters: number, safetyFloor?: number) =>
    requestJson<RoutePreviewResponse>('/v1/loop-route', {
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
    return requestJson<NeighborhoodSafetyScore>(`/v1/safety-score?${params.toString()}`);
  },

  fetchRiskMap: async (lat: number, lon: number, radiusKm?: number): Promise<GeoJSON.FeatureCollection> => {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (radiusKm != null) params.set('radiusKm', String(radiusKm));
    try {
      return await requestJson<GeoJSON.FeatureCollection>(`/v1/risk-map?${params.toString()}`);
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
    requestJson<RideImpact>(`/v1/rides/${tripId}/impact`, {
      method: 'POST',
      body: JSON.stringify({ distanceMeters, ...meta }),
    }),

  fetchRideImpact: (tripId: string) =>
    requestJson<RideImpact>(`/v1/rides/${tripId}/impact`),

  fetchBadges: () =>
    requestJson<BadgeResponse>('/v1/badges'),

  fetchTiers: () =>
    requestJson<TiersResponse>('/v1/tiers'),

  fetchImpactDashboard: (timeZone?: string) => {
    const params = timeZone ? `?tz=${encodeURIComponent(timeZone)}` : '';
    return requestJson<ImpactDashboard>(`/v1/impact-dashboard${params}`);
  },

  fetchDailyQuiz: () =>
    requestJson<QuizQuestion>('/v1/quiz/daily'),

  submitQuizAnswer: (questionId: string, selectedIndex: number) =>
    requestJson<QuizAnswer>('/v1/quiz/answer', {
      method: 'POST',
      body: JSON.stringify({ questionId, selectedIndex }),
    }),

  // ── Social ──

  followUser: (userId: string) =>
    requestJson<{ status: string; actionAt: string }>(`/v1/users/${userId}/follow`, { method: 'POST' }),

  unfollowUser: (userId: string) =>
    requestJson<{ unfollowedAt: string }>(`/v1/users/${userId}/follow`, { method: 'DELETE' }),

  approveFollowRequest: (userId: string) =>
    requestJson<{ actionAt: string }>(`/v1/users/${userId}/follow/approve`, { method: 'POST' }),

  declineFollowRequest: (userId: string) =>
    requestJson<{ actionAt: string }>(`/v1/users/${userId}/follow/decline`, { method: 'POST' }),

  getFollowRequests: () =>
    requestJson<{ requests: FollowRequest[] }>('/v1/profile/follow-requests'),

  getUserProfile: (userId: string) =>
    requestJson<UserPublicProfile>(`/v1/users/${userId}/profile`),

  getSuggestedUsers: (lat: number, lon: number, limit?: number) => {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (limit) params.set('limit', String(limit));
    return requestJson<{ users: SuggestedUser[] }>(`/v1/feed/suggested-users?${params.toString()}`);
  },

  // ── Activity Feed (v2) ──

  getActivityFeed: (lat: number, lon: number, cursorScore?: number, cursorId?: string, limit?: number) => {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (cursorScore != null) params.set('cursorScore', String(cursorScore));
    if (cursorId) params.set('cursorId', cursorId);
    if (limit) params.set('limit', String(limit));
    return requestJson<ActivityFeedResponse>(`/v1/v2/feed?${params.toString()}`);
  },

  reactToActivity: (activityId: string, type: 'like' | 'love') =>
    requestJson<WriteAckResponse>(`/v1/v2/feed/${activityId}/react`, {
      method: 'POST',
      body: JSON.stringify({ type }),
    }),

  unreactToActivity: (activityId: string, type: 'like' | 'love') =>
    requestJson<WriteAckResponse>(`/v1/v2/feed/${activityId}/react/${type}`, {
      method: 'DELETE',
    }),

  getActivityComments: (activityId: string) =>
    requestJson<{ comments: FeedComment[] }>(`/v1/v2/feed/${activityId}/comments`),

  postActivityComment: (activityId: string, body: string) =>
    requestJson<WriteAckResponse>(`/v1/v2/feed/${activityId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  // ── Saved Routes ──

  getSavedRoutes: () =>
    requestJson<{ routes: SavedRoute[] }>('/v1/saved-routes').then((res) => res.routes),

  saveRoute: (payload: SavedRouteCreateRequest) =>
    requestJson<SavedRoute>('/v1/saved-routes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteSavedRoute: (id: string) =>
    requestJson<WriteAckResponse>(`/v1/saved-routes/${id}`, {
      method: 'DELETE',
    }),

  useSavedRoute: (id: string) =>
    requestJson<WriteAckResponse>(`/v1/saved-routes/${id}/use`, {
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
    return requestJson<LeaderboardResponse>(`/v1/leaderboard?${params.toString()}`);
  },

  // ── Mia Persona Journey ──

  getMiaJourney: () =>
    requestJson<MiaJourneyState>('/v1/mia/journey'),

  activateMia: (source: MiaDetectionSource) =>
    requestJson<{ activatedAt: string }>('/v1/mia/activate', {
      method: 'POST',
      body: JSON.stringify({ source }),
    }).then(() => undefined),

  optOutMia: () =>
    requestJson<{ optedOutAt: string }>('/v1/mia/opt-out', {
      method: 'POST',
    }).then(() => undefined),

  submitMiaTestimonial: (text: string) =>
    requestJson<{ acceptedAt: string }>('/v1/mia/testimonial', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }).then(() => undefined),

  // ── Telemetry Events ──

  sendTelemetryEvents: (events: readonly TelemetryEvent[]) =>
    requestJson<{ accepted: number }>('/v1/mia/telemetry/events', {
      method: 'POST',
      body: JSON.stringify({
        events: events.map((e) => ({
          event_type: e.eventType,
          properties: e.properties,
          session_id: e.sessionId,
          timestamp: e.timestamp,
        })),
      }),
    }).then(() => undefined),

  // ── Route Shares (slice 1) ──

  createRouteShare: (payload: RouteShareCreatePayload) =>
    requestJson<RouteShareCreateResult>('/v1/route-shares', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getPublicRouteShare: (code: string) =>
    requestJson<PublicRouteShare>(
      `/v1/route-shares/public/${encodeURIComponent(code)}`,
    ),

  // ── Route Share Claim (slice 2) ──
  //
  // Separate from `requestJson` because we care about discriminating on
  // HTTP status (404 / 410 / 422) rather than throwing a generic Error.
  // Returns a `ClaimRouteShareResult` discriminated union that mirrors the
  // server-side `ClaimShareResult`.
  claimRouteShare: (code: string): Promise<ClaimRouteShareResult> =>
    claimRouteShareImpl(code),
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
  const accessToken = await getAccessToken();
  const url = `${ensureBaseUrl()}/v1/route-shares/${encodeURIComponent(code)}/claim`;
  const init: RequestInit = { method: 'POST' };

  let response: RequestResponse;
  try {
    const transport = await executeTransport(url, init, accessToken);
    response = transport.response;

    // 401 → refresh-token-and-retry (same pattern as requestJson)
    if (response.status === 401) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        const retry = await executeTransport(url, init, refreshedToken);
        response = retry.response;
      }
    }
  } catch (err) {
    return {
      status: 'network_error',
      message: err instanceof Error ? err.message : 'Network error',
    };
  }

  const status = response.status;

  if (response.ok) {
    try {
      const body = (await response.json()) as RouteShareClaimResponseBody;
      return { status: 'ok', data: body };
    } catch (err) {
      return {
        status: 'network_error',
        message:
          err instanceof Error
            ? `Malformed claim response: ${err.message}`
            : 'Malformed claim response',
      };
    }
  }

  if (status === 401 || status === 403) return { status: 'auth_required' };
  if (status === 404) return { status: 'not_found' };
  if (status === 410) {
    // Parse the `details: [reason]` emitted by the route handler to
    // distinguish expired vs revoked. Fall back to 'expired' if the detail
    // is missing — the UX message is the same either way ("no longer
    // available"), but analytics benefit from the finer grain.
    let reason: 'expired' | 'revoked' = 'expired';
    try {
      const raw = await response.text();
      const parsed = JSON.parse(raw) as ErrorResponse;
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
  try {
    const raw = await response.text();
    return {
      status: 'network_error',
      message: raw || `Claim failed with HTTP ${status}`,
    };
  } catch {
    return {
      status: 'network_error',
      message: `Claim failed with HTTP ${status}`,
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
export type RouteShareCreatePayload =
  | {
      source: 'planned';
      route: RouteShareRoutePayload;
    }
  | {
      source: 'saved';
      savedRouteId: string;
      route: RouteShareRoutePayload;
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
