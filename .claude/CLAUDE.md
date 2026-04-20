# Defensive Pedal — Project Rules

## Bundle Health Check (MANDATORY)

After making any code changes to `apps/mobile/` or `packages/core/`, **always run the bundle check before telling the user to test on phone**:

```bash
npm run check:bundle
```

- If ✅ (HTTP 200) → safe to test
- If ❌ (HTTP 500) → fix the error before proceeding
- If Metro is not running → start it first: `cd apps/mobile && npx expo start`

**Never skip this step.** Blank screens on the phone are almost always caused by a bundle build error that this check catches.

## Project Paths

- **Main repo:** `C:\dev\defpedal` (short path, use this for all builds)
- **Metro:** run from `C:\dev\defpedal\apps/mobile`
- **API:** run from `C:\dev\defpedal\services/mobile-api`
- **Debug APK build:** `cd C:\dev\defpedal\apps\mobile\android && ./gradlew installDebug`
- **Release APK build:** `npm run build:preview:install` (syncs to `C:\dpb`, cleans cache, builds, installs)
- **Release APK build (no install):** `npm run build:preview`

## Phone Connection

After USB reconnect, always restore port forwarding:
```bash
adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8080 tcp:8080
```

## Cloud Run API

- Production URL: `https://defpedal-api-1081412761678.europe-central2.run.app`
- GCP Project: `gen-lang-client-0895796477`
- Region: `europe-central2`
- Build image: `gcloud builds submit --config cloudbuild.yaml --timeout=600`
- Deploy new revision: `gcloud run deploy defpedal-api --image europe-central2-docker.pkg.dev/gen-lang-client-0895796477/defpedal-api/mobile-api:latest --region europe-central2 --platform managed --allow-unauthenticated`
- **Important:** `gcloud builds submit` only pushes the image. You MUST also run `gcloud run deploy` to create a new revision, otherwise Cloud Run keeps serving the old code.
- **Security:** `DEV_AUTH_BYPASS_ENABLED=false` on Cloud Run (disabled 2026-04-11, revision 00044). Do NOT re-enable in production.

## App Variants

| Variant | Package | Name | How it gets JS | New Arch |
|---------|---------|------|---------------|----------|
| development | `com.defensivepedal.mobile.dev` | Defensive Pedal Dev | Metro via USB (hot reload) | Off (bridge mode) |
| preview | `com.defensivepedal.mobile.preview` | Defensive Pedal Preview | Embedded bundle (untethered, Cloud Run API) | On (bridgeless) |
| production | `com.defensivepedal.mobile` | Defensive Pedal | Embedded bundle | On (bridgeless) |

### Gradle Flavors
All three variants are defined as Gradle product flavors in `build.gradle`:
- `./gradlew installDevelopmentDebug` — dev build with Metro hot reload
- `./gradlew assemblePreviewRelease` — preview APK with embedded bundle
- `./gradlew assembleProductionRelease` — production APK
- `npm run build:preview:install` — automated sync + clean + build + install for preview

## Commit Workflow

1. Make changes
2. Run `npm run check:bundle` ✅
3. Test on phone
4. Commit to main with descriptive message
5. Update `progress.md` with what was done
6. Push to GitHub: `git push origin main`

---

## Project Overview

**Defensive Pedal** is a cycling navigation app focused on **safety-first routing**. It calculates routes that minimize risk to cyclists using real road-risk data, shows hazards reported by the community, and provides weather/air-quality awareness — all aimed at making urban cycling safer.

- **Target users:** Urban cyclists (commuters, recreational riders)
- **Core value proposition:** Safer cycling routes based on actual road risk scores, community hazard reporting (Waze-style), and environmental awareness (weather, AQI)
- **Platform:** Android (React Native / Expo). iOS planned but not yet validated.
- **Key differentiator vs Google Maps/Waze:** Safety-scored routing via custom OSRM profiles with road_risk_data from Supabase, not just shortest/fastest path

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Mobile framework** | React Native 0.83 + Expo SDK 55 | Cross-platform mobile app |
| **Language** | TypeScript 5.8+ | Entire codebase |
| **Navigation** | Expo Router (file-based) | Screen routing |
| **State management** | Zustand + zustand/persist | App state, persisted to AsyncStorage |
| **Data fetching** | TanStack Query (React Query) | Server state, caching, optimistic updates |
| **Maps** | @rnmapbox/maps + Mapbox Standard style | Map rendering, routing visualization |
| **Charts** | react-native-svg | Elevation chart, risk distribution bar |
| **Auth** | Supabase Auth (Google OAuth) | User authentication |
| **Database** | Supabase (PostgreSQL + PostGIS) | Trips, hazards, feedback, community feed, road risk data |
| **API server** | Fastify (Node.js) | Mobile API (services/mobile-api) |
| **Safe routing** | Custom OSRM server (`34.116.139.172:5000`) | Safety-optimized cycling routes |
| **Fast routing** | Mapbox Directions API | Standard cycling routes |
| **Geocoding/search** | Mapbox Search Box API v1 | Destination autocomplete |
| **Weather** | Open-Meteo API (free, no key) | Current + forecast weather + AQI |
| **Air quality** | Open-Meteo Air Quality API | European AQI, PM2.5, PM10, NO2, ozone |
| **POI data (parking/rental)** | Overpass API (OpenStreetMap) | Bicycle parking + rental locations |
| **POI data (other)** | Mapbox vector tiles (mapbox-streets-v8) | Hydration, repair, restroom, transit, supplies |
| **Bike lanes** | Mapbox vector tiles (road source layer) | Cycling infrastructure overlay |
| **Hosting (API)** | Google Cloud Run | Production API deployment |
| **Hosting (DB)** | Supabase Cloud | PostgreSQL + PostGIS + Auth |
| **CI** | GitHub Actions | Typecheck validation |

