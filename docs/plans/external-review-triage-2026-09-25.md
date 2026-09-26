# External LLM review — triage and remediation plan (2026-09-25)

An external LLM produced a 10-item review of this repo. This document is the
**triage**: what survived verification, what did not, and the plan for what did.

## How to read this

The review was written without running anything. Every item below carries a
provenance tag, because that distinction decides what ships:

| Tag | Meaning |
|---|---|
| **LIVE** | Verified against the production Supabase DB or a live HTTP probe on 2026-09-25 |
| **SOURCE** | Verified by reading the code at a named file:line |
| **FILES-ONLY** | Read from `supabase/migrations/` and **not** confirmed live — this repo has documented RPC/policy drift (`reference_supabase-rpc-drift` memory), and one review finding was **falsified** by checking live (see D-1) |

⚠️ **The review's own severity ordering is not reliable.** Its #1 and #2 pointed
at the right neighbourhoods but stated the mechanism wrongly; the two most
serious issues found during triage (P0-2, P0-4) are **not in the review at all**,
and its "Quick Wins" list contains items already done.

## Implementation status (2026-09-25)

| Item | State | Evidence |
|---|---|---|
| **P0-3** hazard repeat-vote | ✅ **LIVE** — migration `202609250001` applied | Behavioural test in a rolled-back `DO` block: repeat deny leaves `deny_count=1` (was 2), TTL unchanged, flip still reverses correctly |
| **P0-1** revoke client EXECUTE | ✅ **LIVE** — migration `202609250002` applied | All 20 now `anon=false, authenticated=false, service_role=true`. Anon probe went 200-with-real-data → **401 permission denied**; service-role path still 200; deliberately-public share fn still reachable |
| **P0-1b** dead Mia functions | ✅ **LIVE** — migration `202609250003` applied | Verified no function body referenced them before dropping |
| **P0-2** risk-data exposure | ✅ **LIVE** — migration `202609250004` applied | Anon reads of `road_risk_data`, `road_risk_data_old_b47v1`, `rrd_capfix_*` now return `[]`; service-role still reads; `hazards` still readable by anon (no regression) |
| **P0-5** `.gcloudignore` | ✅ done | `gcloud meta list-files-for-upload` lists **zero** `.env`/keystore/service-account files, and still 186 `services/mobile-api` files |
| **P0-4** share-image leak | ✅ code done | New `trimShareGeometry` in core + hook rewired; 8 new core tests, rewritten hook test; **mutation-checked** (breaking the trim fails 2 core tests + the hook test) |
| **P1-11** feed-reaction XP farm | ⚠️ **partially** fixed, and the rest is **accepted** | `/feed/:id/like` and `/feed/:id/love` no longer award XP or notify on a duplicate (23505 guard) + 2 new tests, mutation-checked. ⚠️ **unlike→relike still re-awards** and now stays that way: closing it needs the `xp_events` constraint, which was decided against below. Known and accepted, not pending — the amounts are small (`like` has 1 excess row in all of history) and the alternative risked breaking streak and quiz XP |
| **P1-4** notification prefs fail-closed | ✅ code done | Suppresses instead of sending when the prefs read errors; distinguishes `no_profile` from `prefs_unavailable`. 4 new tests, mutation-checked |
| **P1-2 / P1-3** unbounded body reads | ✅ code done | Fixed in **three** files — `apiFetch.ts` (all ~80 `mobileApiFetch` call sites), `mapbox-routing.ts` (OSRM point-to-point, OSRM loop candidates, Mapbox Directions, canopy) and **`mapbox-search.ts`**, whose separate copy was found by chasing an unexplained bundle-grep result. Four bare fetches with no timeout at all routed through `mobileApiFetch`. 3 new tests, mutation-checked |
| **P1-1** unreadable session ≠ sign-out | ✅ code done | Third state `isSessionUnreadable` threaded to both consumers, so a keystore failure no longer walls a signed-in rider behind the mandatory signup gate or resets their PostHog identity. 3 new tests, both guards mutation-checked |
| **P1-6** silent auto-publish failures | ✅ code done | `v1.ts` trips/trip_tracks reads now log at error level (PGRST116 stays quiet); `autoPublish.getUserProfile` reports to Sentry while still failing closed |
| **P1-9** first-ride budget fail-open | ✅ code done | Weekly budget and dedupe count now fail **closed**. 2 new tests, mutation-checked |
| **P1-10** receipt sweep silent outage | ✅ code done | Throws instead of reporting `{polled:0}`; the route already turns that into a logged 500 the GCP policy pages on. 1 new test, mutation-checked |
| **P1-8** background GPS after ride end | ✅ code done | Task operations serialized at the resource in `backgroundNavigation.ts`, so a stop queued behind an in-flight start actually stops it. 3 new tests, mutation-checked — bypassing the queue fails with `expected true to be false`, i.e. the leaked task reproduced |
| **P1-7** share-claim processor latched dead | ✅ code done | Cleanup now releases the in-flight lock for a scheduled-but-unstarted retry, so a navigation mid-backoff reschedules instead of killing the claim forever. 2 new tests (both directions), mutation-checked — removing the release fails with `expected "spy" to be called at least once` |
| **P1-5** microlives replay | ✅ **LIVE** — migration `202609260001` applied | Behavioural test in a rolled-back transaction passes against the new body and FAILS against the old one ("FAIL replay-path: THE BUG"). Damage measured first: 10 of 145 riders over-counted, 2,107.96 excess microlives vs 715.65 legitimate, with three riders at an exact integer multiple of their single stored row. Grants re-checked after `CREATE OR REPLACE` — `authenticated` still cannot execute, so P0-1's revoke survived. Existing excess deliberately NOT repaired |
| **P1-12** duplicate hazard pins | ✅ migration `202609260002` LIVE; code done, NOT deployed | Key is the offline queue's own mutation id, attached at drain time. Index deliberately non-partial (error-prevention #27). Row + all four side effects gated together. 10 new tests, 4 mutation checks. ⚠️ The plan's citation was wrong: `hazardSchemas.ts:15` is the VOTE schema; the report schema had no such field at all |
| **P2** social-table dumps | ✅ **LIVE** — migration `202609260003` | 3,485 profiles and 783 activity_feed rows (396 carrying route geometry + start/destination labels) were readable by any signed-in account — now 0, with the own-rows positive control still passing. Anonymous sign-in mints `role=authenticated`, which is why the bare-anon-key check understated it |
| **P2** route-share fail-open | ✅ **LIVE** — migration `202609260005` | `COALESCE(trimmed, raw)` inverted to `RAISE EXCEPTION`, verified by a test that FAILS against the old body. Latent confirmed (27 hidden shares, all trimmed keys present). Also found: `hide_endpoints` was taken from the client while a sub-400 m route is returned untrimmed, so a short route claimed privacy it did not have |
| **P2** leaderboard settle | ✅ migration `202609260004` LIVE; code done, NOT deployed | `UNIQUE (period_type, metric, period_end, user_id)` replaces a count read that both duplicated XP on the scheduled race AND skipped whole periods after a truncated run. 0 existing duplicates, so nothing to clean first |
| **P2** duplicate feed cards | ✅ code done, NOT deployed | **Upgraded from "plausible" to demonstrated: 21 groups, 141 excess cards of 396 (36%).** Dedup narrows but does not close the race — the unique index needs those 141 rider-visible rows deleted first |
| **P2** remaining code items | ✅ all done, NOT deployed / not in a build | gpx size cap, loop double-tap guard, feed query key rounding, leaked GPS watch, `useCurrentLocation` as one shared read, firstRide ordering + `warn`→`error` (899/1000 = 90% of the cap, not the ~687 recorded), six copies of the 200 m trim collapsed to one constant, dead `onboardingConsent` copy pruned (two keys ARE live, contrary to the plan) |
| **P2** infra + lint | ✅ done | Workflow `permissions`, pinned `eas-cli@24.8.0`, dispatch inputs via `env:`, immutable `build-$BUILD_ID` image tag. ESLint extended to `src/**`: `eqeqeq` was already clean (0 of 539 files) — the real finding was 22 inert `@typescript-eslint/*` disable directives, now given a declared plugin; ratchet verified to discriminate |

