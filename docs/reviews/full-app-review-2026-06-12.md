# Defensive Pedal — Exhaustive App Review

**Generated:** 2026-06-12
**Scope:** Full app — bugs + UX. Report only, no fixes applied.
**Method:** 58-agent multi-agent workflow. 11 dimension finders (API security, data security, mobile crashes, state/offline-queue integrity, core algorithms, API contracts, performance, ride-flow UX, social/growth UX, a11y/i18n, quality/infra) + completeness critic + 4 targeted gap sweeps (background navigation, offline map packs, push delivery, deep links/install referrer). Every P0/P1 finding was independently adversarially verified by a second agent that read the code and tried to refute it. 0 high-severity findings were refuted outright; several were downgraded with cited evidence. 8 gap-sweep findings could not be verified (spend limit) and are marked ⚠ UNVERIFIED. The route-share privacy P0 was verified manually by the orchestrator.

Known-intentional decisions (CORS `*`, weather-ping drift, portrait lock, image-share URL handling, etc.) were excluded from findings by design.

---

## Summary Scorecard

| Dimension | Score | Confirmed P0 | Confirmed P1 | P2 | P3 |
|---|---|---|---|---|---|
| API security | 6/10 | — | 2 | 5 | 1 |
| Data-layer security | 5/10 | **1** | 1 | 1 | — |
| Mobile crash vectors | 8/10 | — | 1 | 3 | 5 |
| State machine / offline queue | 6/10 | — | 1 | 5 | 4 |
| Core algorithms | 7/10 | — | 0 | 3 | 9 |
| API contracts | 6/10 | — | 2 | 4 | 7 |
| Performance | 7/10 | — | 0 | 5 | 3 |
| UX: core ride flow | 6/10 | — | 3 | 7 | 5 |
| UX: onboarding/social/growth | 6/10 | — | 4 | 7 | 4 |
| Accessibility & i18n | 6/10 | — | 1 | 8 | 2 |
| Code quality & infra | 7/10 | — | 0 | 7 | 6 |
| Gap: background navigation | 4/10 | — | 4 ⚠ | 3 | 3 |
| Gap: offline map packs | 4/10 | — | 0 (3 P2↓) | 7 | 4 |
| Gap: push delivery / nudges | 4/10 | — | 2 | 6 | 4 |
| Gap: deep links / install referrer | 4/10 | **1** | 3 ⚠ | 2 | 3 |
| **Overall** | **6/10** | **2** | **~24** | **~74** | **~59** |

⚠ = found but not adversarially verified (spend limit hit); treat as high-probability, confirm before fixing.

The four gap-sweep areas (background nav, offline packs, push delivery, deep links) score lowest — these are exactly the subsystems no regular review had ever swept.

---

## P0 — Fix immediately (both are privacy/data exposure)

### P0-1. `trip_tracks` RLS policy exposes every user's GPS trail to any account *(confirmed, high confidence)*
- **File:** `supabase/migrations/202603240001_create_trip_tracks.sql:32-39` · **Effort: XS**
- `CREATE POLICY "Service role full access" ON trip_tracks FOR ALL USING (true) WITH CHECK (true)` has **no `TO service_role` clause**, so it applies to PUBLIC. Permissive policies are OR-combined, so this overrides the owner-scoped policy for any role with table privileges — and line 39 grants `SELECT, INSERT` to `authenticated`, which includes **anonymous sign-in JWTs** (a core app feature). Anyone with the public anon key can read (and forge) every rider's full GPS history.
- **Fix:** `DROP POLICY "Service role full access" ON trip_tracks;` — service_role bypasses RLS anyway, so the policy is both useless and harmful. The owner-scoped policies already cover legitimate client access. Audit all other migrations for the same no-`TO`-clause pattern.

