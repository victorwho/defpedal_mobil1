# Implementation Progress

Last updated: 2026-03-17

This file tracks the React Native migration against `mobile_implementation_plan.md`.
Update it at the end of each implementation slice.

## Snapshot

- Overall migration progress: roughly 87-92 percent of product migration, 80-85 percent of production hardening
- Current milestone: physical Android validation now confirms offline continuity end to end, the repo includes both a manual GitHub Actions release workflow and a runnable mobile-API load-test/operations baseline, and the main native rider plus utility screens now all run through the branded web-style redesign
- Primary risk: Android validation is now strong, but iPhone validation, production-scale load testing, deeper rollout automation, and final visual polish parity across every screen are still incomplete
- Current validation blocker: the bridgeless debug client is still failing to consume the staged JS bundle over `10.0.2.2:8081`, so the release / embedded-bundle validator remains the reliable native QA path on this machine
- Stable baseline note: the current mobile-first repo state is now captured in committed Git history on `codex/mobile-current-snapshot`, and the stabilization branch is operating on that real baseline instead of the earlier pre-migration commit
- Stable baseline Phase 1 note: the stabilization worktree now has a green local `npm run validate` path, explicit `validate:web` support for the legacy reference app, and tighter test discovery that no longer scans worktree/helper folders
- Stable baseline Phase 2 note: the default repo workflow now points at `dev:mobile`, `.gitignore` covers the main runtime/staging noise, and repo docs now describe the web app as an opt-in reference surface

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

### Phase 3: Native turn-by-turn navigation

- Status: Partially done
- Evidence:
  - `apps/mobile/app/navigation.tsx`
  - `apps/mobile/src/hooks/useForegroundNavigationLocation.ts`
  - `packages/core/src/navigation.ts`
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
- Missing:
  - production-scale load testing at target concurrency and burst levels
  - iPhone validation
  - deeper release automation and store-secret verification gates
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
- Completed in ride reporting: navigation now keeps the web-style right-rail hazard button, but opens a native hazard-type picker for bike-safety categories such as blocked bike lane, pothole, narrow street, dangerous intersection, aggressive traffic, and other context before queueing the same Supabase-backed `hazards` write
- Completed in schema prep: `supabase_add_hazard_type.sql` now adds a nullable `hazard_type` column plus a value check constraint for the supported mobile hazard categories
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

- Status: Pending
- Checklist:
  - move loose SQL changes into a real migration folder and naming convention
  - add the `hazard_type` change as an applied migration path
  - document staging deployment inputs, Redis-backed testing expectations, and rollback notes
  - verify backend contracts match live schema assumptions
- Exit criteria:
  - schema updates are tracked and re-runnable
  - backend staging path is documented and testable

### Phase 4: Native validation and release readiness

- Status: Pending
- Checklist:
  - keep Android release-style validation as the supported default path for now
  - treat bridgeless debug-client recovery as backlog unless it is proven to block developer velocity
  - run and document one iPhone smoke-validation pass on macOS hardware
  - deepen release workflow guardrails for secrets, environment checks, and rollout sanity
- Exit criteria:
  - Android and iPhone each have one documented smoke-tested path
  - preview release workflow has a documented preflight and rollback path

### Phase 5: Staging and handoff

- Status: Pending
- Checklist:
  - run staging smoke, steady, and burst load tests with Redis enabled
  - capture baseline performance and error results
  - declare the stable-baseline milestone in this tracker
  - list any remaining backlog items that should not block normal feature work
- Exit criteria:
  - stable mobile baseline milestone is explicitly declared
  - remaining work is backlog, not foundation risk
