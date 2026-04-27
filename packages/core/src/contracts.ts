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
  riskCategory: string;
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
  waypoints?: readonly Coordinate[];
  startOverride?: Coordinate;
  mode: RoutingMode;
  avoidUnpaved: boolean;
  avoidHills: boolean;
  showRouteComparison?: boolean;
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
  comparisonLabel?: string;
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
    | 'INTERNAL_ERROR'
    | 'NOT_FOUND'
    | 'CONFLICT';
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
  /** Concise local address (street + neighborhood), NOT full country-level */
  secondaryText?: string;
  coordinates: Coordinate;
  distanceMeters?: number;
  /** Pre-formatted distance: "350 m" or "1.2 km" */
  distanceLabel?: string;
  featureType?: SuggestionFeatureType;
  category?: string;
  /** Mapbox maki icon name for specific POI icon mapping */
  maki?: string;
}

/** A recent destination stored for quick re-selection */
export interface RecentDestination extends AutocompleteSuggestion {
  /** ISO timestamp when this destination was last selected */
  selectedAt: string;
}

/** A ride destination derived from the trips table (server-backed) */
export interface RideRecentDestination {
  readonly label: string;
  readonly coordinates: Coordinate;
  readonly rodeAt: string;
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
    value: 'aggro_dogs',
    label: 'Aggro dogs',
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
  source?: 'in_ride' | 'manual' | 'armchair';
  hazardType?: HazardType;
  /**
   * Optional free-text description. Primarily used with `hazardType='other'`
   * to let riders describe unclassified hazards. Server-side length cap: 280
   * chars (enforced by the `hazards_description_length_check` constraint).
   */
  description?: string;
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
  readonly score: number;
  readonly userVote: HazardVoteDirection | null;
  readonly expiresAt: string;
  readonly lastConfirmedAt: string | null;
  readonly description: string | null;
  readonly distanceMeters?: number;
}

export type HazardValidationResponse = 'confirm' | 'deny' | 'pass';

export type HazardVoteDirection = 'up' | 'down';

export interface HazardVoteRequest {
  readonly direction: HazardVoteDirection;
  readonly clientSubmittedAt?: string;
}

export interface HazardVoteResponse {
  readonly hazardId: string;
  readonly score: number;
  readonly confirmCount: number;
  readonly denyCount: number;
  readonly userVote: HazardVoteDirection;
  readonly expiresAt: string;
  readonly lastConfirmedAt: string | null;
}

export interface HazardVoteQueuePayload {
  readonly hazardId: string;
  readonly direction: HazardVoteDirection;
  readonly clientSubmittedAt: string;
}

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
  bikeType?: string;
  aqiAtStart?: number | null;
}

export interface TripHistoryItem {
  readonly id: string;
  readonly tripId: string;
  readonly routingMode: 'safe' | 'fast' | 'flat';
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
  lastPreAnnouncementStepId?: string | null;
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

export type QueuedMutationType = 'hazard' | 'trip_start' | 'trip_end' | 'trip_track' | 'trip_share' | 'feedback' | 'hazard_vote';
export type QueuedMutationStatus = 'queued' | 'syncing' | 'failed' | 'dead';

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
  riderTier?: RiderTierName;
}

export interface UserPublicProfile {
  readonly id: string;
  readonly displayName: string;
  readonly username: string | null;
  readonly avatarUrl: string | null;
  readonly totalTrips: number;
  readonly totalDistanceMeters: number;
  readonly totalCo2SavedKg: number;
  readonly totalHazardsReported: number;
  readonly followersCount: number;
  readonly followingCount: number;
  readonly isFollowedByMe: boolean;
  readonly followStatus: FollowStatus;
  readonly isPrivate: boolean;
  readonly recentTrips: readonly {
    readonly id: string;
    readonly title: string;
    readonly distanceMeters: number;
    readonly durationSeconds: number;
    readonly safetyRating: number | null;
    readonly sharedAt: string;
    readonly geometryPolyline6: string;
  }[];
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
  loveCount: number;
  co2SavedKg: number | null;
  commentCount: number;
  likedByMe: boolean;
  lovedByMe: boolean;
  isWeeklyChampion?: boolean;
  championMetric?: 'co2' | 'hazards' | null;
}

