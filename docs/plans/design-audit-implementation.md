# Design Audit — Implementation Plan

**Source:** `Design Audit.html` (bundle from Claude Design, authored 2026-04-18)
**This plan:** 2026-04-24 (revised after re-audit + direction change + UX review)
**Scope:** Translate the audit's 10 recommendations + 8 refinement moves into a sequenced, file-level work plan for `apps/mobile/`.

**Direction:** ship **both dark AND light** modes (reverses audit's R10 direction). This changes the sequencing — light-mode QA becomes a P0 gate, not an afterthought.

**UX principle:** every phase pairs at least one **invisible hygiene task** with at least one **user-visible improvement**. The original audit sequence produced 8 weeks of developer-experience gains with no user-facing delta; this revision keeps the hygiene pace while surfacing a daily-felt improvement every 1–2 weeks.

---

## 1. Current state — deep re-audit against every recommendation

The audit is 6 days old. Re-grounding each R-item against the actual repo today:

### R-items

| # | Audit status | Reality (2026-04-24) | Net work remaining |
|---|---|---|---|
| **R1** Lint ban raw colour | "Not started" | ❌ No ESLint configured in `apps/mobile/` at all (only `apps/web/` has a config) | **Full scope — add ESLint infra, not just the rule** |
| **R2** Style-factory migration | "4/31 screens" | ✅ **27 screens** in `app/` call `createThemedStyles`; **32 files** use `useTheme()` | **Cleanup only** — ban hex (R1 enforces) + fix 57 hex / 28 `rgba()` violations |
| **R3** `<Surface>` primitive | "Not started" | ⚠ **Partial.** `Card.tsx` atom already exists with the exact `variant: 'solid' \| 'glass' \| 'outline'` API the audit proposed. Missing: `elevation` prop + adoption — only `city-heartbeat.tsx` imports it directly | **Small** — add `elevation` prop, codemod manual card chrome → `<Card>` |
| **R4** `/design` catalog | "Not started" | ❌ No `apps/mobile/app/design/` directory | **Full scope** |
| **R5** Contrast CI gate | "Not started" | ❌ Zero contrast tests | **Full scope — escalates to P0** given light-mode direction; extended to include pattern/icon encoding check for risk segments (WCAG 1.4.1) |
| **R6** Decompose monoliths | "1715 / 1257 / 1088" | ❌ **Worse:** `route-planning.tsx` **1,893**, `navigation.tsx` **1,400**, `route-preview.tsx` **1,184** | **Scope reduced** — decompose `route-planning.tsx` only (see §5 deprioritisation rationale) |
| **R7** `Toggle` orphan | "0 imports" | ⚠ Direct imports in `app/`: **0**. But `SettingRow` molecule wraps `Toggle` correctly and is used by `profile.tsx` only | **Small** — adopt `SettingRow` across `settings.tsx`, `diagnostics.tsx`, remaining `profile.tsx` raw toggles |
| **R8** `useSafetyColor` hook | "Not started" | ❌ Safety palette still directly importable from `colors.ts` | **Full scope** |
| **R9** 44px hit-target audit | "Not started" | ⚠ `Button` atom enforces 36/44/52 internally; `BadgeInlineChip` has `minHeight:44`; `ScreenHeader` has `hitSlop:8`. No systemic test. | **Partial** — add the test layer; extended to include Dynamic Type + thumb-reach |
| **R10** Dark vs light | "Undecided" | ✅ Both themes exist in `tokens/colors.ts`; `ThemeContext` resolves via `useColorScheme()` + preference; forces dark during `NAVIGATING` | **Direction confirmed: ship both.** Extended with ambient-light auto-dark + theme-picker warning |

### New R-items added from UX review

| # | Title | Rationale | Severity |
|---|---|---|---|
| **R11** | Empty / Error / Loading state audit | Quick Reference §8 `empty-states`, `error-feedback`, §3 `progressive-loading`. Zero screens covered by plan; route fetch can take 2–5s; trip-history/community/achievements need first-run empty framing | High |
| **R12** | Motion discipline audit | Quick Reference §1 `reduced-motion`, §7 `motion-meaning`. Cycling app + motion sickness + forced-dark during `NAVIGATING` means every animation needs gated review; Refinement 05's "ambient motion" proposal was unsafe as-drafted | High |
| **R13** | Accent-discipline sweep | Quick Reference §4 `primary-action`. Light mode will reveal screens with 3–5 yellow buttons competing; one primary CTA per viewport. Promotes Refinement 06 up from optional to mandatory | High |
| **R14** | Haptic calibration map | Quick Reference §2 `haptic-feedback`. `haptics.ts` utility exists but no per-interaction intensity spec. Daily-felt enjoyment lever | Medium |
| **R15** | Onboarding polish pass | First impression = biggest retention lever. 5-screen flow (location → safety-score → goal → first-route → signup) gets only palette compliance in baseline plan | Medium |

### Refinement items (Section 3) — re-audited + scoped

| # | Move | Reality today | Status |
|---|---|---|---|
| 01 | Humanist/serif display | Montserrat (geometric) in `typography.ts`, loaded via `fonts.ts` | ❌ **Dropped from plan** — see §5 |
| 02 | Warm neutrals | `bg-deep: #111827`, `bg-primary: #1F2937` (cool slate) | ❌ Kept — token-only tweak |
| 03 | One elevation system | `shadows.ts` already has sm/md/lg/xl + `safetyGlows`; `Card` uses `shadows.md` | ⚠ **~70% done** — folds into R3 `<Surface>` elevation prop |
| 04 | Radii 16→20 | `radii.xl = 16`, `2xl = 24` | ❌ Kept — token-only tweak |
| 05 | Spring motion | `motion.ts` has easing + "spring" bezier but no spring physics; durations 250ms band | ⚠ **Reframed** as R12 motion discipline audit (ambient motion is unsafe) |
| 06 | Accent discipline | Visual audit needed | ⚠ **Promoted** to R13, runs in Phase 2 |
| 07 | Warmer sentence-case copy | Visual audit needed | ⚠ **Folds into** R11 (empty/error) + R15 (onboarding) copy passes |
| 08 | Duotone safety glyphs | `hazardIcons.ts` maps to Ionicons name strings | ❌ **Deferred** — needs designer, not in this plan |

### Net revaluation

- **R2 is ~85% done** (pattern + factory + theme consumption shipped; cleanup only).
- **R3 is ~40% done** (`Card` atom already has the variant API; needs `elevation` + adoption).
- **R7 is ~20% done** (`SettingRow` molecule wraps `Toggle` correctly but has 1 consumer).
- **R9 is ~50% done** at the atom layer; no systemic test.
- **Refinement 03 is ~70% done** (shadows scale exists, just need `inset` + adoption) — folded into R3.
- **Everything else is full scope** (R1, R4, R5, R6-scoped, R8, R10-extended, R11–R15, Refinement 02/04).

---

## 2. Against current in-flight work

- **Last shipped features:** Improved Hazard System (Session 28, 2026-04-21), signup flow rework, release 0.2.20 w/ upload-keystore signing.
- **Outstanding from prior plans:** P1-21 phase 3 — manual TalkBack QA on physical Android device (last merge gate, non-code). **Runs parallel to this plan, not blocked.**
- **No active feature branch** in flight — last ~10 commits are release bumps, a npm audit fix, and small gate fixes.

Good seam to introduce a design-quality stream without blocking product work.

---

## 3. Scope decisions (resolved)

### D1 · Dark + light, both shipped ✅ (user decision)
This inverts the audit's R10 recommendation. The implications cascade:

- Light-mode QA pass becomes a **P0 gate** before any visual release.
- **R5 (contrast CI gate)** escalates from P1 to P0 and extends to include colour-not-only encoding (§1 `color-not-only`).
- Every screen touch in Phase 2+ needs the reviewer to check both themes in the dev build.
- The Theme picker in Profile stays; `lightTheme` export stays; forced-dark during `NAVIGATING` stays.
- **Extension (R10-ext):** auto-switch to dark when ambient light drops OR when `appState === ROUTE_PREVIEW` (last stop before glare); show a warning in the Theme picker that Light may affect outdoor legibility.

### D2 · Hygiene first, visible wins interleaved ✅ (revised from "hygiene only")
Original plan: 8 weeks invisible → optional Weeks 9–15 visible.
Revised plan: every phase pairs hygiene with a user-visible win. No "optional Refinement" section — the survivable refinement moves fold into phases as R11–R15. The discarded refinements (serif, duotone) stay discarded.

---

## 4. Revised phased plan — interleaved hygiene + visible wins

### Phase 0 · Set the table (Week 0, 1 day, no risk)
- Confirm D1 + D2 decisions in `docs/design-context.md` (create if missing; reference from CLAUDE.md §Design System).
- File P1-30 "Design quality pass" tracking issue with this plan's phase breakdown.
- Note non-blocking dependency: P1-21 phase 3 TalkBack QA (runs parallel).

---

### Phase 1 · Stop the bleeding + first enjoyment win (Week 1 · ~3–4 PRs)
**Invisible goal:** no new drift lands after this phase; contrast gate live.
**Visible goal:** haptic feedback feels calibrated.

**Hygiene — invisible:**

- **R1 · ESLint infra + hex ban** *(Impact High, Effort M — no ESLint exists in mobile, P0)*
  - Add `eslint`, `eslint-plugin-react`, `eslint-plugin-react-native`, `@typescript-eslint/*` to `apps/mobile/package.json`.
  - Create `apps/mobile/.eslintrc.js` with one custom rule banning `/#[0-9a-f]{3,8}\b/` and `/\brgba?\s*\(/` inside `apps/mobile/app/**/*.tsx`.
  - Allow-list `apps/mobile/src/design-system/tokens/**`.
  - Excludes: map-overlay cards that intentionally use `#FFFFFF` over the map (already documented in CLAUDE.md — inline `eslint-disable-next-line` with a reason).
  - Add `npm run lint`; wire into the CI typecheck job.
  - Baseline ratchet: run once with `--fix`, commit violation set to `.eslint-baseline.json`, block only **new** violations.

- **R5 · Contrast + encoding CI gate** *(Impact High, Effort M, P0 — extended)*
  - New pure-logic file `packages/core/src/contrast.ts` — WCAG contrast ratio calculator.
  - New test suite `apps/mobile/src/design-system/tokens/__tests__/contrast.test.ts`:
    - For each `{foreground, background}` pair declared by `Button`, `Badge`, `HazardAlertPill`, `ManeuverCard`, `BottomNav`, `SettingRow`, `Card` — assert WCAG 4.5:1 body / 3:1 large, **in both themes**.
    - **Extension:** assert that `RiskDistributionBar`, hazard severity markers, and `StreakCard` "at-risk" state **also carry a non-colour encoding** (pattern, icon, or shape) so colorblind users see the same signal — WCAG 1.4.1 `color-not-only`.
  - Wire into `npm run typecheck` block or a new `npm run check:contrast`.
  - Output: machine-readable report committed to `docs/contrast-baseline.md`.

- **R7 · Lock in `SettingRow` adoption with a lint guard** *(Impact Medium, Effort S, P2 — scope reduced)*
  - **Audit finding (2026-04-25):** the audit's premise was stale. `profile.tsx` already uses `<SettingRow>` 10 times; `settings.tsx` and `diagnostics.tsx` have **zero** boolean toggle rows (they're pure navigation/action surfaces). No inline `<Toggle>` imports exist anywhere in `app/**`.
  - **Reframed action:** add a `no-restricted-imports` ESLint rule banning `import { Toggle }` inside `app/**`. Codifies the current good state so future code can't reintroduce orphan inline toggles.
  - **Out of scope:** `ShareOptionsModal` (checkbox-style variant) and `NearbySheet` (chip-toggle variant) — both are deliberate visual patterns, not setting rows.
  - Acceptance: ESLint rule blocks new direct `Toggle` imports in `app/**`; `SettingRow` remains the only path for boolean settings.

