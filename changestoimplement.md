# Changes to Implement

## Habit Engine — Remaining Work

### Phase 5: Notifications
- [~] IN PROGRESS — Push notification delivery (server schedules, but EAS project ID not configured for native delivery)
- [!] BLOCKED — Quiet hours enforcement in notification triggers (server code exists but doesn't check quiet_hours before sending)
- [x] DONE — Push notification registration on sign-in (permission prompt + token sent to server) (2026-04-04)

### Phase 7: Endgame (Deferred)
- [ ] NOT STARTED — Mia persona progressive journey (4 levels with safety floor constraints)
- [ ] NOT STARTED — Neighborhood safety challenge (invite 3 cyclists)
- [ ] NOT STARTED — Safety Wrapped (Spotify-style annual/monthly summary) — schedule for December
- [ ] NOT STARTED — Neighborhood safety leaderboard
- [ ] NOT STARTED — Safety Guide mentorship system (100+ rides)
- [ ] NOT STARTED — City Safety Report (auto-generated monthly)
- [ ] NOT STARTED — Unlockable feature tiers (Night Ride at 5, Weather Safety at 15, Analytics at 30)
- [ ] NOT STARTED — Tomorrow's route safety preview (needs saved commute routes)
- [ ] NOT STARTED — "Convince a non-cyclist" sharing flow (needs web page for routes)
- [ ] NOT STARTED — Personal safety map overlay (ride history as colored lines on map)
- [ ] NOT STARTED — Hazard alert sharing (share card with hazard details)

## Onboarding
- [x] DONE — Risk overlay on safety score map (2026-04-03)
- [x] DONE — 4-category safety score display (2026-04-03)
- [x] DONE — Circuit route to nearest POI (2026-04-03)
- [x] DONE — Auto-skip location permission if already granted (2026-04-03)
- [x] DONE — Goal selection bounce-back fix (2026-04-03)
- [x] DONE — Signup enforcement (2nd open prompt, 5th mandatory) (2026-04-03)
- [x] DONE — Username prompt after sign-up (2026-04-03)

## Route Planning
- [x] DONE — Multi-stop routes (up to 3 waypoints) (2026-04-03)
- [x] DONE — Waypoint markers on map (2026-04-03)
- [x] DONE — Hazards visible on planning map (2026-04-03)
- [x] DONE — Tappable hazard info cards (2026-04-03)
- [x] DONE — Crosshair + Report button flow (2026-04-03)
- [x] DONE — Waypoint reordering (up/down arrows to reorder stops) (2026-04-04)
- [x] DONE — Saved routes / favorite routes (2026-04-04)
- [x] DONE — Cleaner address display (strip postal code, country, county from destination/stop labels) (2026-04-04)
- [x] DONE — Collapsible UI: tap map to toggle FABs, weather widget, and bottom nav with fade animation (2026-04-04)

## Navigation
- [x] DONE — Speed indicator in footer card (2026-04-03)
- [x] DONE — Footer card metric dividers (2026-04-03)
- [x] DONE — Hazard zone size reduced 50% (2026-04-03)
- [x] DONE — Hazard alert radius reduced 30% (2026-04-03)
- [x] DONE — Softer hazard shading (semi-transparent dark-red base + lighter red dashes) (2026-04-04)
- [x] DONE — Zoom in closer during navigation (followZoomLevel 16→17.5) (2026-04-04)
- [x] DONE — Voice guidance: 200m pre-announce, ETA every 5min, tap ManeuverCard to re-announce (2026-04-04)
- [x] DONE — Reroute through waypoints (strips passed waypoints based on rider position on polyline) (2026-04-04)

## Community
- [x] DONE — Like/love counter optimistic update fix (2026-04-03)
- [x] DONE — Username displayed in feed (2026-04-03)
- [x] DONE — Follow/unfollow users (2026-04-03)
- [x] DONE — User profile page (view other user's trips) (2026-04-03)

## Profile
- [x] DONE — Username field (set/edit) (2026-04-03)
- [x] DONE — Guardian tier section (2026-04-03)
- [x] DONE — Profile photo upload (expo-image-picker + Supabase Storage + avatar display) (2026-04-04)
- [x] DONE — Export ride data (GPX via expo-file-system + native share sheet) (2026-04-04)

## History
- [x] DONE — Inline streak, guardian tier, daily quiz (2026-04-03)
- [x] DONE — EUR saved + hazards in stats cards (2026-04-03)
- [x] DONE — Streak chain direction fix (fills left-to-right) (2026-04-04)
- [x] DONE — Trip comparison (select 2 trips from history, side-by-side stats + map) (2026-04-04)

## UX & Visual Polish
- [x] DONE — Tighten right-hand FAB buttons (reduced sizes + gaps on nav/planning/MapStage) (2026-04-04)
- [x] DONE — Change fonts: Montserrat for headings, Roboto for body text (replaced DM Sans) (2026-04-04)
- [x] DONE — Push Notifications — expo-notifications installed, NotificationProvider wired, push token registration on auth, tap-to-navigate (2026-04-04)

## Internationalization
- [x] DONE — Romanian language: i18n framework + en/ro translation files + language picker in profile (2026-04-04)

## Technical Debt
- [ ] NOT STARTED — Install @testing-library/react for hook tests (tests written but can't run)
- [x] DONE — Deduplicate qualifyStreakAsync helper (extracted to lib/streaks.ts) (2026-04-04)
- [x] DONE — Add `source` field to hazard reporting API (in_ride/manual/armchair) (2026-04-04)
- [ ] NOT STARTED — Social digest notification subquery needs manual DB validation
- [!] BLOCKED — iPhone validation (no macOS hardware available)
- [ ] NOT STARTED — Redis-backed production caching/rate-limiting
- [x] DONE — Merge feature/habitengine branch to main (2026-04-03)
