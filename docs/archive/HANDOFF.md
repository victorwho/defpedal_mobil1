# Handoff — `design-quality-pass` worktree

**Worktree:** `C:\dev\defpedal\.claude\worktrees\design-quality-pass`
**Branch:** `worktree-design-quality-pass` (off `3cbba55` from `main`)
**Date:** 2026-04-26 (updated)
**Status:** Phase 1 + **Phase 2** of P1-30 complete (hex sweep + R3 Surface migration + forced-dark ROUTE_PREVIEW) + 2 production hotfixes + onboarding-UX polish + CI wired for lint/contrast. Nothing committed yet.

---

## 1. Read these first

In order:

1. **[`docs/design-context.md`](docs/design-context.md)** — the rules-of-the-road: token rules, theme direction, motion rules, haptic map, accessibility gates, explicit drops. *Read this before any visual change.*
2. **[`docs/plans/design-audit-implementation.md`](docs/plans/design-audit-implementation.md)** — the 8-week phased plan for P1-30 (Design Quality Pass). Phase 1 is done; Phase 2 is the natural continuation.
3. **[`apps/mobile/LINT.md`](apps/mobile/LINT.md)** — setup + usage of the new ESLint ratchet (R1).
4. **[`docs/haptic-map.md`](docs/haptic-map.md)** — per-interaction haptic intent map (R14).
5. **[`docs/contrast-baseline.md`](docs/contrast-baseline.md)** — current contrast scores + 7 known regressions allow-listed in the ratchet (R5).

If you only have time for one, read the **plan** — it has the full picture and links back to the rest.

---

## 2. What landed in this worktree

### Phase 1 of the Design Quality Pass (P1-30)

