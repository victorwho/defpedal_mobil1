# sentryfix — remaining work from the error-reduction plan

Status snapshot as of 2026-05-24, after the 5-commit shipped in v0.2.62 / build 64.
Full plan lives at [`docs/plans/error-reduction.md`](docs/plans/error-reduction.md).

This file is the punch list of what's **left**, not what's done.

## Done in this round (for context)

- ✅ **P0** Sentry env-tag bug fixed + diagnostics smoke card
- ✅ **P1** MOBILE-7 offline-sync (per-type timeout, jitter, 4xx fast-fail)
- ✅ **P2** MOBILE-9 Mapbox bridge crash (`extractPointCoordinate`)
- ✅ **P3a** Per-route ErrorBoundary on 4 critical screens
- ✅ **P3c** Boundary Zod validation on 4 endpoints
- ✅ **P3d** Native-module guard audit (clean)

---

## Remaining items

### 1. P0.1 — Consent-split decision (BLOCKING for P3f)

**The question:** should crash reporting (Sentry) be separated from optional analytics (PostHog) consent? Today both flip together in `analyticsConsent` (`appStore.ts`), defaulting to `false`. Real production crash data only reaches Sentry from opted-in users, and we don't yet know what fraction that is.

**Why this matters:** if opt-in is low (likely), most production crashes are invisible. Splitting essential crash reporting (legitimate-interest basis) from analytics (opt-in basis) is the single highest-leverage change for closing the observability gap.

**What to do:**
- Pull `analyticsConsent.sentry === true` rate from PostHog (same screen captures both — proxy works).
- If opt-in is < ~50%, decide with legal whether to split.
- If split: default `sentry: true`, keep `posthog: false`; rewrite onboarding consent + `/privacy-analytics` screens; update Privacy Policy.
- Record the decision in `docs/legal/`.

**Files touched if you split:**
- `apps/mobile/src/store/appStore.ts` — default + slice shape
- `apps/mobile/app/onboarding/consent.tsx`
- `apps/mobile/app/privacy-analytics.tsx`
- `apps/web/app/privacy/page.tsx`

---

### 2. P3b — Unified API client (multi-day)

**The problem:** `apps/mobile/src/lib/api.ts` has ~50+ ad-hoc `requestJson` call sites. Errors come back as plain `Error` (now `HttpError` for the main path, but lines 770+ and 970+ still throw plain errors). MOBILE-5 and MOBILE-6 in Sentry are two different "Network request failed" issues from two different throw sites — they're the same root cause.

**What to do:**
- Build a single `apiFetch(url, opts)` wrapper: timeout, 2× retry on 5xx/network with backoff, typed error envelope `{ kind: 'timeout' | 'network' | 'http', status?, body? }`.
- Migrate every `mobileApi.*` method to use it.
- Collapse the two "Network request failed" throw paths into one.
- Tests: timeout path, retry path, 4xx-no-retry, 5xx-retry.

**Estimate:** 2–3 days. Largest blast radius of anything remaining.

**Suggested split if doing incrementally:**
- Day 1: ship `apiFetch` wrapper + tests, leave existing `requestJson` in place (parallel implementation).
- Day 2: migrate the 4 endpoints that already have boundary validation (P3c).
- Day 3: migrate the remaining endpoints + delete old `requestJson`.

---

### 3. P3e — ANR prevention pass (0.5 day, mostly investigation)

**The problem:** MOBILE-8 was a background ANR in `MainApplication.onCreate` — 1 event, low signal, but worth a precautionary review.

**What to do:**
- Open `apps/mobile/android/app/src/main/java/.../MainApplication.kt`. Anything synchronous and heavy → background thread or lazy init.
- Audit `apps/mobile/app/_layout.tsx`: any work that runs on first paint should move to `InteractionManager.runAfterInteractions` (e.g., non-critical provider mounts, telemetry warm-ups, prefetches).
- May yield small or large fix depending on what's there. Worst case: no changes, document that the cold-start path is already lean.

---

### 4. P3f — Tag pre-JS fatals (blocked on P0.1)