**Visible win:**

- **R14 · Haptic calibration map** *(Impact Medium, Effort S, new)*
  - Audit every existing `hapticFeedback` call site + list interactions that should have one but don't.
  - Define intensity map as a token in `design-system/tokens/haptics.ts`:
    - `confirm` → light impact (hazard vote, follow, like)
    - `success` → notification success (route ready, trip saved, sign-in)
    - `warning` → medium impact (off-route, steep grade onset)
    - `celebration` → escalated double-impact (badge unlock, rank-up, streak milestone)
    - `destructive-confirm` → heavy impact (end ride — pairs with existing confirmation dialog)
  - Wire these tokens everywhere — replace ad-hoc calls.
  - Verify `NAVIGATING` suppression for non-safety haptics (already a principle; confirm implementation).
  - Acceptance: one-page `docs/haptic-map.md`; every interactive primitive in `app/` either uses a token or is explicitly exempted.

**Exit Phase 1:**
- `npm run lint` and `npm run check:contrast` in CI.
- `SettingRow` has ≥ 3 consumers.
- Haptic map documented and enforced via tokens.
- Typecheck ✅, bundle check ✅, tests ✅.

---

### Phase 2 · Light mode + mechanised cleanup + first visible polish (Weeks 2–4 · ~9–12 PRs)
**Invisible goal:** zero raw-hex violations; `<Surface>` adopted.
**Visible goal:** light theme usable end-to-end; every screen has empty/error/loading states; hierarchy is clearer (one primary CTA per viewport).

