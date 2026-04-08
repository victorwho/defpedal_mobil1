# Action Plan — Codebase Review Fixes

**Created:** 2026-04-08
**Based on:** `review-report-2026-04-08.md`
**Order:** Data/Stability first, Performance, UX, API, Infrastructure, Code Quality, Security last

---

## Phase 1: Data Integrity & Stability Fixes

Priority: These bugs silently lose user data or cause incorrect behavior.

### 1.1 Add `locale` to Zustand persist whitelist
**Finding:** P1-D1
**File:** `apps/mobile/src/store/appStore.ts:739-773`
**What:** Add `locale` to the `partialize` return object so the user's language choice survives cold starts.
**Risk:** Low — additive change.

### 1.2 Fix queue eviction second pass — protect `trip_start`
**Finding:** P1-D3
**File:** `apps/mobile/src/store/appStore.ts:598-609`
**What:** Add `if (TRIP_CRITICAL_TYPES.has(item.type)) return true;` to the second-pass filter before `secondPassDropped++`. Without this, a `trip_start` with `queued`/`failed` status can be evicted, orphaning dependent `trip_end` and `trip_track` mutations.
**Risk:** Low — adds a guard condition.

### 1.3 Guard `finishNavigation` state transition
**Finding:** P1-D2
**File:** `apps/mobile/src/store/appStore.ts:489-495`
**What:** Only set `appState: 'AWAITING_FEEDBACK'` if `state.navigationSession` is non-null. If null, set `appState: 'IDLE'` instead.
**Risk:** Low — prevents invalid state.

### 1.4 Fix `queueTripEnd` stale closure in navigation
**Finding:** P1-E4
**File:** `apps/mobile/app/navigation.tsx:500-567`
**What:** Wrap `queueTripEnd` in `useCallback` with proper deps (`activeTripClientId`, `hasQueuedTripEnd`, `navigationSession`, `selectedRoute`). Add it to the `useEffect` dependency array.
**Risk:** Medium — changing effect deps can alter timing. Test end-ride flow.

### 1.5 Fix `OfflineMutationSyncManager` interval re-registration
**Finding:** P1-E5
**File:** `apps/mobile/src/providers/OfflineMutationSyncManager.tsx:185-324`
**What:** Store the interval handle in a `useRef`. Set it up once on mount. Use a separate `useRef` for the latest `queuedMutations`/`tripServerIds` values so the flush function reads current values without re-registering the interval.
**Risk:** Medium — core sync logic. Test offline queue drain with multiple mutations.

### 1.6 Consolidate `AuthSessionProvider` double-subscribe
**Finding:** P1-E3
**File:** `apps/mobile/src/providers/AuthSessionProvider.tsx:71-76`
**What:** Remove one of the two auth subscriptions. Keep `supabaseClient.auth.onAuthStateChange` (the official API) and remove the custom `subscribeToAuthSessionChanges` wrapper, or vice versa.
**Risk:** Medium — auth flow is critical. Test sign-in, sign-out, token refresh, and cold-start OAuth callback.

### 1.7 Fix `reorderWaypoints` immutability violation
**Finding:** P1-E6
**File:** `apps/mobile/src/store/appStore.ts:373-385`
**What:** Replace `.splice()` with immutable `slice`-based reorder:
```typescript
const item = current[fromIndex];
const without = [...current.slice(0, fromIndex), ...current.slice(fromIndex + 1)];
const reordered = [...without.slice(0, toIndex), item, ...without.slice(toIndex)];
```
**Risk:** Low — behavioral equivalent.

### 1.8 Fix navigation `speak` stale closure
**Finding:** P1-E2
**File:** `apps/mobile/app/navigation.tsx:354-369`
**What:** Inside the `speak` callback, read `navigationSession` via `useAppStore.getState().navigationSession` instead of the captured closure value. The `isMuted` check already uses the closure (which is fine for the dep array), but the null-check at the top should use fresh state.
**Risk:** Low — read-only change inside callback.

