# Codebase Review Report

**Generated:** 2026-04-08
**Scope:** Full review — all 8 categories

---

## Summary Scorecard

| Category | Score | P0 | P1 | P2 | P3 |
|----------|-------|----|----|----|----|
| Security | 4/10 | 3 | 5 | 6 | 4 |
| Errors & Crashes | 7/10 | 0 | 6 | 5 | 2 |
| Data Integrity | 7/10 | 0 | 3 | 4 | 2 |
| Performance | 7/10 | 0 | 4 | 5 | 2 |
| API Contracts | 6/10 | 0 | 7 | 4 | 3 |
| UX & Accessibility | 5/10 | 2 | 4 | 4 | 4 |
| Infrastructure | 5/10 | 0 | 2 | 4 | 4 |
| Code Quality | 7/10 | 0 | 2 | 5 | 3 |
| **Overall** | **6/10** | **5** | **33** | **37** | **24** |

---

## P0 Findings (Fix Immediately)

### P0-1 — Live production secrets in `.env` files on disk
**Category:** Security
**Files:** `apps/mobile/.env`, `services/mobile-api/.env`
Both `.env` files contain real production credentials (Mapbox secret key `sk.eyJ1...`, Supabase service role key). `.gitignore` excludes them from git, but if the machine is compromised, these grant full DB access (service role bypasses RLS) and map billing exploitation.
**Fix:** Rotate both keys immediately. Use GCP Secret Manager for Cloud Run env vars.

### P0-2 — Dev auth bypass enabled with trivially guessable token
**Category:** Security
**File:** `services/mobile-api/.env:11-13`, `services/mobile-api/src/config.ts:70`
`DEV_AUTH_BYPASS_ENABLED=true` with `DEV_AUTH_BYPASS_TOKEN=dev-bypass`. If this `.env` is accidentally deployed, any attacker sending `Authorization: Bearer dev-bypass` bypasses all authentication.
**Fix:** Add a startup guard: refuse to boot if `devAuthBypass.enabled === true && NODE_ENV === 'production'`. Use a long random token even in dev.

### P0-3 — Broadcast notification endpoint gated only on bypass flag
**Category:** Security
**File:** `services/mobile-api/src/routes/v1.ts:1021-1078`
`/notifications/send` can send arbitrary push notifications to **all users**. Only protected by `config.devAuthBypass.enabled`. If bypass is on (P0-2), this becomes a full broadcast attack surface.
**Fix:** Remove from public API. Admin notification sends should go through a separate admin API behind a VPN.

### P0-4 — No font scaling support — app breaks at large font sizes
**Category:** UX & Accessibility
**Path:** Entire mobile codebase
Zero uses of `maxFontSizeMultiplier`, `fontScale`, or `PixelRatio.getFontScale()`. Fixed `fontSize` values with no layout accommodation. ~15% of Android users use large/largest font scale — text overflows containers, overlaps, and breaks layouts (NavigationHUD, badges, stats).
**Fix:** Set `maxFontSizeMultiplier={1.3}` on critical layout Text elements. Test with `adb shell settings put system font_scale 1.5`.

### P0-5 — Map markers completely inaccessible to screen readers
**Category:** UX & Accessibility
**File:** `apps/mobile/src/components/map/RouteMap.tsx`
Only 17 accessibility attributes total across all map components. Route lines, risk segments, parking/rental/shop markers, POI markers, origin/destination markers — all have zero screen reader support. TalkBack users cannot interact with the map at all.
**Fix:** Add `accessibilityLabel` to ShapeSource/SymbolLayer where supported, or provide an off-map accessible summary.

---

## P1 Findings (Fix Before Release)

### Security (5)

