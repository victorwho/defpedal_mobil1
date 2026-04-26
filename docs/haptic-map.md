# Haptic Map

**Phase 1 · R14 of the Design Quality Pass (P1-30).**
**Last updated:** 2026-04-24

Every haptic call in the app uses one of six semantic tokens defined in [`apps/mobile/src/design-system/tokens/haptics.ts`](../apps/mobile/src/design-system/tokens/haptics.ts) and fired via [`useHaptics()`](../apps/mobile/src/design-system/hooks/useHaptics.ts). This doc is the contract between UX intent and physical sensation.

---

## 1. Tokens at a glance

| Token | Physical | Safety-critical | Fires during `NAVIGATING`? | Fires with reduced-motion? |
|---|---|---|---|---|
| `confirm` | light impact | no | no | no |
| `success` | success notification | no | no | no |
| `warning` | warning notification | **yes** | **yes** | **yes** |
| `celebration` | heavy impact ×2 (90 ms stagger) | no | no | no |
| `destructiveConfirm` | heavy impact | no | no | no |
| `snap` | medium impact | no | no | no |

**Only `warning` overrides the rider's environment.** Every other token respects both the OS "Reduce Motion" setting and the app's own `NAVIGATING` state. A rider in motion should not be pinged by UI feedback; only real attention signals (hazard, off-route) break through.

---

## 2. Per-interaction map

### `confirm` — light impact, deliberate user intent
Small positive feedback. Fired on:

| Site | Component | Notes |
|---|---|---|
| Button press | `atoms/Button.tsx` | All variants. Suppressed during navigation. |
| Toggle flip | `atoms/Toggle.tsx` | Suppressed when the toggle is disabled (never fires). |
| Hazard vote up / down | `organisms/HazardDetailSheet.tsx` | Typically invoked while stopped. |
| Hazard report queued (in-ride) | `app/navigation.tsx` | During `NAVIGATING` → suppressed. Visual "Hazard reported" banner is the feedback. |

### `success` — notification success, task complete
Reserved for task-completion moments. Call sites are intentional, not incidental.

| Site | Component | Planned / existing |
|---|---|---|
| Route ready (server confirms) | `app/route-planning.tsx` / `route-preview.tsx` | *planned* |
| Trip saved after feedback submit | `app/feedback.tsx` | *planned* |
| Sign-in complete | `providers/AuthSessionProvider.tsx` | *planned* |
| Share sent | `src/lib/shareImage.ts` | *planned* |

### `warning` — attention required, **safety-critical**
Fires during `NAVIGATING` and overrides reduced-motion. Rationale: hazard alerts are a safety signal, not decoration. Reserved for system-originated alerts the rider must feel.

| Site | Component | Notes |
|---|---|---|
| Hazard proximity alert enters | `molecules/HazardAlertPill.tsx` | Was scaled by severity (`light`/`medium`/`heavy`); unified to `warning` in R14 — all three severities are safety signals and deserve the same fire-during-nav guarantee. |
| Critical `Modal` opens | `organisms/Modal.tsx` (variant `critical`) | e.g. emergency confirmation dialogs. |
| Off-route detection | `app/navigation.tsx` | *planned* (currently visual only). |
| Steep grade onset | `organisms/NavigationHUD/SteepGradeIndicator.tsx` | *planned*. |
| GPS signal degraded → lost | `organisms/NavigationHUD/ManeuverCard.tsx` | *planned*. |

### `celebration` — escalated double impact, reward moment
Fires only when the user is stationary (post-ride). Suppressed during `NAVIGATING`.

| Site | Component | Planned / existing |
|---|---|---|
| Badge unlocked | `organisms/BadgeUnlockOverlay.tsx` | *planned* — currently no haptic. |
| Rank-up | `organisms/RankUpOverlay.tsx` | *planned*. |
| Streak milestone (7-day, 30-day, etc.) | streak engine | *planned*. |
| First-ride celebration (Mia L5) | `organisms/MiaLevelUpOverlay.tsx` | *planned* (use celebration variant only at L5). |

