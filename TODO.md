# Defensive Pedal — Feature Backlog

## Next Up

- [x] **CO2 Savings Calculator** — Track environmental impact per trip (distance-based CO2 saved vs driving)
- [ ] **Push Notifications** — EAS project setup + server-side push via Expo
- [ ] **Offline Maps** — Download Mapbox map packs for offline use
- [ ] **Trip Statistics Dashboard** — Weekly/monthly riding stats, streaks, totals
- [ ] **Improved Hazard System** — Upvote/downvote, auto-expiry, marker clustering
- [ ] **Real Google Play link on /r/&lt;code&gt; viewer** — `ShareCtas.tsx` currently points at the canonical package ID `com.defensivepedal.mobile` as a placeholder. Before production launch, replace with the live Play Store listing URL and verify the `referrer=share=<code>` param survives the store redirect into the installed app (`installReferrer.ts` parser reads `share` key). File: `apps/web/components/ShareCtas.tsx:19`.

## Completed

_(Move features here after merge to main)_