// ── Social Network (Activity Feed) ──

export type ActivityType =
  | 'ride'
  | 'hazard_batch'
  | 'hazard_standalone'
  | 'tier_up'
  | 'badge_unlock'
  // Slice 8: surfaced when someone claims a share and the sharer has
  // shareConversionFeedOptin=true (see claim_route_share RPC).
  | 'route_share_signup';

export type FollowStatus = 'none' | 'pending' | 'accepted';

export interface ActivityFeedUser {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly riderTier?: RiderTierName;
}

// Payload types for each activity type
export interface RideActivityPayload {
  readonly title: string;
  readonly startLocationText: string;
  readonly destinationText: string;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly elevationGainMeters: number | null;
  readonly averageSpeedMps: number | null;
  readonly safetyRating: number | null;
  readonly safetyTags: SafetyTag[];
  readonly geometryPolyline6: string;
  readonly note: string | null;
  readonly tripId: string | null;
  readonly co2SavedKg: number | null;
}

export interface HazardBatchPayload {
  readonly rideActivityId: string | null;
  readonly hazards: readonly {
    readonly hazardType: HazardType;
    readonly lat: number;
    readonly lon: number;
    readonly reportedAt: string;
  }[];
}

export interface HazardStandalonePayload {
  readonly hazardType: HazardType;
  readonly lat: number;
  readonly lon: number;
  readonly reportedAt: string;
}

export interface TierUpPayload {
  readonly tierName: RiderTierName;
  readonly tierLevel: number;
  readonly tierDisplayName: string;
  readonly tierColor: string;
}

export interface BadgeUnlockPayload {
  readonly badgeKey: string;
  readonly badgeName: string;
  readonly iconKey: string;
  readonly category: string;
  readonly flavorText: string;
}

// Base fields common to all activity items
interface ActivityFeedItemBase {
  readonly id: string;
  readonly user: ActivityFeedUser;
  readonly type: ActivityType;
  readonly createdAt: string;
  readonly likeCount: number;
  readonly loveCount: number;
  readonly commentCount: number;
  readonly likedByMe: boolean;
  readonly lovedByMe: boolean;
  readonly score?: number;
}

// Discriminated union for type-safe activity feed items
export interface RideActivity extends ActivityFeedItemBase {
  readonly type: 'ride';
  readonly payload: RideActivityPayload;
}

export interface HazardBatchActivity extends ActivityFeedItemBase {
  readonly type: 'hazard_batch';
  readonly payload: HazardBatchPayload;
}

export interface HazardStandaloneActivity extends ActivityFeedItemBase {
  readonly type: 'hazard_standalone';
  readonly payload: HazardStandalonePayload;
}

export interface TierUpActivity extends ActivityFeedItemBase {
  readonly type: 'tier_up';
  readonly payload: TierUpPayload;
}

export interface BadgeUnlockActivity extends ActivityFeedItemBase {
  readonly type: 'badge_unlock';
  readonly payload: BadgeUnlockPayload;
}

// Slice 8: payload for 'route_share_signup' activity-feed rows. Mirrors the
// server-side jsonb in claim_route_share RPC; the polyline is the *trimmed*
// variant so feed viewers never see home/work addresses.
export interface RouteShareSignupPayload {
  readonly sharerUserId: string;
  readonly inviteeUserId: string;
  readonly shareId: string;
  readonly routePreviewPolylineTrimmed: string;
}

export interface RouteShareSignupActivity extends ActivityFeedItemBase {
  readonly type: 'route_share_signup';
  readonly payload: RouteShareSignupPayload;
}

export type ActivityFeedItem =
  | RideActivity
  | HazardBatchActivity
  | HazardStandaloneActivity
  | TierUpActivity
  | BadgeUnlockActivity
  | RouteShareSignupActivity;

export interface ActivityFeedResponse {
  readonly items: readonly ActivityFeedItem[];
  readonly cursor: string | null;
}

