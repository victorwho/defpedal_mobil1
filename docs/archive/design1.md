# Implementation Plan: Applying Design System v1.0 to the Mobile App

## Current State vs. Target State

| Aspect | Current | Design System Target |
|--------|---------|---------------------|
| **Token system** | Single `theme.ts` with flat colors + 4 radii | Full token hierarchy: colors, typography, spacing, shadows, radii, motion |
| **Typography** | System font only, ad-hoc sizes/weights per component | 3 font families (Montserrat, DM Sans, Roboto Mono) with 11-level type scale |
| **Colors** | ~25 tokens, partially aligned | Full brand palette + semantic safety palette (safe/caution/danger/info) with tint/text variants |
| **Spacing** | Ad-hoc pixel values (14, 16, 18, 20...) | 4px base unit, 13-step scale snapped to 8px increments |
| **Components** | 8 bespoke components with inline StyleSheets | Atomic design: 8 atoms -> 5 molecules -> 5 organisms -> 4 templates |
| **Shadows** | Per-component inline shadows | 4 elevation levels + 4 safety glow variants |
| **Motion** | None | 5 duration tokens, 4 easing curves, safety-specific animations |
| **Radii** | `sm:14, md:20, lg:28, pill:999` | `sm:4, md:8, lg:12, xl:16, 2xl:24, full:9999` (significantly different) |

---

## Phase 1 -- Foundation Layer (do first, breaks nothing)

### Step 1.1: Install and bundle custom fonts

```
expo install expo-font
```
- Download Montserrat (600, 700, 800), DM Sans (400, 500, 600, 700), Roboto Mono (500, 600, 700)
- Place in `apps/mobile/assets/fonts/`
- Load via `useFonts()` in root `_layout.tsx` with a splash screen hold

### Step 1.2: Create the token files

Create `apps/mobile/src/design-system/tokens/` with:

| File | Contents |
|------|----------|
| `colors.ts` | Brand palette (`bgDeep`, `bgPrimary`, `bgSecondary`, `bgTertiary`), safety semantic palette (`safe`, `caution`, `danger`, `info` -- each with `DEFAULT`, `tint`, `text`), text colors, border colors, accent colors. Map every CSS variable from the spec to a TS constant. |
| `typography.ts` | Type scale object keyed by token name (`text4xl`, `textBase`, `textDataLg`, etc.) -- each entry is `{ fontFamily, fontSize, fontWeight, lineHeight }` using the loaded custom fonts |
| `spacing.ts` | `space` object: `{ 0: 0, 0.5: 2, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 }` |
| `radii.ts` | Updated radii: `{ none: 0, sm: 4, md: 8, lg: 12, xl: 16, '2xl': 24, full: 9999 }` |
| `shadows.ts` | Platform-split shadows (iOS shadowX / Android elevation) for `sm`, `md`, `lg`, `xl` + safety glows |
| `motion.ts` | Duration and easing constants for `react-native-reanimated` |
| `index.ts` | Barrel re-export as a single `designTokens` object |

### Step 1.3: Create a theme provider with dark/light support

- Create `apps/mobile/src/design-system/ThemeContext.tsx`
- Uses `useColorScheme()` from React Native, defaults to dark
- Provides resolved tokens via React context
- Rule from spec: Force dark during active navigation (read `appState` from Zustand store)
- Export a `useTheme()` hook

### Step 1.4: Deprecate old `theme.ts`

- Re-export the new tokens from `theme.ts` temporarily so nothing breaks
- Add a `// @deprecated -- use design-system tokens` comment

---

## Phase 2 -- Atomic Components (build bottom-up)

Build each atom as a new file under `apps/mobile/src/design-system/atoms/`. These are pure, stateless, token-consuming components.

| Component | Key implementation notes |
|-----------|------------------------|
| **Button** | 5 variants (primary/secondary/ghost/danger/safe), 3 sizes (sm/md/lg), pill shape (`radii.full`), loading spinner state, `Pressable` with opacity/scale feedback |
| **Badge** | 6 variants (risk-safe/risk-caution/risk-danger/info/neutral/accent), pill shape, risk scores use `fontMono` |
| **TextInput** | 48px height, `bgSecondary` background, `radiusMd` default / `radiusFull` for search variant, accent focus border, left/right icon slots |
| **Toggle** | 52x28 track, 24px thumb, accent-on/gray-off, `react-native-reanimated` for thumb slide |
| **IconButton** | 44x44 touch target, 24px icon centered, transparent bg, `radiusFull` |
| **Spinner** | 3 sizes (16/24/32), accent color default, `Animated.loop` rotation |
| **Divider** | 1px `borderDefault` color, optional 56px left inset |
| **Skeleton** | Pulsing opacity between `bgTertiary` and `bgSecondary`, matches target shape |

---

## Phase 3 -- Molecule Components

