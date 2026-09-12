# Navigation HUD redesign — bigger maneuver panel, restructured footer

**Status:** implemented, device-confirmed on preview v0.2.161 (164); refined in v0.2.162 (165)
**Date:** 2026-09-12
**Origin:** rider feedback (Victor, on-bike testing) + annotated mockup
**Mockup:** `scratchpad/nav-hud-mockup.html` (rendered comparison approved 2026-09-12)

---

## 1. Why

Three complaints from riding the app on a handlebar mount, all confirmed against the code:

| Complaint | Verified cause |
|---|---|
| *"Text prea mic"* | `maneuverDesc` is **18 px** Montserrat, `maneuverDist` **16 px** mono (`NavigationHUD.tsx:610–620`). The whole card is **58 px** tall. It is the smallest readable element on a screen used at arm's length, in motion, in sunlight. |
| *"Aici se repeta informatia cu cea de sus"* | Not actually duplicated data — top shows the current maneuver, bottom shows the next. But `ThenStrip` is rendered **inside `FooterCard`**, ~700 px from the maneuver it follows, so two similarly-shaped rows read as one repeated instruction instead of a sequence. |
| *"Aceste detalii nu se vad"* | Four metric cells at **equal 14 px weight** with no hierarchy (`metricCell`, `NavigationHUD.tsx:690`). Nothing survives a one-second glance. |

The rider also asked for the next maneuver to be visible alongside the current one — predictability matters more on a bike than in a car, because a cyclist needs lane/position decisions earlier and cannot re-read the screen mid-junction.

## 2. Scope

**In:**
- `ManeuverCard` — larger type, street name, the "Then" row folded in
- `FooterCard` — hero remaining-time, 3 metrics instead of 4, integrated End Ride button
- Remove the End Ride button from the floating control rail
- `RouteFeatureAlertStack` bottom offset (forced by the footer height change)

**Out — do not touch:**
- **Colours.** Every value stays on an existing token: `darkTheme.bgPrimary`, `bgSecondary`, `borderDefault`, `accent`, `safetyColors.danger`, `gray[300]/[400]`. No new colour is introduced anywhere in this change.
- **The other four rail buttons** (recenter, voice, hazard FAB, elevation) — position, size, icon, and order all unchanged.
- Routing, the map, voice guidance, the end-ride *flow* (Alert → `EarlyEndReasonModal` → feedback/planning).

---

## 3. Changes

### 3.1 `ManeuverCard` — grows 58 px → ~128 px

Layout becomes two rows inside one card:

**Main row** (`paddingHorizontal: space[4]`, `paddingTop: space[4]`, `paddingBottom: space[3.5]`):
- Maneuver icon `48` accent (was 32)
- Text column, flexible:
  - description — Montserrat-ExtraBold **27** (was 18), `numberOfLines={1}`, keep `adjustsFontSizeToFit` + `minimumFontScale={0.6}` for RO/ES
  - street name — Roboto-Regular **15**, `gray[300]`, `numberOfLines={1}`
- Distance column, right-aligned:
  - value — RobotoMono-Bold **36** (was 16), numeral only
  - unit (`m` / `km`) — Roboto **13**, `gray[400]`, on its own line

`formatDistance` currently returns a single string (`"102 m"`). Split it for the two-line treatment — add `formatDistanceParts(meters): { value: string; unit: string }` to `packages/core/src/` beside `formatDistance` and leave the existing function untouched, since four other call sites use it.

**Then row** (`backgroundColor: darkTheme.bgSecondary`, `borderTopWidth: 1` `borderColor: darkTheme.borderStrong`, `paddingHorizontal: space[4]`, `paddingVertical: space[2.5]`):
- `THEN` label — existing `thenPrefix` style, unchanged
- next maneuver icon `20` accent
- next street name (fall back to the maneuver description when blank — see §4.2), `gray[300]` 15
- next distance — mono 15 `gray[300]`

Renders only when `nextStep != null`; the card keeps its single-row shape otherwise.

**GPS indicator** moves from inline-at-end to absolutely positioned top-right (`top: space[2.5]`, `right: space[3]`). Same dot, same colours, same `PulsingGpsIcon`, same offline `cloud-offline-outline`. It no longer competes with the distance for the end of the row.

### 3.2 `FooterCard` — restructured, gains the End Ride button

Three bands, so the red column never spans a variable-height card:

```
┌──────────────────────────────────────────────┐
│ STOP 2 of 3                    [ Skip stop ] │  full width, only when nextStop
├────────┬─────────────────────────────────────┤
│        │  14 min                    18 km/h  │
│  STOP  ├─────────────────────────────────────┤  ← red column spans THIS row only
│        │   ETA      DIST       CLIMB         │
│        │  14:44    13.7 km    ↑137 m         │
├────────┴─────────────────────────────────────┤
│  12.4 km · arrives 15:10 to finish           │  full width, only when nextStop
└──────────────────────────────────────────────┘
```

