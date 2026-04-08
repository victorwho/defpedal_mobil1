# Implementation Progress

Last updated: 2026-04-08 (session 10)

This file tracks the mobile app implementation progress against `mobile_implementation_plan.md`.
Update it at the end of each implementation slice.

## Snapshot

- Overall progress: roughly 87-92 percent of product migration, 85-90 percent of production hardening
- Current milestone: physical Android validation confirms offline continuity end to end, the repo includes both a manual GitHub Actions release workflow and a runnable mobile-API load-test/operations baseline, and the main native rider plus utility screens now all run through the branded design system
- Primary risk: iPhone validation, Redis-backed staging load testing, deeper rollout automation, and final visual polish parity across every screen are still incomplete
- Current validation blocker: the bridgeless debug client is still failing to consume the staged JS bundle over `10.0.2.2:8081`, so the release / embedded-bundle validator remains the reliable native QA path on this machine
- Webapp cleanup (2026-03-22): all legacy React/Vite/Leaflet webapp code has been removed from the repo root — components/, hooks/, utils/, App.tsx, web-index.tsx, index.html, vite.config.ts, sw.js, manifest.json, and webapp dependencies (leaflet, react-dom, vite, vitest, jsdom, testing-library). Root SQL files moved to supabase/migrations/legacy/. Root tsconfig.json cleaned of DOM libs. The repo is now mobile-only.
- Preview tunnel note: preview mobile development can now auto-sync the active ngrok URL into `apps/mobile/.env.preview` through `npm run sync:mobile:preview-url` and `npm run dev:mobile:preview`
- CO2 savings feature (2026-04-02): full-stack CO2 savings calculator shipped — per-trip and cumulative environmental impact tracking across trip history, community feed, and profile. Uses actual GPS trail distance (not planned route) for accuracy. Deployed to Cloud Run.
- Trip Statistics Dashboard (2026-04-02): full-stack stats dashboard embedded inline in the History tab. Features: period selector (week/month/all time), summary cards (rides, distance, duration, CO2 saved), riding streak tracker (current + longest), ride frequency bar chart, safe vs fast route mode split. Backed by new `get_trip_stats_dashboard` Supabase RPC with timezone-aware bucketing, performance index, and new `GET /v1/stats/dashboard` Fastify endpoint. 16 new tests (9 unit + 7 integration), all passing. Deployed to Cloud Run.
- Community Stats by Locality (2026-04-02): community section shows aggregate stats (trips, km, time, CO2) for nearby cyclists with locality name via Mapbox reverse geocoding. New `get_community_stats` Supabase RPC + `GET /v1/community/stats` endpoint.
- Habit Engine (2026-04-02 to 2026-04-03): major feature set across 7 phases. Includes: anonymous auth (Supabase), 5-screen onboarding flow (location permission → safety score → cycling goal → circuit route to nearest POI → deferred signup), post-ride impact summary (animated CO2/money/hazards counters with variable equivalents), streak engine (4AM cutoff, 5 qualifying actions, freeze mechanic), Impact Dashboard (StreakChain, AnimatedCounters, guardian tier progress), daily safety quiz (50+ questions), enhanced hazard reporting (2-tap FAB, armchair long-press, confirm/deny display), guardian tier system (reporter→watchdog→sentinel→guardian angel with auto-promotion trigger), milestone share cards, scheduled notifications (streak protection, weekly impact, social digest), community stats by locality. 6 new DB tables, 5 RPCs, 3 triggers, 26 reward equivalents seeded, 40+ new integration tests. All deployed to Cloud Run + Supabase.
- Multi-Stop Routes (2026-04-03): support for intermediate stops (waypoints) in route planning. Waypoints field added to RoutePreviewRequest, OSRM/Mapbox routing extended, Zustand store actions (add/remove/clear), discrete "Add stop" UI with autocomplete (max 3 stops), yellow waypoint markers on map. Works with both safe and fast routing modes.
- Session 4 features (2026-04-04): three features in a single session:
  - **Saved Routes**: Full-stack saved routes — `saved_routes` Supabase table with RLS, 4 API endpoints (GET/POST/DELETE/PATCH), API client methods, save button on route preview with name modal, saved routes list on route planning screen (shown when destination empty). Users can save frequently used routes and reload them with one tap.
  - **Waypoint Reordering**: `reorderWaypoints` store action + up/down chevron buttons on waypoint rows. Keeps `waypointQueries` labels synced with reordered coordinates.
  - **GPX Export**: `buildGpxString` utility generates GPX 1.1 XML from trip GPS breadcrumbs + planned route polyline. Export button on TripCard writes to cache via `expo-file-system` File API and opens native share sheet.
- Session 5 features (2026-04-04): major UX polish, i18n, voice guidance, and bug fixes:
  - **UX Polish**: Cleaner address labels (strip postal/country/region), streak chain left-to-right fill, navigation zoom 16→17.5, tighter FABs, softer hazard zones (dark red + lighter red), Roboto body font (replacing DM Sans)
  - **Collapsible UI**: Tap map on route-planning to toggle FABs, weather, bottom nav with fade animation
  - **Profile Photo Upload**: expo-image-picker + Supabase Storage avatars bucket + avatar display with dashed placeholder
  - **Voice Guidance**: 200m pre-announce, ETA every 5min, tap ManeuverCard to re-announce
  - **Romanian i18n**: Full i18n framework — en/ro translation files (~300 keys), useT() hook, language picker in Profile. Wired into all 16+ screens: navigation, feedback, auth, settings, history, trips, community, profile (including all toggle descriptions, POI categories, bike types, frequencies, sign-out alert)
  - **Hazard Source Field**: in_ride/manual/armchair distinguishes how hazards were reported. DB migration + API schema update
  - **Fix: Stale Navigation Metrics**: Navigation distance/ETA/climb no longer freeze after off-route or reroute. Root causes: appState reset during reroute, frozen step index when off-route, missing lastPreAnnouncementStepId reset. 5 diagnostic tests
  - **Tech Debt**: Deduplicated qualifyStreakAsync into shared lib/streaks.ts
  - **EAS Build**: Set up Expo EAS project, preview build profile, Mapbox download token hook, internal distribution APK pipeline
- Session 5 continued (2026-04-04 to 2026-04-05): features, push notifications, trip comparison, microlives:
  - **Multi-stop Reroute**: Strips already-passed waypoints from reroute request based on rider position on polyline. 4 tests.
  - **Push Notifications**: expo-notifications installed, NotificationProvider wired with tap-to-navigate, push token registration on sign-in
  - **Trip Comparison**: Select 2 trips from history, side-by-side stats (distance, duration, speed, CO2, mode) + map with GPS trail
  - **Personal Safety Map Overlay**: FAB toggle shows past ride GPS trails on planning map (safe=green, fast=blue, 40% opacity)
  - **Hazard Alert Sharing**: Share button on hazard report toast opens native share sheet with location
  - **Microlives Phase 0-3**: Complete gamification engine:
    - Core calculation module (`microlives.ts`): personal microlives (0.4 ML/km × vehicle × AQI), community seconds (4.5s/km × vehicle). 25 unit tests.
    - Database: `ride_microlives` table, `community_seconds_daily`, profiles extended with `total_microlives`/`total_community_seconds`/`microlife_tier`
    - RPC: `record_ride_microlives` (compute, store, accumulate, community upsert)
    - Server: ride impact endpoint calls microlives RPC, impact dashboard returns totals
    - Post-ride: microlives + community seconds in ImpactSummaryCard (single merged card)
    - Home screen: TimeBankWidget (compact one-row, matching weather font)
    - History: microlives row in impact card + community seconds stat
    - Impact dashboard: Time Bank section with animated counters
    - Stats dashboard: life earned (min) and donated to city (sec) summary cards
    - Route preview: estimated life earned in summary row (gold accent)
    - Community stats: donated to city tile
    - FAQ: 3 entries explaining Microlives, community seconds, Time Bank
    - Cloud Run redeployed with microlives API
- Badge System Phase 2 (2026-04-05): evaluation engine + API endpoint, server-side only:
    - Migration `202604050004_badge_evaluation.sql`: Updated `record_ride_impact` RPC to accept 7 new optional ride-context fields (elevation_gain_m, weather_condition, wind_speed_kmh, temperature_c, aqi_level, ride_start_hour, duration_minutes); uses ON CONFLICT upsert to stay idempotent while still accumulating profile totals only on genuine inserts
    - `check_and_award_badges(p_user_id UUID)` RPC: evaluates all ~140 badge criteria in a single call — loads profile, streak, ride aggregates, social counts, quiz stats, hazard specialisation, seasonal counts upfront, then PL/pgSQL conditionals for each badge family; inserts into user_badges (ON CONFLICT DO NOTHING); returns JSONB array of newly awarded badge definitions
    - Coverage: Firsts, Distance/Time/Ride count (cumulative), Streak, Early Bird / Night Owl / Monthly, CO2/Money/Microlives/Community Seconds, Hazards/Validators/Specialists, Quiz (with perfect-day and 3-consecutive perfect-day detection), Climbing, Athletic one-timers, Weather/AQI, Social, Seasonal, Annual events, Hidden badges (mirror_distance, round_number, same_origin_dest_7, five_am, friday_13, pi_day, leap_day)
    - POST /v1/rides/:tripId/impact: extended body schema with optional metadata fields; calls updated RPC; calls `check_and_award_badges` after recording (non-fatal); returns `newBadges` in response
    - GET /v1/badges: returns badge definitions catalog + user's earned badges + progress toward unearthed badges (computable locally from ride/profile aggregates); no new RPC needed
    - contracts.ts: `RideImpact` extended with `newBadges: readonly BadgeUnlockEvent[]`; added `BadgeResponse` type
    - api.ts: `recordRideImpact` extended with optional `meta` object; `fetchBadges()` added
    - All TypeScript checks pass clean (API + mobile)
