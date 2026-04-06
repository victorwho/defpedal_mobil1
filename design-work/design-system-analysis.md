# Design System Analysis

**Date:** 2026-04-06  
**Scope:** `apps/mobile/src/design-system/` and screen implementations in `apps/mobile/app/`

---

## Executive Summary

The Defensive Pedal design system has a **solid foundation** with well-structured tokens, atomic component hierarchy, and theme support. However, **implementation drift** has created inconsistencies: hardcoded colors, bypassed theming, and underutilized components. Overall score: **6.2/10**.

---

## SWOT Analysis

### Strengths

1. **Well-structured token foundation**
   - Clear semantic naming (`bgDeep`, `bgPrimary`, `textSecondary`)
   - Safety-specific palette (`safe`, `caution`, `danger`) kept separate from brand colors
   - Consistent 4px base unit spacing scale
   - Platform-aware shadows (iOS shadow props vs Android elevation)
   - Motion tokens with accessibility consideration (reduced motion hook exists)

2. **Good atomic architecture**
   - Clear atoms → molecules → organisms hierarchy
   - Components are well-documented with JSDoc headers
   - Type-safe with TypeScript interfaces for all props
   - Accessibility built in (a11y labels, WCAG 1.4.1 compliance notes in Badge)

3. **Theme system**
   - Dark/light theme support via `ThemeContext`
   - Smart navigation-time override (forces dark during NAVIGATING state)
   - `useTheme()` hook for consistent access

4. **Reusable components**
   - `Button` with 5 variants, 3 sizes, loading state, haptic feedback
   - `Badge` with risk-semantic variants and mono font option
   - `SearchBar` is feature-complete with suggestions, loading, icons
   - `BottomNav` with proper safe area handling

---

### Weaknesses

1. **Hardcoded colors throughout screens** (50+ instances found)
   ```tsx
   // Examples found in codebase:
   color: '#F2C30F'           // Should be brandColors.accent
   color: '#60A5FA'           // Should be safetyColors.info
   color: '#EF4444'           // Should be safetyColors.danger
   backgroundColor: '#FFFFFF' // Should be a theme token
   color: '#22C55E'           // Should be safetyColors.safe
   ```

2. **Inline rgba() values without tokens** (30+ instances)
   ```tsx
   backgroundColor: 'rgba(17, 24, 39, 0.86)'  // No token for glass/frosted backgrounds
   backgroundColor: 'rgba(250, 204, 21, 0.1)' // No token for accent tints
   backgroundColor: 'rgba(74, 222, 128, 0.05)' // No token for safe tints
   ```

3. **Toggle component exists but isn't used**
   - `profile.tsx` has a custom inline toggle implementation (lines 383-420, 690-706)
   - `Toggle.tsx` atom exists in design system but has 0 imports in app screens

4. **`useTheme()` underutilized**
   - Only 10 of 30 screens import `useTheme`
   - Many screens directly import `brandColors`/`darkTheme` tokens, bypassing theming
   - Makes light theme support effectively broken

5. **Inconsistent StyleSheet patterns**
   - Some screens define 100+ style properties inline
   - Font sizes are sometimes hardcoded (`fontSize: 16`) instead of using `textBase`

6. **Missing tokens**
   - No opacity tokens (0.05, 0.1, 0.15, 0.3 used repeatedly)
   - No glass/frosted background tokens
   - No icon size tokens (20, 22, 24, 48 used inconsistently)
   - No z-index tokens

---

### Opportunities

1. **Add opacity/tint tokens**
   ```ts
   export const opacity = { subtle: 0.05, light: 0.1, medium: 0.15, strong: 0.3 }
   export const tints = {
     accent: `rgba(250, 204, 21, ${opacity.light})`,
     safe: `rgba(34, 197, 94, ${opacity.light})`,
     glass: `rgba(17, 24, 39, 0.86)`,
   }
   ```

2. **Create a Card compound component**
   - Every screen has similar card patterns (border, radius, padding, glass bg)
   - Could standardize: `<Card variant="glass|solid|outline">`

3. **Icon size tokens**
   ```ts
   export const iconSize = { sm: 16, md: 20, lg: 24, xl: 32 }
   ```

4. **Enforce theme usage via ESLint**
   - Ban direct `#hex` color imports in screen files
   - Require `useTheme()` or token imports

5. **Component consolidation**
   - Replace inline toggles with `Toggle` atom
   - Create `SettingRow` molecule (used 20+ times in profile.tsx)
   - Create `SectionTitle` atom (repeated pattern with uppercase, letterSpacing)

6. **Storybook/documentation**
   - No component catalog exists
   - Would help maintain consistency across new screens

---

### Threats (Implementation Drift)

| Pattern | Frequency | Risk Level |
|---------|-----------|------------|
| Hardcoded hex colors | 50+ | High - Theme breaks, inconsistent palette |
| Inline rgba | 30+ | Medium - Impossible to update systematically |
| Custom toggles | 3 screens | Low - Behavior/appearance divergence |
| Direct token imports (bypassing useTheme) | 20+ screens | High - Light theme won't work |
| Magic numbers (fontSize, padding) | Throughout | Medium - Inconsistent spacing/type |