## Project Structure

```
C:\dev\defpedal/
├── apps/mobile/                 # React Native Expo app
│   ├── app/                     # Expo Router screens (file-based routing)
│   │   ├── _layout.tsx          # Root layout (fonts, providers, status bar)
│   │   ├── route-planning.tsx   # Main screen — search destination
│   │   ├── route-preview.tsx    # Preview route with risk/elevation data
│   │   ├── navigation.tsx       # Turn-by-turn navigation with 3D camera
│   │   ├── feedback.tsx         # Post-ride feedback form
│   │   ├── history.tsx          # History section landing
│   │   ├── trips.tsx            # Trip history list with map replay
│   │   ├── community.tsx        # Community section landing
│   │   ├── community-feed.tsx   # Community trip feed (like/love/comment)
│   │   ├── community-trip.tsx   # Single shared trip detail
│   │   ├── city-heartbeat.tsx   # City Heartbeat community pulse dashboard
│   │   ├── profile.tsx          # User preferences, toggles, sign-out
│   │   ├── auth.tsx             # Sign in (Google OAuth)
│   │   ├── settings.tsx         # App settings
│   │   ├── faq.tsx              # FAQ with 4 categorised sections (19 Q&A items)
│   │   ├── diagnostics.tsx      # Debug/QA diagnostics
│   │   └── offline-maps.tsx     # Offline map pack management
│   ├── src/
│   │   ├── components/          # Shared React components
│   │   │   ├── RouteMap.tsx     # THE map component (900+ lines, all layers)
│   │   │   ├── MapStageScreen.tsx # Map-first layout with collapsible sheet
│   │   │   ├── Screen.tsx       # Standard screen wrapper
│   │   │   ├── FeedCard.tsx     # Community feed card
│   │   │   ├── LikeButton.tsx   # Like/Love/ReactionBar components
│   │   │   ├── BrandLogo.tsx    # App logo
│   │   │   └── VoiceGuidanceButton.tsx
│   │   ├── design-system/       # Branded design system (all 30 screens use useTheme())
│   │   │   ├── tokens/          # colors, spacing, typography, radii, shadows, tints, iconSize, zIndex, badgeColors, badgeIcons, tierColors, tierImages
│   │   │   ├── atoms/           # Button, Badge, IconButton, Toggle, Card, SectionTitle, ScreenHeader, BadgeIcon, BadgeProgressBar, BadgeInlineChip, TierPill, XpGainToast
│   │   │   ├── molecules/       # SearchBar, SettingRow, Toast, HazardAlert, WeatherWidget, BadgeCard
│   │   │   └── organisms/       # NavigationHUD, BottomNav, RiskDistributionCard,
│   │   │                        # ElevationChart, ElevationProgressCard, TripCard,
│   │   │                        # TrophyCaseHeader, CategoryTabBar, BadgeDetailModal, BadgeUnlockOverlay,
│   │   │                        # ActivityChart, PulseHeader, TierRankCard, RankUpOverlay,
│   │   │                        # LeaderboardSection
│   │   ├── hooks/               # Custom React hooks
│   │   │   ├── useBicycleParking.ts   # Overpass API for parking
│   │   │   ├── useBicycleRental.ts    # Overpass API for rentals
│   │   │   ├── useBikeShops.ts        # Overpass API for bike shops
│   │   │   ├── useNearbyHazards.ts    # Hazards near route
│   │   │   ├── useWeather.ts          # Open-Meteo weather + AQI
│   │   │   ├── usePoiSearch.ts        # Mapbox Search Box POI search
│   │   │   ├── useFeed.ts             # Community feed queries + mutations
│   │   │   ├── useRouteGuard.ts       # Screen access control
│   │   │   ├── useCurrentLocation.ts  # GPS location
│   │   │   ├── useCityHeartbeat.ts    # City Heartbeat dashboard data
│   │   │   ├── useTiers.ts           # Rider tier + XP data (TanStack Query)
│   │   │   └── useLeaderboard.ts     # Neighborhood leaderboard (TanStack Query)
│   │   ├── lib/                 # Utility libraries
│   │   │   ├── mapbox-routing.ts      # Client-side route fetching (Mapbox + OSRM)
│   │   │   ├── mapbox-search.ts       # Autocomplete/geocoding
│   │   │   ├── weather.ts             # Weather + AQI data fetching
│   │   │   ├── bicycle-parking.ts     # Overpass client for parking
│   │   │   ├── bicycle-rental.ts      # Overpass client for rentals
│   │   │   ├── bicycle-shops.ts       # Overpass client for shops
│   │   │   ├── poi-search.ts          # Mapbox Search Box POI client
│   │   │   ├── api.ts                 # Mobile API client (all endpoints)
│   │   │   ├── offlineQueue.ts        # Queued mutation types + factory
│   │   │   ├── push-notifications.ts  # Expo push token registration
│   │   │   ├── daily-weather-notification.ts # 9am weather local notification
│   │   │   ├── navigation-helpers.ts  # Tab press routing (Map→nav or planning)
│   │   │   └── env.ts                 # Environment variable access
│   │   ├── providers/           # React context providers
│   │   │   ├── AppProviders.tsx        # Provider tree root
│   │   │   ├── AuthSessionProvider.tsx # Supabase auth session
│   │   │   ├── NavigationLifecycleManager.tsx # GPS breadcrumb sampling
│   │   │   ├── OfflineMutationSyncManager.tsx # Queue drain to API
│   │   │   ├── DailyWeatherScheduler.tsx      # 9am notification scheduler
│   │   │   └── NotificationProvider.tsx       # Registers Expo push token + handles taps
│   │   └── store/
│   │       └── appStore.ts      # Zustand store (state + actions + persist)
│   ├── app.config.ts            # Expo/EAS config (variants, plugins, keys)
│   ├── metro.config.js          # Metro bundler config (blocklist for worktrees)
│   └── tsconfig.json            # TypeScript config (excludes test files)
├── packages/core/               # Shared pure-logic package
│   └── src/
│       ├── contracts.ts         # All shared types (RouteOption, FeedItem, etc.)
│       ├── navigation.ts        # Navigation logic (progress, off-route, climb)
│       ├── distance.ts          # Haversine distance, closest point, along-route polyline distance
│       ├── polyline.ts          # Polyline6 encode/decode
│       └── riskDistribution.ts  # Risk category classification
├── services/mobile-api/         # Fastify API server
│   └── src/
│       ├── server.ts            # Entry point
│       ├── app.ts               # Fastify app builder (registers routes)
│       ├── routes/
│       │   ├── v1.ts            # Core API routes (routes, hazards, trips, feedback)
│       │   ├── feed.ts          # Community feed routes (share, like, love, comment)
│       │   ├── leaderboard.ts   # Neighborhood leaderboard + settlement cron
│       │   └── mia.ts           # Mia persona journey routes (activate, opt-out, detection, notifications)
│       ├── lib/
│       │   ├── auth.ts          # JWT + dev-bypass auth middleware
│       │   ├── risk.ts          # Road risk segment fetching (Supabase RPC)
│       │   ├── elevation.ts     # Elevation profile + gain/loss (Mapbox Terrain-RGB tiles)
│       │   ├── submissions.ts   # Trip/hazard/feedback DB writes
│       │   ├── normalize.ts     # Route response normalization
│       │   ├── feedSchemas.ts   # JSON Schema for feed endpoints
│       │   ├── leaderboardSchemas.ts # JSON Schema for leaderboard endpoints
│       │   └── dependencies.ts  # Dependency injection container
│       └── Dockerfile           # Production Docker image
├── supabase/migrations/         # Database migrations
│   ├── 202603170001_get_segmented_risk_route.sql
│   ├── 202603170002_add_hazard_type.sql
│   ├── 202603240001_create_trip_tracks.sql
│   ├── 202603260001_community_feed.sql
│   ├── 202603270001_hazard_validations.sql
│   ├── 202604140001_leaderboard.sql
│   ├── 202604140002_leaderboard_badges_eval.sql
│   └── legacy/                  # Archived root SQL files
├── scripts/
│   └── check-bundle.sh          # Metro bundle health check
├── cloudbuild.yaml              # Cloud Build config for Cloud Run
├── progress.md                  # Implementation progress tracker
├── CONTEXT.md                   # Project context summary
└── ARCHITECTURE.md              # Architecture overview
```

