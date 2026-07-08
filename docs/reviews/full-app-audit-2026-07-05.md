# Defensive Pedal — Full Codebase Audit

**Generated:** 2026-07-05 · **Revised:** 2026-07-06 (rev 1) · **Fixes applied:** 2026-07-06 (rev 2), 2026-07-08 (rev 3)

> **Revision 3 (2026-07-08) — second fix pass ("best next bite").** Cleared the highest-leverage remaining backlog. Verified end-to-end: typecheck 0; core 762/762, mobile-api 535/535, mobile 1179/1179; lint 0; bundle 200.
>
> | Finding | Status | Notes |
> |---|---|---|
> | SCALE-7 (P1) | **FIXED + LIVE** | Migration `202607070001`: GiST on `trips.start_location` + btree `started_at`. `EXPLAIN` confirms `get_neighborhood_leaderboard` now index-scans (was seq-scan/view). |
> | SCALE-8 (P1) | **FIXED + LIVE** | Same migration: **expression** GiST on the hazards JSONB point. Both live RPCs (`get_nearby_hazards`, leaderboard hazards branch) share the exact expression, so ZERO RPC rewrites — `EXPLAIN` confirms `Index Scan using idx_hazards_location_geo`. Simpler than the audit's generated-column plan. |
> | SCALE-11 (P1) | **FIXED + LIVE** | Migration `202607070002`: retention batch 200→5000 + partial index; backlog already drained (0 rows) so pure future-proofing. |
> | INFRA-2 (P2) | **FIXED + LIVE** | Found **3** live `record_ride_impact` overloads (worse drift than suspected). Migration `202607070003` drops the 2 stale ones, re-creates the 11-param with a trip-ownership guard (`TRIP_NOT_OWNED`→403 in `v1.ts`); repo now matches live. |
> | PERF-4 (P2) | **FIXED** | Weekly-impact cron: 1+2N sequential queries → constant grouped queries (`loadWeekImpactByUser`/`loadSentCountsByUser`, 500-id chunks). New test file (2 tests). |
> | API-1 (P3) | **FIXED** | `elevationProfile` added to `routeOptionSchema` (was silently stripped). |
> | UX-14 (P3) | **FIXED + LIVE** | Master "Pedal nudges" opt-out full-stack: migration `202607070004` (`notify_pedal_nudges`), eligibility master gate (suppresses **every** trigger incl. P0s, +2 tests), profile PATCH/schema/contracts, mobile store + toggle row + en/ro/es. |
> | PERF-1 (P2) | **FIXED** | Mascot PNGs downscaled 1024-2194px → 360px master via `scripts/process-mascot-images.py`: **15MB → 1MB (92% smaller)**, filenames unchanged. |
> | PERF-5 (P3) | **FIXED** | `daily-weather-notification.ts` fetch now has AbortController + 10s timeout. |
> | QUAL-2 (P2) | **FIXED** | Overpass client trio → shared `createOverpassPointClient` factory (`overpassClient.ts`); the 3 files are thin wrappers, exports/signatures unchanged, existing 45 tests pass untouched. |
> | QUAL-5 (P3) | **FIXED** | `BadgeCard` wrapped in `React.memo` (last un-memoized list item). |
> | UX-4 (P3) | **FIXED** | Raw `error.message` replaced with localized copy on route-preview / navigation reroute / leaderboard (en/ro/es); raw still to Sentry. |
> | UX-12 (P3) | **FIXED** | Milestone share modal joined the celebration coordinator (`CelebrationKind` += `milestone`, lowest priority) so it no longer double-backdrops under root badge/rank-up overlays. |
> | UX-17 (P3) | **FIXED** | Shared `matchSavedPlaceKeyword` in core (en/ro/es synonyms, diacritic-insensitive, +5 tests) wired into both the route-planning fetch-suppression and the SearchBar row-injection so they can't drift. |
> | INFRA-3 (P3) | **FIXED** | Dockerfile pinned to `node:22-alpine@sha256:16e2…c3e2` (both stages). |
>
> **Assessed, deferred with reason:**
> - **INFRA-4 (P3, CI coverage gate):** dry-ran coverage — **core passes (92.96%)** but the **mobile-api coverage provider is broken** (`@vitest/coverage-istanbul@4.x` errors: missing `BaseCoverageProvider` export). Flipping a repo-wide `--coverage` CI gate now would RED the build, so per the audit's own "dry-run first" caution the gate is NOT wired. Fixing the provider version mismatch is a separate dependency-reconciliation task.
> - **UX-16 (P3, saved-places discoverability):** deferred — adding hint toasts, a clear-affordance, and long-press-to-remove is speculative gesture/UX redesign, not a mechanical fix; out of scope for a quick-win bite.
>
> **Still open (unchanged from rev 2):** ops items (Memorystore SCALE-1, Cloud Run flags SCALE-3, OSRM instance group SCALE-4 ops half, third-party plans SCALE-15/16/17, Supabase tier SCALE-20), L reworks (nudge cron SCALE-5/6, v1.ts split QUAL-1, RouteMap thumbnailMode PERF-2/3 mobile side), pre-100k checklist scalability P2s (SCALE-2/9/10/12/13/18/19), QUAL-3 (`as any`), QUAL-4 (dispatcher/HoloSticker tests), API-2, UX-6 (quiet-hours editor).
>
> **Deploy status (rev 3):** DB migrations `202607070001-04` all applied live; API code fixes (INFRA-2 403 map, PERF-4, API-1 schema, UX-14 gate) need a Cloud Run deploy to go live; mobile fixes need a new preview build. The DB-layer guards (ownership check, indexes, master-nudge column) are already live.

> **Revision 2 (2026-07-06) — fix application pass.** The following findings were FIXED in code, each verified by running the relevant test suite (final gate: typecheck 0 errors; core 757/757, mobile-api 531/531, mobile 1178/1178 tests green; lint ratchet clean; bundle check HTTP 200):
>
> | Finding | Status | Notes |
> |---|---|---|
> | SEC-1 (P1) merge replay | **FIXED + LIVE** | Migration `202607060001` applied to production DB (merged_at guard + advisory locks + write-time freshness re-check — also closes STATE-2); `account.ts` deletes the anon auth user post-merge. 4 new tests. |
> | SCALE-4 code part (P0) | **FIXED (code)** | `customOsrm.ts`: 8s `AbortSignal.timeout` + one jittered retry, 5xx-only. The ops half (managed instance group, LB, alerts, Mapbox fallback product decision) remains open. |
> | SEC-2 | **FIXED** | `follow` bucket (20/10min, env-tunable) + rate limits on all 4 follow handlers + 429 test. |
> | SEC-3 | **FIXED** | `write`-bucket limits on saved-routes ×3 + push-token ×2. |
> | SEC-4 | **FIXED (rate limit only)** | Both v2 react handlers throttled on the `write` bucket. `requireUser` deliberately KEPT: v1 reactions also admit anonymous sessions and the mobile like button has no 403 handling — tightening to `requireFullUser` would silently break anonymous likes. Auth tightening = product decision, still open. |
> | SEC-5 | **FIXED** | `sendDefaultPii:false` + `beforeSend` scrub (exported `scrubEventPii`, 3 tests); `app.ts` error context now path-only. |
> | SEC-6 | **FIXED** | CSPRNG (`crypto.randomInt`) injected at the API call site (core default untouched — browser-shared); IP-keyed limits on public lookup (30/min) + claim (10/min). |
> | SEC-7 | **FIXED** | pino `redact` on authorization/cookie header paths. |
> | STATE-1 | **FIXED** | Anon→real branch clears `pendingBadgeUnlocks`/`pendingTierPromotion`; routePreview survives. |
> | STATE-2 (P3) | **FIXED** | Covered by SEC-1's migration (advisory locks + conditional write). |
> | STATE-3 | **FIXED** | `resetUserScopedState` clears `savedPlaces` + `cachedCityHeartbeat`; regression test added. |
> | INFRA-1 | **FIXED** | `.github/dependabot.yml` (npm grouped minor/patch + docker + github-actions, weekly). |
> | UX-1/2/3 | **FIXED** | Error+retry states on Trophy Case, Trips, My Shares, City Heartbeat (raw error string removed); i18n en/ro/es. |
> | UX-5 | **FIXED** | Generic `deepLink` honor + `follow_request`/`weekly_summary`/`first_ride` cases; `type` discriminator added to all 4 first-ride server payloads. |
> | UX-7/8 | **FIXED** | `streakTier.*` namespace (en/ro/es) wired into StreakCard + StreakFlame; all 4 route-planning search placeholders + the hazard-describe block localized under `planning.*`. |
> | UX-9 | **FIXED** | Nav no-session fallback, StreakFlame labels, HoloSticker/Button/route-preview mode-pill a11y strings all through `t()` (en/ro/es). |
> | UX-10 | **FIXED** | HoloSticker tap-glare + drag-tilt gated on `useReducedMotion()`; tap-forwarding preserved. |
> | UX-11 | **FIXED** | `size="sm"` Button gets default hitSlop (~48dp effective). |
> | UX-13 | **FIXED** | Signup copy now promises continuity (en/ro/es); stale "no merge exists" comment replaced. |
> | UX-15 | **FIXED** | Alert Cancel → `t('common.cancel')`; suggestion a11y label localized + long-press save hint added. |
>
> Also fixed en route: **2 pre-existing test failures at HEAD** in `mapbox-routing.test.ts` (broken by the July-4 400km-guard commit `055e89a`, which shipped without a local test run — the pre-push hook covers only typecheck+lint): the cross-border fallback test now uses an under-400km pair (Bucharest→Sofia) and a new test pins the fail-fast rejection for >400km Mapbox-bound routes.
>
> **NOT applied (still open):** all ops/infra-console items (SCALE-1 Memorystore, SCALE-3 Cloud Run flags, SCALE-4 ops half, SCALE-15/16/17 third-party plans, SCALE-20 Supabase tier), the L-effort reworks (SCALE-5/6 nudge cron, QUAL-1 file splits, PERF-2 thumbnailMode), DB migrations needing `CREATE INDEX CONCURRENTLY` outside the migration runner (SCALE-7/8, SCALE-11 batch bump is trivial but retention loop is a scheduler change), INFRA-2 (needs a live `pg_get_functiondef` reconcile session), INFRA-3 (digest pin — pick digest at next deploy), INFRA-4 (coverage gate — dry-run first), remaining P2/P3s: PERF-1/3/4/5, QUAL-2/3/4/5, API-1/2, UX-4/6/12/14/16/17.
>
> **Deploy status (2026-07-06, end of day): everything shipped.** DB migration `202607060001` live; API fixes live on Cloud Run **`defpedal-api-00103-nhl`** (`/health` + `/health/deep` 200); mobile fixes in preview **v0.2.95 (build 98)** on Firebase `early-access-preview`; commits `eda1013` + `76aac08` + `4d2d168` on `main` with green CI and a green Vercel production deploy.
>
> **Post-ship addendum:** the INFRA-1 Dependabot config's first sweep surfaced a latent web bug the audit had not flagged — `apps/web/components/ShareMap.tsx` typed against the global `GeoJSON` namespace, which only compiled via the deprecated transitive `@types/mapbox-gl` stub; a mapbox-gl bump (Dependabot PR #41 preview) broke the build. Fixed in `4d2d168` (explicit `import type { Feature } from 'geojson'` + direct `@types/geojson` devDep). The sweep also proposed native-coupled bumps (expo-* SDK 57 majors, react-native 0.83→0.86 inside the "minor" group) that would break the Expo SDK 55 / RN 0.83 native builds — dependabot.yml now carries an `ignore` fence for all native-coupled packages and PRs #41–45 were closed (error-log #62).