### P0-2. `hide_endpoints` privacy trim is defeated — raw home/work coordinates shipped anyway *(verified by orchestrator)*
- **Files:** `supabase/migrations/2026041904_route_share_claim_private_follow.sql:309-324` (claim RPC), `2026041801_route_shares.sql:213-214` (public RPC), `services/mobile-api/src/lib/routeShareSchemas.ts:49-58, 75-86` (schema requires origin/destination), `apps/mobile/src/lib/shareClaimToPreview.ts:62-63` · **Effort: M**
- `hide_endpoints` (default TRUE) exists specifically to hide the sharer's home/work location. Both RPCs build the returned route as `payload - 'trimmedGeometryPolyline6'` — they swap in the trimmed **polyline** but leave the raw `origin` and `destination` lat/lon keys in the payload. The Fastify schema requires and passes them through, and the claimant's preview consumes them. The web viewer's own comment states pinning these "would defeat the whole privacy trim."
- **Fix:** In both `get_public_route_share` and `claim_route_share`, when `hide_endpoints` is true, overwrite `origin`/`destination` with the first/last points of the trimmed polyline. Backfill consideration: existing share rows are unaffected once the RPCs change (data never left the DB except via these RPCs).

---

## P1 — Confirmed, fix before next release

### Cluster A: Ride lifecycle — rides lost, strands, zombie states
These five findings interlock; fix as one unit around `finishNavigation`/`resetFlow`/`NavigationResumeGuard`/`NavigationLifecycleManager`.

1. **End Ride dialog has no abort path** — `app/navigation.tsx:1205-1224` (S). Only Discard/Save buttons; Android dismiss (`onDismiss`) is mapped to **Save**, and the follow-up EarlyEndReasonModal also has no close path. A brushed 40px stop button irreversibly ends the ride. *Fix:* add "Keep riding" cancel button; make `onDismiss` a no-op clearing `endActionPending`.
2. **Hardware back during navigation → zombie NAVIGATING + permanently dead Start button** — `app/route-preview.tsx:360-363`, no BackHandler anywhere in the app (S). Back pops to route-preview while GPS keeps recording; the one-shot `navigationStartedRef` never resets, so "Start Navigation" silently no-ops. *Fix:* BackHandler on /navigation routes into End Ride dialog; reset `navigationStartedRef` on focus; when already NAVIGATING make the footer button "Return to navigation".
3. **App killed mid-ride silently force-ends the trip, defeating the documented <15-min auto-resume** — `src/providers/NavigationLifecycleManager.tsx:16-55` (S/M). `useAppKilledRecovery` queues trip_end + resetFlow with no age threshold and no notice, beating NavigationResumeGuard to the state.
4. **Kill recovery and NavigationResumeGuard implement contradictory policies; winner decided by an AsyncStorage hydration race** — same files (M). Whether a killed ride force-ends or offers resume is nondeterministic. *Fix for 3+4:* single owner — gate/delete `useAppKilledRecovery`'s force-end and let NavigationResumeGuard (which has the age threshold and cache check) own the decision; its discard path queues the trip_end pair.
5. **Resume-prompt "Discard" strands the app in AWAITING_FEEDBACK** — `src/components/NavigationResumeGuard.tsx:77-83, 117-122` (S, downgraded P2 by verifier but part of this cluster). `handleDiscard` calls `finishNavigation()` → AWAITING_FEEDBACK + `completedRideCount++`, no trip_end queued, route-preview becomes unreachable (guard excludes AWAITING_FEEDBACK). Same bug in `finalizeEarlyEnd`'s discard path (`app/navigation.tsx:496-515`). *Fix:* discard paths queue trip_end then `resetFlow()`; never `finishNavigation()` on discard.

### Cluster B: Security
6. **Activity-feed v2 comment endpoint bypasses moderation, anonymous gating, and rate limiting** — `services/mobile-api/src/routes/activity-feed.ts:332-372` (S). The *active* feed's comment path uses `requireUser` (allows anonymous), no content filter, no rate limit — while the v1 sibling enforces all three per compliance plan item 7. Play Store UGC-policy compliance gap; contradicts `docs/iarc-questionnaire-answers.md:94` + DPIA declarations. *Fix:* mirror feed-comments.ts (requireFullUser + comment bucket + sanitise/filter + is_hidden; activity_comments needs an is_hidden column).
7. **User-stats SECURITY DEFINER RPCs accept any target user_id with no ownership check** — `get_trip_stats_dashboard`, `get_user_trip_stats`, `get_impact_dashboard`, `get_hazard_reporter_impact` (migrations `202604280004`, `202604020001/3`, `202604090002`, `202604030002`) (S, medium conf). EXECUTE not revoked from anon/authenticated; any anon JWT can pull any user's ride stats/streaks. *Fix:* `IF auth.uid() IS NOT NULL AND requesting_user_id <> auth.uid() THEN RAISE EXCEPTION` guard (mirrors `award_xp`) + `REVOKE EXECUTE ... FROM anon`.

