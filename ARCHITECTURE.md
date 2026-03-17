
# Project Architecture & Changelog

This document serves as the source of truth for the application's architecture, state management, and recent changes. Refer to this before making structural modifications.

## 1. High-Level Architecture

### Core Technologies
- **Web Framework**: React 19 (Vite)
- **Mobile Framework**: Expo + React Native scaffold
- **Language**: TypeScript
- **Styling**: Tailwind CSS on web; React Native StyleSheet scaffold on mobile
- **Map**: Leaflet on web; `@rnmapbox/maps` scaffold on mobile
- **Backend**: Supabase (Auth, Database) + Fastify mobile API scaffold

### Key Directories
- **`/components`**: Pure UI components. `MapWrapper.tsx` is the heaviest component, managing the Leaflet instance directly via refs.
- **`/services`**: Stateless modules for external APIs (OSRM, Supabase, Nominatim, Elevation, Offline Maps).
- **`/hooks`**: React hooks for browser APIs (Geolocation, Speech, WakeLock).
- **`/utils`**: Pure functions for math (Haversine), formatting, and route analysis.
- **`/packages/core`**: Shared types, route contracts, polyline helpers, navigation helpers, and route analysis for web/mobile/backend.
- **`/services/mobile-api`**: Fastify backend-for-frontend for mobile routing, coverage, search, risk, and elevation orchestration.
- **`/apps/mobile`**: Expo React Native app scaffold with typed routes, shared-store wiring, and Mapbox preview shell.

## 2. Critical Workflows

### Navigation State (`App.tsx`)
The app operates as a global state machine managed in `App.tsx`:
1.  **IDLE**: Default state. Search visible. Map explores freely.
2.  **ROUTE_PREVIEW**: Route calculated and displayed. "Start Navigation" button visible. Elevation profiles for *all* routes are fetched in parallel here.
3.  **NAVIGATING**: 
    - Wake lock active.
    - Voice guidance enabled.
    - Off-route detection (50m threshold).
    - Map locked to user location (unless manually dragged).
4.  **AWAITING_FEEDBACK**: Post-trip feedback form.

### Map Rendering (`MapWrapper.tsx`)
- **Imperative Handle**: Uses `useImperativeHandle` to expose methods (`recenter`, `getBounds`) to `App.tsx`.
- **Rendering Strategy**: Direct Leaflet API usage inside `useEffect` hooks rather than `react-leaflet` components. This provides better performance for frequent updates (location tracking).
- **Layers**: 
  - `routeLayers`: GeoJSON layers for the path (yellow fill, black outline).
  - `userMarker`: Custom divIcon.
  - `offRouteLine`: Dashed line showing the straight distance to the route.

### Offline Maps Strategy
1.  **Service Worker (`sw.js`)**: Intercepts requests to `tile.openstreetmap.org` and `basemaps.cartocdn.com`.
2.  **Caching**: Uses Cache API (`offline-map-tiles`).
3.  **Download (`services/offlineMaps.ts`)**: 
    - Calculates tile coordinates for the current map view boundaries.
    - Downloads tiles for the current zoom level up to +2 levels deeper.
    - Checks for download size limits (Max 3000 tiles) to prevent browser crashing.
4.  **Normalization**: `sw.js` normalizes subdomains (a, b, c) to 'a' to ensure cache hits regardless of the specific subdomain requested by Leaflet.

### Authentication
- Handled via `services/supabase.ts`.
- `App.tsx` listens to `onAuthStateChange` to update local session state.
- Supports Email/Password and Google OAuth.
- Google OAuth redirects to `window.location.origin`.

## 3. Data Models (`types.ts`)
- **Route**: GeoJSON geometry + Steps + Legs.
- **Step**: Maneuver instructions.
- **Trip**: Stored in Supabase `trips` table (WKT format for PostGIS compatibility).

## 4. Changelog

### [Current Session]
- **Architecture (Monorepo Migration)**: Added npm workspaces and introduced `apps/mobile`, `packages/core`, and `services/mobile-api` as the first mobile-first migration slice.
  - Added shared core exports for route contracts, polyline encoding, navigation helpers, and route-analysis logic.
  - Rewired the existing web app's `types.ts` and `utils/*` modules to use the shared core package.
- **Feature (Mobile API Scaffold)**: Added a Fastify backend-for-frontend for native clients.
  - Implemented coverage, route preview, reroute, autocomplete, and reverse-geocode endpoints.
  - Kept the custom OSRM service as the safe-routing source and Mapbox Directions as the fast-routing source.
  - Added backend elevation enrichment and Supabase-backed risk-segment enrichment scaffolding.