**Hygiene — invisible:**

- **R10 · Light-mode QA pass (extended)** *(Impact High, Effort L, P0)*
  - One screen per PR. For each of the 27 screens in `apps/mobile/app/`:
    1. Set `themePreference: 'light'` in dev.
    2. Walk the golden path; capture screenshot.
    3. Fix any hardcoded hex that reveals (R2 cleanup folds in).
    4. Verify contrast gate passes.
  - Priority order (traffic × safety risk):
    1. `route-planning.tsx`, `route-preview.tsx`.
    2. `profile.tsx`, `history.tsx`, `trips.tsx`, `community-feed.tsx`.
    3. `achievements.tsx`, `impact-dashboard.tsx`, `city-heartbeat.tsx`.
    4. `onboarding/*`.
    5. `feedback.tsx`, `diagnostics.tsx`, `settings.tsx`, `faq.tsx`, `offline-maps.tsx`, remaining auth/edge.
  - **Exclusion:** `navigation.tsx` — forced dark.
  - **Extension — ambient-light + warning:**
    - Add `ambientLightAutoDark: boolean` user preference (default on).
    - Subscribe to `expo-sensors` light sensor if available; auto-switch to dark when lux < threshold.
    - Force dark when `appState === ROUTE_PREVIEW` (last stop before ride).
    - Theme picker in Profile: add inline advisory "Light mode may reduce legibility outdoors on handlebar mounts".
  - Parallelisable — 3–4 reviewers each take a bucket.