## Architecture & Patterns

### State Management (Zustand)
- Single `appStore.ts` with `zustand/persist` → AsyncStorage
- Persisted: `appState`, `routeRequest`, `routePreview`, `navigationSession`, `queuedMutations`, `locale`, user preferences (bike type, avoid unpaved, POI visibility, etc.)
- NOT persisted: UI state (showMenu, showElevationProgress, etc.)

### Navigation (Expo Router)
- File-based routing in `apps/mobile/app/`
- `useRouteGuard` protects screens (e.g., navigation requires `NAVIGATING` state)
- Route guard uses `hasPassedRef` to lock — prevents Zustand hydration race from bouncing users

### App State Machine
```
IDLE → ROUTE_PREVIEW → NAVIGATING → AWAITING_FEEDBACK → IDLE
```

### Offline Queue (Critical Pattern)
- Mutations queued in Zustand: `trip_start`, `trip_end`, `trip_track`, `hazard`, `feedback`, `trip_share`
- `OfflineMutationSyncManager` drains queue every 15s when API reachable
- Queue survives app restart (persisted)
- `trip_end` and `trip_track` wait for `trip_start` to resolve (trip server ID mapping)

### Map Architecture (RouteMap.tsx)
- Single `RouteMap` component used by ALL screens (planning, preview, navigation, trips, community)
- Layers stacked in order: route alternatives → risk segments → hazard zones → bicycle parking/rental/shops → POI layers → route markers → hazard markers → user location puck
- **Mapbox Standard style** with Shield Mode config (safety-semantic road colors, auto day/night, hidden irrelevant POIs)
- **Vector tile POIs** from `mapbox-streets-v8` — zero API calls for hydration/repair/restroom/transit/supplies
- **Emissive strength = 1** on all overlay layers (immune to day/night lighting)