**The problem:** MOBILE-8 (cold-start ANR) and MOBILE-9 (native bridge cast) both have **empty `app_variant` tag** because they fired before `Sentry.init` ran in JS. Native crashes are the most important events we capture, and they're currently untagged → untriagable. Can't tell apart a v0.2.38 production fatal from a dev one without going into stack details.

**Two options:**
- **(a) Native-side Sentry init in `MainApplication.onCreate`** with `app_variant` resolved from `BuildConfig.FLAVOR`. Means Sentry receives every fatal regardless of consent state — entangled with P0.1.
- **(b) Sentry server-side processing rule** that derives `app_variant` from the release string (`com.defensivepedal.mobile@0.2.38+40` → `production`, `.preview` package → `preview`, `.dev` → `development`). Pure dashboard config, no code, but requires verifying Sentry's filter/processing API actually supports it.

**Pick (a) if P0.1 decides crash reporting should be split out of analytics consent (you're already initializing without consent gating natively).**
**Pick (b) if P0.1 stays with consent-gated crash reporting.**

---

### 5. Phase 4 — Pre-release process (0.5 day + ongoing)

**Already in the plan, just listed here for completeness:**
- Add a release smoke checklist to `apkreleases/release-notes-template.txt`: cold-launch / plan route / start nav / end ride / view trips / community / sign in–out.
- Extend CI (additive to the existing typecheck) with `npm test --workspaces` and `npm audit --audit-level=high`.
- Document the "crash-free users ≥ 99.5% on previous track for 24h" rollout gate in `CLAUDE.md` under Play Store Release.

---

### 6. Spot bugs to verify on the new preview build

These came up during the work but weren't deliverables themselves.

**6a. `i18n` bridgeless locale fallback (from P3d audit)**
- `apps/mobile/src/i18n/index.ts:25` reads `NativeModules.I18nManager?.localeIdentifier`. RN core's `I18nManager` may not be reachable through `NativeModules` on the bridgeless New Architecture (preview/production run bridgeless per CLAUDE.md).
- **If broken:** Romanian users silently fall back to English. Graceful degradation, no crash, but a real UX bug.
- **How to verify:** install the v0.2.62 preview APK (released 2026-05-24, Firebase release `6ckj73cl05pq0`), set the device language to Romanian, cold-launch the app, confirm the UI is in Romanian.
- **If broken:** use `expo-localization` `getLocales()` instead — the official cross-platform API.

**6b. Release Health alert in Sentry dashboard**
- Sentry → Releases → enable Sessions / Crash-Free Users if not already.
- Alert rule: notify if crash-free users < 99.5% over 1h on `environment=production`. Now that the env tag is correct, this can actually fire on real prod regressions.

**6c. Source-map upload verification**
- Inspect the next EAS preview build log for the `sentry-cli sourcemaps upload` step. The fail-fast in `app.config.ts` only guards production; preview should also have the step running but it's not currently enforced.

---

## Sequencing recommendation

| Order | Item | Reason |
|---|---|---|
| 1 | **6a i18n bridgeless check** | 10-minute test on the just-distributed APK; if Romanian works, close it. If not, fix before next preview round. |
| 2 | **6b Release Health alert** | 5-minute dashboard config; gives signal for everything after. |
| 3 | **P0.1 consent decision** | Blocks P3f. Mostly research + decision, not code. |
| 4 | **P3e ANR investigation** | Quick; may surface real wins or close with "all good". |
| 5 | **P3f fatal tagging** | After P0.1 decides. |
| 6 | **P3b unified API client** | Multi-day refactor — last because it has the largest blast radius and benefits from the other items being stable. |
| 7 | **Phase 4 pre-release process** | Continuous; can start in parallel with any of the above. |

---

## Where things live

- Plan (full): [`docs/plans/error-reduction.md`](docs/plans/error-reduction.md)
- Error log entries this round added: [#46](.claude/error-log.md) (env-tag bug), [#47](.claude/error-log.md) (Mapbox bridge cast)
- Sentry MCP agent (parked, resumable): `a767d6ccd2c642b3e`
- Firebase preview release: `6ckj73cl05pq0` (v0.2.62 / build 64)