export interface FollowRequest {
  readonly id: string;
  readonly user: ActivityFeedUser;
  readonly requestedAt: string;
  /**
   * Optional human-readable subtitle explaining *why* the request was made,
   * rendered by `FollowRequestItem` under the timestamp. Populated by the
   * server when a pending follow can be attributed to a specific action
   * (e.g. slice-4 route-share claims against a private sharer emit
   * "Signed up via your shared route").
   */
  readonly context?: string;
}

export interface SuggestedUser {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly riderTier?: RiderTierName;
  readonly activityCount: number;
  readonly mutualFollows: number;
}

export interface UserStats {
  readonly totalTrips: number;
  readonly totalDistanceMeters: number;
  readonly totalCo2SavedKg: number;
  readonly totalDurationSeconds: number;
}

// ── Trip Statistics Dashboard ──

export interface TripStatsBucket {
  readonly periodStart: string;
  readonly trips: number;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
}

export interface TripStatsModeSplit {
  readonly safeTrips: number;
  readonly fastTrips: number;
}

export interface TripStatsDashboard {
  readonly totals: UserStats;
  readonly weekly: readonly TripStatsBucket[];
  readonly monthly: readonly TripStatsBucket[];
  readonly currentStreakDays: number;
  readonly longestStreakDays: number;
  readonly modeSplit: TripStatsModeSplit;
}

// ── Community Stats ──

export interface CommunityStats {
  readonly localityName: string | null;
  readonly totalTrips: number;
  readonly totalDistanceMeters: number;
  readonly totalDurationSeconds: number;
  readonly totalCo2SavedKg: number;
  readonly uniqueRiders: number;
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
  username?: string;
  avatarUrl?: string | null;
  autoShareRides?: boolean;
  trimRouteEndpoints?: boolean;
  cyclingGoal?: CyclingGoal | null;
  isPrivate?: boolean;
  notifyWeather?: boolean;
  notifyHazard?: boolean;
  notifyCommunity?: boolean;
  notifyStreak?: boolean;
  notifyImpactSummary?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  quietHoursTimezone?: string | null;
  // Slice 8: sharer controls whether claimed-shares publish to the
  // activity feed. Default true. Claim rewards/XP/badges ship regardless.
  shareConversionFeedOptin?: boolean;
  // Compliance plan item 13: opt-in to keep raw GPS breadcrumbs longer
  // than the 90-day default. When false (default), the daily retention
  // cron truncates trip_tracks.gps_trail on rides older than 90d.
  // Trip summaries (distance, duration, CO2, badges) are unaffected.
  keepFullGpsHistory?: boolean;
}

export interface ProfileResponse {
  id: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  autoShareRides: boolean;
  trimRouteEndpoints: boolean;
  cyclingGoal: CyclingGoal | null;
  isPrivate: boolean;
  shareConversionFeedOptin: boolean;
  keepFullGpsHistory: boolean;
}

// ─── Habit Engine Types ──────────────────────────────────────────

export type CyclingGoal = 'commute' | 'explore' | 'beginner';

export interface RideImpact {
  readonly tripId: string;
  readonly co2SavedKg: number;
  readonly moneySavedEur: number;
  readonly hazardsWarnedCount: number;
  readonly distanceMeters: number;
  readonly equivalentText: string | null;
  readonly personalMicrolives: number;
  readonly communitySeconds: number;
  readonly newBadges: readonly BadgeUnlockEvent[];
  readonly xpBreakdown: readonly XpBreakdownItem[];
  readonly totalXpEarned: number;
  readonly currentTotalXp: number;
  readonly riderTier: RiderTierName;
  readonly tierPromotion: XpAwardResult | null;
  readonly miaLevelUp?: MiaLevelUpEvent | null;
}

export interface BadgeResponse {
  readonly definitions: readonly BadgeDefinition[];
  readonly earned: readonly UserBadge[];
  readonly progress: readonly BadgeProgress[];
}

export interface StreakState {
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly lastQualifyingDate: string | null;
  readonly freezeAvailable: boolean;
  readonly freezeUsedDate: string | null;
}