### Map Stage Layout (MapStageScreen.tsx)
- Full-bleed map behind a `SafeAreaView` overlay
- `CollapsibleSheet` with PanResponder for swipeable bottom panel
- Fixed footer buttons (Start Navigation, Back) stay visible when sheet collapses
- Right overlay for floating control buttons

### Design System
- Dark/light/system theme via `ThemeProvider` + `useTheme()` hook. User picks in Profile > Display (3-pill picker: Dark / Light / System). Persisted in Zustand as `themePreference`
- All 30 screens + key components (Screen, MapStageScreen, SettingRow, Toggle, TripCard, FeedCard, CommunityStatsCard, ElevationChart) use `createThemedStyles(colors)` factory pattern
- Forces dark theme during NAVIGATING state (glare reduction, battery, safety contrast)
- Tokens: `colors.ts`, `spacing.ts`, `typography.ts`, `radii.ts`, `shadows.ts`, `tints.ts` (opacity + rgba tints), `iconSize.ts` (xs-3xl), `zIndex.ts` (semantic layers), `motion.ts`
- Components: atoms (Button, Badge, IconButton, Toggle, Card, SectionTitle, ScreenHeader, FadeSlideIn) → molecules (SearchBar, SettingRow, Toast, HazardAlert, WeatherWidget) → organisms (NavigationHUD, BottomNav, RiskDistributionCard)
- `ScreenHeader` atom: unified header with 4 variants (`back`, `close`, `brand-logo`, `title-only`). Screen wrapper accepts `headerVariant` prop. Map screens (route-planning, route-preview, navigation) excluded — use MapStageScreen. BackButton atom retained for floating map buttons only.
- Map overlay cards (origin, destination, search, FABs) intentionally use `#FFFFFF` — they sit on the dark map regardless of theme
- Legacy `mobileTheme` bridge deleted — all components use design system tokens directly
- `FadeSlideIn` atom: entry animation (opacity + translateY, 200ms) with `useReducedMotion` support
- `haptics.ts` utility: lazy NativeModules guard for expo-haptics (same pattern as push-notifications)
- Analysis: `design-work/design-system-analysis.md` (SWOT, scores, component inventory, migration status)

### 3D Navigation Camera
- `followUserLocation` + `followUserMode: 'course'` + `followPitch: 45` + `followZoomLevel: 16`
- GPS heading drives camera rotation
- Tap map → breaks follow (flat overview). Recenter button → resumes 3D follow.
- Native `LocationPuck` with `puckBearing="course"` replaces manual circle marker

## Key Decisions & Rationale

