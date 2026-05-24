# Error-Reduction Implementation Plan

**Status:** Draft · started 2026-05-24
**Owner:** Victor
**Source:** Sentry pull (2026-05-24, **revised**) — 5 unresolved issues, all carrying `environment=development` due to a build-script bug (now fixed), but the `app_variant` tag reveals the real distribution: most events are from **real production users on v0.2.38** running the Play Store internal-testing AAB. Phase 0 audit table below has the correct breakdown.

The plan ships in five phases. Phase 0 is the prerequisite — until prod/preview crash data is reaching Sentry, every other phase is being prioritized by a partial signal.

---

## Audit findings (revised)

Initial pull treated `environment` as the source of truth. That was wrong — `environment` is downstream of a build-script bug that's been mis-tagging events for months. The trustworthy field is the `app_variant` tag, which `enableSentry`'s `beforeSend` injects on every event (`telemetry.ts:79-83`) directly from `mobileEnv.appVariant`. Audit re-pulled and grouped by `app_variant`:

### Unresolved issues by `app_variant` (last 14 days)

Tag values present: **`production` (20 events / 7 users / 3 issues)**, **`preview` (2 events / 1 user / 1 issue — our smoke test from today)**, **empty (2 events / 2 issues — the two fatals)**. Zero `app_variant=development` events.

| Bucket | Short ID | Title | Level | Events | Users | Last seen |
|---|---|---|---|---:|---:|---|
| **production** | MOBILE-5 | TypeError: Network request failed | error | 12 | 1 | 2026-05-12 |
| **production** | MOBILE-7 | Offline sync trip_start/end/hazard timed out 10s | error | 7 | 6 | **2026-05-22** |
| **production** | MOBILE-6 | Error: Network request failed | error | 1 | 1 | 2026-05-15 |
| **preview** | MOBILE-A | release-smoke (our diagnostics ping) | info | 2 | 1 | 2026-05-24 |
| **(empty)** | MOBILE-8 | Background ANR (`MainApplication.onCreate`) | **fatal** | 1 | 1 | 2026-05-10 |
| **(empty)** | MOBILE-9 | ClassCastException: ReadableNativeArray → Double | **fatal** | 1 | 1 | 2026-05-15 |

### Build / config audit

| Area | State | Implication |
|---|---|---|
| `Sentry.init` call site | `telemetry.ts` — `enableSentry()` invoked from `TelemetryProvider` only when `analyticsConsent.sentry === true` | **Consent-gated.** Real production users have opted in (events exist), but coverage is partial. Splitting essential crash reporting from optional analytics consent remains a worthwhile decision (Phase 0.1). |
| Consent default | `analyticsConsent: { sentry: false, posthog: false, capturedAt: null }` | Fresh installs send zero events until opt-in. |
| **`EXPO_PUBLIC_APP_ENV` build bug** | **FIXED 2026-05-24.** `scripts/build-preview.sh` step 1b previously flipped `APP_VARIANT` but left `EXPO_PUBLIC_APP_ENV=development` hardcoded. Every preview/production APK shipped events tagged `environment=development`. Step 1b now flips both; `app.config.ts:97-98` fallback also realigned (`preview→preview`, not `staging`). | Going forward, `environment` is trustworthy. Historical v0.2.38 production data remains mis-tagged until those users update. |
| DSN / sample rate / source-map upload | Wired correctly through `mobileEnv` + `@sentry/react-native/expo` plugin; production fail-fasts on missing `SENTRY_AUTH_TOKEN` | Solid. |
| `release` / `dist` in `Sentry.init()` | Not explicitly set | Acceptable — `@sentry/react-native@8` auto-detects from native, matches what `sentry-cli` uploads at build time. |
| `beforeSend` filter | Drops `AppExitInfo`-mechanism ANRs in `sentryEnvironment === 'development'` | Was previously dropping preview ANRs too (env-bug side effect). Now correctly preview-preserving. |
| **Fatals have empty `app_variant`** | MOBILE-8 (cold-start ANR) and MOBILE-9 (native bridge cast) both fired before `Sentry.init` ran, so neither `initialScope.tags` nor `beforeSend` applied | New gap — fatals are the most important events and they're tagless. Phase 3f: ensure native init order tags pre-JS crashes. |

