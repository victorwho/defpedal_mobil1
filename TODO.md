# Defensive Pedal — Backlog

Two lists: **todo** (new features / enhancements) and **issuestofix** (bugs, blockers, dependency-bound work). Tick items as `[x]` when done; move long-completed entries to `## Completed`.

## todo

- [ ] **Real Google Play link on /r/&lt;code&gt; viewer** — `ShareCtas.tsx` currently points at the canonical package ID `com.defensivepedal.mobile` as a placeholder. Before production launch, replace with the live Play Store listing URL and verify the `referrer=share=<code>` param survives the store redirect into the installed app (`installReferrer.ts` parser reads `share` key). File: `apps/web/components/ShareCtas.tsx:19`.
- [ ] **Anonymous → real account upgrade** — `apps/mobile/src/lib/supabase.ts` `signUpWithEmail` (L167) and `signInWithGoogle` (L242) currently call `auth.signUp()` / `auth.signInWithOAuth()` for everyone, which orphans an anonymous user's data on signup (early trips, hazards, votes, XP, badges, streak, Mia journey state). Branch on `is_anonymous` and call `supabaseClient.auth.updateUser({ email, password })` / `supabaseClient.auth.linkIdentity({ provider: 'google' })` for anon sessions — both preserve `auth.users.id` so `UserCacheResetBridge` keeps the same id and TanStack/Zustand state survives the upgrade. Keep the current calls as fallback for fully-signed-out users. (`changestoimplement.md:106`)
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
- [ ] **Email confirmation: Android App Links + iOS Universal Links** — partial:
  - **Android side (mostly done, one Play Store fingerprint TBD):** `assetlinks.json` updated 2026-04-28 to scope correctly per package: production = upload keystore only, preview = upload + debug (gradle-properties-conditional signing), dev = debug only. Open follow-up: when Play App Signing enrolment completes, Google generates a re-signing fingerprint that must also be appended to the production entry's `sha256_cert_fingerprints`. Without it, App Links will verify against AABs we sign locally but not against the APK Play actually delivers to users. Find it in Play Console → Release → Setup → App signing.
  - **iOS side:** `apple-app-site-association` carries `FILL_ME_TEAM_ID.com.defensivepedal.mobile` etc. — needs real Apple Developer Team ID before iOS Universal Links can activate. Blocked on the same Apple Developer seat as the broader iPhone validation work.
  - Net effect: today's flow still bounces through the HTTPS edge function (`intent://` on Android, custom-scheme on iOS). Once Play re-signing fingerprint + iOS Team ID are in place, the link opens the app directly with no browser flash. (`changelog.md` 2026-04-20 known followups)

## Completed

- [x] **Improved Hazard System** — Upvote/downvote voting, auto-expiry by hazard type, marker clustering, dedicated rate limiting. Shipped session 28 (2026-04-21), Cloud Run revision `defpedal-api-00063-gjg`. Plan doc `docs/plans/improved-hazard-system.md`, user guide `docs/hazardinfo.md`.
- [x] **CO2 Savings Calculator** — Track environmental impact per trip (distance-based CO2 saved vs driving).
- [x] **Push Notifications** — EAS project wired (`f8bcd740...`), server-side send via Expo API (`services/mobile-api/src/lib/push.ts`), per-user prefs + quiet hours + daily budget.
- [x] **Offline Maps** — Mapbox pack download with progress, 200 MB cap, 5-day expiry (`apps/mobile/app/offline-maps.tsx` + `src/lib/offlinePacks.ts`).
- [x] **Trip Statistics Dashboard** — Weekly/monthly stats, streaks, CO2, mode split (RPC `get_trip_stats_dashboard`, `GET /v1/stats/dashboard`, `StatsDashboard.tsx` in History tab).
