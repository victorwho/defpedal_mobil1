# Codebase Review Report — Errors & Bugs
**Generated:** 2026-05-04
**Scope:** Categories 2 (Errors & Crashes), 4 (Data Integrity), 5 (API Contracts) — focused on real correctness defects, not style

## Summary Scorecard

| Category | Score | P0 | P1 | P2 |
|----------|-------|----|----|----|
| Errors & Crashes | 7/10 | 0 | 4 | 2 |
| Data Integrity / State | 7/10 | 0 | 5 | 4 |
| API Contracts | 6/10 | 0 | 5 | 2 |
| **Overall** | **7/10** | **0** | **14** | **8** |

**Verdict: WARNING.** No P0 / data-loss / boot-crash bugs. 14 P1 defects clustered around the offline mutation queue, navigation engine edge cases, and inconsistent auth tiers on social/community endpoints. None are user-visible all-the-time, but several show up under realistic conditions (offline retry, app-kill mid-ride, end-of-route GPS jitter, anonymous user social actions).

---

## P0 — None

---

## P1 — Fix Before Next Release

### Offline mutation queue (highest impact)

**1. `packages/core/src/distance.ts:37-38` — `polylineSegmentDistance` OOB silently returns 0 → false arrival**
After a reroute that produces a *shorter* polyline, `closestPointIndex` from the previous tick can exceed the new polyline's length. The function returns 0 silently, navigation engine reads `distanceToManeuver = 0`, `arrivedAtManeuver` flips true, and the ride completes prematurely.
**Fix:** Bounds-guard `fromIndex >= points.length`; clamp or propagate sentinel so the caller knows the index is stale.

**2. `apps/mobile/src/providers/OfflineMutationSyncManager.tsx:239 + :256` — stale `state` snapshot used post-await**
Two related issues in the same flush loop. (a) `state` captured at line 224 is used for `state.tripServerIds` lookup and post-await `state.resolveMutation()` / `state.setTripServerId()` calls. Across flush boundaries (or after a concurrent telemetry tick), this snapshot can be stale, causing `trip_end`/`trip_track` to read `null` for `tripServerId` and be silently dropped. (b) Same root cause for `resolveMutation` at line 256.
**Fix:** Re-read `useAppStore.getState()` immediately after each `await` and after `markMutationSyncing`, the same pattern already used for the cascade-kill at line 274.

**3. `apps/mobile/src/providers/NavigationLifecycleManager.tsx:42` — app-kill recovery hardcodes `routingMode: 'fast'`**
After app kill mid-ride, the recovered `trip_track` mutation always records `routingMode: 'fast'`, regardless of whether the user was on safe or flat. Trip history mode-split, leaderboard, and stats dashboard all see wrong data for any kill-recovered ride.
**Fix:** Read `useAppStore.getState().routeRequest.mode` instead of the literal.

**4. `apps/mobile/app/navigation.tsx:359` — duplicate `trip_end` possible from stale closure**
`queueTripEnd` memoizes `hasQueuedTripEnd` derived from a React-state selector. If the auto-completion effect (line 718) and an unmount cleanup both call `queueTripEnd` in the same tick, both see the closure-captured `false` and enqueue twice.
**Fix:** Inside the callback, replace the closure read with `useAppStore.getState().queuedMutations.some(m => m.type === 'trip_end' && m.payload.clientTripId === currentActiveTripClientId)`.

### Navigation engine

**5. `packages/core/src/navigation.ts:428` — premature `shouldCompleteNavigation` at last step**
`shouldCompleteNavigation` triggers on `arrivedAtManeuver && currentStepIndex >= totalSteps - 1`. When `closestPointIndex` snaps slightly past the penultimate maneuver (the `hasPassedCurrentManeuver` branch), the engine advances to the final arrival waypoint with the user still meters away, then the next tick sees `distanceToManeuver <= 25` and completes the ride.
**Fix:** Gate completion on user-to-destination haversine `<= ARRIVAL_THRESHOLD_METERS`, not just step index + maneuver distance.