- Badge System Phase 3 — Trophy Case UI + celebration + cleanup (2026-04-05 to 2026-04-06):
    - **Trophy Case screen** (`app/achievements.tsx`): 3-column FlatList grid with category tab filtering (All + 8 categories), sort order (earned+new → in-progress → locked first 6 → secret ???), badge detail modal on tap
    - **Design system components**: BadgeCard molecule (grid cell), BadgeInlineChip atom (compact pill), TrophyCaseHeader organism (earned/total + progress bar + recent unlock), CategoryTabBar organism (9 horizontal scrollable tabs with counts), BadgeDetailModal organism (bottom sheet with lg icon, tier, flavor text, criteria, progress bar, rarity, share)
    - **BadgeUnlockOverlay**: Full-screen celebration with spring shield animation, 14-particle tier-colored burst, staggered text fade-in, tap-to-dismiss. BadgeUnlockOverlayManager in root layout reads from appStore queue, max 2 per session, suppressed during NAVIGATING
    - **BadgeShareCard**: Capturable 320px share card (bgDeep, accent border, brand logo, lg badge icon). Share via native Share API from detail modal
    - **Post-ride integration**: ImpactSummaryCard shows "BADGES EARNED" section with staggered badge icons + "View all achievements >" link. Feedback screen enqueues newBadges into appStore for overlay manager
    - **Impact Dashboard integration**: "Recent Badges" horizontal scroll section with 5 most recently earned badges + "View all >" link
    - **Profile integration**: "Achievements" row below user card with trophy icon, badge count, progress bar, tap navigates to Trophy Case
    - **appStore**: Added `pendingBadgeUnlocks` (persisted) with `enqueueBadgeUnlocks()`, `shiftBadgeUnlock()`, `clearBadgeUnlocks()`
    - **useBadges hook**: TanStack Query hook for GET /v1/badges with 5min stale time
    - **Guardian Tier removal**: Removed the entire guardian_tier system (reporter→watchdog→sentinel→guardian_angel) from contracts.ts, profile.tsx, impact-dashboard.tsx, history.tsx, user-profile.tsx, FeedCard.tsx, MilestoneShareCard.tsx, feedSchemas.ts, feed.ts, v1.ts. Tier milestones removed from milestone detection
    - **Microlives badges removal**: Removed 9 badge definitions (Time Banker I-V, Community Giver I-IV), dropped microlife_tier column, removed icons from badgeIcons.ts. Badge count: 146→137
    - **TimeBankWidget removal**: Removed microlives widget from route planning screen + its dashboard query
    - **Badge evaluation fixes**:
        - `check_and_award_badges` now counts from `trips` table (GREATEST with ride_impacts) so first_ride triggers even before ride_impacts row exists
        - Created missing `quiz_answers` table that was crashing the function
        - Fixed PL/pgSQL array concatenation (`|| ARRAY['x']` instead of `|| 'x'`)
        - Badge check runs on: GET /v1/badges (Trophy Case visit), GET /v1/impact-dashboard (post-ride), GET /v1/rides/:tripId/impact (auto-create path)
    - **Auth fixes**: GET /v1/badges and GET /v1/impact-dashboard changed from `requireWriteUser` to `requireAuthenticatedUser` to support anonymous Supabase users
    - **Rate limit fix**: GET /v1/badges changed from `write` to `routePreview` policy to prevent 429s
    - **Schema fix**: Removed `guardianTier` from feedSchemas.ts response schemas (was causing 500 on GET /v1/profile)
    - Deployed to Cloud Run (revisions 24-31) + Supabase migrations applied

- Design System Overhaul (2026-04-06):
    - **SWOT analysis**: Full design system audit documented in `design-work/design-system-analysis.md` — token coverage, component inventory, theme adoption, implementation drift scoring (6.2/10 → improved)
    - **New tokens**: `tints.ts` (opacity scale + 16 brand/safety/surface rgba tints), `iconSize.ts` (7 standardized sizes from xs to 3xl), `zIndex.ts` (7 semantic layers from base to supreme)
    - **New components**: `Card` atom (solid/glass/outline variants), `SectionTitle` atom (accent/muted variants with a11y header role), `SettingRow` molecule (label + description + animated Toggle with haptics)
    - **Hardcoded color cleanup**: Replaced 50+ hardcoded hex colors with token references across 9 screens, 20 inline rgba() values with tint tokens across 7 screens, 11 hardcoded z-index values across 8 files
    - **Profile refactor**: Replaced 9 inline toggle implementations with `SettingRow`, 7 section titles with `SectionTitle`, removed ~30 lines of dead styles
    - **Full theme migration**: All 30 screens now use `useTheme()` + `createThemedStyles(colors)` factory pattern (was 4/30). Eliminated `brandColors`/`darkTheme` direct imports from all screens except `_layout.tsx` (intentional — renders before ThemeProvider). Removed legacy `mobileTheme` bridge imports
    - **Testing infrastructure**: Added `vitest.config.ts` + `vitest.setup.ts` for mobile app, `@testing-library/react-native` + `react-test-renderer`. SettingRow has 12 passing unit tests
    - **Map overlay fix**: Preserved intentional `#FFFFFF` on route-planning map cards (origin, destination, search, FABs, waypoints) — these sit on the dark map and must stay white regardless of theme

- UX Polish session (2026-04-06):
    - **Maneuver icons**: Replaced Unicode text arrows (↑←→◎) in `NavigationHUD` (ManeuverCard, ThenStrip, FooterCard) with Ionicons directional icons (`arrow-up`, `arrow-back`, `arrow-forward`, `location`, `return-up-forward`) — faster recognition while cycling
    - **Streak flame icon**: Replaced "~" placeholder in `StreakCard` with `Ionicons name="flame"` (yellow, 24px)
    - **Bottom sheet peek state**: `MapStageScreen` now accepts a `peekContent` prop (max 60px height). When the CollapsibleSheet is collapsed, the peek row renders below the drag handle so key info stays visible. `route-preview.tsx` passes a compact strip: mode badge + distance + duration + "Swipe up" hint
    - **Long-press discoverability hint**: Route planning screen shows a 4-second auto-dismiss pill "Long-press map to drop a pin" on mount. Dismisses immediately when user long-presses. Non-interactive (`pointerEvents="none"`)
- Bug fixes (same session, post phone test):
    - **Peek state stale closure**: `CollapsibleSheet` panResponder captured `effectiveCollapsed = 48` on first render (before route loaded, `peekContent` was null). Fixed by replacing the local variable with a ref (`effectiveCollapsedRef.current`) so panResponder closures always read the current value
    - **ExpoPushTokenManager noise**: Added `NativeModules.ExpoPushTokenManager` guard in `push-notifications.ts` and `NotificationProvider.tsx` before the lazy `require()`. The JS module loads fine in dev builds without a native rebuild, but any call throws — the NativeModules check prevents the require entirely

- Bug hunt session (2026-04-06):
    - Systematic static analysis (3 parallel agents) across all major screens, API routes, and data flow identified 8 confirmed bugs
    - **Community comments author**: `GET /comments` Supabase select was missing `username` from profiles join — comments always showed display_name or "Rider" instead of `@username`. Added `username` to select.
    - **Voice guidance stale closure**: `speak()` was a plain function (not memoized). Multiple useEffects called it without listing it as a dependency — after mute/unmute, active effects used old closure until next GPS tick. Wrapped in `useCallback` and added to all dep arrays.
    - **Orphaned offline mutations**: When `trip_start` fails and is killed, dependent `trip_end`/`trip_track` mutations were permanently stuck as pending (skipped every 15s flush, never cleaned up). Added cascade-kill logic in `OfflineMutationSyncManager`.
    - **PATCH /profile not rate-limited**: All other write endpoints call `applyRateLimit`; profile update did not. Added write-bucket rate limit.
    - **Hazard validate not rate-limited**: `POST /hazards/:id/validate` (confirm/deny) had no rate limit — could spam hazard votes. Added write-bucket rate limit.
    - **Hazard toast timer leak**: Two `setTimeout` calls for toast auto-dismiss not tracked or cleared on unmount. Added `hazardToastTimerRef` with proper cleanup.
    - **Reverse geocode race on double long-press**: Rapid successive long-presses could overwrite destination label with stale first-press geocode. Added `geocodeNonceRef` to cancel stale results.
    - **Safety score returns 100 for no-data areas**: When no road risk segments exist in the area, score was `100 - 0 = 100` (falsely "perfectly safe"). Fixed: return `score: 0` when `totalSegments === 0`.
    - **Pre-existing test failures fixed**: riskDistribution label ("Safe" → "Very safe"), safety-score field names (safestCount → safeCount), safety-score score formula (100 − avg_score), record_ride_impact RPC params (7 new optional fields), impact-dashboard guardian tier assertions (tier removed in Phase 3).
    - All tests now pass: packages/core 276/276, services/mobile-api 205/205. Bundle check ✅. TypeScript clean.