### Cluster C: Contracts / data correctness
8. **GET /v1/rides/:tripId/impact strips ALL fields from `newBadges` and `xpBreakdown`** — `services/mobile-api/src/routes/v1.ts:2534-2535` (XS). Bare `items: {type:'object'}` serializes every item as `{}` (verified empirically against fast-json-stringify). Trip detail screen renders badges/XP from empty objects. *Fix:* reuse the POST sibling's item schemas (v1.ts:2073-2104) as shared consts.
9. **30s offline-sync timeout for trip mutations is defeated by apiFetch's 8s default — MOBILE-7 cold-start fix regressed** — `apps/mobile/src/lib/offlineSyncHelpers.ts:30-39` (XS). The 30s ceiling only governs the outer race wrapper; the actual request still aborts at `DEFAULT_TIMEOUT_MS = 8000`, so 15-25s Cloud Run cold starts fail trip syncs again. *Fix:* pass `{ timeoutMs: getMutationTimeoutMs(type) }` through to mobileApiFetch.

### Cluster D: Growth / first-run experience
10. **Anonymous→signup conversion silently abandons all anonymous data despite "Your data will be preserved"** — `app/onboarding/signup-prompt.tsx:150-152`, `src/lib/supabase.ts:286-289, 187` (downgraded from P0; copy fix XS, real merge L). Google `signInWithIdToken` and email `signUp` both switch to a different user id; no linkIdentity, no merge endpoint exists anywhere. The mandatory gate (3rd open) makes a false promise, then discards the user's banked rides/XP/badges. *Fix short-term:* honest copy. *Proper:* server-side merge endpoint (service role re-parents rows from the captured anonymous id).
11. **No forgot-password flow — email users who forget their password are permanently locked out** — `app/auth.tsx:316-343` (M). No `resetPasswordForEmail` anywhere; error is raw "Invalid login credentials". Compounds #10 (lockout = losing history).
12. **FAQ contains factually wrong answers** — `app/faq.tsx:49-52, 90-93, 121-124, 152-155` (S). Claims coverage in "Romania, Bulgaria, Hungary, Serbia" (actual: Romania + Spain); claims both consent toggles "default ON" (compliance-sensitive — actual: crash ON, analytics OFF); stale badge count; references removed Time Bank feature.
13. **Entire onboarding flow is hardcoded English — translated ro/es keys already exist but were never wired** — `app/onboarding/index.tsx:98-159` + 4 sibling screens (S). First-run experience untranslated for the core Romanian market; the `onboarding.*` i18n namespace is already populated in en/ro/es.
14. **Ghost Button variant is yellow #FACC15 on transparent — 1.53:1 contrast in light theme** — `src/design-system/atoms/Button.tsx:58, 75-79` (S). Ghost is the standard secondary action across 16 surfaces; in light theme it's nearly invisible (AA requires 4.5:1; this fails even the 3:1 UI threshold). *Fix:* theme-aware ghost text (light theme `colors.accent` #CA8A04).

### Cluster E: Nudge/push correctness (server)
15. **`milestone_celebration` re-sends every 30 minutes for the entire milestone day, including overnight** — `services/mobile-api/src/routes/nudges.ts:760-779` (S). No `hasRecentNudge` dedup in Bucket A; P0 priority bypasses quiet hours, daily cap, and safety floor. Up to ~48 duplicate pushes on a streak-milestone day. *Fix:* 24h dedup, and don't grant cron-sourced dispatches the P0 quiet-hours bypass.
16. **`streak_at_risk` fires twice 30 minutes apart every day, burning both daily push slots** — `nudges.ts:768-772` (S). Same missing dedup; also overlaps the legacy streak-protection cron if that ever gets scheduled. *Fix:* 22h dedup (same pattern as `daily_ride_reminder`); pick a single owner for streak reminders.

