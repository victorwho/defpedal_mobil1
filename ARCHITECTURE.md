# Project Architecture

Last updated: 2026-03-29

## 1. High-Level Architecture

Defensive Pedal is a **mobile-only** cycling safety app. The legacy React/Vite web app has been fully removed.

### Core Technologies
- **Mobile Framework**: Expo SDK 52 + React Native (new architecture)
- **Language**: TypeScript
- **Map**: `@rnmapbox/maps` with Mapbox Standard style ("Shield Mode" basemap)
- **State**: Zustand with AsyncStorage persistence
- **Data Fetching**: TanStack Query (React Query)
- **Backend**: Fastify mobile API (Node.js)
- **Database**: Supabase (PostgreSQL + PostGIS + Auth)
- **Routing**: Custom OSRM (safe mode) + Mapbox Directions (fast mode)
- **Deployment**: Google Cloud Run (europe-central2) for API, EAS Build for mobile

### Monorepo Structure
```
├── apps/mobile/              # Expo React Native app
│   ├── app/                  # Expo Router screens
│   ├── src/
│   │   ├── components/       # RouteMap, MapStageScreen, Screen, BrandLogo
│   │   ├── design-system/    # Atoms, molecules, organisms, tokens
│   │   ├── hooks/            # useRouteGuard, useCurrentLocation, useBicycleParking, useBicycleRental, useNearbyHazards, useWeather, useFeed
│   │   ├── lib/              # api, mapbox-routing, mapbox-search, bicycle-parking, bicycle-rental, weather, elevation, offlineQueue, navigation-helpers
│   │   ├── providers/        # AuthSession, AppProviders, NavigationLifecycle, OfflineMutationSync
│   │   └── store/            # appStore (Zustand)
│   └── android/              # Native Android project (prebuild)
├── packages/core/            # Shared types, contracts, navigation helpers, risk distribution
├── services/mobile-api/      # Fastify BFF
│   ├── src/routes/           # v1.ts (REST endpoints), feed.ts (community)
│   └── src/lib/              # risk, elevation, auth, cache, submissions, feedSchemas
└── supabase/migrations/      # Ordered SQL migrations
```

## 2. App Screens (Expo Router)

| Screen | File | Purpose |
|--------|------|---------|
| Route Planning | `app/route-planning.tsx` | Home screen — map, search, weather widget, hazard reporting |
| Route Preview | `app/route-preview.tsx` | Route visualization, risk distribution, elevation chart |
| Navigation | `app/navigation.tsx` | Turn-by-turn with 3D follow camera, hazard alerts |
| Feedback | `app/feedback.tsx` | Post-trip rating + thank-you card |
| History | `app/history.tsx` | Hub for trip history |
| Trips | `app/trips.tsx` | Scrollable trip feed with expandable map replay |
| Community | `app/community.tsx` | Community hub |
| Community Feed | `app/community-feed.tsx` | Location-based shared trips |
| Community Trip | `app/community-trip.tsx` | Individual shared trip detail |
| Profile | `app/profile.tsx` | Bike type, cycling frequency, routing prefs, privacy |
| Auth | `app/auth.tsx` | Email/password + Google OAuth sign-in |
| Settings | `app/settings.tsx` | App settings |
| Offline Maps | `app/offline-maps.tsx` | Download map packs |
| Diagnostics | `app/diagnostics.tsx` | Debug info, queue state, API health |

## 3. State Machine

App state managed in Zustand (`appStore.ts`):

```
IDLE → ROUTE_PREVIEW → NAVIGATING → AWAITING_FEEDBACK → IDLE
```

Each screen uses `useRouteGuard` to validate it matches the expected state. The guard locks once passed to prevent Zustand persist hydration race conditions.

### Persisted State
- `appState`, `routeRequest`, `routePreview`, `selectedRouteId`
- `navigationSession` (with GPS breadcrumbs)
- `voiceGuidanceEnabled`, `shareTripsPublicly`, `bikeType`, `cyclingFrequency`, `avoidUnpaved`
- `queuedMutations` (offline-first write queue)
- `offlineRegions`, `tripServerIds`, `activeTripClientId`

## 4. Map Architecture

### Basemap: Shield Mode
- Mapbox Standard style with `StyleImport` configuration
- Auto day/dawn/dusk/night lighting (refreshes every 30 min)
- Safety-semantic road colors: red motorways, brown trunks, sandy cyclable roads
- Hidden: POI labels, transit labels, 3D buildings
- Visible: road labels, place labels, greenspace

### Layers (RouteMap.tsx)
1. **Route alternatives** — LineLayer for unselected (gray) + selected (accent) routes
2. **Risk segments** — LineLayer with dynamic color from risk score
3. **Bicycle parking** — Blue circles with "P" label (Overpass API, zoom 12+)
4. **Bicycle rental** — Dark green circles with "R" label (Overpass API, zoom 12+)
5. **Hazard markers** — Orange circles with "!" label
6. **Route markers** — Origin (green), destination (blue), user (blue with stroke)
7. **Trail/planned route** — For trip replay (blue trail, green/red planned)
8. **Off-route connector** — Dashed line