**Closed by decision, not by code (product owner, 2026-09-25):** the `xp_events`
dedup and dropping the `rrd_capfix_*` tables are **not being done**. The capfix
tables stay RLS-locked; the 73 duplicated `xp_events` rows and ~11k excess XP
stay as they are. Do not re-open either as a task.

**Deploy state (2026-09-25):** the four migrations are LIVE, and the API half is
LIVE on Cloud Run **`defpedal-api-00173-kzc`** — deployed by image digest
`sha256:59bed40b…`, verified equal to the digest Cloud Build produced, from a
tree at `origin/main` (`972feeb`) with no modified tracked files before or after
the build. That covers P1-4, P1-6, P1-9, P1-10 and the P1-11 half.

⚠️ **This deploy is NOT content-verifiable from outside, and that is stated
rather than glossed.** Every API fix in it changes internal error handling — a
prefs read that suppresses instead of sending, a receipt sweep that throws
instead of reporting zero, auto-publish that logs, budgets that fail closed —
so no probe can distinguish the new revision from the old. The claim is digest
provenance plus no regression: all 8 baseline probes captured before the deploy
returned identical codes after (`/health` 200, `/health/deep` 200, like/love
401, receipts/check 401, `/v1/profile` 401, trips/track bad-field 400, hazards
400), and the error-log #96 anti-revert check passed — seven recently-shipped
routes answer 400/401 while a nonexistent control route 404s.

**The MOBILE half is still not shipped:** P0-4, P1-1, P1-2, P1-3, P1-7, P1-8 are
on `main` only and need a client release.

**Note on the body-read fix (worth keeping):** the load-bearing half is moving
the body read INSIDE the helper's `try`, not the timer re-arm. Mutation-checking
proved it — removing the re-arm leaves the original header timer armed, so the
read stays bounded and the test correctly still passes. The mutation that
reproduces the defect is *disarm without re-arm*. Also: `fetchAndRead` in
`mapbox-routing.ts` has **no direct test** (that file has no test file at all);
it is covered only by typecheck and the full suite.

## Headline

Five things matter. Everything else is either already tracked in `TODO.md`
§issuestofix, or noise.

1. **P0-1** — 17 `SECURITY DEFINER` functions are callable by `anon`/`authenticated`
   with a caller-supplied user id, including `award_xp` with a caller-supplied XP
   amount. **LIVE, reachability proven.**
2. **P0-2** — `road_risk_data` is world-readable with the anon key shipped in the
   APK, defeating the 2026-04-13 risk-IP hardening. **Not in the review. LIVE.**
3. **P0-3** — One rider tapping thumbs-down three times gets another rider's
   hazard permanently deleted. **SOURCE, full chain confirmed.**
4. **P0-4** — The post-ride share image draws the **untrimmed** planned route, so
   the PNG a rider posts shows their front door. **SOURCE.**
5. **P0-5** — `.gcloudignore` does not exclude `.env`, so the documented
   `gcloud builds submit` uploads a live `SUPABASE_SERVICE_ROLE_KEY` into Cloud
   Build storage. **SOURCE.**

---

## P0 — do these first

### P0-1 · Postgres functions executable by client roles with a spoofable user id

**LIVE.** 17 `SECURITY DEFINER` functions taking a `uuid` are `EXECUTE`-able by
`authenticated`, 15 of them by `anon`. Proven reachable end-to-end: a
`POST /rest/v1/rpc/get_suggested_users` with only the APK's anon key and a
fabricated `p_viewer_id` returned **HTTP 200 with a real rider's display name,
tier and activity count**. Control (`prune_user_telemetry_events`, not granted)
returned **401**, so the 200 is a genuine grant and not a blanket-open API.