### P1 ⚠ UNVERIFIED (gap sweeps — confirm before fixing, evidence looks strong)
17. **Background location samples are never merged into the trip breadcrumb trail** — `app/navigation.tsx:162` declares `useBackgroundNavigationSnapshot()` and never reads it; the entire background pipeline is write-only w.r.t. ride data. Screen-off riding loses distance/CO2/XP. (M)
18. **`MAX_BACKGROUND_LOCATION_HISTORY = 20` holds ~40-60 seconds of riding** — `src/lib/backgroundNavigation.ts:12, 61-64` (S). Even if #17 is fixed, the buffer can't cover a realistic kill window.
19. **Swipe-away mid-ride leaks the location foreground service indefinitely** — `backgroundNavigation.ts:143-157` (S). `killServiceOnDestroy` unset (defaults false) + `START_REDELIVER_INTENT` restarts the service after process death → persistent notification + GPS battery drain until reboot. *Fix:* watchdog in the task that stops updates when the session is stale.
20. **Install-referrer claim re-fires on EVERY production cold start for 90 days** — `src/store/appStore.ts:315-323` + `ShareClaimProcessor.tsx:178-197` (S). `hasCheckedInstallReferrer` deliberately not persisted on a false assumption (Play returns the same referrer for 90 days); share-link installs get hijacked to the claimed route preview with a success toast on every open.
21. **Claim success hijacks fresh-install onboarding** — `ShareClaimProcessor.tsx:178-185` (M). New user yanked off `/onboarding/*` (including consent) to `/route-preview`; one-shot OnboardingGuard can't recover; `onboardingCompleted` stays false.
22. **iOS clipboard deferred-deep-link fallback is dead code — web never writes the payload — yet the app reads the clipboard on every iOS cold start, triggering the iOS paste banner** — `src/lib/clipboardShareFallback.ts` + `ShareFallbackBootstrap.tsx:54-61` (S). Privacy-optics issue + dead growth loop. Implement web side or remove the read.

---

## P2 — Fix when convenient (74 total; grouped highlights)

### Security & abuse
- `/v1/search/autocomplete` + `/reverse-geocode`: unauthenticated, unthrottled proxy to paid Mapbox API — **but dead legacy surface** (mobile calls Mapbox directly); cleanest fix is deletion (`v1.ts:363-420`).
- `/hazards/nearby`: no rate limit, optional auth, unbounded `radiusMeters` driving expensive PostGIS scans (`v1.ts:805-905`, XS).
- ~30 handlers leak raw Supabase/PostgREST error strings in client-facing `details` (`v1.ts:1926, 2006, 1516`, S).
- Non-timing-safe comparison of CRON_SECRET / NOTIFICATION_ADMIN_SECRET, duplicated ~6× across route files (S) — consolidate into one `verifyCronAuth` with `timingSafeEqual`.
- POST /rides/:tripId/impact trusts unbounded client `distanceMeters` → inflatable CO2/XP/badges (`v1.ts:2046-2057`, S).
- `quiz_answers` table has **no RLS at all** + Supabase default grants (`202604060002`, XS migration).
- Several authenticated write endpoints missing rate limits: saved-routes, push-token, v2 reactions, follow/unfollow (M).

### State / queue / data
- Dead-letter queue invisible to users — a dead trip_start silently loses the whole ride; retry surface is Diagnostics-only (M).
- Every GPS sample triggers **two full-store persist serializations** to AsyncStorage (~2s cadence; navigationSession ring buffer + full routePreview re-stringified each time) — perf + ANR risk on long rides (`appStore.ts:781-819, 1030-1090`, M). Debounce the persist adapter or move breadcrumbs out of the persisted slice.
- 2000-breadcrumb ring buffer drops the START of rides >~67 min → under-counted distance/CO2/XP (S). Thin instead of drop-oldest.
- Single transiently-failed 401 refresh permanently kills queued trip mutations (cascade ride loss) — `offlineSyncHelpers.ts:162-182` (S).
- Server-mirrored prefs (pedalVoiceSassy, notifyStreak, quietHours…) survive account switch (S).

### Contracts
- `routeOptionSchema` omits `elevationProfile` → silently stripped from all route responses (XS).
- `/v1/trips/track` handler drops `bikeType` + `aqiAtStart` that the client sends and the schema accepts (XS) — downstream impact endpoints read null.
- Three cron notification endpoints (`streak-reminders`, `weekly-impact`, `social-digest`) have **no Cloud Scheduler job** — features silently dark; decide ship-or-delete (S).

