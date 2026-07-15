# GPS Trip-Tracking Audit — does tracking work for all trips?

Generated: 2026-07-15 (rev 2 — fleet-version finding corrected against Sentry release data)
Scope: focused `/review` — GPS breadcrumb recording → offline queue/sync → server persistence, cross-checked against production data (Supabase, 2026-04-01 → 2026-07-15) and Sentry release health.
Method: 3 parallel code-review agents (recording / queue / server) + direct production SQL analysis. All P0 code claims spot-verified in source by the orchestrator.

> **rev 2 correction:** rev 1 claimed no production AAB after v0.2.88 ever shipped ("P0-OPS"). Wrong — session memory only records what happens inside sessions, and the uploads happen outside them. Sentry (`app_variant:production`) shows the actual fleet: **v0.2.91+94 erroring since 2026-06-17, v0.2.92+95 since 2026-06-27 (32 unique users/30d — dominant), v0.2.97+100 since 2026-07-12** (rollout starting). The error-log #60 self-heal fix IS fielded. That reframes the ongoing July losses: they are not "unshipped fix", they are the findings below — chiefly the resume-prompt Discard behavior.

## Verdict

**No — GPS tracking does not work for all trips.** It is reliable for one population: a rider with a working (anonymous or full) session, online-ish, who finishes or explicitly saves a ride under ~1 hour with background-location permission granted. Outside that envelope: one product-behavior change that is currently the dominant cause of trackless rides, three P0 loss paths in code, one silent truncation cap confirmed by production data, and a set of by-design trackless outcomes that mask real losses in analytics.

**Production reality check:** weekly share of ended trips that have a GPS track fell from ~100% (April) to **13.3%** (week of 2026-07-13). The collapse timeline matches the fleet moving to v0.2.91/0.2.92 (June 17–27), which replaced auto-save kill-recovery with a Resume/Discard prompt.

## Production data summary

Weekly `trips` ended vs having a `trip_tracks` row:

| Week | ended | with track | % |
|---|---|---|---|
| 2026-04-13 | 21 | 21 | 100% |
| 2026-05-04 | 45 | 32 | 71% |
| 2026-06-01 | 27 | 16 | 59% |
| 2026-06-22 | 41 | 13 | 32% |
| 2026-06-29 | 114 | 30 | 26% |
| 2026-07-13 | 15 | 2 | 13% |

Decomposition (since 2026-06-15, ended trips):
- `completed` (arrival auto-detect): **41/42 tracked (98%)** — healthy.
- `stopped` + saved (has `ride_impacts`): **21/22 tracked** — healthy. The true-loss signature (impact recorded, track missing) is **zero** for stopped rides.
- `stopped` + no track + no impact: **156** — (i) explicit in-ride discards (29 gave an early-end reason; avg 2–6 min; trackless **by design**) and (ii) **127 zombie rides, no reason, avg "duration" ~14 h** — interrupted rides closed out at the resume prompt (see P1-0).
- Stranded (`ended_at IS NULL`): 24 (Apr) / 71 (May) / 34 (Jun) / 33 (Jul) — `trip_end` never arrived at all.
- Kill-recovery tracks (`trip_tracks.end_reason='app_killed'`): 5 (Apr) / **67 (May)** / 11 (Jun) / **0 (Jul)** — the auto-save recovery went dark exactly when the prompt-based flow reached the fleet.
- Trail size: max stored trail is **exactly 2000 points** (the client ring-buffer cap is being hit); p95 ≈ 1040. Max payload 66 KB.

Fleet (Sentry, `app_variant:production`, 30d): v0.2.92+95 dominant (first event 2026-06-27, 32 users), v0.2.91+94 before it (first event 2026-06-17), v0.2.97+100 appearing 2026-07-12. v0.2.101 (region gate + EU routing) built 2026-07-13, not yet observed in the field.

## Where tracking breaks (ranked by real-world impact)