Worst offenders:

| Function | anon | Effect of a spoofed id |
|---|---|---|
| `award_xp(p_user_id, p_action, p_base_xp, p_multiplier, p_source_id)` | yes | **The XP amount is a parameter.** Cross-user awards *are* blocked (see the guard note below), but **self-awarding an arbitrary `p_base_xp` is open** → mint yourself Legend tier and the top leaderboard slot. |
| `record_ride_impact(...)` | yes | Forge impact rows; bumps `profiles` totals |
| `record_ride_microlives(...)` | yes | Same, for microlives |
| `qualify_streak_action(p_user_id, ...)` | yes | Forge streaks |
| `revoke_route_share(p_id, p_user_id)` | yes | Revoke **another rider's** share |
| `claim_route_share(p_code, p_invitee_id)` | yes | Forge a claim naming an arbitrary invitee → writes `saved_routes`, `user_follows`, `activity_feed` into a real rider's account, plus inviter XP and ambassador badges |
| `check_and_award_badges`, `check_champion_repeat_badges` | yes | Force badge evaluation for anyone |
| `get_impact_dashboard(p_user_id, p_time_zone)` | no (auth only) | Read another rider's personal stats |
| `get_ranked_feed(p_viewer_id, ...)` | yes | Read another rider's personalised feed and social state |
| `evaluate_mia_detection`, `evaluate_mia_level_up` | yes | **Dead feature** (retired v0.2.43) still exposed |

Write functions were **not probed** — doing so would corrupt production. The
grant is the evidence.

**Only 1 of the 17 has any identity guard** (LIVE, query A-4). `award_xp` checks
`IF auth.uid() IS NOT NULL AND p_user_id != auth.uid() THEN RAISE EXCEPTION` —
added deliberately in `202604110003`, a migration named *secure_award_xp*. The
other **16 contain no `auth.uid()` reference at all**, so `record_ride_impact`,
`record_ride_microlives`, `qualify_streak_action`, `revoke_route_share`,
`claim_route_share`, `check_and_award_badges`, `check_champion_repeat_badges` and
`clear_inactive_warning` each accept an arbitrary target user id with no check.

That asymmetry is the argument for fixing this by **revocation, not by adding 16
guards**: someone already tried the guard approach once, on one function, and the
other 16 never got it. Revocation is a single enforceable invariant (query A-1);
16 hand-written guards are 16 chances to miss one — and `award_xp` shows that even
a hand-written guard leaves the self-award hole open.

**Root cause, and why it recurred.** The documented strategy is revocation, not
`auth.uid()` guards — `202606120003:20-22` says so explicitly, because every
caller is the API's service role. The strategy is sound; enforcement is manual,
so it silently regressed twice:

- `202606120003:62-70` revoked four dashboard RPCs. `202606290001:184` — a
  migration about **calories**, 17 days later — re-granted `get_impact_dashboard`
  to `authenticated`, with no mention of the revoke it undid.
- `202607190001:378` dropped the 6-arg `get_ranked_feed` (destroying its ACL) and
  created an 8-arg one with **no grant statement at all**, so it fell to the
  Postgres `EXECUTE TO PUBLIC` default.

**The fix is safe.** Verified: the mobile app makes **zero** `.rpc()` calls
(`apps/mobile/**`, tests included); `apps/web` makes zero; the only edge function
calling an RPC uses the service-role key
(`supabase/functions/inactive-warning/index.ts:207,223`). **Every legitimate
caller is service-role**, so revoking `anon`/`authenticated` breaks nothing.

Migration, mirroring the established pattern at `202606120003:62-70`:

```sql
-- For each of the 17, using the exact identity args from query A-1:
REVOKE EXECUTE ON FUNCTION public.award_xp(uuid, text, integer, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.award_xp(uuid, text, integer, numeric, text)
  TO service_role;
-- ...repeat for the other 16.

-- Dead Mia functions: drop, do not merely revoke.
DROP FUNCTION IF EXISTS public.evaluate_mia_detection(uuid);
DROP FUNCTION IF EXISTS public.evaluate_mia_level_up(uuid, numeric, boolean);
```

**Then make it enforceable**, or it regresses a third time. Promote query A-1 to
a health check in `docs/runbooks/monitoring.md` that fails if any
`SECURITY DEFINER` function taking a `uuid` is executable by a client role. A
one-query check is the only thing that survives a migration author who does not
know this history.

**Decide deliberately, do not blanket-revoke:** `get_neighborhood_leaderboard` is
public by design (the uuid marks own-rank) and `get_suggested_users` returns
public profile data — both may legitimately stay granted.
`get_user_public_profile` takes a spoofable `p_requesting_user_id`; check whether
that parameter gates a block-list before deciding.

### P0-2 · `road_risk_data` is world-readable — the risk-IP hardening is defeated at the table

**LIVE.** Policy `"public read b47v1"`, `USING (true)`, `TO public`. A probe with
the bare anon key returned `{"risk_score":45}`. Also exposed:
`rrd_capfix_backup` and `rrd_capfix_progress` — leftover working tables with
**RLS disabled**, returning real rows.

This contradicts a documented, deliberate investment. `.claude/CLAUDE.md`
§"Risk Display Bands": score cuts are *"server-side only (2026-04-13 risk-IP
hardening)"*, the API quantizes `riskScore` to bucket midpoints, and thresholds
must never be mirrored client-side. The raw table serves **exact, unquantized
scores for all ~68M segments** to anyone who unzips the APK — strictly more than
the API has ever exposed. Nothing client-side reads it (mobile's only `.from()`
is the `avatars` storage bucket); the API reads it via service role.