- Bug hunt round 2 + comments fix (2026-04-06):
    - **Comments broken (critical)**: `GET /feed/:id/comments` used Supabase embedded join `profiles(...)` but `feed_comments.user_id` references `auth.users`, not `profiles` — no FK exists. PostgREST failed silently → 502 → "No comments yet". Fixed: two-step query (fetch comments, batch-fetch profiles by user IDs, merge). Added `in` to Supabase test mock chain.
    - **Impact dashboard stripped microlives**: `additionalProperties: false` in response schema was missing `totalMicrolives` and `totalCommunitySeconds` properties → Fastify silently dropped them. Client never received microlives data.
    - **thisWeek.hazardsReported hardcoded to 0**: Handler ignored RPC data, returned literal `0`. Fixed to read `thisWeek?.hazardsReported`.
    - **Dismissed hazard IDs persist across nav sessions**: `dismissedHazardIdsRef` was never cleared. After finishing a ride and starting a new one, hazards dismissed on the first ride were still suppressed. Fixed: clear the ref on component unmount.
    - **Comment count stale in feed after posting**: `usePostComment` invalidated queries but didn't update the cached `commentCount` on the feed item. Going back to feed showed old count. Fixed: optimistic increment via `setQueriesData`.
    - **Settings route TS error**: `href="/onboarding/index"` → `href="/onboarding"`. Pre-existing TS compilation error resolved.
    - Deployed Cloud Run revisions 00032 through 00035. All tests pass (276 core + 205 API). TypeScript fully clean (0 errors). Bundle ✅.

- UX Design Plan Implementation (2026-04-06):
    - **Phase 1.4 Accessibility**: `textMuted` contrast improved `#6B7280` → `#8B9198` for WCAG AA. Added `accessibilityRole`/`accessibilityLabel` to 27+ Pressable elements across 6 screens (route-planning, route-preview, navigation, history, profile, community)
    - **Phase 1.1 Legacy theme migration**: Migrated 6 remaining `mobileTheme` consumers (FeedCard, SafetyBadge, SafetyTagChips, NavigationChrome, StatusCard, PlaceSearchField) to design system tokens. Deleted `apps/mobile/src/lib/theme.ts` — zero `mobileTheme` references remain in codebase
    - **Phase 1.2 Semantic colors**: Replaced hardcoded hex (`#F2C30F`, `#22C55E`, `#F59E0B`, `#ca8a04`) with token references (`colors.accent`, `colors.safe`, `colors.caution`, `safetyColors.caution`) in route-preview and SafetyBadge
    - **Phase 1.3 Diagnostics purge**: Removed Coverage + Sync status badges from route-preview topOverlay. Removed dead diagnostic chip variables (GPS, Sync, Step counter, BG status) from navigation.tsx
    - **Phase 1.5 Interaction quality**: Created `FadeSlideIn` animation atom (opacity + translateY, 200ms, respects reduced motion). Created `useReducedMotion` hook (re-export). Created `haptics.ts` utility with lazy NativeModules guard
    - **Phase 2 Calm route planning**: Progressive disclosure — origin card + routing toggles hidden until destination set. FABs reduced from 6 to 3 (Locate, Hazard, Saved Routes). EDIT text → pencil icon. Weather widget conditional (destination set OR severe conditions)
    - **Phase 3 Profile restructure**: Settings grouped into 3 sections (Cycling Preferences, Display, Account) with SectionTitle atoms. Added i18n keys for en + ro
    - **Phase 4 Systems polish**: Rating skip counter — auto-suppresses rating step after 3 skips (persisted in Zustand). Route comparison card: now always shows when toggle ON — handles small differences ("Slightly safer", "Similar safety") instead of rounding to 0% and hiding
    - Bundle ✅. TypeScript clean (0 new errors). Phone-tested on Samsung S23 Ultra
    - **Phase 2 continued**: "Show nearby" quick-pick sheet — NearbySheet organism with 7 toggleable POI category chips (Parking, Rental, Water, Repair, Restroom, Supplies, Bike lanes). Layers FAB on route planning screen. Syncs with existing poiVisibility store.
    - **Phase 3 — FeedCard simplification**: Removed SafetyTagChips and 4-column stats grid. Merged title + inline safety pill. Compact summary line (distance · duration · CO2).
    - **Phase 3 — History restructure**: Replaced large Impact card + StreakCard with compact 4-stat header (rides, km, streak, CO2). Trip list inlined via FlatList (was behind "View My Trips" button). Quiz + StatsDashboard moved to footer.
    - **Phase 3 — Visual softening**: Badge glow opacity 0.4→0.2, MilestoneShareCard border 2px→1px.

- Light/Dark Theme Support (2026-04-07):
    - **Theme picker**: Added `themePreference` ('system' | 'dark' | 'light') to Zustand store (persisted). Three-pill picker in Profile > Display section. Navigation always forces dark per spec rule (glare/battery/safety).
    - **Screen.tsx**: Converted from static `brandColors` to `useTheme()`. Header shell, background, text all adapt. Glass effect switches dark/light. Glow orbs dimmed in light mode.
    - **MapStageScreen.tsx**: Bottom sheet, handle, fixed footer all theme-aware. Dark glass vs white glass.
    - **Components migrated to useTheme()**: SettingRow, Toggle, TripCard, FeedCard, CommunityStatsCard, ElevationChart. All converted from hardcoded `darkTheme`/`brandColors` to `createThemedStyles(colors)` pattern.
    - **Profile fixes**: Replaced `surfaceTints.glass` (hardcoded dark rgba) with `colors.bgPrimary` on achievementsCard, userCard, settingRow, DropdownPicker. Language/theme pill borders use themed colors.
    - **Route preview**: Summary strip cleaned up (removed border/shadow, uses `bgSecondary`). Life-earned stat moved to its own row with heart icon.
    - **StatusBar**: Changed from `style="light"` to `style="auto"` to adapt.
    - **Elevation chart**: Converted card container to themed styles. SVG graph (blue line + gradient) works on both backgrounds.
    - Bundle ✅. Phone-tested on Samsung S23 Ultra in both light and dark modes.

- Elevation Data Refactor (2026-04-07):
    - **Replaced Open-Meteo with Mapbox Terrain-RGB**: All elevation data now comes from Mapbox terrain tiles, eliminating Open-Meteo API rate limit issues (HTTP 429).
    - **Server consolidation**: Removed Open-Meteo fallback from server. Added `getElevationGain()` using existing Terrain-RGB tile decoder. `/v1/elevation-profile` endpoint now returns `{ elevationProfile, elevationGain, elevationLoss }` in single response.
    - **Client simplification**: Deleted client-side `elevation.ts` (was calling Open-Meteo). `mapbox-routing.ts` now makes single server call for all elevation data.
    - **Require cycle fixes**: Fixed barrel import cycles in `Toggle.tsx` and `SettingRow.tsx` — now import `useTheme` directly from `ThemeContext.tsx` instead of design-system barrel.
    - **Benefits**: Zero external API calls for elevation (just Mapbox tiles which are CDN-cached), single source of truth, fewer network round trips.
    - Deployed to Cloud Run. Bundle ✅. Phone-tested.

- Bug fixes + voice guidance (2026-04-07):
    - **Post-ride impact screen showing 0 values**: Impact summary (microlives, CO2, EUR) displayed 0 for rides with actual movement. Two fixes: (1) trail distance computation now falls back to planned route distance when `calculateTrailDistanceMeters` returns 0 despite having breadcrumbs; (2) server enhancement effect no longer overwrites non-zero local impact values with zeros from unsynced trip data — keeps local computation but still accepts badges and equivalentText from server.
    - **Voice guidance step completion simplified**: On completing a turn, voice previously announced the completed step instruction + next step with distance (e.g. "Turn left, then in 200 meters turn right"). Now only announces the next step with distance (e.g. "In 200 meters, turn right") — the completed instruction is redundant since the rider already made the turn. No announcement for the final step before arrival (handled by arrival announcement).
    - **AnimatedCounter broken `setNativeProps`**: Post-ride impact counters (ML, CO2, EUR) showed "0" permanently despite correct subtitle text (e.g. "+13 minutes of life earned"). Root cause: `setNativeProps({ text: ... })` does not work on RN `Text` components — only on `TextInput`. The animation listener fired correctly but display never updated. Fix: replaced `setNativeProps` + ref approach with `useState` + `setDisplayText` in the animation listener. Counters now animate from 0 to actual values.
    - Bundle ✅. Preview APK built and installed on Samsung S23 Ultra.

- Comprehensive Test Coverage (2026-04-08):
    - **Mobile app tests expanded from 65 to 467** (total across all packages: 949). Fixed 5 pre-existing test failures and wrote 35 new test files.
    - **Hooks tests (9 files, 63 tests)**: useCurrentLocation, useBicycleParking, useBicycleRental, useBikeShops, useNearbyHazards, useWeather, usePoiSearch, useFeed, useBadges — covers permission handling, API mocking, error states, TanStack Query integration
    - **Lib tests (12 files, 151 tests)**: api (40 tests for all endpoints), weather (19 tests incl. WMO codes + AQI), mapbox-routing (15 tests for safe/fast/waypoints/enrichment), poi-search (13 tests for 6 POI categories), bicycle-parking/rental/shops (28 tests for Overpass parsing), offlineQueue (10 tests for all 6 mutation types), navigation-helpers (7 tests for tab routing), push-notifications (11 tests for NativeModule guard branches), daily-weather-notification (4 tests), env (4 tests)
    - **Design system tests (14 files, 120 tests)**: Atoms — Button (12), Badge (10), IconButton (7), Toggle (8), Card (5), SectionTitle (6), FadeSlideIn (7), BadgeIcon (12), BadgeProgressBar (9), BadgeInlineChip (6). Molecules — SearchBar (12), Toast (12), WeatherWidget (8), BadgeCard (7)
    - **Store tests expanded (8 → 76 tests)**: route lifecycle, waypoints, navigation session, offline queue, preferences, badge unlock queue, recent destinations, milestones, immutability checks, reset flow
    - **Pre-existing test fixes**: devAuth (isAnonymous field), mapbox-search (rewrote for Search Box API v1), useRouteGuard/index/AuthSessionProvider (happy-dom environment + mocks)
    - **Infrastructure**: added happy-dom, @testing-library/react, @testing-library/dom devDeps; extended vitest.setup.ts (ScrollView, ActivityIndicator, AccessibilityInfo, Dimensions, NativeModules mocks); pinned react-dom@19.2.1
    - All 949 tests pass. Bundle ✅. Phone-tested on Samsung S23 Ultra.