- **R2 · Remove 57 hex + 28 `rgba()` literals** *(folds into R10 per-screen PRs)*
  - Worst offenders to attack first: `feedback.tsx` (18), `route-planning.tsx` (8 + 1), `route-preview.tsx` (3 + 7), `auth.tsx` (5 + 3), `offline-maps.tsx` (4 + 3).

- **R3 · Add `elevation` prop to `Card`, roll out across monoliths** *(Impact High, Effort S, P1)*
  - Add `elevation?: 'inset' | 'flat' | 'sm' | 'md' | 'lg'` mapped to `shadows.*` tokens + new `inset` variant (Refinement 03).
  - Export `<Surface>` as alias of `<Card>` for readability; keep `<Card>` for back-compat.
  - Codemod target: inline `{ backgroundColor, borderRadius, borderWidth, shadows.md }` objects → `<Surface elevation="md">`.

- **Refinement 02 + 04 token tweaks** *(Impact Medium, Effort S)*
  - `tokens/colors.ts`: nudge `bg-deep` / `bg-primary` / `bg-secondary` +5° hue warm-slate (both themes).
  - `tokens/radii.ts`: `xl: 16 → 20`.
  - Ship these with Phase 2 exit, not separately — they ride on the light-mode visual sweep.

**Visible wins:**