Fix: drop the public-read policies on both the live and archived risk tables
(`road_risk_data`, `road_risk_data_old_b47v1`), and enable RLS with no policy on
`rrd_capfix_backup` / `rrd_capfix_progress` — **locked, NOT dropped; dropping was
decided against on 2026-09-25**. Confirm no client
regression on a preview build — the app routes client-side but fetches risk via
`/v1/risk-segments`, which is service-role.

### P0-3 · A single rider can permanently delete any hazard from the shipped UI

**SOURCE, chain confirmed at every link.**

1. `202609020001_hazard_permanent.sql:134` — the vote-flip reversal is gated on
   `TG_OP = 'UPDATE' AND OLD.response IS DISTINCT FROM NEW.response`, but the
   counting branches below run **unconditionally on INSERT and UPDATE**,
   including when `OLD.response = NEW.response`. For `deny` that means
   `deny_count + 1` **and**
   `expires_at = now() + GREATEST((expires_at - now())/2, interval '1 minute')`.
2. `services/mobile-api/src/routes/v1.ts:1406-1416` — the upsert rewrites
   `responded_at` on every call, so a repeat vote is always a real UPDATE that
   fires the trigger.
3. `apps/mobile/src/design-system/organisms/HazardDetailSheet.tsx:201` computes
   `downActive` but uses it **only** for styling and `accessibilityState`.
   `handleDownvote` (`:208-212`) guards on `isPending` alone.

Three taps drive `score` (generated `confirm_count - deny_count`) to −3, which
hides the hazard from every rider via `/hazards/nearby`; the 3 AM cron then
**hard-deletes it ~24 h later, irreversibly**. The `hazardVote` rate limit is
5/10 min, so three taps fit one window. Each tap also halves the remaining TTL.
Permanent hazards fall at 10 taps.

The `UNIQUE (hazard_id, user_id)` constraint whose documented purpose
(`v1.ts:1366-1368`) is to stop vote-stuffing is defeated by pressing the same
button twice.

Fix — **one trigger condition, no schema change, no client release**, so it
reaches the whole fielded fleet at once:

```sql
IF TG_OP = 'INSERT' OR OLD.response IS DISTINCT FROM NEW.response THEN
  -- existing counting / TTL branches
END IF;
```

Then add `if (downActive) return;` / `if (upActive) return;` to the two handlers
as defence in depth, plus a regression test asserting a repeat identical vote is
a no-op.

⚠️ Decide on a one-off repair before shipping: hazards already hidden or deleted
by an inflated `deny_count` cannot be distinguished from genuine downvotes after
the fact, so consider recounting from `hazard_validations`.

### P0-4 · The post-ride share image draws the untrimmed planned route

**SOURCE.** `packages/core/src/mapboxStaticImageUrl.ts:147-153`:

```js
if (riskSegments && riskSegments.length > 0) {
  pathOverlays = riskSegments.map((seg) => buildGeoJsonOverlay(seg.coords, seg.color));
} else {
  pathOverlays = [buildGeoJsonOverlay(coords, DEFAULT_ROUTE_COLOR)];
}
```

When risk segments exist the **trimmed polyline is dropped from the drawn path
entirely**, surviving only as the two pins. Upstream:
`apps/mobile/app/feedback.tsx:519-524` builds `riskSegments` from
`selectedRoute.riskSegments[].geometry.coordinates` — the full planned route —
and `apps/mobile/src/hooks/useShareRide.ts` trims only `input.coords` under the
comment *"Privacy trim — protects home/work endpoints"*, forwarding
`riskSegments` verbatim.

Result: the rendered PNG shows the complete door-to-door route with pins sitting
~200 m inside each end, so the line visibly overshoots its own pins. Risk
segments are populated in all 32 covered countries, so this is the **common**
path. The other four `useShareRide` callers pass no `riskSegments` and are clean.
There is **no `hide_endpoints` control on this path at all** — it is a separate
feature from `route_shares`; the only protection is the hardcoded
`PRIVACY_TRIM_METERS = 200`. The output is a PNG on Instagram / WhatsApp / the
camera roll: no expiry, no revocation.

The existing test cannot catch it — `useShareRide.test.ts:222-232` feeds the trim
spy's own mocked output as the risk-segment input and asserts pass-through
equality, so it passes identically with or without the bypass.

Fix: trim risk-segment vertices within `PRIVACY_TRIM_METERS` of the **raw**
first/last coords, dropping segments left with fewer than 2 points, and derive
the pins from the same trimmed set. Put it in `packages/core` beside
`trimPrivacyZone` so it is testable, and rewrite the test to feed **raw** coords
and assert the raw endpoints are absent from the emitted overlay.

Secondary correctness bug from the same lines: when risk segments are present the
image shows the *planned route* rather than the *ride actually recorded*.

### P0-5 · `.gcloudignore` does not exclude `.env`

**SOURCE.** `.gcloudignore` exists (so gcloud ignores `.gitignore` entirely), has
no `#!include:.gitignore` directive, and has no `.env` pattern.
`services/mobile-api/.env` currently holds a live `SUPABASE_SERVICE_ROLE_KEY`,
`MAPBOX_ACCESS_TOKEN`, `OPENAI_API_KEY` and `CRON_SECRET`. The documented
`gcloud builds submit --config cloudbuild.yaml` from the repo root therefore
uploads it into the Cloud Build GCS source bucket. The Dockerfile's narrow `COPY`
list keeps it out of the image, but the secret still transits and is retained
there.

Fix: add `.env`, `**/.env`, `*.env*` to `.gcloudignore`. Then decide whether the
keys that have already transited need rotation — a judgement call about who can
read that bucket, not a code change.

---

## P1 — real, user-visible, not emergencies