- **Feature (React Native Scaffold)**: Added an Expo React Native app shell for the native migration.
  - Implemented typed routes for onboarding, auth, route planning, route preview, navigation, feedback, offline maps, and settings.
  - Added a shared Zustand app store and a Mapbox-backed route preview component that consumes the normalized backend contract.
- **Architecture**: Created `ARCHITECTURE.md` to track system state.
- **Feature (Auth)**: Added Google OAuth support.
  - Modified `services/supabase.ts` to include `signInWithGoogle`.
  - Updated `components/Auth.tsx` with Google button.
  - Updated `components/Icons.tsx` with `GoogleIcon`.
- **Bugfix (Map)**: Fixed `mapWrapperRef.current?.getBounds is not a function` error.
  - Exposed `getBounds` in `MapWrapper.tsx` inside `useImperativeHandle`.
- **Bugfix (Offline)**: Restored `services/offlineMaps.ts` and updated `sw.js` caching logic to correctly handle tile subdomains.
- **Feature (Routing)**: Modified `App.tsx` to calculate elevation profiles (Total Climb) for *all* alternative routes, not just the primary one.
  - Changed `elevationProfile` state to `elevationProfiles` (array).
  - Implemented parallel fetching of elevation data for all routes in `fetchRoute`.
  - Updated selection logic to dynamically display analysis for the clicked route.
- **Bugfix (Elevation)**: Fixed `Cannot set property fetch` error by removing the `importmap` script from `index.html` which conflicted with local dependencies.
- **Bugfix (Elevation)**: Mitigated Open-Elevation API timeouts by reducing `MAX_POINTS_PER_REQUEST` to 50, increasing `REQUEST_TIMEOUT_MS` to 30s, and increasing `INITIAL_BACKOFF_MS` to 2000ms.
- **Feature (Elevation)**: Added Open-Meteo as a fallback elevation data provider in `services/elevation.ts` to improve reliability when Open-Elevation fails. Updated `sw.js` to exclude `open-meteo` from caching.
- **Feature (Risk Data)**: Created `supabase_risk_function.sql` containing a PostGIS function `get_segmented_risk_route` to intersect OSRM routes with the `road_risk_data` table and return a color-coded GeoJSON FeatureCollection.
- **Bugfix (Risk Data)**: Fixed "set-returning functions are not allowed in WHERE" error in `supabase_risk_function.sql` by moving `ST_Dump` out of the `WHERE` clause into a separate CTE.
- **Bugfix (Risk Data)**: Fixed "permission denied for table road_risk_data" error by granting SELECT permissions and creating an RLS policy in Supabase.
- **Bugfix (Risk Data)**: Fixed "canceling statement due to statement timeout" error in `get_segmented_risk_route` by replacing expensive `ST_Buffer(geom::geography)` with `ST_Buffer(geom, 0.00015)` and `ST_Union` with `ST_UnaryUnion(ST_Collect())` for a massive performance boost.
- **Feature (Risk Data Rendering)**: Updated `MapWrapper.tsx` to render the segmented risk routes (if available) with colors corresponding to the risk score (blue for no data, very safe <33, safe 33-43.5, average 43.5-51.8, elevated 51.8-57.6, risky 57.6-69, very risky 69-101.8, extreme >101.8) instead of the default solid yellow route.
- **Feature (Risk Legend)**: Added `RiskLegend.tsx` component to display the color coding legend during route preview.
- **Feature (Elevation Fallback)**: Implemented Mapbox Terrain-RGB raster tile decoding as a highly reliable fallback for elevation data when Open-Elevation and Open-Meteo APIs fail. Added `VITE_MAPBOX_ACCESS_TOKEN` to `.env.example`.

## 5. Future Development Rules
0.  **Changelog Maintenance (AI INSTRUCTION)**: You MUST ALWAYS record any architectural changes, bug fixes, or new features in the Changelog section (Section 4) of this document (`ARCHITECTURE.md`) before completing a task.
1.  **MapWrapper Access**: Always check `useImperativeHandle` definition in `MapWrapper` when adding new map controls that `App.tsx` needs to trigger (like accessing bounds or markers).
2.  **Supabase**: When adding tables, ensure Row Level Security (RLS) policies are considered on the backend (though not enforced in frontend code).
3.  **Routing**: `osrm.ts` handles the custom backend. Do not change the base URL unless the server changes.
4.  **Dependencies**: Keep external dependencies minimal. Use `fetch` for APIs.