- **R11 · Empty / Error / Loading state audit** *(Impact High, Effort M, new)*
  - Per-screen sweep (folds into R10 PRs):
    - **Empty states:** `trips.tsx` ("Your first ride unlocks your timeline"), `community-feed.tsx` ("No rides near you yet — be the first"), `achievements.tsx` ("Earn your first badge by completing a ride"), `offline-maps.tsx`, `history.tsx`, `my-shares.tsx`.
    - **Error states:** GPS unavailable at nav start (friendly not technical: "We're having trouble finding your location — move to an open area"), network loss during route fetch (retry with exponential backoff, explicit retry button), OSRM 500 ("Our safety engine is catching its breath — try again in a moment").
    - **Loading states:** route calculation (skeleton of the preview sheet, not a spinner — Quick Reference §3 `progressive-loading`, operations > 300ms), onboarding step fetches, feed fetches.
  - Copy pass rule: warm voice, sentence case, first-person-plural where it fits ("We found…", "We're tracking…"). Replaces Refinement 07.
  - Acceptance: every screen has an empty state template; error states use `<ErrorBoundary>` atom or equivalent; loading > 300ms uses `Skeleton` atom.

- **R13 · Accent-discipline sweep** *(Impact High, Effort S, new, promoted from Refinement 06)*
  - For every screen in the Phase 2 light-mode PR:
    - Identify the primary CTA; retain yellow.
    - Demote every *other* yellow element to `accentDimmed` (use `tints.accent` at 0.35 opacity, or `textSecondary` for icons).
    - Screens likely affected: `route-planning.tsx` (search bar + Safe/Fast/Flat pill + FAB currently all yellow), `impact-dashboard.tsx`, `achievements.tsx`.
  - Acceptance: at most one yellow "hero" element per viewport in any normal state.

**Exit Phase 2:**
- Every screen renders cleanly in both themes, with ambient-light auto-dark active.
- Zero raw hex / `rgba()` violations in `apps/mobile/app/**`.
- `<Surface>` with `elevation` is the canonical chrome primitive.
- Every screen has an empty-state template; error states unified; loading > 300ms uses skeletons.
- One primary CTA per viewport — visible hierarchy restored.

---

### Phase 3 · Guardrails + enjoyment polish (Weeks 5–6 · ~4–5 PRs)
**Invisible goal:** the system defends itself against future drift.
**Visible goal:** motion feels intentional; post-ride celebration is tuned; no animation causes distraction or motion sickness.

**Hygiene — invisible:**

- **R4 · In-app `/design` catalog** *(Impact Medium, Effort M, P1)*
  - `apps/mobile/app/design/index.tsx` behind `__DEV__`.
  - Render every atom/molecule/organism side-by-side in both dark and light, with a theme toggle pill at the top.
  - Tag each entry with import path. Stretch: RN snapshot tests as visual regression suite.

- **R8 · `useSafetyColor(level)` hook** *(Impact High, Effort M, P2)*
  - New hook `apps/mobile/src/design-system/hooks/useSafetyColor.ts`.
  - Returns resolved safety colour for the current theme.
  - In dev, `console.warn` if caller path doesn't match `/hazard|risk|route|navigation/i`.
  - Update `design-system/index.ts` to export `useSafetyColor` and **remove** direct `safe`/`caution`/`danger`/`info` re-exports. Raw `colors.ts` stays (tokens layer) but flagged by R1 lint in screens.
  - Migrate remaining direct safety-colour imports in `app/` to the hook.