### Core algorithms
- `shouldAdvanceStep` fires on 30-100m lateral offset (parallel street) — premature step advance/voice (S).
- `isBadCyclingWeather` fails OPEN on NaN precipitation/wind/code despite fail-closed intent (XS).
- `isAfterSunset` doesn't cover pre-dawn; server safety floor should use `isDark` (XS, one-line).

### Performance
- GET /v1/trips/history ships full GPS trails (up to 2000 pts × 50 trips ≈ 0.5-4 MB) to a list view (M).
- Every visible feed card mounts a **full interactive Mapbox MapView with the complete layer stack** (M) — needs a lightweight thumbnail map or static snapshot.
- Trophy Case: 147 HoloSticker cells, zero FlatList virtualization tuning (S).
- Mascot PNGs decoded at 1080×1350 (~5.8 MB RAM each) for 28-120px renders (S) — downscale assets.

### Offline maps (all three confirmed, downgraded P1→P2)
- 5-day auto-delete is dead code and LRU order is arbitrary — `updatedAt` fabricated as "now" on every listing (`offlinePacks.ts:53`, S).
- Launch cleanup never syncs the Zustand store — evicted packs keep reporting "offline ready" while tiles are gone (XS).
- Eviction has no exemption for the pack backing the active/resumable route (S).
- Plus: packs keyed by ephemeral timestamped route IDs (duplicates accumulate, readiness never survives refetch, M); no tile-count limit handling for long routes (M); interrupted downloads stranded as "downloading" forever (S); sizes guessed at 15KB/resource though the SDK reports real bytes (S).

### Push delivery
- Expo push receipts never checked anywhere; `checkReceipts` is uncalled **and** internally broken (pushes receipt message instead of token) (M).
- No push_tokens pruning path; all send failures (incl. 429) silently swallowed as null (S).
- Nudge tap funnel dead end-to-end: no nudgeLogId in payload, no mobile 'nudge' tap handler, `/v1/nudges/telemetry` has zero callers (M).
- `weather_invitation` claims "Perfect cycling weather" without checking weather; can fire twice per weekend (S).
- Suppressed nudge_log rows written every 30-min tick → table bloat (S).

### UX
- Offline "Resume last route" card never restores the cached route — dead tap when session gone (S).
- Hardcoded English across ride loop, impact-dashboard, my-shares, settings; safety comparison label branches UI on `.includes("less safe")` substring (breaks in RO/ES) (M).
- HazardAlert (safety-critical in-ride banner) shows untranslated core labels (XS).
- Settings tells anonymous guests "Signed in" with a raw UUID (S).
- Quiet hours displayed but not editable — action exists, no UI wired (S).
- Signup-prompt progress checklist is hardcoded and wrong (XS).
- "Anonymous-first" marketing copy contradicts the hard signup wall at 3rd open (XS + product decision).
- Notification permission dialog fires ~3s into first launch, stacked on the location ask (S) — gate on onboarding completion.
- Celebration overlays un-sequenced (badge + rank-up + MeetPedal + milestone can collide) (M) — needs a one-at-a-time coordinator queue.
- Hazard "Report here" button silently no-ops before map center resolves (XS).
- Background-permission denial silently disables screen-off tracking with zero feedback (S).
- Foreground-service notification text hardcoded English (XS).
- Cold-start deep link can be lost to the persist hydration race; failed share-link claims un-retryable for the session (S/XS).

### A11y
- BadgeUnlockOverlay: no reduced-motion gating on the particle burst; unlabeled full-screen dismiss (S).
- ~97 hardcoded English accessibilityLabels — RO/ES screen-reader users hear English (M).
- Light theme: textMuted 4.28:1 on white (below AA); white-on-accent 2.94:1 (XS token change).
- Reduced-motion gaps in XpGainToast, BadgeProgressBar, ImpactSummaryCard, HoloSticker, others (S).
- Fixed Button heights clip text at ≥1.3× font scale (XS — `minHeight` + padding).
- Sheet drag handle has no a11y role/label/state (XS).
- Hardcoded 'en-US' date locale in StatsDashboard chart labels (XS).