> **Revision 1 (2026-07-06):** re-audited against commit `a479b4c` ("feat(search): Home/Work saved places + search UX fixes"), the only change since the original audit. Delta:
> - **UX-3 downgraded P2→P3** — City Heartbeat now persists `cachedCityHeartbeat` and uses TanStack `placeholderData`, so returning users see cached data instead of the error screen; the raw-error + no-retry dead-end now only affects first-ever loads.
> - **UX-8 confirmed still open** — the "Where to?" literal is unchanged, and the same screen has two more hardcoded placeholders ("Search a different start point", "Search for a stop"); finding broadened.
> - **4 new findings** in the saved-places feature: **STATE-3** (P2 — home/work addresses not cleared on sign-out/account switch), **UX-15/16/17** (P3 — hardcoded Cancel, dead-looking unset rows + undiscoverable long-press + no way to clear, English-only "home"/"work" keywords).
> - Counts updated: **P0 1 · P1 12 · P2 29 · P3 21 (63 findings)**. All other findings re-checked against the diff — unaffected.
**Scope:** Security, Infrastructure, Errors & Crashes, Data Integrity/State, Performance, Code Quality, API Contracts, UX & Accessibility, and — new to this audit — **Scalability at 10k / 100k / 500k users**.
**Method:** 5 parallel specialist review agents, each reading actual source files (every finding cites file:line). All P0/P1 findings from the prior review (`docs/reviews/full-app-review-2026-06-12.md`) were re-verified against current code first: **both June P0s and the entire ride-lifecycle/background-nav/offline-sync P1 cluster are confirmed genuinely fixed** — nothing from that report is re-listed here unless verified still open (marked STILL OPEN). Known-intentional decisions (CORS `*`, weather-ping drift, portrait lock on map screens, image-share URL handling, Android review prompt opening the Play listing) are excluded by design.

---

## How to use this document with a coding LLM

Each finding below is self-contained: severity, exact file:line, the problem, the concrete failure scenario, and **numbered implementation steps**. Feed one finding (or one phase from the Action Plan) at a time to the implementing LLM, together with this guardrail block:

> **Implementation guardrails (Defensive Pedal — read before touching code):**
> 1. Read `C:\dev\defpedal\.claude\CLAUDE.md` and `.claude\error-log.md` before any change.
> 2. **Fastify strips undeclared response fields silently.** Any new field returned by an API handler MUST be added to the JSON Schema `properties` (and `required` if always present) or it vanishes on the wire.
> 3. **RLS policies OR-combine.** A permissive policy without a `TO role` clause applies to PUBLIC and overrides owner-scoped policies. New policies must name their role. `service_role` bypasses RLS anyway.
> 4. **Migrations must be idempotent** (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`). `CREATE INDEX CONCURRENTLY` cannot run inside a transaction — put it in its own migration file/statement and be aware the Supabase migration runner wraps files in transactions (apply concurrent index builds via the SQL editor or a non-transactional path).
> 5. **Live-DB drift exists.** Before editing any Supabase RPC, pull the live definition first: `SELECT pg_get_functiondef('<fn>'::regproc);` — migration files are not always the truth (known: `get_neighborhood_safety_score`, `record_ride_impact`).
> 6. **Native modules:** never top-level `import * from 'expo-*'`; guard with `hasExpoNativeModule(name)` then lazy `require()`. Never check `NativeModules.Expo*` (undefined on bridgeless builds).
> 7. **Zustand persist:** any new trip-critical persisted field must call `flushPersistedWrites()` on change; state updates are immutable; UI state stays out of `partialize`.
> 8. **Mapbox layers:** always-render + filter/key-based hiding; never conditional mount/unmount; no emoji in SymbolLayer text; `*EmissiveStrength: 1` on overlays.
> 9. **i18n is tri-locale:** every new user-facing string needs keys in **en + ro + es** (`apps/mobile/src/i18n/`). Never hardcode UI strings.
> 10. **Verification gates before claiming done:** `npm run typecheck` (0 errors), `npm run check:bundle` (HTTP 200) after mobile changes, run the affected vitest suites, and never push with `--no-verify`.
> 11. Server deploys: `gcloud builds submit` only pushes the image — a `gcloud run deploy` is also required for a new revision.
> 12. Do exactly what the finding's fix steps say; where a step says "do NOT touch X", treat that as binding.

---

## Summary Scorecard

| Category | Score | P0 | P1 | P2 | P3 |
|----------|-------|----|----|----|----|
| Security | 7/10 | — | 1 | 4 | 2 |
| Infrastructure & DevOps | 7/10 | — | — | 2 | 2 |
| Errors & Crashes | 8/10 | — | — | — | — |
| Data Integrity & State | 7/10 | — | — | 2 | 1 |
| Performance | 7/10 | — | — | 4 | 1 |
| Code Quality | 6/10 | — | — | 3 | 2 |
| API Contracts | 8.5/10 | — | — | — | 2 |
| UX & Accessibility | 7/10 | — | — | 6 | 11 |
| **Scalability (10k–500k)** | **4.5/10** | **1** | **11** | **8** | — |
| **Overall** | **≈7/10 app health; 4.5/10 growth-readiness** | **1** | **12** | **29** | **21** |

**Headline:** correctness and security posture have improved dramatically since June — zero open crash/data-loss P1s, both prior privacy P0s verified closed, contract discipline nearly airtight. The exposure has shifted to two places: (1) a replayable **anonymous-account merge** that can clone XP/stats across accounts, and (2) the **scalability layer**, where the app is provisioned for a small user base — a single un-monitored OSRM VM behind an untimed fetch, dormant Redis, un-indexed PostGIS hot paths, an O(users) nudge cron, and third-party cost/quota cliffs.

**Growth-readiness verdicts:**
- **10k users — mostly OK, sharp edges:** OSRM (SCALE-4) and the nudge cron (SCALE-5/6) are the real risks.
- **100k users — not ready** without the index/Redis/cron/retention fixes (SCALE-1, 5–9, 11, 15, 16).
- **500k users — requires read-path re-architecture** (materialized rollups, read replicas, queue-based nudges, OSRM instance group, self-hosted weather/Overpass).

---

# P0 — Fix immediately

### [SCALE-4] OSRM is a single un-monitored VM per country with no failover, and the server fetch has no timeout/retry/circuit-breaker
- Severity: **P0** (breaks at ~10k users; partial-outage amplifier today)
- Layer: osrm / api
- File: `services/mobile-api/src/lib/clients/customOsrm.ts:60` (`const response = await fetch(url)` — no AbortSignal, no retry); infra: single GCP VM per country behind Caddy
- Threshold: ~10k users. Commute-hour concurrency (2–5k CPU-heavy previews with `alternatives=true&steps=true&annotations=true` in a 30-min window) saturates one VM; a single slow/hung OSRM then hangs Cloud Run workers because the fetch never aborts.
- Problem: Safe routing is the core product differentiator, and it runs on one VM per country with no autoscaling, no health-based failover, and no monitoring. The unbounded server-side fetch converts an OSRM slowdown into Cloud Run request pile-up → full-API brownout. (The client path in `mapbox-routing.ts` has a 15s timeout; the server path does not.)
- Fix (LLM-implementable + ops):
  1. Wrap the OSRM fetch in `AbortSignal.timeout(8000)` + one jittered retry; on failure fall back to Mapbox fast routing (already the cross-border fallback) with a user-facing banner.
  2. Put each OSRM behind a GCP managed instance group (min 2, autoscale on CPU) + internal LB with health checks; Caddy targets the LB.
  3. Add uptime + CPU/latency alerts on the OSRM VMs.
  4. Add a circuit breaker in `customOsrm.ts` (open after N consecutive failures → short-circuit to Mapbox fallback for a cool-down window).
  5. Verify: kill one backend; previews still succeed via the healthy backend/fallback within the timeout.
- Effort: L (step 1 alone is S and removes the brownout amplifier — ship it first)

---

# P1 — Fix before next release

### [SEC-1] Anonymous-account merge can be replayed to duplicate profile stats across multiple target accounts
- Severity: P1
- File: `supabase/migrations/202606140001_merge_anonymous_account.sql:86-113`, `services/mobile-api/src/routes/account.ts`
- Status: NEW
- Problem: `merge_anonymous_account` re-parents anonymous account A's data onto fresh target B, but never marks A as consumed. Row-level tables are *moved* (`UPDATE … WHERE user_id = p_anon_id`), so they can't move twice — but the final step is a straight **column copy** of A's `total_xp`, `total_co2_saved_kg`, `rider_tier`, etc. onto B, and A's profile numbers are never zeroed, so they remain copyable again.
- Failure scenario: A user rides anonymously (accumulating XP/CO2/badges), creates fresh account B1, merges. Keeping A's refresh token (their own device session), they mint a new access token, create fresh account B2, merge again — the profile-column copy still runs and duplicates A's totals onto B2 with zero underlying rides. Repeatable across arbitrarily many accounts → games the XP leaderboard, tier system, and CO2/impact stats.
- Fix (LLM-implementable):
  1. New migration: add `merged_at timestamptz` to `profiles`.
  2. Inside `merge_anonymous_account`, after the column-copy `UPDATE profiles t SET … FROM profiles a …` block, add `UPDATE profiles SET merged_at = now() WHERE id = p_anon_id;`.
  3. At the top of the function (before any re-parent UPDATEs), guard: `IF (SELECT merged_at FROM profiles WHERE id = p_anon_id) IS NOT NULL THEN RETURN jsonb_build_object('merged', false, 'reason', 'source_already_merged'); END IF;`.
  4. Stronger companion fix (do in addition, not instead): in `services/mobile-api/src/routes/account.ts`, after a successful `merged: true` RPC result, call `supabaseAdmin.auth.admin.deleteUser(anonUser.id)` (or invalidate its sessions) so the anonymous token cannot be reused at all.
  5. Do NOT touch the trip/table re-parenting UPDATEs — they are correct and idempotent-safe.
  6. Verify: extend `services/mobile-api/src/__tests__/account-merge.test.ts` — merge once (succeeds), merge again with the same anon token into a second fresh target; assert `reason: 'source_already_merged'` and second target's `total_xp` stays 0.
- Effort: S

### [SCALE-1] Rate limiter + route cache are per-process in-memory; Redis exists but is not activated
- Severity: P1 · Layer: api
- File: `services/mobile-api/src/lib/dependencies.ts:66-80`, `lib/rateLimit.ts:64-118`, `lib/cache.ts:35-76`, `config.ts:194-204` (REDIS_URL default `''`)
- Threshold: bites once Cloud Run runs >1 instance — routinely at ~10–30 req/s sustained (~5–15k DAU at commute peak). With 2–5 warm instances, every rate limit is effectively 2–5× looser and route-cache hit rate drops proportionally.
- Problem: Without `REDIS_URL`, every instance gets its own `Map` for rate-limit counters, the 45s route-response cache, and the Open-Meteo forecast cache. Horizontal scale-out silently multiplies rate limits (abuse protection erodes exactly when needed) and shreds cache hit rates, pushing load/cost onto OSRM/Mapbox/the risk RPC.
- Fix:
  1. Provision GCP Memorystore (Redis) in europe-central2.
  2. Set `REDIS_URL` (+ optional `REDIS_KEY_PREFIX`) on Cloud Run — `createRedisSharedStore` is already wired in `dependencies.ts:67`.
  3. Verify `redisStore.ts` implements both `rateLimiter` and `routeResponseCache` on one connection and `initialize()`/`dispose()` are covered by the `onReady`/`onClose` hooks (`app.ts:64-77`).
  4. Move the Open-Meteo cache (`clients/openMeteo.ts:49`) behind the same store, or accept per-instance duplication.
  5. Verify: with two instances, a user's 31st preview in a minute is 429'd regardless of which instance serves it.
- Effort: M

### [SCALE-3] Cloud Run: no min-instances (cold starts vs 8s client timeout), default concurrency, unbounded max
- Severity: P1 · Layer: api
- File: infra — `gcloud run` flags (not in repo); `cloudbuild.yaml:1-29` is build-only; client `DEFAULT_TIMEOUT_MS=8000` vs documented 15–25s cold starts
- Threshold: cold-start failures occur today; autoscaling headroom becomes the ceiling ~50–100k.
- Problem: Scale-to-zero means the first post-idle request eats a 15–25s cold start against an 8s client timeout (this already regressed trip sync once). Default concurrency 80 queues requests behind slow OSRM/DB; no max-instances bound on cost.
- Fix:
  1. `gcloud run services update defpedal-api --min-instances=1 --max-instances=<budget> --concurrency=40 --cpu=1 --memory=512Mi --timeout=30`.
  2. Raise min-instances to 2–3 as DAU grows.
  3. Optional: Cloud Scheduler warmup ping to `/health` every 5 min.
  4. Verify: p99 latency after 30 min idle < 2s.
- Effort: S

### [SCALE-5] `nudges/evaluate` cron is O(users) with ~10–15 serial Supabase round-trips + a serial Expo push per user, all in one request
- Severity: P1 · Layer: cron
- File: `services/mobile-api/src/routes/nudges.ts:272-403` (per-user loop), `lib/nudges/dispatcher.ts:147-188` (per-token serial send); Cloud Scheduler `nudges-evaluate-cron` `*/30`
- Threshold: ~1,000 candidate users/tick ≈ 300–450s of sequential work — exceeds the 300s Cloud Run timeout. Reachable at ~5–10k engaged installs.
- Problem: Fully sequential `for…await`; a mid-loop timeout leaves the tick half-processed (nondeterministic who got nudged). Push sends are one HTTP call per token — `sendBatchPushNotifications` is never used.
- Fix:
  1. Chunk: `/evaluate` takes an offset/cursor and processes N users per call, or shard by user-id hash across scheduler jobs.
  2. Parallelize per-user work with bounded concurrency (`p-limit`, 10–20).
  3. Precompute 24h push counts + last-nudge lookups in one grouped query per tick instead of per-user counts.
  4. Collect sent messages and flush via `sendBatchPushNotifications` (100/call).
  5. Verify: a 5,000-candidate synthetic run completes < 60s.
- Effort: L

### [SCALE-6] Cron candidate/pattern queries silently truncate at `.limit(1000)`/`.limit(5000)` with no ordering or pagination
- Severity: P1 · Layer: cron
- File: `services/mobile-api/src/routes/nudges.ts:744` (active streak), `:807`/`:851` (lost/lapsed), `:585` (recompute-pattern `.limit(5000)`)
- Threshold: 1,000 active-streak users (~10k installs with modest streak participation).
- Problem: Beyond the cap, an arbitrary unordered subset is processed; the rest are silently never nudged / never get a learned ride time. No cursor → the same arbitrary slice every tick.
- Fix:
  1. `order by user_id` + keyset pagination (`gt(last_id)`), loop until < limit rows — or shard by user-id hash across scheduler jobs.
  2. Combine with SCALE-5 chunking so a full pass completes across ticks.
  3. Verify: seed 3,000 active streaks; every eligible user appears in `nudge_log` within one scheduling window.
- Effort: M

### [SCALE-7] `trips.start_location` has no GiST index → leaderboard CO2 metric seq-scans all trips on every view
- Severity: P1 · Layer: db
- File: `supabase/migrations/202603010001_base_schema.sql:48-59` (no spatial index on trips); consumed by `202604140001_leaderboard.sql:158-164` (`ST_DWithin(t.start_location, v_point, radius)`)
- Threshold: ~25–50k total trips in a dense metro.
- Problem: The spatial predicate can't use an index, so each leaderboard view scans + spatially filters the whole trips table; the `'all'` period additionally has no date bound.
- Fix:
  1. `CREATE INDEX CONCURRENTLY idx_trips_start_location ON trips USING gist (start_location);` and `CREATE INDEX CONCURRENTLY idx_trips_started_at ON trips (started_at);` (respect guardrail #4 re: CONCURRENTLY and transactions).
  2. Rewrite the RPC to bbox-prefilter with `&&`/`ST_Expand` (mirror the live `get_neighborhood_safety_score` — pull live def first per guardrail #5).
  3. Verify: `EXPLAIN ANALYZE` shows Index Scan; < 50ms on a 1M-trip table.
- Effort: S

### [SCALE-8] `hazards.location` is JSONB, geography built on the fly → every hazard RPC seq-scans; navigation polls every 60s
- Severity: P1 · Layer: db
- File: `supabase/migrations/202603010001_base_schema.sql:84-105`, `202605040001_get_nearby_hazards.sql:65-72`, `202604140001_leaderboard.sql:184-191`, `202604080001_city_heartbeat.sql:96-103`; poller `apps/mobile/src/hooks/useNearbyHazards.ts:53` (`refetchInterval: 60_000`)
- Threshold: ~10k concurrent navigators (≈167 req/s to `/hazards/nearby`, each a full seq-scan) or a large active-hazard table.
- Problem: `get_nearby_hazards`, the leaderboard hazards branch, and city-heartbeat hotspots all compute `ST_MakePoint` from JSONB inside the WHERE, so `ST_DWithin` can never use a spatial index.
- Fix:
  1. `ALTER TABLE hazards ADD COLUMN location_geo geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint((location->>'longitude')::float8,(location->>'latitude')::float8),4326)::geography) STORED;` then `CREATE INDEX CONCURRENTLY idx_hazards_location_geo ON hazards USING gist (location_geo);`.
  2. Rewrite the three RPCs to filter on `location_geo` (pull live defs first — guardrail #5).
  3. Partial index for the hot predicate (`WHERE is_hidden = false AND expires_at > now()`).
  4. Consider a 90–120s or distance-gated client poll.
  5. Verify: `EXPLAIN ANALYZE get_nearby_hazards` uses the GiST index.
- Effort: M

### [SCALE-9] `get_city_heartbeat` runs 6 spatial aggregations per view, two unbounded over all-time `trip_shares`, no server-side caching
- Severity: P1 · Layer: db
- File: `supabase/migrations/202604080001_city_heartbeat.sql:24-135` (`totals` + `topContributors` have no date bound); client cache only (`useCityHeartbeat.ts:19`)
- Threshold: ~50–100k lifetime shared rides within one 15km radius.
- Problem: Lifetime totals/contributors re-aggregate the full radius history on every dashboard open; cost scales with cumulative community volume, not the 7-day window the screen mostly shows.
- Fix:
  1. Nightly rollup (`city_heartbeat_daily` keyed by coarse geohash) for lifetime totals/contributors; keep only today/7-day live.
  2. Cache the whole RPC in the shared store (SCALE-1) keyed by rounded lat/lon + radius, TTL 5–10 min.
  3. Ensure the `trip_shares.start_coordinate` GiST index (`202603260001:73`) is used after the rewrite.
  4. Verify: RPC < 100ms on a 2M-row `trip_shares` table.
- Effort: M

### [SCALE-11] GPS-trail retention truncates only 200 rows/day — cannot keep up with trip growth
- Severity: P1 · Layer: db
- File: `supabase/migrations/202604280001_retention_policies.sql:42-72` (`batch_size := 200`); cron `POST /v1/retention/truncate-gps` daily (`routes/retention.ts:60-113`)
- Threshold: > 200 trips/day crossing the 90-day mark (capacity ≈ 73k trips/year; ~2k trips/day at 20–50k active users produces a permanently growing backlog).
- Problem: `trip_tracks.gps_trail` is the highest-volume, most privacy-sensitive column. Beyond ~200 aging rows/day, storage bloats and the GDPR "storage limitation" commitment silently stops being met.
- Fix:
  1. Raise `batch_size` (e.g. 5,000) or have the scheduler loop the endpoint until `batchComplete = true` nightly (the flag already supports it).
  2. `CREATE INDEX CONCURRENTLY idx_trip_tracks_created_at ON trip_tracks (created_at) WHERE jsonb_array_length(gps_trail) > 0;`.
  3. Backfill: run the loop until drained once.
  4. Verify: no row older than 90d has a non-empty gps_trail (except opted-in users).
- Effort: S

### [SCALE-15] Mapbox called client-side (Directions, Search, Terrain-RGB, map loads) → per-user cost cliff
- Severity: P1 · Layer: third-party
- File: `apps/mobile/src/lib/mapbox-routing.ts`, `mapbox-search.ts`, `RouteMap.tsx`
- Threshold: ~25k MAU (Mapbox mobile SDK MAU free tier) and ~100k Directions/Search calls/month.
- Problem: All Mapbox usage is per-device, linear in users × engagement, with no aggregation. At 100k MAU, monthly cost runs low-to-mid four figures and climbs with engagement.
- Fix:
  1. Instrument per-feature Mapbox call counts so cost is projectable pre-cliff.
  2. Cache geocoding/search (consider a server proxy with shared cache for popular queries).
  3. Raise staleTime / dedupe Directions previews; reuse the safe-route cache.
  4. Negotiate a Mapbox commercial plan before 25k MAU; evaluate self-hosted tiles/geocoding for the 2 supported countries if volume justifies.
  5. Verify: per-MAU cost model with alerting at 60% of budget.
- Effort: M

### [SCALE-16] Open-Meteo free tier (client weather + server nudge safety-floor) will hit fairness limits
- Severity: P1 · Layer: third-party
- File: client `apps/mobile/src/hooks/useWeather.ts`; server `services/mobile-api/src/lib/clients/openMeteo.ts:88-141`
- Threshold: ~5–10k DAU (soft ~10k calls/day non-commercial tier; the weather widget is on the main screen and the daily notification also fetches).
- Problem: Exceeding fairness limits risks throttling/blocking of a core surface. The server cache is per-process (multiplies across instances — SCALE-1).
- Fix:
  1. Move to Open-Meteo commercial/self-hosted (API key) before ~10k DAU.
  2. Proxy weather through the API with a shared cache keyed by coarse lat/lon + hour so N devices in a city share one upstream call.
  3. Verify: upstream call rate stays well under the tier limit as DAU grows.
- Effort: M

### [SCALE-20] Supabase plan ceilings (pooler connections, compute, egress) are the ultimate backstop
- Severity: P1 · Layer: db
- File: infra — all DB access via PostgREST/Supabase; heavy egress from SCALE-14, heavy CPU from SCALE-7/8/9/13
- Threshold: ~50–100k users.
- Problem: Every workload lands on one Supabase Postgres. Without the indexing, caching, and egress fixes, the compute/connection/egress ceiling arrives as a wall, not a curve.
- Fix:
  1. Land the index + caching fixes first (removes most load).
  2. Right-size the Supabase compute tier; enable the pooler in transaction mode; set PostgREST `db-pool` appropriately.
  3. Add read-replica routing for read-heavy social RPCs when available.
  4. Alert on Supabase CPU, connection saturation, and egress at 60%.
  5. Verify: load test at target RPS stays under 70% compute/pool utilization.
- Effort: M

---

# P2 — Fix when convenient

## Security

### [SEC-2] Follow/unfollow/approve/decline endpoints have no rate limiting
- File: `services/mobile-api/src/routes/follow.ts:32-247` (all four handlers) · Status: STILL OPEN
- Problem: All four require a full account (`requireFullUser`) but nothing bounds call frequency.
- Failure scenario: One account mass-follows every enumerable user (via `/feed/suggested-users`), spamming follow-request pushes in seconds, or follow/unfollow-cycles to manipulate visibility.
- Fix: 1) Import rate limiting as in `v1.ts:130`/`leaderboard.ts:47`; call it right after `requireFullUser` in all four handlers with a new `follow` bucket (e.g. 20 req / 10 min). 2) Add `RATE_LIMIT_FOLLOW_MAX`/`RATE_LIMIT_FOLLOW_WINDOW_MS` to `config.ts` `rateLimits` following the `citySuggestion` pattern. 3) Test: assert 429 after N+1 calls (clone the citySuggestion rate-limit test).
- Effort: S

### [SEC-3] saved-routes and push-token write endpoints have no rate limiting
- File: `services/mobile-api/src/routes/v1.ts:3325` (POST /saved-routes), `:3370` (DELETE), `:3391` (PATCH use), `:1482` (PUT /push-token), `:1541` (DELETE /push-token) · Status: STILL OPEN
- Problem: Five write handlers in a file where the rate-limit pattern is otherwise applied consistently.
- Failure scenario: Unbounded `POST /saved-routes` row accumulation; push-token upsert churn wasting the shared Expo push-send quota.
- Fix: 1) Add `await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });` immediately after `requireWriteUser` in each of the five handlers (exact one-liner used at `v1.ts:405`, `:438`). Reuses the existing `write` bucket; no new config. 2) One 429-assertion test per endpoint; run `npm test --workspace @defensivepedal/mobile-api`.
- Effort: XS

### [SEC-4] v2 reaction endpoints allow anonymous callers with no rate limiting
- File: `services/mobile-api/src/routes/activity-feed.ts:128-237` (POST `/v2/feed/:id/react`, DELETE `/v2/feed/:id/react/:type`) · Status: STILL OPEN (worse variant: anonymous + unlimited)
- Problem: Both handlers use `requireUser` (admits anonymous sessions) and no rate limiter — the sibling comment endpoint in the same file was already fixed to `requireFullUser` + a `comment` bucket.
- Failure scenario: A script creates unlimited anonymous sessions and spams `activity_reactions` upserts for any `activity_id`, inflating like counts app-wide (`get_ranked_feed` scoring uses `like_count`) with unbounded DB write load.
- Fix: 1) Change `requireUser` → `requireFullUser` on both handlers (matches the comment endpoint's precedent and `feed-helpers.ts:14-17`'s stated rationale). 2) Add rate limiting via `dependencies.rateLimiter.consume` right after auth (reuse `write` or the new `follow` bucket). 3) Before shipping, check `LikeButton.tsx`/`useFeed.ts` for an anonymous-reaction UX dependency — if anonymous reactions are intentional, still add the rate limit.
- Effort: S

### [SEC-5] Sentry has no PII scrubbing; raw request URLs (including GPS querystrings) are captured
- File: `services/mobile-api/src/lib/sentry.ts:27-40`, `services/mobile-api/src/app.ts:169-174, 188-191` · Status: NEW
- Problem: `Sentry.init` has no `beforeSend` and no explicit `sendDefaultPii: false`; the global error handler attaches the full raw URL (with querystring) on every 5xx. Location-bearing GET endpoints (`/hazards/nearby`, `/risk-map`, `/neighborhood-safety-score`) take `lat`/`lon` in the querystring.
- Failure scenario: A 5xx on a location endpoint ships raw rider GPS + user id into a third-party SaaS — inconsistent with the app's otherwise careful location-privacy posture (hide_endpoints, quantized risk scores).
- Fix: 1) In `sentry.ts`, add `sendDefaultPii: false` and a `beforeSend(event)` that strips querystrings from `event.request?.url` and any `extra.url` (reuse the `split('?')[0]` approach from `lib/telemetry.ts:12`). 2) In `app.ts:173` and `:190`, replace `url: request.raw.url ?? request.url` with a path-only helper. 3) Don't change `statusCode`/`code`/`method` fields. 4) Unit test: `beforeSend` strips `?lat=44.4&lon=26.1` from sample event URL fields.
- Effort: S

## Infrastructure

### [INFRA-1] No automated dependency-update tooling (no Dependabot/Renovate)
- File: `.github/` (no `dependabot.yml`) · Status: NEW
- Problem: `npm run audit:ci` catches new advisories on installed versions but nothing proactively bumps; stale-but-unflagged versions sit indefinitely.
- Fix: 1) Add `.github/dependabot.yml` (`version: 2`), npm ecosystem at `/` (workspaces resolve through the root lockfile), weekly, `open-pull-requests-limit: 5`. 2) Group patch/minor (`groups:`); leave majors individual given Expo/RN upgrade sensitivity. 3) Add a `docker` ecosystem entry for `services/mobile-api/` (pairs with INFRA-3). 4) Verify via GitHub's Dependabot tab.
- Effort: XS

### [INFRA-2] `record_ride_impact` RPC migration file doesn't match its live call signature — ownership behavior unverifiable from repo
- File: `supabase/migrations/202604030001_habit_engine_foundation.sql:324-352` (3 params) vs `services/mobile-api/src/routes/v1.ts:2207-2219` (calls with 9+ named params) · Status: NEW (same drift class as `get_neighborhood_safety_score`)
- Problem: The live function was altered without a migration. The handler never verifies the `tripId` URL param belongs to the caller before passing both to the RPC, and the repo can't show whether the live function does.
- Failure scenario: If the live function lacks an ownership check, `POST /v1/rides/:tripId/impact` with another user's tripId writes a polluting/double-counting `ride_impacts` row (data-integrity, not privilege escalation).
- Fix: 1) Pull the live def: `SELECT pg_get_functiondef('record_ride_impact'::regproc);` and write a reconciling migration with `CREATE OR REPLACE FUNCTION` matching it exactly. 2) While reconciling, add `IF NOT EXISTS (SELECT 1 FROM trip_tracks WHERE trip_id = p_trip_id AND user_id = p_user_id) THEN RAISE EXCEPTION 'TRIP_NOT_OWNED' USING ERRCODE='P0001'; END IF;` before the INSERT; map that error to 403 in `v1.ts:2207`. 3) Do NOT touch the distance/elevation/wind/temp bounds at `v1.ts:2107-2117` (already correct). 4) Verify: re-run `pg_get_functiondef`; migration and live now match.
- Effort: M (needs live-DB access)

## Data Integrity & State

### [STATE-1] Anonymous session's pending badge/tier celebrations leak into the next signed-in account
- File: `apps/mobile/src/providers/UserCacheResetBridge.tsx:80-83`; consumers `BadgeUnlockOverlay.tsx:325-357`, RankUpOverlayManager in `app/_layout.tsx:404-420` · Status: NEW
- Problem: The anon→real sign-in branch deliberately skips `resetUserScopedState()` (to preserve routePreview through onboarding) but thereby also skips clearing `pendingBadgeUnlocks`/`pendingTierPromotion`, which drive globally-mounted celebration overlays.
- Failure scenario: Anonymous rider earns a badge/tier that queues but hasn't popped; they sign into an ESTABLISHED account (merge correctly skips, `target_not_empty`); later the established account sees a full-screen "Badge Unlocked!"/rank-up for the anonymous session's achievement.
- Fix: 1) In the `previousIsAnonymous && !isAnonymous` branch (~line 80), add `useAppStore.getState().clearBadgeUnlocks()` and `useAppStore.getState().clearTierPromotion()` alongside `queryClient.invalidateQueries()` (both setters already exist). 2) Optionally clear `cachedImpact`/`cachedStreak`/`earnedMilestones` too (no current reader, cheap insurance). 3) Regression test: anon→real transition resets those fields to empty/null while `routePreview`/`routeRequest` remain untouched (must not regress the branch's original purpose). 4) `npm run typecheck`, run the test file, `npm run check:bundle`.
- Effort: XS

### [STATE-3] Saved Home/Work addresses are not cleared on sign-out / account switch
- File: `apps/mobile/src/store/appStore.ts:974-1001` (`resetUserScopedState` — no `savedPlaces` entry) vs `:470-472` (setter), `:1171` (persisted in `partialize`) · Status: NEW (introduced by commit `a479b4c`, 2026-07-06)
- Problem: The new `savedPlaces` slice stores the rider's full Home and Work addresses (`AutocompleteSuggestion` with label + precise coordinates) and is persisted, but `resetUserScopedState` — which deliberately clears the equivalent user-scoped location data (`recentDestinations`, `homeLocation`, `recentCitySuggestions`) — was not updated to clear it. The sibling field added in the same commit, `cachedCityHeartbeat`, is also not reset (lower stakes: it's city-wide community data, but `cachedStreak`/`cachedImpact` in the same class are reset).
- Failure scenario: User A saves Home/Work, signs out (or the device switches accounts). User B signs in on the same device, taps any search field, and sees User A's home and work addresses as quick-pick rows — a device-local privacy leak of the two most sensitive locations the app ever handles, on an app that elsewhere trims share endpoints specifically to hide home locations.
- Fix (LLM-implementable):
  1. In `resetUserScopedState` (appStore.ts:974-1001), add `savedPlaces: { home: null, work: null },` and `cachedCityHeartbeat: null,` to the reset object (alongside the existing `homeLocation: null` / `recentDestinations: []`).
  2. Add a regression test asserting `resetUserScopedState()` clears both fields (mirror the existing recentDestinations reset test if present).
  3. Check `UserCacheResetBridge.tsx`'s anon→real branch (see STATE-1): saved places SHOULD survive that specific transition (same person, same device) — only the full `resetUserScopedState` path (sign-out/different-account) must clear them. No change needed there; just don't "fix" it by clearing in both places.
  4. Verify: `npm run typecheck`, run the store test file, `npm run check:bundle`.
- Effort: XS

## Performance

### [PERF-1] Mascot PNGs still shipped at full source resolution
- File: `apps/mobile/assets/mascot/*.png` (e.g. 1755×2194) rendered at 28–120px via `Mascot.tsx` in 25 files · Status: STILL OPEN (June)
- Impact: several MB RAM per decoded image.
- Fix: 1) Add `scripts/process-mascot-images.py` mirroring `scripts/process-holo-badges.py`. 2) Resize each pose to a 360px master, filenames identical. 3) `npm run check:bundle` to confirm.
- Effort: S

### [PERF-2] Feed cards mount the full 12-layer Mapbox stack for a decorative thumbnail
- File: `FeedCard.tsx:199-206`, `ActivityFeedCard.tsx:450`, `map/RouteMap.tsx:1-16` · Status: STILL OPEN (partially mitigated — viewability gating limits it to 2-3 visible cards)
- Fix: 1) Add a `thumbnailMode` boolean prop to RouteMap that short-circuits POI/hazard/feature layers (respect always-render+filter conventions for the layers kept). 2) Pass `thumbnailMode` from FeedCard + ActivityFeedCard. 3) Keep the viewability gate. 4) Verify feed still renders route lines.
- Effort: M

### [PERF-3] GET /v1/trips/history ships full GPS breadcrumb trails for a list view
- File: `services/mobile-api/src/lib/submissions.ts:373-419`; consumer `apps/mobile/app/trips.tsx:44,80` · Status: STILL OPEN (also SCALE-14: egress cost)
- Impact: 0.5–4 MB JSON per History load; tens of TB/month egress at 100k users.
- Fix: 1) Add pure `decimatePoints(points, maxCount)` helper in `packages/core`. 2) Apply it to `gps_trail` in `getTripHistory` before mapping to `gpsBreadcrumbs` (list thumbnails need ~100 points). 3) Prefer `planned_route_polyline6` for thumbnails when present. 4) Keep full-resolution trail only on `trip/[id].tsx` detail (add `GET /v1/trips/:id/track` if needed). 5) Test in `submissions.test.ts` asserting the cap; remember Fastify schema alignment (guardrail #2) if response shape changes.
- Effort: M

### [PERF-4] Weekly impact summary cron does two unbounded, unbatched N+1 queries per user
- File: `services/mobile-api/src/lib/scheduledNotifications.ts:44-80` · Status: NEW
- Impact: 1 + 2N sequential Supabase round-trips per weekly run.
- Fix: 1) Replace the per-user ride check with one grouped query for all candidates. 2) Batch `isUnderWeeklyCap` with one `notification_log` query using an IN filter. 3) Keep per-user `dispatchNotification` sequential/rate-limited. 4) Regression test with 50+ mock users asserting constant query count.
- Effort: S

## Code Quality

### [QUAL-1] File-size cap violations growing: 13 files > 800 lines
- Files: `routes/v1.ts` 3745 (↑41 since June), `route-planning.tsx` 2089 (newly flagged; ↑21 in rev 1's commit `a479b4c`), `navigation.tsx` 1617, `profile.tsx` 1493, `route-preview.tsx` 1255, `appStore.ts` 1188 (↑18 in `a479b4c`), `contracts.ts` 1167, `http.ts` 1052, `nudges.ts` 1011, `ActivityFeedCard.tsx` 1002, `feedback.tsx` 982, `diagnostics.tsx` 978, `trip/[id].tsx` 823 · Status: STILL OPEN, worsening
- Fix: 1) Split `v1.ts` by domain into `routes/v1/` files, incrementally. 2) For `route-planning.tsx`, extract the search/autocomplete block and the offline-resume-card block into components. 3) File-by-file, with typecheck + full test suite green as the acceptance gate per commit.
- Effort: L (incremental)

### [QUAL-2] Overpass client trio remains ~90% duplicated
- Files: `bicycle-parking.ts` (83 lines), `bicycle-rental.ts` (114), `bicycle-shops.ts` (82) · Status: STILL OPEN
- Fix: 1) Extract `createOverpassPointClient` factory in `apps/mobile/src/lib/overpassClient.ts` (computeBbox, fetch/timeout/error handling, query template). 2) Make the three files thin wrappers with their tag filter + parser. 3) Keep exported names/signatures unchanged (no call-site edits). 4) Existing tests pass unmodified as the regression gate.
- Effort: S

### [QUAL-4] Test-coverage gap: nudge delivery code and complex UI components have zero tests
- Files: `lib/nudges/dispatcher.ts`, `eventFirer.ts` (only untested nudges-lib files); `HoloSticker.tsx` (527 lines), `useHoloTilt.ts`; organisms `achievements.tsx`, `ActivityFeedCard.tsx`, `EarlyEndReasonModal.tsx`, `MeetPedalCard.tsx`, `CitySuggestionSheet.tsx`, `RankUpOverlay.tsx`, `TierRankCard.tsx` · Status: NEW (consolidated)
- Problem: Decision logic is well tested; the side-effecting delivery code and gesture/sensor-heavy components are not.
- Fix: 1) Prioritize `dispatcher.ts`/`eventFirer.ts`: mock fetch + Supabase, assert Expo Push payload shape and `nudge_log` writes on success/failure/429. 2) HoloSticker/useHoloTilt: render test asserting no crash without gyro (module absent) and claim/release toggling, mirroring `StreakFlame.test.tsx`. 3) Organism screens opportunistically alongside future changes.
- Effort: M

## UX & Accessibility

### [UX-1] Trophy Case shows the "no badges yet" empty state on a failed badge load
- File: `apps/mobile/app/achievements.tsx:162` · Status: NEW
- User impact: a rider with dozens of badges hits a network blip and sees "No badges yet — go for a ride." Indistinguishable from data loss, on a core retention surface.
- Fix: 1) Destructure `isError, refetch` from `useBadges()`. 2) Add an error branch before the FlatList mirroring `community-feed.tsx:281-289` (icon + message + retry → `void refetch()`). 3) i18n keys (en/ro/es): `achievements.loadFailed` = "Couldn't load your badges" (ro "Nu am putut încărca insignele", es "No pudimos cargar tus insignias"); `achievements.loadFailedSub` = "Check your connection and try again" (ro "Verifică conexiunea și încearcă din nou", es "Revisa tu conexión e inténtalo de nuevo"); reuse `common.retry`.
- Effort: S

### [UX-2] Trips history + My Shares error states are dead-ends (no retry)
- File: `apps/mobile/app/trips.tsx:215-218`; `apps/mobile/app/my-shares.tsx:244-247` · Status: STILL OPEN
- Fix: In each error branch add a retry Button calling `() => void refetch()` (trips) / `() => void query.refetch()` (my-shares); reuse `common.retry`. The pattern already exists at `community-feed.tsx:286`.
- Effort: XS

### [UX-5] Several notification taps dead-end — unhandled `data.type` / missing discriminator
- File: `apps/mobile/src/lib/push-notifications.ts:132,186`; senders `follow.ts:126`, `scheduledNotifications.ts:198`, `firstRideNotifications.ts:136,172,198,232`, `ambassadorRewards.ts:103,178` · Status: STILL OPEN + NEW
- Problem: `follow_request` (has type, no case), `weekly_summary` (has type+screen, no case), 4 first-ride templates (no `type` at all), ambassador `referral`/`referral_view` (no `type`, but ships `deepLink:'/my-shares'`) — all dead-end on tap.
- User impact: the highest-intent re-engagement moments (new follower, weekly recap, "we miss you", "your share converted a friend") cold-open the app nowhere useful.
- Fix: 1) Near the top of the switch: `if (typeof data.deepLink === 'string') { router.push(data.deepLink); return; }`. 2) Add cases `follow_request` (→ follow-requests surface), `weekly_summary` (→ `router.push(data.screen ?? '/impact-dashboard')`), `first_ride` (→ `/route-planning`). 3) In `firstRideNotifications.ts` add `data: { type: 'first_ride', screen: 'route-planning' }` to each `dispatchNotification` call. 4) Optional: route community like/comment to `community-trip?id=<tripShareId>` instead of the generic feed. 5) Follow the CLAUDE.md new-notification checklist (every payload carries `type`; handler case per type).
- Effort: S

### [UX-6] Quiet hours displayed but not editable — permanently stuck at 22:00–07:00
- File: `apps/mobile/app/profile.tsx:743-751`; `appStore.ts:601` (`setQuietHours`, no UI caller) · Status: STILL OPEN (June P2)
- User impact: shift workers/students get pinged during sleep or silenced while awake; the clock-icon row looks editable but does nothing.
- Fix: 1) Wrap the row in a `Pressable` opening start/end time pickers (`@react-native-community/datetimepicker`, two spinners). 2) On confirm: `setQuietHours(start, end)` then `syncNotifPref({ quietHoursStart, quietHoursEnd })` (sync path already forwards these). 3) Add an "off" affordance (clear both → server treats null as no quiet hours, `notifications.ts:44`). 4) i18n keys `profile.quietHoursStart/End/Off` en/ro/es.
- Effort: M

### [UX-7] StreakCard renders the streak-tier name in hardcoded English
- File: `StreakCard.tsx:57` (source `packages/core/src/streakTiers.ts:76-128`); also `impact-dashboard.tsx:235` · Status: STILL OPEN
- Fix: 1) Add a `streakTier.*` i18n namespace keyed by `StreakTierId` en/ro/es (e.g. ro `streakTier.commute` = "Obicei de navetă", es "Hábito de trayecto"). 2) Replace `{tier.label}` with `t(\`streakTier.${tier.tier}\`)` in StreakCard + impact-dashboard. 3) Apply the same lookup in StreakFlame (see UX-9) so atom and organism agree.
- Effort: S

### [UX-8] Route-planning search placeholders are hardcoded English (3 fields)
- File: `apps/mobile/app/route-planning.tsx:1095` ("Where to?" / offline variant), `:1032` ("Search a different start point"), `:1146` ("Search for a stop") · Status: STILL OPEN — re-verified after commit `a479b4c` (2026-07-06), which touched adjacent lines but left all three literals; line numbers updated, finding broadened to the start-override and waypoint placeholders
- Fix: Add en/ro/es keys and replace the literals with `t(...)`: `routePlanning.searchPlaceholder` = "Where to?" (ro "Unde mergem?", es "¿A dónde vamos?"); `routePlanning.searchPlaceholderOffline` = "Connect to internet to search" (ro "Conectează-te la internet pentru a căuta", es "Conéctate a internet para buscar"); `routePlanning.searchStartPlaceholder` = "Search a different start point" (ro "Caută alt punct de plecare", es "Busca otro punto de partida"); `routePlanning.searchStopPlaceholder` = "Search for a stop" (ro "Caută o oprire", es "Busca una parada").
- Effort: XS

## Scalability (P2 tier — bites above ~100k or degrades gradually)

### [SCALE-2] Every authenticated request makes a GoTrue HTTP round-trip to verify the JWT
- File: `services/mobile-api/src/lib/auth.ts:74-86` · Threshold: ~50–100k
- Fix: 1) Verify the Supabase JWT locally (`jose`) — exp/aud/iss, extract sub/email. 2) Keep `getUser` as fallback/revocation-sensitive path. 3) Cache verified-token→user 30–60s in the shared store (SCALE-1). 4) Verify: valid token authorizes with zero outbound calls.
- Effort: M

### [SCALE-10] `get_neighborhood_leaderboard` ranks the entire qualifying set before slicing top-50; settlement runs globally
- File: `202604140001_leaderboard.sql:198-205`; `routes/leaderboard.ts:334-341` (radius 50,000km = global), `:357-438` (per-row XP/badge round-trips) · Threshold: >100k
- Fix: 1) After SCALE-7's index, add a pre-aggregated per-user/per-period totals table so ranking operates on aggregated rows. 2) Bulk-insert snapshots and batch XP awards in settle. 3) Verify settle completes within its weekly window at 100k users.
- Effort: M

### [SCALE-12] Append-only tables with no retention: `nudge_log`, `notification_log`, `activity_feed`, `rider_xp_log`, `leaderboard_snapshots`
- Threshold: `nudge_log` alone ≈ 480k rows/day at 5k candidates (suppressed rows are logged every 30-min tick) → ~175M rows/year, scanned by every dedup COUNT.
- Fix: 1) Retention cron: delete `nudge_log`/`notification_log` > 90 days; roll `rider_xp_log` into `profiles.total_xp` and delete detail > N months. 2) `CREATE INDEX CONCURRENTLY idx_nudge_log_user_trigger_created ON nudge_log (user_id, trigger_id, created_at DESC);`. 3) Verify dedup COUNTs stay index-only at 10M rows.
- Effort: M

### [SCALE-13] `get_segmented_risk_route` runs a per-segment correlated KNN over 6.15M rows per uncached preview
- File: `202603170001_get_segmented_risk_route.sql:20-39`; cache per-instance only · Threshold: >100k (sooner as instances multiply)
- Fix: 1) Activate the shared route cache (SCALE-1). 2) Batch per-segment lookups into one `LATERAL` + `<->` KNN query instead of a correlated subquery. 3) Consider grid-snapping to raise cache hits. 4) Verify: 15km-route enrichment < 150ms, cache hit > 80% under load.
- Effort: M

### [SCALE-14] Trip history egress (same code as PERF-3, cost lens)
- 50 trips × ~40KB ≈ 2MB per History load → tens of TB/month at 100k users. Fix via PERF-3.

### [SCALE-17] Overpass public API is rate-limit/ban-prone at volume
- File: `bicycle-parking.ts`, `bicycle-rental.ts`, `bicycle-shops.ts` · Threshold: gradual
- Fix: 1) Self-host Overpass (or bake a pre-extracted parking/rental/shops layer into own tiles) for the 2 countries. 2) Server-side cache if proxied. (Pairs with QUAL-2's client consolidation.)
- Effort: M

### [SCALE-18] Expo push receipt-checking not wired → dead tokens accumulate; Expo throttles high-error senders
- File: `services/mobile-api/src/lib/push.ts:151-198` (`checkReceipts` exists, uncalled) · Threshold: >100k or sooner with churn
- Fix: 1) Persist `expo_ticket_id`→token at send (column exists on `nudge_log`, or add a `push_tickets` table). 2) Cron ~30 min post-send calls `checkReceipts`, deletes dead tokens from `push_tokens`. 3) Batch cron sends via `sendBatchPushNotifications` (with SCALE-5). 4) Verify `push_tokens` tracks real active devices.
- Effort: M

### [SCALE-19] Global `QueryClient` has no default options → refetch/retry thundering herds
- File: `apps/mobile/src/providers/AppProviders.tsx:19` · Threshold: any coordinated event at ~50–100k users
- Fix: 1) `defaultOptions.queries`: `retry: (n,e) => n < 3 && !is4xx(e)`, jittered `retryDelay: a => Math.min(1000*2**a, 30000) * (0.5 + Math.random())`, global `staleTime` ~30s. 2) Disable `refetchOnWindowFocus` for expensive queries. 3) Add jitter to the offline-drain reconnect flush (`OfflineMutationSyncManager.tsx:350`). 4) Verify simulated mass-reconnect arrivals are spread, not spiked.
- Effort: S

---

# P3 — Track for later

## Security & Infrastructure
- **[SEC-6] Route-share codes use `Math.random()`; public lookup/claim endpoints unthrottled** — `packages/core/src/shareCodeGenerator.ts:51-59`, `routes/route-shares.ts:164-339`. 62^8 keyspace makes brute force impractical (defense-in-depth item). Fix: inject `crypto.randomInt` as `randomSource` from `routeShareService.ts:338` (don't change the browser-shared core default); add IP-keyed rate limits to public GET + claim POST (pattern at `route-shares.ts:470-478`). Effort: S
- **[SEC-7] pino has no redact config** — `app.ts:24-28`. Fix: `logger: { level: config.logLevel, redact: { paths: ['req.headers.authorization','headers.authorization','*.headers.authorization','req.headers.cookie'], censor: '[REDACTED]' } }`. Effort: XS
- **[INFRA-3] Dockerfile floating base tag** — `Dockerfile:1,20`. Fix: pin both `FROM` lines to `node:22-alpine@sha256:<digest>`; pair with INFRA-1's docker ecosystem entry; verify `gcloud builds submit` still succeeds. Effort: XS
- **[INFRA-4] CI never runs tests with coverage** — `ci.yml:53-61`. Fix: per-workspace `test:coverage` script (`vitest run --coverage`) + CI step; dry-run locally first to confirm current coverage passes thresholds before making it a gate. Effort: S

## Data Integrity
- **[STATE-2] `merge_anonymous_account` fresh-target check has a TOCTOU window under READ COMMITTED** — `202606140001:38-44` vs `:86-113`. Guard SELECTs and the profile-overwrite UPDATE get separate snapshots; a concurrent commit to the target between them is silently clobbered. Low practical likelihood today, structural risk as signup bonuses/first-ride awards get added. Fix (simplest): `SELECT pg_advisory_xact_lock(hashtext(p_target_id::text));` at function entry; or condition the final UPDATE's WHERE on the row still being fresh; document the invariant. Effort: S

## Performance & Quality
- **[PERF-5] One fetch without timeout/AbortController** — `daily-weather-notification.ts:32`. Fix: wrap with the AbortController + 10s timeout pattern from `weather.ts`. Effort: XS
- **[QUAL-3] 74 `as any` casts, unchanged since June** — top: `HazardLayers.tsx` (16), `RouteFeatureLayer.tsx` (9), `profile.tsx` (8), `navigation-helpers.ts` (5). Fix: shared `MapboxExpression` type alias for layer expressions; audit profile/navigation-helpers casts individually. Effort: M
- **[QUAL-5] BadgeCard not memo-wrapped** — `BadgeCard.tsx:36` (only non-memo list item; wraps heavy HoloSticker). Fix: wrap export in `React.memo`. Effort: XS

## API Contracts
- **[API-1] `routeOptionSchema` omits `elevationProfile`** — `http.ts:320-382` vs `normalize.ts:66`. Dormant (mobile fetches routes client-side; elevation comes from `POST /v1/elevation-profile`), but a latent Gotcha-#9 trap for any future server-preview consumer. Fix: add `elevationProfile: { type:'array', items:{ type:'number' } }` to properties (optional, no `required` change). Effort: XS
- **[API-2] `PATCH /v1/profile` accepts notification prefs but never returns them** — `feed-profile.ts:65-78` vs `:102-131`. Internally consistent today (prefs are device-local); if server-authoritative prefs are ever wanted, add columns to the `.select()` AND `profileResponseSchema.properties` AND `ProfileResponse` in contracts.ts. Effort: S (only if pursued)

## UX & Accessibility
- **[UX-3] City Heartbeat first-load error dead-ends and prints the raw error string** — `city-heartbeat.tsx:74-82`; `useCityHeartbeat.ts`. *Downgraded P2→P3 in rev 1:* commit `a479b4c` added persisted `cachedCityHeartbeat` + TanStack `placeholderData`, so returning users now see cached data instead of the error screen; the raw `{error}` + no-retry branch only fires when there is no cache yet (first-ever load). Fix (unchanged): replace `{error}` with `t('cityHeartbeat.loadFailed')` = "Couldn't load your city's pulse" (ro "Nu am putut încărca pulsul orașului", es "No pudimos cargar el pulso de tu ciudad"); add retry → `refetch()`; expose boolean `isError` from the hook instead of `error.message`, log the raw message to Sentry. Effort: S
- **[UX-4] Raw `error.message` shown mid-flow** — `route-preview.tsx:643`, `navigation.tsx:1019-1020`, `LeaderboardSection.tsx:146` (all have retry, unlike UX-3). Fix: fixed localized messages (`preview.previewFailedBody`, `nav.rerouteFailed`, `leaderboard.loadFailed` en/ro/es), raw message → Sentry. Effort: S
- **[UX-9] Hardcoded English: nav no-session fallback, StreakFlame + a11y labels** — `navigation.tsx:995,998,1009`; `StreakFlame.tsx:198,216`; `HoloSticker.tsx:105`, `Button.tsx:171`, `route-preview.tsx:508,519`. Fix: wrap in `t()` with keys `nav.noActiveTitle/Body/returnToPreview` (rewrite the developer-jargon body in rider language), `streak.a11yLabel` ("Streak {{days}} days, {{tier}}") + `streak.dormant`, `badge.holoA11y`, `common.loading`, `preview.modeCycleA11y`, `preview.recomputingA11y` — all en/ro/es. Effort: S
- **[UX-10] HoloSticker tap-glare + drag-tilt run under Reduce Motion** — `HoloSticker.tsx:143`, `:174-215` (gyro path is fixed; these two aren't). WCAG 2.3.3. Fix: `useReducedMotion()`; early-return in `fireGlare`; skip `tiltX/tiltY.setValue()` in the move handler when reduced (keep tap-forwarding so `onTap` still fires). Effort: S
- **[UX-11] `size="sm"` Button touch target is 36dp** — `Button.tsx:53`; affects ReviewPromptCard's "Later/Not now/Done". Fix: default `hitSlop={{top:6,bottom:6,left:4,right:4}}` when `size==='sm'` (~48dp effective, no visual change). Effort: XS
- **[UX-12] Milestone + signup modals sit outside the celebration coordinator** — `celebrationStage.ts:24`; `feedback.tsx:725-788`. A badge+milestone ride renders the milestone modal underneath BadgeUnlockOverlay (double backdrop). Fix: add `'milestone'` to `CelebrationKind` + priority (below badge/rankup); gate the modal on `useCelebrationStage('milestone', pendingMilestone != null)`; optionally gate the signup modal. Effort: M
- **[UX-13] Signup-prompt copy under-promises now that merge works** — `signup-prompt.tsx:150-154` (stale "no merge exists" comment) + `en.ts:928-929`. Fix: update `signupSub`/`signupSubMandatory` en/ro/es to promise continuity (e.g. "Your rides, streaks, and badges carry over…" — avoid absolute guarantees since merge only fires into a fresh account); delete the stale comment; consider the same uplift on the feedback-screen signup modal. Effort: XS
- **[UX-14] Nudge opt-out is only partial** — `profile.tsx:754-791`; `eligibility.ts:170-173`. `notifyStreak` silences only streak-family triggers; no master "all Pedal nudges off". Fix: master toggle mapped to one opt-out column checked at the top of `evaluateEligibility` (return `suppressed_category_pref`); optionally split reminder vs celebration categories. Effort: S
- **[UX-15] Saved-places "Save as…" alert has a hardcoded 'Cancel' button** *(NEW in rev 1, commit `a479b4c`)* — `SearchBar.tsx` `handleLongPress`: the alert's first two buttons use `t('search.saveAsHome'/'saveAsWork')` but the third is the literal `{ text: 'Cancel', style: 'cancel' }`. `common.cancel` already exists in all three locales (`en.ts:5`). Fix: replace with `{ text: t('common.cancel'), style: 'cancel' }`. Also wrap the nearby hardcoded a11y label `` `Select ${suggestion.primaryText}` `` in a `t()` key (`search.selectA11y` = "Select {{name}}", en/ro/es) — same class as UX-9. Effort: XS
- **[UX-16] Unset Home/Work rows look tappable but do nothing; the save gesture is undiscoverable; no way to clear a saved place** *(NEW in rev 1)* — `SearchBar.tsx` standalone dropdown: unset rows render "Set home address"/"Set work address" subtitles with `accessibilityRole="button"` but `onPress={place ? … : undefined}` — a dead control that advertises an action. The only way to actually set Home/Work is a 500ms long-press on a search result (no hint anywhere), and `setSavedPlace(type, null)` exists but no UI ever calls it, so a saved place can be overwritten but never removed (relevant after moving house — stale home address persists forever). Fix: 1) give unset rows an `onPress` that shows a one-line hint (toast or alert: `search.saveHint` = "Long-press any search result to save it as Home or Work", en/ro/es); 2) extend the long-press alert with a "Remove saved place" option when the suggestion already equals the saved entry, or add clear affordances (✕) on saved rows calling `setSavedPlace(type, null)`; 3) keep `accessibilityRole="button"` only when an onPress exists, and add `accessibilityHint` describing the long-press save on suggestion rows. Effort: S
- **[UX-17] "home"/"work" keyword shortcut is English-only** *(NEW in rev 1)* — `route-planning.tsx` `isSavedPlaceKeyword` and `SearchBar.tsx` `keywordPlace` compare the query against the literals `'home'`/`'work'` only. A Romanian rider typing "acasă"/"birou" or a Spanish rider typing "casa"/"trabajo" gets a normal Mapbox search instead of their saved place (the empty-field quick-pick rows still work, so impact is minor). Fix: 1) export a shared `SAVED_PLACE_KEYWORDS: Record<'home'|'work', string[]>` (e.g. home: ['home','acasă','acasa','casa'], work: ['work','birou','serviciu','trabajo','oficina']) from a small util (or key it off the i18n catalog); 2) use it in both `isSavedPlaceKeyword` (route-planning.tsx) and the `keywordPlace` resolution (SearchBar.tsx) so the fetch-suppression and the row-injection stay in sync — they must match or typing a keyword suppresses autocomplete without showing the saved place; 3) unit-test both sites against the shared list. Effort: S

---

# Verified fixed since June 2026 (re-checked in code, not changelogs)

- **Both P0s:** `trip_tracks` unscoped RLS policy dropped (`202606120001`); `hide_endpoints` now genuinely substitutes trimmed origin/destination in both share RPCs including the invitee's saved_routes insert (`202606120002`).
- **Entire ride-lifecycle cluster:** End Ride has a "Keep riding" abort path; Android BackHandler routes into the End Ride dialog; kill-recovery is owned solely by NavigationResumeGuard (age-thresholded); all discard paths use `resetFlow()`, never `finishNavigation()`.
- **Background navigation:** samples merged into the trail on every foregrounding + before kill-recovery; buffer 20 → 1000 samples; `killServiceOnDestroy: true` closes the swipe-away service leak.
- **Offline sync:** 30s/60s mutation timeouts actually thread through to the fetch; orphan self-heal via owner-scoped `GET /v1/trips/resolve`; `flushPersistedWrites()` after every trip-critical queue mutation; RideLossBanner reachable with Retry.
- **Contracts:** GET impact item schemas fixed; `bikeType`/`aqiAtStart` passthrough fixed; old-client `/love` compatibility deliberately preserved.
- **Security plumbing:** timing-safe `verifyCronAuth` consolidation; centralized 5xx detail-stripping in `app.ts`; new tables (`nudge_log`, `user_ride_pattern`, `city_suggestions`) all shipped with correct RLS from day one.
- **UX:** onboarding fully translated (en/ro/es, 114 `t()` calls); notification permission gated on onboarding completion; anon→account merge wired end-to-end in the client; celebration coordinator sequences the three root overlays; nudge tap-telemetry funnel closed; ES locale at full 1079-key parity.
- **Performance:** persist-write debounce (no per-GPS-tick serialization); Trophy Case FlatList virtualization tuned; holo badge assets 115MB → 16MB.

# Positive observations

- **The project's #1 historical bug class (Fastify schema stripping) is nearly closed** — named item schemas, explicit properties+required, comments citing the rule.
- **Native-module guard discipline is exemplary and consistent** (`hasExpoNativeModule` everywhere; no bridgeless regressions found).
- **The offline queue handles the hard cases correctly** — crash recovery, orphan self-heal, dead-lettering with user-visible retry, owner-scoped resolve (no IDOR).
- **useHoloTilt's shared-sensor design** (one refcounted DeviceMotion listener for 147 badge cells, low-pass filter, focus claim) is genuinely well engineered.
- **AbortController/timeout discipline at 11 of 12 fetch sites; deliberate per-volatility TanStack staleTimes.**
- **i18n catalog parity is flawless** (1079 keys × 3 locales) — remaining issues are unwired strings, not missing translations.
- **CI is broad**: 3-workspace typecheck, lint ratchet, WCAG token contrast check, production-scoped audit with documented allowlist, ~1260 tests.

---

# Recommended action plan

### Phase 0 — Close the abuse vector + brownout amplifier (this week, ~2 dev-days)
1. **SEC-1** merge replay guard (`merged_at` + delete anon auth user) — S
2. **SCALE-4 step 1 only**: OSRM fetch timeout + retry + Mapbox fallback in `customOsrm.ts` — S
3. **SEC-3** five one-line rate limits — XS
4. **SEC-4** v2 reactions: requireFullUser + rate limit — S
5. **STATE-1** clear pending celebrations on anon→real sign-in — XS

### Phase 1 — Security & privacy polish (~2-3 dev-days)
6. **SEC-2** follow bucket rate limits — S
7. **SEC-5** Sentry PII scrubbing (beforeSend + path-only URLs) — S
8. **STATE-3** clear savedPlaces (+ cachedCityHeartbeat) in `resetUserScopedState` *(added rev 1)* — XS
9. **INFRA-2** reconcile `record_ride_impact` live def + ownership guard (needs Supabase access) — M
10. **SEC-6, SEC-7, INFRA-1, INFRA-3** hardening batch — XS-S each

### Phase 2 — Scale foundations (before ~10-20k users, ~1-2 weeks)
11. **SCALE-1** Memorystore Redis + `REDIS_URL` (unlocks 2, 9, 13, 16) — M
12. **SCALE-7 + SCALE-8** PostGIS indexes + RPC bbox rewrites — S+M
13. **SCALE-3** Cloud Run min-instances/concurrency — S
14. **SCALE-11** retention batch size / loop-until-drained + backfill — S
15. **SCALE-5 + SCALE-6** nudge cron chunking, pagination, batched pushes — L
16. **SCALE-16** weather proxy w/ shared cache (or commercial tier) — M

### Phase 3 — UX & experience batch (~1 week, mostly XS/S)
17. **UX-1/2/3** error-state retry sweep (4 screens; UX-3 downgraded to P3 in rev 1 but same-shaped fix — do together) — S total
18. **UX-5** notification tap routing (deepLink honor + 3 cases + type on first-ride payloads) — S
19. **UX-6** quiet-hours editor — M
20. **UX-7/8** streak-tier + search-placeholder i18n (UX-8 now covers 3 placeholders) — S
21. **UX-13** signup copy now promises continuity (cheap conversion win) — XS
22. P3 a11y/i18n batch: **UX-9/10/11** + saved-places polish **UX-15/16/17** *(added rev 1)* — S-M total

### Phase 4 — Performance & debt (ongoing backlog)
23. **PERF-3/SCALE-14** trip-history payload diet — M
24. **PERF-1** mascot downscale, **PERF-2** RouteMap thumbnailMode, **PERF-4** weekly-cron batching — S/M/S
25. **QUAL-4** dispatcher/eventFirer + HoloSticker tests — M
26. **QUAL-2** Overpass client consolidation — S; **QUAL-1** file splits — L incremental; **QUAL-3/5, PERF-5, API-1, UX-4/12/14, INFRA-4** as convenient

### Pre-100k checklist (schedule when growth curve demands)
- **SCALE-2** local JWT verification · **SCALE-9** heartbeat rollups · **SCALE-10** leaderboard pre-aggregation · **SCALE-12** log-table retention · **SCALE-13** batched risk KNN · **SCALE-15** Mapbox cost instrumentation + commercial plan · **SCALE-17** self-hosted Overpass · **SCALE-18** push receipts cron · **SCALE-19** QueryClient jitter/backoff · **SCALE-20** Supabase tier + pooler + alerts

---

*Sub-reports (full agent output) were generated in the session scratchpad; all findings are consolidated in this document. Prior review for cross-reference: `docs/reviews/full-app-review-2026-06-12.md`.*