| Item | Status | Files (key) |
|---|---|---|
| **R1** ESLint infra + hex/rgba ban with baseline ratchet | ✅ verified | `apps/mobile/.eslintrc.cjs`, `apps/mobile/scripts/lint-ratchet.mjs`, `apps/mobile/.eslint-baseline.json` (16 files, 85 violations baselined), `apps/mobile/LINT.md`, root + workspace `package.json` scripts |
| **R5** Contrast + colour-not-only CI gate (both themes) | ✅ verified | `packages/core/src/contrast.ts` + `.test.ts` (WCAG calculator, 25 tests), `apps/mobile/src/design-system/tokens/__tests__/contrast.test.ts` (32 tests, 7 known regressions ratcheted), `docs/contrast-baseline.md` |
| **R7** `Toggle` import lint guard (locks in current good state — audit's premise was stale) | ✅ verified | `apps/mobile/.eslintrc.cjs` `no-restricted-imports` rule |
| **R14** Haptic calibration map | ✅ verified | `apps/mobile/src/design-system/tokens/haptics.ts` (6 semantic tokens), `apps/mobile/src/design-system/hooks/useHaptics.ts` (rewritten with NAVIGATING suppression + safety-critical override + lazy require), 7 callsite migrations, 6 test mocks updated, `docs/haptic-map.md` |

### Hotfixes deployed to Cloud Run during the session

| Fix | Cloud Run revision | Notes |
|---|---|---|
| `/v1/risk-map` returned features without `color` → all road segments rendered uniform | `defpedal-api-00066-xxr` | New `enrichRiskGeoJson` helper in `services/mobile-api/src/lib/risk.ts`, wired through `dependencies.ts`, called from `/v1/risk-map` handler in `routes/v1.ts`. 8 unit tests in `risk-enrich.test.ts` |
| Anonymous users got 403 on `/v1/risk-map` → onboarding map empty for first-impression viewers | `defpedal-api-00067-mrh` | Swapped `requireOAuthUser` → `requireWriteUser` on this single endpoint. Other 3 risk endpoints (`/routes/preview`, `/routes/reroute`, `/risk-segments`) still full-OAuth. 2 new tests in `security-risk-ip.test.ts` |

### Onboarding/auth UX polish (worktree-only, not yet built into a release APK)

| Pain point | Fix | File |
|---|---|---|
| `/auth` showed "Logged in as anon-user-..." panel for anonymous users — they had to tap Sign Out before they could sign up | Render auth form for `!hasRealAccount` instead of just `!user` | `apps/mobile/app/auth.tsx` |
| Profile guest card said "Anonymous" — confusing technical label | Friendly "Sign in or create account" + "Save your rides, badges, and progress" subline (en + ro) | `apps/mobile/app/profile.tsx` + `i18n/{en,ro}.ts` (`profile.signInOrUp` + `profile.signInOrUpSub`) |
| Signing out re-triggered the 5-screen onboarding flow | Removed `setOnboardingCompleted(false)` + `router.replace('/onboarding')` from Profile sign-out handler; removed `onboardingCompleted: false` from `resetUserScopedState` so onboarding-completed is per-device, not per-user | `apps/mobile/app/profile.tsx`, `apps/mobile/src/store/appStore.ts` |

### Phase 2 of the Design Quality Pass (P1-30) — added 2026-04-26

| Item | Status | Files (key) |
|---|---|---|
| **R10-ext** Hex/rgba sweep across `apps/mobile/app/**` | ✅ verified | Lint baseline went from 12 files / 45 violations → **0/0** (empty `apps/mobile/.eslint-baseline.json`). 13 screens cleaned: auth, _layout, city-heartbeat, diagnostics, offline-maps, trip-map, navigation, onboarding/{index,first-route,goal-selection,safety-score,signup-prompt} + earlier feedback/profile/route-planning/route-preview from prior session |
| **R3** `<Surface>` atom — full rewrite + adoption | ✅ verified | `apps/mobile/src/design-system/atoms/Card.tsx` rewritten: theme-aware, 6 variants (`solid \| glass \| outline \| form \| accent \| panel`), 5 elevations (`inset \| flat \| sm \| md \| lg`), 3 radii (`lg \| xl \| 2xl`), `onPress`/`onLongPress`/`disabled`/`pressedStyle`/`accessible`. Tests: 5 → 17 passing. **20 cards migrated across 14 files**: city-heartbeat (×4), first-route, choose-username, feedback (×2), community, history (×3), impact-dashboard, goal-selection, auth (×2 uses), user-profile (×2), navigation hazardGrid, route-planning hazardGrid. `Surface` exported as alias of `Card` |
| **Forced-dark for ROUTE_PREVIEW** (§1 D1) | ✅ verified | `apps/mobile/src/design-system/ThemeContext.tsx` — extended `appState === 'NAVIGATING'` check to also force dark during `ROUTE_PREVIEW`. Light-mode users now see dark route preview (handlebar mount likely) |
| **CI wiring** of lint + contrast gates | ✅ verified | `.github/workflows/ci.yml` — added `Lint ratchet (mobile)` (calls `npm run lint:mobile:check`) and `Contrast check (mobile)` (calls `npm run check:contrast`) steps before `npm run validate`. Lint baseline is empty so any new violation in `apps/mobile/app/**` blocks CI |

#### Cards NOT migrated (deferred with rationale)

| Card | Why deferred |
|---|---|
| `daily-quiz.tsx` `feedbackCard` | Wrapped in `Animated.View` with animated opacity — Surface wraps a regular View / Pressable, not Animated. Two options: (a) wrap as `<Animated.View><Surface>...</Surface></Animated.View>`, (b) make Surface forward animated styles. Tiny scope; leave for follow-up |
| `route-planning.tsx` map overlay cards (origin/destination/cached/search/FAB) | Use `MAP_OVERLAY_BG` constant pattern (white over dark map regardless of theme). Not the same concept as Surface chrome — different concern |

### Incidental fixes in passing

- **`apps/mobile/metro.config.js`** — its `blockList` blocked everything inside `.claude/worktrees/`, breaking Metro when run FROM a worktree. Now auto-detects the situation and skips the self-block. Safe to keep on main (no behavioural change for normal usage).
- **`apps/mobile/src/design-system/hooks/useHaptics.ts`** — was using top-level `import * as Haptics from 'expo-haptics'`, which crashes on builds missing the native binary (CLAUDE.md gotcha #8). Rewritten with the lazy `require` + `NativeModules.ExpoHaptics` guard pattern from `src/lib/haptics.ts`.
- **`apps/mobile/src/design-system/molecules/HazardAlertPill.tsx`** — comment said "always fires (even with reduced motion)" but the hook short-circuited on `reducedMotion`. Now actually true via `warning.safetyCritical: true` in the new haptic token system.

---

## 3. Verification gates (all green)

```bash
npm run typecheck                # all 3 workspaces
npm run lint:mobile:check        # ratchet — 16 files at baseline, 85 total violations, 0 regressions
npm run check:contrast           # 32/32 tests, 7 known regressions allow-listed
npm run check:bundle             # HTTP 200 (requires Metro running)
cd packages/core && npx vitest   # 25/25 (WCAG calculator)
cd services/mobile-api && npx vitest run    # 457/457
cd apps/mobile && npx vitest run            # 866 pass, 4 pre-existing failures (FeedCard.champion, LeaderboardSection, ConnectivityMonitor — unrelated to this work, confirmed by stashing changes and reproducing)
```

---

## 4. Files in the worktree but NOT yet committed

### Modified
```
.claude/CLAUDE.md
apps/mobile/app/auth.tsx
apps/mobile/app/navigation.tsx
apps/mobile/app/profile.tsx
apps/mobile/metro.config.js
apps/mobile/package.json
apps/mobile/src/design-system/atoms/Button.tsx
apps/mobile/src/design-system/atoms/Toggle.tsx
apps/mobile/src/design-system/atoms/__tests__/Button.test.tsx
apps/mobile/src/design-system/atoms/__tests__/LeaderboardRow.test.tsx
apps/mobile/src/design-system/atoms/__tests__/ShareRouteButton.test.tsx
apps/mobile/src/design-system/atoms/__tests__/Toggle.test.tsx
apps/mobile/src/design-system/hooks/useHaptics.ts
apps/mobile/src/design-system/molecules/HazardAlertPill.tsx
apps/mobile/src/design-system/organisms/BottomSheet.tsx
apps/mobile/src/design-system/organisms/HazardDetailSheet.tsx
apps/mobile/src/design-system/organisms/Modal.tsx
apps/mobile/src/design-system/organisms/__tests__/HazardDetailSheet.test.tsx
apps/mobile/src/design-system/organisms/__tests__/LeaderboardSection.test.tsx
apps/mobile/src/i18n/en.ts
apps/mobile/src/i18n/ro.ts
apps/mobile/src/store/appStore.ts
package-lock.json
package.json
packages/core/src/index.ts
services/mobile-api/src/__tests__/security-risk-ip.test.ts
services/mobile-api/src/lib/dependencies.ts
services/mobile-api/src/lib/risk.ts
services/mobile-api/src/routes/v1.ts
```

### Untracked
```
.claude/design-bundle/                           (source audit + chat — kept for reference)
apps/mobile/.eslint-baseline.json
apps/mobile/.eslintrc.cjs
apps/mobile/LINT.md
apps/mobile/scripts/lint-ratchet.mjs
apps/mobile/src/design-system/tokens/haptics.ts
apps/mobile/src/design-system/tokens/__tests__/contrast.test.ts
docs/contrast-baseline.md
docs/design-context.md
docs/haptic-map.md
docs/plans/design-audit-implementation.md
docs/plans/p1-30-issue-draft.md
packages/core/src/contrast.ts
packages/core/src/contrast.test.ts
services/mobile-api/src/__tests__/risk-enrich.test.ts
HANDOFF.md                                        (this file)
```

The user has been deferring commit until they finish testing. **Do not commit on their behalf** unless asked. Splitting into logical commits is a reasonable opening move — see suggested split in §7.

---

## 5. State on `main` (separate from this worktree)

The user explicitly requested that work stay isolated to this worktree until they test. The only main-tree changes I made were intentional:

- `C:\dev\defpedal\changestoimplement.md` — added one entry under `## Profile` documenting the Supabase **anonymous → real account upgrade** improvement (use `auth.updateUser` / `auth.linkIdentity` instead of `auth.signUp` / `auth.signInWithOAuth` to preserve user id and ride data). Uncommitted on main; user will commit when convenient.

Everything else from this session lives only in this worktree.

---

## 6. Suggested next work

In rough priority order:

1. **User commits the worktree.** All Phase 1 + Phase 2 work + hotfixes + UX polish ready. Phone QA passed. (See §7 for commit split if desired.)
2. **Open the GitHub issue.** `docs/plans/p1-30-issue-draft.md` is a ready-to-paste issue body for `victorwho/defpedal_mobil1`. Awaits user explicit `gh issue create` permission (publicly visible action).
3. **R13 · Accent-discipline sweep** — small, visually impactful, and light-mode now exposes screens with multiple yellow CTAs competing. ~1 session.
4. **R11 · Empty / Error / Loading state audit** — separate, meaningful effort. Especially `route-planning.tsx` (1893 LOC, many states). Plan: walk every screen, document missing empty/error/loading framing, ship a per-screen polish PR. ~2-3 sessions.
5. **`daily-quiz.feedbackCard`** Surface migration — tiny loose end (Animated.View wrapping). Either wrap as `<Animated.View><Surface>...</Surface></Animated.View>` (extra layer, fine), or make Surface forward animated styles.
6. **Phase 3 of the plan.** Per `docs/plans/design-audit-implementation.md` §4: R4 (haptic calibration), R8 (`useSafetyColor()` hook), R9-ext (Dynamic Type snapshots), R12 (motion discipline audit), post-ride celebration tuning.
7. **Pick up the changestoimplement entry on main** — Supabase anon→real account upgrade. Standalone PR; surface area is `apps/mobile/src/lib/supabase.ts`.

---

## 7. Suggested commit split (when the user is ready)

To keep `git log` readable on main:

1. **`feat(design-system): R1 lint infra + hex/rgba ban with baseline ratchet`**
   - `apps/mobile/.eslintrc.cjs`, `.eslint-baseline.json`, `scripts/lint-ratchet.mjs`, `LINT.md`
   - `apps/mobile/package.json` + root `package.json` (lint scripts)
   - `package-lock.json`
2. **`feat(design-system): R5 WCAG contrast + colour-not-only CI gate`**
   - `packages/core/src/contrast.ts` + `.test.ts` + `index.ts`
   - `apps/mobile/src/design-system/tokens/__tests__/contrast.test.ts`
   - `apps/mobile/package.json` + root `package.json` (`check:contrast` script — already in commit 1, may need rebase)
   - `docs/contrast-baseline.md`
3. **`feat(design-system): R14 semantic haptic tokens + NAVIGATING suppression`**
   - `apps/mobile/src/design-system/tokens/haptics.ts`
   - `apps/mobile/src/design-system/hooks/useHaptics.ts`
   - `apps/mobile/src/design-system/atoms/{Button,Toggle}.tsx`
   - `apps/mobile/src/design-system/molecules/HazardAlertPill.tsx`
   - `apps/mobile/src/design-system/organisms/{BottomSheet,Modal,HazardDetailSheet}.tsx`
   - `apps/mobile/app/navigation.tsx`
   - 6 test files in `__tests__/`
   - `docs/haptic-map.md`
4. **`feat(design-system): R7 Toggle import lint guard`**
   - `apps/mobile/.eslintrc.cjs` (additive — overlaps with commit 1; squash if preferred)
   - `apps/mobile/LINT.md` (Toggle section)
5. **`fix(api): /v1/risk-map enriches segments with color + allows anonymous users`** *(already deployed to prod as `00066-xxr` + `00067-mrh`)*
   - `services/mobile-api/src/lib/risk.ts` (`enrichRiskGeoJson`)
   - `services/mobile-api/src/lib/dependencies.ts`
   - `services/mobile-api/src/routes/v1.ts` (`/v1/risk-map` handler — switches `requireOAuthUser` → `requireWriteUser`, calls `enrichRiskGeoJson`)
   - `services/mobile-api/src/__tests__/risk-enrich.test.ts`
   - `services/mobile-api/src/__tests__/security-risk-ip.test.ts`
6. **`fix(auth-ux): anonymous users see Sign-in form, not "Logged in" panel; sign-out no longer re-triggers onboarding`**
   - `apps/mobile/app/auth.tsx`
   - `apps/mobile/app/profile.tsx`
   - `apps/mobile/src/store/appStore.ts` (`resetUserScopedState` no longer touches `onboardingCompleted`)
   - `apps/mobile/src/i18n/{en,ro}.ts` (`profile.signInOrUp` + `signInOrUpSub`)
7. **`docs(design): plan + design-context + handoff`**
   - `docs/design-context.md`
   - `docs/plans/design-audit-implementation.md`
   - `docs/plans/p1-30-issue-draft.md`
   - `.claude/CLAUDE.md` (§Design System pointers)
   - `.claude/design-bundle/` (audit source bundle — *optional*; could also be `.gitignore`d)
   - `HANDOFF.md` (this file — *optional*)
8. **`chore(harness): metro.config.js worktree-aware blockList`**
   - `apps/mobile/metro.config.js`
9. **`feat(design-system): R10-ext hex/rgba sweep — apps/mobile/app/**`** *(Phase 2)*
   - 13 screens cleaned (auth, _layout, city-heartbeat, diagnostics, offline-maps, trip-map, navigation, all 5 onboarding, plus earlier feedback/profile/route-planning/route-preview)
   - New tokens added: `colors.bgForm`, `safetyTints.{safeBorderStrong, cautionBorder}`, `surfaceTints.trackDim`
   - `apps/mobile/.eslint-baseline.json` reduced to `{}`
10. **`feat(design-system): R3 Surface atom rewrite + 20-card migration`** *(Phase 2)*
    - `apps/mobile/src/design-system/atoms/Card.tsx` — full rewrite (theme-aware, 6 variants, 5 elevations, 3 radii, pressable + a11y)
    - `apps/mobile/src/design-system/atoms/__tests__/Card.test.tsx` — 5 → 17 tests
    - `apps/mobile/src/design-system/atoms/index.ts` — exports `Surface`, type aliases
    - 14 screen files: city-heartbeat, first-route, choose-username, feedback, community, history, impact-dashboard, goal-selection, auth, user-profile, navigation, route-planning + dropped dead `Card` import
11. **`feat(design): force dark theme during ROUTE_PREVIEW (§1 D1)`**
    - `apps/mobile/src/design-system/ThemeContext.tsx` — single condition extended
12. **`ci: wire lint ratchet + contrast gate into CI`**
    - `.github/workflows/ci.yml` — adds two steps before `npm run validate`

---

## 8. Open follow-ups (not blocking)

- **Pre-existing test failures unrelated to this work** — 4 tests in `apps/mobile`:
  - `src/components/__tests__/FeedCard.champion.test.tsx` — rollup parse error
  - `src/design-system/organisms/__tests__/LeaderboardSection.test.tsx` — `__DEV__ is not defined` from `expo-modules-core`
  - `src/providers/ConnectivityMonitor.test.tsx` (3 tests) — also `__DEV__`
  - Confirmed pre-existing by reverting all my changes and re-running. Not in scope for this branch.
- **Stale Supabase refresh-token toast** — `AuthApiError: Invalid Refresh Token: Refresh Token Not Found` shows up on dev as a benign warning when a persisted refresh token has expired. AuthSessionProvider's recovery already works (falls through to anonymous sign-in). Cosmetic only — silenceable via `LogBox.ignoreLogs([/Refresh Token Not Found/])` in `_layout.tsx` if it becomes annoying.
- **P1-21 Phase 3 TalkBack QA** — non-blocking, runs in parallel. The plan does not block on it.

---

## 9. Operational notes for resuming

### Running the dev app on the user's phone (USB-connected Pixel-class device, package `R5CX61E737J`)

Per CLAUDE.md gotcha #1, port forwards drop on every USB reconnect. After plugging back in:

```bash
adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8080 tcp:8080
```

Then ensure Metro is running from THIS worktree (so the phone gets the worktree's JS, not main's):

```bash
npm run dev:mobile          # runs `expo start` in apps/mobile
```

Wait for `packager-status:running`, then:

```bash
npm run check:bundle        # MUST be HTTP 200 before phone testing
```

If the bundle 404s with "Unable to resolve module ./index from .claude/worktrees/...", `metro.config.js`'s `isInsideWorktree` detection has regressed. Check the conditional in that file.

### Cloud Run deploy

Project: `gen-lang-client-0895796477` (NOT the gcloud default `osrmro1`). Pass `--project` explicitly:

```bash
gcloud builds submit --config cloudbuild.yaml --timeout=600 --project=gen-lang-client-0895796477
gcloud run deploy defpedal-api \
  --image europe-central2-docker.pkg.dev/gen-lang-client-0895796477/defpedal-api/mobile-api:latest \
  --region europe-central2 --platform managed --allow-unauthenticated \
  --project=gen-lang-client-0895796477 --quiet
```

Last revisions during this session: `00066-xxr` (color enrich), `00067-mrh` (anon access). 100% traffic on each.

### Phone state

- Dev APK installed: `com.defensivepedal.mobile.dev` (was already there before the session — no native rebuild done).
- A stale Supabase anonymous session may exist locally (causes the "Refresh Token Not Found" warning at startup but recovers automatically). To reset: `adb shell pm clear com.defensivepedal.mobile.dev`.

---

## 10. User preferences observed during the session

- "I want only worktree to have changes until I run tests" — strict; even the audit bundle was relocated from main to the worktree to honour this.
- Wants test verification before any merge/commit.
- Picks options from numbered lists offered by the assistant. Comfortable saying "1" / "2" / "yes" rather than long sentences.
- Confirms with "works" / "works great" when satisfied.
- Cares about UX quality more than architectural purity ("for it not to be visible that they are in anonymous account").
- Authorised the production deploy (revisions 00066, 00067) explicitly with "2".

---

*End of handoff.*
