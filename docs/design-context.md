# Design Context

> **Purpose.** The canonical "rules of the road" for design work in Defensive Pedal.
> Read this before touching `apps/mobile/src/design-system/` or any screen's visual surface.
> The implementation plan lives at [`docs/plans/design-audit-implementation.md`](plans/design-audit-implementation.md); this file is the stable reference that the plan is executing against.

**Last updated:** 2026-04-24
**Source of truth for:** token usage rules, theme direction, motion rules, accessibility gates, copy voice.

---

## 1. Direction (resolved decisions)

### D1 · Ship both dark AND light themes
- Both themes exist in `tokens/colors.ts` and resolve via `useTheme()` + `useColorScheme()` + user `themePreference`.
- **Dark is forced during `appState === 'NAVIGATING'`** — non-negotiable, safety reasons (glare, battery, contrast).
- **Dark is also forced during `appState === 'ROUTE_PREVIEW'`** — last stop before the ride, handlebar mount likely.
- Ambient-light auto-dark opt-in (debounced ≥ 30s, hysteresis, respects 1-hour manual override). Driven by `expo-sensors` where available; falls back gracefully.
- Theme picker in Profile carries an advisory: "Light mode may reduce legibility outdoors on handlebar mounts."

### D2 · Hygiene interleaved with visible wins
- Every design-quality phase ships **at least one user-visible improvement** alongside invisible refactors.
- No "invisible for 8 weeks" sequencing.
- Refinement moves from the audit that survived UX review fold into the active phases; the rest are dropped (see §11).

---

## 2. Token rules (mandatory)

