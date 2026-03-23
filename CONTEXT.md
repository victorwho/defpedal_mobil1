# Repository Context

Last updated: 2026-03-23

This repository contains the Defensive Pedal mobile app and its supporting backend.

The product direction is mobile-only, built on Expo/React Native with a custom safe-routing backend as the core differentiator. The legacy React/Vite webapp has been removed.

## Current Stabilization Note

- the current mobile-first repo state is now captured in committed Git history on `codex/mobile-current-snapshot`
- the default developer path targets `mobile app + mobile API + mobile-first validate`
- release preflight guardrails live in `.github/workflows/mobile-release.yml` plus `scripts/check-mobile-release.mjs`
- Android release-style validation remains the default supported native QA path on this Windows machine, while the first in-repo iPhone smoke pass is still pending in `iphone_validation.md`
- the repo now has a stable feature-development baseline for ongoing frontend and feature work, with remaining iPhone and staging/Redis items tracked as release-hardening backlog
- the current local route-core backend load baseline is recorded in `mobile_api_load_test_baseline.md`
- preview mobile development can now auto-sync the active ngrok tunnel into `apps/mobile/.env.preview` through `scripts/sync-mobile-preview-url.mjs` and `npm run dev:mobile:preview`

## Tech Stack

### Mobile app

- Framework: Expo + React Native 0.83
- Routing: Expo Router file-based routing in `apps/mobile/app`
- State management: Zustand with persisted app state
- Data fetching: TanStack Query
- Maps: `@rnmapbox/maps`
- Device APIs:
  - `expo-location`
  - `expo-task-manager`
  - `expo-keep-awake`
  - `expo-speech`
  - `expo-secure-store`
  - `expo-sqlite`
- Auth: Supabase
- Observability: Sentry + PostHog wiring is present
- Styling paradigm: React Native `StyleSheet` + shared theme tokens in `apps/mobile/src/lib/theme.ts`

### Shared logic

- Shared package: `packages/core`
- Purpose:
  - API contracts
  - navigation state/session helpers
  - route analysis
  - reroute helpers
  - shared types and formatting logic

### Mobile backend

- Framework: Fastify
- Build/dev tooling:
  - `tsx watch` for development
  - `esbuild` for bundling
- Integrations:
  - custom OSRM safe-routing backend
  - Mapbox Directions/search
  - Supabase
  - optional Redis for cache/rate-limit backing

### Routing stack

- Safe routing: custom OSRM backend (called directly from mobile client)
- Fast routing: Mapbox Directions API (called directly from mobile client)
- Elevation data: Mapbox Tilequery API for client-side elevation sampling and total climb calculation
- Client map rendering: native Mapbox maps
- Route fetching is now client-side in `apps/mobile/src/lib/mapbox-routing.ts`, bypassing `services/mobile-api` for route requests
- Mobile client still uses `services/mobile-api` for persisted writes (trips, hazards, feedback)

## Current State

### Stable and working

- Expo Router mobile shell is in place and actively used
- Native Android app is running and validated through release-style preview builds
- Core rider flow is implemented:
  - route planning
  - address / POI autocomplete
  - route preview
  - safe / fast routing mode selection
  - live navigation
  - reroute flow
- Native map rendering is implemented with route overlays and rider tracking
- Voice guidance exists and can be toggled in planning and navigation
- Hazard reporting exists during navigation
- Hazard type picker exists during navigation with bike-safety categories
- Hazard reports use the Supabase `hazards` table
- Offline support exists:
  - offline packs
  - queued offline writes
  - sync recovery
- Auth flow is wired through Supabase plus local dev-bypass helpers
- Diagnostics and validation surfaces exist for Android testing
- Physical Android validation has already covered:
  - background location permission
  - locked-screen/background movement detection
  - queued write drain after reconnect
  - offline map continuity
- Preview builds can run disconnected from USB when pointed at the current ngrok-exposed API

### Operationally in place

- CI exists
- EAS build profiles exist
- manual release workflow exists
- load-test harness exists
- API caching and rate limiting exist
- Redis-ready shared store support exists in the mobile API

## Work In Progress

### Still incomplete or pending

- iPhone validation is still pending
- production-scale staging load tests are still pending
- release automation guardrails are stronger now, but first iPhone smoke evidence is still missing
- final UI polish parity is still incomplete across all screens
- Android bridgeless debug-client workflow is still unreliable; release-style validation is the dependable path
- some navigation edge-case polish remains around spoken guidance and recovery behavior