### State machine & store

**6. `apps/mobile/src/store/appStore.ts:657-666` — `finishNavigation` split-brain**
If called from any state where `navigationSession.state !== 'navigating'`, the guard makes `appState` updates a no-op while `navigationSession.state` may still flip. Outcome: `appState='ROUTE_PREVIEW'` but session is `'awaiting_feedback'` — route guards inconsistent with reality.
**Fix:** Always reconcile `appState` from session state, or assert/throw on illegal entry.

### Auth & API contracts

**7. `services/mobile-api/src/routes/follow.ts:46` — `requireUser` lets anonymous users follow accounts**
Anonymous Supabase sessions can create `user_follows` rows that propagate into the activity feed and suggested-users surface. This contradicts the design where social actions need verified identity.
**Fix:** Replace `requireUser` with `requireFullUser` on `POST/DELETE /users/:id/follow`, `/follow/approve`, `/follow/decline`.

**8. `services/mobile-api/src/routes/v1.ts:888-967` — `/hazards/:id/validate` bypasses the `hazardVote` rate-limit bucket**
The new `/vote` endpoint correctly applies the dedicated 5-per-10-min `hazardVote` bucket, but the legacy `/validate` endpoint (writing to the same `hazard_validations` table) still uses the global `write` bucket. A user can entirely sidestep the throttle.
**Fix:** Either apply `hazardVote` to `/validate` line 925 or retire the endpoint if `/vote` has fully replaced it.

**9. `services/mobile-api/src/routes/v1.ts:775-886` — `/hazards/nearby` uses 200-row truncation + degree bbox**
DB query has no spatial filter and caps at 200 most-recent hazards; JS-side filter then applies a degree-delta bbox. In high-density Bucharest areas with >200 active hazards, older hazards inside the requested radius are silently missed. Degree bbox also drifts at high latitudes.
**Fix:** Move spatial filter into a PostGIS RPC (`ST_DWithin`) or at minimum add lat/lon range to the Supabase query before the row cap.

**10. `services/mobile-api/src/routes/leaderboard.ts:204` — wrong rate-limit bucket (`routePreview`)**
Leaderboard reads share the route-preview bucket. A user hammering one starves the other.
**Fix:** Add a dedicated `leaderboard` policy to `MobileApiDependencies.rateLimitPolicies`.

**11. `services/mobile-api/src/routes/v1.ts:601` — `/trips/history` schema declares `clientTripId` but handler doesn't return it**
The DB select in `submissions.ts:320` doesn't fetch `client_trip_id`, but the response schema lists it. Client receives `undefined` for a "declared" field. Either add it to the SELECT + map, or remove it from the schema.

### Auth (concurrency)

**12. `apps/mobile/src/providers/AuthSessionProvider.tsx:105` — race between mount sync and `onAuthStateChange`**
On mount, `syncCurrentSession(true)` and the `onAuthStateChange` subscriber can both call `setSession`. If `getCurrentSession()` returns `null` between the mount call and anonymous sign-in completing, you get a brief `setSession(null)` flash before the anon session arrives — which can momentarily fail route guards.
**Fix:** `syncInProgressRef` mutex around `syncCurrentSession`, or debounce the auth-state subscriber by a frame.

### Data fan-out hazard

**13. `apps/mobile/src/store/appStore.ts:586-593` — double-tap `startNavigation` creates duplicate `trip_start`**
No guard against entering `NAVIGATING` while already `NAVIGATING`. Double-tap "Start" creates a fresh session + `clientTripId`, leaving the prior `trip_start` orphaned and dispatching the second `trip_start` for what users perceive as the same ride.
**Fix:** `if (state.appState === 'NAVIGATING') return state;` at top of `startNavigation`.

### Cascade-kill ordering

