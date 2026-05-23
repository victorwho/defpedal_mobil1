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
- **Security:** `DEV_AUTH_BYPASS_ENABLED=false` on Cloud Run (disabled 2026-04-11, revision 00044). Do NOT re-enable in production. Defense-in-depth: as of revision 00074-dzg (2026-05-06), `services/mobile-api/src/lib/auth.ts` also refuses bypass when `process.env.NODE_ENV === 'production'`, and the Dockerfile bakes `ENV NODE_ENV=production` so the gate fires regardless of Cloud Run env config.
- **Startup validation:** Server boots through `validateConfig()` in `config.ts`. Required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `MAPBOX_ACCESS_TOKEN`. In production, missing vars → `process.exit(1)` before `app.listen()`. Avoids the "boots with null clients, fails per-request as confusing 401s" failure mode.

## Play Store Release

- **Developer account type:** Organizational (business) Google Play Developer account. **Exempt from the Nov-2023 14-day closed-test requirement** that applies to personal accounts registered after 2023-11-13 (see https://support.google.com/googleplay/android-developer/answer/14151465). Direct production publishing is allowed; no mandatory 12-tester / 14-day closed test.
- **Audit source-of-truth:** `docs/reviews/playstore-readiness-2026-05-06-revised.md`. Stage A + B fixes shipped in commit `7e51ff0` (2026-05-06). The audit's "Stage C: 14-day Open Testing observation" was a quality recommendation, NOT Google's mandatory rule — with the business account the calendar wait collapses to a staged rollout that watches Android Vitals at each step.
- **Recommended rollout cadence (post-business-account adjustment):** upload AAB → Data Safety form → 5% for 24–48 h → check crash-free ≥ 99.5% / ANR ≤ 0.47% → 20% for 24–48 h → check → 50% → check → 100%. ~5–7 days end-to-end. Don't compress to "1% → 100% same day" — staged rollout is the only good way to catch Android Vitals regressions without nuking the whole user base; the 14-day Google rule has nothing to do with it.
- **Data Safety form checklist:** `docs/legal/counsel-review-2026-04-29/16-data-safety-reconciliation-2026-05-06.md`. **HARD RULE:** apply the form change *after* the matching production AAB is live — never before. Play's re-review cross-references the live AAB; a form-first update creates a mismatch in the opposite direction (form claims clean, live AAB still ships firebase-analytics) and is just as bad as the current mismatch.
- **EAS Sentry token:** `SENTRY_AUTH_TOKEN` is set as a `secret` env var in EAS production/preview/development environments (set 2026-05-06). Production EAS builds without it now fail-fast at `app.config.ts` so source-maps are guaranteed to upload.
- **Mapbox SDK telemetry** is disabled at module load (`Mapbox.setTelemetryEnabled(false)` in `RouteMap.tsx` and `offlinePacks.ts`). The Privacy Policy at `apps/web/app/privacy/page.tsx` explicitly states "Mapbox SDK telemetry is disabled" — keep this in sync if the call is ever removed.
- **firebase-analytics intentionally NOT shipped.** Dropped from `apps/mobile/android/app/build.gradle` 2026-05-06. Belt-and-suspenders flag injected via Expo config plugin `apps/mobile/plugins/withAndroidFirebaseAnalyticsDisabled.js` so the inert flag survives `expo prebuild`. If a future Firebase product is added, update Privacy Policy + Data Safety form *before* the AAB ships.
- **Consent toggles default OFF** for first-time users (`apps/mobile/app/onboarding/consent.tsx`). Returning users keep their saved choice. Don't flip the default back to ON without an ANSPDCP/ePrivacy review.

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
| **Auth** | Supabase Auth (native Google Sign-In via `signInWithIdToken`; email/password; anonymous) | User authentication |
| **Database** | Supabase (PostgreSQL + PostGIS) | Trips, hazards, feedback, community feed, road risk data |
| **API server** | Fastify (Node.js) | Mobile API (services/mobile-api) |
| **Safe routing** | Custom OSRM server (`osrm.defensivepedal.com`) | Safety-optimized cycling routes |
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
│   │   │   ├── atoms/           # Button, Badge, IconButton, Toggle, Card, SectionTitle, ScreenHeader, BadgeIcon, BadgeProgressBar, BadgeInlineChip, TierPill, XpGainToast, PressableScale, IdlePulse, FadeSlideIn
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
│   │   │   ├── daily-weather-notification.ts # 8:30am weather local notification (thin scheduler glue)
│   │   │   ├── daily-weather-messages.ts # Pure helpers: 40 witty titles, advice builder, trigger math
│   │   │   ├── navigation-helpers.ts  # Tab press routing (Map→nav or planning)
│   │   │   └── env.ts                 # Environment variable access
│   │   ├── providers/           # React context providers
│   │   │   ├── AppProviders.tsx        # Provider tree root
│   │   │   ├── AuthSessionProvider.tsx # Supabase auth session
│   │   │   ├── NavigationLifecycleManager.tsx # GPS breadcrumb sampling
│   │   │   ├── OfflineMutationSyncManager.tsx # Queue drain to API
│   │   │   ├── DailyWeatherScheduler.tsx      # 8:30am notification scheduler
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
│       │   └── firstRideNotifications.ts  # POST /v1/notifications/firstride/evaluate (cron-only)
│       ├── lib/
│       │   ├── auth.ts          # JWT + dev-bypass auth middleware
│       │   ├── risk.ts          # Road risk segment fetching (Supabase RPC)
│       │   ├── elevation.ts     # Elevation profile + gain/loss (Mapbox Terrain-RGB tiles)
│       │   ├── submissions.ts   # Trip/hazard/feedback DB writes
│       │   ├── normalize.ts     # Route response normalization
│       │   ├── feedSchemas.ts   # JSON Schema for feed endpoints
│       │   ├── leaderboardSchemas.ts # JSON Schema for leaderboard endpoints
│       │   ├── citySuggestionSchemas.ts # JSON Schema for /v1/city-suggestions
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
│   ├── 202605230002_create_city_suggestions.sql
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
- Mutations queued in Zustand: `trip_start`, `trip_end`, `trip_track`, `hazard`, `hazard_vote`, `feedback`, `trip_share`
- `OfflineMutationSyncManager` drains queue every 15s when API reachable
- Queue survives app restart (persisted)
- `trip_end` and `trip_track` wait for `trip_start` to resolve (trip server ID mapping)

### Trip Data Flow (Critical for Deletion / Privacy)
A completed ride writes to **four** Supabase tables, each read by a different surface — the History row is not the source of truth for the community surfaces:
- `trip_tracks` → History tab, per-period Stats Dashboard (RPC `get_trip_stats_dashboard`)
- `trip_shares` → City Heartbeat (RPC `get_city_heartbeat`), Community Stats (`get_community_stats`), Community Feed (`get_nearby_feed`), Neighborhood Leaderboard ride counts (`get_neighborhood_leaderboard`)
- `activity_feed` with `payload->>tripId` → unified social feed (RPC `get_ranked_feed`: own profile, follower feeds, suggested users)
- `trips` → lifecycle metadata only; not read by any user-facing screen

Any handler that "removes a ride" (user-initiated delete, GDPR purge, retention policy) must touch **all three user-visible tables**, not just `trip_tracks`. Pattern is captured in `services/mobile-api/src/lib/submissions.ts` `deleteTripTrack`: capture the parent `trip_id` atomically via `.delete().select('id, trip_id')` on `trip_tracks`, then delete from `trip_shares` (cascades `feed_likes`/`feed_comments`/`trip_loves`) and `activity_feed` (cascades `activity_reactions`/`activity_comments`). Profile totals, `ride_impacts`, `ride_microlives`, badges, XP, and immutable `leaderboard_snapshots` are NOT unwound — the confirm dialog explicitly preserves "past achievements and impact totals". See error-log #34 for the trap.

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
- **Rules of the road:** [`docs/design-context.md`](../docs/design-context.md) — theme direction, token rules, motion rules, haptic map, accent discipline, accessibility gates, explicit drops. Read this before any visual change.
- **Active plan:** [`docs/plans/design-audit-implementation.md`](../docs/plans/design-audit-implementation.md) — P1-30 Design Quality Pass, 8-week phased sequencing.
- Dark/light/system theme via `ThemeProvider` + `useTheme()` hook. User picks in Profile > Display (3-pill picker: Dark / Light / System). Persisted in Zustand as `themePreference`
- All 30 screens + key components (Screen, MapStageScreen, SettingRow, Toggle, TripCard, FeedCard, CommunityStatsCard, ElevationChart) use `createThemedStyles(colors)` factory pattern
- Forces dark theme during NAVIGATING state (glare reduction, battery, safety contrast)
- Tokens: `colors.ts`, `spacing.ts`, `typography.ts`, `radii.ts`, `shadows.ts`, `tints.ts` (opacity + rgba tints), `iconSize.ts` (xs-3xl), `zIndex.ts` (semantic layers), `motion.ts`
- Components: atoms (Button, Badge, IconButton, Toggle, Card, SectionTitle, ScreenHeader, FadeSlideIn, PressableScale, IdlePulse) → molecules (SearchBar, SettingRow, Toast, HazardAlert, WeatherWidget) → organisms (NavigationHUD, BottomNav, RiskDistributionCard)
- `ScreenHeader` atom: unified header with 4 variants (`back`, `close`, `brand-logo`, `title-only`). Screen wrapper accepts `headerVariant` prop. Map screens (route-planning, route-preview, navigation) excluded — use MapStageScreen. BackButton atom retained for floating map buttons only.
- Map overlay cards (origin, destination, search, FABs) intentionally use `#FFFFFF` — they sit on the dark map regardless of theme
- Legacy `mobileTheme` bridge deleted — all components use design system tokens directly
- `FadeSlideIn` atom: entry animation (opacity + translateY, 200ms) with `useReducedMotion` support. Pair with `Math.min(index, stagger.maxItems) * stagger.step` (from `motion.ts`) for list cascades.
- `PressableScale` atom: canonical press primitive — spring scale + opacity + haptic-intent prop. Replaces ad-hoc `transform:[{scale:0.97}]` everywhere. Used by Button, Card, FABs in route-planning.
- `IdlePulse` atom: looping opacity 1.0 ↔ 0.55 over ~1.1s phases. Reserved for empty-state illustrations and idle decorative elements; never wrap content the user must read or interact with.
- `useStaggeredEntrance` hook: alternative to `FadeSlideIn` as a hook returning the animated style instead of a wrapper component. Same 40ms-step cascade semantics, mount-only, reduced-motion fallback.
- `motion.ts` springs: `gentle` / `snappy` / `stiff` / `wobbly` presets are the project's tuning knob — adjust here when press feel is off, never inline `tension`/`friction` values in components.
- `haptics.ts` utility + `useHaptics` hook: native-module guard for expo-haptics via `hasExpoNativeModule('ExpoHaptics')` (the generic arch-independent probe in `src/lib/expoNativeModule.ts`). Do NOT use `Boolean(NativeModules.ExpoHaptics)` — it's `undefined` on bridgeless release builds and silently disables haptics (error-log #21). Use `hasExpoNativeModule(name)` for ANY new Expo native-module presence check.
- Analysis: `design-work/design-system-analysis.md` (SWOT, scores, component inventory, migration status)

### 3D Navigation Camera
- `followUserLocation` + `followUserMode: 'course'` + `followPitch: 45` + `followZoomLevel: 16`
- GPS heading drives camera rotation
- Tap map → breaks follow (flat overview). Recenter button → resumes 3D follow.
- Native `LocationPuck` with `puckBearing="course"` replaces manual circle marker

### Notifications (read before adding any notification)
The notification stack has several non-obvious invariants that have each caused silent, hard-to-debug failures. Follow this section exactly when adding a new notification.

**1. Native-module detection — NEVER use `NativeModules.Expo*`.**
expo-notifications registers through the Expo Modules API (`globalThis.expo.modules`), NOT the legacy React Native bridge. `NativeModules.ExpoPushTokenManager` is `undefined` on the **New Architecture (bridgeless)**, which the preview/production variants run — so a `NativeModules`-based guard passes on the dev variant (old-arch bridge) and silently disables ALL notifications on every release build. Always gate on `hasNotificationsNativeModule()` from `apps/mobile/src/lib/notificationNativeModule.ts`, which probes via `requireOptionalNativeModule('ExpoPushTokenManager')`. See error-log #21 + #2b.

**2. Permission must be REQUESTED, not just checked.**
`Notifications.getPermissionsAsync()` only reads current status. To surface the OS dialog, call `ensureNotificationPermissionAsync()` (`push-notifications.ts`) — it prompts once and respects `canAskAgain` so it never spams after a permanent denial. The entry point that actually triggers the prompt for anonymous/first-run users is `DailyWeatherScheduler` (weather ping is on by default), since push-token registration is gated behind a logged-in session. `POST_NOTIFICATIONS` must stay declared in `AndroidManifest.xml` (required for the Android 13+ dialog) — note the manifest is hand-managed because this project never runs `expo prebuild` (error-log #27).

**3. Lazy `require()` after the guard.** Never top-level `import * as Notifications`. Use `hasNotificationsNativeModule()` → then `require('expo-notifications')` inside try/catch (error #2/#2b).

**4. Two delivery paths.** Server-side pushes go through the Expo Push API (`services/mobile-api/src/lib/push.ts`) with per-user prefs/quiet-hours/budget. Local scheduling (`expo-notifications`) handles the daily 8:30am weather ping (`daily-weather-notification.ts` + `daily-weather-messages.ts`, scheduled by `DailyWeatherScheduler`).

**5. Daily weather ping specifics.** Scheduled on every app open: fetch fresh forecast FIRST, then cancel + reschedule a one-shot `timeInterval` trigger (so a fetch failure leaves yesterday's queued notification intact). **Timing is intentionally inexact** — Android batches `timeInterval` triggers under Doze, so delivery can drift 5–15 min past 8:30. This is accepted, NOT a bug; do not "fix" it with `SCHEDULE_EXACT_ALARM` (Play Store restricts that permission to alarm/calendar apps). A `DAILY` trigger would fire closer + repeat without reopening, but freezes the content between app opens — rejected to keep the forecast fresh.

**6. Tap handling → in-app.** Every notification's `content.data` must carry a `type` discriminator (and any payload the tap needs). `handleNotificationResponse` (`push-notifications.ts`) switches on `data.type`; `NotificationProvider` wires both the warm-start listener and the cold-start `getLastNotificationResponseAsync()` path. To show content in-app on tap (rather than just navigate), stash it in a **transient, non-persisted** store field and render an overlay manager in `app/_layout.tsx` (suppressed during `NAVIGATING`). Canonical example: the daily-weather tap sets `weatherNotice` → `WeatherNoticeManager` renders `WeatherNoticeModal`. Non-persisted is deliberate so persist-hydration on cold start doesn't wipe a tap that just fired.

**New-notification checklist:** (a) guard with `hasNotificationsNativeModule()`; (b) request permission via `ensureNotificationPermissionAsync()` somewhere reachable; (c) set `content.data.type`; (d) add a `handleNotificationResponse` case; (e) if showing in-app, add a transient store field + overlay manager; (f) add the channel on Android; (g) bundle check + test on a **preview** build (dev's old-arch bridge hides the bridgeless-only failures).

## Key Decisions & Rationale

| Decision | Why |
|----------|-----|
| **Mapbox vector tiles for POI** (not Overpass) | Overpass rate-limits aggressively after multiple queries. Vector tiles are pre-loaded, zero API calls, instant rendering |
| **Overpass only for parking/rental/shops** | These specific OSM tags aren't in Mapbox's POI layer. Rate limit risk accepted (cached 5-10 min via TanStack Query) |
| **Filter-based layer hiding** (not conditional mount/unmount) | Mapbox RN caches rendered features. Unmounting a ShapeSource doesn't clear markers. Use `key={vis ? 'on' : 'off'}` or impossible filter to force remount |
| **`newArchEnabled` per variant** | Development: off (bridge mode) so Metro bundle loads over USB. Preview/production: on (bridgeless). Controlled in `app.config.ts` + `gradle.properties` |
| **Native Google Sign-In (not browser OAuth)** | `@react-native-google-signin/google-signin` + `supabase.auth.signInWithIdToken` shows the OS account picker — no Chrome Custom Tab, and the user never sees `…supabase.co` (Google is no longer brokered through the Supabase callback). Requires `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (the SAME web client as the Supabase Google provider, so its audience is pre-trusted) + Android OAuth clients (package + signing SHA-1) in the web client's GCP project `gen-lang-client-0895796477` — NOT the Firebase project. `google-services.json` is unused by sign-in. Lazy-required native module (no `expo prebuild`; autolinking handles it). See error-log #44 |
| **Expo Push + local notifications** | Server-side pushes go through Expo Push API (`services/mobile-api/src/lib/push.ts` → `https://exp.host/--/api/v2/push/send`) with per-user prefs, quiet hours, and daily budget. Local scheduling (`expo-notifications`) handles the daily 8:30am weather ping. EAS project ID `f8bcd740-...` wired in `app.config.ts:223` |
| **Expo Modules API guard before `require('expo-notifications')`** | `require()` of a missing native module causes uncatchable fatal crash on Android. Detect presence first via `hasNotificationsNativeModule()` (`apps/mobile/src/lib/notificationNativeModule.ts`), which probes `requireOptionalNativeModule('ExpoPushTokenManager')` from `expo-modules-core`. **Do NOT check `NativeModules.ExpoPushTokenManager`** — it's `undefined` on the New Architecture (bridgeless) preview/production builds even when the module is present, silently killing all notifications. See error-log #21 + #2b |
| **Short path `C:\dev\defpedal`** | Original path `C:\Users\Victor\Documents\1. Projects\...` exceeds Windows 260-char limit for CMake. Junction from old path preserved for file explorer |
| **`C:\dpb` for release builds** | Even `C:\dev\defpedal` can fail for release builds (node_modules resolves to long paths). Full copy to `C:\dpb` with fresh `npm install` is the reliable path |
| **Off-route threshold 50m + segment-aware snap** | `closestPointOnPolyline` projects GPS onto nearest line segment (perpendicular distance), not just nearest vertex. 50m base + up to 50m GPS accuracy buffer = effective 50-100m. Old vertex-only approach needed 100m because midpoint of straight segments inflated distance |
| **Safe routing = OSRM, Fast routing = Mapbox** | OSRM has custom safety profile using road_risk_data. Mapbox Directions is standard cycling. Both fetched client-side from the mobile app. OSRM at `https://osrm.defensivepedal.com` (Caddy + Let's Encrypt TLS in front of port 5000) |
| **Flat routing = separate OSRM instance** | `bicycle-flat` profile uses 7.0x uphill penalty (vs 1.1x standard). Reachable at `https://osrm-flat.defensivepedal.com` (Caddy in front of port 5001 — same `/route/v1/bicycle/...` path; the subdomain alone routes the request). Activated by "Flat" pill on route planning (3-way toggle: Safe/Fast/Flat). `avoidHills` flag composes with `avoidUnpaved` |
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

### Share text — always include the Play Store URL
- Import `PLAY_STORE_URL` from `@defensivepedal/core` (defined in `packages/core/src/shareCaption.ts`). Don't hardcode the URL — `pcampaignid=web_share` is canonical for Google's Share install attribution.
- All TEXT-based share invocations (`Share.share({ message })` from `react-native`) must include the URL so recipients without the app have a one-tap install path. Existing wired surfaces: profile "Help a friend" referral row, `useShareRoute` route share, `my-shares.tsx` re-share, `route-planning.tsx` hazard alert.
- IMAGE-based shares routed through `lib/shareImage.ts` (`expo-sharing`'s `Sharing.shareAsync`) cannot carry body text — the API only takes `fileUri` + `dialogTitle`. The image itself carries the brand. Don't try to "fix" this by passing the URL in `dialogTitle` — that field is the share-sheet header visible only to the sharer, not the recipient. If the URL really matters on a particular image surface, burn it into the share-card render at capture time (small QR + footer text on the PNG itself).

## Gotchas & Pitfalls

See `.claude/error-log.md` for the full list with details. Key ones:

1. **Blank screen = check ports + Metro** — `adb reverse tcp:8081 tcp:8081` after every USB reconnect
2. **Debug APK overwritten by release** — installing release APK with same package name overwrites debug. Check with `adb shell input keyevent 82` (dev menu test)
3. **Zustand hydration race** — `useRouteGuard` locks with `hasPassedRef` to prevent persist hydration from bouncing users
4. **Emoji don't render in Mapbox SymbolLayer** — use plain text characters only (W, B, WC, S, T, P, R)
5. **Conditional ShapeSource mount/unmount leaves ghost markers** — use `key` prop to force remount instead
6. **`DEFAULT_ROUTE_REQUEST` must have `0,0` coords** — non-zero default causes camera to center on wrong location
7. **Windows 260-char CMake path limit** — build from `C:\dpb` (full copy) for release APKs
8. **`expo-notifications` native module crash** — guard with `hasNotificationsNativeModule()` (Expo Modules API probe) before `require()`. NEVER use `NativeModules.ExpoPushTokenManager` — it's `undefined` on bridgeless preview/production builds and silently disables all notifications (error-log #21 + #2b)
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
- A **git pre-push hook** (`.git/hooks/pre-push`) automatically runs `npm run typecheck` AND `npm run lint:mobile:check` before every push (mirrors CI). If either fails, the push is blocked. Do NOT skip it with `--no-verify`. The lint step uses a ratchet — it fails on +1 violation above the per-file baseline. To intentionally accept new violations, run `npm run lint:baseline` from `apps/mobile/`.
- The hook source of truth is tracked at `scripts/git-hooks/pre-push`. On fresh clones the file isn't yet copied into `.git/hooks/` (git ignores that directory), so run `bash scripts/install-git-hooks.sh` once to install. Re-run the installer any time `scripts/git-hooks/*` changes.
- ESLint disable directives (`// eslint-disable-next-line some-rule`) must reference rules that are actually registered. This repo doesn't ship `eslint-plugin-react-hooks`, so disables for `react-hooks/exhaustive-deps` will themselves become lint errors. See `.claude/error-log.md` Error #35.

### Never:
- Use `SafeAreaView` from `react-native` (use `react-native-safe-area-context`)
- Use top-level `import * as Notifications from 'expo-notifications'`
- Use conditional mount/unmount for Mapbox layers (use filter or key-based hiding)
- Use emoji in Mapbox SymbolLayer textField
- Skip bundle check before phone testing

## Current State (as of 2026-05-23)

### Working Features
- **Early end-of-ride reason capture (session 57, 2026-05-23):** When a rider taps End Ride mid-route, the existing Save/Discard alert is followed by a skippable single-choice modal asking *"Why did you end your route early?"* — five options (`reached_destination`, `found_better_route`, `felt_unsafe`, `no_longer_needed`, `other`) where **Other** reveals a 280-char autofocused text field with counter. The answer is recorded on **`trips.early_end_reason` + `early_end_reason_note`** (the parent row written by every `trip_end`) so analytics covers Save AND Discard outcomes uniformly; a redundant copy lands on `trip_tracks` for Save only. Mobile: `EarlyEndReasonModal` organism (i18n-agnostic), `endActionPending: 'save' \| 'discard' \| null` state on the nav screen, `finalizeEarlyEnd` branches by action — save → `/feedback` (XP/badges/trip_track), discard → `/route-planning` (no trip_track, no XP). Modal primary-button label flips Save ride / Discard ride via `endActionPending`. Three migrations: `202605210001_trip_track_early_end_reason.sql`, `202605220001_trip_track_early_end_reason_other.sql`, `202605230001_trips_early_end_reason.sql`. API revision `defpedal-api-00080-f59`. **Gotcha logged**: when JS console.log output is silent in `adb logcat -s ReactNativeJS:*` despite the user reporting UI activity, dump `adb shell dumpsys activity recents` first — three app variants (`com.defensivepedal.mobile`, `…mobile.dev`, `…mobile.preview`) are installed and an accidental tap of the wrong icon (production embedded bundle, not Metro-fed dev) silently invalidates a whole debugging session. See progress.md "Session 57" for the chase.
- **Route feature awareness (v0.2.55 → v0.2.57, session 52 → 53):** End-to-end "elements on the map during routing" surface — tunnels, bridges, traffic signals, unprotected left turns, railway crossings. Extracted in `packages/core/src/routeFeatures.ts` from OSRM annotations (`annotation.classes` runs for tunnel/bridge zones) and step maneuvers (left-turn heuristic via `maneuver.modifier` + intersection bearing count `< 4`). Surfaces as: (a) on-map markers via `RouteFeatureLayer.tsx` — a single ShapeSource + tier-colored CircleLayer + SDF SymbolLayer where the icon glyph is recolored white via `iconColor`/`sdf:true` against slate (`info`) / amber (`caution`) / red (`warning`) discs; (b) a bottom-right proximity alert stack in `RouteFeatureAlertStack.tsx` during navigation, max 2 cards + "+N more" chip, distance thresholds 200m/150m/100m by type, slide-in entry, safety-critical haptic once per feature, escalates to `accessibilityLiveRegion="assertive"` for railway + unprotected lefts. SDF assets (5 PNGs ×3 densities = 15 files) live at `apps/mobile/assets/map-icons/`. Hazard-dedup upstream in `useFeatureCollections` so a `dangerous_intersection` hazard hides any nearby `semafor` feature. Single Profile > Display toggle (`showRouteFeatures`, default ON, persisted) gates both surfaces. **Extractor lives in core, not the server**, because mobile fetches routes directly from OSRM/Mapbox client-side via `mapbox-routing.ts` — the server's `normalizeRoutePreviewResponse` re-imports from core too, so both paths produce identical features. Semafor + railway are stub extractors today (return `[]`); the wiring is live and will surface those automatically when the OSM node-tag data layer ships. See `progress.md` "Session 52" + "Session 53" for the full design and the v0.2.55 → v0.2.57 ship-debug-iterate trail.
- **Pedal mascot system (2026-05-11/12):** Brand mascot (friendly white poodle in yellow helmet + vest, named "Pedal") inserted at 20 emotional touchpoints across the app. Foundation: `<Mascot pose size width />` atom (`src/design-system/atoms/Mascot.tsx`) with 19 typed poses, decorative-by-default a11y, `width` override for tight containers; `mascotPoses.ts` token map (RGBA PNG-24, 1080×1350 portrait); `showMascot` persisted preference + Profile > Display toggle (en + ro); **safety quarantine baked into the atom — returns null when `appState === 'NAVIGATING'` OR `showMascot=false`** so Pedal never appears on nav HUD / hazard alerts / off-route / low-GPS. **Placements**: onboarding location (wave), safety-score loading (map), goal-selection (ride), signup-prompt (point), auth (stand), ImpactSummaryCard corner stamp (sticker, every completed ride), Trophy Case zero-badge state (binoculars, in ListHeaderComponent — NOT ListEmptyComponent which is unreachable), BadgeUnlockOverlay corner (cheer + confetti), ErrorBoundary (trapeze), OfflineBanner (binoculars xs with Ionicon fallback), Trips empty (ride-point), Community feed empty (stand), Profile avatar default for no-photo users (stand 36 px width), Daily quiz hero (study) + correct/wrong reactions (cheer/sad), Delete-account confirmation (sad), StreakCard dormant state when `currentStreak === 0` (sleep), LeaderboardSection title when user is rank #1 (trophy), WeatherWarningModal header (rain), ElevationChart header when min→max range ≥100 m (climb, 28 px). 19 PNGs in `apps/mobile/assets/mascot/` (~13 MB). Wishlist prompt source: `design-work/mascot/wishlist-prompts.md`. **Splash screen attempted and reverted** (commit `77e7bb0`) — Android 12+ system splash enforces a circular icon-mask that crops portrait illustrations, and `app.config.ts` plugins only apply during `expo prebuild` which would overwrite hand-tuned native config (firebase-analytics + foreground-service plugins). Native `splashscreen_logo.png` (×5 densities) and `colors.xml` left at clean defaults — `assets/icon.png` as splash logo, white background, empty `values-night` override. User-supplied `splash_video.mp4` preserved at `design-work/mascot/splash_video.mp4` for future use. Unused poses (phone, lock, excited) preserved in token map.
- **Motion polish (v0.2.45 → v0.2.48, session 48):** four-phase initiative shipped to Firebase `early-access-preview`. P0 — everyday touchpoints (Button/Card spring press via new `PressableScale` atom, BottomNav sliding indicator + icon scale-pop, CategoryTabBar pill cross-fade, Safe/Fast/Flat `ModeTogglePill`, Like/Love bloom, animated TextInput focus border, directional Stack screen transitions). P1 — screen rhythm (list stagger via existing `FadeSlideIn` on trips/badges/shares/blocked-users, animated Modal backdrop ramp, BottomSheet drag-handle teaching pulse). P2 — map surface (route polyline + hazard layer fade-in via Mapbox native `*OpacityTransition`, NavigationHUD GPS-dot color crossfade, FAB spring press). P3 — celebration (Streak flame flicker, success Toast bloom, destination pin drop via `circleRadiusTransition`, empty-state `IdlePulse`, XP-bar shine sweep). All animations gated by `useReducedMotion`; safety-critical surfaces suppress motion when `appState === 'NAVIGATING'`. New shared primitives: `PressableScale`, `IdlePulse`, `useStaggeredEntrance`, extended `motion.ts` (springs.gentle/snappy/stiff/wobbly + EXIT_RATIO + stagger). Stayed on react-native built-in `Animated` API instead of Reanimated 4 because dev variant runs `newArchEnabled=false` (Windows Metro bridge constraint).
- Route planning with destination autocomplete and recent destinations (Google Maps-style UX)
- Safe routing (OSRM) and fast routing (Mapbox Directions)
- Route preview with risk distribution card, elevation chart, weather warnings (progressive disclosure — details in expanded sheet)
- Safe vs fast route comparison with "Switch to safe route" button (shows "Slightly safer" / "Similar safety" for small differences)
- Flat routing (avoid hills) — 3-way toggle on route planning (Safe/Fast/Flat), uses separate OSRM instance with 7x uphill penalty
- **Tap-to-cycle routing mode from preview (session 54):** the small Safe/Fast/Flat badge on `route-preview.tsx` (rendered in 3 places: top map overlay, collapsed peek strip, expanded summary strip) is a `PressableScale` that cycles Safe → Fast → Flat → Safe and triggers an automatic refetch (the previewQuery key includes `routeRequest.mode` + `avoidHills`). Distinct Badge variants per mode (Safe `risk-safe` green, Fast `info` blue, Flat `accent` yellow) make the current profile readable at a glance; a `swap-horizontal` icon advertises tappability and is swapped for a `Spinner` while `previewQuery.isFetching`. `hitSlop={8}` brings the ~28pt badge up to the 44pt touch-target minimum. Riders no longer need to pop back to route-planning to switch profiles. Single source of truth: `renderModeCyclePill(longLabel)` in `apps/mobile/app/route-preview.tsx`.
- Turn-by-turn navigation with 3D follow camera
- Remaining climb tracker (always shows ascent remaining, decreasing during navigation)
- Elevation progress card (toggleable during navigation)
- Waze-style hazard reporting (from both planning and navigation screens)
- Hazard proximity alerts during navigation with upvote/downvote (community trust signal)
- Hazard detail sheet (tap any marker) with vote buttons, score, age, distance, auto-expiry countdown
- Hazard marker clustering at zoom < 14 (dense areas collapse to count bubbles colored by worst severity)
- Auto-expiry: hazards fade based on type TTL (`poor_surface`/`aggressive_traffic` 4h → `narrow_street`/`missing_bike_lane`/`dangerous_intersection` 30d; `aggro_dogs` 21d; `pothole` 14d); upvotes extend, downvotes halve; `score <= -3` hides; daily 3 AM cron hard-deletes stale + score-dropped entries
- Striped red/black hazard zones on route
- Community feed with trip sharing, likes, loves, comments
- Trip history with GPS trail + planned route map replay
- Weather widget (temperature, precipitation, wind, AQI)
- Daily 8:30am cycling weather notification — 40 witty/sarcastic random title variants on good-weather days (temp 10–28°C, rain ≤30%, wind ≤25 km/h, no storm/snow), safety warnings on bad-weather days (storm / snow / extreme cold / strong wind / heavy or moderate rain / freezing / windy). Pure helpers (titles, advice builder, trigger math, forecast parser) live in `daily-weather-messages.ts` and are covered by 60 unit tests. SUT fetches forecast BEFORE cancelling the prior schedule so a fetch failure leaves yesterday's queued notification intact
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
- **Mia Persona Journey RETIRED (2026-05-10):** The 5-level Mia guided journey shipped 2026-04-15 (`mia.ts` routes, `useMiaJourney` hook, `MiaLevelUpOverlay`, `MiaJourneyTracker`, `MiaShareCard`, `MiaInvitationPrompt`, `MiaSegmentBanner`, persona detection cron, level-progression celebrations) was fully removed in v0.2.43. The general tier system (Kickstand → Legend) and 144-badge catalogue already covered gamification, and the Mia layer was actively gating useful features (destination search, mode toggle, route preview details) for the users who needed them most. **What's kept:** Confident Cyclist badge (#144, re-triggered on first completed ride via `check_and_award_badges`), 4 of 6 notification templates (`first_ride_nudge`, `post_first_ride`, `weather_invitation`, `lapsed_reengagement`) under generic endpoint `POST /v1/notifications/firstride/evaluate` (Bearer `CRON_SECRET`, daily 9 AM UTC via `mia-notification-cron`), profile referral row gated on the badge being earned (no `?persona=mia` query param). **Deleted Cloud Scheduler:** `mia-detection-cron` (the `/v1/mia/detection/evaluate` endpoint is gone). **Database:** Mia columns on `profiles` (15 in total: `persona`, `mia_journey_*`, `mia_detection_*`, `mia_total_rides`, `mia_rides_*`, `mia_prompt_*`, `mia_testimonial`, `mia_moderate_segments_completed`, `mia_non_cyclists_converted`) marked deprecated via `COMMENT ON COLUMN`. `notify_mia` is the surviving column — used as the opt-in flag for the cron. Drop the deprecated columns in a follow-up migration after Play Store rollout reaches 100% of v0.2.43+. **Backend:** `routes/mia.ts` deleted; `routes/firstRideNotifications.ts` is the thin replacement (cron-only). `lib/firstRideNotifications.ts` replaces `lib/miaNotifications.ts`. `routes/v1.ts` ride-end no longer returns `miaLevelUp`. **Mobile:** all `isMia` / `miaJourneyLevel` gates removed from `route-planning` and `route-preview`; route screens render unconditionally. Telemetry queue (`pendingTelemetryEvents`, `enqueueTelemetryEvent`, `AppOpenTelemetryObserver`) deleted — only Mia-detection consumed it. 19 mobile Mia files deleted (components, hooks, tokens, design-system organisms/molecules/atoms, store actions, API client functions, shared types). Cloud Run revision `defpedal-api-00077-xj7`.
- **OSRM server migration (2026-04-15):** Switched from `osrm.defensivepedal.com` (nginx proxy) to direct IP `34.116.139.172:5000` (standard) and `:5001` (flat).
- **OSRM HTTPS migration (2026-04-28):** Reverted to domain-based OSRM endpoints behind Caddy + Let's Encrypt TLS. Standard now at `https://osrm.defensivepedal.com/route/v1/bicycle`, flat at `https://osrm-flat.defensivepedal.com/route/v1/bicycle` (subdomain split — same path on both, port 5000 vs 5001 selected by Caddy). Cleartext exceptions removed from `apps/mobile/app.config.ts` (iOS `NSAppTransportSecurity`, Android `withAndroidNetworkSecurityConfig` plugin) and `scripts/build-preview.sh` (Step 1c2 deleted). Closes compliance plan item 6 long-term.
- **Offline Navigation (2026-04-16, victorwho/defpedal_mobil1#6):** Three-layer offline system: (1) `ConnectivityMonitor` provider — debounced NetInfo with lazy `NativeModules.RNCNetInfo` guard (falls back to `isOnline: true` if native module absent), "Back online" toast on reconnect, (2) `OfflineRouteCache` — persists active route to MMKV for app restart recovery, `NavigationResumeGuard` auto-resumes <15min or prompts >=15min, (3) "Download for offline" button on route-preview with progress states. Offline gating in navigation.tsx: reroute suppressed with "No connection" banner, hazards disabled, weather hidden, ManeuverCard wifi-off indicator. `OfflineMutationSyncManager` skips flush when offline, immediate flush on reconnect. `OfflinePackCleanup` auto-deletes packs >5 days + 200MB LRU eviction. `OfflineBanner` molecule. offline-maps storage display with progress bar + pack ages. route-planning offline mode (disabled search, resume cached route card). 9 new files, 9 modified, 26 tests. Requires APK rebuild (`./gradlew installDevelopmentDebug`) to activate real NetInfo.
- **Tier 1 landscape support (2026-05-05, v0.2.31):** Non-map screens now follow the device auto-rotate setting. Profile, History, Community, Trophy Case, Settings, FAQ, Diagnostics, Onboarding, Auth — all rotate. Map screens (`/route-planning`, `/route-preview`, `/navigation`) stay portrait-locked at the screen level via `useLockOrientation` hook (`apps/mobile/src/hooks/useLockOrientation.ts`) — handlebar-mount UX, no landscape variant. The hook uses `useFocusEffect` (not `useEffect`) because `expo-screen-orientation`'s `lockAsync` is process-level and Expo Router's stack keeps screens mounted underneath pushed routes — `useEffect` cleanup wouldn't fire on push navigation, leaving the entire app locked. Trophy Case grid responsive: 3 cols portrait → 5 cols ≥600dp (landscape/tablet). Particle-burst overlays (BadgeUnlockOverlay; MiaLevelUpOverlay also patched at the time, since deleted in v0.2.43) replaced explicit `SCREEN_W/H` with `StyleSheet.absoluteFillObject` to reflow. Tier 2 (landscape variant of `MapStageScreen` side-panel + `NavigationHUD` left-maneuver / right-map) not done — handlebar-mount riders don't need it. Bonus: supabase-js refresh-token cosmetic noise (`Invalid Refresh Token: Refresh Token not found`) silenced via narrow `console.error` filter at `lib/supabase.ts` module load — recovery to anonymous sign-in still fires correctly; only the dev LogBox / Sentry noise is suppressed.
- **City Suggestions (2026-05-23):** Free-text, location-tagged feedback channel from riders to the dev team — distinct from hazards (no expiry, no community voting, no display layer in v1, private to the dev team). FAB lives on `route-planning.tsx` directly under the yellow hazard FAB (same `colors.accent`, glyph `bulb-outline`); the two crosshair modes are mutually exclusive (`toggleHazardMode` / `toggleSuggestionMode` cancel each other; `handleMapTap` and `handleMapLongPress` suppress during either). `RouteMap` unified to `crosshairMode: 'hazard' | 'suggestion' | null` — same `CrosshairOverlay` atom for both; legacy `hazardPlacementMode` boolean kept one release as a deprecated alias. New `CitySuggestionSheet` organism (multiline 500-char input, counter, `Modal`-backed). `useSubmitCitySuggestion` hook always enqueues via the offline queue (mirrors hazard-vote pattern — instant user confirmation, drain handles the wire). Persisted `recentCitySuggestions` slice capped at 5 entries; included in `resetUserScopedState()` AND `partialize`. Database: `public.city_suggestions` (PostGIS `geography(Point,4326)` + lat/lon mirrors, `body` CHECK 1-500, status enum, FK to `auth.users ON DELETE CASCADE`); RLS = `INSERT` for full users only on own row (anonymous rejected at DB layer too), `SELECT` own rows only, no public read, no UPDATE/DELETE policies (admin uses service role). API: `POST /v1/city-suggestions` (requireFullUser, dedicated `citySuggestion` rate-limit bucket 5/hour `RATE_LIMIT_CITY_SUGGESTION_MAX`/`RATE_LIMIT_CITY_SUGGESTION_WINDOW_MS`), plus stub `GET /v1/city-suggestions/nearby` returning `[]` so the future display-surface URL is already stable. Full Fastify request + response JSON Schemas in `services/mobile-api/src/lib/citySuggestionSchemas.ts` per Gotcha #9. Cloud Run revision `defpedal-api-00081-69b`. Migration `202605230002_create_city_suggestions.sql`. Plan doc `docs/plans/city-suggestions.md`. **Dashboard gotcha:** RLS `auth.uid() = user_id` means the Supabase Table Editor (running as `authenticated`) shows zero rows even when service-role sees them — view via SQL Editor or set Table Editor role to `service_role`.
- **Improved Hazard System (2026-04-21):** Upvote/downvote voting, auto-expiry by hazard type, marker clustering, and dedicated rate limiting. Reuses existing `hazard_validations` table — client speaks `'up'`/`'down'`, server maps to `'confirm'`/`'deny'` (no schema rewrite). `POST /v1/hazards/:id/vote` with `requireFullUser` (anonymous rejected 403). `useHazardVote` hook with TanStack optimistic updates + rollback, `userHazardVotes` persisted in Zustand (cleared by `resetUserScopedState`), `hazard_vote` offline-queue type with same-hazard collapse (up→down→up fast-tap = one request). New `HazardDetailSheet` organism (Modal + backdrop + swipe-to-dismiss + reduced-motion) and rewritten `HazardAlert`/`HazardAlertPill` with thumbs-up/down icons + score pill. `HazardLayers.tsx` now clustered: `Mapbox.ShapeSource cluster clusterRadius=50 clusterMaxZoomLevel=14 clusterProperties.max_severity`; four filter-split layers, cluster bubble color = worst-case severity, radius 16/22/28px by count; `point_count_abbreviated` label (no emoji, error #13). Migration `202604210001_hazard_score_index.sql`: generated `score = confirm_count - deny_count`, `hazard_baseline_ttl()` (4h debris/ice, 12h obstacle, 7d pothole, 14d construction), refined `extend_hazard_on_confirm()` trigger with flip-guard (undoes prior vote on UPDATE to prevent double-count) and resurrection-guard (vote >7d past expiry doesn't rewind TTL). Cron `POST /v1/hazards/expire` (Bearer `CRON_SECRET`, Cloud Scheduler `hazards-expire-cron` 0 3 * * * Europe/Bucharest) hard-deletes `score<=-3` after 24h + `expires_at < now()-45d` (widened from 7d on 2026-04-21 via migration `202604210002_hazard_resurrection_grace_45d.sql`, aligned with the trigger's resurrection-guard window). `/v1/hazards/nearby` filters `score > -3` (hide threshold). Dedicated `hazardVote` rate-limit bucket: 5 votes/user/10 min (env `RATE_LIMIT_HAZARD_VOTE_MAX` / `RATE_LIMIT_HAZARD_VOTE_WINDOW_MS`). Post-deploy fix: `RouteMap.displayedHazard` resolves from live `nearbyHazards` via `useMemo` so the detail sheet reflects cache truth after a vote — a `useState` snapshot was rendering pre-vote data. Plan doc `docs/plans/improved-hazard-system.md`, user guide `docs/hazardinfo.md`. Cloud Run revision `defpedal-api-00062-s7m`.
- **~1260 tests across 3 packages** (core: 339, mobile-api: 447, mobile: ~680). Vitest + happy-dom + @testing-library/react

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
- Mia Persona Journey 5-level system + level-up celebrations + invitation prompt + segment banners + journey tracker + detection cron (v0.2.43, 2026-05-10) — see "Mia Persona Journey RETIRED" entry above
- Telemetry queue (`pendingTelemetryEvents`, `enqueueTelemetryEvent`, `AppOpenTelemetryObserver`, `sendTelemetryEvents`) — only consumer was Mia detection scoring, removed alongside it

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
- Standard (safe): `https://osrm.defensivepedal.com/route/v1/bicycle` (Caddy + Let's Encrypt TLS in front of port 5000)
- Flat (avoid hills): `https://osrm-flat.defensivepedal.com/route/v1/bicycle` (Caddy in front of port 5001 — same path; the subdomain alone selects the container)
- Direct IP (debugging only, plaintext): `http://34.116.139.172:5000` and `:5001` — not used by the app, exceptions removed from manifests
- Hosted on GCP project `osrmro1` in `europe-central2-c`
- Custom safety profile using OSM road attributes
- Supports `&exclude=unpaved` parameter

### GitHub
- Repo: `victorwho/defpedal_mobil1`
- CI: GitHub Actions (typecheck only)
- Branch: `main` (all work on main)
