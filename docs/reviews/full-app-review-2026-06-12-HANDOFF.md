# Full-App Review — Session Handoff

**Date:** 2026-06-13
**Branch:** `main` (all work pushed; `main` == `origin/main`)
**Last commit:** `5d25a6a` — fix: Phase 4 (2/2) — /health/deep readiness probe
**Live API:** Cloud Run `defpedal-api-00093-9pg` (europe-central2)
**Source of truth for findings:** [`full-app-review-2026-06-12.md`](./full-app-review-2026-06-12.md)
**Running log:** `progress.md` sessions 75 / 75b / 75c / 75d / 75e

---

## TL;DR

A 58-agent review (`docs/reviews/full-app-review-2026-06-12.md`) found **2 P0, ~24 P1, ~74 P2, ~59 P3**. Across this work:

- **Phases 0–3: COMPLETE.** Both P0s, all ~24 P1s, and the confirmed P2 clusters are fixed, tested, committed, and (where server-side) deployed.
- **Phase 4: highest-value subset DONE; the rest is an explicit backlog** (see "What's left").

Net infra changes this review:
- Cloud Run revisions `00090 → 00093` (4 deploys).
- Supabase migrations applied live: `202606120001` (trip_tracks RLS), `202606120002` (route-share hide_endpoints), `202606120003` (Phase 1 security). **All also committed to `supabase/migrations/`.**

If you do nothing else: **the review's critical work is shipped.** The remaining items are backlog — pick by priority below.

---

## How to resume

1. Read `progress.md` top section (sessions 75–75e) — the authoritative per-phase ship log.
2. Read the review report `full-app-review-2026-06-12.md` for any finding's file:line + verifier note.
3. Memory file `~/.claude/projects/C--dev-defpedal/memory/project_full-app-review-2026-06-12.md` has the same status summary.
4. **Each commit `fix: Phase N (...)` is self-describing** — `git show <hash>` for the exact diff + rationale.

### Build / test / deploy commands (from `.claude/CLAUDE.md`)
- Mobile tests: `cd apps/mobile && npx vitest run`
- API tests: `cd services/mobile-api && npx vitest run`
- Typecheck (enforces i18n locale parity): `npm run typecheck`
- Bundle health (MUST be 200 before phone test): `npm run check:bundle` (needs Metro: `cd apps/mobile && npx expo start`)
- API deploy: `gcloud builds submit --config cloudbuild.yaml --timeout=600` **then** `gcloud run deploy defpedal-api --image europe-central2-docker.pkg.dev/gen-lang-client-0895796477/defpedal-api/mobile-api:latest --region europe-central2 --platform managed --allow-unauthenticated`
- Supabase migrations: applied this session via the `plugin:supabase:supabase` MCP (`apply_migration`). **Always drift-check live RPCs with `pg_get_functiondef` via `execute_sql` BEFORE editing them** (see memory `reference_supabase-rpc-drift.md`).

---

## What's DONE (committed + deployed)

| Phase | Commit | Highlights | Deploy |
|---|---|---|---|
| 0 | `53a6065` | **P0** trip_tracks RLS leak, **P0** route-share hide_endpoints leak (+ backfilled all 12 legacy share payloads); ride-lifecycle cluster (End Ride cancel, BackHandler, unified kill-recovery, discard→resetFlow); GET impact schema; trips/track bikeType; 30s trip-sync timeout. Also fixed the **API Docker build that had been broken since 2026-06-09** (patch-package postinstall → `scripts/run-patch-package.cjs`). | `00090` |
| 1 | `3e3e028` | Comment-table moderation bypass + `is_hidden`; quiz_answers RLS; stats RPCs service-role-only; v2 comment endpoint hardened; dead `/search/*` endpoints deleted; `/hazards/nearby` clamp+throttle; impact metric bounds; shared timing-safe `cronAuth`; central 5xx detail-stripping; **forgot-password flow**; FAQ factual rewrite; honest signup copy. | `00091` |
| 2 | `4c35428` `612c48e` `efe3634` | Deep-link hijack fixes (install-referrer persist, onboarding-hijack guard, iOS clipboard disable); **celebration coordinator** (`store/celebrationStage.ts`); notification-permission timing; ghost-button + textMuted a11y contrast; **onboarding i18n** (51 keys ×3, all 6 screens); nudge dedup + cron quiet-hours-for-P0; push structured results + dead-token pruning; nudge tap funnel end-to-end. | `00092` |
| 3 | `5511595` `74f6d81` | Background samples merged into trip trail (`mergeBackgroundBreadcrumbsIntoSession`); 20→1000 sample cap + batch persist; `killServiceOnDestroy` swipe-away fix; offline packs real `createdAt`, store-sync-after-cleanup, protected-route exemption. | mobile-only |
| 4 | `e652eeb` `5d25a6a` | Persist-adapter debounce (`createDebouncedStorage` + flush-on-background); Trophy Case FlatList virtualization; Button `minHeight` font-scale; sheet-handle a11y; foreground-service notification i18n; **`GET /health/deep`** Supabase readiness probe. | `00093` |