### Quality / infra
- 12 files exceed the 800-line cap; `routes/v1.ts` is 3,704 lines (L, incremental).
- No error monitoring on the API (no Sentry; 500s only visible in Cloud Run logs) (S).
- `/health` is shallow — add a separate `/health/deep` probing Supabase (S).
- Overpass client trio triplicated (S); 74 `as any` casts concentrated in Mapbox layers (S).
- NavigationLifecycleManager start/stop not serialized — quick start→end can leave the service running while IDLE (S).
- Background sample persistence is a non-atomic read-modify-write hit by two producers (S).

---

## P3 — Track for later (59; representative)
- Coverage thresholds defined but CI never runs `--coverage` (XS).
- Risk-distribution percentages can sum to 98-102 (largest-remainder fix, XS).
- `decodePolyline` appends a spurious coordinate on truncated input (XS).
- RO bbox swallows all of Moldova + border strips — riders there get RO OSRM with no data (M, verify extract coverage).
- Tunnel/bridge alert dismisses 10m past the *entrance*, not the exit (XS).
- routeFeatures edge indexing misaligns when a middle leg lacks annotations (multi-stop) (S).
- Floating promises / unguarded native awaits → unhandled-rejection Sentry noise offline (XS each).
- ErrorBoundary missing on route-planning + feedback (XS).
- ElevationProgressCard NaN at totalDistance 0 (XS).
- Auth screen doesn't navigate away after sign-in; sign-up success easy to miss (S).
- Like vs Love: two parallel reactions, no semantic distinction anywhere (product decision).
- First-route onboarding mislabels risky segments as "Hazards" (XS).
- End Ride button 40×40 (<44pt) in the control rail (XS).
- Long-press hint replays 4s on every planning mount (XS).
- Resume prompt shows raw GPS coordinates as destination name (S).
- Offline Maps screen ships dev-changelog copy + raw internal route IDs (XS).
- Dead i18n keys (guardianTier, timeBank) + `miaMilestoneAdvanced` contract leftover (XS).
- pino has no redact config (XS, preemptive).
- Runtime container type-strips core's raw TS on a floating node:22-alpine tag (S).
- Legacy push taps (streak_reminder, weekly_summary, first-ride) do nothing — `data.type` unhandled (S).
- First-ride dedup keyed on body-text ILIKE — copy edit silently re-enables resends (XS).
- All three app variants are verified app-link handlers — share links can open the dev variant on tester devices (S).
- assetlinks/AndroidManifest: stale 'Share card not built yet' comment; `aqiAtStart` TODO (the codebase's only genuine TODO).

---

## Positive observations (what's genuinely strong)
- **Auth is real:** JWT verified against GoTrue; dev-bypass triple-hardened (timingSafeEqual + NODE_ENV gate + Dockerfile ENV). IDOR systematically prevented across all endpoints. No SQL/RPC injection anywhere.
- **Native-module guard discipline is exemplary** — the `hasExpoNativeModule` pattern is applied consistently; the error-log #21 bug class appears fully closed.
- **The offline queue handles the hard cases:** crash recovery of in-flight mutations, cascade-kill of orphans, permanent-4xx classification, server-side idempotency on trips (upsert on client_trip_id).
- **i18n key parity is flawless** — 879 keys × 3 locales, zero mismatches (the problem is *unwired screens*, not the catalog).
- **TanStack staleTime discipline, memoized list items, hoisted Mapbox styles, useHoloTilt's shared-sensor design** — the perf fundamentals are deliberate.
- **CI is broader than the docs claim:** audit, lint ratchet, WCAG token contrast check, 3-workspace typecheck, full ~1260-test suite.
- **Migration discipline:** 80/86 idempotent; v22 reload was a textbook staged swap.
- **Coordinate-order discipline in core** (every function documents [lat,lon] vs [lon,lat]) and injected clocks/randomness make the whole package deterministic.
- **Comment hygiene:** one genuine TODO in ~91k lines of source.

---

## Recommended fix plan

### Phase 0 — Stop the bleeding (target: this week, ~3-4 dev-days)
The two privacy P0s plus the ride-data-loss cluster. All are small, surgical, independently shippable.
1. `trip_tracks` RLS migration (drop the unscoped policy; audit siblings) — XS
2. `hide_endpoints` RPC fix (overwrite origin/destination with trimmed endpoints) — M
3. GET impact schema (reuse POST item schemas) — XS
4. 30s trip-sync timeout threading — XS
5. `/trips/track` bikeType/aqiAtStart passthrough — XS
6. End Ride dialog: add Cancel, fix onDismiss — S
7. Android BackHandler on navigation + `navigationStartedRef` re-arm — S
8. Unify kill recovery (NavigationResumeGuard owns it; discard paths queue trip_end + resetFlow, never finishNavigation) — M
   → Covers P1 #3/#4/#5 and the finalizeEarlyEnd discard variant in one refactor. Add regression tests for each discard/kill path.

### Phase 1 — Security & trust (~1 week)
9. v2 comment endpoint: requireFullUser + rate limit + moderation pipeline (+ is_hidden column) — S
10. SECURITY DEFINER stats RPC ownership guards + REVOKE from anon — S
11. `quiz_answers` RLS migration — XS
12. Delete (or gate) the dead `/search/*` proxy endpoints; clamp + rate-limit `/hazards/nearby` — S
13. Shared timing-safe `verifyCronAuth`; stop leaking upstream error messages — S
14. Bound `distanceMeters` on impact POST (or derive server-side) — S
15. Forgot-password flow (`resetPasswordForEmail` + deep-link handler) — M
16. FAQ factual rewrite (countries, consent defaults, badge count, Time Bank) — S
17. Honest signup-prompt copy now; scope the anonymous-data merge endpoint as its own project — XS now, L later

### Phase 2 — Growth & retention correctness (~1-2 weeks)
18. Wire existing onboarding i18n keys into the 5 screens — S
19. Gate notification permission ask on onboarding completion + context — S
20. Celebration coordinator (one overlay at a time, priority queue) — M
21. Nudge dedup: milestone 24h + streak_at_risk 22h; no P0 quiet-hours bypass for cron dispatches — S
22. Push receipts cron + DeviceNotRegistered token pruning + structured send results — M
23. Nudge tap funnel: nudgeLogId in payload, mobile handler, telemetry POST — M
24. Verify + fix install-referrer re-fire (persist the check), onboarding hijack guard, iOS clipboard decision — S+M+S
25. Ghost button light-theme contrast + textMuted token — S

### Phase 3 — Background navigation & offline maps (verify-then-fix, ~1 week)
26. Verify the 4 unverified background-nav findings (one cheap agent pass or manual), then: merge background samples into breadcrumbs, raise the 20-sample cap, add the service watchdog, serialize start/stop — M-L combined
27. Offline packs: real `createdAt` in metadata, store sync after cleanup, protected-route exemption, content-keyed pack IDs — M
28. Background-permission denial UX (priming sheet + persistent "screen-off tracking off" pill) — S

### Phase 4 — Performance & polish (ongoing backlog)
29. Throttle/debounce persist during navigation; thin (don't drop) breadcrumbs >2000 — M
30. Trip-history payload diet (drop gps_trail from list endpoint) — M
31. Feed-card lightweight map thumbnail; Trophy Case FlatList tuning; mascot PNG downscale — M+S+S
32. Dead-letter ride-loss banner with Retry — M
33. i18n long tail (ride loop, dashboards, a11y labels, foreground-service notification) — M
34. A11y sweep: reduced-motion gaps, touch targets, font-scale minHeight, sheet handle semantics — S-M
35. API observability: Sentry on Fastify (or log-based alerting) + `/health/deep` — S
36. Code quality: split v1.ts by domain; Overpass client consolidation; `as any` reduction; coverage in CI — L (incremental)
37. Product decisions to schedule: Like-vs-Love consolidation, signup-wall threshold, ship-or-delete the 3 unscheduled cron endpoints, anonymous-data merge (the L item from #17)

---

## Verification debt
Eight gap-sweep findings (P1 #17-22 above plus two P2s in the deep-link group) were never adversarially verified because the run hit the monthly spend limit at the tail. The finder evidence cites specific lines and library defaults and looks solid, but per this review's own standard, confirm each before scheduling the fix. The workflow is resumable: re-running it re-verifies only the missing items (everything else returns from cache).