### Colour
- **No raw hex or `rgba()` in `apps/mobile/app/**/*.tsx`.** Enforced by ESLint (see §5).
- Two documented exceptions:
  1. Map overlay cards that intentionally use `#FFFFFF` over the dark map (origin/destination/search/FABs) — inline `eslint-disable-next-line` with a reason.
  2. Mapbox `SymbolLayer` / `CircleLayer` / `LineLayer` style objects (Mapbox doesn't read theme tokens) — use constants named from `mapboxColors` or similar.
- **Safety colours (`safe`, `caution`, `danger`, `info`) are reachable only via `useSafetyColor(level)` hook** (see §3). Raw imports flagged at review.

### Typography
- **Stays geometric — Montserrat (heading) + Roboto (body) + Roboto Mono (data).**
- The Refinement proposal to swap the display font to a serif/humanist (Fraunces, Inter Tight) **is dropped.** Reason: glanceability at 25 km/h beats editorial warmth.
- Use `tokens/typography.ts` scale — never raw `fontSize`.
- Mono (`RobotoMono-*`) for: distances, ETAs, risk scores, timers, tabular figures.

### Spacing
- 4/8 dp rhythm via `tokens/spacing.ts`.
- `radii.xl` lifted from 16→20 during Phase 2 refresh (token-only tweak).

### Elevation
- Use the `<Surface>` (`=Card`) atom with `elevation="inset | flat | sm | md | lg"` — do not hand-roll card chrome.
- The `shadows.ts` scale (`sm`/`md`/`lg`/`xl`) is the only source of `shadow*` / `elevation` values.
- `safetyGlows` (coloured shadows) reserved for map/safety elements only, iOS only.

---

## 3. Style-factory pattern (canonical)

```ts
import { useMemo } from 'react';
import { useTheme, type ThemeColors } from '../src/design-system';

export default function MyScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  // …
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { backgroundColor: colors.bgDeep },
    // …
  });
```

- **Every screen** uses this pattern. Direct imports of `darkTheme.X` or `lightTheme.X` are forbidden in screen code.
- `createThemedStyles` lives inside the same file as the component (not hoisted, not shared).
- For components used across themes, the factory closes over `colors` so theme changes rebuild styles automatically.

---

## 4. Component primitives

- **`<Surface>` / `<Card>`** — the only card chrome. `variant="solid | glass | outline"`, `elevation="inset | flat | sm | md | lg"`.
- **`<SettingRow>`** — the only toggle/option row. Wraps `<Toggle>` internally. Don't build inline toggle pairs.
- **`<Button>`** — size `sm` (36pt), `md` (44pt), `lg` (52pt). `md` is the floor for anything the user taps routinely.
- **`<ScreenHeader>`** — four variants: `back`, `close`, `brand-logo`, `title-only`.
- **`<FadeSlideIn>`** — wraps entry animations; respects `useReducedMotion()` automatically.

Map screens (`route-planning`, `route-preview`, `navigation`) intentionally do **not** use `Screen` / `ScreenHeader` — they use `MapStageScreen` with a full-bleed map layout.

---

## 5. Lint rules

Enforced in `apps/mobile/.eslintrc.cjs` (added in Phase 1, R1 + R7). **Setup, usage, and CI-wiring steps:** see [`apps/mobile/LINT.md`](../apps/mobile/LINT.md).

| Rule | Scope | Source phase |
|---|---|---|
| `no-restricted-syntax` — no raw hex / `rgba()` literals | `app/**/*.{ts,tsx}` | R1 |
| `no-restricted-imports` — `Toggle` atom must go through `SettingRow` | `app/**/*.{ts,tsx}` | R7 |

| Rule | Scope | Action |
|---|---|---|
| No raw hex `/#[0-9a-f]{3,8}\b/` | `apps/mobile/app/**/*.tsx` | error |
| No raw `rgba?\(` | `apps/mobile/app/**/*.tsx` | error |
| No bare `Animated.timing` outside wrappers | `apps/mobile/app/**/*.tsx` | warn (Phase 3) |

Allow-list: `apps/mobile/src/design-system/tokens/**`.

Baseline ratchet: existing violations go to `.eslint-baseline.json`; only **new** violations block PRs.

---

## 6. Accessibility gates (CI + manual)

### Automated (Phase 1 + Phase 3)
- **WCAG contrast gate (R5).** Every `{foreground, background}` pair from atoms/organisms asserts 4.5:1 body / 3:1 large in both themes. Pattern/icon encoding checked for risk segments (WCAG 1.4.1).
- **44pt hit-target gate (R9).** Button / IconButton / SettingRow / Pressable wrappers assert `minHeight >= 44` for size ≥ `md`.
- **Dynamic Type snapshot (R9 extended).** `NavigationHUD`, `ManeuverCard`, `HazardAlertPill` render at 1.0×, 1.2×, 1.6× text sizes without truncation.

### Manual (per PR when visual)
- Test in **both themes** before merging.
- Test with **reduced-motion on**.
- Test at **Dynamic Type largest**.
- Verify **one-handed thumb reach** for primary actions on a 6" phone.

### Parallel track
- P1-21 phase 3 TalkBack QA on physical Android device — non-blocking dependency from the a11y work stream.

---

## 7. Motion rules

- **`NAVIGATING` state: zero ambient motion.** `RankUpOverlay`, `BadgeUnlockOverlay`, `XpGainToast`, `PulseHeader` and any ambient icons must suppress. Cycling-while-distracted is a safety issue.
- **`ROUTE_PREVIEW` state: motion only as reassurance signals.** Button ripples and entry animations OK; no ambient/decorative motion.
- **Other screens (planning, community, profile, history, onboarding): motion OK but must respect `useReducedMotion()`.** Every animation wrapper short-circuits when reduced-motion is on.
- **Durations:** micro (150ms), normal (250ms — use this), emphasis (400ms cap). >500ms is a code smell.
- **Easing:** `ease-out` for entering, `ease-in` for exiting, spring (stiffness 180 / damping 22) for celebrations only.
- **Post-ride celebration is tuned.** Ordinary ride, streak day, and rank-up day feel *different*; see `docs/post-ride-celebration.md` (Phase 3 output).

---

## 8. Haptic map

Haptics are tokenised, not ad-hoc. All live in `design-system/tokens/haptics.ts` (Phase 1, R14):

| Token | Trigger | Use sites |
|---|---|---|
| `confirm` | light impact | hazard vote, follow, like, step complete |
| `success` | notification success | route ready, trip saved, sign-in, onboarding complete |
| `warning` | medium impact | off-route, steep grade onset, GPS degraded |
| `celebration` | escalated double-impact | badge unlock, rank-up, streak milestone |
| `destructive-confirm` | heavy impact | end ride (paired with confirmation dialog) |

**Haptic is never load-bearing** — always paired with a visual signal (respects silent mode / accessibility haptics off).

---

## 9. Voice & copy

- **Warm but terse.** "We found 3 safer routes" beats "Route Options".
- **Sentence case** for UI labels — not Title Case.
- **First-person plural where it fits:** "We're tracking your ride", "We've lost GPS — move to an open area".
- **Error messages: cause + recovery path.** "No internet — tap to retry" not "Network error".
- **No apologies for technical states** (GPS, network, server); reassure instead of blame.

---

## 10. Accent discipline

- **Yellow (`#FACC15`) is punctuation, not paragraphs.**
- One primary CTA per viewport carries yellow. Every other yellow on the screen demotes to `accentDimmed` (`tints.accent` at 0.35 opacity) or `textSecondary` for icons.
- Safety colours (red/amber/green) are reserved for safety semantics — never decorative. Enforced by `useSafetyColor()` (Phase 3, R8).

---

## 11. Explicit drops (won't ship, don't reopen without discussion)

| Item | Reason |
|---|---|
| Serif/humanist display font (Fraunces / Inter Tight) | Glanceability > editorial warmth for a navigation-first product |
| Duotone safety glyphs | Needs a designer; Ionicons are the safer default |
| Decomposition of `navigation.tsx` and `route-preview.tsx` | Stable, forced-dark, well-tested; no user-visible gain |
| "Ambient motion" as a feature | Active harm on a cycling safety app (motion sickness, distraction, battery) — reframed as motion *discipline* audit |

---

## 12. Cross-references

- **Plan and sequencing:** [`docs/plans/design-audit-implementation.md`](plans/design-audit-implementation.md)
- **Original audit report:** `.claude/design-bundle/def-pedal-1/project/Design Audit.html`
- **Contrast baseline (generated, Phase 1):** `docs/contrast-baseline.md`
- **Haptic map (generated, Phase 1):** `docs/haptic-map.md`
- **Post-ride celebration spec (generated, Phase 3):** `docs/post-ride-celebration.md`
- **Runtime hazards/gotchas:** `.claude/error-log.md`
- **Project rules, build commands, current state:** `.claude/CLAUDE.md`