| Decision | Why |
|----------|-----|
| **Mapbox vector tiles for POI** (not Overpass) | Overpass rate-limits aggressively after multiple queries. Vector tiles are pre-loaded, zero API calls, instant rendering |
| **Overpass only for parking/rental/shops** | These specific OSM tags aren't in Mapbox's POI layer. Rate limit risk accepted (cached 5-10 min via TanStack Query) |
| **Filter-based layer hiding** (not conditional mount/unmount) | Mapbox RN caches rendered features. Unmounting a ShapeSource doesn't clear markers. Use `key={vis ? 'on' : 'off'}` or impossible filter to force remount |
| **`newArchEnabled` per variant** | Development: off (bridge mode) so Metro bundle loads over USB. Preview/production: on (bridgeless). Controlled in `app.config.ts` + `gradle.properties` |
| **Expo Push + local notifications** | Server-side pushes go through Expo Push API (`services/mobile-api/src/lib/push.ts` → `https://exp.host/--/api/v2/push/send`) with per-user prefs, quiet hours, and daily budget. Local scheduling (`expo-notifications`) handles the daily 9am weather ping. EAS project ID `f8bcd740-...` wired in `app.config.ts:223` |
| **`NativeModules` guard before `require('expo-notifications')`** | `require()` of a missing native module causes uncatchable fatal crash on Android. Checking `NativeModules.ExpoPushTokenManager` first prevents this |
| **Short path `C:\dev\defpedal`** | Original path `C:\Users\Victor\Documents\1. Projects\...` exceeds Windows 260-char limit for CMake. Junction from old path preserved for file explorer |
| **`C:\dpb` for release builds** | Even `C:\dev\defpedal` can fail for release builds (node_modules resolves to long paths). Full copy to `C:\dpb` with fresh `npm install` is the reliable path |
| **Off-route threshold 50m + segment-aware snap** | `closestPointOnPolyline` projects GPS onto nearest line segment (perpendicular distance), not just nearest vertex. 50m base + up to 50m GPS accuracy buffer = effective 50-100m. Old vertex-only approach needed 100m because midpoint of straight segments inflated distance |
| **Safe routing = OSRM, Fast routing = Mapbox** | OSRM has custom safety profile using road_risk_data. Mapbox Directions is standard cycling. Both fetched client-side from the mobile app. OSRM at `34.116.139.172:5000` |
| **Flat routing = separate OSRM instance** | `bicycle-flat` profile uses 7.0x uphill penalty (vs 1.1x standard). Runs on port 5001 (`34.116.139.172:5001`). Activated by "Flat" pill on route planning (3-way toggle: Safe/Fast/Flat). `avoidHills` flag composes with `avoidUnpaved` |
| **Mapbox Terrain-RGB for elevation** (not Open-Meteo) | Open-Meteo rate-limits (HTTP 429) during heavy usage. Terrain-RGB tiles decode elevation from PNG pixels, are CDN-cached, zero external API calls |
| **Along-route polyline distance** (not haversine to maneuver) | Haversine underestimates distance on winding roads (switchbacks, curves). `polylineSegmentDistance` sums vertex-to-vertex distances along the decoded polyline — keeps `remainingDistanceMeters` consistent with `step.distanceMeters` and `route.distanceMeters`. Note: `remainingDistanceMeters` = distanceToManeuver + **currentStep.distanceMeters** + futureSteps — the current step's segment must be included (fixed 2026-04-13) |

## Code Conventions

### Naming
- Files: `camelCase.ts` for libs/hooks, `PascalCase.tsx` for components, `kebab-case.ts` for utilities
- Hooks: `use` prefix (`useBicycleParking`, `useWeather`)
- Store actions: verb prefix (`setRouteRequest`, `finishNavigation`, `enqueueMutation`)

### Imports
- `@defensivepedal/core` for shared types and logic
- Design system tokens imported from `../design-system/tokens/colors` etc.
- Lazy `require()` for `expo-notifications` (never top-level `import *`)

### State Updates
- Always immutable: `set((state) => ({ ...state, field: newValue }))`
- Never mutate arrays/objects in place

### Safe Area
- ALWAYS use `useSafeAreaInsets()` from `react-native-safe-area-context`
- NEVER use `SafeAreaView` from `react-native` (iOS-only, no-op on Android)

### Mapbox Layers
- Always render layers, use filter-based hiding (not conditional mount/unmount)
- Add `circleEmissiveStrength: 1` / `lineEmissiveStrength: 1` / `textEmissiveStrength: 1` to all overlay layers
- POI colors: brand yellow `#D4A843` with white text labels
- Parking: blue `#2196F3` with "P", Rental: dark green `#2E7D32` with "R"

## Gotchas & Pitfalls

See `.claude/error-log.md` for the full list with details. Key ones:

1. **Blank screen = check ports + Metro** — `adb reverse tcp:8081 tcp:8081` after every USB reconnect
2. **Debug APK overwritten by release** — installing release APK with same package name overwrites debug. Check with `adb shell input keyevent 82` (dev menu test)
3. **Zustand hydration race** — `useRouteGuard` locks with `hasPassedRef` to prevent persist hydration from bouncing users
4. **Emoji don't render in Mapbox SymbolLayer** — use plain text characters only (W, B, WC, S, T, P, R)
5. **Conditional ShapeSource mount/unmount leaves ghost markers** — use `key` prop to force remount instead
6. **`DEFAULT_ROUTE_REQUEST` must have `0,0` coords** — non-zero default causes camera to center on wrong location
7. **Windows 260-char CMake path limit** — build from `C:\dpb` (full copy) for release APKs
8. **`expo-notifications` native module crash** — guard with `NativeModules.ExpoPushTokenManager` check before `require()`
9. **Fastify strips unknown response fields** — add new fields to JSON Schema in `feedSchemas.ts` or they'll be silently dropped

## Rules

### Before ANY code change:
1. Check `.claude/error-log.md` for known pitfalls
2. Verify imports exist when using new symbols
3. Use lazy `require()` for native modules, never top-level `import *`