### 1.9 Route `fetchRiskMap` through standardized transport
**Finding:** P1-E1
**File:** `apps/mobile/src/lib/api.ts:421-430`
**What:** Replace raw `fetch()` with `requestJson` (or at minimum add `AbortController` with `REQUEST_TIMEOUT_MS`). Handle errors properly instead of silently returning empty FeatureCollection.
**Risk:** Low — the onboarding safety-score screen will now show errors instead of silently failing.

---

## Phase 2: Performance Fixes

Priority: These affect real-time navigation and scroll smoothness.

### 2.1 Hoist inline Mapbox risk overlay style
**Finding:** P1-P1
**File:** `apps/mobile/src/components/map/RouteMap.tsx:248-267`
**What:** Move the `riskOverlay` style object to a module-level `const RISK_OVERLAY_STYLE = { ... } as const`. One-line fix on the highest-frequency render path (GPS updates during navigation).
**Risk:** None.

### 2.2 Wrap `FeedCard` and `TripCard` in `React.memo`
**Finding:** P1-P2
**Files:** `apps/mobile/src/components/FeedCard.tsx:56`, `apps/mobile/src/design-system/organisms/TripCard.tsx:62`
**What:**
- Wrap both exports: `export const FeedCard = React.memo(...)` / `export const TripCard = React.memo(...)`
- In `FeedCard`: wrap `buildSyntheticRoute(item)` in `useMemo`
- In `TripCard`: wrap `calculateTrailDistanceMeters` calls in `useMemo`
**Risk:** Low — ensure props use stable references (next item helps).

### 2.3 Extract inline `onUserPress` to stable `useCallback`
**Finding:** P1-P3
**File:** `apps/mobile/app/community-feed.tsx:104`
**What:**
```typescript
const handleUserPress = useCallback(
  (userId: string) => router.push(`/user-profile?id=${userId}`),
  [],
);
```
Then pass `onUserPress={handleUserPress}` in renderItem.
**Risk:** None.

### 2.4 Apply `useShallow` to navigation.tsx Zustand selectors
**Finding:** P1-P4
**File:** `apps/mobile/app/navigation.tsx:74-93`
**What:** Replace 21 individual `useAppStore(s => s.field)` calls with a single `useAppStore(useShallow(s => ({ ... })))`. This is the most latency-sensitive screen — GPS updates fire every second.
**Risk:** Low — behavioral equivalent, reduces re-render count.

### 2.5 Optimize FlatList configs
**Finding:** P2
**Files:** `apps/mobile/app/trips.tsx:142`, `apps/mobile/app/community-feed.tsx:160`
**What:** Add `windowSize={5}`, `maxToRenderPerBatch={3}`, `removeClippedSubviews={true}` to both FlatLists. Both render items with embedded Mapbox canvases — reducing the render window from 21 (default) to 5 prevents instantiating dozens of map instances.
**Risk:** Low — may affect scroll-to-bottom behavior. Test with 50+ items.

### 2.6 Remove hardcoded 1500ms sleep in `useBicycleRental`
**Finding:** P2
**File:** `apps/mobile/src/hooks/useBicycleRental.ts:34`
**What:** Remove the `await new Promise((r) => setTimeout(r, 1500))`. Instead, stagger Overpass queries by setting different `staleTime` or using TanStack Query's `enabled` flag with a small delay via state.
**Risk:** Low — may need to re-test Overpass rate limiting.

---

## Phase 3: UX & Accessibility Fixes

Priority: Affects real users, especially those with accessibility needs.

### 3.1 Fix WCAG color contrast failures
**Finding:** P1-U3, P1-U4
**File:** `apps/mobile/src/design-system/tokens/colors.ts`
**What:**
- Dark theme: change `textMuted` from `#8B9198` to `#A0A8B4` (5:1 ratio)
- Light theme: change `accent` from `#CA8A04` to `#A16207` (5.5:1 ratio)
**Risk:** Low — visual change. Review all screens for aesthetic impact.

### 3.2 Add error state + retry to trips screen
**Finding:** P1-U1
**File:** `apps/mobile/app/trips.tsx:130-133`
**What:** Destructure `error` and `refetch` from the query hook. Show error message with a "Try Again" button (match `community-feed.tsx` pattern).
**Risk:** None.

