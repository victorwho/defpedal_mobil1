import type {
  AutocompleteRequest,
  AutocompleteResponse,
  CommunityStats,
  Coordinate,
  CoverageResponse,
  ErrorResponse,
  FeedComment,
  FeedCommentRequest,
  FeedResponse,
  HazardReportRequest,
  HazardReportResponse,
  HazardValidationResponse,
  ImpactDashboard,
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
  ShareTripRequest,
  RerouteRequest,
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
import { getAccessToken } from './supabase';
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
        json: async <TResponse>() => JSON.parse(responseText) as TResponse,
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
    const response = (await Promise.race([
      fetch(url, {
        headers: {
          ...getDefaultRequestHeaders(accessToken),
          ...(init?.headers ?? {}),
        },
        ...init,
        signal: controller.signal,
      }),
      new Promise<Response>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error(timeoutErrorMessage));
        }, REQUEST_TIMEOUT_MS);
      }),
    ])) as Response;

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

const requestJson = async <TResponse>(
  path: string,
  init?: RequestInit,
): Promise<TResponse> => {
  const accessToken = await getAccessToken();
  const url = `${ensureBaseUrl()}${path}`;
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
      method: 'PUT',
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
    const baseUrl = ensureBaseUrl();
    // Direct fetch without auth — risk map is public safety data
    const response = await fetch(`${baseUrl}/v1/risk-map?${params.toString()}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return { type: 'FeatureCollection', features: [] };
    return response.json();
  },

  recordRideImpact: (tripId: string, distanceMeters: number) =>
    requestJson<RideImpact>(`/v1/rides/${tripId}/impact`, {
      method: 'POST',
      body: JSON.stringify({ distanceMeters }),
    }),

  fetchRideImpact: (tripId: string) =>
    requestJson<RideImpact>(`/v1/rides/${tripId}/impact`),

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
};