---

## Implementation Quality Score

| Area | Score | Notes |
|------|-------|-------|
| Token usage | 6/10 | Tokens exist but often bypassed |
| Component reuse | 7/10 | Good atoms/molecules, underused organisms |
| Theme support | 4/10 | System exists but screens hardcode dark values |
| Consistency | 5/10 | Similar patterns differ slightly per screen |
| Accessibility | 8/10 | Good a11y props, WCAG notes in code |
| Documentation | 7/10 | JSDoc present, no visual catalog |

**Overall: 6.2/10** — Solid foundation, inconsistent adoption.

---

## Design System Inventory

### Tokens (`src/design-system/tokens/`)

| File | Purpose | Quality |
|------|---------|---------|
| `colors.ts` | Brand, safety, gray palettes + dark/light themes | Excellent |
| `spacing.ts` | 4px base scale + layout constants | Good |
| `typography.ts` | Font families + type scale | Good |
| `radii.ts` | Border radius scale | Good |
| `shadows.ts` | Platform-aware shadow/elevation | Good |
| `motion.ts` | Duration + easing curves | Good |
| `badgeColors.ts` | Badge category colors | Good |
| `badgeIcons.ts` | Badge icon mappings | Good |

### Atoms (`src/design-system/atoms/`)

| Component | Props | Used In Screens |
|-----------|-------|-----------------|
| `Button` | variant, size, loading, icons, fullWidth | Many |
| `Badge` | variant, size, icon, mono | Several |
| `IconButton` | icon, size, variant | Many |
| `Toggle` | value, onChange, disabled | **0 (unused!)** |
| `TextInput` | variant, leftIcon, error | SearchBar |
| `Spinner` | size, color | Several |
| `Skeleton` | width, height, radius | Few |
| `Divider` | — | Few |
| `BackButton` | onPress | Several |
| `Co2Badge` | value | TripCard |
| `AnimatedCounter` | value, duration | Impact screens |
| `BadgeIcon` | badge, size | Badge system |
| `BadgeProgressBar` | progress | Badge system |
| `BadgeInlineChip` | badge | Badge system |

### Molecules (`src/design-system/molecules/`)

| Component | Purpose | Complexity |
|-----------|---------|------------|
| `SearchBar` | Autocomplete with suggestions | High |
| `WeatherWidget` | Weather + AQI display | Medium |
| `HazardAlert` | Hazard proximity warning | Medium |
| `HazardAlertPill` | Compact hazard indicator | Low |
| `RouteCard` | Route option display | Medium |
| `MenuItem` | List item with icon | Low |
| `Toast` | Notification toast | Low |
| `ProgressBar` | Progress indicator | Low |
| `TimeBankWidget` | Microlives display | Medium |
| `BadgeCard` | Badge display card | Medium |
| `WeatherWarningModal` | Weather alert modal | Medium |

### Organisms (`src/design-system/organisms/`)

| Component | Purpose | Screens Used |
|-----------|---------|--------------|
| `BottomNav` | Tab bar | All main screens |
| `NavigationHUD` | Turn-by-turn overlay | navigation.tsx |
| `RiskDistributionCard` | Risk breakdown chart | route-preview |
| `ElevationChart` | Elevation profile | route-preview |
| `ElevationProgressCard` | Live elevation tracker | navigation |
| `RouteComparisonPanel` | Safe vs fast comparison | route-preview |
| `BottomSheet` | Draggable sheet | Several |
| `Modal` | Generic modal | Several |
| `TripCard` | Trip history card | trips, feed |
| `StreakCard` | Streak display | history, dashboard |
| `StreakChain` | Streak visualization | dashboard |
| `CommunityStatsCard` | Community metrics | community |
| `TrophyCaseHeader` | Badge header | achievements |
| `CategoryTabBar` | Badge category tabs | achievements |
| `BadgeDetailModal` | Badge details | achievements |
| `BadgeUnlockOverlay` | Badge celebration | post-ride |

---

## Quick Wins (Implemented)

1. [x] Replace `#EF4444` → `safetyColors.danger` (profile.tsx, auth.tsx)
2. [x] Replace `#FACC15`/`#F2C30F` → `brandColors.accent` (history.tsx, impact-dashboard.tsx, feedback.tsx)
3. [x] Replace `#22C55E` → `safetyColors.safe` (auth.tsx)
4. [x] Replace `#3B82F6`/`#60A5FA` → `safetyColors.info` (route-planning.tsx, history.tsx, impact-dashboard.tsx)
5. [x] Replace `#000` → `brandColors.textInverse` (profile.tsx, user-profile.tsx, community-feed.tsx)
6. [x] Replace `#8f9bad` → `gray[400]` (community-trip.tsx)
7. [x] Replace `#D1D5DB` → `gray[300]` (feedback.tsx star inactive color)
8. [x] Add `tints.ts` token file with common rgba values
9. [x] Create `SettingRow` molecule for toggle settings
10. [x] Replace 9 inline toggles with `SettingRow` in profile.tsx
11. [x] Remove unused toggle styles from profile.tsx