### 3.3 Add error state + retry to achievements screen
**Finding:** P1-U2
**File:** `apps/mobile/app/achievements.tsx:279-283`
**What:** Destructure `error` from `useBadges()`. Show error message with retry button when error is truthy.
**Risk:** None.

### 3.4 Add `maxFontSizeMultiplier` to critical Text elements
**Finding:** P0-4
**Files:** NavigationHUD, ScreenHeader, Badge components, stat cards
**What:** Add `maxFontSizeMultiplier={1.3}` to Text components in layout-critical areas. This allows some scaling while preventing overflow. Test with `adb shell settings put system font_scale 1.5`.
**Risk:** Medium — needs visual testing across all screens.

### 3.5 Add accessible labels to map and badge components
**Finding:** P0-5, P2
**Files:** `RouteMap.tsx`, `achievements.tsx`
**What:**
- Add `accessibilityLabel` to ShapeSource components where supported
- Add accessible summary below/beside the map for screen reader users
- Pass `accessibilityLabel` to BadgeCard components
**Risk:** Low — additive.

### 3.6 Increase small tap targets
**Finding:** P2
**Files:** `route-preview.tsx:740-754`, `IconButton.tsx:41`, `Button.tsx:54`
**What:**
- Add `minHeight: 44` to save route button style
- Increase `IconButton` `sm` from 36 to 44 (or add `hitSlop={8}`)
- Increase `Button` `sm` height from 36 to 44 (or add `hitSlop`)
**Risk:** Low — layout shifts possible. Visual review needed.

---

## Phase 4: API Contract Fixes

Priority: Silent data stripping and inconsistent responses.

### 4.1 Add `isNew` to badge response schema
**Finding:** P1-A2
**File:** `services/mobile-api/src/routes/v1.ts:2376-2385`
**What:** Add `isNew: { type: 'boolean' }` to the earned badge schema properties. This fixes the "new badge" shimmer in Trophy Case that currently never triggers because Fastify strips the field.
**Risk:** None.

### 4.2 Unify error response schemas
**Finding:** P1-A1
**Files:** `services/mobile-api/src/lib/feedSchemas.ts:10-17`, `services/mobile-api/src/lib/http.ts:360`
**What:**
- Add `NOT_FOUND` and `CONFLICT` to the `http.ts` error code enum
- Replace the loose `feedSchemas.ts` errorResponseSchema with an import from `http.ts`
- Add `additionalProperties: false` and `required: ['error', 'code']`
**Risk:** Low — may surface previously-hidden validation errors in feed routes.

### 4.3 Fix status codes and error codes
**Finding:** P1-A3, P1-A4, P1-A5
**Files:** `feed.ts:208-273`, `v1.ts:1576-1580`, `v1.ts:961,979,1005`
**What:**
- `POST /feed/share`: return 201 instead of 200
- `POST /rides/:tripId/impact` conflict: change `code: 'BAD_REQUEST'` to `code: 'CONFLICT'`
- Push-token/notification endpoints: include `code` field in error responses
**Risk:** Low — mobile client should handle 201 as success already.

### 4.4 Fix `aqiAtStart` schema type
**Finding:** P1-A6
**File:** `services/mobile-api/src/routes/v1.ts:519`
**What:** Change `type: ['integer', 'null']` to `type: ['number', 'null']` to match contracts.ts `number | null`.
**Risk:** None.

### 4.5 Forward or remove `bikeType` from trip track
**Finding:** P1-A7
**File:** `services/mobile-api/src/routes/v1.ts:484-565`
**What:** Either destructure `bikeType` from `request.body` and pass to `dependencies.saveTripTrack`, or remove it from the body schema if it's not needed.
**Risk:** Low — decide whether to store bike type per trip track.

### 4.6 Add missing response schemas to remaining endpoints
**Finding:** P1-S4, P1-S5, P2
**Files:** `v1.ts:567-585` (trips/history), `v1.ts:633-696` (hazards/nearby), `v1.ts:2221-2338` (saved-routes)
**What:** Add response schemas with `additionalProperties: false` to:
- `GET /trips/history`
- `GET /hazards/nearby`
- `GET /saved-routes`
- `DELETE /saved-routes/:id`
- `PATCH /saved-routes/:id/use`
**Risk:** Medium — if handlers return fields not in the schema, they'll be stripped. Verify handler output matches.