| # | Item | Provenance | Why it matters |
|---|---|---|---|
| P1-1 | `AuthSessionProvider.tsx:91-97` sets `isLoading=false` while `session` stays null on a **read failure** | SOURCE | The error-log #116 fix preserved the session on disk, but two consumers read that state as "signed out": `computeOnboardingGateTarget.ts:63,71-72` hard-walls a signed-in rider behind the **mandatory signup gate** for the 10s→300s retry ladder, and `TelemetryProvider.tsx:35,71-79` calls `identify(null)` → PostHog `reset()` → a fresh anonymous id, re-entering the DAU corruption documented in `docs/reviews/active-user-counting-2026-09-11.md`. Same symptom as #116, different door. `/navigation` is exempt so a mid-ride failure does not kill the ride. Fix: thread a third `isSessionUnreadable` state and short-circuit both consumers on it. |
| P1-2 | `apps/mobile/src/lib/apiFetch.ts:150` clears the timeout in `performFetch`'s `finally`, before the caller reads the body at `:202`/`:214` | SOURCE | A server that returns headers then stalls hangs **forever** — no timeout, no retry — across the **entire** mobile API surface (~60 call sites). Fix: move the body read inside `performFetch`, before `clearTimeout`. Same shape at `mapbox-routing.ts:107/:438` and `services/mobile-api/src/lib/loops/osrm.ts:229/:253` (the latter on the rider's `POST /v1/loops` path, ~8 concurrent). |
| P1-3 | `mapbox-routing.ts:536`, `:582` — bare `fetch`, **no timeout**, bypassing `mobileApiFetch` | SOURCE | `/v1/elevation-profile` and `/v1/risk-segments`, both awaited on the route-preview path. `catch { return route }` degrades gracefully, but **a hang never throws** → preview spinner forever. Fix: route through `mobileApiFetch`. |
| P1-4 | `services/mobile-api/src/lib/notifications.ts:139` drops the Supabase `error` on the preferences read | SOURCE | `prefs` becomes null, so the whole `if (prefs)` block is skipped — **bypassing the category gate (`:145`) and the quiet-hours gate (`:151`)**. A DB blip pushes a rider who switched notifications off, at 03:00. The same file fails *closed* deliberately at `:111-118` with a comment, which is what proves `:139` is an oversight. The one case where the error path is less safe than the success path. |
| P1-5 | `record_ride_microlives` accumulates on every call (`202609240001:136-153`); `record_ride_impact` gates on a check-then-write (`202606290001:38,66`) | FILES-ONLY | The `ON CONFLICT (trip_id) DO NOTHING` insert is idempotent, but the `profiles` totals update is not gated on whether the insert happened. Permanent, user-visible on the Impact Dashboard, and explicitly **not** unwound by trip deletion. Fix: `... DO NOTHING RETURNING id INTO v_inserted; IF v_inserted IS NOT NULL THEN ...`. |
| P1-6 | `routes/v1.ts:3460` and `lib/autoPublish.ts:98,132` drop Supabase `error` | SOURCE | CLAUDE.md already documents the first: PostgREST 400s on an unknown column → null → **every ride auto-publishes with empty geometry, nothing logged**. The second makes a failed profile read indistinguishable from "opted out", so the ride is silently never published. |
| P1-7 | `ShareClaimProcessor.tsx:148` sets `isProcessingRef` before the retry `setTimeout` at `:274`; cleanup `:279-284` never resets it | SOURCE | `pathname` is in the dep array (`:292`), so **any navigation** during the 1s/2s backoff latches the processor dead permanently — a tapped share link silently does nothing until the next cold start. |
| P1-8 | `NavigationLifecycleManager.tsx:27-41` — `syncLifecycle` is async with no re-entry lock | SOURCE | Ending a ride inside the start window leaves background GPS and the foreground-service notification running with no path to stop it (`isNavigating` is already false, the effect will not re-run). Battery drain and **location collection outside a ride**. Fix: a generation counter re-checked after the awaits. |
| P1-9 | `firstRideNotifications.ts:249,297` fail **open to 0** on the dedup count and weekly budget | SOURCE | A Supabase blip re-sends templates a rider already received and voids the cap — rider-visible spam, against the documented "never repeat a phrase" rule. |
| P1-10 | `lib/pushReceipts.ts:82` drops the error → `pending=[]` → cron reports a clean `{polled:0,resolved:0,pruned:0}` | SOURCE | Dead tokens never pruned, degrading Expo sender reputation for **every** user — the mechanism behind error-log #69. An outage is indistinguishable from a quiet run. |
| P1-11 | **`award_xp` never enforces `p_source_id`, and `xp_events` has no unique index** | **LIVE** | See below — this one fix closes four separate duplication paths, including an unbounded XP farm reachable from the shipped UI. |
| P1-12 | `submissions.ts:60-124` — the hazard insert has **no idempotency key**; `clientSubmittedAt` reaches the server (`hazardSchemas.ts:15`) and is never written | SOURCE | A delivered-then-timed-out or app-killed retry (`OfflineMutationSyncManager.tsx:135-166`, whose comment at `:141-148` records this firing in production) creates a **duplicate hazard pin**, splitting community votes on the same hazard — which interacts badly with P0-3. Also refires the streak, the `post_hazard_thanks` push, `award_xp('hazard_report', 50)` and `autoPublishHazardStandalone`. Fix: persist `client_submitted_at` + a partial `UNIQUE (user_id, client_submitted_at)` and upsert — `trip_start` already does exactly this at `submissions.ts:131-165`. |

### P1-11 in detail — one fix, four duplication paths

**LIVE.** `award_xp` (`202604110003:33-38`) does a bare
`INSERT INTO xp_events (...)` followed by an unconditional
`UPDATE profiles SET total_xp = COALESCE(total_xp,0) + v_final_xp`. `p_source_id`
is **stored and never checked**, and `xp_events` carries only `xp_events_pkey` on
`id` plus two non-unique btrees — no unique constraint anywhere. Several call
sites already pass a perfect natural key that nothing enforces.