### Implications

1. **Real production signal exists.** The original framing ("no events from prod") was wrong; events were there but hidden under `environment=development`.
2. **MOBILE-7 is the top priority and is now confirmed real** — 6 production users in 14 days, last seen 2 days ago. Phase 1 holds.
3. **Phase 0.1 (consent split decision)** still matters — opted-in users are a slice of total production. We don't know the rate without PostHog or a server-side proxy.
4. **Fatals need init-order work** — added as Phase 3f.

---

## Phase 0 — Close the observability gap (1–2 days, then 7-day measurement window)

**Goal:** prod + preview crash data routinely lands in Sentry, with correct release/env tags, at a non-trivial fraction of installs.

### 0.1 Surface the consent funnel (research, not code)
- Pull `analyticsConsent.sentry === true` rate from PostHog (it has its own consent slice but the same screen captures both, so a proxy for opt-in rate is fine).
- Decide with legal / yourself: **should crash reporting be opt-out instead of opt-in?** Most jurisdictions treat error reporting as a legitimate-interest processing activity (essential to deliver the service safely), distinct from analytics. The compliance plan already separates the two clients — the consent UI may need to follow.
- If split: default `sentry: true`, keep `posthog: false`; rewrite onboarding consent + privacy-analytics screens; update Privacy Policy.
- Document the decision in `docs/legal/`.

### 0.2 Make the smoke path testable end-to-end (code, ships today)
- Add `sendSmokeEvent()` to `apps/mobile/src/lib/telemetry.ts`. Guards on `isSentryEnabled()`. Captures `Sentry.captureMessage('release-smoke', 'info')` with extras (`appVariant`, `appEnv`, `version`, `versionCode`).
- Add a "Sentry smoke test" `DiagnosticCard` to `apps/mobile/app/diagnostics.tsx` (gated on `appVariant !== 'production'`). Shows DSN configured / consent state / last result; button fires `sendSmokeEvent`.
- Bundle check + typecheck.

### 0.3 Verify source-map upload on next EAS preview build
- After kicking a preview build (`npm run build:preview:install`), inspect EAS build logs for the `sentry-cli sourcemaps upload` step.
- Smoke-fire the diagnostics button on the resulting APK. Confirm the event appears in Sentry tagged `release=com.defensivepedal.mobile.preview@<version>+<code>`, `environment=preview` (or `staging`), with a **demangled** stack frame in the breadcrumb.

### 0.4 Enable Release Health alert
- Sentry → Releases → enable Sessions / Crash-Free Users.
- Alert rule: notify Slack/email if **crash-free users < 99.5% over 1h on `environment=production`**.

### Exit criteria for Phase 0
- Decision recorded on consent split (0.1).
- Smoke event lands in correct release/env bucket within 60s on a preview build (0.2 + 0.3).
- Crash-free alert is configured (0.4).
- After 7 days of measurement, the volume of production events is **non-zero** (success looks like ≥ 10 sessions/day; if still zero, consent split is mandatory).

---

## Phase 1 — Fix MOBILE-7 (offline sync timeout, 8 users) — 1 day

**Files:**
- `apps/mobile/src/providers/OfflineMutationSyncManager.tsx`
- `apps/mobile/src/lib/offlineQueue.ts`

