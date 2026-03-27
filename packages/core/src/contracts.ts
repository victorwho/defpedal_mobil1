import type {
  GeoJsonLineString,
  GeoJsonMultiLineString,
  Maneuver,
} from './types';

export type RoutingMode = 'safe' | 'fast';

export interface Coordinate {
  lat: number;
  lon: number;
}

export interface CoverageRegion {
  countryCode: string;
  status: 'supported' | 'partial' | 'unsupported';
  safeRouting: boolean;
  fastRouting: boolean;
  message?: string;
}

export interface RiskSegment {
  id: string;
  riskScore: number;
  color: string;
  geometry: GeoJsonLineString | GeoJsonMultiLineString;
}

export interface NavigationStep {
  id: string;
  instruction: string;
  streetName: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuver: Maneuver;
  geometry?: GeoJsonLineString;
  mode: string;
}

export interface RouteOption {
  id: string;
  source: 'custom_osrm' | 'mapbox';
  routingEngineVersion: string;
  routingProfileVersion: string;
  mapDataVersion: string;
  riskModelVersion: string;
  geometryPolyline6: string;
  distanceMeters: number;
  durationSeconds: number;
  adjustedDurationSeconds: number;
  totalClimbMeters: number | null;
  elevationProfile?: number[];
  steps: NavigationStep[];
  riskSegments: RiskSegment[];
  warnings: string[];
}

export interface RouteDebugInfo {
  routeId: string;
  source: 'custom_osrm' | 'mapbox';
  routingProfileVersion: string;
  selectedAlternativeIndex: number;
  totalRiskScore: number;
  fallbackReason?: string;
}

export interface RoutePreviewRequest {
  origin: Coordinate;
  destination: Coordinate;
  startOverride?: Coordinate;
  mode: RoutingMode;
  avoidUnpaved: boolean;
  locale: string;
  countryHint?: string;
  debug?: boolean;
}

export type RerouteRequest = RoutePreviewRequest & {
  activeRouteId?: string;
};

export interface RoutePreviewResponse {
  routes: RouteOption[];
  selectedMode: RoutingMode;
  coverage: CoverageRegion;
  generatedAt: string;
  debug?: RouteDebugInfo[];
}

export interface CoverageResponse {
  regions: CoverageRegion[];
  matched?: CoverageRegion;
  generatedAt: string;
}

export interface ErrorResponse {
  error: string;
  code:
    | 'VALIDATION_ERROR'
    | 'BAD_REQUEST'
    | 'RATE_LIMITED'
    | 'UNAUTHORIZED'
    | 'UPSTREAM_ERROR'
    | 'INTERNAL_ERROR';
  details?: string[];
}

export interface AutocompleteRequest {
  query: string;
  proximity?: Coordinate;
  locale?: string;
  countryHint?: string;
  limit?: number;
}

export type SuggestionFeatureType =
  | 'poi'
  | 'address'
  | 'place'
  | 'locality'
  | 'neighborhood'
  | 'unknown';

export interface AutocompleteSuggestion {
  id: string;
  label: string;
  primaryText: string;
  coordinates: Coordinate;
  distanceMeters?: number;
  featureType?: SuggestionFeatureType;
  category?: string;
}

export interface AutocompleteResponse {
  suggestions: AutocompleteSuggestion[];
  generatedAt: string;
}

export interface ReverseGeocodeRequest {
  coordinate: Coordinate;
  locale?: string;
  countryHint?: string;
}

export interface ReverseGeocodeResponse {
  coordinate: Coordinate;
  label: string | null;
}

export const HAZARD_TYPE_OPTIONS = [
  {
    value: 'illegally_parked_car',
    label: 'Illegally parked car',
  },
  {
    value: 'blocked_bike_lane',
    label: 'Blocked bike lane',
  },
  {
    value: 'missing_bike_lane',
    label: 'Missing bike lane',
  },
  {
    value: 'pothole',
    label: 'Pothole',
  },
  {
    value: 'poor_surface',
    label: 'Poor surface',
  },
  {
    value: 'narrow_street',
    label: 'Narrow street',
  },
  {
    value: 'dangerous_intersection',
    label: 'Dangerous intersection',
  },
  {
    value: 'construction',
    label: 'Construction',
  },
  {
    value: 'aggressive_traffic',
    label: 'Aggressive traffic',
  },
  {
    value: 'other',
    label: 'Other',
  },
] as const;

export type HazardType = (typeof HAZARD_TYPE_OPTIONS)[number]['value'];

export interface HazardReportRequest {
  coordinate: Coordinate;
  reportedAt: string;
  source?: 'manual' | 'automatic';
  hazardType?: HazardType;
}

export interface HazardReportResponse {
  reportId: string;
  acceptedAt: string;
}

export interface NearbyHazard {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly hazardType: HazardType;
  readonly createdAt: string;
  readonly confirmCount: number;
  readonly denyCount: number;
  readonly distanceMeters?: number;
}

export type HazardValidationResponse = 'confirm' | 'deny' | 'pass';

export interface TripStartRequest {
  clientTripId: string;
  sessionId: string;
  startLocationText: string;
  startCoordinate: Coordinate;
  destinationText: string;
  destinationCoordinate: Coordinate;
  distanceMeters: number;
  startedAt: string;
}

export interface TripStartResponse {
  clientTripId: string;
  tripId: string;
  acceptedAt: string;
}

export interface TripEndRequest {
  clientTripId: string;
  tripId: string;
  endedAt: string;
  reason: 'completed' | 'stopped';
}