- **R9 · Hit-target + Dynamic Type + thumb-reach** *(Impact Medium, Effort S-M, P3 — extended)*
  - Test: `Button`, `IconButton`, `SettingRow`, `Pressable` wrappers from atoms assert `minHeight >= 44` at every size ≥ `md`.
  - **Extension — Dynamic Type:** snapshot test renders `NavigationHUD`, `ManeuverCard`, `HazardAlertPill` at three text sizes (default, 1.2×, 1.6×); layout must hold (no truncation of critical data, no text cut off).
  - **Extension — thumb-reach:** document a thumb-reach zone (bottom 60% of screen on a 6" phone held right-handed); verify the following are reachable one-handed:
    - End Ride button during `NAVIGATING`
    - Safe/Fast/Flat pill on route-planning
    - Recenter FAB on navigation
    - Hazard report FAB
  - Detox end-to-end sweep deferred.

**Visible wins:**

- **R12 · Motion discipline audit** *(Impact High, Effort S-M, new)*
  - Inventory every `Animated.*`, `Reanimated` call, and `FadeSlideIn` usage in the app.
  - Classify each by context:
    - **`NAVIGATING` state: zero motion** — verify `RankUpOverlay`, `BadgeUnlockOverlay`, `XpGainToast`, `PulseHeader`, ambient icons all suppress. Memory says most already do; confirm systematically.
    - **Planning / community / profile: motion OK** but must respect `useReducedMotion()` — every animation wrapper must short-circuit when reduced-motion is on.
    - **Post-ride / celebration: motion as reward** — tuned by impact of the event (see post-ride tuning below).
  - Acceptance: no un-gated animation in the codebase; `npm run lint` adds a rule flagging bare `Animated.timing` calls outside known wrapper utilities.
  - Refinement 05 ("spring physics") becomes a 2-line `motion.ts` token addition (stiffness 180 / damping 22) used only in tuned interactions, not ambient.

- **Post-ride celebration tuning** *(Impact Medium, Effort S, new)*
  - The single moment where the app's personality lands. Audit the sequence:
    1. Fade-in of impact counters — current timing? confirm ≤ 400ms.
    2. XP gain → badge earned (if any) → rank-up (if any) sequence — verify stagger (≥ 200ms between).
    3. Haptic pattern matches R14 map (`success` for ride complete, `celebration` for rank-up/badge).
    4. Escalation: a 500m neighbourhood ride and a first-ever Confident Cyclist badge should feel *different*.
  - Acceptance: `docs/post-ride-celebration.md` documents the sequence; phone-test on three ride outcomes (ordinary ride, streak day, rank-up day).

**Exit Phase 3:**
- `/design` catalog in dev builds, both themes.
- `useSafetyColor` is the only export path for semantic safety colours.
- Hit-target + Dynamic Type enforced at atom layer with tests; thumb-reach documented.
- Every animation is gated (reduced-motion + `NAVIGATING`).
- Post-ride celebration intentionally sequenced.

---

### Phase 4 · Decompose + onboarding + close (Weeks 7–8 · ~4–6 PRs)
**Invisible goal:** `route-planning.tsx` under 400 lines; docs current.
**Visible goal:** onboarding polish lands before broader user growth pushes first-run volume.

**Hygiene — invisible:**

- **R6-scoped · Split `route-planning.tsx`** *(Impact Medium, Effort L, P2 — scope reduced)*
  - **Only decompose `route-planning.tsx`** (1,893 LOC). Rationale in §5.
  - Extraction targets (confirm shape during implementation): `PlannerHeader`, `DestinationPanel`, `NearbyPoiStrip`, `RouteProfilePicker` (Safe/Fast/Flat), `MultiStopEditor`, `WeatherBadgeStrip`.
  - Target: route-planning ≤ 400 LOC; new components ≤ 200 LOC each.
  - Acceptance: state preservation verified — back from `route-preview` restores the destination field, route-profile selection, and scroll position (Quick Reference §9 `state-preservation`).
  - **`navigation.tsx` and `route-preview.tsx` deferred** unless a subsequent feature lands that demands it.

- **Docs close-out:**
  - Update `docs/design-context.md` with canonical patterns.
  - Update CLAUDE.md §Design System.
  - Re-run audit metrics: target hex=0, useTheme=27/27, route-planning ≤ 400 LOC.

**Visible win:**

- **R15 · Onboarding polish pass** *(Impact High, Effort M, new)*
  - 5-screen flow: `location` → `safety-score` → `goal-selection` → `first-route` → `signup-prompt`.
  - Audit pass per screen:
    - **Pacing:** progressive disclosure, skip affordance visible (`§8 progressive-disclosure`).
    - **Copy warmth:** sentence case, first-person-plural, warmer verbs ("Let's find you a safe route" not "Route Search").
    - **Micro-celebrations:** each step completion → a soft haptic (`confirm` from R14) + subtle card-lift animation (gated by reduced-motion).
    - **Empty/loading/error states:** folds from R11 — "We're finding nearby routes…" skeleton during `first-route` fetch.
    - **Light-mode parity verified** from Phase 2.
  - Acceptance: phone-test the flow end-to-end in both themes, with reduced-motion on and off, at Dynamic Type default + 1.4×.

**Exit Phase 4:**
- `route-planning.tsx` ≤ 400 LOC; state preservation verified.
- `docs/design-context.md` current.
- Onboarding flow polished, tested across themes / reduced-motion / Dynamic Type.
- Audit re-score target ≥ 8.0/10.

---

## 5. Explicit drops + deprioritisations

These were in the audit or the original plan; removed / scoped down after UX review:

| Item | Status | Reason |
|---|---|---|
| **Refinement 01 · Humanist/serif display font** | **Dropped.** | Montserrat + Roboto Mono is *correct* for a navigation-first product — geometric clarity at a glance beats editorial warmth at 25 km/h. Komoot's serif works because Komoot is planning-first; Defensive Pedal is navigation-first. Bundle/cold-start cost + low outdoor-legibility gain. |
| **Refinement 08 · Duotone safety glyphs** | **Deferred.** | Requires artwork; skill guidance warns against custom icons without a designer. Ionicons are the safer default until design capacity exists. |
| **R6 decomposition of `navigation.tsx`** | **Deferred.** | 1,400 LOC but forced-dark, heavily phone-tested, state-machine-sensitive. No active edits planned. Decompose only when a feature demands it. |
| **R6 decomposition of `route-preview.tsx`** | **Deferred.** | Same rationale — stable surface, heavy test coverage (~620 mobile tests), no user-visible gain from splitting. |
| **Refinement 05 "ambient motion" as a feature** | **Reframed** into R12 motion discipline audit. | Ambient motion is actively *bad* for a cycling safety app — motion sickness, distraction, battery. Spring physics stays as a 2-line token used only in tuned post-ride / onboarding interactions. |

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Light mode reveals far more hardcoded-colour bugs than expected | R1 lint + R5 contrast gate catch most before merge; per-screen R10 PRs contain the remainder |
| Contrast gate (R5) fails on currently-shipping hazard-on-map combos | Baseline first run, ratchet thresholds, don't block initial PR |
| Light-mode QA slows Phase 2 | Parallelise by screen bucket; accept 3-week Phase 2 cost |
| **Ambient-light auto-dark causes rapid theme-flicker in mixed lighting** | Debounce sensor reads ≥ 30s; hysteresis thresholds (dark below lux X, light above lux Y > X); respect user override for 1 hour after manual pick |
| **R11 empty-state + R13 accent-discipline copy/visual audit needs a designer-adjacent eye** | Engineer writes first draft; user walks through in one session; iterate in the per-screen PR — avoids blocking but produces mid-quality text if skipped |
| **Haptic tokens (R14) over-fire on cheap devices or users disable haptics** | Respect `expo-haptics` silent fallback; haptic is never load-bearing (always paired with visual feedback) |
| R6-scoped decomposition breaks state machine | One PR; retain full test suite; phone-test golden path before merge |
| P1-21 TalkBack QA still pending | Run parallel; plan doesn't touch a11y paths until R9 extension |
| Store-screenshot invalidation from light-mode + accent-discipline changes | Plan screenshot refresh during Phase 2 close |
| **Refinement 02/04 token tweaks (warm neutrals, radii 20) visually shift the whole app at once** | Ship in the Phase 2 close merge, bundled with light-mode launch — one user-perceivable visual event, not multiple over weeks |

---

## 7. Effort summary (revised for UX-interleaved direction)

| Phase | Calendar | Eng-weeks | Visible? | Notable |
|---|---|---|---|---|
| 0 — Set the table | 1 day | 0.1 | No | Decision pass + tracking issue |
| 1 — Stop bleeding + haptic win | Week 1 | 1 | **Yes** (haptic) | R1 + R5-ext + R7 + R14 |
| 2 — Light mode + empty states + accent discipline | Weeks 2–4 | 3 | **Yes** (big) | R10-ext + R2 + R3 + R11 + R13 + Refinement 02/04 |
| 3 — Guardrails + motion + post-ride | Weeks 5–6 | 2 | **Yes** (felt) | R4 + R8 + R9-ext + R12 + post-ride tuning |
| 4 — Decompose + onboarding + close | Weeks 7–8 | 2 | **Yes** (first-run) | R6-scoped + R15 + docs |
| **Total** | **~8 weeks** | **~8.1** | **Every phase visible** | — |

No optional "Refinement pass" appendix — survivable refinements fold into phases, discarded ones are explicit drops.

---

## 8. Open questions

1. Team capacity for ~1 eng-week/week for 8 weeks? Competes with product roadmap if not dedicated.
2. **Do we have user research backing light-mode demand, or is it a compliance check?** If the latter, consider capping Phase 2 light-mode scope to top-3 screens and re-evaluating based on opt-in telemetry.
3. Play Store / TestFlight re-screenshot pass after light launch? (Required — current screenshots are dark-only.)
4. Does `visualRefreshEnabled` flag exist? (Not needed — direction changed to ship refinements inline, not gate them.)
5. Who owns empty-state + onboarding copy writing? (Engineering produces first draft; a one-hour review session with the user locks voice.)
6. Who owns post-ride celebration tuning? (Likely the user — single person's taste call.)

---

## 9. Explicit non-scope

- No rewrite of `RouteMap.tsx` (900+ lines, single component by design).
- No change to Mapbox style layer objects (`#FFFFFF` overlays intentional).
- No change to Safe/Fast/Flat routing pill logic (product, not design).
- No change to Shield Mode Mapbox style config.
- No custom icon artwork (Refinement 08 deferred until designer).
- No display font change (Refinement 01 dropped).
- No decomposition of `navigation.tsx` or `route-preview.tsx` (R6-scoped).
- No production behaviour change in Phase 1 or Phase 3 that isn't explicitly a visible improvement; Phase 2 ships light mode + accent discipline (visible, intentional); Phase 4 ships onboarding polish (visible, intentional).

---

## 10. Guiding principles (summary)

- **Every phase ships something a user can feel.** No more 8 weeks of silent refactoring.
- **Reduced-motion and dark-during-NAVIGATING are inviolable.** The app is used on handlebars; distraction and motion sickness are safety issues, not preference issues.
- **Yellow is punctuation, not paragraphs.** One primary CTA per viewport (R13).
- **Safety semantics are never decorative.** Red/amber/green only via `useSafetyColor()` (R8) and always accompanied by a non-colour signal (R5 extension).
- **Font system stays geometric (Montserrat + Roboto Mono).** Glanceability > editorial warmth for this product.
- **Copy is warm but terse.** "We found 3 safer routes" beats "Route Options".
- **Haptics are tokenised, not ad-hoc.** A hazard vote feels different from a rank-up (R14).
- **Onboarding is the retention lever.** Polish it before user growth exposes it (R15).

---

*Author: Claude (plan only, no code). Inputs: `Design Audit.html` (Claude Design bundle, 2026-04-18), current `apps/mobile/` repo state (2026-04-24), user direction (ship both dark and light), UX review grounded in UI/UX Pro Max guidance (Priority 1–10 rules, Apple HIG, Material Design).*