### P1-0 — Resume-prompt "Discard" throws away the fully-recorded trail (dominant cause of current losses)
`NavigationResumeGuard.tsx` (single owner of restart recovery since the 2026-06-12 review): an interrupted session ≥15 min old shows "Resume navigation? … Would you like to pick up where you left off?" with **Resume / Discard**. Discard calls `closeInterruptedRide(false)` → queues `trip_end` only; the GPS trail — fully captured, sitting in the persisted session — is deleted (`resetFlow`, line 132). A rider reopening the app hours after an interrupted ride has no reason to "resume navigation" to a place they already went, so they tap Discard, and the ride they actually rode vanishes: no History, no impact, no CO2/XP. The old behavior (May fleet) auto-saved these with `end_reason='app_killed'` — 67 recovered tracks in May vs **0 in July**; 127 zombie trips since June 15. This was a deliberate design decision (docstring lines 23-29, mirroring the in-ride discard), but the production data shows it deletes the single largest bucket of real ride data. The auto-save branch (`saveTrack: true`) only fires when the cached route is missing — rare. **Fix direction:** save the track on prompt-Discard too (the user is answering "do you want to keep navigating", not "destroy my ride"), or reword the prompt to a three-way "Resume / Save ride / Discard", or auto-save with `app_killed` and let users delete from History.

### P0-1 — Anonymous sign-in failure at cold start silently drops the entire ride
`AuthSessionProvider.tsx:86-100`: if the anonymous Supabase sign-in fails at cold start (first open in a dead zone), `user` stays null and there is **no retry for the rest of the session** (`anonSignInAttempted` is mount-scoped); `authError` renders only on `/auth` and `/diagnostics`. `route-preview.tsx:390-411`: with `user == null`, `beginNavigation` skips `trip_start` and sets `activeTripClientId = null` — but navigation starts normally and records the full trail. At ride end, `navigation.tsx:418` `queueTripEnd` bails on `!currentActiveTripClientId`: **neither `trip_end` nor `trip_track` is enqueued.** No banner, no dead-letter, no local artifact. (These rides never create a `trips` row, so they are invisible even to the "stranded" metric.)

### P0-2 — Any userId transition wipes the offline queue, including unsynced rides
`appStore.ts:1000-1009` `resetUserScopedState()` unconditionally sets `queuedMutations: []` + `tripServerIds: {}`. `UserCacheResetBridge.tsx:52-96` fires it on **every userId change**: explicit sign-out (`profile.tsx:975-991`, no pending-queue check), account switch, and — worst — the **stale-refresh-token auto-recovery** (`AuthSessionProvider.tsx:74-84`), which signs the user out locally and back in anonymously with no user action. That last path disproportionately hits devices returning after a long offline stretch — exactly the population most likely to be holding an unsynced ride — and is the best remaining candidate for the ~33 stranded trips/month that persist despite the fielded self-heal: the queue holding `trip_end`/`trip_track` is deleted before the drain can run, and `RideLossBanner` never fires because the mutations were removed, not dead-lettered.