### Before telling user to test:
1. Run `npm run check:bundle` — MUST return HTTP 200
2. Verify Metro is running: `curl -s http://localhost:8081/status`
3. Verify port forwarding: `adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8080 tcp:8080`

### Before committing:
1. Bundle check passes
2. Run `npm run typecheck` — MUST pass with 0 errors (CI runs this on push)
3. Test on phone confirms feature works
4. Update `progress.md` with what was done
5. Descriptive commit message

### Before pushing:
- A **git pre-push hook** (`.git/hooks/pre-push`) automatically runs `npm run typecheck` before every push. If it fails, the push is blocked. Do NOT skip it with `--no-verify`.

### Never:
- Use `SafeAreaView` from `react-native` (use `react-native-safe-area-context`)
- Use top-level `import * as Notifications from 'expo-notifications'`
- Use conditional mount/unmount for Mapbox layers (use filter or key-based hiding)
- Use emoji in Mapbox SymbolLayer textField
- Skip bundle check before phone testing

## Current State (as of 2026-04-14)

### Working Features
- Route planning with destination autocomplete and recent destinations (Google Maps-style UX)
- Safe routing (OSRM) and fast routing (Mapbox Directions)
- Route preview with risk distribution card, elevation chart, weather warnings (progressive disclosure — details in expanded sheet)
- Safe vs fast route comparison with "Switch to safe route" button (shows "Slightly safer" / "Similar safety" for small differences)
- Flat routing (avoid hills) — 3-way toggle on route planning (Safe/Fast/Flat), uses separate OSRM instance with 7x uphill penalty
- Turn-by-turn navigation with 3D follow camera
- Remaining climb tracker (always shows ascent remaining, decreasing during navigation)
- Elevation progress card (toggleable during navigation)
- Waze-style hazard reporting (from both planning and navigation screens)
- Hazard proximity alerts during navigation with "Still there?" validation
- Striped red/black hazard zones on route
- Community feed with trip sharing, likes, loves, comments
- Trip history with GPS trail + planned route map replay
- Weather widget (temperature, precipitation, wind, AQI)
- Daily 9am cycling weather notification
- Bicycle parking/rental/shop markers (Overpass API)
- POI layers from Mapbox vector tiles (hydration, repair, restroom, transit, supplies)
- Bike lane overlay from Mapbox vector tiles
- Shield Mode basemap with auto day/night lighting
- Light/dark/system theme picker in Profile (persisted, navigation forces dark)
- Profile with 3-section layout (Cycling Preferences / Display / Account), bike type, cycling frequency, avoid unpaved, sharing toggle, POI toggles
- Sign in (Google OAuth) / sign out
- Offline mutation queue (trips, hazards, feedback sync when online)
- CO2 savings per trip (actual GPS distance, EU avg 120g/km) on trip history cards, community feed, and "Your Impact" stats card in History tab
- Community stats by locality (total trips, km, time, CO2 for nearby cyclists)
- **City Heartbeat dashboard**: community pulse with live activity (today's rides/distance/CO2/community seconds), 7-day activity chart (SVG bars + line overlay), hazard hotspots, top contributors, animated PulseHeader with dual-ring heartbeat
- Multi-stop routes (up to 3 intermediate waypoints with autocomplete search, yellow map markers)
- **Habit Engine:**
  - Anonymous auth (Supabase) — app works without account, merges data on signup
  - 5-screen onboarding flow (location → safety score → cycling goal → circuit route → signup)
  - Post-ride impact summary (animated CO2/money/hazards counters with variable equivalents)
  - Streak engine (4AM cutoff, 5 qualifying actions, freeze mechanic, weekly reset)
  - Impact Dashboard (streak chain, lifetime counters, weekly summary)
  - Daily safety quiz (45 Romania-focused questions in static file, streak qualifier)
  - Enhanced hazard reporting (2-tap FAB during navigation, armchair long-press, confirm/deny counts)
  - Milestone share cards with detection and deduplication
  - Scheduled notifications (streak protection, weekly impact, social digest)
- **Badge System (137 badges across 8 categories):**
  - Trophy Case screen (`achievements.tsx`): 3-column grid, category tabs, badge detail modal
  - Badge unlock overlay: full-screen celebration with spring animation + particle burst, max 2/session
  - Post-ride: "BADGES EARNED" section in impact summary with staggered icons
  - Impact Dashboard: "Recent Badges" horizontal scroll
  - Profile: "Achievements" row with badge count + progress bar
  - `check_and_award_badges` RPC evaluates all criteria on: Trophy Case visit, post-ride dashboard, ride impact fetch
  - Share: native Share API from badge detail modal
  - Design system: BadgeIcon (3 sizes), BadgeCard, BadgeInlineChip, BadgeProgressBar, TrophyCaseHeader, CategoryTabBar, BadgeDetailModal, BadgeUnlockOverlay
- **Rider Tier XP System (10 tiers: Kickstand → Legend):**
  - Full-stack: `rider_xp_log` table, `award_ride_xp` RPC, `total_xp`/`rider_tier` on profiles
  - XP awarded on: ride completion, badge earning, streak days. Multipliers for distance/weather/hazards
  - Post-ride impact: XP breakdown always visible with total + tier progress bar. Tier backfilled from dashboard
  - Profile: compact two-column TierRankCard (mascot+name | XP+progress bar)
  - RankUpOverlay: full-screen tier promotion celebration (suppressed during NAVIGATING)
  - TierPill atom on feed cards, XpGainToast atom
  - `GET /v1/tiers` endpoint, tier mascot images for all 10 tiers
- **Help & FAQ**: 19 Q&A items in 4 sections (Safety & Routing, Your Impact, Progression & Rewards, Privacy & Data). Accessible from Settings tile, Profile > Account row, and History tab card
- **Stability & UX:**
  - Global ErrorBoundary with crash recovery (Try Again / Restart App buttons)
  - End Ride confirmation dialog (prevents accidental trip cancellation)
  - Recent destinations: last 10 selected destinations shown when focusing empty search field
  - "No results found" message when search returns empty
  - React Native performance optimizations (hoisted Mapbox styles, useShallow selectors, GPU animations, iOS squircle corners)
  - City Heartbeat community dashboard (spatial aggregation, 7-day chart, hazard hotspots, top contributors)
  - GPS signal quality indicator in ManeuverCard: color-coded dot (green ≤10m, amber ≤25m, red >25m) + pulsating navigate icon when poor/lost
  - Screen reader accessibility: PoiCard/RouteInfoOverlay/MapView labeled, HazardAlert `accessibilityLiveRegion="assertive"` auto-announces hazards to TalkBack/VoiceOver
  - Stale auth token recovery: AuthSessionProvider catches expired refresh tokens, clears local session, falls through to anonymous sign-in
  - Steep grade indicator during navigation: amber "↑ Steep" pill for uphill >= 8%, red "↓ Steep" pill for downhill >= 7% (no percentage shown, just icon+label). `computeCurrentGrade()` in core, `SteepGradeIndicator` in NavigationHUD
- **Security hardening (2026-04-13 + 2026-04-14):** Risk score IP protection — quantized `riskScore` to bucket midpoints, `riskCategory` label in API response, auth required on `/routes/preview`, `/routes/reroute`, `/risk-segments`, `/risk-map`, OAuth required (anonymous rejected) on all 4 risk endpoints, score thresholds server-side only (removed from client bundle), map uses server-provided `color` directly. Cloud Run revision `defpedal-api-00048-gtj`. See `securityfix.md`
- **Segment-aware off-route detection (2026-04-14):** `closestPointOnPolyline` projects GPS onto nearest polyline segment (perpendicular distance) instead of nearest vertex. Threshold lowered from 100m to 50m. Fixes false triggers on straight roads with sparse vertices.
- **Reroute profile preservation (2026-04-14):** Reroute uses same routing profile as original route: Safe→Safe, Fast→Fast, Flat→Fast. `effectiveRouteRequest` in navigation.tsx merges global `avoidHills`/`avoidUnpaved` into the reroute request.
- **Neighborhood Safety Leaderboard (2026-04-14):** Full-stack competitive social layer on City Heartbeat screen. Two metrics (CO2 saved, hazards reported) with three time windows (week/month/all-time). Top 50 per 15km GPS radius. Rank-change delta arrows from previous period snapshots. Weekly champion crown on leaderboard + FeedCard. Ghost rank for opted-out users. Settlement cron (Cloud Scheduler, Monday 4AM weekly + 1st monthly) snapshots rankings, awards tiered XP (#1=50/150, #2-3=30/100, #4-10=15/50, #11-50=5/20), and podium badges. 6 champion badges (143 total). `leaderboard_snapshots` table, `get_neighborhood_leaderboard` RPC, `GET /v1/leaderboard`, `POST /v1/leaderboard/settle`. LeaderboardRow atom + LeaderboardSection organism. Cloud Run revision `defpedal-api-00049-529`.
- **Mia Persona Journey (2026-04-15):** Fear-to-confidence guided journey converting nervous non-cyclists ("Mia") into confident riders ("Alex") through 5 levels. Three-layer detection (self-selection, behavioral cron, deep link). Progressive feature disclosure (destination search hidden L1-2 with skip-ahead opt-out, route mode forced to safe L1-3, risk slider hidden L1-3). Level-up celebrations (4 animation variants + testimonial at L5). Share cards, journey tracker on Impact Dashboard, profile referral link. 6 Mia notification templates with 2/week budget. Badge #144 "Confident Cyclist". 6 DB migrations, 21 new files. `mia.ts` routes, `miaNotifications.ts`, `usePersonaT` hook, `useMiaJourney` hook, `MiaLevelUpOverlay`, `MiaJourneyTracker`, `MiaShareCard`. Cloud Scheduler: `mia-detection-cron` (daily 10AM UTC), `mia-notification-cron` (daily 9AM UTC). Cloud Run revision `defpedal-api-00050-n2k`.
- **OSRM server migration (2026-04-15):** Switched from `osrm.defensivepedal.com` (nginx proxy) to direct IP `34.116.139.172:5000` (standard) and `:5001` (flat).
- **Offline Navigation (2026-04-16, victorwho/defpedal_mobil1#6):** Three-layer offline system: (1) `ConnectivityMonitor` provider — debounced NetInfo with lazy `NativeModules.RNCNetInfo` guard (falls back to `isOnline: true` if native module absent), "Back online" toast on reconnect, (2) `OfflineRouteCache` — persists active route to MMKV for app restart recovery, `NavigationResumeGuard` auto-resumes <15min or prompts >=15min, (3) "Download for offline" button on route-preview with progress states. Offline gating in navigation.tsx: reroute suppressed with "No connection" banner, hazards disabled, weather hidden, ManeuverCard wifi-off indicator. `OfflineMutationSyncManager` skips flush when offline, immediate flush on reconnect. `OfflinePackCleanup` auto-deletes packs >5 days + 200MB LRU eviction. `OfflineBanner` molecule. offline-maps storage display with progress bar + pack ages. route-planning offline mode (disabled search, resume cached route card). 9 new files, 9 modified, 26 tests. Requires APK rebuild (`./gradlew installDevelopmentDebug`) to activate real NetInfo.
- **~1200 tests across 3 packages** (core: 339, mobile-api: 270, mobile: ~591). Vitest + happy-dom + @testing-library/react

### Known Incomplete
- iPhone validation (no macOS hardware available)
- Redis activation: code complete (`redisStore.ts`), needs GCP Memorystore + REDIS_URL on Cloud Run
- Habit Engine Phase 7 deferred: neighborhood challenges, Safety Wrapped, mentorship, city reports
- Offline navigation: real NetInfo requires dev APK rebuild (`./gradlew installDevelopmentDebug`); currently falls back to `isOnline: true`

### Known Issues
- Community feed radius search requires GPS permission on first visit
- Profile section expands beyond system navigation bar on some devices

### Removed Features
- Guardian Tier system (reporter→watchdog→sentinel→guardian_angel) — replaced by badge system
- Microlives badges (Time Banker, Community Giver) — conflicted with badge system; microlives display retained in impact summary/dashboard
- TimeBankWidget on route planning screen — removed to declutter main screen
- "Your Total Impact" lifetime stats on post-ride impact screen — replaced by XP section with tier progress

## External Services & Config

### Environment Variables (apps/mobile/.env)
```
APP_VARIANT=development
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_MOBILE_API_URL=https://defpedal-api-1081412761678.europe-central2.run.app
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.eyJ1...  # Mapbox public token
EXPO_PUBLIC_SUPABASE_URL=https://uobubaulcdcuggnetzei.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...     # Supabase anon key
RNMAPBOX_MAPS_DOWNLOAD_TOKEN=sk.eyJ1...    # Mapbox secret (for tile downloads)
```

### Environment Variables (services/mobile-api/.env)
```
PORT=8080
LOG_LEVEL=info
CORS_ORIGIN=*
SAFE_OSRM_BASE_URL=http://...              # Custom OSRM server URL
MAPBOX_ACCESS_TOKEN=pk.eyJ1...
SUPABASE_URL=https://uobubaulcdcuggnetzei.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...        # Service role (full DB access)
SUPABASE_ANON_KEY=eyJhbG...
DEV_AUTH_BYPASS_ENABLED=true               # Local dev only
DEV_AUTH_BYPASS_TOKEN=dev-bypass
DEV_AUTH_BYPASS_USER_ID=dev-user
```

### Supabase Project
- Project ID: `uobubaulcdcuggnetzei`
- Region: (Supabase cloud)
- Key tables: `road_risk_data`, `hazards`, `trips`, `trip_tracks`, `navigation_feedback`, `trip_shares`, `feed_likes`, `trip_loves`, `feed_comments`, `profiles`, `push_tokens`, `leaderboard_snapshots`
- Key RPC: `get_segmented_risk_route`, `get_nearby_feed`, `get_user_trip_stats`, `get_neighborhood_leaderboard`, `check_champion_repeat_badges`

### OSRM Server
- Standard (safe): `http://34.116.139.172:5000/route/v1/bicycle`
- Flat (avoid hills): `http://34.116.139.172:5001/route/v1/bicycle-flat`
- Hosted on GCP project `osrmro1` in `europe-central2-c`
- Custom safety profile using OSM road attributes
- Supports `&exclude=unpaved` parameter

### GitHub
- Repo: `victorwho/defpedal_mobil1`
- CI: GitHub Actions (typecheck only)
- Branch: `main` (all work on main)