### Camera Modes
- **Route planning/preview**: Flat top-down, zoom 12.5, centers on destination or user GPS
- **Navigation (following)**: 3D tilted (pitch 45°), zoom 16, follows user with course heading
- **Navigation (free)**: Flat overview, user can pan/zoom

## 5. Data Sources

| Data | Source | Cache |
|------|--------|-------|
| Routes (safe) | Custom OSRM backend | TanStack Query |
| Routes (fast) | Mapbox Directions API | TanStack Query |
| Risk segments | Supabase RPC `get_segmented_risk_route` | per-request |
| Elevation profile | Mobile API `/v1/elevation-profile` | per-route |
| Autocomplete | Mapbox Search Box API v1 | debounced |
| Bicycle parking | Overpass API (OSM) | 5 min stale |
| Bicycle rental | Overpass API (OSM) | 5 min stale |
| Weather + AQI | Open-Meteo (no key) | 15 min stale |
| Hazards | Supabase `hazards` table | 30 sec refresh |
| Trip history | Supabase `trip_tracks` table | on-demand |
| Community feed | Mobile API `/v1/feed/*` | TanStack Query |

## 6. Offline-First Write Queue

Mutations (trips, hazards, feedback, shares) are queued locally in Zustand and flushed by `OfflineMutationSyncManager`:

```
enqueueMutation() → queuedMutations[] → flush loop (15s interval) → mobile API → Supabase
```

Queue types: `trip_start`, `trip_end`, `trip_track`, `trip_share`, `hazard`, `feedback`

Trip mutations resolve `clientTripId` → `tripId` via `tripServerIds` mapping.

## 7. Mobile API Endpoints

### Routes (`/v1`)
- `POST /v1/routes/preview` — Route alternatives with risk enrichment
- `POST /v1/routes/reroute` — Mid-navigation reroute
- `POST /v1/risk-segments` — Risk data for a polyline
- `POST /v1/elevation-profile` — Elevation array for a polyline
- `POST /v1/search/autocomplete` — Mapbox search proxy
- `POST /v1/search/reverse-geocode` — Reverse geocoding
- `GET /v1/coverage` — Safe routing coverage check
- `POST /v1/trips/start` — Start trip (authenticated)
- `POST /v1/trips/end` — End trip (authenticated)
- `POST /v1/trips/track` — Save GPS trail + planned route (authenticated)
- `GET /v1/trips/history` — User's trip history (authenticated)
- `POST /v1/feedback` — Navigation feedback (authenticated)
- `POST /v1/hazards` — Report hazard (authenticated)
- `GET /v1/hazards/nearby` — Hazards within bbox
- `POST /v1/hazards/:id/validate` — Confirm/deny hazard

### Community Feed (`/v1`)
- `GET /v1/feed` — Location-based feed
- `POST /v1/feed/share` — Share trip
- `POST /v1/feed/:id/like` — Like/unlike
- `GET /v1/feed/:id/comments` — Get comments
- `POST /v1/feed/:id/comments` — Post comment
- `GET /v1/profile` — User profile
- `PUT /v1/profile` — Update profile

## 8. Database Tables (Supabase)

| Table | Purpose |
|-------|---------|
| `trips` | Trip start/end records |
| `trip_tracks` | GPS breadcrumbs, planned route polyline, routing mode, end reason |
| `hazards` | User-reported hazards with location, type, confirm/deny/pass counts |
| `hazard_validations` | Per-user hazard votes (unique per hazard+user) |
| `navigation_feedback` | Post-trip safety ratings and comments |
| `road_risk_data` | Pre-computed road segment risk scores (PostGIS) |
| `trip_shares` | Community feed shared trips |
| `trip_likes` | Feed item likes |
| `trip_comments` | Feed item comments |
| `user_profiles` | Display name, avatar, bio |

## 9. Profile Preferences

| Setting | Effect |
|---------|--------|
| Bike type | Auto-sets "Avoid unpaved" for road/city/recumbent bikes |
| Cycling frequency | User profile data |
| Avoid unpaved roads | Appends `&exclude=unpaved` to OSRM requests |
| Share trips publicly | Auto-shares completed trips to community feed |
| Voice guidance | On/off for spoken turn-by-turn instructions |

## 10. Build & Deploy

### Dev (USB tethered)
```bash
adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8080 tcp:8080
cd services/mobile-api && npm run dev    # API on :8080
cd apps/mobile && npx expo start --clear  # Metro on :8081
```

### Release APK (untethered)
Build from `C:\dpb` short path (Windows 260-char CMake workaround):
```bash
robocopy <repo> C:\dpb /E /XD .git .claude android
cd C:\dpb && npm install --legacy-peer-deps
cd apps/mobile && npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

### Cloud Run API
```bash
gcloud builds submit --tag europe-central2-docker.pkg.dev/<project>/defpedal-api/mobile-api:latest
gcloud run deploy defpedal-api --image <image> --region europe-central2 --allow-unauthenticated
```

## 11. Development Rules

1. **Immutability**: Always create new objects, never mutate existing ones
2. **Small files**: 200-400 lines typical, 800 max
3. **Error handling**: Handle errors at every level, fail fast with clear messages
4. **Input validation**: Validate at system boundaries
5. **No hardcoded secrets**: Use environment variables
6. **Changelog**: Update `progress.md` with every feature/fix