---

## Phase 5: Infrastructure Fixes

### 5.1 Add SIGTERM handler
**Finding:** P1-I1
**File:** `services/mobile-api/src/server.ts`
**What:**
```typescript
process.on('SIGTERM', async () => {
  await app.close();
  process.exit(0);
});
```
**Risk:** None.

### 5.2 Make `/health` check DB connectivity
**Finding:** P1-I2
**File:** `services/mobile-api/src/app.ts:73-78`
**What:** Add a lightweight Supabase probe in the health handler:
```typescript
const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
if (error) return reply.status(503).send({ ok: false, error: 'db_unreachable' });
```
**Risk:** Low — adds ~50ms latency to health checks. Cloud Run probes every 10s by default.

### 5.3 Multi-stage Dockerfile
**Finding:** P2
**File:** `services/mobile-api/Dockerfile`
**What:** Add a second stage:
```dockerfile
FROM node:22-alpine AS production
WORKDIR /app
COPY --from=base /app/dist ./dist
COPY --from=base /app/package*.json ./
RUN npm ci --omit=dev
USER node
CMD ["node", "dist/server.js"]
```
**Risk:** Low — test that `dist/` has all required files.

### 5.4 Auto-deploy in `cloudbuild.yaml`
**Finding:** P2
**File:** `cloudbuild.yaml`
**What:** Add a second build step:
```yaml
- name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
  args: ['gcloud', 'run', 'deploy', 'defpedal-api',
         '--image', 'europe-central2-docker.pkg.dev/gen-lang-client-0895796477/defpedal-api/mobile-api:latest',
         '--region', 'europe-central2', '--platform', 'managed', '--allow-unauthenticated']
```
**Risk:** Medium — means every `gcloud builds submit` auto-deploys. Consider adding a staging step.

### 5.5 Add immutable image tags
**Finding:** P3
**File:** `cloudbuild.yaml`
**What:** Tag with both `:latest` and `:$SHORT_SHA` for rollback capability.
**Risk:** None.

---

## Phase 6: Code Quality Fixes

### 6.1 Extract shared Overpass client
**Finding:** P2
**Files:** `apps/mobile/src/lib/bicycle-parking.ts`, `bicycle-rental.ts`, `bicycle-shops.ts`
**What:** Create `apps/mobile/src/lib/overpass-client.ts` with shared `OVERPASS_API_URL`, `BBOX_PADDING_DEG`, `computeBbox`, `OverpassElement`, `OverpassResponse`, and a generic `fetchOverpass<T>(query, bbox)` function. Refactor the three files to use it.
**Risk:** Low — extract-and-delegate refactor.

### 6.2 Remove dead code
**Finding:** P2
**Files:** `apps/mobile/src/design-system/molecules/TimeBankWidget.tsx`, locale files
**What:**
- Delete `TimeBankWidget.tsx`
- Remove Guardian Tier i18n keys from `en.ts` and `ro.ts`
**Risk:** None — verify no remaining imports with `grep`.

### 6.3 Split god screens (deferred — largest refactor)
**Finding:** P1-Q1, P1-Q2
**Files:** `route-planning.tsx` (1,408 lines), `navigation.tsx` (1,081 lines), `appStore.ts` (776 lines)
**What:**
- `route-planning.tsx` → extract `useRoutePlanningLogic.ts`, `useHazardReporting.ts`, `WaypointEditor.tsx`
- `navigation.tsx` → extract `useNavigationEffects.ts`, `useHazardAlerts.ts`, `useVoiceGuidance.ts`
- `appStore.ts` → extract `offlineMutationsSlice.ts`, `navigationSlice.ts`, `userPreferencesSlice.ts`
**Risk:** High — large refactor touching core flows. Do incrementally with tests. Consider a dedicated branch.

---

## Phase 7: Security Fixes

### 7.1 Rotate production credentials
**Finding:** P0-1
**What:**
1. Rotate Mapbox secret key via Mapbox dashboard
2. Rotate Supabase service role key via Supabase dashboard
3. Update Cloud Run env vars via GCP Secret Manager
4. Update local `.env` files
**Risk:** Medium — all running instances need the new keys. Coordinate with a deploy.

