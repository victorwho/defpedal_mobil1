# Defensive Pedal — Feature Backlog

## Next Up

- [x] **CO2 Savings Calculator** — Track environmental impact per trip (distance-based CO2 saved vs driving)
- [x] **Push Notifications** — EAS project wired (`f8bcd740...`), server-side send via Expo API (`services/mobile-api/src/lib/push.ts`), per-user prefs + quiet hours + daily budget
- [x] **Offline Maps** — Mapbox pack download with progress, 200 MB cap, 5-day expiry (`apps/mobile/app/offline-maps.tsx` + `src/lib/offlinePacks.ts`)
- [x] **Trip Statistics Dashboard** — Weekly/monthly stats, streaks, CO2, mode split (RPC `get_trip_stats_dashboard`, `GET /v1/stats/dashboard`, `StatsDashboard.tsx` in History tab)
- [ ] **Improved Hazard System** — Upvote/downvote, auto-expiry, marker clustering
- [ ] **Real Google Play link on /r/&lt;code&gt; viewer** — `ShareCtas.tsx` currently points at the canonical package ID `com.defensivepedal.mobile` as a placeholder. Before production launch, replace with the live Play Store listing URL and verify the `referrer=share=<code>` param survives the store redirect into the installed app (`installReferrer.ts` parser reads `share` key). File: `apps/web/components/ShareCtas.tsx:19`.

## Completed

_(Move features here after merge to main)_
