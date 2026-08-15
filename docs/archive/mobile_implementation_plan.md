# Mobile-First React Native Implementation Plan

## Goal

Migrate Defensive Pedal from a single-package React/Vite PWA to a mobile-first architecture with:

- `apps/mobile`: Expo + React Native client
- `packages/core`: shared business logic and contracts
- `services/mobile-api`: backend-for-frontend for native clients

The custom OSRM safe-routing engine remains the product core. Mapbox is used for native map
rendering, offline packs, and fast-routing/search integrations where appropriate.

## Current implementation status

The repository now includes the first real implementation slice of this plan:

1. Shared `@defensivepedal/core` package
2. Fastify `mobile-api` scaffold
3. Expo mobile app scaffold
4. Existing web app wired to shared core logic through local re-exports

This is a migration foundation, not full feature parity yet.

## Target architecture

### 1. Shared core

Owns the reusable logic that should stay identical across web, mobile, and backend:

- route and maneuver types
- normalized mobile API contracts
- distance math
- maneuver/instruction formatting
- route analysis and terrain-adjusted duration
- navigation session helpers
- polyline encode/decode helpers

### 2. Mobile API

Owns orchestration and shields the mobile client from provider-specific shapes:

- safe routes via custom OSRM
- fast routes via Mapbox Directions
- coverage resolution
- reverse geocoding and autocomplete
- elevation enrichment
- risk enrichment via Supabase/PostGIS
- normalized mobile responses

### 3. Mobile app

Owns native UX and device integrations:

- onboarding
- auth
- route planning
- route preview
- active navigation
- feedback
- offline maps
- settings

## Routing implementation decisions

### Safe routing

- Keep the existing custom OSRM server as the safe-routing source of truth.
- Never expose the safe-routing server directly to the mobile app.
- Call it only from `services/mobile-api`.

### Fast routing

- Keep Mapbox Directions for `fast` mode.
- Normalize it to the same route contract returned by safe routing.

### Navigation

- Do not use a vendor navigation SDK as the route authority.
- The mobile app navigates on top of backend-returned routes using shared core navigation logic.
- Background turn-by-turn support will be implemented with native location tasks, local session
  persistence, and spoken guidance.

## Delivery phases

### Phase 1. Shared core and backend foundation

- expand `packages/core`
- harden `mobile-api` request validation and errors
- add coverage rollout config
- move remaining shared logic out of the web app

### Phase 2. Native route planning and preview

- wire the Expo screens to live API data end-to-end
- add search/autocomplete UX
- render route alternatives and risk segments on the native map
- preserve route summary parity with the web app

### Phase 3. Native navigation

- foreground live navigation
- spoken maneuver guidance
- follow mode, mute, recenter
- reroute flow
- trip lifecycle persistence

### Phase 4. Background and offline

- background location tasks
- offline map region downloads
- queued offline writes
- active-route continuity during connectivity loss

### Phase 5. Production hardening

- observability, metrics, SLOs
- routing regression corpus
- load testing
- staged rollout
- app-store release readiness

## Production-readiness checklist

### Backend

- Cloud Run deployment for `mobile-api`
- managed secrets
- structured logs and traces
- rate limiting and caching
- health checks and autoscaling

### Routing

- route versioning fields on every response
- safe-routing regression test corpus
- explain/debug metadata for internal diagnosis
- regional routing failover strategy

### Mobile

- secure session storage
- background navigation permissions and UX
- crash reporting
- analytics and feature flags
- OTA-safe update policy

## Immediate next tasks after this scaffold

1. Move more web-only route state out of `App.tsx` into `packages/core`.
2. Add strict request/response schemas to `mobile-api`.
3. Wire live preview and reroute flows in the Expo app against the new API.
4. Render risk segments and selected alternatives in the native `RouteMap`.
5. Replace placeholder auth/offline screens with working native services.