**14. `apps/mobile/src/providers/OfflineMutationSyncManager.tsx:265-283` — cascade-kill assumes idempotent `killMutation`**
When `trip_start` exhausts retries, dependents are killed in a loop. If `killMutation` is not idempotent (skips/throws when already `dead`), and a parallel telemetry tick raced past the `flushingRef` guard via an exception path, dependents could be left orphaned in `syncing` state. `recoverSyncingMutations` saves it on next mount, but worth verifying.
**Fix:** Confirm `killMutation` is a no-op for already-dead mutations; alternatively wrap the cascade in `try/catch` per id.

---

## P2 — Latent Risks (group fix when convenient)

| # | File:line | Issue |
|---|-----------|-------|
| 15 | `apps/mobile/app/navigation.tsx:580-605` | Offline-cache `useEffect` deps missing `routeRequest.origin/destination/waypoints` — stale labels possible |
| 16 | `apps/mobile/src/providers/OfflineMutationSyncManager.tsx:327-329` | Telemetry slice-by-count is correct *only* while events are append-only; future prepend would silently drop |
| 17 | `services/mobile-api/src/routes/moderation.ts:339` | Auto-filter inserts `content_reports` with `reporter_user_id = comment.user_id` — collides with manual user reports if there's a uniqueness constraint |
| 18 | `services/mobile-api/src/routes/mia.ts:579-605` | Cron 500 response `details` leaks raw Supabase error string to scheduler log aggregation |
| 19 | `packages/core/src/distance.ts:104` | Single-point polyline returns `segmentIndex: 0` — misleading to downstream consumers |
| 20 | `packages/core/src/navigation.ts:553` | `computeCurrentGrade` assumes uniform `segmentLengthMeters = totalDistance / segments`; off when terrain-RGB arc length differs from OSRM distance |
| 21 | `packages/core/src/contracts.ts:7` | `RoutingMode = 'safe' \| 'fast'` does not include `'flat'`; flat-mode actually encoded via `avoidHills` flag — undocumented |
| 22 | `apps/mobile/src/lib/offlineQueue.ts:37` | `Date.now()` + `Math.random()*10000` fallback ID has 1-in-10k collision/tick. Production uses `crypto.randomUUID()`, but tests stubbing the factory hit this path |

---

## Positive Observations

- `closestPointOnPolyline` perpendicular projection handles the cosLat scaling consistently in forward + back projection — math holds.
- `polyline.ts` encode/decode pair correctly uses `1e6` (Polyline6) on both sides, including antimeridian deltas. Closed regression from session 25.
- `co2.ts`, `microlives.ts`, `riskDistribution.ts` all guard against zero/negative inputs cleanly. No NaN paths.
- `OfflineMutationSyncManager` correctly serializes flushes via `flushingRef` and resets in `finally` (line 336).
- New `requireFullUser` enforcement on hazard voting, comments, and account deletion is consistent and well-applied.
- Trip-fan-out delete (session 34, `submissions.ts:362`) correctly scrubs all three user-visible tables — pattern to repeat for any future "remove ride" handler.

---

## Recommended Action Plan

**Phase 1 — offline-queue correctness (one focused PR)**
Fixes 1, 2, 3, 4, 14. These are tightly coupled — all live in the queue/lifecycle code path and all break under realistic offline + app-kill scenarios.

**Phase 2 — navigation completion edge case**
Fixes 5, 6, 13. Touch `packages/core/src/navigation.ts` and `apps/mobile/src/store/appStore.ts`. Add a destination-distance gate to `shouldCompleteNavigation` and add re-entry guards to `startNavigation` / `finishNavigation`.

**Phase 3 — auth tier corrections**
Fixes 7, 10, 11. Quick API edits + a leaderboard rate-limit policy. Verify in tests that anonymous sessions get 403 on follow endpoints.

**Phase 4 — hazard scaling**
Fixes 8, 9. The `/validate` rate-limit gap is a one-line fix. The `/hazards/nearby` truncation needs a small PostGIS RPC — defer until there's evidence of >200 active hazards in any served city.

**Phase 5 — auth flicker**
Fix 12. Mutex/debounce in `AuthSessionProvider`.

**P2 cleanup** can ride the next maintenance pass.