| Component | Replaces / Extends | Key changes |
|-----------|-------------------|-------------|
| **SearchBar** | Current `PlaceSearchField` | Collapsed pill state (blur bg) -> expanded full-screen overlay; uses new TextInput atom internally |
| **RouteCard** | New | Risk score badge (48px circle, mono font), route name + distance/ETA, risk gradient bar (4px flex segments), recommended left-border accent |
| **HazardAlertPill** | New | Floating top-center pill during navigation; severity-colored bg; spring entrance + hazard-pulse animation; auto-dismiss after passing |
| **MenuItem** | New (for settings/lists) | 56px min-height, icon + label + description + right accessory; replaces ad-hoc list rows in settings/diagnostics screens |
| **Toast** | New | Bottom pill snackbar, 4s auto-dismiss, slide-up entrance |

---

## Phase 4 -- Organism Components

| Component | Replaces / Extends | Key changes |
|-----------|-------------------|-------------|
| **BottomSheet** | Current bottom area in `MapStageScreen` | 3 snap points (25%/50%/85%), `@gorhom/bottom-sheet`, drag handle, proper `rounded-t-2xl` |
| **NavigationHUD** | Current `NavigationChrome` + `NavigationManeuverCard` | Spec layout: 48px maneuver arrow + street name (heading font 2xl) + distance (mono data-lg). Add hazard sub-bar with urgency escalation. Blur bg. |
| **RouteComparisonPanel** | New (route-preview screen content) | Sits inside BottomSheet at half snap; sort tabs (Safest/Fastest/Shortest); vertical RouteCard list |
| **Modal** | New | Scale-in animation, dark overlay, critical variant with red border + non-dismissable overlay |
| **BottomNav** | Not currently present (Expo Router stack) | 4 tabs (Explore/Routes/Report/Profile), accent active state, hides during navigation |

---

## Phase 5 -- Screen Migration (one screen at a time)

Migrate each screen to consume design system components. Order by user-facing importance:

| Order | Screen | Scope of change |
|-------|--------|----------------|
| 1 | **Navigation** (`navigation.tsx`) | Replace `NavigationChrome` with `NavigationHUD`; add `HazardAlertPill`; implement urgency escalation sequence; force dark theme |
| 2 | **Route Preview** (`route-preview.tsx`) | Replace content with `RouteComparisonPanel` inside `BottomSheet`; use `RouteCard` components; add sort tabs |
| 3 | **Route Planning** (`route-planning.tsx`) | Replace `PlaceSearchField` with new `SearchBar`; update buttons to `Button` atoms; apply spacing tokens |
| 4 | **Settings** (`settings.tsx`) | Replace list items with `MenuItem` molecules; proper `Divider` atoms |
| 5 | **Feedback** (`feedback.tsx`) | Apply typography tokens, `Button` atoms, proper card styling |
| 6 | **Auth** (`auth.tsx`) | `TextInput` atoms, `Button` atoms, brand typography |
| 7 | **Offline Maps** (`offline-maps.tsx`) | `MenuItem` rows, `Badge` for status, `Button` for downloads |
| 8 | **Onboarding** (`onboarding.tsx`) | Brand typography (Montserrat headings), accent colors |
| 9 | **Diagnostics** (`diagnostics.tsx`) | Mono font for data display, `StatusCard` -> `Badge` updates |

---

## Phase 6 -- Map & Safety Patterns

| Task | Details |
|------|---------|
| **Route polyline update** | Primary route 6px width, alternatives 4px at 60% opacity; per-segment risk coloring using `safe`/`caution`/`danger` from new tokens |
| **Risk score display rule** | Always show: number + color + text label (never color alone) -- audit all current risk displays |
| **Hazard markers** | 3-tier sizing (verified 32px / recent 24px / historical 20px gray); pulsing ring on verified |
| **User position dot** | Blue dot (#3B82F6) with heading cone and accuracy ring |
| **Map controls** | Right-side vertical stack, 44px icon buttons with `bgDark800` at 90% opacity |

---

## Phase 7 -- Polish & Accessibility

| Task | Details |
|------|---------|
| **Haptics** | Install `expo-haptics`; add light/medium/strong feedback at hazard distance thresholds |
| **Accessibility labels** | Audit all interactive elements for `accessibilityLabel`; `accessibilityRole` on buttons/switches; `accessibilityLiveRegion="assertive"` on HUD |
| **Touch targets** | Audit all tappable elements for 44x44px minimum; expand hit areas with padding where needed |
| **Reduced motion** | Check `useReducedMotion()` from reanimated; disable non-safety animations |
| **Color-blind safety** | Verify risk displays always have text label alongside color coding |

---

## Dependencies to Install

```bash
npx expo install expo-font expo-haptics @gorhom/bottom-sheet react-native-reanimated react-native-gesture-handler
```

(Check which are already installed -- `react-native-reanimated` and `react-native-gesture-handler` likely are.)

---

## Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Radii values change dramatically** (14->4, 20->8, 28->12) -- visual shock | Migrate one screen at a time; compare side-by-side before committing |
| **Custom fonts increase bundle + load time** | Subset fonts to latin/latin-ext only; preload critical weights; splash screen holds until loaded |
| **BottomSheet library adds native dependency** | `@gorhom/bottom-sheet` requires a dev client rebuild; test on both platforms |
| **Migration breaks existing screens mid-process** | Keep old `theme.ts` re-exporting new tokens; migrate components one file at a time; old and new can coexist |
