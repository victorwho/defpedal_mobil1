# Design Plan — Revised

## Phase 1: Clean Up & Unify

Goal: Eliminate legacy code islands, unify the visual system, establish accessibility and interaction quality.

### Task 1.4: Accessibility & Contrast Pass (FIRST — foundational)
- Lighten `textMuted` from `#6B7280` to `#8B9198` for WCAG AA against deep dark backgrounds
- Audit all custom `<Pressable>` elements and add `accessibilityRole` + `accessibilityLabel`
- Add `accessible={true}` and `accessibilityHint` where meaningful
- Verify 4.5:1 contrast for primary text in both light/dark themes

### Task 1.1: Eradicate Legacy Theme Dependencies
- Migrate all 45 files still using `mobileTheme`/`brandColors` to `useTheme()` + `createThemedStyles`
- Delete `apps/mobile/src/lib/theme.ts` once zero consumers remain
- Components to migrate: FeedCard, SafetyBadge, SafetyTagChips, NavigationChrome, StatusCard, PlaceSearchField, plus ~39 design-system and component files

### Task 1.2: Clean Up Semantic Colors
- Replace remaining hardcoded hex values with token references
- Enforce: Yellow = brand/primary only; Green/Amber/Red = safety/risk semantics only
- Replace `#F2C30F` microlives usages with `brandColors.accent` or new `accentOnSurface` token

### Task 1.3: Purge Diagnostic Data from User UI (verify scope first)
- Check what diagnostic badges/labels remain visible on route-preview and navigation screens
- Remove any developer-facing info (coverage, sync status, step counters, BG active) from user UI
- Move to diagnostics.tsx only

### Task 1.5: Interaction Quality (NEW — parallel workstream)
- Touch target audit: ensure all tappable elements >= 44x44pt (use `hitSlop` where visual is smaller)
- Safe area audit: verify headers, tab bars, bottom CTAs respect safe areas on all screens
- Add `prefers-reduced-motion` support: skip/reduce animations when system setting is on
- Add haptic feedback on key actions (route start, hazard report, badge unlock)
- Text overflow: verify truncation with ellipsis on long addresses, usernames, route names
- Dark mode contrast verification pass

## Phase 2: Calm Route Planning

Goal: Protect the map and reduce feature fatigue through progressive disclosure.

### Task 2.1: Conditional Visibility via Existing appState (revised — no new mode flag)
- Use existing `appState` ('IDLE', 'ROUTE_PREVIEW', 'NAVIGATING', 'AWAITING_FEEDBACK') to drive visibility
- When `appState === 'IDLE'` and no destination set: show minimal UI (search, locate FAB, hazard FAB, bottom nav)
- When destination set / `appState === 'ROUTE_PREVIEW'`: reveal route-specific controls
- No new `appMode` Zustand field — avoid parallel state axis

### Task 2.2: Phase the Planning Screen (Progressive Disclosure)
- Phase A (initial load): destination search bar, map, bottom nav, Locate + Hazard FABs only
- Phase B (destination set): reveal collapsed origin card, routing mode toggle, "Preview route" button
- Replace text "EDIT" on origin card with recognizable `IconButton`

### Task 2.3: Reduce Map Clutter & FABs
- Reduce right-edge FABs to 2: Locate and Hazard Report
- Move Voice guidance to route preview; FAQ/Menu to Profile tab
- Replace 14 overlapping layer toggles with a single "Show nearby" bottom sheet (Parking, Rental, Water, etc.)
- Weather Widget: only auto-expand if conditions severe (rain > 30%); otherwise tiny ambient indicator

## Phase 3: Restructure Non-Map Surfaces

Goal: Elevate Community tab, restructure History around rides, flatten Profile.

### Task 3.1: Community Feed Redesign
- Maintain 4-tab bottom nav
- Simplify FeedCard: one narrative center per post (Rider + Route + Safety Takeaway)
- Add "global feed" API fallback when GPS denied

### Task 3.2: Rebuild History Around Trip List
- Remove overlapping impact dashboards — consolidate streak + total impact into compact header
- Trip list renders inline immediately below header as primary content

### Task 3.3: Profile Section Cleanup (revised — accept scrolling)
- Group settings into 3 sections: Cycling Preferences, Display, Account
- Use existing `SectionTitle` atoms for grouping
- Replace heavy modals for simple pickers with inline accordions or small bottom sheets
- Accept scrolling — focus on clean organization, not "fits one screen"

### Task 3.4: Visual Softening
- Reduce repetition of heavy bordered hero shells and glowing ornaments on utility screens
- Let hierarchy be driven by spacing and typography rather than repetitive containers

## Phase 4: Systems Polish

Goal: Streamline ride execution, feedback loops, and gamification architecture.

### Task 4.1: Simplify Route Preview & Navigation (revised — keep voice toggle visible)
- Preview: keep distance, duration, safety badge always visible; elevation + risk distribution in expanded sheet
- Add chevron collapse hint to bottom sheet handle
- Navigation: reduce control rail to 3 buttons: Recenter, Hazard, End Ride (red)
- Voice toggle: keep as dedicated visible FAB (not buried in ManeuverCard) — cyclists need quick access

### Task 4.2: Single Source of Display for Gamification
- Impact Dashboard = canonical home for Streaks, CO2, Hazards
- Other screens link to dashboard instead of duplicating data

### Task 4.3: Frictionless Feedback (revised — defer notification budget)
- Merge post-ride impact summary + star rating into single screen
- Add "Done/Skip" button; auto-suppress rating after 3 skips
- Notification budget: DEFERRED until quiet hours enforcement is unblocked

### Task 4.4: Polish Animations
- Build `FadeSlideIn` wrapper (opacity 0→1, translateY 10→0, 200ms ease-out)
- Apply to route preview summaries, history cards, feed cards
- Respect `prefers-reduced-motion` (instant render, no animation)