### 7.2 Add production guard for dev auth bypass
**Finding:** P0-2
**File:** `services/mobile-api/src/server.ts` or `config.ts`
**What:** Add startup check:
```typescript
if (config.devAuthBypass.enabled && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: Dev auth bypass cannot be enabled in production');
}
```
Also change `DEV_AUTH_BYPASS_TOKEN` to a 32-byte random hex string even in dev.
**Risk:** None.

### 7.3 Remove or protect broadcast notification endpoint
**Finding:** P0-3
**File:** `services/mobile-api/src/routes/v1.ts:1021-1078`
**What:** Either remove `/notifications/send` entirely, or gate it behind a separate admin API key (not the dev bypass token). Add rate limiting.
**Risk:** Low — no production users depend on this endpoint.

### 7.4 Strip dev bypass from non-dev app builds
**Finding:** P1-S3
**File:** `apps/mobile/app.config.ts:233-248`
**What:**
```typescript
extra: {
  ...(appVariant === 'development' ? {
    devAuthBypassEnabled: process.env.DEV_AUTH_BYPASS_ENABLED,
    devAuthBypassToken: process.env.DEV_AUTH_BYPASS_TOKEN,
    devAuthBypassUserId: process.env.DEV_AUTH_BYPASS_USER_ID,
  } : {}),
  // ... other fields
}
```
**Risk:** Low — preview/production builds should already use real auth.

### 7.5 Fix RLS policies
**Finding:** P1-S2
**File:** New migration in `supabase/migrations/`
**What:**
```sql
-- Fix trips RLS
DROP POLICY IF EXISTS "trips_select" ON trips;
CREATE POLICY "trips_select" ON trips FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "trips_update" ON trips;
CREATE POLICY "trips_update" ON trips FOR UPDATE USING (user_id = auth.uid());
```
Note: `hazards` anonymous insert is intentional (unauth hazard reports). Keep but restrict SELECT to non-expired hazards or service-role only for bulk reads.
**Risk:** High — will break any query that reads other users' trips (community feed uses `trip_shares` table, not `trips` directly — verify). Test thoroughly.

### 7.6 Set proper CORS origin
**Finding:** P1-S1
**File:** `services/mobile-api/.env` (production)
**What:** Set `CORS_ORIGIN=https://defpedal-api-1081412761678.europe-central2.run.app` in the Cloud Run env vars. For local dev, keep `*`.
**Risk:** Low — mobile clients don't use CORS. Only affects browser-based access.

### 7.7 Add `@fastify/helmet` and Pino redaction
**Finding:** P2
**Files:** `services/mobile-api/src/app.ts`
**What:**
```typescript
import helmet from '@fastify/helmet';
app.register(helmet);

// In logger config:
logger: { level: config.logLevel, redact: ['req.headers.authorization'] }
```
**Risk:** None.

### 7.8 Validate `avatarUrl` origin
**Finding:** P2
**File:** `services/mobile-api/src/routes/feed.ts:622-623`
**What:** Add URL format validation to profile update schema. Restrict to Supabase storage URLs:
```typescript
avatarUrl: { type: 'string', pattern: '^https://[a-z0-9]+\\.supabase\\.co/storage/' }
```
**Risk:** Low — may reject existing avatar URLs if they don't match. Check current data.

---

## Summary

| Phase | Items | Effort | Risk |
|-------|-------|--------|------|
| 1. Data Integrity & Stability | 9 | 1-2 days | Medium |
| 2. Performance | 6 | 0.5-1 day | Low |
| 3. UX & Accessibility | 6 | 1-2 days | Medium |
| 4. API Contracts | 6 | 0.5-1 day | Low |
| 5. Infrastructure | 5 | 0.5 day | Low |
| 6. Code Quality | 3 | 1-3 days | Medium-High |
| 7. Security | 8 | 1-2 days | Medium-High |
| **Total** | **43** | | |

Phases 1-5 can be done incrementally on `main`. Phase 6.3 (god screen splits) should be a dedicated effort. Phase 7 (security) requires credential rotation coordination.