### Recently active / needs attention

- navigation screen layout polish (2026-03-22): RouteMap fullBleed now uses absoluteFillObject so the map covers the entire screen; ManeuverCard overlays at the top; all four floating control rail buttons (recenter, voice, hazard, end ride) now share a consistent gray[800] dark circle at 44×44px
- legacy webapp removal (2026-03-22): deleted root-level components/, hooks/, utils/, webapp service files, App.tsx, web-index.tsx, index.html, vite.config.ts, sw.js, manifest.json; moved root SQL files to supabase/migrations/legacy/; removed web deps from package.json and DOM libs from tsconfig.json
- route guard hydration fix (2026-03-23): useRouteGuard now locks once it passes, preventing Zustand persist hydration from revoking the guard and bouncing the user back to route planning after 1-3 seconds
- feedback submission fix (2026-03-23): mobile-api `.env` was missing `SUPABASE_ANON_KEY`, causing `supabaseAuthClient` to be null and all authenticated requests from the dev build to return 401; added the key so feedback and trip mutations now reach Supabase
- feedback thank you card (2026-03-23): after submitting feedback, the card swaps to a thank-you screen with 🙏 emoji, gratitude message, and a yellow (#FDD700) "Done" button before returning to route planning
- entry point cleanup (2026-03-23): deleted unused root `index.js`; simplified `metro.config.js` by removing the legacy webapp blocklist since those files no longer exist
- risk distribution card (2026-03-23): route preview screen shows a per-category risk breakdown (Very safe / Safe / Average / Elevated / Risky / Very risky / Extreme) as a colored stacked bar with percentage legend. Risk segments are fetched from the new `/v1/risk-segments` server endpoint which calls the Supabase `get_segmented_risk_route` RPC. The card appears in the bottom sheet scrollable area above the fixed Start navigation button. Removed from navigation screen — only visible in route preview.
- elevation chart (2026-03-23): route preview screen shows an SVG area chart of the elevation profile along the route, visible by scrolling below the risk card. Elevation data is fetched from the new `/v1/elevation-profile` server endpoint which calls the existing `getElevationProfile()` (Mapbox Terrain-RGB with Open-Meteo fallback). The `RouteOption` contract now includes an optional `elevationProfile: number[]` field.
- Supabase permissions fix (2026-03-23): `road_risk_data` table was missing `SELECT` grant for `service_role`; applied `GRANT SELECT ON road_risk_data TO service_role` so the risk segment RPC now works
- mobile-api service role key fix (2026-03-23): replaced placeholder `SUPABASE_SERVICE_ROLE_KEY` with the real JWT service role key so Supabase admin operations (risk segments, feedback inserts) work correctly
- `hazard_type` support is now implemented in app/backend contracts, but the live Supabase database still needs the ordered migration in `supabase/migrations/202603170002_add_hazard_type.sql` applied
- the current phone-friendly preview flow depends on:
  - local `mobile-api` running on the laptop
  - active ngrok tunnel
  - keeping the preview env file in sync through the ngrok helper script when the tunnel URL changes

### Known boundaries

- historical SQL files are preserved in `supabase/migrations/legacy/` for reference
- `supabase/migrations/` is the active ordered migration path
- Visual mobile UI is mid-parity, not fully finalized

## Directory Map

```text
defpedal_mobil1/
  apps/
    mobile/
      app/                  Expo Router screens
      src/components/       mobile UI components
      src/hooks/            device and app hooks
      src/lib/              API, env, storage, telemetry, offline helpers
      src/providers/        app-wide providers and lifecycle managers
      src/store/            Zustand store
      android/              generated native Android project
      plugins/              Expo config plugins
  packages/
    core/                   shared routing, navigation, contracts, types
  services/
    mobile-api/             Fastify backend-for-frontend for mobile
  supabase/
    migrations/             ordered database migrations
    migrations/legacy/      historical SQL files from webapp era
  progress.md               implementation progress tracker
  mobile_implementation_plan.md
  native_android_validation.md
  physical_android_validation.md
  iphone_validation.md
  mobile_release_runbook.md
  mobile_api_load_test_baseline.md
  mobile_api_operations_runbook.md
```

## Working Agreement Notes

- `progress.md` is the current implementation tracker
- the mobile app is the sole product direction
- for any new session, this file should be read first before making architecture or implementation decisions
- the current branch-level hardening work should also follow `mobile_stable_baseline_plan.md`
