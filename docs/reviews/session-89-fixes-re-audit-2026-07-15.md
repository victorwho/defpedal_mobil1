# Re-audit of the session-89 GPS/share fixes

Generated: 2026-07-15 (same day as the fixes)
Scope: adversarial review of commits `06cb647` (trips/track geometry defenses), `cf7c1a9` (resume three-way prompt), `31aea0d` (P0 auth/queue fixes), `629431f` (share-502 CSPRNG), `88829e9` (thinning/banner/client geometry), `d38e340` (sync backstop) — by 3 parallel reviewers instructed to refute each fix, plus orchestrator spot-checks.

## Verdict

The fixes' core logic held up — **no finding invalidated a fix's purpose** — but the re-audit caught **two real P1s in the new code** (both fixed same-day in `33e4da4`) plus a set of P2/P3s (fixed where cheap, tracked otherwise). The deployed server fixes (`06cb647`, `629431f`) were verified correct with no defects; the share CSPRNG fix came back completely clean.

## Findings fixed immediately (commit `33e4da4`)

| Sev | Finding | Fix |
|---|---|---|
| P1 | **Ride misattribution on real-account sign-out** — preserving queued trip mutations across a userId transition let a departing REAL account's fully-unsynced ride upload under the fresh anonymous user: silent, invisible (sync *succeeds*, just under the wrong owner), unrecoverable (anon merge is fresh-target-only), and a data-hygiene concern (GPS trail stranded on an orphaned identity). | `resetUserScopedState({ rideDataDisposition })`: previous session anonymous → `preserve` (same human, throwaway→throwaway); previous session a real account → `dead` — RideLossBanner surfaces the ride, and a post-sign-in retry attributes it to the correct account. `UserCacheResetBridge` already tracked the discriminator. |
| P1 | **"Save ride" dedup hole** — `closeInterruptedRide`'s already-queued-`trip_end` guard wrapped BOTH enqueues, so a stale prompt for a ride whose in-ride Discard had already queued a `trip_end` (kill inside `resetFlow`'s persist window) made "Save ride" enqueue **nothing**, while `resume_guard_outcome: 'save'` telemetry reported success. | Each mutation dedups independently; a `trip_end` dedup can no longer suppress the `trip_track` the user explicitly asked to save. Root enabler also fixed: `resetFlow` now calls `flushPersistedWrites()` (it was the one flow-state writer not force-flushing — stale NAVIGATING sessions on disk resurrected prompts for already-discarded rides). Regression test added. |
| P2 | **Stale banner flash** — the screen-off-recording banner trusted the snapshot's mount-time read, which races the async start attempt; a healthy ride could flash the previous ride's persisted `'error'` for up to 5 s. | Banner renders only from post-settle reads (`bgSnapshotSettled` gate). |
| P2 | **Unlogged native-4xx branch** (server, deployed) — before `06cb647` an oversized-body failure was a *logged* 500; after, an honest but *silent* 413. A client-side regression spraying bad bodies would be invisible (and `/v1/trips/track` wasn't in the request-telemetry allowlist either). | `request.log.warn({event:'native_4xx_error',…})` on the branch + `/v1/trips/track` added to `trackedOperationByPath`. Deployed. |
| P3 | **Double anonymous sign-in race** — profile's explicit post-sign-out `signInAnonymously()` racing the provider's retry loop could mint two anon users and double-fire the reset bridge. | `signInAnonymously` dedupes concurrent in-flight calls (module-level shared promise; unconfigured-client throw now resolves to null instead of rejecting fire-and-forget callers). |
| P3 | `routeGeometry.test.ts` contained stray NUL bytes — git treated the file as binary, killing diff reviewability. | NULs stripped; garbage-input literal replaced with plain ASCII. |
| — | `getMutationBackstopTimeoutMs` invariant claim was imprecise: `apiFetch`'s internal retries (up to 3 attempts/leg) + the 401-refresh re-issue can push one leg past a single nominal timeout, so the backstop can still fire on a technically-alive attempt under a sustained 5xx storm. | Accepted + documented in the code comment: costs one extra queue retry cycle (non-permanent error), never data loss; sizing for the ~3× worst case would make the backstop useless as a hang guard. |

## Tracked follow-ups (not fixed now)

- **P2 — unbounded queue growth if a device never obtains any session**: trip-critical types are eviction-exempt and the old `if (user)` gate was accidentally the growth bound. Requires a project-level failure (Supabase anon auth disabled / auth host blocked) that Diagnostics surfaces; ~150–250 KB per ride. Consider a coarse ceiling (e.g. dead-letter oldest ride beyond ~50 queued rides).
- **P2 — pre-auth body-parse cost on the three geometry endpoints**: auth + rate-limit run inside handlers, after Fastify parses/validates up to 8 MiB. Pre-existing pattern; `06cb647` widened `/trips/track`'s exposure ~8×. Proper fix: move auth/rate-limit to `preHandler` hooks (refactor, all three endpoints).
- **P2 — backstop doesn't cancel the underlying request**: a late success after a backstop failure plus the retry both succeeding double-fires `/trips/end`'s `qualifyStreakAsync` + `firePostRideEventsAsync`. DB writes are idempotent; verify the streak/nudge side effects are too.
- **P3 — pre-existing race in `mergeBackgroundBreadcrumbsIntoSession`**: session tail snapshot taken before an await; a concurrent foreground append can advance the true tail past the snapshot. Predates this session's changes.
- **P3 — `boundPlannedRoutePolyline`'s catch is dead code** (decodePolyline can't throw); harmless defensive.
- **P3 — nav-screen snapshot poll discards the hook's cancellation token** (benign under React 18).