- **Then strip is deleted from here** — it lives in `ManeuverCard` now.
- **End Ride column:** `width: 76`, `alignSelf: 'stretch'`, full-bleed `safetyColors.danger`, `borderRightWidth: 1` `borderColor: darkTheme.borderDefault`, containing a centred 26 px white rounded square (`gray[50]`, `borderRadius: radii.sm`). Effective target ≈ 76 × 86 — far above the 48 dp floor.
  ⚠️ **Deliberately a plain `Pressable`, NOT `PressableScale`.** The plan originally specified the latter as "the repo's canonical press primitive"; reading it before trusting it showed why that fails here. `PressableScale` wraps its child in an `Animated.View` carrying only `transform`/`opacity` — no flex — so a column stretched by its parent collapses to glyph height inside that wrapper. Same shape as error-log #105. A spring scale on an edge-flush block reads wrong anyway; opacity is the right feedback, and `haptics.destructiveConfirm()` fires on press-in.
- **Hero row:** remaining time as `14` Montserrat-Bold **26** + `min` Roboto 12 `gray[400]`; speed right-aligned as mono-Bold **20** + `km/h` 11 `gray[400]`. Speed stays here because the sketch's rail badge is out of scope.
- **Metric row:** three cells (ETA / DIST / CLIMB) at mono-SemiBold **16** (was 14), labels at 10 px uppercase with an explicit 12 px leading. Separated from the hero by `borderTopWidth: 1`.

> Sizes above are **post-device-feedback (v0.2.162)**. The first cut shipped hero 30 / speed 22 / metrics 17 with 12 px body padding and an 8+8 separator, which measured ~111 px; the rider asked for it shorter. Trimming padding to 8, the separator to 4+4, and pinning explicit leadings took it to **~86 px** without giving back the legibility win — metrics are still 16 vs the original 14. Anything further should come off structure, not type size.

Remaining time needs a formatter — `formatDurationShort(seconds)` returning `{ value, unit }` (`"14"`/`"min"`, `"1"`/`"h 20"` past 60 min). Put it in core beside the distance helper.

### 3.3 Floating control rail — End Ride removed, and the rail re-centred

Delete the `styles.endRideButton` block and the `endRideButton` style.

⚠️ **"Nothing repositions" was wrong, and the device proved it.** The rail was
anchored `top: '38%'` with `transform: translateY(-120)` — a constant calibrated
against a 58 px maneuver card and five buttons. With the card at ~128 px and one
button gone, the top of the rail landed **on the instruction panel**. Reported
from the road on v0.2.161.

The fix is not a recomputed offset: the rail's height still varies at runtime,
because the elevation toggle only renders when the route carries a profile. It
is now centred by layout — `top: 0, bottom: 0, justifyContent: 'center'` — which
is immune to both the card height and the button count.

That makes the rail a full-height 80 px strip, so `pointerEvents="box-none"` is
now **load-bearing**: without it the rail swallows every map tap down the right
edge, including the tap that breaks camera follow.

`confirmEndRide` keeps two callers: the new footer button, and the Android hardware-back handler (`navigation.tsx:663`). Both go through the same confirm-gated `Alert`.

### 3.4 `RouteFeatureAlertStack` — offset must move

**This is the one that breaks silently if skipped.** `navigation.tsx:1474` renders `<RouteFeatureAlertStack />` with no props, taking the default `bottomOffset = 180` (`RouteFeatureAlertStack.tsx:43`). That 180 is not arbitrary — it is exactly today's stack height on a 34 px-inset device:

```
insets.bottom 34 + paddingBottom 16 + FooterCard 93 + gap 12 + SteepGradeIndicator 25 = 180
```

The new footer is ~111 px, which pushes the same sum to **198**. Left alone, route-feature alerts would render *on top of* the steep-grade pill. Pass it explicitly and derive it:

```tsx
<RouteFeatureAlertStack bottomOffset={insets.bottom + 139} />
```

The constant **is** the footer height, so it moves whenever the footer does: it was `164` (16 + 111 + 12 + 25) for the first cut and is `139` (16 + 86 + 12 + 25) after the v0.2.162 trim. If you change the footer's padding or type sizes, change this in the same commit.

---

## 4. Traps found while investigating

### 4.1 Dead HUD twin — do not edit it
`src/components/NavigationChrome.tsx` exports `NavigationManeuverCard` and `NavigationFooterPanel`, **with zero consumers anywhere in the app**. It is a pre-design-system HUD with hardcoded English strings — and, confusingly, it already contains a street-name line and a Then strip, i.e. it looks like the thing this plan describes. Editing it would produce a change that ships nothing. Deleting it is correct but is separate scope; flag it, don't fold it in.

### 4.2 `streetName` is `''` for GPX courses — the row must collapse, not reserve
`packages/core/src/courseSteps.ts:75` types it as `readonly streetName: ''` and hardcodes empty at lines 359 and 383, because synthesized geometry cannot know street names (deliberate — see CLAUDE.md § GPX Course Import). Server loops re-derive instructions client-side and may also lack it.

So: render the street line **only** when `currentStep.streetName?.trim()` is non-empty, and let the card shrink. A reserved-but-empty row is how an imported course ends up looking broken. Same for the Then row — fall back to the maneuver description (`getManeuverDescription`), which always has a value.