export interface TripTrackRequest {
  tripId: string;
  clientTripId: string;
  routingMode: 'safe' | 'fast';
  plannedRoutePolyline6?: string;
  plannedRouteDistanceMeters?: number;
  gpsBreadcrumbs: GpsBreadcrumb[];
  endReason: 'completed' | 'stopped' | 'app_killed';
  startedAt: string;
  endedAt: string;
}

export interface TripHistoryItem {
  readonly id: string;
  readonly tripId: string;
  readonly routingMode: 'safe' | 'fast';
  readonly plannedRoutePolyline6?: string;
  readonly plannedRouteDistanceMeters?: number;
  readonly gpsBreadcrumbs: ReadonlyArray<{ lat: number; lon: number }>;
  readonly endReason: 'completed' | 'stopped' | 'app_killed' | 'in_progress';
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly distanceMeters?: number;
}

export interface TripEndResponse {
  clientTripId: string;
  tripId: string;
  acceptedAt: string;
}

export interface NavigationFeedbackRequest {
  tripId?: string;
  clientTripId?: string;
  sessionId: string;
  startLocationText: string;
  destinationText: string;
  distanceMeters: number;
  durationSeconds: number;
  rating: number;
  feedbackText: string;
  submittedAt: string;
}

export interface WriteAckResponse {
  acceptedAt: string;
}

export interface NavigationLocationSample {
  coordinate: Coordinate;
  accuracyMeters?: number | null;
  speedMetersPerSecond?: number | null;
  heading?: number | null;
  timestamp: number;
}

export interface GpsBreadcrumb {
  readonly lat: number;
  readonly lon: number;
  readonly ts: number;
  readonly acc: number | null;
  readonly spd: number | null;
  readonly hdg: number | null;
}

export interface NavigationSession {
  sessionId: string;
  routeId: string;
  state: 'idle' | 'preview' | 'navigating' | 'awaiting_feedback';
  currentStepIndex: number;
  isMuted: boolean;
  isFollowing: boolean;
  startedAt: string;
  lastKnownCoordinate?: Coordinate;
  lastKnownHeading?: number | null;
  lastKnownSpeedMetersPerSecond?: number | null;
  lastLocationAccuracyMeters?: number | null;
  lastSnappedCoordinate?: Coordinate;
  lastApproachAnnouncementStepId?: string | null;
  distanceToManeuverMeters?: number | null;
  distanceToRouteMeters?: number | null;
  remainingDistanceMeters?: number;
  remainingDurationSeconds?: number;
  rerouteEligible?: boolean;
  offRouteSince?: string | null;
  lastRerouteAt?: string | null;
  gpsBreadcrumbs: GpsBreadcrumb[];
}

export interface OfflineRegion {
  id: string;
  name: string;
  bbox: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  status: 'queued' | 'downloading' | 'ready' | 'failed';
  progressPercentage?: number;
  completedResourceCount?: number;
  requiredResourceCount?: number;
  styleURL?: string;
  routeId?: string | null;
  updatedAt?: string;
  error?: string | null;
}

export type QueuedMutationType = 'hazard' | 'trip_start' | 'trip_end' | 'trip_track' | 'trip_share' | 'feedback';
export type QueuedMutationStatus = 'queued' | 'syncing' | 'failed';

export interface QueuedMutation {
  id: string;
  type: QueuedMutationType;
  payload: unknown;
  createdAt: string;
  retryCount: number;
  status?: QueuedMutationStatus;
  lastAttemptAt?: string;
  lastError?: string | null;
}

// ── Community Feed ──

export const SAFETY_TAG_OPTIONS = [
  { value: 'bike_lane', label: 'Bike lane' },
  { value: 'low_traffic', label: 'Low traffic' },
  { value: 'well_lit', label: 'Well lit' },
  { value: 'separated_path', label: 'Separated path' },
  { value: 'residential', label: 'Residential streets' },
  { value: 'traffic_calmed', label: 'Traffic calmed' },
  { value: 'avoid_main_road', label: 'Avoids main roads' },
] as const;

export type SafetyTag = (typeof SAFETY_TAG_OPTIONS)[number]['value'];

export interface FeedProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface FeedItem {
  id: string;
  user: FeedProfile;
  title: string;
  startLocationText: string;
  destinationText: string;
  distanceMeters: number;
  durationSeconds: number;
  elevationGainMeters: number | null;
  averageSpeedMps: number | null;
  safetyRating: number | null;
  safetyTags: SafetyTag[];
  geometryPolyline6: string;
  note: string | null;
  sharedAt: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

export interface FeedComment {
  id: string;
  user: FeedProfile;
  body: string;
  createdAt: string;
}

export interface ShareTripRequest {
  tripId?: string;
  title?: string;
  startLocationText: string;
  destinationText: string;
  distanceMeters: number;
  durationSeconds: number;
  elevationGainMeters?: number | null;
  averageSpeedMps?: number | null;
  safetyRating?: number | null;
  geometryPolyline6: string;
  note?: string | null;
  safetyTags?: SafetyTag[];
  startCoordinate: Coordinate;
}

export interface FeedResponse {
  items: FeedItem[];
  cursor: string | null;
}

export interface FeedCommentRequest {
  body: string;
}

export interface ProfileUpdateRequest {
  displayName?: string;
  autoShareRides?: boolean;
  trimRouteEndpoints?: boolean;
}

export interface ProfileResponse {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  autoShareRides: boolean;
  trimRouteEndpoints: boolean;
}