| ID | Finding | File | Fix |
|----|---------|------|-----|
| P1-S1 | `CORS_ORIGIN=*` in production | `config.ts:40`, `.env:3` | Set to exact Cloud Run URL |
| P1-S2 | Overly permissive RLS — `trips`, `hazards`, `feedback` allow public read/insert with `using (true)` | `supabase/migrations/202603010001_base_schema.sql:63-149` | Restrict SELECT to `user_id = auth.uid()` |
| P1-S3 | Dev bypass token baked into mobile app bundle via `app.config.ts` extra | `apps/mobile/app.config.ts:233-248` | Strip `devAuthBypass*` fields when `appVariant !== 'development'` |
| P1-S4 | `/trips/history` has no Fastify schema — potential data leakage | `v1.ts:567-585` | Add response schema with `additionalProperties: false` |
| P1-S5 | `/hazards/nearby` no schema, full-table scan, no radius limit | `v1.ts:633-696` | Add PostGIS spatial filter, schema, clamp radius to 5000m |

### Errors & Crashes (6)

| ID | Finding | File | Fix |
|----|---------|------|-----|
| P1-E1 | `fetchRiskMap` bypasses timeout/error handling — can hang indefinitely | `api.ts:421-430` | Route through `requestJson` or add AbortController |
| P1-E2 | Navigation `speak` callback has stale `navigationSession` closure | `navigation.tsx:354-369` | Read `navigationSession` via `useAppStore.getState()` inside callback |
| P1-E3 | `AuthSessionProvider` double-subscribe race condition | `AuthSessionProvider.tsx:71-76` | Consolidate into a single auth subscription |
| P1-E4 | `queueTripEnd` not in useEffect deps — stale closure can enqueue wrong data | `navigation.tsx:500-567` | Wrap `queueTripEnd` in `useCallback` and add to deps |
| P1-E5 | `OfflineMutationSyncManager` re-registers interval on every queue change, resets 15s clock | `OfflineMutationSyncManager.tsx:185-324` | Use a stable `useRef` for the interval, don't re-register on queue changes |
| P1-E6 | `reorderWaypoints` mutates array with `.splice()` — violates immutability rule | `appStore.ts:373-385` | Use immutable `slice`-based reorder |

### Data Integrity (3)

| ID | Finding | File | Fix |
|----|---------|------|-----|
| P1-D1 | `locale` missing from Zustand `partialize` — language resets on every cold start | `appStore.ts:739-773` | Add `locale` to persist whitelist |
| P1-D2 | `finishNavigation` unconditionally sets `AWAITING_FEEDBACK` even with null session | `appStore.ts:489-495` | Guard: only transition if `navigationSession` is non-null |
| P1-D3 | Queue eviction second pass can drop `trip_start` with `queued`/`failed` status | `appStore.ts:598-609` | Add `TRIP_CRITICAL_TYPES` guard to second pass filter |

### Performance (4)

| ID | Finding | File | Fix |
|----|---------|------|-----|
| P1-P1 | Inline Mapbox style on risk overlay — reallocated every GPS update | `RouteMap.tsx:248-267` | Hoist to module-level constant |
| P1-P2 | `FeedCard` and `TripCard` not wrapped in `React.memo` — scroll jank in list screens | `FeedCard.tsx:56`, `TripCard.tsx:62` | Wrap both in `React.memo`, memoize `buildSyntheticRoute` |
| P1-P3 | Inline `onUserPress` arrow function in `renderItem` defeats memoization | `community-feed.tsx:104` | Extract to stable `useCallback` |
| P1-P4 | `navigation.tsx` uses 21 individual Zustand selectors instead of `useShallow` | `navigation.tsx:74-93` | Batch with `useShallow` — this is the most latency-sensitive screen |

### API Contracts (7)

| ID | Finding | File | Fix |
|----|---------|------|-----|
| P1-A1 | Two divergent error schemas (`feedSchemas.ts` vs `http.ts`) — missing `NOT_FOUND`/`CONFLICT` codes | `feedSchemas.ts:10-17`, `http.ts:360` | Unify to single shared schema |
| P1-A2 | `UserBadge.isNew` stripped by `additionalProperties: false` — "new badge" shimmer never triggers | `v1.ts:2376-2385` | Add `isNew: { type: 'boolean' }` to schema |
| P1-A3 | `POST /feed/share` returns 200 instead of 201 for resource creation | `feed.ts:208-273` | Return 201 |
| P1-A4 | `POST /rides/:tripId/impact` returns `code: 'BAD_REQUEST'` for a 409 CONFLICT | `v1.ts:1576-1580` | Change to `code: 'CONFLICT'` |
| P1-A5 | Push-token and notification endpoints return `{ error }` without `code` field | `v1.ts:961,979,1005` | Use `HttpError` with proper code |
| P1-A6 | `aqiAtStart` schema uses `integer` but contracts.ts defines `number | null` | `v1.ts:519` | Change to `type: ['number', 'null']` |
| P1-A7 | `bikeType` in body schema but never forwarded to `saveTripTrack` — silently discarded | `v1.ts:484-565` | Forward to dependency or remove from schema |