## Verified correct (attack angles refuted with evidence)

- **Share CSPRNG fix (`629431f`)**: range strictly [0,1), no alphabet OOB, no entropy blocking, regression tests exercise the real production source. Zero defects.
- **Thinning + Doze redelivery ordering**: the feared out-of-order corruption can't reach the session trail — `mergeBackgroundBreadcrumbsIntoSession` filters to newer-than-tail and **sorts by timestamp before appending**; repeated thinning preserves chronological order and only ever *under*-estimates distance slightly.
- **Error-handler 4xx branch**: malformed-JSON SyntaxErrors (no `statusCode`) still fall to the generic 500; Supabase AuthError uses `.status` not `.statusCode`; every app-thrown 4xx is an `HttpError` handled earlier — no info-leak path found beyond native Fastify messages (accepted).
- **Dev-auth bypass** produces a real session — the new `hasSession` drain gate doesn't block it.
- **Anon retry loop**: no timer leak, no unhandled rejection (signInAnonymously never rejects), cancellation correct.
- **hasSession gate mid-flush**: at most one in-flight mutation completes after a sign-out; it either succeeds legitimately or 401s and dead-letters visibly.
- **Backstop math** (single-attempt model): 65 s > 30+30, 95 s > 30+60; `feedback` correctly excluded (map-only resolution).
- **Downsampled planned-route readers**: every reader null-guards and renders whatever resolution arrives; column nullable; privacy trimming not applicable (RLS-private table).
- **i18n parity**: compiler-enforced (`TranslationKeys = DeepStringify<typeof en>`), all 8 new keys present in en/ro/es.
- **Release commit `8829aed`**: whitespace-ignoring diff is exactly the version bump (the 276-line churn was CRLF normalization).

## Note on the reviewers' "prompt injection" reports

All three reviewers flagged suspected prompt-injection blocks in tool output (fake-looking "date changed" system reminders, MCP instructions for Clinical Trials / a design tool). These match the harness's own legitimate context injections for this environment — the session date really did roll over, and those MCP servers really are connected — so this is assessed as a false alarm, not an attack. No reviewer acted on the content.

## Score

Fixes as originally shipped: **6/10** (two P1s escaped into them). After same-day remediation (`33e4da4`): **9/10** — remaining items are tracked P2/P3 follow-ups, none data-loss.