export interface ImpactDashboard {
  readonly streak: StreakState;
  readonly totalCo2SavedKg: number;
  readonly totalMoneySavedEur: number;
  readonly totalHazardsReported: number;
  readonly totalRidersProtected: number;
  readonly thisWeek: {
    readonly rides: number;
    readonly co2SavedKg: number;
    readonly moneySavedEur: number;
    readonly hazardsReported: number;
  };
  readonly totalMicrolives: number;
  readonly totalCommunitySeconds: number;
  readonly totalXp: number;
  readonly riderTier: RiderTierName;
}

export interface QuizQuestion {
  readonly id: string;
  readonly questionText: string;
  readonly options: readonly string[];
  readonly category: string;
  readonly difficulty: number;
}

export interface QuizAnswer {
  readonly questionId: string;
  readonly selectedIndex: number;
  readonly isCorrect: boolean;
  readonly explanation: string;
}

export interface UserBadge {
  readonly badgeKey: string;
  readonly earnedAt: string;
  readonly isNew?: boolean;
  readonly metadata: Record<string, unknown>;
}

// ── Badge System ──

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
export type BadgeDisplayTab = 'firsts' | 'riding' | 'consistency' | 'impact' | 'safety' | 'community' | 'explore' | 'events';

export interface BadgeDefinition {
  readonly badgeKey: string;
  readonly category: BadgeDisplayTab;
  readonly displayTab: BadgeDisplayTab;
  readonly name: string;
  readonly flavorText: string;
  readonly criteriaText: string;
  readonly criteriaUnit: string | null;
  readonly tier: number;           // 0 = one-time, 1-5 = tier level
  readonly tierFamily: string | null;
  readonly isHidden: boolean;
  readonly isSeasonal: boolean;
  readonly sortOrder: number;
  readonly iconKey: string;
}

export interface BadgeProgress {
  readonly badgeKey: string;
  readonly current: number;
  readonly target: number;
  /** 0-1 fractional progress */
  readonly progress: number;
}

export interface BadgeUnlockEvent {
  readonly badgeKey: string;
  readonly tier: BadgeTier | null;
  readonly name: string;
  readonly flavorText: string;
  readonly iconKey: string;
  readonly earnedAt: string;
}

// ── Rider Tier System ──

export type RiderTierName =
  | 'kickstand'
  | 'spoke'
  | 'pedaler'
  | 'street_smart'
  | 'road_regular'
  | 'trail_blazer'
  | 'road_captain'
  | 'city_guardian'
  | 'iron_cyclist'
  | 'legend';

export interface RiderTierDefinition {
  readonly tierLevel: number;
  readonly name: RiderTierName;
  readonly displayName: string;
  readonly xpRequired: number;
  readonly tagline: string;
  readonly color: string;
  readonly pillTextColor: string;
  readonly perkDescription: string;
}

export interface XpAwardResult {
  readonly xpAwarded: number;
  readonly totalXp: number;
  readonly oldTier: RiderTierName;
  readonly newTier: RiderTierName;
  readonly promoted: boolean;
  readonly tierDisplayName?: string;
  readonly tierTagline?: string;
  readonly tierColor?: string;
  readonly tierLevel?: number;
  readonly tierPerk?: string;
}

export interface XpBreakdownItem {
  readonly action: string;
  readonly label: string;
  readonly baseXp: number;
  readonly multiplier: number;
  readonly finalXp: number;
  readonly sourceId?: string;
}

export interface XpEvent {
  readonly id: string;
  readonly action: string;
  readonly baseXp: number;
  readonly multiplier: number;
  readonly finalXp: number;
  readonly sourceId: string | null;
  readonly createdAt: string;
}

export interface TiersResponse {
  readonly tiers: readonly RiderTierDefinition[];
  readonly totalXp: number;
  readonly riderTier: RiderTierName;
  readonly recentXp: readonly XpEvent[];
}

export interface NeighborhoodSafetyScore {
  readonly score: number;
  readonly totalSegments: number;
  readonly safeCount: number;
  readonly averageCount: number;
  readonly riskyCount: number;
  readonly veryRiskyCount: number;
}