### `destructiveConfirm` — heavy impact, irreversible acknowledgement
Pairs with a confirmation dialog. The dialog provides visual clarity; the haptic confirms the final commit. Suppressed during `NAVIGATING` (the visible dialog dismissal is sufficient feedback).

| Site | Component | Planned / existing |
|---|---|---|
| End Ride confirmation | `app/navigation.tsx` (End Ride modal) | *planned*. |
| Sign out confirmation | `app/profile.tsx` | *planned*. |
| Discard draft | various | *planned*. |

### `snap` — medium impact, kinetic UI feedback
Marks spatial UI transitions. No emotional weight; purely kinetic.

| Site | Component | Notes |
|---|---|---|
| Bottom sheet snap-to-position | `organisms/BottomSheet.tsx` | Every snap-point change. |
| Modal open (non-critical) | `organisms/Modal.tsx` (default variant) | |

---

## 3. Rules

### R1 · Reduced-motion respect
Non-safety tokens short-circuit when `useReducedMotion()` is true. Safety-critical tokens (`warning`) still fire. Rationale: a user who enables Reduce Motion is opting out of decorative animation, not safety alerts.

### R2 · `NAVIGATING` suppression
When `appState === 'NAVIGATING'`, only safety-critical tokens (`warning`) fire. Everything else short-circuits. Rationale: a rider in motion should not be distracted by UI feedback; visual state changes are sufficient.

### R3 · Silent fallback on missing native module
If the expo-haptics native module is not available (typical in some test environments or malformed builds), every token is a no-op. Haptic is **never load-bearing** — always paired with a visual signal.

### R4 · Never mix tokens for the same event
Prefer one token per interaction. If two semantic events happen in quick succession (e.g. "route ready" + "badge earned"), fire the tokens sequentially with a 90+ ms gap — do not mix physical patterns.

### R5 · Migration path for physical shortcuts
`useHaptics()` still exposes `light`, `medium`, `heavy`, `warning`, `error`, `success` for backwards compatibility. These are marked `@deprecated` in JSDoc. New code uses semantic tokens. Existing call sites migrated:

| Before | After |
|---|---|
| `haptics.light()` in Button, Toggle, HazardDetailSheet | `haptics.confirm()` |
| `haptics.medium()` in BottomSheet snap, Modal open | `haptics.snap()` |
| `haptics.medium()` in navigation.tsx hazard-report | `haptics.confirm()` |
| `haptics.heavy()` / `.warning()` / `.medium()` severity-scaled in HazardAlertPill | Unified to `haptics.warning()` |
| `haptics.error()` in critical Modal | `haptics.warning()` |

Any future use of a physical shortcut should be reviewed for semantic intent — usually it maps 1:1 to a token above.

---

## 4. Testing

- Unit tests mock `useHaptics` with a fake returning all tokens + all physical shortcuts. See `src/design-system/atoms/__tests__/Button.test.tsx` for the canonical shape.
- Existing tests don't assert specific haptic calls (they mock to prevent the real `expo-haptics` native module from loading in happy-dom).
- Device-level verification of `NAVIGATING` suppression and reduced-motion behaviour happens during Phase 3 R9 manual QA.

---

## 5. Open items

These are tracked under P1-30 and will land in later phases:

- **Success, celebration, destructiveConfirm** tokens exist but have **zero call sites** today. Planned call sites are listed above — they'll fold into R11 (empty/error/loading audit) and Phase 3's post-ride celebration tuning.
- **Off-route and GPS-degraded haptics** need integration with the navigation state machine. Phase 3 R12 motion discipline audit covers this.
- **Settings toggle** for "haptic feedback off" (beyond OS-level) — deferred; low priority since OS controls exist.

---

*Authoritative token definitions: [`apps/mobile/src/design-system/tokens/haptics.ts`](../apps/mobile/src/design-system/tokens/haptics.ts). Hook implementation: [`apps/mobile/src/design-system/hooks/useHaptics.ts`](../apps/mobile/src/design-system/hooks/useHaptics.ts).*