---

## What's LEFT (backlog, prioritized)

> **STATUS UPDATE (2026-06-14, sessions 75f–76 — see progress.md for detail):** Most of this backlog is now DONE.
> - **A1 Anonymous→account merge** — ✅ BUILT + DEPLOYED + device-verified (fresh-target-only; `merge_anonymous_account` RPC + `POST /v1/account/merge-anonymous` + mobile wiring). Migration `202606140001`.
> - **A2 3 crons** — ✅ DONE: `streak-reminders` + `social-digest` deleted (dead/superseded); `weekly-impact` kept + scheduled (`weekly-impact-cron`, Sun 9AM).
> - **A3 CI `--coverage`** — ⏳ still open (needs a coverage audit first).
> - **A4 Like-vs-Love** — ✅ DONE (consolidated to one heart; migration `202606140002`). **Signup-wall** — ✅ kept as-is (product decision).
> - **B5 Sentry on API** — ✅ DONE + live (`lib/sentry.ts`, `00094`). **B7 Dead-letter ride-loss banner** — ✅ DONE. **B6 Trip-history payload diet** — ⏳ deferred (re-classified device-needed: `TripCard` renders the trail on expand + uses it as a distance fallback).
> - **C9 i18n long tail** — ✅ impact-dashboard + my-shares localized; rest (Profile rows, ~97 a11y labels) ⏳ open. **C10 a11y** — ✅ date-locale + Reduce-Motion gating; HoloSticker/ImpactSummaryCard motion ⏳ open. **C8 code-quality** (v1.ts split / Overpass consolidation / `as any`) + **C11 feed-card thumbnail** — ⏳ open.
> - Plus: forgot-password flow shipped; follow-requests 500 fixed; Cloud Run `00093→00098`.