### P0-3 — `/trips/track` is unprotected against large route geometry (error-log #64 class, live now)
`v1.ts:466-516` has **no route-scoped `bodyLimit`** (inherits Fastify's 1 MiB default; `app.ts:28`) and caps `plannedRoutePolyline6` at `maxLength: 500000`. The client sends the **full `overview=full` route geometry, never downsampled** (`navigation.tsx:452` ← `mapbox-routing.ts:181`) — the payload class that 413'd `/risk-segments` and `/elevation-profile` on 2026-07-12 and was fixed there (`v1.ts:1433,1495` + client 12k caps) but **not here**. Outcomes: ≳125k-point route → 400 schema violation → `isPermanentError` (`offlineSyncHelpers.ts:192-212`) dead-letters on the **first attempt**; ≳250k points → `FST_ERR_CTP_BODY_TOO_LARGE`, which the global error handler (`app.ts:156-211`) **force-maps to 500** (native Fastify errors' `statusCode: 413` is ignored) → 5 futile retries, then dead. `trip_end` succeeds independently, so the trip looks "ended" but is invisible in History/stats/Heartbeat. Newly reachable since EU-wide routing enabled very long cross-border rides — and v0.2.101 (which makes such routes far more likely) starts rolling now. No server-side reaper exists to detect or repair track-less trips.

### P1-1 — 2000-crumb ring buffer silently truncates rides longer than ~1 hour
`appStore.ts:888-892` `MAX_BREADCRUMBS = 2000`, oldest-evicted; foreground sampling ~1 sample/2 s while moving (`useForegroundNavigationLocation.ts:138-139`), so the buffer holds ≈66 min of moving time (~15 km at city pace). Longer rides lose their **opening** minutes before upload. Production confirms the cap is hit (max trail = exactly 2000). Server computes `actual_distance_meters` from the received trail (`submissions.ts:305-307`) → CO2/XP/badges under-count. (Server schema allows 10,000 points — the client cap is the binding constraint.)

### P1-2 — "While using the app"-only location permission = silent gaps when the screen locks
Background recording (dedicated `expo-task-manager` task + Android foreground service, `backgroundNavigation.ts:173-220`) requires "Allow all the time". If the rider granted only foreground access — often the only choice in the first-run dialog — `startBackgroundNavigationUpdates()` throws and `NavigationLifecycleManager.tsx:26-41` swallows it silently. The foreground watcher is suspended on screen lock. The status plumbing exists (`useBackgroundNavigationSnapshot` is called at `navigation.tsx:163`) but the result is never read — no UI warning. Trail for locked-screen stretches is thin or empty; ride still "saves".

### P1-3 — Anonymous→account upgrade can dead-letter a trailing trip_end/trip_track
`UserCacheResetBridge.tsx:65-93` deliberately preserves the queue on anon→real upgrade, but `mobileApiFetch` attaches the token current **at send time**, and the merge RPC re-parents rows only for fresh target accounts. Signing into a **pre-existing** account with an unsynced `trip_end`/`trip_track` still queued → resolve runs as the new user against the anonymous user's trip → 404 → dead-letter. At least this one surfaces via `RideLossBanner`.

### By design (not bugs, but they shape the data)
- **In-ride discards** write `trip_end` but no track (since v0.2.85) — trackless `stopped` rows, indistinguishable from silent losses in analytics (no explicit discard marker in the DB).
- **Task-swipe stops the recording service** (`killServiceOnDestroy: true`) deliberately (prior notification-leak regression); the captured trail survives locally for the resume guard.
- **Sub-minute rides** can legitimately produce 0–2-crumb tracks.

### P2/P3 (minor)
- ErrorBoundary "Restart App" JS reload can lose up to ~8 s of tail crumbs (persist debounce, `storage.ts:112-113`); backfilled on next lock/unlock via the background-trail merge, except crashes in the final seconds. (P2)
- GPS permission revoked mid-ride via OS Settings: recording silently stops; no distinct signal. (P2)
- Shared `write` rate bucket (20/60 s, `config.ts:125-131`) across trip_start/end/track/feedback could throttle a multi-ride backlog drain; 429 retries usually self-heal; tightens when Redis activates. (P2)
- `finishTripRecord` (`submissions.ts:218-238`) never checks UPDATE row count — a zero-row match would silently strand a trip; no reachable trigger found today. (P2)
- `retryDeadMutations()` (`queueSlice.ts:292-314`) doesn't force a persist flush, unlike every sibling transition — a kill within ~8 s of tapping Retry reverts it (banner reappears; no loss). (P3)
- Duplicate mutation-ID factories (`offlineQueue.ts:34-53` vs `queueSlice.ts:10-24`) — DRY drift. (P3)

## What was verified to work (hypotheses refuted with evidence)

- **The save path holds**: since June 15, zero manually-stopped rides with an impact recorded are missing their track; arrival-completed rides ~98% tracked.
- **Background recording with the right permission** is solid: OS-level task at 2 s/5 m, immediate (non-debounced) AsyncStorage writes, Doze-batch handling, idempotent merge back into the live trail on every foreground transition.
- **Stale-first-fix / teleport guards (error-log #53)**: intact in two layers (`appStore.ts:874-886` real-time; `packages/core/src/breadcrumbs.ts:39-97` batch sanitizer with lone-leading-outlier trim).
- **Queue mechanics**: trip-critical types exempt from eviction (`queueSlice.ts:5-9,179-211`); strict ordering (`trip_track` never sent before `trip_start` resolves); no double-send (single manager + `flushingRef` + `syncing` status); 429/408/network errors retried, not dead-lettered; self-heal resolve fires for both `trip_end` and `trip_track`; resolve 404 dead-letters rather than skipping forever.
- **Server idempotency**: `trip_tracks.trip_id` UNIQUE + upsert — lost-response retries overwrite, never duplicate.
- **Anonymous riders are not auth-gated out**: all four trip endpoints use `requireWriteUser` (anonymous OK).
- **Flat-mode rides** are `mode:'safe' + avoidHills` — no enum rejection (side note: the avoid-hills flag isn't recorded on `trip_tracks`; analytics gap only).
- **Dev fake-GPS tool** does not touch live-navigation recording and fails closed in production.
- **The error-log #60 fix is fielded** (rev 2): v0.2.92 live since ~June 27 per Sentry — orphan self-heal is active on the dominant fleet version.

## Recommended action plan

1. ~~**Save the trail on resume-prompt Discard** (P1-0)~~ — **CODE DONE 2026-07-15** (commit `cf7c1a9`): three-way prompt Resume / **Save ride** / Discard ride; Save runs the kill-recovery close-out (trip_end + trip_track `app_killed`, background trail merged) so the ride lands in History; copy reframed to "Finish your last ride?" and localized en/ro/es; `resume_guard_outcome` telemetry on all five outcomes. **Reaches riders with the next app build** — the field keeps losing interrupted rides until it ships, so fold it into the next production release.
2. ~~**Port the error-log #64 fix to `/trips/track`** (P0-3)~~ — **DONE 2026-07-15** (commit `06cb647`, Cloud Run `defpedal-api-00111-q55`, error-log #65): 8 MiB route-scoped `bodyLimit`, server-side decode→downsample→re-encode of `plannedRoutePolyline6`, error handler preserves native Fastify 4xx statuses. Live-probed. Remaining client half (downsample at the write site) rides a future app build — server backstop covers all field versions.
3. **Stop wiping trip-critical mutations on userId transitions** (P0-2): in `resetUserScopedState`, dead-letter (or preserve + re-own) queued `trip_*` mutations instead of deleting; warn on sign-out with a pending queue. Likely closes most of the residual ~33 stranded trips/month.
4. **Make anonymous sign-in failure non-fatal to rides** (P0-1): retry anon sign-in with backoff after connectivity returns; enqueue `trip_start` regardless of session (the drain already waits for auth); surface "ride won't be saved" state if truly session-less.
5. ~~**Raise or adaptively thin the 2000-crumb buffer** (P1-1)~~ — **CODE DONE 2026-07-15** (commit `88829e9`): both the main trail and the background locked-screen buffer now thin (halve resolution, keep endpoints) at capacity via core `thinBreadcrumbTrail` — each pass doubles the ride duration the buffer holds; no more losing the ride's opening kilometres. Rides with the next app build.
6. ~~**Surface background-permission status** in the nav UI (P1-2)~~ — **CODE DONE 2026-07-15** (commit `88829e9`): dismissible localized banner on the nav screen when the background task status is `error` (snapshot re-read 5 s after mount + 30 s poll). Rides with the next app build. Same commit closes the **client half of #2**: `boundRoutePolyline6` (12k-point downsample) applied at all three geometry upload sites (trip_track, trip_share, route-share create).
7. **Record the end-action discriminator** (analytics): an explicit `end_action` (`saved`/`discarded`/`prompt_discarded`/`recovered`) on `trip_end` would make true loss measurable; consider a server-side stale-`in_progress` reaper.

## Notes
- The queue-audit agent reported a suspected prompt injection in a tool result mid-audit (a "date changed" system reminder plus MCP instructions). The session date did legitimately roll over during the audit window, so this was almost certainly the harness's own system-reminder, not an attack; no action taken beyond noting it.
- Score, focused scope: Recording 6/10 · Queue/sync 5/10 · Server persistence 6/10 · Recovery UX 3/10 → **overall 4/10 for "does GPS tracking work for all trips"** — the save path is solid; interrupted rides and edge-case sessions are where the data dies.