**Tasks:**
1. Raise per-request timeout: `10s → 25s` for `trip_start` / `trip_end` / `trip_track`; keep 10s for `hazard_vote` / `feedback`.
2. Exponential backoff with jitter: `2s → 5s → 12s → 30s`, cap 4 retries per mutation per drain cycle. Skip retry if `ConnectivityMonitor.isOnline === false`.
3. Distinguish error classes in the queue: `'timeout'` / `'network'` / `'http_5xx'` / `'http_4xx'`. Only `4xx` (validation) permanently drops.
4. Surface a recoverable toast when max-retried: *"Couldn't sync 1 ride — will retry when connection improves"*. **Never** silently drop trip data.
5. Sentry breadcrumbs on every drain attempt (mutation type, attempt #, outcome).
6. Tests in `OfflineMutationSyncManager.test.tsx`: timeout retry path, jitter spread, 4xx-drops-immediately, offline-skip-no-retry.

**Verification:**
- Manual: throttle phone to 2G via dev menu, complete a ride, confirm `trip_end` survives + eventually syncs.
- Sentry: MOBILE-7 stops accruing events on preview within 7 days.

---

## Phase 2 — MOBILE-9 native bridge ClassCastException — **DONE 2026-05-24**

**Root cause:** `apps/mobile/src/components/map/overlays/PoiCard.tsx` `usePoiCardHandler` called `mapRef.getPointInView([coords[0], coords[1]])` after only checking that `coords` was an array of length ≥ 2 — never the GeoJSON geometry **type**. Mapbox vector tile source layers (`mapbox-streets-v8`) mix Point / LineString / Polygon features; tapping a non-Point passed `[[lng,lat]]` as element 0 across the RN bridge, where Kotlin `ReadableNativeArray.getDouble(0)` threw fatally on the UI thread — bypassing the JS `try/catch`.

**Fix shipped:**
- New pure helper `apps/mobile/src/components/map/extractPointCoordinate.ts` — strict GeoJSON `Point` extraction with full finite-number validation.
- `PoiCard.tsx` now uses the helper instead of raw `feature.geometry?.coordinates`. Non-Point features simply skip the bridge call (the POI card never renders for them anyway).
- 27 unit tests in `extractPointCoordinate.test.ts` covering all 7 GeoJSON geometry types, malformed inputs, and non-finite numbers.
- `.claude/error-log.md` entry #47 documents the bridge-cast trap pattern for any future native bridge call that takes a coordinate array.

**Outcome:** MOBILE-9 will auto-resolve in Sentry on the next release with v0.2.63+ in the field. Older v0.2.38 production installs will continue hitting it until they update.

---

## Phase 3 — Defense layers — 3–4 days, ship incrementally

### 3a. Per-route ErrorBoundary — **DONE 2026-05-24**
- `ErrorBoundary` extended with optional `boundary?: string` prop; passed to `telemetry.captureError` as a `boundary` tag (defaults to `'global'` when absent so the app-root usage stays bucketable).
- New `withErrorBoundary(name, Component)` HOC exported from the same file so screen wrappers are one-liners.
- Wrapped: `navigation.tsx` → `boundary:navigation`, `route-preview.tsx` → `boundary:route-preview`, `community-feed.tsx` → `boundary:community-feed`, `trips.tsx` → `boundary:trips`. A crash in any of these now keeps the rest of the app alive and surfaces the recovery UI inside the route.

### 3b. Unified API client
- **File:** `apps/mobile/src/lib/api.ts`
- Single `apiFetch(url, opts)` wrapper: timeout, 2× retry on 5xx/network, typed error envelope `{ kind: 'timeout' | 'network' | 'http', status?, body? }`.
- Collapse the two "Network request failed" paths (MOBILE-5/6) into one throw site.
- Tests: timeout, retry, 4xx-no-retry, 5xx-retry.

### 3c. Boundary validation — **DONE 2026-05-24**
- New `apps/mobile/src/lib/schemas/responseValidation.ts` helper: lenient `safeParse` → log mismatches to Sentry tagged `feature: api_response_validation` + endpoint, capped at 5 issues per event. Always passes input through unchanged so a server shape drift cannot break the user's screen.
- Top-level envelope schemas in `apps/mobile/src/lib/schemas/apiResponses.ts` for `/v1/feed`, `/v1/v2/feed`, `/v1/leaderboard`, `/v1/tiers`. Inner `items` arrays carry `z.unknown()` — schema is for observability of envelope drift (missing/renamed top-level field, wrong primitive type), not deep field-by-field enforcement. `.passthrough()` so the server can add new fields without breaking validation.
- `/v1/routes/preview` substituted with `/v1/v2/feed` because mobile fetches routes client-side (Mapbox/OSRM direct), bypassing the server endpoint.
- 22 unit tests in `responseValidation.test.ts` covering happy + sad paths, telemetry capture shape, issue capping, and per-endpoint envelope validation (happy + breaking-shape variants).

### 3d. Native-module guard audit — **DONE 2026-05-24**
- Audit clean — no new bugs. Every `NativeModules.Expo*` reference in the codebase is in a comment warning AGAINST that pattern; actual Expo module presence is gated through `hasExpoNativeModule` / `hasNotificationsNativeModule` consistently.
- Community modules (NetInfo, Google Sign-In, ViewShot, PlayInstallReferrer) all use the `NativeModules.<BridgeName>` boolean check before `require()` per error-log #45.
- **Follow-up observation (not Phase 3):** `apps/mobile/src/i18n/index.ts:25` reads `NativeModules.I18nManager?.localeIdentifier` to detect device locale. RN core's `I18nManager` may not be reachable through `NativeModules` on the bridgeless New Architecture; if so, Romanian users on preview/production builds would silently fall back to English. Worth verifying on a real preview build — graceful degradation (no crash), but a real bug.

### 3e. ANR prevention pass
- Review `MainApplication.onCreate` (Java side) — anything synchronous and heavy → background thread or lazy init.
- Move first-paint-blocking JS work in `_layout.tsx` to `InteractionManager.runAfterInteractions`.

### 3f. Tag pre-JS fatals
- Both unresolved fatals (MOBILE-8 ANR, MOBILE-9 native bridge cast) have empty `app_variant` because they fired before `Sentry.init` ran in JS. Native crashes / cold-start ANRs are the most important events we capture, and they're currently untriagable.
- Options: (a) run `Sentry.init` from native (Java) at app launch with `app_variant` resolved from `BuildConfig.FLAVOR` so initial tags exist before JS even loads; (b) accept the gap and add a synthetic `app_variant_from_release` tag downstream in Sentry via an alert/processing rule that parses the release string.
- Pick (a) if it's a small native diff; (b) if not.

---

## Phase 4 — Pre-release process — 0.5 day + ongoing

1. **Release smoke checklist** in `apkreleases/release-notes-template.txt`: cold-launch / plan route / start nav / end ride / view trips / community / sign in–out. 5 minutes per release.
2. **CI gate** (GitHub Actions, additive to typecheck): `npm test --workspaces`, `npm audit --audit-level=high`.
3. **Pre-rollout check:** require crash-free users ≥ 99.5% on the previous rollout step for 24h before promoting. Document in `CLAUDE.md` under Play Store Release.
4. Keep the existing 5% → 20% → 50% → 100% staged rollout. Don't compress.

---

## Sequencing

| Phase | Effort | Blocks next? |
|---|---:|---|
| 0 — Observability | 1–2 days + 7-day measurement | **Yes** |
| 1 — Offline sync | 1 day | No |
| 2 — Native bridge | 0.5 day | No |
| 3 — Defense layers | 3–4 days | No (parallelize) |
| 4 — Pre-release process | 0.5 day | No (continuous) |

Total: ~6–8 working days of engineering, plus a 7-day measurement window after Phase 0 ships.

---

## Explicitly NOT doing

- MOBILE-5 / MOBILE-6: production, but single user, mostly network failures. Phase 3b (unified API client) collapses them indirectly.
- MOBILE-8 ANR / MOBILE-9 native cast: low volume today, but they're the canary for Phase 3f (fatal tagging) — if either spikes, escalate first.
- Splitting consent without a legal review (Phase 0.1 frames the question; doesn't pre-decide).