- Codebase Review + Phase 1 Stability Fixes (2026-04-08):
    - **Full 8-category audit**: Security, Errors & Crashes, Data Integrity, Performance, API Contracts, UX & Accessibility, Infrastructure, Code Quality. Overall score 6/10 with 5 P0, 33 P1, 37 P2, 24 P3 findings. Reports saved to `review-report-2026-04-08.md` and `action-plan-2026-04-08.md`.
    - **Phase 1 — Data Integrity & Stability (9 fixes)**:
        - `locale` added to Zustand persist whitelist — language no longer resets on cold start
        - Queue eviction second pass now protects `TRIP_CRITICAL_TYPES` — `trip_start` can no longer be dropped
        - `finishNavigation` guarded — only transitions to `AWAITING_FEEDBACK` when `navigationSession` is non-null
        - `queueTripEnd` wrapped in `useCallback` with proper deps — eliminates stale closure that could enqueue wrong trip data
        - `OfflineMutationSyncManager` interval no longer re-registers on every queue change — stable 15s flush cycle
        - `AuthSessionProvider` reduced from double auth subscription to single — eliminates race condition
        - `reorderWaypoints` uses immutable `slice`-based reorder instead of `.splice()` mutation
        - Navigation `speak` reads fresh `navigationSession` from store instead of stale closure
        - `fetchRiskMap` routed through `requestJson` — gets timeout, auth headers, and error handling
    - **Bonus fixes**: Removed `console.warn` in `AuthSessionProvider` (prod code)
    - **Test infrastructure fix**: `react-native/index.js` contains Flow syntax (`import typeof`) that Vite/Rollup cannot parse. Created `vitest.mock-rn.ts` shim and `resolve.alias` in `vitest.config.ts` — all 44 mobile test files now pass (was 28/44). Removed redundant 150-line `vi.mock('react-native')` from `vitest.setup.ts`.
    - **Worktree cleanup**: Pruned 5 stale worktrees + deleted 18 orphaned branches
    - All 949 tests pass (core 277, API 205, mobile 467). Bundle ✅. Phone-tested.

## Phase Status

### Phase 1: Shared core and backend foundation

- Status: Done
- Evidence:
  - `packages/core/src/*`
  - `services/mobile-api/src/routes/v1.ts`
  - `services/mobile-api/src/lib/*`

### Phase 2: Native route planning and preview

- Status: Largely done
- Evidence:
  - `apps/mobile/app/route-planning.tsx`
  - `apps/mobile/app/route-preview.tsx`
  - `apps/mobile/src/components/RouteMap.tsx`
  - `apps/mobile/src/components/Screen.tsx`
  - `apps/mobile/src/components/StatusCard.tsx`
  - `apps/mobile/src/lib/theme.ts`
  - elevation data fetched from server `/v1/elevation-profile` endpoint (Mapbox Terrain-RGB tiles)
  - route preview now shows a compact single-row summary with routing mode, ETA, distance, and total climb
  - client-side routing via direct Mapbox Directions (fast) and custom OSRM (safe) replaces backend dependency for route fetching

### Phase 3: Native turn-by-turn navigation

- Status: Largely done
- Evidence:
  - `apps/mobile/app/navigation.tsx`
  - `apps/mobile/src/hooks/useForegroundNavigationLocation.ts`
  - `packages/core/src/navigation.ts`
  - `apps/mobile/src/design-system/organisms/NavigationHUD.tsx` — ManeuverCard, FooterCard with "Then" strip, round control buttons
  - navigation HUD now shows current maneuver at top (standalone), "then" strip + metrics at bottom, and compact round control buttons on right rail
  - route guard transition fix allows NAVIGATING state during screen switch
  - RouteMap now uses `absoluteFillObject` for fullBleed mode so the map covers the entire screen and ManeuverCard overlays at the very top
  - all four floating control rail buttons (recenter, voice guidance, hazard report, end ride) now use a consistent `gray[800]` dark circle background at 44×44px
  - VoiceGuidanceButton compact icon wrapper resized from 48px to 44px and background changed from `rgba(255,255,255,0.12)` to `gray[800]` to match the other control buttons
- Remaining:
  - deeper physical-device validation of background/location behavior
  - final polish for spoken guidance and recovery edge cases

### Phase 4: Background and offline readiness

- Status: Largely done
- Evidence:
  - `apps/mobile/src/lib/backgroundNavigation.ts`
  - `apps/mobile/src/providers/NavigationLifecycleManager.tsx`
  - `apps/mobile/src/providers/OfflineMutationSyncManager.tsx`
  - `apps/mobile/app/offline-maps.tsx`
  - Android emulator validation now confirms active background status, persisted fix updates, and ready state for a downloaded offline route pack
  - physical Android validation now confirms:
    - `API reachable: Yes`
    - `Signed in for writes: Yes`
    - `Background location: granted`
    - authenticated queued-write drain under real connectivity loss on-device
    - locked-screen/background movement detection on-device, with a recorded movement distance of `216 m`
    - selected-route offline pack download on-device until `Offline-ready for selected route: Yes`
    - active route/map continuity on-device with both Wi-Fi and mobile data disabled
- Remaining:
  - stabilizing the Android bridgeless dev-client bundle download path so validation is running the newest JS bundle
  - iPhone/device-parity validation for background and offline behavior

### Phase 5: Scale hardening and rollout

- Status: In progress
- Evidence:
  - tests and typechecks exist
  - native auth is now wired through the mobile app
  - mobile API now enforces auth on persisted write endpoints
  - root validation scripts and GitHub Actions CI are now configured
  - Expo app variants and EAS build profiles now exist
  - Sentry/PostHog-ready mobile observability is now wired through the app shell
  - structured mobile API request telemetry is now logged for key endpoints
  - route preview and reroute responses are now cached server-side with TTL controls
  - preview, reroute, and authenticated write endpoints are now rate limited
  - Redis-backed shared cache/rate-limit storage is now available for multi-instance deployment
  - native Android emulator build now launches successfully from the short-path staging flow
  - in-app Diagnostics is reachable on the emulator and reports environment, permissions, queue/offline state, and API reachability
  - Android background navigation crash was fixed by adding `RECEIVE_BOOT_COMPLETED` to the native app permissions
  - mobile write requests now use a native `XMLHttpRequest` path on React Native instead of relying solely on `fetch`
  - the offline mutation sync manager now applies a hard watchdog timeout so queued writes cannot remain `syncing` forever in code
  - Diagnostics now surfaces queued-mutation error text and uses a timed API health probe instead of an unbounded fetch
  - Diagnostics now records queue-button press count, last attempt time, last result, and last queued trip id so Android sync validation has a visible invocation signal
  - developer sample-write queuing is now a first-class Zustand store action with test coverage instead of opaque screen-local mutation logic
  - the short-path Android validation script now starts Metro explicitly, waits for health, and keeps the staged workspace rooted in `apps/mobile`
  - Metro now blocklists the legacy web app entry, components, hooks, and services so the native bundle stays inside the mobile workspace instead of pulling `import.meta.env`-based web modules
  - the staged Metro session now bundles the mobile app successfully from the short-path copy
  - the validator now supports a release / embedded-bundle path via `npm run android:validate:native:release` to avoid depending on the bridgeless dev-client downloader
  - the release validator now forces `EXPO_NO_METRO_WORKSPACE_ROOT=1`, which fixes Expo embedded bundling for the monorepo mobile workspace
  - the validator now falls back to a fresh short-path sibling directory if the previous staging folder is still locked by Gradle artifacts
  - the mobile workspace now uses a single React version across root and mobile dependencies, which fixes the prior release-only invalid hook crash in `AuthSessionProvider`
  - the release APK now builds and installs successfully from `C:\dpm`, and the emulator reaches the live location permission prompt instead of crashing on startup
  - the Android validation script now rewrites the staged mobile API URL to `http://127.0.0.1:8080` and configures `adb reverse` so the release validator no longer depends on `10.0.2.2`
  - a local Expo config plugin now injects `android:usesCleartextTraffic="true"` into the generated manifest for validation builds that target a local HTTP API
  - the mobile request layer and Diagnostics health probe now fall back across `fetch` and `XMLHttpRequest`, which makes native emulator transport failures visible and more recoverable
  - authenticated queued-write drain is now validated end to end on the Android emulator by stopping the host API, queueing sample writes locally, restarting the API, and confirming the queue returns to `0`
  - GitHub Actions now includes a manual `Mobile Release` workflow that validates the repo and queues EAS builds with optional auto-submit
  - EAS submit defaults now target Android `internal` for preview builds and Android `production` as `draft` for production builds
  - the repo now includes a runnable `mobile-api` load-test harness with smoke, steady, and burst profiles plus JSON report output
  - the repo now includes a mobile API operations runbook covering Docker/Cloud Run rollout, Redis cutover, smoke/steady load tests, and rollback guidance
  - the local smoke load test now passes against `http://127.0.0.1:8080` and writes reports into `output/load-tests/`
  - an isolated local route-core baseline now passes smoke, steady, and burst load tests and is documented in `mobile_api_load_test_baseline.md`
