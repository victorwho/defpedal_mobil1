# Changes to Implement

## Habit Engine — Remaining Work

### Phase 5: Notifications
- [x] DONE — Push notification delivery (EAS project configured, token registration on sign-in, server dispatch) (2026-04-04)
- [x] DONE — Quiet hours enforcement in notification triggers (PATCH /profile extended with notification prefs, profile.tsx syncs toggles + device timezone to backend, server dispatchNotification reads from DB) (2026-04-09)
- [x] DONE — Push notification registration on sign-in (permission prompt + token sent to server) (2026-04-04)

### Phase 7: Endgame (Deferred)
- [x] DONE — Mia persona progressive journey (5 levels with safety floor constraints, 3-layer detection, celebrations, share cards, journey tracker, 6 notification templates, badge #144, "Skip ahead" opt-out). Cloud Run revision defpedal-api-00050-n2k. Cloud Scheduler: mia-detection-cron + mia-notification-cron. 83 new tests. (2026-04-15)
- [ ] NOT STARTED — Neighborhood safety challenge (invite 3 cyclists)
- [ ] NOT STARTED — Safety Wrapped (Spotify-style annual/monthly summary) — schedule for December
- [x] DONE — Neighborhood safety leaderboard (PRD #4: CO2+hazards ranking, 15km radius, weekly/monthly/all-time, settlement cron, champion crown, 6 badges, Cloud Scheduler) (2026-04-14)
- [ ] NOT STARTED — Safety Guide mentorship system (100+ rides)
- [ ] NOT STARTED — City Safety Report (auto-generated monthly)
- [x] DONE — Microlives Phase 0-3: calculation engine, DB schema, server integration, post-ride UI, TimeBankWidget, history + dashboard (2026-04-04)
- [ ] NOT STARTED — Microlives Phase 5: Anti-cheat (GPS kinematic validation)
- [x] DONE — Microlives Phase 7: City Heartbeat community dashboard (2026-04-08)
- [ ] NOT STARTED — Unlockable feature tiers (Night Ride at 5, Weather Safety at 15, Analytics at 30)
- [ ] NOT STARTED — Tomorrow's route safety preview (needs saved commute routes)
- [ ] NOT STARTED — "Convince a non-cyclist" sharing flow (needs web page for routes)
- [x] DONE — Personal safety map overlay (ride history as colored lines, FAB toggle, safe=green/fast=blue) (2026-04-04)
- [x] DONE — Hazard alert sharing (share button on hazard toast, native share sheet with location) (2026-04-04)

## Offline Navigation (GitHub Issue #6)
- [x] DONE — Connectivity detection: ConnectivityMonitor provider with debounced NetInfo, lazy NativeModules.RNCNetInfo guard, "Back online" toast (2026-04-16)
- [x] DONE — App restart recovery: OfflineRouteCache (MMKV), NavigationResumeGuard (auto-resume <15min, prompt >=15min, discard inconsistent state) (2026-04-16)
- [x] DONE — Offline feature gating: reroute suppressed with banner, hazards disabled, weather hidden, ManeuverCard wifi-off indicator (2026-04-16)
- [x] DONE — Download for offline: route-preview button with progress states (idle/downloading/complete/error) using existing Mapbox offline packs (2026-04-16)
- [x] DONE — Offline pack cleanup: auto-delete >5 days, 200MB LRU eviction on app launch (2026-04-16)
- [x] DONE — OfflineMutationSyncManager: skip flush when offline, immediate flush on reconnect (2026-04-16)
- [x] DONE — Route planning offline mode: disabled search, OfflineBanner, resume cached route card (2026-04-16)
- [x] DONE — Offline maps storage display: used/200MB progress bar, pack ages, cleanup policy text (2026-04-16)
- [x] DONE — 26 unit tests across 4 test files (OfflineRouteCache, OfflinePackCleanup, NavigationResumeGuard, ConnectivityMonitor) (2026-04-16)
- [!] PENDING — Dev APK rebuild needed to activate real NetInfo (currently falls back to isOnline: true)

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
- [x] DONE — Long-press on map to set destination (drop pin on route planning screen) (2026-04-06)

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
- [x] DONE — Save route modal KeyboardAvoidingView (keyboard no longer covers text input on Android) (2026-04-08)

## Internationalization
- [x] DONE — Romanian language: i18n framework + en/ro translation files + language picker in profile (2026-04-04)

## Technical Debt
- [x] DONE — Install @testing-library/react for hook tests (installed in session 10, 2026-04-08)
- [x] DONE — Deduplicate qualifyStreakAsync helper (extracted to lib/streaks.ts) (2026-04-04)
- [x] DONE — Add `source` field to hazard reporting API (in_ride/manual/armchair) (2026-04-04)
- [x] DONE — Social digest notification subquery DB validation: all column names, FKs, and timestamp types verified against migrations (hazards, hazard_validations, trip_shares, feed_likes, notification_log) — no mismatches (2026-04-09)
- [x] DONE — Notification budget: 1-per-24h rolling limit in dispatchNotification, streak reminders bypass as high priority, social digest merged into weekly impact summary, daily social cron retired (2026-04-09)
- [!] BLOCKED — iPhone validation (no macOS hardware available)
- [x] DONE — Redis-backed production caching/rate-limiting: code complete (redisStore.ts with atomic INCR rate limiter + JSON cache, auto-selected via REDIS_URL env var). Activation is deployment-only: provision GCP Memorystore + set REDIS_URL on Cloud Run (2026-04-09)
- [x] DONE — Merge feature/habitengine branch to main (2026-04-03)