### UX & Accessibility (4)

| ID | Finding | File | Fix |
|----|---------|------|-----|
| P1-U1 | Trips screen error state has no retry button | `trips.tsx:130-133` | Add retry button calling `refetch()` |
| P1-U2 | Achievements screen has no error handling at all | `achievements.tsx:279-283` | Destructure `error`, show message + retry |
| P1-U3 | `textMuted` (#8B9198) on dark bg fails WCAG AA (4.0:1 ratio) | `colors.ts:27-28` | Lighten to at least `#A0A8B4` |
| P1-U4 | Light theme accent `#CA8A04` on white fails WCAG AA (3.5:1) | `colors.ts:83-84` | Darken to `#A16207` |

### Infrastructure (2)

| ID | Finding | File | Fix |
|----|---------|------|-----|
| P1-I1 | No `SIGTERM` handler — in-flight requests dropped on Cloud Run scale-down | `server.ts` (18 lines) | Add `process.on('SIGTERM', () => app.close())` |
| P1-I2 | `/health` returns `{ ok: true }` without checking DB | `app.ts:73-78` | Add a lightweight Supabase probe, return 503 on failure |

### Code Quality (2)

| ID | Finding | File | Fix |
|----|---------|------|-----|
| P1-Q1 | `route-planning.tsx` (1,408 lines), `navigation.tsx` (1,081 lines) — 176% over 800-line limit | Both files | Extract `useRoutePlanningLogic.ts`, `useHazardReporting.ts`, `WaypointEditor.tsx` |
| P1-Q2 | `appStore.ts` (776 lines) — 8 distinct concerns in one file | `appStore.ts` | Extract `offlineMutationsSlice`, `navigationSlice`, `userPreferencesSlice` |

---

## P2 Findings (37 total, grouped by category)

### Security (6)
- No security headers / `@fastify/helmet` on API responses
- Pino logger has no field redaction — auth tokens logged in plaintext
- `avatarUrl` accepts arbitrary URLs — potential SSRF/content injection
- No rate limit on broadcast notification endpoint
- Memory-backed rate limiter — limits are per-instance, not global (no Redis)
- Comment text echoed into push notification without content sanitization

### Errors & Crashes (5)
- `feedback.tsx` `enhance` effect silently catches all errors including state-after-unmount
- `queueDeveloperValidationWrites` enqueues feedback without trip server-ID dependency
- `bikeType` in trip track schema but never forwarded to handler logic
- Double timeout in `requestWithFetch` — timer leak on every successful request
- `console.warn` in `AuthSessionProvider.tsx:119` — prod code

### Data Integrity (4)
- `appState: 'NAVIGATING'` can be persisted/rehydrated with null `navigationSession`
- `tripServerIds` map grows unboundedly — never pruned
- `Date.now()` fallback for mutation IDs has millisecond collision risk
- Dead mutations get no user notification — trip data silently lost

### Performance (5)
- `useBicycleRental` has hardcoded 1500ms sleep for Overpass rate limiting
- `FlatList` in trips/community-feed missing `windowSize`, `maxToRenderPerBatch`, `getItemLayout`
- `buildSyntheticRoute` called on every render without `useMemo`
- `hazardZoneFeatureCollection` uses O(n*m) linear scan
- `fetchRiskMap` bypasses standardized transport — no auth, no timeout, no fallback

### API Contracts (4)
- Feed pagination cursor has no format validation
- `GET /saved-routes` has no response schema
- `DELETE /saved-routes/:id` and `PATCH /saved-routes/:id/use` have no schema
- `aqiAtStart` type mismatch (integer vs number)

### UX & Accessibility (4)
- App locked to portrait — no landscape support for handlebar-mounted phones
- Save route button tap target ~34dp (below 44dp minimum)
- Badge cards have no accessible labels
- Route preview loading has no skeleton/progress indication

### Infrastructure (4)
- Single-stage Dockerfile — dev deps in production image, larger attack surface, slower cold starts
- `cloudbuild.yaml` only pushes image — deploy step is manual (caused past incidents)
- In-memory rate limiter wiped on every cold start
- No structured monitoring or alerting (no Sentry, no latency SLO, no OSRM health check)

### Code Quality (5)
- Three Overpass lib files duplicate `computeBbox`, `OverpassElement`, `OverpassResponse`, fetch boilerplate
- `reorderWaypoints` uses `.splice()` — violates immutability conventions
- `console.log` calls in `index.tsx` and `_layout.tsx` (guarded by `__DEV__` but still present)
- `TimeBankWidget.tsx` is dead code from removed feature
- Guardian Tier i18n keys exist in both locale files but are unreferenced

---

## P3 Findings (24 total)

### Security (4)
- No auth on geocode/reverse-geocode endpoints (unauthenticated Mapbox quota consumption)
- Single-stage Dockerfile (also infra concern)
- Container runs as root (no `USER node`)
- No CI security scanning (npm audit, Snyk, Dependabot)

### Errors & Crashes (2)
- `navigation.tsx` hazard detection effect captures `activeHazardAlert` correctly but ref mutation inside state-setting effect is fragile
- `community-feed.tsx` `renderItem` dep array includes stable `router` import

### Data Integrity (2)
- `showHistoryOverlay` correctly excluded from persist (confirmed OK)
- `rerouteEligible` field in `resetNavigationSession` may not have a default

### Performance (2)
- `useComments` missing `staleTime` — refetches on every mount
- `useBicycleParking` doesn't guard against `origin.lat === 0` (fires Overpass query for Gulf of Guinea)

### API Contracts (3)
- `GET /v1/users/:id/profile` has no 200 response schema
- Mobile API client has no auth token refresh logic (401 until restart)
- `POST /v1/routes/reroute` has no auth requirement (consistent with preview, low risk)

### UX & Accessibility (4)
- `IconButton` `sm` size is 36x36 — below 44dp minimum
- `Button` `sm` variant height is 36dp
- No reduced motion support for page transitions
- No empty state message when no nearby hazards

### Infrastructure (4)
- Database migrations have no rollback strategy (PITR covers this)
- CI trigger doesn't cover fork PRs
- `cloudbuild.yaml` uses `:latest` tag with no immutable SHA tag
- Supabase backup strategy undocumented

### Code Quality (3)
- `RouteLayers` props typed as `any` instead of `GeoJSON.FeatureCollection`
- One TODO without a ticket reference (`navigation.tsx:287`)
- `router` in `useCallback` dep array is harmless but misleading

---

## Positive Observations

1. **Offline queue architecture** — The mutation queue with retry, dead letter, and trip-start dependency ordering is well-designed for a mobile-first app
2. **Error log discipline** — `.claude/error-log.md` is maintained with 23 documented pitfalls, preventing repeated mistakes
3. **Design system maturity** — Consistent atom/molecule/organism structure with `createThemedStyles` factory, dark/light/system themes, and `FadeSlideIn` with `useReducedMotion`
4. **Mapbox performance patterns** — Most layers correctly use hoisted style constants, emissive strength for day/night immunity, and filter-based hiding
5. **Contracts-first types** — `packages/core/src/contracts.ts` is comprehensive and shared across all packages
6. **Test coverage progress** — 949 tests across 3 packages (core: 277, API: 205, mobile: 467) is solid for a single-developer project
7. **Shield Mode basemap** — Auto day/night lighting with safety-semantic road colors shows deep product thinking
8. **Bundle health check** — `npm run check:bundle` workflow prevents the #1 issue (blank screens) before it reaches the phone