### 4.3 The contrast test already specifies the street-name token
`src/design-system/tokens/__tests__/contrast.test.ts:98–106` declares a `ManeuverCard` pair named **"street name secondary" at `gray[300]`** — for a street name the component does not currently render. The test is documenting an intended design that was never built. Use `gray[300]` (#D1D5DB, 9.97:1 on `bgPrimary`), not `textSecondary`. This change makes the existing assertion real rather than aspirational.

### 4.4 Multi-stop mode changes the card height
`FooterCard` grows a stop-header row and a to-finish line when `nextStop` is set (`NavigationHUD.tsx:~430`). If the red column spans the whole card it becomes a ~160 px slab of danger red. The three-band structure in §3.2 exists specifically to prevent that — the red column spans the hero+metrics row only.

### 4.5 Accidental end-ride
The target moves from a 40 px rail button to a 76 px block on the bottom-left thumb path, which is more reachable *and* more hittable by accident. Acceptable because `confirmEndRide` is already Alert-gated (Keep riding / Discard / Save) — a stray tap costs one dismissal, never a lost ride. Do not add a second confirmation; do not make it a long-press (a rider stopping at a junction needs one tap).

### 4.6 No test file exists for `NavigationHUD`
`src/design-system/organisms/__tests__/` contains nothing for the HUD. This is the most-looked-at component in the app and it has zero coverage. Add one as part of this work (§6).

### 4.7 `ThenStrip` becomes dead
The standalone `ThenStrip` export (`NavigationHUD.tsx:~250`) already has no consumers, and the inline strip replaces it. Delete it in this change rather than leaving a third "then" implementation behind.

---

## 5. Cost

HUD chrome went from **≈151 px to ≈239 px** in the first cut, and to **≈214 px** after the v0.2.162 footer trim — roughly **6% more map covered** than before the redesign, top and bottom combined. That is the deliberate trade for legibility. The next cheapest reversal, if it is still too much, is the maneuver type 27 → 24 px and the distance 36 → 30 px, recovering ~14 px without touching structure.

## 6. Sequence

Repo convention is tests first (`rules/common/testing.md`), and there is no existing coverage to regress against — so the first phase creates the safety net.

**Phase 1 — core helpers + tests**
- `formatDistanceParts`, `formatDurationShort` in `packages/core/src/` (+ unit tests: sub-km, km, rounding, 0, >60 min)
- Leave `formatDistance` untouched

**Phase 2 — `NavigationHUD.test.tsx` (new)**
Written against the *new* contract, red before the component changes:
- maneuver description + distance + unit render
- street name renders when present, **row absent when `streetName: ''`** (§4.2)
- Then row renders from `nextStep`, absent when null, falls back to description when the next street is blank
- GPS dot colour tiers + offline icon
- footer: hero time, speed, three metrics, no "then" content
- End Ride button fires its handler and carries `nav.endRide` as its accessibility label
- multi-stop: stop header + to-finish render, red column does not span them

**Phase 3 — `ManeuverCard`** (§3.1)

**Phase 4 — `FooterCard`** (§3.2), taking a new `onEndRide: () => void` prop

**Phase 5 — `navigation.tsx`**
- remove the rail End Ride button + its style (§3.3)
- pass `onEndRide={confirmEndRide}` to `FooterCard`
- `bottomOffset={insets.bottom + 164}` on `RouteFeatureAlertStack` (§3.4)
- delete `ThenStrip` (§4.7)

**Phase 6 — verify**
- `npm run typecheck` — 0 errors
- `npm test` — all three packages
- `npm run check:bundle` — **and confirm the serving directory is this repo, then grep the bundle for a symbol added this session** (CLAUDE.md, error-log #103: a port is not an identity)
- `npm run lint:mobile:check` (pre-push ratchet)

**Phase 7 — device**
Preview build, not dev — and check with the HUD actually running:
1. Maneuver text readable at handlebar distance in daylight
2. Street line present on a routed trip, **absent and not leaving a gap on an imported GPX course**
3. Then row appears/disappears correctly at the last maneuver
4. Route-feature alert does not overlap the steep-grade pill (§3.4) — needs a route with a tunnel or unprotected left
5. End Ride from the footer → Alert → Save and → Discard, both reaching the right screen
6. Hardware back still ends the ride
7. Multi-stop route: stop header + skip control intact, red column not a slab
8. RO and ES — longest maneuver strings at 27 px without clipping

## 7. Rollback

Single commit, no migration, no server change, no new dependency, no persisted state. `git revert` is the whole rollback. Nothing here is version-gated or flag-gated, and no API contract moves.

## 8. Open / deliberately not done

- **`NavigationChrome.tsx` deletion** (§4.1) — real dead code, but its own change.
- **Speed as a rail badge** — in the original sketch, dropped because the rail is out of scope. If it is wanted later it is an *addition* to the rail, and should be revisited then.
- **Lane guidance / junction view** — the natural next step for "predictability", needs OSM data the app does not have.
- **Landscape** — map screens are portrait-locked (`useLockOrientation`), so no landscape variant is needed.