The most reachable consequence is an **unbounded XP farm in the shipped UI**:
`routes/feed-reactions.ts:46-49` upserts `feed_likes` with
`onConflict: 'trip_share_id,user_id'` (idempotent), then fires
`award_xp(..., p_source_id: request.params.id)` **unconditionally** at `:80-88`,
and the unlike handler at `:121-125` deletes the `feed_likes` row **without
removing the XP**. So tap heart → untap → repeat earns `XP_VALUES.like` every
tap, forever. Re-liking an already-liked share does it too, since the award is not
gated on whether the upsert inserted. **This file never calls `applyRateLimit`**
(verified: zero matches) — throttling is per-route opt-in here, not a global hook
— so it is completely unbounded. `activity-feed.ts:265-275` is the same shape but
capped at `write` 20/60 s. The push half is already safe via the 1-per-24 h budget
(`notifications.ts:104-116`).

#### ⚠️ CORRECTED 2026-09-25 after measuring: a blanket unique index is the WRONG fix

This section originally proposed
`CREATE UNIQUE INDEX ... ON xp_events (user_id, action, source_id) WHERE source_id IS NOT NULL`.
**Do not do that.** Measured live before creating it, `source_id` does not mean the
same thing for every action:

| action | `source_id` holds | legitimately repeats? |
|---|---|---|
| `streak_day` | `streak_day_<N>` — the **streak length** | **Yes** — recurs every time a rider's streak restarts at day 1 (229 rows over 93 distinct days) |
| `quiz_complete`, `quiz_perfect` | a **question id** | **Yes** — questions recycle after the 30-day answer cooldown |
| `ride_safe` | a **trip uuid** | No — and every repeat is same-day, i.e. the replay bug |
| `badge_first` | a **badge key** | No — earned once per rider |
| `referral`, `like` | invitee / trip_share id | No |

Of 331 excess rows, **258 are legitimate recurrences**. The proposed index would
have silently stopped every streak and quiz XP award after a rider's first one —
a live feature broken by a "fix". Genuine duplication is only
`ride_safe` 67 + `referral` 3 + `badge_first` 2 + `like` 1 = **73 rows**.

Note also this repo's own error-prevention rule #27: a **partial** unique index is
a poor conflict-inference target, because the statement must carry a matching
`WHERE` predicate.

**What to do instead, in order of confidence:**

1. **Fix the call sites that are actually wrong** (done for `feed-reactions.ts`,
   see below) — no migration, no risk to the economy.
2. **Then decide, as a product call, which actions are once-per-source**, and
   whether `streak_day` / `quiz_*` should carry the date in `source_id`
   (`<questionId>:<date>`) so that a single global constraint becomes possible.
   Until that decision, constraining is guesswork.
3. ~~Dedup the 73 genuinely-duplicated rows and add a constraint scoped to the
   once-only actions.~~ **DECIDED AGAINST, 2026-09-25 (product owner).** The 73
   rows and ~11k excess XP stay. Deduping would mean deleting `xp_events` rows
   and decrementing `profiles.total_xp` on a live gamification economy, and that
   is not worth it for the amounts involved. Do not re-open this.

The `ride_safe` replay (67 rows, the largest real duplication) is worth fixing at
its call site the same way, via the `postedRef` + `tripId` dedup already listed
under P2.

---

## P2 — worth doing, cheap, no urgency

- **`hazards` `"Anyone can read hazards" USING(true) TO public`** (LIVE) sits
  alongside a narrower policy, so its `is_hidden` moderation filter and
  block-list filter are both defeated for direct PostgREST reads. The app reads
  via the API, which filters server-side, so the impact is a moderation bypass.
  Drop the redundant policy.
- **`profiles` / `activity_feed` / `user_follows` / `feed_likes` /
  `activity_reactions` carry `USING(true) TO authenticated`** (LIVE). The bare
  anon key returns empty, but Supabase **anonymous sign-in mints
  `role=authenticated`** — which this app does on every new install — so a free
  unauthenticated call yields a full dump of profiles, the social graph, and
  `activity_feed` payloads that per CLAUDE.md contain **ride geometry**. Not
  probed, because it writes a production user row. Decide per table whether
  whole-table read is intended; `activity_feed` is the one to scope first.
- **`gpx-import.ts:104` has no size cap** on a user-supplied `content://` file.
- **`leaderboard.ts:366-376` guards a 40 s XP loop with a count read.**
  `leaderboard_snapshots` has no unique constraint
  (`202604140001:12-29` — `idx_leaderboard_period_metric` is non-unique), so
  duplicate snapshots insert and `award_xp` refires. Needs concurrency, but the
  concurrency is *scheduled*: `leaderboard-settle-weekly` and `-monthly` hit the
  same endpoint and the handler loops over both periods (`:356-359`), so any
  1st-of-month Monday (~1.7×/yr) races all four combinations. The opposite failure
  shares the guard — a truncated run leaves `count > 0`, so the next run **skips
  the period** and ranks 20–50 never settle, returning `{ok:true}`. Fix:
  `UNIQUE (period_type, metric, period_end, user_id)` and move `award_xp` inside
  `if (!insertError)` — that kills duplication *and* makes truncation resumable.
- **`v1.ts:3216-3222` answers 200 to an impact replay.** The 409 branch is dead
  because `record_ride_impact` is `ON CONFLICT DO UPDATE`, so a replay re-runs the
  P1-5 accumulation, badges, `award_xp('ride_safe', 100)` and `autoPublishRide`
  (`autoPublish.ts:198-206` is a plain INSERT with no `tripId` dedup → duplicate
  feed card). Plausible but **not demonstrated in production** — ranked on
  evidence, not blast radius. Fix: a `postedRef` plus `tripId` dedup in
  `autoPublishRide`.
- **`firstRideNotifications.ts:94-100` — `CANDIDATE_LIMIT = 1000`, no cursor, no
  `.order()`.** Not yet binding (population ~687) but it is error-log #82's exact
  shape, and it logs at `warn` (`:114-119`) where `nudges.ts` chose `error` — GCP
  pages on `severity>=ERROR`, so **nothing would alert**. Fix:
  `.order('created_at')` and `warn` → `error`.