### A. Needs a human decision (do these first — they unblock work)
1. **Anonymous → account data merge endpoint** (review P1 #10, the original L item). Phase 0 only softened the false "your data will be preserved" copy. A real fix is a server endpoint that re-parents anonymous rows to the new user id on sign-in. **Product/scope decision needed** (is the merge worth building, or is the honest copy sufficient?).
2. **3 unscheduled cron endpoints** (`/v1/cron/streak-reminders|weekly-impact|social-digest`) — defined but no Cloud Scheduler job. **Decide: create the jobs, or delete the endpoints as dead code** (streak-reminders is likely superseded by the Pedal nudge streak triggers).
3. **CI `--coverage` enablement** (P3) — thresholds (80%) are defined in vitest configs but CI runs without `--coverage`. **Audit current coverage first** — enabling blindly could red the build.
4. **Like-vs-Love consolidation** + **signup-wall threshold** (P3 product calls).

### B. High-value, tractable, no device needed
5. **Sentry on Fastify API** (P2 observability) — the mobile app has Sentry but the API has none; 500s are only visible in Cloud Run logs. Add `@sentry/node` init in `server.ts` + `captureException` in `setErrorHandler` and cron catch paths. (`/health/deep` from Phase 4 is the companion.)
6. **Trip-history payload diet** (P2 perf) — `GET /v1/trips/history` ships full GPS trails (up to 2000 pts × 50 trips). Drop `gps_trail` from the list endpoint. **First verify client consumers** — `trips.tsx` and any share-card trail extraction must fetch the trail per-trip instead.
7. **Dead-letter ride-loss banner** (P2) — a dead `trip_start` cascade-kills the whole ride's server record, and the only retry path is the dev Diagnostics screen. Surface a banner/toast driven by `queuedMutations.status === 'dead' && TRIP_CRITICAL_TYPES` with Retry/Dismiss (`retryDeadMutations()` exists).

### C. Larger / incremental
8. **Code quality (L)** — split `services/mobile-api/src/routes/v1.ts` (3,704 lines) by domain (trips/hazards/badges/quiz/cron); consolidate the triplicated Overpass clients (`bicycle-parking/rental/shops.ts`) into one `overpass.ts`; reduce the 74 `as any` casts (concentrated in Mapbox layer components).
9. **i18n long tail** (P2) — `impact-dashboard.tsx` (zero `t()` calls), `my-shares.tsx`, several Profile rows, ~97 hardcoded `accessibilityLabel`s. Same mechanical pattern as the Phase 2 onboarding wiring (locale parity is type-enforced, so typecheck catches misses).
10. **Broader a11y sweep** (P2) — reduced-motion gating on `BadgeUnlockOverlay` particle burst + `XpGainToast`/`BadgeProgressBar`/`ImpactSummaryCard`/`HoloSticker`; touch-target bumps on `HazardDetailSheet` (40dp→44dp controls); `en-US`-hardcoded date locale in `StatsDashboard`/`RideShareCard`.
11. **Feed-card lightweight map thumbnail + mascot PNG downscale** (P2 perf) — each visible community-feed card mounts a full Mapbox MapView; mascot PNGs decode at 1080×1350 for 28-120px renders. The mascot downscale needs asset regen (`scripts/process-holo-badges.py`-style), so it's riskier.

### D. Deferred from earlier phases (documented)
12. **Phase 3 item 28 — background-permission denial UX** (P2). Pre-permission priming sheet + persistent "lock-screen tracking off" HUD pill. **Deliberately not shipped: only meaningfully testable on a device** (real `ACCESS_BACKGROUND_LOCATION` denial + `Linking.openSettings`).
13. **Low-sev offline-pack findings** — content-keyed pack IDs (currently keyed by ephemeral timestamped route ids → duplicate packs accumulate), tile-count limit for long routes, resume interrupted downloads, real byte accounting (currently a 15KB/resource guess), humanize raw-coordinate destination labels.
14. **Full push receipts-polling cron** — Phase 2 did immediate in-ticket `DeviceNotRegistered` pruning + fixed `checkReceipts` correctness, but the async receipts poll needs a ticketId→token persistence table + a Cloud Scheduler job.
15. **iOS deferred-deep-link** — the web `/r/<code>` viewer must write the `{dp_share, ts}` clipboard payload (on a user gesture) before the mobile clipboard reader is re-enabled (currently disabled).

---

## ⚠️ MANUAL-TEST DEBT (needs a real device — could not be verified from this environment)

These shipped and pass automated tests, but their real behavior is device-only:

1. **Forgot-password loop** (Phase 1): request reset email → tap link in inbox → land on `/reset-password` → set new password. Tests the email round-trip + recovery deep-link detection (`lib/passwordReset.ts`).
2. **RO/ES onboarding flow** (Phase 2): switch locale to Romanian/Spanish, run onboarding — verify all 6 screens are translated. **Plus celebration sequencing**: after a first ride, confirm badge/rank-up/MeetPedal overlays show **one at a time** (not stacked).
3. **Lock-screen ride recording** (Phase 3): start navigation, lock the phone, ride/move for several minutes, unlock → confirm the locked stretch is in the trip distance (background-merge). **Plus swipe-away**: swipe the app from recents mid-ride → confirm the persistent location notification disappears (`killServiceOnDestroy`).
4. **End Ride / hardware-back** (Phase 0): End Ride dialog has Keep-riding/Discard/Save; tapping outside keeps riding; Android back mid-ride opens the End Ride dialog (not a zombie state).

Test against the **dev variant** (`com.defensivepedal.mobile.dev`, Metro-fed) — the preview/production variants run embedded bundles and won't have these changes until rebuilt (error-log session-57 trap: 3 variants installed, easy to test the wrong one).

---

## Gotchas a fresh session must know

- **Locale parity is type-enforced.** `ro`/`es` are typed `TranslationKeys` (from `en`), so a passing `npm run typecheck` *guarantees* all three locales have the same keys. Add keys to all three or typecheck fails.
- **Persist debounce is disabled under vitest** (`isTestEnv` in `lib/storage.ts`) — the global async-storage mock would otherwise leave dangling timers causing flaky cross-file failures. The debounce logic is tested via the exported `createDebouncedStorage` factory.
- **Supabase RPC drift is real** — live RPCs have diverged from `supabase/migrations/`. Always `pg_get_functiondef` the live version before editing (memory `reference_supabase-rpc-drift.md`).
- **API Docker build** depends on `scripts/run-patch-package.cjs` (root `postinstall`) being copied into both Dockerfile stages — don't remove it or the build 127s again.
- **Pre-push hook** runs typecheck + lint ratchet. Don't `--no-verify`. New lint violations need `npm run lint:baseline` (from `apps/mobile/`) if intentional.
- Junk in the working tree (`design-work/`, `*.docx`, `marketing/`, `screenshots/`, `.mcp.json`, `vitest.setup.ts.tmp`, the pre-existing untracked `202605050002_*.sql` migration) is **not mine** — leave it.
