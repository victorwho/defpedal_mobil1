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
- **Release APK build:** use `C:\dpb` copy (for preview variant, avoids CMake path issues)

## Phone Connection

After USB reconnect, always restore port forwarding:
```bash
adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8080 tcp:8080
```

## Cloud Run API

- Production URL: `https://defpedal-api-1081412761678.europe-central2.run.app`
- GCP Project: `gen-lang-client-0895796477`
- Region: `europe-central2`
- Redeploy: `gcloud builds submit --config cloudbuild.yaml --timeout=600`

## App Variants

| Variant | Package | Name | How it gets JS |
|---------|---------|------|---------------|
| development | `com.defensivepedal.mobile.dev` | Defensive Pedal Dev | Metro via USB (hot reload) |
| preview | `com.defensivepedal.mobile.preview` | Defensive Pedal Preview | Embedded bundle (untethered, Cloud Run API) |
| production | `com.defensivepedal.mobile` | Defensive Pedal | Embedded bundle |

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
| **Safe routing** | Custom OSRM server (europe-central2) | Safety-optimized cycling routes |
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
│   │   ├── profile.tsx          # User preferences, toggles, sign-out
│   │   ├── auth.tsx             # Sign in (Google OAuth)
│   │   ├── settings.tsx         # App settings
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
│   │   ├── design-system/       # Branded design system
│   │   │   ├── tokens/          # colors, spacing, typography, radii, shadows
│   │   │   ├── atoms/           # Button, Badge, IconButton, Toggle, etc.
│   │   │   ├── molecules/       # SearchBar, Toast, HazardAlert, WeatherWidget
│   │   │   └── organisms/       # NavigationHUD, BottomNav, RiskDistributionCard,
│   │   │                        # ElevationChart, ElevationProgressCard, TripCard
│   │   ├── hooks/               # Custom React hooks
│   │   │   ├── useBicycleParking.ts   # Overpass API for parking
│   │   │   ├── useBicycleRental.ts    # Overpass API for rentals
│   │   │   ├── useBikeShops.ts        # Overpass API for bike shops
│   │   │   ├── useNearbyHazards.ts    # Hazards near route
│   │   │   ├── useWeather.ts          # Open-Meteo weather + AQI
│   │   │   ├── usePoiSearch.ts        # Mapbox Search Box POI search
│   │   │   ├── useFeed.ts             # Community feed queries + mutations
│   │   │   ├── useRouteGuard.ts       # Screen access control
│   │   │   └── useCurrentLocation.ts  # GPS location
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
│   │   │   └── NotificationProvider.tsx       # Disabled (needs EAS project ID)
│   │   └── store/
│   │       └── appStore.ts      # Zustand store (state + actions + persist)
│   ├── app.config.ts            # Expo/EAS config (variants, plugins, keys)
│   ├── metro.config.js          # Metro bundler config (blocklist for worktrees)
│   └── tsconfig.json            # TypeScript config (excludes test files)
├── packages/core/               # Shared pure-logic package
│   └── src/
│       ├── contracts.ts         # All shared types (RouteOption, FeedItem, etc.)
│       ├── navigation.ts        # Navigation logic (progress, off-route, climb)
│       ├── distance.ts          # Haversine distance, closest point
│       ├── polyline.ts          # Polyline6 encode/decode
│       └── riskDistribution.ts  # Risk category classification
├── services/mobile-api/         # Fastify API server
│   └── src/
│       ├── server.ts            # Entry point
│       ├── app.ts               # Fastify app builder (registers routes)
│       ├── routes/
│       │   ├── v1.ts            # Core API routes (routes, hazards, trips, feedback)
│       │   └── feed.ts          # Community feed routes (share, like, love, comment)
│       ├── lib/
│       │   ├── auth.ts          # JWT + dev-bypass auth middleware
│       │   ├── risk.ts          # Road risk segment fetching (Supabase RPC)
│       │   ├── elevation.ts     # Elevation profile (Mapbox Tilequery)
│       │   ├── submissions.ts   # Trip/hazard/feedback DB writes
│       │   ├── normalize.ts     # Route response normalization
│       │   ├── feedSchemas.ts   # JSON Schema for feed endpoints
│       │   └── dependencies.ts  # Dependency injection container
│       └── Dockerfile           # Production Docker image
├── supabase/migrations/         # Database migrations
│   ├── 202603170001_get_segmented_risk_route.sql
│   ├── 202603170002_add_hazard_type.sql
│   ├── 202603240001_create_trip_tracks.sql
│   ├── 202603260001_community_feed.sql
│   ├── 202603270001_hazard_validations.sql
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
- Persisted: `appState`, `routeRequest`, `routePreview`, `navigationSession`, `queuedMutations`, user preferences (bike type, avoid unpaved, POI visibility, etc.)
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
- Dark theme with yellow (#FACC15) accent
- Tokens: `colors.ts`, `spacing.ts`, `typography.ts`, `radii.ts`, `shadows.ts`
- Components: atoms (Button, Badge, IconButton) → molecules (SearchBar, Toast, HazardAlert, WeatherWidget) → organisms (NavigationHUD, BottomNav, RiskDistributionCard)

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
| **`newArchEnabled: false` for release builds** | New Architecture CMake builds fail on Windows due to 260-char path limit. Old arch works. Revert when project path is shorter or when building on CI |
| **Local notifications** (not Expo Push) | Push notifications require EAS project ID which isn't configured. Local scheduling via `expo-notifications` works without server infrastructure |
| **`NativeModules` guard before `require('expo-notifications')`** | `require()` of a missing native module causes uncatchable fatal crash on Android. Checking `NativeModules.ExpoPushTokenManager` first prevents this |
| **Short path `C:\dev\defpedal`** | Original path `C:\Users\Victor\Documents\1. Projects\...` exceeds Windows 260-char limit for CMake. Junction from old path preserved for file explorer |
| **`C:\dpb` for release builds** | Even `C:\dev\defpedal` can fail for release builds (node_modules resolves to long paths). Full copy to `C:\dpb` with fresh `npm install` is the reliable path |
| **Off-route threshold 100m + GPS accuracy buffer** | Original 50m triggered too easily on sidewalks/near buildings. 100m base + up to 50m GPS accuracy buffer = effective 120-150m threshold |
| **Safe routing = OSRM, Fast routing = Mapbox** | OSRM has custom safety profile using road_risk_data. Mapbox Directions is standard cycling. Both fetched client-side from the mobile app |

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
2. Test on phone confirms feature works
3. Update `progress.md` with what was done
4. Descriptive commit message

### Never:
- Use `SafeAreaView` from `react-native` (use `react-native-safe-area-context`)
- Use top-level `import * as Notifications from 'expo-notifications'`
- Use conditional mount/unmount for Mapbox layers (use filter or key-based hiding)
- Use emoji in Mapbox SymbolLayer textField
- Skip bundle check before phone testing

## Current State (as of 2026-04-02)

### Working Features
- Route planning with destination autocomplete (Google Maps-style UX)
- Safe routing (OSRM) and fast routing (Mapbox Directions)
- Route preview with risk distribution card, elevation chart, weather warnings
- Safe vs fast route comparison with "Switch to safe route" button
- Turn-by-turn navigation with 3D follow camera
- Remaining climb tracker (decreasing during navigation)
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
- Profile with bike type, cycling frequency, avoid unpaved, sharing toggle, POI toggles
- Sign in (Google OAuth) / sign out
- Offline mutation queue (trips, hazards, feedback sync when online)

### Known Incomplete
- Push notifications (needs EAS project ID + native rebuild)
- iPhone validation (no macOS hardware available)
- Redis-backed production caching/rate-limiting
- CO2 savings calculation for trips
- Notification Provider disabled (returns null)

### Known Issues
- Off-route detection can still trigger in dense urban areas with poor GPS
- Community feed radius search requires GPS permission on first visit
- Profile section expands beyond system navigation bar on some devices

## External Services & Config

### Environment Variables (apps/mobile/.env)
```
APP_VARIANT=development
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_MOBILE_API_URL=http://localhost:8080
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
- Key tables: `road_risk_data`, `hazards`, `trips`, `trip_tracks`, `navigation_feedback`, `trip_shares`, `feed_likes`, `trip_loves`, `feed_comments`, `profiles`, `push_tokens`
- Key RPC: `get_segmented_risk_route`, `get_nearby_feed`

### OSRM Server
- Hosted on GCP project `osrmro1` in `europe-central2-c`
- Custom safety profile using OSM road attributes
- Supports `&exclude=unpaved` parameter

### GitHub
- Repo: `victorwho/defpedal_mobil1`
- CI: GitHub Actions (typecheck only)
- Branch: `main` (all work on main)