- Missing:
  - production-scale Redis-backed staging load testing at target concurrency and burst levels
  - iPhone validation
  - final store-side release rehearsal on real credentials plus iPhone evidence
  - a fully working debug-mode Android dev-client launch on the emulator after the bundle downloader `ProtocolException` is resolved

## Current Focus

- Completed: native auth, authenticated mobile API writes, CI wiring, EAS build setup, baseline observability, API-side rate limiting/caching, and shared Redis-ready backing
- Completed in validation: Android emulator availability confirmed, direct long-path native build failure documented, short-path validation workflow added, Mapbox native Android build wiring fixed, app launch confirmed on emulator, diagnostics verified, background navigation crash fixed, and selected-route offline pack download verified
- Completed in validation: the Android release path now reuses the short-path workspace cleanly, builds with embedded JS, installs, and reaches the in-app permission prompt without the earlier release startup crash
- Completed in hardening: dev-only authenticated sync QA helpers are in place, including developer auth bypass, a Diagnostics sample-write queue button, queue-action instrumentation, a tested store-backed sample-write action, offline sync stale-state recovery, a sync watchdog timeout, timed Diagnostics health checks, localhost API routing through `adb reverse`, and manifest-level cleartext support for staged native builds
- Completed in hardening: Diagnostics now persists recent background fixes, summarizes detected movement while the phone was locked/backgrounded, and shows whether the selected route already has a ready offline pack
- A physical-device checklist now exists in `physical_android_validation.md`, and the Android validator supports explicit `-DeviceSerial` targeting for phones
- Completed in validation: a physical Android device now confirms Diagnostics connectivity, signed-in persisted-write eligibility, granted background location permission, queued-write drain after real on-device connectivity loss and reconnect, locked-screen movement detection, selected-route offline-pack readiness, and offline map continuity with connectivity disabled
- Completed in rollout: a manual GitHub Actions mobile-release workflow now validates the repo, queues EAS builds, and supports optional auto-submit for preview or production profiles
- Completed in rollout: the repo now has a `mobile-api` operations runbook and a runnable smoke/steady/burst load-test harness with report output
- Completed in UI parity: the native app now uses a branded dark/yellow design system, custom mobile hero headers, improved route alternative cards, branded auth/onboarding screens, and more web-aligned styling on the main planning/preview/navigation/offline/feedback flows
- Completed in UI parity: route planning and route preview now use a map-first native layout with floating top controls and a bottom-sheet panel instead of the earlier stacked-card layout
- Completed in UI parity: navigation now uses a stronger web-style overlay hierarchy, and auth/onboarding/settings/offline maps have been rebuilt away from plain scaffold cards toward modal/menu/full-screen branded surfaces
- Completed in UI parity: feedback and diagnostics now use the same branded layout language, metric tiles, and stronger CTA hierarchy instead of falling back to plain QA-style screens
- Completed in navigation stability (2026-03-23): useRouteGuard now locks once it initially passes, preventing Zustand persist hydration race from bouncing users back to route planning 1-3 seconds after starting navigation
- Completed in feedback flow (2026-03-23): fixed mobile-api missing `SUPABASE_ANON_KEY` which caused all authenticated dev-build requests to return 401; feedback submissions now reach the `navigation_feedback` table in Supabase
- Completed in feedback UX (2026-03-23): feedback screen now shows a thank-you card (🙏 emoji + gratitude message + yellow #FDD700 "Done" button) after successful submission before returning to route planning
- Completed in repo cleanup (2026-03-23): deleted unused root `index.js`; simplified `metro.config.js` by removing the legacy webapp blocklist since those source files were already deleted
- Completed in routing: client-side route fetching now calls Mapbox Directions (fast) and custom OSRM (safe) directly from the mobile app, with elevation sampling via Mapbox Tilequery for total climb calculation
- Completed in UI parity: route preview now displays a compact single-row summary (mode, ETA, distance, total climb) instead of multiple stacked cards
- Completed in UI parity: navigation HUD redesigned with standalone ManeuverCard at top, FooterCard with inline "Then" strip and metrics at bottom, and round gray control buttons (GPS recenter, end ride X) on right rail
- Completed in navigation: route guard transition fix resolves the catch-22 where starting navigation redirected back to route planning
- Completed in ride reporting: navigation now keeps the web-style right-rail hazard button, but opens a native hazard-type picker for bike-safety categories such as blocked bike lane, pothole, narrow street, dangerous intersection, aggressive traffic, and other context before queueing the same Supabase-backed `hazards` write
- Completed in schema prep: `supabase_add_hazard_type.sql` now adds a nullable `hazard_type` column plus a value check constraint for the supported mobile hazard categories
- Completed in dev workflow (2026-03-23): local development now requires `adb reverse tcp:8080 tcp:8080` for the mobile-api and `adb reverse tcp:8081 tcp:8081` for Metro when testing on a physical Android device via USB
- Completed in risk visualization (2026-03-23): new `RiskDistributionCard` component shows a distance-weighted percentage breakdown across 7 risk categories (Very safe → Extreme) with a colored stacked bar and legend. Uses `computeRiskDistribution()` from `packages/core/src/riskDistribution.ts` which calculates Haversine distances per segment and classifies by risk score thresholds
- Completed in risk visualization (2026-03-23): new `/v1/risk-segments` server endpoint accepts a GeoJSON LineString and returns risk segments via the Supabase `get_segmented_risk_route` RPC. Client-side `directPreviewRoute` now calls this endpoint after fetching routes to enrich them with risk data
- Completed in risk visualization (2026-03-23): risk distribution card appears in route preview only (inside the scrollable bottom sheet above fixed buttons); removed from navigation screen
- Completed in elevation visualization (2026-03-23): new `ElevationChart` SVG area chart component renders the per-point elevation profile in route preview, below the risk card. Uses `react-native-svg` (already in deps). New `/v1/elevation-profile` server endpoint returns the full elevation array from `getElevationProfile()`. `RouteOption` contract extended with optional `elevationProfile: number[]` field. Client-side `enrichRouteWithElevation` now fetches the profile from the server alongside the existing gain calculation
- Completed in infrastructure (2026-03-23): fixed Supabase `road_risk_data` table missing `SELECT` grant for `service_role`; replaced placeholder `SUPABASE_SERVICE_ROLE_KEY` with real JWT in mobile-api `.env`
- Completed in bicycle parking (2026-03-24): new Overpass API client (`bicycle-parking.ts`) fetches `amenity=bicycle_parking` from OpenStreetMap within a bounding box around the route. New `useBicycleParking` hook wraps the fetch in TanStack Query with 5-minute stale time. RouteMap renders parking locations as blue circle markers with "P" label via ShapeSource + CircleLayer + SymbolLayer, visible at zoom level 12+. Tapping shows a callout. Markers appear on all three screens: route planning, route preview, and navigation
- Completed in safe area (2026-03-24): replaced `SafeAreaView` from `react-native` (iOS-only, no-op on Android) with `useSafeAreaInsets` from `react-native-safe-area-context` in MapStageScreen, NavigationScreen, and Screen components. App content now properly respects the status bar and system navigation buttons on Android
- Completed in voice guidance (2026-03-24): voice guidance default changed from on to off (`voiceGuidanceEnabled: false` in appStore initial state). Compact voice toggle icon (icon-only, matching navigation screen style) added to route planning and route preview right overlay
- Completed in navigation metrics (2026-03-24): FooterCard climb metric now shows **remaining climb** that decreases in real-time as the user progresses, computed from `elevationProfile` + `remainingDistanceMeters`. Live values display as `↑X m ▼` (with down arrow), static fallback (when no elevation profile) shows `~↑X m` (with tilde prefix). New `computeRemainingClimb()` pure function added to `packages/core/src/navigation.ts`
- Completed in trip tracking (2026-03-26): new `trip_tracks` table in Supabase records GPS breadcrumbs (`gps_trail` JSONB), planned route polyline (`planned_route_polyline6`), routing mode (safe/fast), end reason (completed/stopped/app_killed), start/end timestamps, and planned distance. `NavigationLifecycleManager` samples GPS every 5 seconds during navigation and stores breadcrumbs in Zustand. On trip end, `OfflineMutationSyncManager` flushes the track to `POST /v1/trips/track`. New `TripHistoryItem` type in core contracts. New `/v1/trips/history` GET endpoint returns user's trips ordered by date
- Completed in trips screen (2026-03-26): new `/trips` screen shows a scrollable feed of all user rides fetched from `trip_tracks`. Each row shows date, distance, duration, routing mode badge (Safe/Fast), and end reason icon. Tapping a row expands it to reveal an interactive Mapbox map showing the GPS trail (blue line) and planned route (green for safe, red for fast). FlatList scroll is disabled when a trip is expanded so map gestures don't conflict with list scrolling. RouteMap extended with `trailCoordinates`, `plannedRouteCoordinates`, and `plannedRouteColor` props for rendering trip replay lines. History screen updated with "View My Trips" button navigating to `/trips`
- Completed in bottom sheet UX (2026-03-24): CollapsibleSheet footer (Start Navigation + Back to Planning buttons) now stays visible even when sheet is collapsed; only the scrollable content (route summary, risk card, elevation chart) hides when user drags down. Route planning destination selection now centers map on selected location and dismisses keyboard via `Keyboard.dismiss()`
- Completed in community feed (2026-03-27): merged community feed feature from `claude/add-grill-me-community-feed-TBegi` branch into main. Community screen now shows "Explore Feed" button navigating to `/community-feed`. Feed displays location-based shared trips with likes and comments. New files: `community-feed.tsx`, `community-trip.tsx`, `FeedCard.tsx`, `LikeButton.tsx`, `SafetyBadge.tsx`, `SafetyTagChips.tsx`, `useFeed.ts`, `safetyTagGenerator.ts`, `feedSchemas.ts`, `feed.ts` API routes. Supabase migration `202603260001_community_feed.sql` creates `trip_shares`, `trip_likes`, `trip_comments`, and `user_profiles` tables
- Completed in auto-sharing (2026-03-27): trips are now auto-shared to the community feed when navigation ends, unless user has disabled sharing. New `trip_share` queued mutation type enqueues share data (route polyline, distance, duration, elevation, safety tags) alongside trip_end. `shareTripsPublicly` toggle in Profile screen (default: on) controls auto-sharing behavior. Setting persisted via Zustand
- Completed in profile (2026-03-27): Profile screen rebuilt with user card (email + sign-in status), "About you" section with dropdown pickers for bike type (Road/City/Mountain/E-bike/Recumbent) and cycling frequency (Daily → More rarely than once per month), "Routing preferences" section with "Avoid unpaved roads" toggle (wired to OSRM `&exclude=unpaved` parameter for safe-mode routes), and "Privacy" section with share trips toggle. All preferences persisted via Zustand. Modal dropdown picker uses dark theme with yellow accent for selected option
- Completed in routing (2026-03-27): "Avoid unpaved roads" preference flows from Profile toggle → appStore → route-preview request → `directPreviewRoute()` → `fetchOsrmRoutes()` which appends `&exclude=unpaved` to the OSRM API URL when enabled. Already supported by the OSRM backend's safety profile for `surface=unpaved/gravel/dirt` OSM tags
- Completed in bottom sheet UX (2026-03-27): CollapsibleSheet footer (Start Navigation + Back buttons) now renders outside the animated sheet so it stays fixed and tappable even when the sheet is fully collapsed. PanResponder rewritten with `expandedRef` to fix stale closure bug that made drag feel resistive. Drag gesture now applies to entire sheet body, not just the handle. Handle touch area enlarged with padding for easier tapping. Sheet reduced from 70% to 65% of screen height
- Completed in layout (2026-03-27): MapStageScreen right overlay moved from `top: 34%` to `top: 50%` to prevent voice/parking buttons overlapping the search bar. Route planning footer button padding reduced so "Preview route" button sits closer to BottomNav
- Completed in profile (2026-03-27): bike type selection now auto-enables "Avoid unpaved roads" for Road bike, City bike, and Recumbent. Mountain bike auto-disables the toggle. "Other" added as a bike type option. User can always manually override the toggle afterward
- Completed in hazard alerts (2026-03-27): Waze-style hazard proximity warnings during navigation. New `useNearbyHazards` hook fetches hazards within 1km from `/v1/hazards/nearby` API (PostGIS bbox query on Supabase). Navigation screen detects when user approaches a hazard within 100m and shows a `HazardAlert` card with hazard type icon, distance, and "Still there?" Yes/No buttons. Tapping Yes increments `confirm_count`, No increments `deny_count`, passing without responding increments `pass_count`. New `hazard_validations` table tracks per-user votes (unique per hazard+user). Hazard markers shown on map as orange warning circles with "!" label via ShapeSource + CircleLayer + SymbolLayer. New Supabase migration adds `confirm_count`, `deny_count`, `pass_count`, `last_confirmed_at`, `expires_at` columns to `hazards` table
- Completed in navigation camera (2026-03-27): Google Maps-style 3D follow camera during navigation. Mapbox Camera switches to `followUserLocation` + `followUserMode: 'course'` + `followPitch: 45` + `followZoomLevel: 16` when following user. Camera auto-rotates to match travel direction (GPS heading). Native `LocationPuck` with `puckBearing="course"` replaces manual circle marker during navigation. Tapping map breaks follow (flat overview), recenter GPS button resumes 3D follow. Route planning and preview remain flat top-down
- Completed in deployment (2026-03-27): mobile-api deployed to Google Cloud Run at `https://defpedal-api-1081412761678.europe-central2.run.app` (europe-central2, same region as OSRM server). Docker image built via Cloud Build and stored in Artifact Registry. Standalone release APK built from `C:\dpb` short path (workaround for Windows 260-char CMake limit) with `newArchEnabled: false` and `APP_VARIANT=preview`. Installed as "Defensive Pedal Preview" for untethered testing without USB/Metro
- Completed in navigation UX (2026-03-28): navigation menu button now expands inline icons (History, Community, Profile) on the right rail instead of a BottomNav overlay. Tapping an icon navigates via `router.push` keeping the navigation session alive. New `navigation-helpers.ts` shared module routes "Map" tab to `/navigation` when a trip is active or `/route-planning` otherwise — all screens (history, community, profile, trips) use this helper so trips persist across tab switches
- Completed in route preview cleanup (2026-03-28): removed BrandLogo, "Defensive Pedal" / "Route preview" text, top Back button, and voice guidance button from route preview screen. Only badge row (coverage, routing mode, sync status) remains at top. Cleaner map-first layout
- Completed in route planning cleanup (2026-03-28): removed BrandLogo from route planning screen; from/destination boxes now sit higher
- Completed in bottom sheet UX (2026-03-28): PanResponder moved from entire sheet to handle-only, enabling ScrollView content to scroll freely. Added `nestedScrollEnabled` and visible scroll indicator
- Completed in hazard reporting (2026-03-28): users can now report hazards from the route planning screen via a ⚠️ button on the right rail. Tapping opens hazard type picker modal (same categories as navigation), then user taps the map to place the hazard marker. Crosshair overlay with "Tap map to place hazard" label guides placement. Data queued via same `enqueueMutation('hazard')` path as navigation reports. RouteMap extended with `onMapTap` and `hazardPlacementMode` props
- Completed in autocomplete UX (2026-03-28): Google Maps/Waze-style autocomplete results. Each suggestion now shows place name (bold) + distance badge (right-aligned, "350 m" / "1.2 km") on first row, concise local address (street + neighborhood, not full country path) on second row. No raw category text — category communicated via icon only. `AutocompleteSuggestion` enriched with `secondaryText`, `distanceLabel`, `maki` fields. `buildSecondaryText()` extracts concise context from Mapbox hierarchical address data. Expanded maki → Ionicons icon mapping. Results sorted by proximity (closest first) when user location is available
- Completed in bicycle rental (2026-03-29): new Overpass API client (`bicycle-rental.ts`) fetches bicycle rentals from OSM (`amenity=bicycle_rental`, `bicycle_rental=docking_station`, `shop=bicycle+service:bicycle:rental=yes`) excluding disused/abandoned. Dark green (#2E7D32) circle markers with "R" label at zoom 12+. Visible on all three screens. Removed onPress handlers from parking/rental layers to fix marker disappearing bug
- Completed in weather + air quality (2026-03-29): live weather widget (Open-Meteo, no API key) in route planning showing temperature, weather icon, precipitation %, wind speed, and European AQI with color-coded text. Weather warning modal in route preview for rain >50%, freezing, temp swings >5°C, wind >25km/h, poor AQI >100, high PM2.5 >25μg/m³. Air quality fetched in parallel with weather data
- Completed in basemap (2026-03-29): Shield Mode basemap using Mapbox Standard style with `StyleImport` component. Auto day/dawn/dusk/night lighting (30-min refresh). Safety-semantic road colors (red motorways, brown trunks, sandy cyclable). Hidden POI/transit labels and 3D objects. Warm gray land, steel blue water, natural green parks. Montserrat font
- Completed in map centering (2026-03-29): route planning map now centers on user GPS location instead of hardcoded Bucharest. `DEFAULT_ROUTE_REQUEST` cleared to `0,0` placeholder. Camera uses `key` prop to force re-center when coordinates change. `planningOrigin` and parking/rental hooks skip `0,0` origins. Persisted store cleared on first launch after update
- Completed in hazard visualization (2026-03-30): hazard zones now rendered as striped red/black line segments on the route during navigation. Each nearby hazard gets a ~100m segment centered on its location, rendered as a black base LineLayer (8px) + red dashed LineLayer (6px) overlay. Route midpoint + half-route-distance radius used as query center for hazard fetching instead of user-only position, covering the full route. `useNearbyHazards` radius param now passed from navigation screen based on route length
- Completed in Cloud Run redeployment (2026-03-30): fixed supabaseAdmin dynamic import failing in Docker — switched to static import already at top of v1.ts. Redeployed via `cloudbuild.yaml`. Set `SUPABASE_SERVICE_ROLE_KEY` env var on Cloud Run service. Hazards endpoint now works on production (`/v1/hazards/nearby` returns data)
- Completed in bicycle lanes (2026-03-31): new Overpass API client (`bicycle-lanes.ts`) fetches all cycling infrastructure from OSM (`highway=cycleway`, `cycleway=lane/track/shared_lane`, `cycleway:left/right=lane/track`, `bicycle=designated`) as way geometries. Teal (#4A9EAF) LineLayer at 3px width renders before route layers so routes paint on top with bike lane peeking as a subtle border. Toggle button (bicycle icon) in route planning right rail. Always visible in route preview and navigation. 10-minute TanStack Query cache. `lineEmissiveStrength: 1` for night mode resistance
- Completed in map rendering (2026-03-31): added `emissiveStrength: 1` to all overlay layers (12 LineLayer, 7 CircleLayer, 4 SymbolLayer) so route lines, risk segments, hazard zones, parking/rental markers, and origin/destination dots maintain full brightness regardless of Mapbox Standard style day/night/dawn/dusk lighting transitions. Prevents overlays from dimming in night mode
- Completed in route planning (2026-03-31): GPS recenter button now calls `refreshLocation()` to get fresh GPS fix and animates camera to new position. Previously only centered on cached location
- Completed in POI system (2026-04-01): cyclist-relevant POI markers from Mapbox vector tiles (`mapbox-streets-v8/poi_label`). Six categories: Hydration (W), Bike Shops (B), Restrooms (WC), Bike Rental (R), Bike Parking (P), Supplies (S). All rendered as brand yellow (#D4A843) circles with white text labels, `circleEmissiveStrength: 1` for night mode resistance. Each category independently toggleable from Profile → Map Layers. Visibility controlled via filter-based approach (impossible `__off__` filter when disabled) to avoid mount/unmount rendering bugs. Tappable — shows info card with type, name, and website link. Bike shops also augmented with Overpass API fallback (`shop=bicycle`, `craft=bicycle`, `amenity=bicycle_repair_station`) and broadened Mapbox filter (`shop` maki with bike-related type names). POI search via Mapbox Search Box API for additional results near user and destination
- Completed in weather (2026-04-01): weather warnings now check remaining hours only (not full day). Fetches hourly forecast data from Open-Meteo. Computes remainingPrecipMax, remainingWindMax, remainingTempMin/Max from current hour onward. Morning rain no longer triggers afternoon warning. Graceful fallback to daily aggregates if hourly data unavailable
- Completed in notifications (2026-04-01): push notification infrastructure scaffolded — `expo-notifications` installed, `NotificationProvider` created (currently disabled pending EAS project ID), `push-notifications.ts` with lazy-load pattern to avoid native module crash. Notification preferences (Weather/Hazard/Community toggles) in Profile screen. Sign-out button with confirmation dialog. Provider disabled until native rebuild with proper EAS project configuration
- Completed in developer workflow (2026-04-01): `npm run check:bundle` script validates Metro can serve the JS bundle (HTTP 200 check) before testing on phone. Catches build errors early. Project moved to `C:\dev\defpedal` short path to avoid Windows 260-char CMake path limit. `.claude/rules/bundle-check.md` added to ensure future sessions run the check after code changes
- Completed in POI system (2026-03-31): cyclist POI layers using Mapbox vector tiles (mapbox-streets-v8 `poi_label` source layer) for hydration (drinking-water, cafe), bike shops (bicycle, shop+bike type), restrooms (toilet), bike rental (bicycle-share), and supplies (convenience, grocery). Each category independently toggleable from Profile → Points of Interest. All POIs render as yellow (#D4A843) circles with dark (#1A1A1A) letter labels (W, B, WC, R, P, S) at zoom 14+. Filter-based visibility using `__off__` impossible-match pattern instead of conditional mount/unmount. Medical POI category removed
- Completed in POI enrichment (2026-03-31): Mapbox Search Box API (`/search/searchbox/v1/category/`) fetches additional POIs near user location and destination for hydration (fountain, cafe, coffee_shop), and supplies (convenience_store, supermarket, grocery). New `poi-search.ts` client and `usePoiSearch` hook with per-category TanStack Query (10-min cache). Searched POIs rendered as yellow "B" dots via separate ShapeSource with tap-to-info card
- Completed in bike shops (2026-03-31): Overpass API fallback for bike shops (`shop=bicycle`, `craft=bicycle`, `amenity=bicycle_repair_station`). Broadened Mapbox vector tile filter to match `shop` maki with bike-related type names (Bicycle, Bicycle Shop, Bike, Bike Shop, Bicycle Repair). New `bicycle-shops.ts` client and `useBikeShops` hook (only fetches when repair POI toggle is on)
- Completed in POI toggle fix (2026-03-31): POI markers now properly appear/disappear when toggled. ShapeSource layers use opacity-based hiding (circleRadius: 0, circleOpacity: 0, textOpacity: 0 when off) plus conditional rendering with `key` prop for forced remount. Searched POIs filtered by current visibility state in useMemo to handle TanStack Query cache retention
- Completed in POI categories (2026-03-31): replaced Transit POI with Bike Rental (controls both Overpass ShapeSource R markers and Mapbox vector tile bicycle-share layer). Added separate Bike Parking toggle (controls Overpass ShapeSource P markers). Profile → Points of Interest now shows: Water & Cafés, Bike Shops, Bike Rental, Bike Parking, Restrooms, Supplies
- Completed in bike lanes (2026-03-31): bike lane toggle moved from map button to Profile → Map Layers section. Bike lanes now use Mapbox vector tiles (`road` source layer filtered for cycling classes) instead of Overpass API — eliminates rate limit risk. Teal continuous line at 3px with emissive strength
- Completed in dev workflow (2026-03-31): added `npm run check:bundle` pre-flight script that verifies Metro can build the full Android JS bundle (HTTP 200 from `/index.bundle`). Catches missing modules, syntax errors, and resolution failures before they reach the phone as blank screens. Script checks Metro is running, requests the bundle with 120s timeout, and shows error details on failure. Added to root `package.json` as `check:bundle`. Run after code changes, before testing on phone
- Completed in push notifications (2026-04-01): full push notification system using Expo Push Service. Supabase tables: `push_tokens` (per user+device, upserted on app open), `notification_log` (audit trail with sent/suppressed status). Profiles extended with `notify_weather`, `notify_hazard`, `notify_community` toggles and `quiet_hours_start/end/timezone`. Server: `push.ts` Expo Push API client (send/batch/receipts), `notifications.ts` dispatch logic with category suppression and quiet hours check. New endpoints: `PUT /v1/push-token`, `DELETE /v1/push-token`, `POST /v1/notifications/send` (admin). Community triggers in `feed.ts` fire-and-forget notifications on likes and comments. Client: `expo-notifications` installed, `NotificationProvider` in AppProviders registers token on auth, handles foreground display and tap deep-linking. Profile → Notifications section with Weather/Hazard/Community toggles and Quiet Hours display (default 22:00–07:00). All preferences persisted via Zustand and synced to server
- Completed in weather warnings (2026-04-01): weather warnings now check only the **remaining hours** of the day (from current hour onward) instead of full-day aggregates. Fetches hourly forecast from Open-Meteo (`hourly=temperature_2m,precipitation_probability,wind_speed_10m`). Computes `remainingPrecipMax`, `remainingWindMax`, `remainingTempMin/Max` from hourly slices. Morning rain no longer triggers afternoon warnings. Graceful fallback to daily aggregates if hourly data unavailable
- Completed in dev workflow (2026-03-31): project moved from long path (`C:\Users\Victor\Documents\1. Projects\...`) to `C:\dev\defpedal` to permanently fix Windows 260-char CMake path limit and Metro cache issues. Debug builds now via `C:\dev\defpedal` directly. Old path junction no longer needed
- Completed in CI (2026-03-27): all TypeScript errors resolved — mobile-api test files excluded via tsconfig, feed schemas/routes fixed for ShareTripRequest type, IconButton secondary variant added, RouteMap readonly coordinate casts, NavigationHUD thenStripStandalone style added, TripCard safetyColors.warning→danger, useRouteGuard typed route cast. CI now passes green
- Goal:
  - keep route preview anonymous-first
  - require auth for persisted writes like trips, hazards, and feedback
  - surface auth and telemetry state clearly inside the mobile app
  - protect routing/write endpoints from burst traffic while avoiding extra client complexity
  - keep Android native validation deterministic even when the bridgeless dev client is unavailable

## Next Up

1. Decide whether to fix the bridgeless debug client or rely on the release validator for native QA until later.
2. Start iPhone validation on macOS hardware.
3. Deepen release automation with store-secret checks and staged-rollout operations.
4. Run production-scale steady/burst load tests against a staging environment with Redis enabled.
5. Capture fresh device screenshots for the redesigned screens, review them on a physical device, and fine-tune spacing, density, and motion based on actual Android/iPhone visual QA.
6. Add a database migration for `hazard_type` if we want every selected hazard category stored explicitly in Supabase instead of using the current compatibility fallback when that column is absent.

## Stable Baseline Program

This section tracks the repo-hardening work needed to turn the current migration state into a stable
mobile-first baseline for normal frontend and feature development.

### Baseline milestone definition

We will call the repo "stable baseline" when all of the following are true:

- the committed source tree contains the real mobile app, shared core package, and mobile API
- the default validation command is green and does not depend on unrelated legacy-web breakage
- test discovery is deterministic and excludes worktrees, temp folders, and generated output
- Android release-style validation is the documented default native QA path
- iPhone has at least one documented smoke-tested validation pass
- the backend has a staging validation path plus production-like load-test evidence
- schema changes are stored as real migrations, including the current `hazard_type` addition
- CI and release workflows are aligned with the mobile-first product path

For normal day-to-day feature work, we also recognize a softer milestone:

- "stable feature-development baseline"
  - the repo is green locally
  - the mobile-first workflow is documented
  - Android validation is dependable
  - the backend has a repeatable local load baseline
  - remaining work can be treated as release-hardening backlog instead of repo-foundation instability

### Phase 0: Capture the real repo state

- Status: Done
- Evidence:
  - `codex/mobile-current-snapshot` now contains the committed mobile-first repo snapshot
  - the stabilization worktree now runs on top of that committed snapshot instead of the earlier pre-migration commit
- Notes:
  - the snapshot intentionally excluded local-only files such as `.env`, `apps/mobile/.env.preview`, `services/mobile-api/.env`, generated `output/`, `tmp/`, and ignored native build artifacts

### Phase 1: Build and CI determinism

- Status: In progress
- Checklist:
  - completed: separate the default mobile validation path from legacy web build conflicts
  - completed: resolve the root entrypoint collision between the Vite web build and Expo Router mobile entry
  - completed: introduce explicit validation scripts such as `validate:mobile` and `validate:web`
  - completed in branch behavior: CI and release workflows now inherit the stable validation path through `npm run validate`
  - completed: exclude worktree/helper folders from test discovery by constraining Vitest to source roots and excluding `.claude`, `.expo`, `output`, and `tmp`
  - remaining: confirm one green CI run on the stabilization branch
- Exit criteria:
  - one local green validation run
  - one green CI run on the stabilization branch

### Phase 2: Repo shape and developer workflow

- Status: In progress
- Checklist:
  - completed: make root scripts clearly favor `dev:mobile`, `dev:api`, and native validation
  - completed: tighten `.gitignore` to avoid noisy runtime artifacts and staging leftovers
  - completed: refresh `README.md`, `CONTEXT.md`, and related docs around the mobile-first happy path
  - completed: define the legacy web app as an opt-in reference surface instead of the default workflow
  - remaining: sanity-check the updated workflow docs against one clean onboarding pass
- Exit criteria:
  - a new contributor can follow one documented happy path from install to native validation

### Phase 3: Schema and backend readiness

- Status: In progress
- Checklist:
  - completed: move active loose SQL changes into a real migration folder and naming convention
  - completed: add the `hazard_type` change as an ordered migration path
  - completed: document staging deployment inputs and migration prerequisites in the backend operations docs
  - completed: align repo docs so the backend contract now points to the ordered migration path for `hazard_type`
  - remaining: recover or replace the corrupted legacy root SQL blobs if they still matter operationally
- Exit criteria:
  - schema updates are tracked and re-runnable
  - backend staging path is documented and testable

### Phase 4: Native validation and release readiness

- Status: In progress
- Checklist:
  - completed: keep Android release-style validation as the supported default path for now
  - completed: treat bridgeless debug-client recovery as backlog unless it is proven to block developer velocity
  - completed: deepen release workflow guardrails for secrets, environment checks, and rollout sanity
  - completed: add `iphone_validation.md` as the canonical record for the first in-repo iPhone smoke pass
  - remaining: run and document one iPhone smoke-validation pass on macOS hardware
- Exit criteria:
  - remaining: Android and iPhone each have one documented smoke-tested path
  - completed: preview release workflow has a documented preflight and rollback path

### CO2 Savings Calculator (2026-04-02)

- Status: Done
- Evidence:
  - `packages/core/src/co2.ts` — calculateCo2SavedKg, formatCo2Saved, calculateEquivalentTreeDays, calculateTrailDistanceMeters (EU avg 120g CO2/km)
  - `packages/core/src/co2.test.ts` — 22 unit tests covering all functions
  - `packages/core/src/contracts.ts` — UserStats type, co2SavedKg field on FeedItem
  - `services/mobile-api/src/routes/v1.ts` — GET /v1/stats endpoint (cumulative user stats)
  - `services/mobile-api/src/lib/submissions.ts` — getUserStats via Supabase RPC, actual_distance_meters stored on trip save
  - `services/mobile-api/src/routes/feed.ts` — co2SavedKg computed in feed item mapper
  - `services/mobile-api/src/lib/feedSchemas.ts` — co2SavedKg added to JSON Schema (prevents Fastify stripping)
  - `apps/mobile/src/design-system/atoms/Co2Badge.tsx` — reusable leaf + CO2 display component
  - `apps/mobile/src/design-system/organisms/TripCard.tsx` — CO2 from actual GPS trail distance
  - `apps/mobile/src/components/FeedCard.tsx` — CO2 Saved stat in community feed cards
  - `apps/mobile/app/history.tsx` — "Your Impact" card (trips, km cycled, CO2 saved, tree-days)
  - `apps/mobile/app/navigation.tsx` — shares actual GPS distance to community feed
  - `supabase/migrations/202604020001_user_trip_stats.sql` — get_user_trip_stats RPC
  - `supabase/migrations/202604020002_actual_distance_meters.sql` — actual_distance_meters column + updated RPC
- Key decisions:
  - CO2 = distance_km × 0.12 kg (EU avg 120g/km for cars, ~0g for cycling)
  - Uses actual GPS trail distance via haversine sum, falls back to planned route distance
  - Stats RPC uses COALESCE(actual_distance_meters, planned_route_distance_meters) for backwards compatibility
  - "Your Impact" card placed in History tab (not Profile) per user preference
  - API deployed to Cloud Run (revision defpedal-api-00006-rmg)

### Phase 5: Staging and handoff

- Status: In progress
- Checklist:
  - completed locally: capture repeatable route-core smoke, steady, and burst evidence in `mobile_api_load_test_baseline.md`
  - completed: declare the stable feature-development baseline milestone in this tracker
  - completed: list the remaining backlog items that should not block normal feature work
  - remaining: run staging smoke, steady, and burst load tests with Redis enabled
- Exit criteria:
  - completed for feature work: stable feature-development baseline is explicitly declared
  - remaining for release hardening: Redis-backed staging evidence and iPhone validation

### React Native Performance Optimizations (2026-04-07)

- Status: Done
- Changes:
  - Hoisted Mapbox layer styles to module scope (7 layer files: RouteLayers, HazardLayers, MarkerLayers, SearchedPoiLayer, VectorTileLayers, HistoryLayers, OverpassPoiLayers)
  - Used `useShallow` for batched Zustand selectors in profile.tsx (consolidated 27 selectors into 2)
  - Wrapped `data?.pages.flatMap()` in useMemo for stable array references (community-feed.tsx)
  - Extracted renderItem to useCallback, moved StatTile outside component (community-trip.tsx)
  - GPU-accelerated scaleX animation with useNativeDriver:true (BadgeProgressBar.tsx)
  - Added `borderCurve: 'continuous'` for iOS squircle corners (Card, Button, TripCard, FeedCard, Modal)
- UX improvements:
  - Moved trip list below stats dashboard in History screen (better information hierarchy)
  - Added confirmation dialog to "End Ride" button (prevents accidental trip cancellation)
  - Added global ErrorBoundary for crash recovery (ErrorBoundary.tsx wraps entire app in _layout.tsx)
- Translations: Added en/ro strings for End Ride confirmation and error boundary
- Evidence: All changes verified on phone via Metro hot reload

### Unified ScreenHeader Atom (2026-04-08)

- Status: Done
- Changes:
  - **ScreenHeader atom** (`apps/mobile/src/design-system/atoms/ScreenHeader.tsx`): 4 variants — `back` (yellow circle chevron), `close` (X button), `brand-logo` (logo + title/subtitle card), `title-only` (centered text)
  - **Screen wrapper** updated with `headerVariant` prop (defaults to `brand-logo`); nav-style headers fixed above scroll, brand-logo scrolls with content
  - **7 screens migrated** from ad-hoc inline headers to unified ScreenHeader:
    - `faq.tsx` → Screen + `back`
    - `daily-quiz.tsx` → Screen + `close`
    - `achievements.tsx` → SafeAreaView + ScreenHeader `back`
    - `impact-dashboard.tsx` → SafeAreaView + ScreenHeader `back`
    - `user-profile.tsx` → SafeAreaView + ScreenHeader `back`
    - `trip-compare.tsx` → SafeAreaView + ScreenHeader `back`
    - `auth.tsx` → SafeAreaView + ScreenHeader `close`
  - **Profile layout**: user card (sign-in/avatar) moved above badges, sign-out button moved to bottom of Account section
  - Map screens excluded (route-planning, route-preview, navigation) — use MapStageScreen
  - BackButton atom retained for floating map buttons (trip-map.tsx)
  - Exported from `atoms/index.ts` barrel
- Evidence: Bundle check passing, verified on phone via Metro hot reload

### Search UX Improvements (2026-04-07)

- Status: Done
- Changes:
  - **Recent Destinations**: Last 10 selected destinations shown when focusing empty destination search field
    - `RecentDestination` type in `packages/core/src/contracts.ts` (extends AutocompleteSuggestion with selectedAt)
    - `recentDestinations` state + `addRecentDestination` action in Zustand store (persisted)
    - De-duplicates by coordinates (most recent wins), max 10 items
    - Display with clock icon and "Recent" header in SearchBar dropdown
    - Wired to destination SearchBar in route-planning.tsx
  - **No Results Message**: Shows "No matches yet. Keep typing or try a nearby landmark." when search returns empty (previously dropdown was hidden)
    - Fixed `showSuggestions` logic to include `hasSearchedWithNoResults` condition
- Translations: Added `search.recent` key in en.ts ("Recent") and ro.ts ("Recente")
- Evidence: Verified on phone via Metro hot reload