## Theme Audit (Completed)

### Current State
- **4 screens** use `useTheme()`: settings, _layout, diagnostics, offline-maps
- **27 screens** import directly from `tokens/colors`, bypassing theme system

### Screens Importing Colors Directly
```
profile.tsx, community-feed.tsx, user-profile.tsx, community-trip.tsx,
feedback.tsx, route-planning.tsx, impact-dashboard.tsx, auth.tsx,
history.tsx, navigation.tsx, route-preview.tsx, achievements.tsx,
trip-map.tsx, trips.tsx, faq.tsx, trip-compare.tsx, community.tsx,
daily-quiz.tsx, stats.tsx, onboarding/* (6 files)
```

### Why Full Theme Migration Is Complex
1. **StyleSheets are static** — can't use hooks inside `StyleSheet.create()`
2. **Requires pattern change** — either inline styles or style factory functions
3. **Large surface area** — 27 screens × many style properties each
4. **Low priority** — app forces dark theme during navigation (critical path)

### Recommended Migration Approach (Future)
For screens that need light theme support:
```tsx
// Pattern 1: Inline styles for themed colors
const { colors } = useTheme();
<View style={[styles.card, { backgroundColor: colors.bgPrimary }]} />

// Pattern 2: Style factory (memoized)
const useStyles = () => {
  const { colors } = useTheme();
  return useMemo(() => StyleSheet.create({
    card: { backgroundColor: colors.bgPrimary },
  }), [colors]);
};
```

### Mitigation
- Light theme is only active when NOT navigating
- Most users have system dark mode enabled
- Safety-critical screens (navigation, route-preview) force dark theme

---

## Recommendations (Priority Order)

### P0 - Critical (Done)
- [x] Add `tints.ts` token file
- [x] Replace all hardcoded safety colors with tokens

### P1 - High (Done)
- [x] Use `Toggle` atom instead of inline implementations
- [x] Create `SettingRow` molecule for profile patterns
- [x] Audit all screens for `useTheme()` usage (documented, not migrated)

### P2 - Medium (Done)
- [x] Add icon size tokens (`iconSize.ts` — xs/sm/md/lg/xl/2xl/3xl)
- [x] Create `Card` component with variants (solid/glass/outline)
- [x] Remove dead card styles from history.tsx
- [x] Add z-index tokens (`zIndex.ts` — base/overlay/popover/sticky/modal/toast/supreme, 11 replacements)
- [x] Replace 20 inline rgba() values with tint tokens across 7 files
- [x] Migrate `history.tsx` to `useTheme()` pattern (flagship example)
- [x] Migrate `profile.tsx` to `useTheme()` (22 color replacements)
- [x] Migrate `community.tsx` + `community-feed.tsx` to `useTheme()`
- [x] Migrate `achievements.tsx` to `useTheme()`
- [ ] Add ESLint rule to ban hardcoded hex colors (no ESLint in project — skipped)
- [ ] Set up jest-expo for full React Native component render tests

### P3 - Low (Done / Backlog)
- [x] Create `SectionTitle` atom (accent/muted variants, adopted in profile + user-profile)
- [ ] Add Storybook for component documentation
- [ ] Add z-index tokens
- [ ] Full light theme migration (27 screens)

---

## Files Changed

### New Files
- `apps/mobile/src/design-system/tokens/tints.ts` — opacity scale + brand/safety/surface tints
- `apps/mobile/src/design-system/tokens/iconSize.ts` — standardized icon sizes (xs through 3xl)
- `apps/mobile/src/design-system/atoms/Card.tsx` — card container with solid/glass/outline variants
- `apps/mobile/src/design-system/molecules/SettingRow.tsx` — toggle setting row molecule
- `apps/mobile/src/design-system/molecules/__tests__/SettingRow.test.tsx` — props interface + behavior tests (12 tests)
- `apps/mobile/vitest.config.ts` — vitest configuration for mobile app
- `apps/mobile/vitest.setup.ts` — React Native mocks for testing

### Updated Files
- `apps/mobile/src/design-system/tokens/index.ts` — export tints
- `apps/mobile/src/design-system/molecules/index.ts` — export SettingRow
- `apps/mobile/app/history.tsx` — replaced hardcoded colors
- `apps/mobile/app/profile.tsx` — replaced 9 inline toggles with SettingRow, removed 20 lines of toggle styles
- `apps/mobile/app/auth.tsx` — replaced hardcoded colors
- `apps/mobile/app/route-planning.tsx` — replaced hardcoded colors
- `apps/mobile/app/impact-dashboard.tsx` — replaced hardcoded colors
- `apps/mobile/app/feedback.tsx` — replaced hardcoded colors
- `apps/mobile/app/community-trip.tsx` — replaced hardcoded colors
- `apps/mobile/app/user-profile.tsx` — replaced hardcoded colors
- `apps/mobile/app/community-feed.tsx` — replaced hardcoded colors