- **`loop-planner.tsx:619-652`** writes its idempotency key only after `saveLoop`
  resolves, and the button is disabled only on `!selected || !isOnline` → a
  double-tap creates two `saved_loops` rows, both charged against the free-tier
  allowance. The Share button 11 lines below is guarded, and `openSelected:720`
  has an explicit `rideStartedRef` guard documenting this exact hazard.
- **`useActivityFeed.ts:24` keys on raw unrounded lat/lon** → the retry button
  mints a new infinite-query entry and the feed jumps back to page 1.
  `.toFixed(3)`.
- **`useForegroundNavigationLocation.ts:135,166`** assigns `subscription` after
  the await, so cleanup in that window leaks a GPS watch for the process
  lifetime.
- **`useCurrentLocation.ts:28-79`** is instantiated ~10 independent times, each
  firing its own permission request and GPS wake-up. Refcounted singleton,
  following the existing `useHoloTilt` pattern.
- **Route-share RPC fallbacks point the wrong way.** `COALESCE(trimmed, raw)` in
  `get_public_route_share` and `claim_route_share` is unreachable today (trimming
  runs unconditionally at create; legacy rows expired 2026-07-12) but fails
  **open** by construction, and `claim_route_share` writes copies into
  `saved_routes` / `activity_feed` that outlive the 30-day share expiry. Invert to
  `RAISE EXCEPTION 'SHARE_NOT_FOUND'`. Also assert `hide_endpoints` from
  `trimEndpointsForShare`'s own `endpointsHidden` result rather than setting it
  independently, and delete the duplicated 400 m constant at
  `route-preview.tsx:479-481`.
- **Dead `onboardingConsent.*` i18n keys** in all three locales still say product
  analytics is "OFF by default and opt-in", contradicting the 2026-07-19
  default-ON flip. Zero live call sites — **delete the keys, do not fix the text.**
- **GitHub Actions:** no `permissions:` block in either workflow; `eas-cli`
  installed unpinned; two `workflow_dispatch` free-text inputs interpolated
  directly into `run:` blocks in `mobile-release.yml` (low exploitability — needs
  write access — but move to an `env:` block).
- **Mutable `:latest` deploy tag.** `cloudbuild.yaml` builds and pushes only
  `mobile-api:latest`, and no script anywhere deploys by digest. CLAUDE.md's
  "digest-verified" entries describe a manual human check, not a structural
  guarantee. This is the literal mechanism of error-log #96 and is still live.
- **ESLint covers only `apps/mobile/app/**` design tokens.** There is no ESLint at
  all for `services/mobile-api`, `packages/core`, `apps/web` or
  `apps/mobile/src`. A `lint:baseline` ratchet already exists, so adding
  `eqeqeq`, `no-unused-vars` and `@typescript-eslint/no-explicit-any` is cheap:
  add rules → run baseline → ratchet down. This is the review's "normalize lint
  rules" item, and the one Quick Win of theirs worth taking as stated.

---

## Already tracked — no new tracking needed

These review items are already in `TODO.md` §issuestofix with dated
re-verification. Do not open duplicates:

| Review item | Existing entry |
|---|---|
| Bare `QueryClient`, retry herds | SCALE-19 |
| `as any` casts, file-size caps | QUAL-3, QUAL-1 |
| Serial / unbounded crons | SCALE-5 (SCALE-6 **already fixed** — deterministic `ORDER BY` + truncation logging) |
| Append-only retention | SCALE-12 |
| Hardcoded EUR / €0.35 per km | G-P3 |
| Privacy page supervisory authority; OUG 34/2014 | G-28, G-29 |
| i18n long tail, reduced motion | C9, C10 |
| Anonymous reactions | SEC-4 |
| Accessibility / touch targets / contrast | P1-30 design backlog |
| Test-coverage gaps, no CI coverage gate | QUAL-4, INFRA-4 |

One genuinely open item the review restated correctly: the **Privacy Policy does
not name the always-on `app_open` telemetry**. Migration `202609110001` admits
this in its own comment. It is the only latent GDPR-transparency exposure here,
and it needs copy, not code.

---

## Dismissed, with reasons — do not re-litigate

- **D-1 · "`trips` has surviving `USING(true)` INSERT/UPDATE policies."**
  **FALSIFIED LIVE.** All three live `trips` policies are `user_id = auth.uid()`.
  The permissive policies in `202603010001:70-78` do not exist in production —
  they were cleaned up out-of-band. This is the clearest demonstration of why
  FILES-ONLY findings in this repo must be confirmed live before action.
- **D-2 · "Secrets are committed."** No keystore, service-account JSON, or
  service-role key has **ever** been committed (`git log --diff-filter=A` across
  all history, plus a pickaxe sweep). The tracked root `.env` is a single comment
  line. The one real residue: the initial commit `c08b51d:.env` contains the
  **anon** key for the current project — which is designed to be public and ships
  in every APK. Worth scrubbing for tidiness; not an incident.
- **D-3 · "Generated caches / `supabase/.temp` are tracked."** Untracked;
  `.gitignore` hygiene only. Sub-finding worth a line: ~933 files under
  `graphify-out/` are not actually being ignored despite the entry.
- **D-4 · `gpx-parse.ts` is unvalidated.** It is the **best**-validated boundary
  in the repo: `attribute()` returns null unless `Number.isFinite`, coordinates
  are range-checked ±90/±180, elevations are kept only 1:1, and it never throws.
- **D-5 · `polyline.ts` can produce NaN on the map.** It cannot. Every branch is
  bitwise (`|=`, `>>`, `&`), which coerces the past-end `charCodeAt` `NaN` to 0.
  Garbage yields Null Island `[0,0]`, not NaN.
- **D-6 · React Query keys are a privacy leak.** No. `UserCacheResetBridge.tsx:99`
  fires `queryClient.clear()` + `resetUserScopedState()` on sign-out and account
  switch, and there is **no** query-cache persistence anywhere, so a missing user
  id cannot cross humans.
