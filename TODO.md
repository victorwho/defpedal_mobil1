# Defensive Pedal — Backlog

Two lists: **todo** (new features / enhancements) and **issuestofix** (bugs, blockers, dependency-bound work). Tick items as `[x]` when done; move long-completed entries to `## Completed`.

## todo

- [ ] **Improved Hazard System** — Upvote/downvote, auto-expiry, marker clustering.
- [ ] **Real Google Play link on /r/&lt;code&gt; viewer** — `ShareCtas.tsx` currently points at the canonical package ID `com.defensivepedal.mobile` as a placeholder. Before production launch, replace with the live Play Store listing URL and verify the `referrer=share=<code>` param survives the store redirect into the installed app (`installReferrer.ts` parser reads `share` key). File: `apps/web/components/ShareCtas.tsx:19`.
- [ ] **Phase 7 endgame — Neighborhood safety challenge** — Invite 3 cyclists to form a safety challenge group. (`changestoimplement.md:12`, deferred)
- [ ] **Phase 7 endgame — Safety Wrapped** — Spotify-style annual / monthly summary. (`changestoimplement.md:13`, target Dec)
- [ ] **Phase 7 endgame — Safety Guide mentorship** — Unlocks for users with 100+ rides. (`changestoimplement.md:15`)
- [ ] **Phase 7 endgame — City Safety Report** — Auto-generated monthly safety report. (`changestoimplement.md:16`)
- [ ] **Microlives Phase 5** — Anti-cheat GPS kinematic validation. (`changestoimplement.md:18`)
- [ ] **Unlockable feature tiers** — Night Ride at 5 rides, Weather Safety at 15, Analytics at 30. (`changestoimplement.md:20`)

## issuestofix

- [ ] **P1-21 phase 3 — TalkBack device QA** — Code shipped 2026-04-20: `useMapA11ySummary` hook + `ScreenReaderMapSummary` component + `a11yContext` prop across all 11 `RouteMap` callsites. EN + RO i18n, 16 passing unit tests, typecheck + bundle check green. Only remaining step: physical-device TalkBack pass confirming FeedCard decorative mode, navigation live-region announcements, and no focus-trap regressions. Mark `issuefix.md` P1-21 fully done once QA signs off.
- [ ] **GCP monitoring / alerting not configured** — No alerts for Cloud Run errors, latency spikes, OSRM downtime, or DB issues. P3-4 / `securityfix.md`. Blocks observability for production traffic.
- [ ] **Redis activation** — `services/mobile-api/src/lib/redisStore.ts` is feature-complete but unused; needs GCP Memorystore provisioned and `REDIS_URL` set on Cloud Run. Without it, rate-limit and idempotency state are per-instance and lost on revision rollover.
- [ ] **iPhone validation** — App has never been built or tested on iOS hardware. Blocked on macOS / Apple Developer seat. Several iOS-only code paths (Universal Links, ASWebAuthenticationSession callback) are unverified.
- [ ] **Email confirmation: Android App Links + iOS Universal Links** — Today's flow uses an HTTPS edge function that bounces to `intent://` (Android) or `defensivepedal-dev://` (iOS), causing a brief browser flash. Hosting `.well-known/assetlinks.json` + `apple-app-site-association` and registering verified domains would let the link open the app directly with no browser intermediate. (`changelog.md` 2026-04-20 known followups)

## Completed

- [x] **CO2 Savings Calculator** — Track environmental impact per trip (distance-based CO2 saved vs driving).
- [x] **Push Notifications** — EAS project wired (`f8bcd740...`), server-side send via Expo API (`services/mobile-api/src/lib/push.ts`), per-user prefs + quiet hours + daily budget.
- [x] **Offline Maps** — Mapbox pack download with progress, 200 MB cap, 5-day expiry (`apps/mobile/app/offline-maps.tsx` + `src/lib/offlinePacks.ts`).
- [x] **Trip Statistics Dashboard** — Weekly/monthly stats, streaks, CO2, mode split (RPC `get_trip_stats_dashboard`, `GET /v1/stats/dashboard`, `StatsDashboard.tsx` in History tab).
