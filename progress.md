# Implementation Progress

Last updated: 2026-03-23

This file tracks the mobile app implementation progress against `mobile_implementation_plan.md`.
Update it at the end of each implementation slice.

## Snapshot

- Overall progress: roughly 87-92 percent of product migration, 80-85 percent of production hardening
- Current milestone: physical Android validation confirms offline continuity end to end, the repo includes both a manual GitHub Actions release workflow and a runnable mobile-API load-test/operations baseline, and the main native rider plus utility screens now all run through the branded design system
- Primary risk: iPhone validation, Redis-backed staging load testing, deeper rollout automation, and final visual polish parity across every screen are still incomplete
- Current validation blocker: the bridgeless debug client is still failing to consume the staged JS bundle over `10.0.2.2:8081`, so the release / embedded-bundle validator remains the reliable native QA path on this machine
- Webapp cleanup (2026-03-22): all legacy React/Vite/Leaflet webapp code has been removed from the repo root — components/, hooks/, utils/, App.tsx, web-index.tsx, index.html, vite.config.ts, sw.js, manifest.json, and webapp dependencies (leaflet, react-dom, vite, vitest, jsdom, testing-library). Root SQL files moved to supabase/migrations/legacy/. Root tsconfig.json cleaned of DOM libs. The repo is now mobile-only.
- Preview tunnel note: preview mobile development can now auto-sync the active ngrok URL into `apps/mobile/.env.preview` through `npm run sync:mobile:preview-url` and `npm run dev:mobile:preview`

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
  - `apps/mobile/src/lib/elevation.ts` — client-side elevation sampling via Mapbox Tilequery
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
- Completed in bottom sheet UX (2026-03-24): CollapsibleSheet footer (Start Navigation + Back to Planning buttons) now stays visible even when sheet is collapsed; only the scrollable content (route summary, risk card, elevation chart) hides when user drags down. Route planning destination selection now centers map on selected location and dismisses keyboard via `Keyboard.dismiss()`
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
