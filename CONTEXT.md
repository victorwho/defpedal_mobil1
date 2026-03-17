# Repository Context

Last updated: 2026-03-16

This repository contains two parallel products:

- the original React/Vite web app used as the reference implementation
- the in-progress Expo/React Native mobile app plus its mobile backend

The current direction is mobile-first, with the React Native app preserving the custom safe-routing backend as the core product differentiator.

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

- Safe routing: custom OSRM backend
- Fast routing: Mapbox Directions
- Client map rendering: native Mapbox maps
- Mobile client talks only to `services/mobile-api`, not directly to OSRM/Mapbox/Supabase RPC routing paths

### Web app

- Framework: React + Vite
- Mapping: Leaflet
- Styling paradigm: utility-class / Tailwind-like class strings in JSX
- Status: still present as reference and comparison surface during migration

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
- Hazard reports use the same Supabase `hazards` table path as the web app
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
- release automation still needs deeper rollout/secret guardrails
- final UI polish parity is still incomplete across all screens
- Android bridgeless debug-client workflow is still unreliable; release-style validation is the dependable path
- some navigation edge-case polish remains around spoken guidance and recovery behavior

### Recently active / needs attention

- `hazard_type` support is now implemented in app/backend contracts, but the live Supabase database needs the migration in `supabase_add_hazard_type.sql` applied
- the current phone-friendly preview flow depends on:
  - local `mobile-api` running on the laptop
  - active ngrok tunnel
  - rebuilding the preview app when the tunnel URL changes

### Known boundaries

- The repo still includes the legacy web app and shared migration code side by side
- Some SQL files in repo root are not organized as a standard migration system
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
  components/               legacy web UI components
  hooks/                    legacy web hooks
  utils/                    legacy web utility logic
  App.tsx                   legacy web app shell
  progress.md               migration progress tracker
  mobile_implementation_plan.md
  native_android_validation.md
  physical_android_validation.md
  mobile_release_runbook.md
  mobile_api_operations_runbook.md
  supabase_add_hazard_type.sql
```

## Working Agreement Notes

- `progress.md` is the current implementation tracker
- the mobile app is the primary product direction
- the web app should be treated as reference behavior, not the default place for new product work
- for any new session, this file should be read first before making architecture or implementation decisions
