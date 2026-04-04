# Changes to Implement

## Habit Engine — Remaining Work

### Phase 5: Notifications
- [~] IN PROGRESS — Push notification delivery (server schedules, but EAS project ID not configured for native delivery)
- [!] BLOCKED — Quiet hours enforcement in notification triggers (server code exists but doesn't check quiet_hours before sending)
- [ ] NOT STARTED — Contextual notification permission prompt after first ride (currently disabled)

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
- [ ] NOT STARTED — Waypoint reordering (drag to reorder stops)
- [ ] NOT STARTED — Saved routes / favorite routes

## Navigation
- [x] DONE — Speed indicator in footer card (2026-04-03)
- [x] DONE — Footer card metric dividers (2026-04-03)
- [x] DONE — Hazard zone size reduced 50% (2026-04-03)
- [x] DONE — Hazard alert radius reduced 30% (2026-04-03)
- [ ] NOT STARTED — Turn-by-turn voice guidance improvements
- [ ] NOT STARTED — Reroute through waypoints (multi-stop reroute)

## Community
- [x] DONE — Like/love counter optimistic update fix (2026-04-03)
- [x] DONE — Username displayed in feed (2026-04-03)
- [ ] NOT STARTED — Follow/unfollow users
- [ ] NOT STARTED — User profile page (view other user's trips)

## Profile
- [x] DONE — Username field (set/edit) (2026-04-03)
- [x] DONE — Guardian tier section (2026-04-03)
- [ ] NOT STARTED — Profile photo upload
- [ ] NOT STARTED — Export ride data (GPX/CSV)

## History
- [x] DONE — Inline streak, guardian tier, daily quiz (2026-04-03)
- [x] DONE — EUR saved + hazards in stats cards (2026-04-03)
- [ ] NOT STARTED — Trip comparison (compare two rides on same route)

## Technical Debt
- [ ] NOT STARTED — Install @testing-library/react for hook tests (tests written but can't run)
- [ ] NOT STARTED — Deduplicate qualifyStreakAsync helper (v1.ts and feed.ts have copies)
- [ ] NOT STARTED — Add `source` field to hazard reporting API (distinguish in-ride vs manual vs armchair)
- [ ] NOT STARTED — Social digest notification subquery needs manual DB validation
- [!] BLOCKED — iPhone validation (no macOS hardware available)
- [ ] NOT STARTED — Redis-backed production caching/rate-limiting
- [ ] NOT STARTED — Merge feature/habitengine branch to main