export interface RewardEquivalent {
  readonly category: 'co2' | 'money';
  readonly equivalentText: string;
  readonly thresholdValue: number;
  readonly unit: string;
}

// ── City Heartbeat ──

export interface DailyActivity {
  readonly day: string;
  readonly rides: number;
  readonly distanceMeters: number;
  readonly co2SavedKg: number;
  readonly communitySeconds: number;
}

export interface HazardHotspot {
  readonly hazardType: HazardType;
  readonly count: number;
  readonly lat: number;
  readonly lon: number;
}

export interface TopContributor {
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly rideCount: number;
  readonly distanceKm: number;
}

export interface CityHeartbeat {
  readonly localityName: string | null;
  readonly today: {
    readonly rides: number;
    readonly distanceMeters: number;
    readonly co2SavedKg: number;
    readonly communitySeconds: number;
    readonly activeRiders: number;
  };
  readonly daily: readonly DailyActivity[];
  readonly totals: {
    readonly rides: number;
    readonly distanceMeters: number;
    readonly durationSeconds: number;
    readonly co2SavedKg: number;
    readonly communitySeconds: number;
    readonly uniqueRiders: number;
  };
  readonly hazardHotspots: readonly HazardHotspot[];
  readonly topContributors: readonly TopContributor[];
}

// ── Neighborhood Leaderboard ──

export type LeaderboardMetric = 'co2' | 'hazards';
export type LeaderboardPeriod = 'week' | 'month' | 'all';

export interface LeaderboardEntry {
  readonly rank: number;
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly riderTier: string;
  readonly metricValue: number;
  readonly rankDelta: number | null;  // positive = moved up, negative = moved down, null = new
  readonly isChampion: boolean;
  readonly isRequestingUser: boolean;
}

export interface LeaderboardResponse {
  readonly entries: readonly LeaderboardEntry[];
  readonly userRank: LeaderboardEntry | null;
  readonly periodStart: string;
  readonly periodEnd: string;
}

// ── Mia Persona Journey ──

export type MiaPersona = 'alex' | 'mia';
export type MiaJourneyLevel = 1 | 2 | 3 | 4 | 5;
export type MiaJourneyStatus = 'active' | 'completed' | 'opted_out';
export type MiaDetectionSource = 'self_selected' | 'behavioral' | 'contextual';

export interface MiaJourneyState {
  readonly persona: MiaPersona;
  readonly level: MiaJourneyLevel;
  readonly status: MiaJourneyStatus | null;
  readonly totalRides: number;
  readonly ridesWithDestination: number;
  readonly ridesOver5km: number;
  readonly moderateSegmentsCompleted: number;
  readonly ridesNeeded: number;
  readonly detectionSource: MiaDetectionSource | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly testimonial: string | null;
}

export interface MiaLevelUpEvent {
  readonly fromLevel: MiaJourneyLevel;
  readonly toLevel: MiaJourneyLevel;
}

export interface MiaJourneyEventRecord {
  readonly id: string;
  readonly eventType: string;
  readonly fromLevel: number | null;
  readonly toLevel: number | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
}

// ── Telemetry Events ──

export type TelemetryEventType = 'app_open' | 'route_generated_not_started' | 'map_browse_session';

export interface TelemetryEvent {
  readonly eventType: TelemetryEventType;
  readonly properties: Record<string, unknown>;
  readonly sessionId?: string;
  readonly timestamp: string;
}

// ── Saved Routes ──

export interface SavedRoute {
  readonly id: string;
  readonly name: string;
  readonly origin: Coordinate;
  readonly destination: Coordinate;
  readonly waypoints: readonly Coordinate[];
  readonly mode: RoutingMode;
  readonly avoidUnpaved: boolean;
  readonly avoidHills: boolean;
  readonly createdAt: string;
  readonly lastUsedAt: string;
}

export interface SavedRouteCreateRequest {
  readonly name: string;
  readonly origin: Coordinate;
  readonly destination: Coordinate;
  readonly waypoints?: readonly Coordinate[];
  readonly mode: RoutingMode;
  readonly avoidUnpaved: boolean;
  readonly avoidHills: boolean;
}