- **D-7 · `useBicycleParking.ts` lacks fetch timeouts** — it is a 44-line
  TanStack hook with zero I/O. **`scripts/load-test-mobile-api.mjs`** is a load
  harness, not production. Both named in error.
- **D-8 · "The fix is adopting the shared fetch helper."** False server-side:
  `services/mobile-api/src/lib/http.ts` is 1,100 lines of JSON Schema plus
  `HttpError` and contains **zero** `fetch(` calls. The server has no shared
  wrapper to adopt. True mobile-side (`apiFetch.ts` / `mobileApiFetch.ts`).
- **D-9 · `lib/imports/run.ts`, `routes/retention.ts`, `lib/usageMeters.ts` and
  `routes/moderation.ts` swallow errors.** All four check errors properly;
  `retention.ts` throws `HttpError` 502 on each failure, and `usageMeters.ts`
  carries a comment explaining it returns null rather than zero. **No destructive
  operation reports success while having failed** anywhere in the codebase.
- **D-10 · Destructive build-script commands.** Individually guarded:
  `set -euo pipefail`, `${DST:-C:/dpb}`, narrow subpaths, `mktemp -d` + `trap`.
  The `C:\dpb` hardcoding is documented and deliberate (Windows path limits).
  `scripts/generate-icons.cjs` has a personal absolute path but zero callers, so
  it cannot block CI.
- **D-11 · The consent model is inconsistent.** It is internally consistent and
  matches CLAUDE.md exactly (Sentry ON by legitimate interest, PostHog ON since
  2026-07-19 by owner override, `app_open` regardless of either). The
  `docs/legal/counsel-review-2026-04-29/*.tsx` files are a dated audit snapshot.
  The Firebase-analytics disable is real via the hand-edited manifest.
- **D-13 · "Retries can exceed monthly/daily caps or consume paid quota twice."**
  No. `premiumEnforcement.ts:100-118` (`assertCanSaveRoute`) is count-then-insert,
  but it returns early on `!ctx.enforced`, and `premium_ui_enabled = false` for
  everyone except Apple's demo account. Once lit, a race yields 3 free saved routes
  instead of 2 — no paid quota consumed, no charge. `usageMeters.ts:11-15`
  documents its read-modify-write as deliberate, and it can only **under**-count.
- **D-12 · Migrations are not production-safe.** Largely false here: they are
  applied **by hand**, and `202605270004` is a rename-only swap (catalog
  metadata, microsecond lock, transactional, with a 7-day rollback table).

---

## Sequencing

1. **Now, DB-only, no release:** P0-1 (revoke, drop dead Mia functions), P0-2
   (drop public-read on the risk tables, RLS-lock `rrd_capfix_*`), P0-3 (trigger
   condition), **P1-11** (the `xp_events` unique index + `award_xp` gating — DB-only,
   and it closes an unbounded XP farm that is live in the shipped UI, so it earns
   its place in this step despite the P1 label). All four reach the entire fielded
   fleet without a store build — which matters, because the fleet trails `main` by
   several versions.
2. **Same day, no release:** P0-5 (`.gcloudignore`), then the rotation decision.
3. **Next client build:** P0-4 (share-image trim) with its rewritten test, plus
   P1-1, P1-2, P1-3, P1-7, P1-8.
4. **Next API deploy:** P1-4, P1-5, P1-6, P1-9, P1-10.
5. **Then:** the P2 list, and the ESLint extension via the existing ratchet.

⚠️ **Before shipping any FILES-ONLY item, confirm it live.** D-1 is the proof
that this step is not ceremony.

---

## Appendix A — re-verification queries

Run via the Management API path in the `supabase-migration-apply` memory (CLI
token from Windows Credential Manager → `POST /v1/projects/<ref>/database/query`).

**A-1 · Client-executable `SECURITY DEFINER` functions taking a uuid.** Promote
this to a runbook health check; after the fix the only rows should be the
deliberately-public ones.

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and pg_get_function_identity_arguments(p.oid) ilike '%uuid%'
  and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or has_function_privilege('anon', p.oid, 'EXECUTE'))
order by p.proname;
```

**A-2 · RLS gaps and `true` policies, with the roles they apply to.** The roles
column is essential — `TO authenticated` and `TO public` are different exposures.

```sql
select c.relname as tbl, 'RLS_DISABLED' as issue, '' as policyname, '' as roles
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
  and has_table_privilege('anon', c.oid, 'SELECT')
union all
select tablename, 'TRUE_POLICY', policyname, roles::text
from pg_policies
where schemaname = 'public' and permissive = 'PERMISSIVE'
  and (btrim(coalesce(qual,'')) = 'true' or btrim(coalesce(with_check,'')) = 'true')
order by issue, tbl;
```

**A-4 · Which `SECURITY DEFINER` functions carry an identity guard.** Run this
alongside A-1: a function that is client-executable *and* has no guard is the
dangerous combination.

```sql
select p.proname,
       (p.prosrc ilike '%auth.uid()%') as has_auth_uid_ref,
       (p.prosrc ilike '%!= auth.uid()%' or p.prosrc ilike '%<> auth.uid()%') as has_identity_guard
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by has_identity_guard desc, p.proname;
```

**A-3 · Reachability probe.** The control is the point — a probe that cannot
distinguish outcomes is worse than none (error-log #94).

```bash
# granted + read-only + nonexistent id -> expect 200
curl -s -X POST "$URL/rest/v1/rpc/get_suggested_users" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d '{"p_viewer_id":"00000000-0000-4000-8000-000000000000","p_lat":44.43,"p_lon":26.10,"p_limit":1}'

# CONTROL: not granted -> must be 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$URL/rest/v1/rpc/prune_user_telemetry_events" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" -d '{}'
```

Never probe a **write** RPC against production to demonstrate a grant. The
`has_function_privilege` result is the evidence.
