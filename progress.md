# Implementation Progress

Last updated: 2026-04-27 (session 32)

This file tracks the mobile app implementation progress against `mobile_implementation_plan.md`.
Update it at the end of each implementation slice.

## Snapshot

- Overall progress: roughly 95-97 percent of product migration, 94-96 percent of production hardening
- Session 33 (2026-04-27): **Real-account cold start lands on a clean planning screen.** Persisted `appState=ROUTE_PREVIEW` (or `AWAITING_FEEDBACK`) was reviving a prior route on next launch — Zustand's `persist` slice rehydrated `routePreview` and `index.tsx` redirected to `/route-preview`. Updated `apps/mobile/app/index.tsx` so signed-in users with a real account fall through to `/route-planning` with no destination on cold start: a one-shot `useEffect` calls `resetFlow()` (clears `routePreview`, `selectedRouteId`, `routeRequest`, sets `appState=IDLE`, prunes orphaned `tripServerIds`) when `gate.hasRealAccount && (appState === 'ROUTE_PREVIEW' || appState === 'AWAITING_FEEDBACK')`, and the render path suppresses the matching `<Redirect>` branches the same render to avoid a one-frame flash. Anonymous sessions are intentionally untouched — their open count drives the signup gate, and resuming a half-built route is part of the conversion nudge. `NAVIGATING` is also untouched — `NavigationResumeGuard` owns active-ride recovery (auto-resume <15min, prompt >=15min). Mobile typecheck + bundle check green.
- Session 33 (2026-04-27): **Hide anonymous users from leaderboards.** Anonymous (pre-signup) sessions could appear in the City Heartbeat "Top Contributors" list and the Neighborhood Safety Leaderboard with empty `display_name` (handle_new_user trigger seeded `auto_share_rides = true` for everyone). Migration `202604280003_exclude_anon_from_leaderboards.sql` denormalises `auth.users.is_anonymous` onto `profiles.is_anonymous` (NOT NULL DEFAULT false; backfilled — verified 0 mismatches across 41 rows), updates `handle_new_user` to populate it on insert, and adds an `AFTER UPDATE OF is_anonymous` trigger on `auth.users` that flips the profile flag when an anon session upgrades to OAuth/email. RPCs `get_city_heartbeat.topContributors` and `get_neighborhood_leaderboard` (both UNION branches) gain `AND p.is_anonymous = false`. The `today` / `daily` / `totals` blocks of city_heartbeat and `get_community_stats` are intentionally untouched, so anon trips still count in community-wide aggregates. Smoke test: same Bucharest radius returned `totals.rides = 11` (anon trips counted) but `topContributors.length = 0` (anon hidden). Migration only — no API code change required.
- Session 33 (2026-04-27): **Trip-record idempotency.** Diagnosed why History showed the same trip multiple times: server had zero idempotency on `POST /trips/start` and `POST /trips/track`, so any client retry (10s `MUTATION_SYNC_TIMEOUT_MS` shorter than slow-uplink commit time, app-killed-mid-sync `recoverSyncingMutations`, dropped response packet, `useAppKilledRecovery` re-enqueue) would create a second `trip_tracks` row — and `getTripHistory` reads from `trip_tracks`. Fix is server-side because the network is unreliable. Migration `202604270002_trip_idempotency.sql` deduped existing `trip_tracks` (kept the row with the longest `gps_trail` per `trip_id`, tie-break `created_at` DESC), added `UNIQUE(trip_id)` on `trip_tracks`, added `trips.client_trip_id` + partial `UNIQUE(user_id, client_trip_id) WHERE client_trip_id IS NOT NULL` (legacy NULL rows allowed). `submissions.ts`: `startTripRecord` now upserts on `(user_id, client_trip_id)` so retries return the existing trip's id; `saveTripTrack` upserts on `trip_id` so retries overwrite the latest GPS trail rather than insert a duplicate. Migration applied via Supabase MCP (140 trip_tracks, 0 dupes remaining; 259 trips). Cloud Run revision `defpedal-api-00069-p7t` serving 100% traffic, `/health` 200. Mobile-side recovery paths (`useAppKilledRecovery`, stale-closure in `queueTripEnd`) are now safe by construction — no client changes needed.
- Current milestone: **Soft-launch repo readiness reached.** All in-repo compliance work is done. Items 9 (Data Safety paste-ready), 12 (a11y in-repo + RO listing copy + screenshot script + IARC answers), 13 (mailer + deploy script), 14 (signup waiver + DPIA draft) shipped this session via PRs #25–#33. The remaining items are now external-dependency-only: item 3 (counsel for full Privacy Policy + ToS), item 6-long (~$5–20/mo TLS infra for OSRM), item 14 (counsel for ANSPDCP filing decision), and the manual Play Console paste / screenshot capture / closed-test AAB upload path.
- Session 32 (2026-04-27, continued from session 31): **9 PRs shipped — closes the soft-launch path.** Branched off latest main, each in its own short-lived worktree under `.claude/worktrees/`. Repo-side compliance work for items 9, 12, 13, 14, plus the moderation surface coverage gap from item 7, plus a one-command deploy script.
  - **PR #25 — Item 14 signup footer + Terms/Privacy placeholder pages.** Replaced the originally-planned OUG 34/2014 checkbox with an industry-standard small "By continuing you agree to our Terms of Service and Privacy Policy" footer below the auth UI on `signup-prompt.tsx` + `auth.tsx` (form mode only). New `apps/mobile/src/lib/legal-urls.ts` constants. Two new web pages on `apps/web`: `/terms` (carries the operative immediate-performance + 14-day-waiver clause under EU Directive 2011/83/EU Art. 9 + 16(m) and OUG 34/2014 — applies in advance to any future paid features) and `/privacy` (placeholder, EU + ANSPDCP referenced, retention table matching item 13's actual policy). Both pages indexable so Play / regulators can find them. EN + RO i18n.
  - **PR #26 — Account-deletion web fallback + Data Safety paste-ready doc.** New `apps/web/app/account-deletion/page.tsx` at `routes.defensivepedal.com/account-deletion`: in-app primary path (5 numbered steps), email fallback at `privacy@defensivepedal.com`, data inventory split (deleted-immediately vs retained-and-why with 12-month server-log retention disclosed), GDPR rights summary, ANSPDCP escalation reference. New `docs/playdatainstructions.md`: paste-ready Privacy practices Q&A + full data-types grid + retention strings + explicit NOT-checked list (financial / advertising ID / health / etc.) + encryption-in-transit caveat + pre-submission verification checklist for compliance plan **item 9**.
  - **PR #27 — Item 12 a11y pass on session-31 compliance screens.** Critical fix: `Toggle` atom got a new `accessible` prop (default `true`); `SettingRow` molecule passes `accessible={false}` so screen readers no longer announce two switches per row (the wrapping Pressable already exposes the switch role). `blocked-users.tsx` unblock button got `hitSlop={top/bottom: 10, left/right: 4}` to lift effective touch target from ~30dp to ~50dp (Android 48dp min). Decorative-icon hiding (`importantForAccessibility="no"` + `accessibilityElementsHidden`) on `delete-account.tsx`, `blocked-users.tsx`, `onboarding/consent.tsx`, `privacy-analytics.tsx`. Header semantics on title text. `accessibilityHint` + new `deleteAccount.confirmHint` i18n key on the type-DELETE input. `accessibilityLiveRegion="polite"` on the blocked-users loading + error states. Plus the deferred cross-link from PR #26 review: `apps/web/app/privacy/page.tsx` now links to `/account-deletion` from the GDPR rights section.
  - **PR #28 — EN + RO Play Store listing copy.** Defensive Pedal launches Romania-first so `ro-RO` is the **default** listing language, `en-US` the translation. Six text files in `apps/mobile/store-listing/{en-US,ro-RO}/{title,short_description,full_description}.txt`. All within Play Console limits — counts in graphemes (NOT bytes; `wc -c` over-counts diacritics ț/ș/ă): EN title 27/30, EN short 71/80, EN full ~2400/4000, RO title 28/30, RO short 76/80, RO full ~2900/4000. README documents upload procedure, the grapheme counter, editorial guidelines (no competitor names per Play 2.10, no health claims).
  - **PR #29 — Screenshot capture script + IARC questionnaire answer sheet.** `scripts/capture-screenshots.sh` is a guided shutter — `adb`-pre-flight + locale check + 5 target screens (planning → preview → navigation → impact → community) with a metadata sidecar (device model, resolution, density, app version, capture timestamp). User navigates to each screen on the phone, presses Enter, the script captures via `adb exec-out screencap -p`. `docs/iarc-questionnaire-answers.md` maps every IARC category (violence, sexuality, language, substances, gambling, UGC, personal info, location, communication, digital purchases, advertising, children, health) to the answer + source-of-truth in the codebase. Predicted final rating: **PEGI 12 / ESRB 10+ / IARC 7+** (driven by UGC + location-with-other-users; not by any restricted content).
  - **PR #30 — DPIA draft.** `docs/legal/dpia.md` (476 lines) following CNIL / EDPB DPIA template. Three EDPB DPIA criteria triggered (tracking & monitoring + innovative tech + data shared between data subjects). 9 risks identified (R1 GPS re-identification, R2 stalking via UGC, R3 UGC harassment, R4 account takeover, R5 plaintext OSRM until item 6-long ships, R6 default-ON analytics — flagged for counsel, R7 Supabase US region, R8 server access logs, R9 push token leakage). After mitigations, **no residual High risks** → Art. 36(1) prior consultation with ANSPDCP not required. Sign-off block left blank for the final filed version. Status DRAFT — pending Romanian legal counsel review.
  - **PR #31 — Inactive-warning Resend mailer (item 13 mailer TODO closed).** Closes the deferred TODO from session 31's retention runbook. New `supabase/migrations/202604280002_inactive_warning_email_audit.sql` adds `profiles.inactive_warning_email_sent_at TIMESTAMPTZ` for delivery idempotency + partial index for the queue lookup; updated `clear_inactive_warning(target_user_id)` to clear both timestamps. New `supabase/functions/inactive-warning/` Edge Function (Deno + JSR Supabase JS): reads queue (LIMIT 50), POSTs each row to Resend REST API, marks delivered. Bearer `${CRON_SECRET}` auth (same as the other retention crons). Locale-aware EN/RO templates picked from `profiles.locale`, deletion date rendered in user's locale + Bucharest timezone. Idempotent. Updated `services/mobile-api/src/routes/retention.ts` to drop the `mailer TODO` log line (event renamed to `retention_inactive_flagged`, no longer leaks email addresses through API logs).
  - **PR #32 — One-command deploy script for the mailer.** `scripts/deploy-inactive-warning.sh` wraps the manual deploy steps from #31: pre-flight (CLIs + env vars), `supabase db push` (or `SKIP_MIGRATION=1`), `supabase functions deploy`, secrets set, Cloud Scheduler upsert (describe → update or create), smoke test. Distinguishes 200 / 401 / 5xx / timeout in smoke-test feedback. Idempotent end-to-end — re-run after Resend key rotation by setting the new env var. README updated to lead with the script + manual fallback section.
  - **PR #33 — Item 7 moderation surface parity.** Closes the two deferred moderation TODOs from session 31. `community-trip.tsx`: long-press on a comment row → Alert with Report comment / Block user / Cancel (suppressed for own comments via `currentUserId` from `useAuthSessionOptional`). Block flow uses `useBlockUser` mutation with optimistic per-screen Set hide. Report flow opens `ReportSheet` with `targetType='comment'`. `HazardDetailSheet`: new 3-dot overflow Pressable in the header → Alert with Report hazard / Cancel; on report success the detail sheet auto-dismisses. No "Block user" for hazards because `NearbyHazard` doesn't expose reporter identity client-side. All i18n keys reused from session 31's `feedCard.*` namespace — no new translation strings needed.
  - **What's still required after this session (all external-dependency or out-of-repo):**
    1. Run the deploy script with secrets to actually start the mailer cron: `CRON_SECRET=… RESEND_API_KEY=… ./scripts/deploy-inactive-warning.sh`
    2. Apply migration `202604280002_inactive_warning_email_audit.sql` via Supabase MCP (the script can also do it via `supabase db push`, but MCP is preferred per project rules)
    3. Paste the Data Safety form into Play Console using `docs/playdatainstructions.md`
    4. Paste listing strings using `apps/mobile/store-listing/{en-US,ro-RO}/`
    5. Run `./scripts/capture-screenshots.sh ro-RO` then `… en-US` to capture phone screenshots
    6. Design the 1024×500 feature graphic from the brand kit
    7. Fill IARC questionnaire in Play Console using `docs/iarc-questionnaire-answers.md`
    8. Upload a release AAB to a closed test track → triggers Play's pre-launch a11y + crash report
    9. Items 3 + 14 final: hand `docs/legal/dpia.md` + the ToS/Privacy placeholders to Romanian legal counsel for review + counsel-decided ANSPDCP precautionary filing
    10. Item 6 long-term: GCP HTTPS LB or Caddy + Let's Encrypt for OSRM (~$5–20/mo)
  - **New helper script also shipped this session:** `scripts/cleanup-worktrees.sh` — handles the long-standing Windows long-path issue when removing `.claude/worktrees/*` dirs (junctioned `node_modules` blow past the 260-char limit). Strategy: delete junctions first via `cmd //c rmdir` (does NOT recurse into target), then `rm -rf` the now-short-path remainder. Safe to re-run; supports `--all` / `--dry-run` modes.
  - **Typecheck + push:** Pre-push hook ran typecheck on every PR → all green. Pushed each branch to origin and merged via GitHub merge commits (preserves PR boundaries vs squashing).

- Session 31 (2026-04-27): **Play Store compliance plan — 8 items shipped (1, 4, 5, 6-short, 7, 8, 10, 11, 13).** Worked on a worktree branch (`worktree-agent-af7d4d895e8360e81`), merged to main as `1bbf67c`.
  - **Item 1 — Account deletion:** `DELETE /v1/profile` with `requireFullUser` + `{confirmation: 'DELETE'}` body, calls `supabaseAdmin.auth.admin.deleteUser` which cascades through every FK in migration `202604200001_cascade_user_fks.sql`. New `apps/mobile/app/delete-account.tsx` screen with type-DELETE confirmation, `useHaptics().warning()` on submit, post-delete `signOut` + redirect to `/auth`. New SettingRow in profile Account section. EN + RO i18n. Anonymous users see a friendly "no account to delete" notice.
  - **Item 4 — Foreground service type:** Added `FOREGROUND_SERVICE_LOCATION` to `app.config.ts` permissions. New `plugins/withAndroidForegroundServiceLocation.js` regression-guard plugin asserts `android:foregroundServiceType="location"` on `expo.modules.location.services.LocationTaskService` (expo-location autolinker already does this on SDK 55, but the plugin survives future regressions).
  - **Item 5 — Release signing fail-fast:** `apps/mobile/android/app/build.gradle` now throws `GradleException` with a clear message when preview/production release tasks run without `DEFPEDAL_UPLOAD_STORE_FILE`. Debug-keystore fallback allowed only for `developmentRelease`. Closes the silent-fallback footgun that was flagged in the keystore memory.
  - **Item 6 (short-term) — Network security config:** New `plugins/withAndroidNetworkSecurityConfig.js` replaces the app-wide `usesCleartextTraffic=true` with a per-domain XML allowing cleartext only for `34.116.139.172` (OSRM IP). Old `withAndroidCleartextTraffic.js` plugin deleted. `build-preview.sh` patches `$DST/apps/mobile/android` manifest at sync time so `C:\dpb` builds get the same XML. Long-term TLS in front of OSRM still pending (item 6 long-term).
  - **Item 7 — UGC moderation (full):** Migration `202604270001_ugc_moderation.sql` adds `content_reports` + `user_blocks` tables, `is_hidden` columns on `feed_comments`/`hazards`/`trip_shares`, RLS rewritten to filter blocked users + hidden rows. New `services/mobile-api/src/routes/moderation.ts`: `POST /v1/reports`, `POST/DELETE /v1/users/:id/block`, `GET /v1/users/blocked`, `POST /v1/moderation/auto-filter-sweep` (cron). Three new rate-limit buckets (`report` 5/10min, `block` 20/h, `comment` 3/15min). `POST /v1/feed/:id/comments` tightened from `requireUser` → `requireFullUser` (anonymous rejected 403). Inline auto-filter pipeline: `commentSanitize.ts` (URL detection) + `moderationFilter.ts` (RO + EN slur/threat/doxx wordlist). New `ReportSheet` molecule (composes Modal + useHaptics) with seven-reason picker. `ActivityFeedCard` long-press → action sheet (Report/Block/Cancel), suppressed for own posts via `currentUserId` from `useAuthSession`. Optimistic 1-line "Hidden" collapse on report/block. New `app/blocked-users.tsx` screen, Profile entry. Full EN + RO copy. Ops runbook at `docs/ops/moderation-runbook.md` with DSA Art. 16 SLAs, OOO procedure, escalation chain, gcloud commands.
  - **Item 8 — Pre-collection consent + Sentry:** Refactored `apps/mobile/src/lib/telemetry.ts` so `Sentry.init` and the PostHog client are gated by user consent. `appStore.analyticsConsent` slice added, device-scoped (excluded from `resetUserScopedState`). New `app/onboarding/consent.tsx` screen between location and safety-score; both `crashReports` and `productAnalytics` toggles default ON for first-time onboarding (returning users keep prior choice). New `app/privacy-analytics.tsx` post-onboarding screen reachable from Profile. Sentry SDK fully wired: `Sentry.wrap(RootLayout)` in `_layout.tsx`, `@sentry/react-native/expo` plugin conditionally registered when `SENTRY_ORG`+`SENTRY_PROJECT` env vars are set, EAS secret `SENTRY_AUTH_TOKEN` registered for source-map upload. Default-ON deviation from source plan §7 documented in plan doc with per-channel legal posture (Sentry stronger via GDPR Art. 6(1)(f), PostHog weaker — counsel review flagged).
  - **Item 10 — AAB by default:** `npm run build:production` now invokes `prod bundle` (AAB) by default; new `build:production:apk` for explicit APK fallback. `build-preview.sh` defaults `DO_BUNDLE=true; DO_APK=false` for production when no explicit artifact arg. `eas.json` production profile sets `android.buildType="app-bundle"` explicitly. `check-mobile-release.mjs` CI guard fails if production drifts from `app-bundle`. Workflow guardrails in `mobile_release_runbook.md` updated.
  - **Item 11 — Dev artefact audit:** `gradle.properties` `EX_DEV_CLIENT_NETWORK_INSPECTOR=false`. New `scripts/audit-release-artifacts.sh` scans built AAB/APK for forbidden tokens (`devAuthBypass`, `dev-bypass`, `EX_DEV_CLIENT_NETWORK_INSPECTOR=true`, `android:debuggable=true`) and fails on any leak. Wired into `build-preview.sh` step 4b for preview/production builds.
  - **Item 13 — GDPR retention pipeline:** Migration `202604280001_retention_policies.sql` adds `profiles.keep_full_gps_history` + `profiles.inactive_warning_sent_at` columns and four SECURITY DEFINER RPCs (`truncate_old_gps_trails`, `flag_inactive_users`, `select_purgeable_inactive_users`, `clear_inactive_warning`). New `services/mobile-api/src/routes/retention.ts`: three cron-protected endpoints (`POST /v1/retention/truncate-gps` daily, `/flag-inactive` weekly Mon, `/purge-inactive` weekly Mon — all Bearer `CRON_SECRET`). Sequential delete loop in `purge-inactive` avoids Supabase auth admin rate-limits. `ProfileResponse` + `ProfileUpdateRequest` extended with `keepFullGpsHistory`. New SettingRow in Profile → Account. Ops runbook at `docs/ops/retention-runbook.md` with retention table for privacy policy, gcloud commands, SQL dry-run procedures, audit-trail log queries, and mailer TODO (Resend via Supabase Edge Function recommended).
  - **Production deploy:** Both migrations applied via Supabase MCP. Cloud Build → Cloud Run revision `defpedal-api-00068-blq` serving 100 percent traffic. Smoke-tested both new cron endpoints (200 with proper JSON shape). Four Cloud Scheduler jobs ENABLED in `europe-central2`: `moderation-auto-filter-sweep-cron` (*/15), `retention-gps-truncate-cron` (3am daily), `retention-flag-inactive-cron` (Mon 5am), `retention-purge-inactive-cron` (Mon 6am).
  - **Behaviour change worth noting:** `POST /v1/feed/:id/comments` now requires a full (Google-OAuth) account. Anonymous testers will get 403 when commenting until they sign in. Intentional per source plan §7.
  - **Sentry deployed:** Project `defensive-pedal/defensive-pedal-mobile` (EU residency `de.sentry.io`). DSN + org/project slugs in `apps/mobile/.env`. `SENTRY_AUTH_TOKEN` registered as EAS secret for source-map upload on release builds. Release-build symbolication will work once a fresh AAB is built post-merge.
  - **Two new design tokens used:** `useHaptics` + `Modal` organism + `BottomSheet` organism (all from PR #24's design pass, picked up by ReportSheet + delete-account confirm + onboarding consent screen).
  - **Plan doc + runbooks:** `docs/plans/compliance-implementation-plan.md` (590 lines, audit + per-item status), `docs/ops/moderation-runbook.md`, `docs/ops/retention-runbook.md`, `docs/ops/sentry-setup.md`. All on main as of `1bbf67c`.
  - **Worktree cleanup:** Branch `worktree-agent-af7d4d895e8360e81` deleted, worktree dir at `.claude/worktrees/agent-af7d4d895e8360e81/` partial-deleted (some files still locked by another process — manual cleanup if needed).
  - **Typecheck + push:** Pre-push hook ran typecheck → green. Pushed to `origin/main`.

- Session 30 (2026-04-25): **Play Store compliance — strip AD_ID permission + v0.2.21 production AAB.** Removed `com.google.android.gms.permission.AD_ID` from the shipped manifest so the Play Store Data Safety form can declare "no advertising ID use". The permission was being injected transitively by `play-services-measurement-api` (Firebase Messaging dependency). Two-layer fix: (1) `app.config.ts` `android.blockedPermissions` for the durable source-of-truth — applied on next `expo prebuild`, (2) explicit `<uses-permission ... tools:node="remove"/>` directive in `apps/mobile/android/app/src/main/AndroidManifest.xml` for the current build, since the build pipeline does not run prebuild. Verified via `manifest-merger-preview-release-report.txt` that 4 library contributions are REJECTED. `ACCESS_ADSERVICES_AD_ID` intentionally kept (Firebase IID token, not Play Store advertising-id signal). versionCode 22→23, versionName 0.2.20→0.2.21. AAB built via `npm run bundle:production` (103 MB), upload-signing cert verified (`CN=Victor Rotariu, OU=Defensive Pedal`, NOT debug). Output: `apkreleases/DefensivePedal-Production-v0.2.21.aab`. Bonus: pre-existing iOS NSAppTransportSecurity exception for OSRM IP `34.116.139.172` and NSPhotoLibrary descriptors for image-share flow committed in the same release commit `93eb93c`. Typecheck green across mobile + web + api.
- Session 29 (2026-04-22): **Signup gate tightened + preview UX polish (v0.2.4 + v0.2.5).** Lowered the mandatory anonymous-signup threshold from the 5th to the 3rd app launch (`anonymousOpenCount >= 3`) and hardened the `OnboardingGuard` in `apps/mobile/app/_layout.tsx` so the mandatory branch re-redirects on every pathname change — hardware-back or any silent navigation from `/onboarding/signup-prompt?mandatory=true` bounces straight back. The count==2 dismissible-prompt branch keeps the one-shot `hasRedirectedRef` behavior so a user who dismisses it doesn't get re-prompted mid-session. Only Google OAuth or email signup/sign-in (both already call `resetAnonymousOpenCount`) clears the gate. Paired with two shipped preview builds: v0.2.4 shortened the route-preview "Back to planning" button to "Back"; v0.2.5 fixed the route-planning origin card showing the stale GPS-location label after a custom-start change (reverse-geocodes `routeRequest.startOverride` and hydrates the edit field on re-entry). Both APKs distributed to Firebase App Distribution group `early-access-preview`. Bundle + typecheck green.
- Session 28 (2026-04-21): **Improved Hazard System** — three-feature upgrade turning hazards from a write-only list into a self-cleaning community-curated layer. (1) Upvote/downvote voting: `POST /v1/hazards/:id/vote` with `requireFullUser` auth (anonymous rejected 403), client speaks `up`/`down` and server maps to existing `confirm`/`deny` on `hazard_validations` (no schema collision). New `useHazardVote` hook with TanStack optimistic updates, `userHazardVotes` persisted in Zustand (cleared in `resetUserScopedState`), `hazard_vote` offline-queue type with same-hazard collapse. New `HazardDetailSheet` organism (Modal + backdrop + PanResponder swipe + reduced-motion), `HazardAlert`/`HazardAlertPill` rewritten with thumbs-up/down + score pill, promoted `hazardIcons.ts` token. (2) Auto-expiry: migration `202604210001_hazard_score_index.sql` adds generated `score` column (`confirm_count - deny_count`), `hazard_baseline_ttl()` (4h debris/ice, 12h obstacle, 7d pothole, 14d construction), refined `extend_hazard_on_confirm()` trigger with flip-guard (undoes prior vote on UPDATE to prevent double-count) and resurrection-guard (vote >7d past expiry doesn't rewind TTL), halving on downvote. Cron `POST /v1/hazards/expire` (Bearer `CRON_SECRET`, Cloud Scheduler `0 3 * * *` Europe/Bucharest) hard-deletes `score<=-3` after 24h + `expires_at < now()-7d`. `/v1/hazards/nearby` filters `score > -3`. (3) Marker clustering: `HazardLayers.tsx` rewritten with `Mapbox.ShapeSource cluster clusterRadius=50 clusterMaxZoomLevel=14 clusterProperties.max_severity`; four filter-split layers (`['has','point_count']` vs `['!',['has','point_count']]`); cluster bubble color per worst severity, radius scales 16/22/28px by count; `point_count_abbreviated` label (no emoji). Cluster tap → `getClusterExpansionZoom` → camera fly-to; individual tap → detail sheet. (4) Rate limit: dedicated `hazardVote` bucket — 5 votes/user/10 min (env-overridable), returns 429 with `Retry-After`. Plan doc `docs/plans/improved-hazard-system.md` + user guide `docs/hazardinfo.md`. 447/447 mobile-api tests green + full mobile suite green. Cloud Run revision `defpedal-api-00062-s7m`, Cloud Scheduler `hazards-expire-cron` enabled. Post-deploy fix: `RouteMap` derives `displayedHazard` from live `nearbyHazards` so the detail sheet reflects cache truth after a vote (was rendering a stale `useState` snapshot). **Widened 7-day → 45-day window (same session):** trigger resurrection-guard + cron grace-cutoff both moved to 45 days via migration `202604210002_hazard_resurrection_grace_45d.sql`. Late offline votes arriving within 45 days past `expires_at` still legitimately extend TTL. Cloud Run revision `defpedal-api-00063-gjg`.
- Session 27 (2026-04-21): P1-21 phase 3 — screen-reader access to Mapbox map state. New `useMapA11ySummary` hook + `ScreenReaderMapSummary` component + `a11yContext` prop on `RouteMap`. 11 callsites specialized — decorative mode for card surfaces (FeedCard, community-trip, ActivityFeedCard, TripCard, onboarding/safety-score), `mode: 'planning' | 'navigating' | 'historical'` for the rest. Navigation uses a polite live-region that announces off-route transitions and hazards ≤200 m (50 m bucket dedup), suppressed when the assertive `HazardAlert` is already speaking. EN + RO i18n wired (`mapA11y.*` + `hazard.types.*`). 16 passing unit tests, typecheck + bundle check green. Remaining: manual TalkBack QA on physical Android device (last merge gate).
- Session 26 (2026-04-20): Branded signup email + cross-device confirmation. Replaced Supabase default `noreply@supabase.io` emails with branded `team@defensivepedal.com` via Resend SMTP (DKIM/SPF on `defensivepedal.com` verified). New `supabase/functions/email-confirm` edge function: Android → `intent://auth/callback?code=...` URI, iOS → `defensivepedal-dev://auth/callback?code=...`, desktop → 302 to `routes.defensivepedal.com/email-confirmed`. New Next.js `/email-confirmed` page in `apps/web` (branded green-check card). `signUpWithEmail` now passes `emailRedirectTo`; `AuthSessionProvider` deep-link handler extended to handle both PKCE `code` and non-PKCE `token_hash + type` params. Migration `202604200001_cascade_user_fks.sql` adds `ON DELETE CASCADE` to 14 FKs on `auth.users(id)` so dashboard user deletes work. Deployed: edge function (Supabase), `routes.defensivepedal.com/email-confirmed` (Vercel). Commits `9d3fb6e` + `4f5db66`.
- Session 25 (2026-04-17): Image-Based Social Sharing (victorwho/defpedal_mobil1#8) — 5-phase pipeline replacing text `Share.share({message})` with 1080×1080 images. Phase 1: 3 pure core modules (`trimPrivacyZone`, `mapboxStaticImageUrl`, `buildShareCaption`) + 38 tests. Phase 2: `OffScreenCaptureHost` provider, `shareImage` service, `useShareRide` hook + 13 tests; added `react-native-view-shot`, `expo-sharing`, `expo-media-library` to `apps/mobile`. Phase 3: `RideShareCard` forwardRef + 12 tests. Phase 4: `variant: 'preview' | 'capture'` + forwardRef on `MilestoneShareCard`/`BadgeShareCard`/`MiaShareCard`, removed internal `Share.share` + 44 tests. Phase 5a: wired `useShareRide` into `feedback.tsx`/`trips.tsx`/`community-trip.tsx`. Phase 5b: new `useShareCard` hook + 6 tests, wired into `BadgeDetailModal`/`MiaLevelUpOverlay`/milestone modal, `_layout.tsx` wires `useMiaJourney()` stats. ~113 new tests. Out of scope per PRD: hazard alert share (`route-planning.tsx`) and Mia referral link (`profile.tsx`) kept as text. Requires dev APK rebuild to activate new native modules.
- Session 24 (2026-04-16): Offline Navigation (victorwho/defpedal_mobil1#6) — three-layer system: (1) ConnectivityMonitor provider with debounced NetInfo + lazy native module guard, (2) OfflineRouteCache for app restart recovery with NavigationResumeGuard (auto-resume <15min, prompt >=15min), (3) route-preview "Download for offline" button with progress states. Offline gating: reroute suppressed with banner, hazards disabled, weather hidden, ManeuverCard wifi-off indicator. OfflineMutationSyncManager skips flush when offline, immediate flush on reconnect. OfflinePackCleanup auto-deletes packs >5 days + 200MB LRU eviction. OfflineBanner molecule. offline-maps storage display with progress bar + pack ages. route-planning offline mode (disabled search, resume cached route card). 26 new tests, 9 new files, 9 modified files. Requires APK rebuild for real NetInfo activation.
- Session 23 (2026-04-15/16): Navigation UX polish + profile photo upload fix + app icon — end ride button red danger style, destination bullseye marker, Mapbox existing layer fix, profile avatar upload fixed (3 issues), app icon: pedal logo shrunk 15% with uniform #F7D02A yellow from brand SVG
- Session 22 (2026-04-15): Mia persona journey (all 5 phases), OSRM migration to 34.116.139.172, app icon resize, Mia skip-ahead UX fix
- Session 21 (2026-04-14): Neighborhood Safety Leaderboard — full-stack feature (PRD victorwho/defpedal_mobil1#4)
- Session 20 (2026-04-14): segment-aware off-route detection, reroute profile preservation, steep grade indicator cleanup
- Primary risk: iPhone validation, Redis-backed staging load testing, deeper rollout automation, and final visual polish parity across every screen are still incomplete
- Test counts: ~1200 total (core: 339, mobile-api: 270, mobile: ~591)
- Cloud Run: revision defpedal-api-00063-gjg
- Cloud Scheduler: 5 jobs (leaderboard weekly/monthly, mia-detection daily 10AM, mia-notification daily 9AM, hazards-expire daily 3AM Europe/Bucharest)
- Webapp cleanup (2026-03-22): all legacy React/Vite/Leaflet webapp code has been removed from the repo root — components/, hooks/, utils/, App.tsx, web-index.tsx, index.html, vite.config.ts, sw.js, manifest.json, and webapp dependencies (leaflet, react-dom, vite, vitest, jsdom, testing-library). Root SQL files moved to supabase/migrations/legacy/. Root tsconfig.json cleaned of DOM libs. The repo is now mobile-only.
- Preview tunnel note: preview mobile development can now auto-sync the active ngrok URL into `apps/mobile/.env.preview` through `npm run sync:mobile:preview-url` and `npm run dev:mobile:preview`
- CO2 savings feature (2026-04-02): full-stack CO2 savings calculator shipped — per-trip and cumulative environmental impact tracking across trip history, community feed, and profile. Uses actual GPS trail distance (not planned route) for accuracy. Deployed to Cloud Run.
- Trip Statistics Dashboard (2026-04-02): full-stack stats dashboard embedded inline in the History tab. Features: period selector (week/month/all time), summary cards (rides, distance, duration, CO2 saved), riding streak tracker (current + longest), ride frequency bar chart, safe vs fast route mode split. Backed by new `get_trip_stats_dashboard` Supabase RPC with timezone-aware bucketing, performance index, and new `GET /v1/stats/dashboard` Fastify endpoint. 16 new tests (9 unit + 7 integration), all passing. Deployed to Cloud Run.
- Community Stats by Locality (2026-04-02): community section shows aggregate stats (trips, km, time, CO2) for nearby cyclists with locality name via Mapbox reverse geocoding. New `get_community_stats` Supabase RPC + `GET /v1/community/stats` endpoint.
- Habit Engine (2026-04-02 to 2026-04-03): major feature set across 7 phases. Includes: anonymous auth (Supabase), 5-screen onboarding flow (location permission → safety score → cycling goal → circuit route to nearest POI → deferred signup), post-ride impact summary (animated CO2/money/hazards counters with variable equivalents), streak engine (4AM cutoff, 5 qualifying actions, freeze mechanic), Impact Dashboard (StreakChain, AnimatedCounters, guardian tier progress), daily safety quiz (50+ questions), enhanced hazard reporting (2-tap FAB, armchair long-press, confirm/deny display), guardian tier system (reporter→watchdog→sentinel→guardian angel with auto-promotion trigger), milestone share cards, scheduled notifications (streak protection, weekly impact, social digest), community stats by locality. 6 new DB tables, 5 RPCs, 3 triggers, 26 reward equivalents seeded, 40+ new integration tests. All deployed to Cloud Run + Supabase.
- Multi-Stop Routes (2026-04-03): support for intermediate stops (waypoints) in route planning. Waypoints field added to RoutePreviewRequest, OSRM/Mapbox routing extended, Zustand store actions (add/remove/clear), discrete "Add stop" UI with autocomplete (max 3 stops), yellow waypoint markers on map. Works with both safe and fast routing modes.
- Session 4 features (2026-04-04): three features in a single session:
  - **Saved Routes**: Full-stack saved routes — `saved_routes` Supabase table with RLS, 4 API endpoints (GET/POST/DELETE/PATCH), API client methods, save button on route preview with name modal, saved routes list on route planning screen (shown when destination empty). Users can save frequently used routes and reload them with one tap.
  - **Waypoint Reordering**: `reorderWaypoints` store action + up/down chevron buttons on waypoint rows. Keeps `waypointQueries` labels synced with reordered coordinates.
  - **GPX Export**: `buildGpxString` utility generates GPX 1.1 XML from trip GPS breadcrumbs + planned route polyline. Export button on TripCard writes to cache via `expo-file-system` File API and opens native share sheet.
- Session 5 features (2026-04-04): major UX polish, i18n, voice guidance, and bug fixes:
  - **UX Polish**: Cleaner address labels (strip postal/country/region), streak chain left-to-right fill, navigation zoom 16→17.5, tighter FABs, softer hazard zones (dark red + lighter red), Roboto body font (replacing DM Sans)
  - **Collapsible UI**: Tap map on route-planning to toggle FABs, weather, bottom nav with fade animation
  - **Profile Photo Upload**: expo-image-picker + Supabase Storage avatars bucket + avatar display with dashed placeholder
  - **Voice Guidance**: 200m pre-announce, ETA every 5min, tap ManeuverCard to re-announce
  - **Romanian i18n**: Full i18n framework — en/ro translation files (~300 keys), useT() hook, language picker in Profile. Wired into all 16+ screens: navigation, feedback, auth, settings, history, trips, community, profile (including all toggle descriptions, POI categories, bike types, frequencies, sign-out alert)
  - **Hazard Source Field**: in_ride/manual/armchair distinguishes how hazards were reported. DB migration + API schema update
  - **Fix: Stale Navigation Metrics**: Navigation distance/ETA/climb no longer freeze after off-route or reroute. Root causes: appState reset during reroute, frozen step index when off-route, missing lastPreAnnouncementStepId reset. 5 diagnostic tests
  - **Tech Debt**: Deduplicated qualifyStreakAsync into shared lib/streaks.ts
  - **EAS Build**: Set up Expo EAS project, preview build profile, Mapbox download token hook, internal distribution APK pipeline
- Session 5 continued (2026-04-04 to 2026-04-05): features, push notifications, trip comparison, microlives:
  - **Multi-stop Reroute**: Strips already-passed waypoints from reroute request based on rider position on polyline. 4 tests.
  - **Push Notifications**: expo-notifications installed, NotificationProvider wired with tap-to-navigate, push token registration on sign-in
  - **Trip Comparison**: Select 2 trips from history, side-by-side stats (distance, duration, speed, CO2, mode) + map with GPS trail
  - **Personal Safety Map Overlay**: FAB toggle shows past ride GPS trails on planning map (safe=green, fast=blue, 40% opacity)
  - **Hazard Alert Sharing**: Share button on hazard report toast opens native share sheet with location
  - **Microlives Phase 0-3**: Complete gamification engine:
    - Core calculation module (`microlives.ts`): personal microlives (0.4 ML/km × vehicle × AQI), community seconds (4.5s/km × vehicle). 25 unit tests.
    - Database: `ride_microlives` table, `community_seconds_daily`, profiles extended with `total_microlives`/`total_community_seconds`/`microlife_tier`
    - RPC: `record_ride_microlives` (compute, store, accumulate, community upsert)
    - Server: ride impact endpoint calls microlives RPC, impact dashboard returns totals
    - Post-ride: microlives + community seconds in ImpactSummaryCard (single merged card)
    - Home screen: TimeBankWidget (compact one-row, matching weather font)
    - History: microlives row in impact card + community seconds stat
    - Impact dashboard: Time Bank section with animated counters
    - Stats dashboard: life earned (min) and donated to city (sec) summary cards
    - Route preview: estimated life earned in summary row (gold accent)
    - Community stats: donated to city tile
    - FAQ: 3 entries explaining Microlives, community seconds, Time Bank
    - Cloud Run redeployed with microlives API
- Badge System Phase 2 (2026-04-05): evaluation engine + API endpoint, server-side only:
    - Migration `202604050004_badge_evaluation.sql`: Updated `record_ride_impact` RPC to accept 7 new optional ride-context fields (elevation_gain_m, weather_condition, wind_speed_kmh, temperature_c, aqi_level, ride_start_hour, duration_minutes); uses ON CONFLICT upsert to stay idempotent while still accumulating profile totals only on genuine inserts
    - `check_and_award_badges(p_user_id UUID)` RPC: evaluates all ~140 badge criteria in a single call — loads profile, streak, ride aggregates, social counts, quiz stats, hazard specialisation, seasonal counts upfront, then PL/pgSQL conditionals for each badge family; inserts into user_badges (ON CONFLICT DO NOTHING); returns JSONB array of newly awarded badge definitions
    - Coverage: Firsts, Distance/Time/Ride count (cumulative), Streak, Early Bird / Night Owl / Monthly, CO2/Money/Microlives/Community Seconds, Hazards/Validators/Specialists, Quiz (with perfect-day and 3-consecutive perfect-day detection), Climbing, Athletic one-timers, Weather/AQI, Social, Seasonal, Annual events, Hidden badges (mirror_distance, round_number, same_origin_dest_7, five_am, friday_13, pi_day, leap_day)
    - POST /v1/rides/:tripId/impact: extended body schema with optional metadata fields; calls updated RPC; calls `check_and_award_badges` after recording (non-fatal); returns `newBadges` in response
    - GET /v1/badges: returns badge definitions catalog + user's earned badges + progress toward unearthed badges (computable locally from ride/profile aggregates); no new RPC needed
    - contracts.ts: `RideImpact` extended with `newBadges: readonly BadgeUnlockEvent[]`; added `BadgeResponse` type
    - api.ts: `recordRideImpact` extended with optional `meta` object; `fetchBadges()` added
    - All TypeScript checks pass clean (API + mobile)
- Badge System Phase 3 — Trophy Case UI + celebration + cleanup (2026-04-05 to 2026-04-06):
    - **Trophy Case screen** (`app/achievements.tsx`): 3-column FlatList grid with category tab filtering (All + 8 categories), sort order (earned+new → in-progress → locked first 6 → secret ???), badge detail modal on tap
    - **Design system components**: BadgeCard molecule (grid cell), BadgeInlineChip atom (compact pill), TrophyCaseHeader organism (earned/total + progress bar + recent unlock), CategoryTabBar organism (9 horizontal scrollable tabs with counts), BadgeDetailModal organism (bottom sheet with lg icon, tier, flavor text, criteria, progress bar, rarity, share)
    - **BadgeUnlockOverlay**: Full-screen celebration with spring shield animation, 14-particle tier-colored burst, staggered text fade-in, tap-to-dismiss. BadgeUnlockOverlayManager in root layout reads from appStore queue, max 2 per session, suppressed during NAVIGATING
    - **BadgeShareCard**: Capturable 320px share card (bgDeep, accent border, brand logo, lg badge icon). Share via native Share API from detail modal
    - **Post-ride integration**: ImpactSummaryCard shows "BADGES EARNED" section with staggered badge icons + "View all achievements >" link. Feedback screen enqueues newBadges into appStore for overlay manager
    - **Impact Dashboard integration**: "Recent Badges" horizontal scroll section with 5 most recently earned badges + "View all >" link
    - **Profile integration**: "Achievements" row below user card with trophy icon, badge count, progress bar, tap navigates to Trophy Case
    - **appStore**: Added `pendingBadgeUnlocks` (persisted) with `enqueueBadgeUnlocks()`, `shiftBadgeUnlock()`, `clearBadgeUnlocks()`
    - **useBadges hook**: TanStack Query hook for GET /v1/badges with 5min stale time
    - **Guardian Tier removal**: Removed the entire guardian_tier system (reporter→watchdog→sentinel→guardian_angel) from contracts.ts, profile.tsx, impact-dashboard.tsx, history.tsx, user-profile.tsx, FeedCard.tsx, MilestoneShareCard.tsx, feedSchemas.ts, feed.ts, v1.ts. Tier milestones removed from milestone detection
    - **Microlives badges removal**: Removed 9 badge definitions (Time Banker I-V, Community Giver I-IV), dropped microlife_tier column, removed icons from badgeIcons.ts. Badge count: 146→137
    - **TimeBankWidget removal**: Removed microlives widget from route planning screen + its dashboard query
    - **Badge evaluation fixes**:
        - `check_and_award_badges` now counts from `trips` table (GREATEST with ride_impacts) so first_ride triggers even before ride_impacts row exists
        - Created missing `quiz_answers` table that was crashing the function
        - Fixed PL/pgSQL array concatenation (`|| ARRAY['x']` instead of `|| 'x'`)
        - Badge check runs on: GET /v1/badges (Trophy Case visit), GET /v1/impact-dashboard (post-ride), GET /v1/rides/:tripId/impact (auto-create path)
    - **Auth fixes**: GET /v1/badges and GET /v1/impact-dashboard changed from `requireWriteUser` to `requireAuthenticatedUser` to support anonymous Supabase users
    - **Rate limit fix**: GET /v1/badges changed from `write` to `routePreview` policy to prevent 429s
    - **Schema fix**: Removed `guardianTier` from feedSchemas.ts response schemas (was causing 500 on GET /v1/profile)
    - Deployed to Cloud Run (revisions 24-31) + Supabase migrations applied

- Design System Overhaul (2026-04-06):
    - **SWOT analysis**: Full design system audit documented in `design-work/design-system-analysis.md` — token coverage, component inventory, theme adoption, implementation drift scoring (6.2/10 → improved)
    - **New tokens**: `tints.ts` (opacity scale + 16 brand/safety/surface rgba tints), `iconSize.ts` (7 standardized sizes from xs to 3xl), `zIndex.ts` (7 semantic layers from base to supreme)
    - **New components**: `Card` atom (solid/glass/outline variants), `SectionTitle` atom (accent/muted variants with a11y header role), `SettingRow` molecule (label + description + animated Toggle with haptics)
    - **Hardcoded color cleanup**: Replaced 50+ hardcoded hex colors with token references across 9 screens, 20 inline rgba() values with tint tokens across 7 screens, 11 hardcoded z-index values across 8 files
    - **Profile refactor**: Replaced 9 inline toggle implementations with `SettingRow`, 7 section titles with `SectionTitle`, removed ~30 lines of dead styles
    - **Full theme migration**: All 30 screens now use `useTheme()` + `createThemedStyles(colors)` factory pattern (was 4/30). Eliminated `brandColors`/`darkTheme` direct imports from all screens except `_layout.tsx` (intentional — renders before ThemeProvider). Removed legacy `mobileTheme` bridge imports
    - **Testing infrastructure**: Added `vitest.config.ts` + `vitest.setup.ts` for mobile app, `@testing-library/react-native` + `react-test-renderer`. SettingRow has 12 passing unit tests
    - **Map overlay fix**: Preserved intentional `#FFFFFF` on route-planning map cards (origin, destination, search, FABs, waypoints) — these sit on the dark map and must stay white regardless of theme

- UX Polish session (2026-04-06):
    - **Maneuver icons**: Replaced Unicode text arrows (↑←→◎) in `NavigationHUD` (ManeuverCard, ThenStrip, FooterCard) with Ionicons directional icons (`arrow-up`, `arrow-back`, `arrow-forward`, `location`, `return-up-forward`) — faster recognition while cycling
    - **Streak flame icon**: Replaced "~" placeholder in `StreakCard` with `Ionicons name="flame"` (yellow, 24px)
    - **Bottom sheet peek state**: `MapStageScreen` now accepts a `peekContent` prop (max 60px height). When the CollapsibleSheet is collapsed, the peek row renders below the drag handle so key info stays visible. `route-preview.tsx` passes a compact strip: mode badge + distance + duration + "Swipe up" hint
    - **Long-press discoverability hint**: Route planning screen shows a 4-second auto-dismiss pill "Long-press map to drop a pin" on mount. Dismisses immediately when user long-presses. Non-interactive (`pointerEvents="none"`)
- Bug fixes (same session, post phone test):
    - **Peek state stale closure**: `CollapsibleSheet` panResponder captured `effectiveCollapsed = 48` on first render (before route loaded, `peekContent` was null). Fixed by replacing the local variable with a ref (`effectiveCollapsedRef.current`) so panResponder closures always read the current value
    - **ExpoPushTokenManager noise**: Added `NativeModules.ExpoPushTokenManager` guard in `push-notifications.ts` and `NotificationProvider.tsx` before the lazy `require()`. The JS module loads fine in dev builds without a native rebuild, but any call throws — the NativeModules check prevents the require entirely

- Bug hunt session (2026-04-06):
    - Systematic static analysis (3 parallel agents) across all major screens, API routes, and data flow identified 8 confirmed bugs
    - **Community comments author**: `GET /comments` Supabase select was missing `username` from profiles join — comments always showed display_name or "Rider" instead of `@username`. Added `username` to select.
    - **Voice guidance stale closure**: `speak()` was a plain function (not memoized). Multiple useEffects called it without listing it as a dependency — after mute/unmute, active effects used old closure until next GPS tick. Wrapped in `useCallback` and added to all dep arrays.
    - **Orphaned offline mutations**: When `trip_start` fails and is killed, dependent `trip_end`/`trip_track` mutations were permanently stuck as pending (skipped every 15s flush, never cleaned up). Added cascade-kill logic in `OfflineMutationSyncManager`.
    - **PATCH /profile not rate-limited**: All other write endpoints call `applyRateLimit`; profile update did not. Added write-bucket rate limit.
    - **Hazard validate not rate-limited**: `POST /hazards/:id/validate` (confirm/deny) had no rate limit — could spam hazard votes. Added write-bucket rate limit.
    - **Hazard toast timer leak**: Two `setTimeout` calls for toast auto-dismiss not tracked or cleared on unmount. Added `hazardToastTimerRef` with proper cleanup.
    - **Reverse geocode race on double long-press**: Rapid successive long-presses could overwrite destination label with stale first-press geocode. Added `geocodeNonceRef` to cancel stale results.
    - **Safety score returns 100 for no-data areas**: When no road risk segments exist in the area, score was `100 - 0 = 100` (falsely "perfectly safe"). Fixed: return `score: 0` when `totalSegments === 0`.
    - **Pre-existing test failures fixed**: riskDistribution label ("Safe" → "Very safe"), safety-score field names (safestCount → safeCount), safety-score score formula (100 − avg_score), record_ride_impact RPC params (7 new optional fields), impact-dashboard guardian tier assertions (tier removed in Phase 3).
    - All tests now pass: packages/core 276/276, services/mobile-api 205/205. Bundle check ✅. TypeScript clean.

- Bug hunt round 2 + comments fix (2026-04-06):
    - **Comments broken (critical)**: `GET /feed/:id/comments` used Supabase embedded join `profiles(...)` but `feed_comments.user_id` references `auth.users`, not `profiles` — no FK exists. PostgREST failed silently → 502 → "No comments yet". Fixed: two-step query (fetch comments, batch-fetch profiles by user IDs, merge). Added `in` to Supabase test mock chain.
    - **Impact dashboard stripped microlives**: `additionalProperties: false` in response schema was missing `totalMicrolives` and `totalCommunitySeconds` properties → Fastify silently dropped them. Client never received microlives data.
    - **thisWeek.hazardsReported hardcoded to 0**: Handler ignored RPC data, returned literal `0`. Fixed to read `thisWeek?.hazardsReported`.
    - **Dismissed hazard IDs persist across nav sessions**: `dismissedHazardIdsRef` was never cleared. After finishing a ride and starting a new one, hazards dismissed on the first ride were still suppressed. Fixed: clear the ref on component unmount.
    - **Comment count stale in feed after posting**: `usePostComment` invalidated queries but didn't update the cached `commentCount` on the feed item. Going back to feed showed old count. Fixed: optimistic increment via `setQueriesData`.
    - **Settings route TS error**: `href="/onboarding/index"` → `href="/onboarding"`. Pre-existing TS compilation error resolved.
    - Deployed Cloud Run revisions 00032 through 00035. All tests pass (276 core + 205 API). TypeScript fully clean (0 errors). Bundle ✅.

- UX Design Plan Implementation (2026-04-06):
    - **Phase 1.4 Accessibility**: `textMuted` contrast improved `#6B7280` → `#8B9198` for WCAG AA. Added `accessibilityRole`/`accessibilityLabel` to 27+ Pressable elements across 6 screens (route-planning, route-preview, navigation, history, profile, community)
    - **Phase 1.1 Legacy theme migration**: Migrated 6 remaining `mobileTheme` consumers (FeedCard, SafetyBadge, SafetyTagChips, NavigationChrome, StatusCard, PlaceSearchField) to design system tokens. Deleted `apps/mobile/src/lib/theme.ts` — zero `mobileTheme` references remain in codebase
    - **Phase 1.2 Semantic colors**: Replaced hardcoded hex (`#F2C30F`, `#22C55E`, `#F59E0B`, `#ca8a04`) with token references (`colors.accent`, `colors.safe`, `colors.caution`, `safetyColors.caution`) in route-preview and SafetyBadge
    - **Phase 1.3 Diagnostics purge**: Removed Coverage + Sync status badges from route-preview topOverlay. Removed dead diagnostic chip variables (GPS, Sync, Step counter, BG status) from navigation.tsx
    - **Phase 1.5 Interaction quality**: Created `FadeSlideIn` animation atom (opacity + translateY, 200ms, respects reduced motion). Created `useReducedMotion` hook (re-export). Created `haptics.ts` utility with lazy NativeModules guard
    - **Phase 2 Calm route planning**: Progressive disclosure — origin card + routing toggles hidden until destination set. FABs reduced from 6 to 3 (Locate, Hazard, Saved Routes). EDIT text → pencil icon. Weather widget conditional (destination set OR severe conditions)
    - **Phase 3 Profile restructure**: Settings grouped into 3 sections (Cycling Preferences, Display, Account) with SectionTitle atoms. Added i18n keys for en + ro
    - **Phase 4 Systems polish**: Rating skip counter — auto-suppresses rating step after 3 skips (persisted in Zustand). Route comparison card: now always shows when toggle ON — handles small differences ("Slightly safer", "Similar safety") instead of rounding to 0% and hiding
    - Bundle ✅. TypeScript clean (0 new errors). Phone-tested on Samsung S23 Ultra
    - **Phase 2 continued**: "Show nearby" quick-pick sheet — NearbySheet organism with 7 toggleable POI category chips (Parking, Rental, Water, Repair, Restroom, Supplies, Bike lanes). Layers FAB on route planning screen. Syncs with existing poiVisibility store.
    - **Phase 3 — FeedCard simplification**: Removed SafetyTagChips and 4-column stats grid. Merged title + inline safety pill. Compact summary line (distance · duration · CO2).
    - **Phase 3 — History restructure**: Replaced large Impact card + StreakCard with compact 4-stat header (rides, km, streak, CO2). Trip list inlined via FlatList (was behind "View My Trips" button). Quiz + StatsDashboard moved to footer.
    - **Phase 3 — Visual softening**: Badge glow opacity 0.4→0.2, MilestoneShareCard border 2px→1px.

- Light/Dark Theme Support (2026-04-07):
    - **Theme picker**: Added `themePreference` ('system' | 'dark' | 'light') to Zustand store (persisted). Three-pill picker in Profile > Display section. Navigation always forces dark per spec rule (glare/battery/safety).
    - **Screen.tsx**: Converted from static `brandColors` to `useTheme()`. Header shell, background, text all adapt. Glass effect switches dark/light. Glow orbs dimmed in light mode.
    - **MapStageScreen.tsx**: Bottom sheet, handle, fixed footer all theme-aware. Dark glass vs white glass.
    - **Components migrated to useTheme()**: SettingRow, Toggle, TripCard, FeedCard, CommunityStatsCard, ElevationChart. All converted from hardcoded `darkTheme`/`brandColors` to `createThemedStyles(colors)` pattern.
    - **Profile fixes**: Replaced `surfaceTints.glass` (hardcoded dark rgba) with `colors.bgPrimary` on achievementsCard, userCard, settingRow, DropdownPicker. Language/theme pill borders use themed colors.
    - **Route preview**: Summary strip cleaned up (removed border/shadow, uses `bgSecondary`). Life-earned stat moved to its own row with heart icon.
    - **StatusBar**: Changed from `style="light"` to `style="auto"` to adapt.
    - **Elevation chart**: Converted card container to themed styles. SVG graph (blue line + gradient) works on both backgrounds.
    - Bundle ✅. Phone-tested on Samsung S23 Ultra in both light and dark modes.

- Elevation Data Refactor (2026-04-07):
    - **Replaced Open-Meteo with Mapbox Terrain-RGB**: All elevation data now comes from Mapbox terrain tiles, eliminating Open-Meteo API rate limit issues (HTTP 429).
    - **Server consolidation**: Removed Open-Meteo fallback from server. Added `getElevationGain()` using existing Terrain-RGB tile decoder. `/v1/elevation-profile` endpoint now returns `{ elevationProfile, elevationGain, elevationLoss }` in single response.
    - **Client simplification**: Deleted client-side `elevation.ts` (was calling Open-Meteo). `mapbox-routing.ts` now makes single server call for all elevation data.
    - **Require cycle fixes**: Fixed barrel import cycles in `Toggle.tsx` and `SettingRow.tsx` — now import `useTheme` directly from `ThemeContext.tsx` instead of design-system barrel.
    - **Benefits**: Zero external API calls for elevation (just Mapbox tiles which are CDN-cached), single source of truth, fewer network round trips.
    - Deployed to Cloud Run. Bundle ✅. Phone-tested.

- Bug fixes + voice guidance (2026-04-07):
    - **Post-ride impact screen showing 0 values**: Impact summary (microlives, CO2, EUR) displayed 0 for rides with actual movement. Two fixes: (1) trail distance computation now falls back to planned route distance when `calculateTrailDistanceMeters` returns 0 despite having breadcrumbs; (2) server enhancement effect no longer overwrites non-zero local impact values with zeros from unsynced trip data — keeps local computation but still accepts badges and equivalentText from server.
    - **Voice guidance step completion simplified**: On completing a turn, voice previously announced the completed step instruction + next step with distance (e.g. "Turn left, then in 200 meters turn right"). Now only announces the next step with distance (e.g. "In 200 meters, turn right") — the completed instruction is redundant since the rider already made the turn. No announcement for the final step before arrival (handled by arrival announcement).
    - **AnimatedCounter broken `setNativeProps`**: Post-ride impact counters (ML, CO2, EUR) showed "0" permanently despite correct subtitle text (e.g. "+13 minutes of life earned"). Root cause: `setNativeProps({ text: ... })` does not work on RN `Text` components — only on `TextInput`. The animation listener fired correctly but display never updated. Fix: replaced `setNativeProps` + ref approach with `useState` + `setDisplayText` in the animation listener. Counters now animate from 0 to actual values.
    - Bundle ✅. Preview APK built and installed on Samsung S23 Ultra.

- Comprehensive Test Coverage (2026-04-08):
    - **Mobile app tests expanded from 65 to 467** (total across all packages: 949). Fixed 5 pre-existing test failures and wrote 35 new test files.
    - **Hooks tests (9 files, 63 tests)**: useCurrentLocation, useBicycleParking, useBicycleRental, useBikeShops, useNearbyHazards, useWeather, usePoiSearch, useFeed, useBadges — covers permission handling, API mocking, error states, TanStack Query integration
    - **Lib tests (12 files, 151 tests)**: api (40 tests for all endpoints), weather (19 tests incl. WMO codes + AQI), mapbox-routing (15 tests for safe/fast/waypoints/enrichment), poi-search (13 tests for 6 POI categories), bicycle-parking/rental/shops (28 tests for Overpass parsing), offlineQueue (10 tests for all 6 mutation types), navigation-helpers (7 tests for tab routing), push-notifications (11 tests for NativeModule guard branches), daily-weather-notification (4 tests), env (4 tests)
    - **Design system tests (14 files, 120 tests)**: Atoms — Button (12), Badge (10), IconButton (7), Toggle (8), Card (5), SectionTitle (6), FadeSlideIn (7), BadgeIcon (12), BadgeProgressBar (9), BadgeInlineChip (6). Molecules — SearchBar (12), Toast (12), WeatherWidget (8), BadgeCard (7)
    - **Store tests expanded (8 → 76 tests)**: route lifecycle, waypoints, navigation session, offline queue, preferences, badge unlock queue, recent destinations, milestones, immutability checks, reset flow
    - **Pre-existing test fixes**: devAuth (isAnonymous field), mapbox-search (rewrote for Search Box API v1), useRouteGuard/index/AuthSessionProvider (happy-dom environment + mocks)
    - **Infrastructure**: added happy-dom, @testing-library/react, @testing-library/dom devDeps; extended vitest.setup.ts (ScrollView, ActivityIndicator, AccessibilityInfo, Dimensions, NativeModules mocks); pinned react-dom@19.2.1
    - All 949 tests pass. Bundle ✅. Phone-tested on Samsung S23 Ultra.

- Codebase Review + Phase 1 Stability Fixes (2026-04-08):
    - **Full 8-category audit**: Security, Errors & Crashes, Data Integrity, Performance, API Contracts, UX & Accessibility, Infrastructure, Code Quality. Overall score 6/10 with 5 P0, 33 P1, 37 P2, 24 P3 findings. Reports saved to `review-report-2026-04-08.md` and `action-plan-2026-04-08.md`.
    - **Phase 1 — Data Integrity & Stability (9 fixes)**:
        - `locale` added to Zustand persist whitelist — language no longer resets on cold start
        - Queue eviction second pass now protects `TRIP_CRITICAL_TYPES` — `trip_start` can no longer be dropped
        - `finishNavigation` guarded — only transitions to `AWAITING_FEEDBACK` when `navigationSession` is non-null
        - `queueTripEnd` wrapped in `useCallback` with proper deps — eliminates stale closure that could enqueue wrong trip data
        - `OfflineMutationSyncManager` interval no longer re-registers on every queue change — stable 15s flush cycle
        - `AuthSessionProvider` reduced from double auth subscription to single — eliminates race condition
        - `reorderWaypoints` uses immutable `slice`-based reorder instead of `.splice()` mutation
        - Navigation `speak` reads fresh `navigationSession` from store instead of stale closure
        - `fetchRiskMap` routed through `requestJson` — gets timeout, auth headers, and error handling
    - **Bonus fixes**: Removed `console.warn` in `AuthSessionProvider` (prod code)
    - **Test infrastructure fix**: `react-native/index.js` contains Flow syntax (`import typeof`) that Vite/Rollup cannot parse. Created `vitest.mock-rn.ts` shim and `resolve.alias` in `vitest.config.ts` — all 44 mobile test files now pass (was 28/44). Removed redundant 150-line `vi.mock('react-native')` from `vitest.setup.ts`.
    - **Worktree cleanup**: Pruned 5 stale worktrees + deleted 18 orphaned branches
    - All 949 tests pass (core 277, API 205, mobile 467). Bundle ✅. Phone-tested.

- City Heartbeat Community Dashboard (2026-04-08):
    - **Full-stack feature**: Community pulse dashboard showing real-time cycling activity, 7-day trends, hazard hotspots, and top contributors within a geographic radius
    - **Supabase RPC** `get_city_heartbeat`: spatial + temporal aggregation using PostGIS ST_DWithin on trip_shares + hazards. Returns today's pulse (rides, distance, CO2, community seconds, active riders), daily activity for chart (bucketed by day), cumulative totals, top 5 hazard types by count, top 5 contributors (public profiles)
    - **API endpoint** `GET /v1/community/heartbeat`: Fastify route with lat/lon/radiusKm/days params, full JSON Schema validation (heartbeatQuerystringSchema + heartbeatResponseSchema)
    - **Types**: `CityHeartbeat`, `DailyActivity`, `HazardHotspot`, `TopContributor` in contracts.ts
    - **PulseHeader organism**: Animated dual-ring heartbeat (Animated.Value loop, 2s period, staggered), city name, today's ride count in accent orb, active riders count. Respects `useReducedMotion`
    - **ActivityChart organism**: 7-day SVG bar chart (rides as yellow gradient bars) with community seconds blue line overlay. Fills missing days with zeros. Legend, grid lines, y-axis labels, x-axis day names. Follows ElevationChart coordinate-transform pattern
    - **city-heartbeat.tsx screen**: ScrollView with pull-to-refresh. Sections: PulseHeader → today's stats (4 AnimatedCounters in 2x2 grid) → ActivityChart → all-time totals → hazard hotspots (red count badges) → top contributors (rank badge + avatar + stats). All cards use FadeSlideIn with staggered delays
    - **Community navigation**: Pressable card on community.tsx with Ionicons pulse icon + accent border, navigates to /city-heartbeat
    - **useCityHeartbeat hook**: TanStack Query (5min stale) with location + locality name, same pattern as useCommunityStats
    - **i18n**: 20 keys for en + ro (cityHeartbeat namespace)
    - **Bug fix**: require cycle in PulseHeader/ActivityChart — imported useTheme from barrel `..` (index.ts) which re-exports organisms. Fixed: import directly from `../ThemeContext`
    - **PostgreSQL fix**: `round(double precision, integer)` doesn't exist — cast to `::numeric` before round with precision
    - Deployed to Cloud Run revision 00037. Supabase migration applied. All 949 tests pass. Bundle ✅. Phone-tested on Samsung S23 Ultra.

- UX fix (2026-04-08):
    - **Save route modal KeyboardAvoidingView**: Wrapped save route modal content in `KeyboardAvoidingView` (`behavior="height"` on Android, `"padding"` on iOS) so the keyboard doesn't cover the route name text input. Added `modalAvoidingView` style for centering.

- Session 12 — Quiet hours, notification budget, recent destinations, voice nav fix (2026-04-09):
    - **Post-ride impact tests**: 7 new tests — AnimatedCounter (3: reduced motion, prefix/suffix, zero) + ImpactSummaryCard (4: ride counters, dashboard totals, null dashboard, badges earned)
    - **Quiet hours enforcement**: PATCH /profile extended with 8 notification preference fields (notifyWeather/Hazard/Community/Streak/ImpactSummary, quietHoursStart/End/Timezone). Profile screen syncs toggles + device timezone to backend on change and on first load. Server dispatchNotification already reads from DB.
    - **Notification budget**: 1-per-24h rolling limit in dispatchNotification (isUnderDailyBudget checks notification_log). Streak reminders bypass as high priority. Social digest merged into weekly impact summary body (validation + like counts from past 7 days). Daily social cron retired (returns early with log).
    - **DB validation**: Social digest subqueries verified against all migration schemas — all column names, FKs, and timestamp types match. No mismatches.
    - **Redis caching/rate-limiting**: Already fully implemented in redisStore.ts. Activation is deployment-only (set REDIS_URL on Cloud Run).
    - **Server-backed recent ride destinations**: GET /v1/recent-destinations endpoint derives 3 most recent distinct destinations from trips table (PostGIS point parsing, deduplication by label). useRecentRideDestinations hook (TanStack Query, 5min stale, falls back to local store for anonymous). SearchBar shows server recents when empty + prepends matching recents to Mapbox autocomplete. Local store MAX_RECENT reduced from 10 to 3.
    - **AnimatedCounter fix**: Replaced requestAnimationFrame (doesn't fire in Hermes bytecode) with setInterval + Date.now(). Counters now animate correctly in preview/release builds.
    - **Voice navigation fix (2 bugs)**: (1) hasPassedCurrentManeuver in navigation.ts now requires distanceToRouteMeters < 30m — prevents lateral GPS offset from prematurely jumping currentStepIndex to the next step. (2) Removed currentStepIndex from intro announcement effect deps in navigation.tsx — prevents re-announcing every step advance. Step completion now correctly speaks the current turn instruction.
    - **Notification tests**: 5 new tests — isInQuietHours (3: overnight true, daytime false, null false) + PATCH /profile notification fields (2: accepts prefs, rejects invalid format)
    - All 969 tests pass (core 277, API 210, mobile 482). Phone-tested on Samsung S23 Ultra (preview APK).

- Session 13 — Rider Tier XP system + post-ride impact rework (2026-04-10):
    - **Rider Tier XP System (full-stack)**: 10-tier progression (Kickstand → Legend) with XP awarding on ride completion, badge earning, and streak days. Supabase migration: `rider_xp_log` table, `award_ride_xp` RPC with tier promotion detection, `total_xp`/`rider_tier` columns on profiles. Server: XP awarding in `POST /v1/rides/:tripId/impact`, `GET /v1/tiers` endpoint, tier in feed responses. XP multipliers based on ride context (distance, weather, hazards).
    - **Design system — Tier components**: `TierPill` atom (sm/md/lg sizes, hidden at tiers 1-2 in feed), `TierRankCard` organism (compact two-column: mascot+name | XP+progress bar), `RankUpOverlay` organism (full-screen tier promotion celebration), `XpGainToast` atom. Tier mascot images for all 10 tiers. `tierColors.ts` token file with XP thresholds, `tierImages.ts` with require() mappings.
    - **Profile tier card**: Compact two-column layout — left column has 56px tier mascot icon + tier name in tier color, right column has XP counter + progress bar + next tier label. No redundant headings or repeated tier names.
    - **Post-ride impact — XP always visible**: ImpactSummaryCard XP section now always renders (was conditional on `xpBreakdown.length > 0`). Shows breakdown rows when server provides them, total XP line, and tier progress bar. Tier data backfilled from dashboard when ride-specific XP not yet computed (fixes Kickstand default for existing users).
    - **Post-ride impact — removed "Your Total Impact"**: Removed lifetime totals section (CO2/EUR/hazards) from ImpactSummaryCard. Removed `dashboard` prop. Cleaned up 7 unused styles and 3 unused imports.
    - **RankUpOverlay in root layout**: `RankUpOverlayManager` in `_layout.tsx` reads `pendingTierPromotion` from appStore, shows celebration overlay after badges, suppressed during NAVIGATING.
    - **Feed integration**: `riderTier` added to feed response schema and FeedCard displays TierPill next to username.
    - **Tests**: Updated ImpactSummaryCard tests — 5 tests covering XP section always visible, breakdown rows, no totals section, badges.
    - Phone-tested on Samsung S23 Ultra (embedded bundle APK).
    - **Impact Dashboard — XP KPI card**: Replaced compact TierRankCard (no mascot) with full XP KPI card using AnimatedCounter in tier color + progress bar + next tier label. Matches Time Bank card visual style.
    - **History — "Your Impact" link**: Added pressable card with accent border below compact stats, navigates to `/impact-dashboard`. Was missing after Phase 3 history restructure.
    - **Impact Dashboard — zero stats fix**: Dashboard read totals from `profiles` columns (populated by `record_ride_impact` RPC). Rides before that feature was deployed showed all zeros. Server now falls back to `trips` table via `getUserStats` + `getTripStatsDashboard` when profile totals are zero. Also backfills microlives (0.4 ML/km) and community seconds (4.5 sec/km) from trip distance. Deployed to Cloud Run revision 00043.
    - **FAQ restructure & placement**: Restructured FAQ screen from 12 flat items into 4 categorized sections (Safety & Routing 8 items, Your Impact 5 items, Progression & Rewards 5 items, Privacy & Data 1 item) with section headers and icons. Added 7 new Q&A items covering CO2 calculation, ride equivalents, XP system, rider tiers, badges, streaks, and qualifying actions. Connected FAQ from 3 entry points: Settings tile (5th MenuItem), Profile > Account section row, and History tab (between Your Impact and Daily Quiz cards). Added `settings.helpFaq`/`helpFaqSub` translation keys for en + ro. Phone-tested on Samsung S23 Ultra (preview APK).
    - **Quiz questions: static file + Romania adaptation**: Moved 25 quiz questions from Supabase `quiz_questions` table to static TypeScript file (`services/mobile-api/src/data/quiz-questions.ts`). Questions are now version-controlled and don't require DB seeding. Adapted content for Romania: Codul Rutier references, 112 emergency number, tram track safety, Romanian law on helmets/alcohol/phone/reflective vest. Replaced US-only content (Idaho Stop, sharrow markings). Added 20 new Romania-specific questions (45 total) covering Romanian law (8), local hazards (7), and infrastructure (5). All 210 API tests pass.

- Session 14 — Navigation climb accuracy fixes (2026-04-11):
    - **P1 fix — Hide stale climb when off-route**: `climbData` useMemo in `navigation.tsx` now returns `null` when `offRouteSince != null`, preventing the FooterCard from showing a misleading remaining-climb value computed against the original route's elevation profile. FooterCard already renders "—" for null climb. After reroute, the new route carries fresh elevation data and climb resumes.
    - **P3 fix — Along-route distance replaces haversine**: Added `polylineSegmentDistance(points, fromIndex, toIndex)` to `packages/core/src/distance.ts` — walks consecutive polyline vertices summing haversine segments. `getNavigationProgress` in `navigation.ts` now uses this instead of straight-line `haversineDistance(user, maneuver)` for `distanceToManeuverMeters`. This makes `remainingDistanceMeters` fully along-route, fixing inaccuracy on winding roads (switchbacks, curves) where haversine underestimated distance. Also improves ETA accuracy and voice announcement distances.
    - **5 new tests**: `polylineSegmentDistance` — adjacent points match haversine, L-shaped route > haversine, U-shaped switchback >> haversine, fromIndex >= toIndex returns 0, empty/single-point returns 0.
    - All 236 core + navigation tests pass. TypeScript clean (0 errors). Preview APK built and installed on Samsung S23 Ultra.

- Session 14 continued — Flat routing (avoid hills) (2026-04-11):
    - **Full-stack "Avoid hills" flat routing**: New `avoidHills: boolean` field on `RoutePreviewRequest`, `SavedRoute`, `SavedRouteCreateRequest` in contracts.ts. When enabled in safe mode, routes use a separate OSRM instance (`bicycle-flat` profile, uphill penalty 7.0x vs 1.1x) via nginx proxy on port 5001.
    - **Client-side routing**: Added `OSRM_FLAT_API_BASE` constant in `mapbox-routing.ts`. `fetchOsrmRoutes` selects flat vs standard endpoint based on `avoidHills`. Composes with `avoidUnpaved` (`&exclude=unpaved` on flat endpoint). Fast mode ignores the flag (Mapbox Directions only).
    - **Server-side**: `safeOsrmFlatBaseUrl` config in `config.ts` (`SAFE_OSRM_FLAT_BASE_URL` env var), `customOsrm.ts` selects base URL, `http.ts` JSON schemas updated, `v1.ts` passes through to routing + saved routes.
    - **Zustand store**: `avoidHills` state + `setAvoidHills` setter + persisted. Default `false`. Independent from `avoidUnpaved`.
    - **Route planning UI — 3-way toggle**: Safe (blue, shield icon) / Fast (blue, flash icon) / Flat (green, trending-down icon) pills. Mutually exclusive — Flat forces safe mode + avoidHills. Tapping Safe or Fast clears avoidHills. Green `safeGreenLight` tint added to `tints.ts`.
    - **Route preview wiring**: `avoidHills` included in `effectiveRequest` (TanStack Query key) — toggling triggers auto-refetch.
    - **i18n**: en + ro translations for `planning.flat`, `profile.avoidHills`, toggle descriptions.
    - **7 new tests**: 4 routing (flat endpoint, standard endpoint, compose with unpaved, ignored in fast mode) + 3 store (setAvoidHills, default false, independent from avoidUnpaved). All existing tests updated with `avoidHills: false`.
    - All tests pass. TypeScript clean (0 errors). Preview APK built and installed on Samsung S23 Ultra.

- Session 14 continued — Security hardening (2026-04-11):
    - **Security audit**: Reviewed all keys and tokens across the codebase. Identified P0: dev auth bypass active on production Cloud Run with trivially guessable token `dev-bypass`.
    - **P0 fix — Disabled dev auth bypass on Cloud Run**: Set `DEV_AUTH_BYPASS_ENABLED=false` via `gcloud run services update`. Revision `defpedal-api-00044-skg` deployed and verified — bypass token now returns 401. No source code change needed (env var only).
    - **Remaining action items** (not yet fixed): rotate Supabase anon key (in git history from initial commit), add IP-based rate limiting to 3 unprotected endpoints (`POST /v1/hazards`, `GET /v1/risk-map`, `GET /v1/hazards/nearby`), gate dev bypass credentials out of preview/production APK builds in `app.config.ts`, activate Redis for persistent rate limiting, configure `CRON_SECRET` on Cloud Run.
- Session 15 — Google sign-in fix + code review fixes (2026-04-11):
    - **Google OAuth blank screen (3 layered issues)**:
      1. Chrome Custom Tab not dismissed after intent redirect — added `WebBrowser.dismissBrowser()` in `resolveOAuthCallback()` (warm path) and cold-start fallback in `AuthSessionProvider`
      2. Cold-start OAuth path didn't sync session into React state — added `getCurrentSession()` + `setSession()` after `exchangeCodeForSession`
      3. Added Supabase `onAuthStateChange` listener as safety net for session sync
    - **Preview APK OAuth "item not found"**: `APP_VARIANT=development` in `C:\dpb\.env` caused JS bundle to use wrong scheme (`defensivepedal-dev` instead of `defensivepedal-preview`). Intent went to dev app. Android manifest also lacked `defensivepedal-preview` scheme.
    - **Build script hardened**: `build-preview.sh` now (a) sets `APP_VARIANT` to match the Gradle flavor, (b) patches AndroidManifest.xml to add the correct deep link scheme per flavor
    - **Code review fixes**: `saved_routes` table missing `avoid_hills` column (migration applied to Supabase), `setRouteRequest` now syncs top-level `avoidHills`/`avoidUnpaved` preferences
    - **Error log**: Added entry #26 (OAuth Custom Tab blank screen) and #27 (preview APK wrong scheme)
- Session 16/17 — Codebase review fix sweep + refactors (2026-04-12):
    - **63→65 of 69 review findings fixed** (score 4/10 → 8.8/10). All P0s, P1s, and nearly all P2/P3s resolved.
    - **Security**: 3 Supabase migrations (RLS tightening, award_xp auth check, search_path hardening on 8 SECURITY DEFINER functions), avatarUrl URI validation, npm audit in CI
    - **API hardening**: Response schemas for all endpoints, structured logger, SIGTERM handler, multi-stage Dockerfile (non-root, HEALTHCHECK), JSON.parse safety, push token ErrorResponse contract
    - **Performance**: useShallow selectors in navigation.tsx, memo() on FeedCard/TripCard, hoisted Mapbox styles, gcTime on POI hooks, retryDelay backoff
    - **Auth**: 401 token refresh retry in api.ts, stale refresh token recovery in AuthSessionProvider (local signOut + anonymous fallback)
    - **UX**: WCAG AA contrast fix, community feed error+retry state, waypoint autocomplete error indicators
    - **Refactors (P2-12/P2-13)**: Extracted `queueSlice.ts` from appStore (823→574 lines). Split feed.ts (1091 lines) into 6 focused modules (feed, feed-helpers, feed-share, feed-reactions, feed-comments, feed-profile)
    - **Infrastructure**: Cloud Run redeployed (revision 00045), 982 tests passing, 0 type errors
    - **GPS Signal Indicator (P3-11)**: Color-coded dot in ManeuverCard (green/amber/red) + pulsating GPS icon when signal is poor or lost
    - **Screen Reader Accessibility (P1-21 phases 1-2)**: PoiCard/RouteInfoOverlay/MapView labels, HazardAlert live region for auto-announce
    - **Supabase migrations applied** (2026-04-13): RLS tightening, award_xp auth check, search_path hardening — all 3 live on production DB
    - **Remaining (2 items)**: P1-21 phase 3 (map contents list, deferred), P3-4 GCP monitoring (infra)
- Session 20 — Off-route fix, reroute profiles, grade indicator (2026-04-14):
    - **Segment-aware off-route detection**: Replaced vertex-only `findClosestPointIndex` with `closestPointOnPolyline` that projects GPS onto nearest line segment (perpendicular distance). Fixes false off-route triggers on straight roads with sparse polyline vertices (e.g., 10m from road but 100m from nearest vertex). Threshold lowered from 100m to 50m (accurate now). New `projectOntoSegment` uses flat-Earth approximation with cos(lat) scaling.
    - **Reroute routing profile preservation**: Reroute now uses the same routing profile as the original route. Safe→Safe, Fast→Fast, Flat→Fast. Previously, `avoidHills` (global store field) was not merged into `routeRequest` during reroute. Added `effectiveRouteRequest` in navigation.tsx.
    - **Steep grade indicator cleanup**: Removed grade percentage number from the pill (was "↑ 9.2% Steep", now "↑ Steep"). Accessibility label still includes the grade for screen readers.
    - **Tests**: +17 new tests (9 closestPointOnPolyline unit, 3 off-route regression with sparse segments, 5 reroute profile preservation). Core: 347 tests, 0 type errors.
    - **Security hardening (securityfix.md items 7-10)**:
      - #7: User-keyed rate limits verified (already per-userId via `applyRateLimit`)
      - #8: `riskCategory` string label added to API response alongside quantized score + color
      - #9: OAuth required on 4 risk endpoints (`requireOAuthUser` rejects anonymous Supabase sessions)
      - #10: Risk score thresholds moved server-side only (`RISK_BUCKETS` in `risk.ts`); client uses server-provided `riskCategory` + `color`; `RISK_CATEGORIES` with score boundaries removed from client bundle
    - **Map risk overlay**: Now uses server-provided `color` directly instead of client-side score interpolation with threshold breakpoints
    - **Cloud Run**: Revision `defpedal-api-00048-gtj` deployed with all security changes

- Session 21 — Neighborhood Safety Leaderboard (2026-04-14):
    - **Full-stack feature** implementing PRD victorwho/defpedal_mobil1#4 via 3-agent team (backend, frontend, QA)
    - **Database**: `leaderboard_snapshots` table (period_type, metric, rank, value, xp_awarded) with RLS + indexes. `get_neighborhood_leaderboard` RPC: spatial aggregation (CO2 via trip_shares+ride_impacts, hazards via hazards table), ST_DWithin 15km radius, privacy filtering (auto_share_rides), top-50 + ghost rank injection, rank delta from previous snapshot, champion flag. `check_champion_repeat_badges` RPC for cumulative wins
    - **6 new badge definitions**: Green Crown, Emerald Throne, Watchdog Crown, Guardian Shield (champion badges, tier 0), Serial Saver (5 CO2 wins, tier 1), Eternal Watchdog (10 hazard wins, tier 1). Badge count: 137 → 143
    - **API**: New `leaderboard.ts` route file. `GET /v1/leaderboard` (OAuth-only, rate-limited, full JSON schema). `POST /v1/leaderboard/settle` (CRON_SECRET-protected, idempotent XP tiered awards: #1=50/150, #2-3=30/100, #4-10=15/50, #11-50=5/20 weekly/monthly)
    - **Feed champion crown**: Feed response extended with `isWeeklyChampion` + `championMetric` from leaderboard_snapshots join. FeedCard shows gold trophy icon (Ionicons, #D4A843, 16px) after TierPill
    - **Weekly notification**: Extended with leaderboard rank + personal best detection from snapshots
    - **Types**: `LeaderboardMetric`, `LeaderboardPeriod`, `LeaderboardEntry`, `LeaderboardResponse` in contracts.ts
    - **Client**: `fetchLeaderboard()` in api.ts, `useLeaderboard` TanStack Query hook (5min stale, GPS-dependent)
    - **Design system**: `LeaderboardRow` atom (rank gold/silver/bronze, avatar, TierPill, metric value, delta arrows, champion crown, highlighted row). `LeaderboardSection` organism (metric tabs CO2/Hazards, period pills Week/Month/All, ScrollView list, ghost rank separator, loading/error/empty states)
    - **City Heartbeat integration**: LeaderboardSection rendered below Top Contributors with FadeSlideIn delay
    - **i18n**: Full `leaderboard` namespace in en.ts + ro.ts
    - **QA fixes**: CRITICAL — settle idempotency check used `data.length` (always 0 with head:true) instead of `count` property, would have duplicated snapshots on every cron run. HIGH — badge insert `.select().single()` logged false warnings on re-settlement
    - **Tests**: +24 new passing tests (18 API integration + 6 hook). 14 component tests written but blocked by pre-existing Vite/Rollup env issue
    - **Infrastructure**: Cloud Scheduler API enabled, 2 cron jobs created (weekly Monday 4AM, monthly 1st 4AM). Cloud Run revision `defpedal-api-00049-529` deployed with CRON_SECRET. Both Supabase migrations applied
    - TypeScript: 0 errors. Bundle: HTTP 200. Settle endpoint smoke test: 200 OK

- Session 23 — Navigation UX polish + profile photo upload (2026-04-15/16):
    - **End Ride button differentiation**: Changed end ride button from identical gray `close` (X) icon to distinct red (`safetyColors.danger`) background with white `stop-circle` icon. Prevents accidental ride cancellation by visual separation from the menu close button. Uses `variant="danger"` on IconButton. New `endRideButton` style in navigation.tsx stylesheet.
    - **Destination marker bullseye**: Replaced identical-shaped origin/destination dots with differentiated markers. Origin stays as small green dot (6px). Destination changed to red bullseye — 11px red outer ring + 4px white inner dot, following Google Maps convention. Distinct by size, shape, and color (satisfies `color-not-only` accessibility rule).
    - **Mapbox existing layer fix**: Added `existing` prop to all CircleLayer and LineLayer in MarkerLayers.tsx to suppress `RNMBXLayer` deprecation warning during hot reload (layer ID collision on fast refresh).
    - **Profile photo upload fix (3 layered issues)**:
      1. Native module detection used `NativeModules.ExpoImagePicker` (React Native bridge) but expo-image-picker registers as `ExponentImagePicker` via Expo Modules API — replaced with `requireOptionalNativeModule('ExponentImagePicker')` from `expo-modules-core`
      2. `expo-image-picker` was in root `package.json` but not in `apps/mobile/package.json` — Expo autolinking only reads the workspace package.json, so the native module was never compiled into the APK
      3. Upload used `fetch(asset.uri).blob()` which fails on Android `content://` URIs — replaced with `expo-file-system` new `File` class (`file.bytes()`) which properly reads local files
    - **App icon refresh**: Shrunk pedal logo 15% within adaptive icon for more breathing room. Replaced background yellow from `#D4A843` to `#F7D02A` (matching brand SVG). Updated source assets (`adaptive-icon.png`, `icon.png`), regenerated all mipmap PNGs (foreground + launcher + round, 5 densities), updated `ic_launcher_background` color and `app.config.ts` backgroundColor.
    - Bundle: HTTP 200. Phone-tested on Samsung S23 Ultra — avatar picker opens, image uploads to Supabase Storage, profile photo displays. New icon visible on home screen.

## Phase Status

### Phase 1: Shared core and backend foundation

- Status: Done
- Evidence:
  - `packages/core/src/*`
  - `services/mobile-api/src/routes/v1.ts`
  - `services/mobile-api/src/lib/*`

### Phase 2: Native route planning and preview

- Status: Largely done
- Evidence:
  - `apps/mobile/app/route-planning.tsx`
  - `apps/mobile/app/route-preview.tsx`
  - `apps/mobile/src/components/RouteMap.tsx`
  - `apps/mobile/src/components/Screen.tsx`
  - `apps/mobile/src/components/StatusCard.tsx`
  - `apps/mobile/src/lib/theme.ts`
  - elevation data fetched from server `/v1/elevation-profile` endpoint (Mapbox Terrain-RGB tiles)
  - route preview now shows a compact single-row summary with routing mode, ETA, distance, and total climb
  - client-side routing via direct Mapbox Directions (fast) and custom OSRM (safe) replaces backend dependency for route fetching

### Phase 3: Native turn-by-turn navigation

- Status: Largely done
- Evidence:
  - `apps/mobile/app/navigation.tsx`
  - `apps/mobile/src/hooks/useForegroundNavigationLocation.ts`
  - `packages/core/src/navigation.ts`
  - `apps/mobile/src/design-system/organisms/NavigationHUD.tsx` — ManeuverCard, FooterCard with "Then" strip, round control buttons
  - navigation HUD now shows current maneuver at top (standalone), "then" strip + metrics at bottom, and compact round control buttons on right rail
  - route guard transition fix allows NAVIGATING state during screen switch
  - RouteMap now uses `absoluteFillObject` for fullBleed mode so the map covers the entire screen and ManeuverCard overlays at the very top
  - all four floating control rail buttons (recenter, voice guidance, hazard report, end ride) now use a consistent `gray[800]` dark circle background at 44×44px
  - VoiceGuidanceButton compact icon wrapper resized from 48px to 44px and background changed from `rgba(255,255,255,0.12)` to `gray[800]` to match the other control buttons
- Remaining:
  - deeper physical-device validation of background/location behavior
  - final polish for spoken guidance and recovery edge cases

### Phase 4: Background and offline readiness

- Status: Largely done
- Evidence:
  - `apps/mobile/src/lib/backgroundNavigation.ts`
  - `apps/mobile/src/providers/NavigationLifecycleManager.tsx`
  - `apps/mobile/src/providers/OfflineMutationSyncManager.tsx`
  - `apps/mobile/app/offline-maps.tsx`
  - Android emulator validation now confirms active background status, persisted fix updates, and ready state for a downloaded offline route pack
  - physical Android validation now confirms:
    - `API reachable: Yes`
    - `Signed in for writes: Yes`
    - `Background location: granted`
    - authenticated queued-write drain under real connectivity loss on-device
    - locked-screen/background movement detection on-device, with a recorded movement distance of `216 m`
    - selected-route offline pack download on-device until `Offline-ready for selected route: Yes`
    - active route/map continuity on-device with both Wi-Fi and mobile data disabled
- Remaining:
  - stabilizing the Android bridgeless dev-client bundle download path so validation is running the newest JS bundle
  - iPhone/device-parity validation for background and offline behavior

### Phase 5: Scale hardening and rollout

- Status: In progress
- Evidence:
  - tests and typechecks exist
  - native auth is now wired through the mobile app
  - mobile API now enforces auth on persisted write endpoints
  - root validation scripts and GitHub Actions CI are now configured
  - Expo app variants and EAS build profiles now exist
  - Sentry/PostHog-ready mobile observability is now wired through the app shell
  - structured mobile API request telemetry is now logged for key endpoints
  - route preview and reroute responses are now cached server-side with TTL controls
  - preview, reroute, and authenticated write endpoints are now rate limited
  - Redis-backed shared cache/rate-limit storage is now available for multi-instance deployment
  - native Android emulator build now launches successfully from the short-path staging flow
  - in-app Diagnostics is reachable on the emulator and reports environment, permissions, queue/offline state, and API reachability
  - Android background navigation crash was fixed by adding `RECEIVE_BOOT_COMPLETED` to the native app permissions
  - mobile write requests now use a native `XMLHttpRequest` path on React Native instead of relying solely on `fetch`
  - the offline mutation sync manager now applies a hard watchdog timeout so queued writes cannot remain `syncing` forever in code
  - Diagnostics now surfaces queued-mutation error text and uses a timed API health probe instead of an unbounded fetch
  - Diagnostics now records queue-button press count, last attempt time, last result, and last queued trip id so Android sync validation has a visible invocation signal
  - developer sample-write queuing is now a first-class Zustand store action with test coverage instead of opaque screen-local mutation logic
  - the short-path Android validation script now starts Metro explicitly, waits for health, and keeps the staged workspace rooted in `apps/mobile`
  - Metro now blocklists the legacy web app entry, components, hooks, and services so the native bundle stays inside the mobile workspace instead of pulling `import.meta.env`-based web modules
  - the staged Metro session now bundles the mobile app successfully from the short-path copy
  - the validator now supports a release / embedded-bundle path via `npm run android:validate:native:release` to avoid depending on the bridgeless dev-client downloader
  - the release validator now forces `EXPO_NO_METRO_WORKSPACE_ROOT=1`, which fixes Expo embedded bundling for the monorepo mobile workspace
  - the validator now falls back to a fresh short-path sibling directory if the previous staging folder is still locked by Gradle artifacts
  - the mobile workspace now uses a single React version across root and mobile dependencies, which fixes the prior release-only invalid hook crash in `AuthSessionProvider`
  - the release APK now builds and installs successfully from `C:\dpm`, and the emulator reaches the live location permission prompt instead of crashing on startup
  - the Android validation script now rewrites the staged mobile API URL to `http://127.0.0.1:8080` and configures `adb reverse` so the release validator no longer depends on `10.0.2.2`
  - a local Expo config plugin now injects `android:usesCleartextTraffic="true"` into the generated manifest for validation builds that target a local HTTP API
  - the mobile request layer and Diagnostics health probe now fall back across `fetch` and `XMLHttpRequest`, which makes native emulator transport failures visible and more recoverable
  - authenticated queued-write drain is now validated end to end on the Android emulator by stopping the host API, queueing sample writes locally, restarting the API, and confirming the queue returns to `0`
  - GitHub Actions now includes a manual `Mobile Release` workflow that validates the repo and queues EAS builds with optional auto-submit
  - EAS submit defaults now target Android `internal` for preview builds and Android `production` as `draft` for production builds
  - the repo now includes a runnable `mobile-api` load-test harness with smoke, steady, and burst profiles plus JSON report output
  - the repo now includes a mobile API operations runbook covering Docker/Cloud Run rollout, Redis cutover, smoke/steady load tests, and rollback guidance
  - the local smoke load test now passes against `http://127.0.0.1:8080` and writes reports into `output/load-tests/`
  - an isolated local route-core baseline now passes smoke, steady, and burst load tests and is documented in `mobile_api_load_test_baseline.md`
- Missing:
  - production-scale Redis-backed staging load testing at target concurrency and burst levels
  - iPhone validation
  - final store-side release rehearsal on real credentials plus iPhone evidence
  - a fully working debug-mode Android dev-client launch on the emulator after the bundle downloader `ProtocolException` is resolved

## Current Focus

- Completed: native auth, authenticated mobile API writes, CI wiring, EAS build setup, baseline observability, API-side rate limiting/caching, and shared Redis-ready backing
- Completed in validation: Android emulator availability confirmed, direct long-path native build failure documented, short-path validation workflow added, Mapbox native Android build wiring fixed, app launch confirmed on emulator, diagnostics verified, background navigation crash fixed, and selected-route offline pack download verified
- Completed in validation: the Android release path now reuses the short-path workspace cleanly, builds with embedded JS, installs, and reaches the in-app permission prompt without the earlier release startup crash
- Completed in hardening: dev-only authenticated sync QA helpers are in place, including developer auth bypass, a Diagnostics sample-write queue button, queue-action instrumentation, a tested store-backed sample-write action, offline sync stale-state recovery, a sync watchdog timeout, timed Diagnostics health checks, localhost API routing through `adb reverse`, and manifest-level cleartext support for staged native builds
- Completed in hardening: Diagnostics now persists recent background fixes, summarizes detected movement while the phone was locked/backgrounded, and shows whether the selected route already has a ready offline pack
- A physical-device checklist now exists in `physical_android_validation.md`, and the Android validator supports explicit `-DeviceSerial` targeting for phones
- Completed in validation: a physical Android device now confirms Diagnostics connectivity, signed-in persisted-write eligibility, granted background location permission, queued-write drain after real on-device connectivity loss and reconnect, locked-screen movement detection, selected-route offline-pack readiness, and offline map continuity with connectivity disabled
- Completed in rollout: a manual GitHub Actions mobile-release workflow now validates the repo, queues EAS builds, and supports optional auto-submit for preview or production profiles
- Completed in rollout: the repo now has a `mobile-api` operations runbook and a runnable smoke/steady/burst load-test harness with report output
- Completed in UI parity: the native app now uses a branded dark/yellow design system, custom mobile hero headers, improved route alternative cards, branded auth/onboarding screens, and more web-aligned styling on the main planning/preview/navigation/offline/feedback flows
- Completed in UI parity: route planning and route preview now use a map-first native layout with floating top controls and a bottom-sheet panel instead of the earlier stacked-card layout
- Completed in UI parity: navigation now uses a stronger web-style overlay hierarchy, and auth/onboarding/settings/offline maps have been rebuilt away from plain scaffold cards toward modal/menu/full-screen branded surfaces
- Completed in UI parity: feedback and diagnostics now use the same branded layout language, metric tiles, and stronger CTA hierarchy instead of falling back to plain QA-style screens
- Completed in navigation stability (2026-03-23): useRouteGuard now locks once it initially passes, preventing Zustand persist hydration race from bouncing users back to route planning 1-3 seconds after starting navigation
- Completed in feedback flow (2026-03-23): fixed mobile-api missing `SUPABASE_ANON_KEY` which caused all authenticated dev-build requests to return 401; feedback submissions now reach the `navigation_feedback` table in Supabase
- Completed in feedback UX (2026-03-23): feedback screen now shows a thank-you card (🙏 emoji + gratitude message + yellow #FDD700 "Done" button) after successful submission before returning to route planning
- Completed in repo cleanup (2026-03-23): deleted unused root `index.js`; simplified `metro.config.js` by removing the legacy webapp blocklist since those source files were already deleted
- Completed in routing: client-side route fetching now calls Mapbox Directions (fast) and custom OSRM (safe) directly from the mobile app, with elevation sampling via Mapbox Tilequery for total climb calculation
- Completed in UI parity: route preview now displays a compact single-row summary (mode, ETA, distance, total climb) instead of multiple stacked cards
- Completed in UI parity: navigation HUD redesigned with standalone ManeuverCard at top, FooterCard with inline "Then" strip and metrics at bottom, and round gray control buttons (GPS recenter, end ride X) on right rail
- Completed in navigation: route guard transition fix resolves the catch-22 where starting navigation redirected back to route planning
- Completed in ride reporting: navigation now keeps the web-style right-rail hazard button, but opens a native hazard-type picker for bike-safety categories such as blocked bike lane, pothole, narrow street, dangerous intersection, aggressive traffic, and other context before queueing the same Supabase-backed `hazards` write
- Completed in schema prep: `supabase_add_hazard_type.sql` now adds a nullable `hazard_type` column plus a value check constraint for the supported mobile hazard categories
- Completed in dev workflow (2026-03-23): local development now requires `adb reverse tcp:8080 tcp:8080` for the mobile-api and `adb reverse tcp:8081 tcp:8081` for Metro when testing on a physical Android device via USB
- Completed in risk visualization (2026-03-23): new `RiskDistributionCard` component shows a distance-weighted percentage breakdown across 7 risk categories (Very safe → Extreme) with a colored stacked bar and legend. Uses `computeRiskDistribution()` from `packages/core/src/riskDistribution.ts` which calculates Haversine distances per segment and classifies by risk score thresholds
- Completed in risk visualization (2026-03-23): new `/v1/risk-segments` server endpoint accepts a GeoJSON LineString and returns risk segments via the Supabase `get_segmented_risk_route` RPC. Client-side `directPreviewRoute` now calls this endpoint after fetching routes to enrich them with risk data
- Completed in risk visualization (2026-03-23): risk distribution card appears in route preview only (inside the scrollable bottom sheet above fixed buttons); removed from navigation screen
- Completed in elevation visualization (2026-03-23): new `ElevationChart` SVG area chart component renders the per-point elevation profile in route preview, below the risk card. Uses `react-native-svg` (already in deps). New `/v1/elevation-profile` server endpoint returns the full elevation array from `getElevationProfile()`. `RouteOption` contract extended with optional `elevationProfile: number[]` field. Client-side `enrichRouteWithElevation` now fetches the profile from the server alongside the existing gain calculation
- Completed in infrastructure (2026-03-23): fixed Supabase `road_risk_data` table missing `SELECT` grant for `service_role`; replaced placeholder `SUPABASE_SERVICE_ROLE_KEY` with real JWT in mobile-api `.env`
- Completed in bicycle parking (2026-03-24): new Overpass API client (`bicycle-parking.ts`) fetches `amenity=bicycle_parking` from OpenStreetMap within a bounding box around the route. New `useBicycleParking` hook wraps the fetch in TanStack Query with 5-minute stale time. RouteMap renders parking locations as blue circle markers with "P" label via ShapeSource + CircleLayer + SymbolLayer, visible at zoom level 12+. Tapping shows a callout. Markers appear on all three screens: route planning, route preview, and navigation
- Completed in safe area (2026-03-24): replaced `SafeAreaView` from `react-native` (iOS-only, no-op on Android) with `useSafeAreaInsets` from `react-native-safe-area-context` in MapStageScreen, NavigationScreen, and Screen components. App content now properly respects the status bar and system navigation buttons on Android
- Completed in voice guidance (2026-03-24): voice guidance default changed from on to off (`voiceGuidanceEnabled: false` in appStore initial state). Compact voice toggle icon (icon-only, matching navigation screen style) added to route planning and route preview right overlay
- Completed in navigation metrics (2026-03-24): FooterCard climb metric now shows **remaining climb** that decreases in real-time as the user progresses, computed from `elevationProfile` + `remainingDistanceMeters`. Live values display as `↑X m ▼` (with down arrow), static fallback (when no elevation profile) shows `~↑X m` (with tilde prefix). New `computeRemainingClimb()` pure function added to `packages/core/src/navigation.ts`
- Completed in trip tracking (2026-03-26): new `trip_tracks` table in Supabase records GPS breadcrumbs (`gps_trail` JSONB), planned route polyline (`planned_route_polyline6`), routing mode (safe/fast), end reason (completed/stopped/app_killed), start/end timestamps, and planned distance. `NavigationLifecycleManager` samples GPS every 5 seconds during navigation and stores breadcrumbs in Zustand. On trip end, `OfflineMutationSyncManager` flushes the track to `POST /v1/trips/track`. New `TripHistoryItem` type in core contracts. New `/v1/trips/history` GET endpoint returns user's trips ordered by date
- Completed in trips screen (2026-03-26): new `/trips` screen shows a scrollable feed of all user rides fetched from `trip_tracks`. Each row shows date, distance, duration, routing mode badge (Safe/Fast), and end reason icon. Tapping a row expands it to reveal an interactive Mapbox map showing the GPS trail (blue line) and planned route (green for safe, red for fast). FlatList scroll is disabled when a trip is expanded so map gestures don't conflict with list scrolling. RouteMap extended with `trailCoordinates`, `plannedRouteCoordinates`, and `plannedRouteColor` props for rendering trip replay lines. History screen updated with "View My Trips" button navigating to `/trips`
- Completed in bottom sheet UX (2026-03-24): CollapsibleSheet footer (Start Navigation + Back to Planning buttons) now stays visible even when sheet is collapsed; only the scrollable content (route summary, risk card, elevation chart) hides when user drags down. Route planning destination selection now centers map on selected location and dismisses keyboard via `Keyboard.dismiss()`
- Completed in community feed (2026-03-27): merged community feed feature from `claude/add-grill-me-community-feed-TBegi` branch into main. Community screen now shows "Explore Feed" button navigating to `/community-feed`. Feed displays location-based shared trips with likes and comments. New files: `community-feed.tsx`, `community-trip.tsx`, `FeedCard.tsx`, `LikeButton.tsx`, `SafetyBadge.tsx`, `SafetyTagChips.tsx`, `useFeed.ts`, `safetyTagGenerator.ts`, `feedSchemas.ts`, `feed.ts` API routes. Supabase migration `202603260001_community_feed.sql` creates `trip_shares`, `trip_likes`, `trip_comments`, and `user_profiles` tables
- Completed in auto-sharing (2026-03-27): trips are now auto-shared to the community feed when navigation ends, unless user has disabled sharing. New `trip_share` queued mutation type enqueues share data (route polyline, distance, duration, elevation, safety tags) alongside trip_end. `shareTripsPublicly` toggle in Profile screen (default: on) controls auto-sharing behavior. Setting persisted via Zustand
- Completed in profile (2026-03-27): Profile screen rebuilt with user card (email + sign-in status), "About you" section with dropdown pickers for bike type (Road/City/Mountain/E-bike/Recumbent) and cycling frequency (Daily → More rarely than once per month), "Routing preferences" section with "Avoid unpaved roads" toggle (wired to OSRM `&exclude=unpaved` parameter for safe-mode routes), and "Privacy" section with share trips toggle. All preferences persisted via Zustand. Modal dropdown picker uses dark theme with yellow accent for selected option
- Completed in routing (2026-03-27): "Avoid unpaved roads" preference flows from Profile toggle → appStore → route-preview request → `directPreviewRoute()` → `fetchOsrmRoutes()` which appends `&exclude=unpaved` to the OSRM API URL when enabled. Already supported by the OSRM backend's safety profile for `surface=unpaved/gravel/dirt` OSM tags
- Completed in bottom sheet UX (2026-03-27): CollapsibleSheet footer (Start Navigation + Back buttons) now renders outside the animated sheet so it stays fixed and tappable even when the sheet is fully collapsed. PanResponder rewritten with `expandedRef` to fix stale closure bug that made drag feel resistive. Drag gesture now applies to entire sheet body, not just the handle. Handle touch area enlarged with padding for easier tapping. Sheet reduced from 70% to 65% of screen height
- Completed in layout (2026-03-27): MapStageScreen right overlay moved from `top: 34%` to `top: 50%` to prevent voice/parking buttons overlapping the search bar. Route planning footer button padding reduced so "Preview route" button sits closer to BottomNav
- Completed in profile (2026-03-27): bike type selection now auto-enables "Avoid unpaved roads" for Road bike, City bike, and Recumbent. Mountain bike auto-disables the toggle. "Other" added as a bike type option. User can always manually override the toggle afterward
- Completed in hazard alerts (2026-03-27): Waze-style hazard proximity warnings during navigation. New `useNearbyHazards` hook fetches hazards within 1km from `/v1/hazards/nearby` API (PostGIS bbox query on Supabase). Navigation screen detects when user approaches a hazard within 100m and shows a `HazardAlert` card with hazard type icon, distance, and "Still there?" Yes/No buttons. Tapping Yes increments `confirm_count`, No increments `deny_count`, passing without responding increments `pass_count`. New `hazard_validations` table tracks per-user votes (unique per hazard+user). Hazard markers shown on map as orange warning circles with "!" label via ShapeSource + CircleLayer + SymbolLayer. New Supabase migration adds `confirm_count`, `deny_count`, `pass_count`, `last_confirmed_at`, `expires_at` columns to `hazards` table
- Completed in navigation camera (2026-03-27): Google Maps-style 3D follow camera during navigation. Mapbox Camera switches to `followUserLocation` + `followUserMode: 'course'` + `followPitch: 45` + `followZoomLevel: 16` when following user. Camera auto-rotates to match travel direction (GPS heading). Native `LocationPuck` with `puckBearing="course"` replaces manual circle marker during navigation. Tapping map breaks follow (flat overview), recenter GPS button resumes 3D follow. Route planning and preview remain flat top-down
- Completed in deployment (2026-03-27): mobile-api deployed to Google Cloud Run at `https://defpedal-api-1081412761678.europe-central2.run.app` (europe-central2, same region as OSRM server). Docker image built via Cloud Build and stored in Artifact Registry. Standalone release APK built from `C:\dpb` short path (workaround for Windows 260-char CMake limit) with `newArchEnabled: false` and `APP_VARIANT=preview`. Installed as "Defensive Pedal Preview" for untethered testing without USB/Metro
- Completed in navigation UX (2026-03-28): navigation menu button now expands inline icons (History, Community, Profile) on the right rail instead of a BottomNav overlay. Tapping an icon navigates via `router.push` keeping the navigation session alive. New `navigation-helpers.ts` shared module routes "Map" tab to `/navigation` when a trip is active or `/route-planning` otherwise — all screens (history, community, profile, trips) use this helper so trips persist across tab switches
- Completed in route preview cleanup (2026-03-28): removed BrandLogo, "Defensive Pedal" / "Route preview" text, top Back button, and voice guidance button from route preview screen. Only badge row (coverage, routing mode, sync status) remains at top. Cleaner map-first layout
- Completed in route planning cleanup (2026-03-28): removed BrandLogo from route planning screen; from/destination boxes now sit higher
- Completed in bottom sheet UX (2026-03-28): PanResponder moved from entire sheet to handle-only, enabling ScrollView content to scroll freely. Added `nestedScrollEnabled` and visible scroll indicator
- Completed in hazard reporting (2026-03-28): users can now report hazards from the route planning screen via a ⚠️ button on the right rail. Tapping opens hazard type picker modal (same categories as navigation), then user taps the map to place the hazard marker. Crosshair overlay with "Tap map to place hazard" label guides placement. Data queued via same `enqueueMutation('hazard')` path as navigation reports. RouteMap extended with `onMapTap` and `hazardPlacementMode` props
- Completed in autocomplete UX (2026-03-28): Google Maps/Waze-style autocomplete results. Each suggestion now shows place name (bold) + distance badge (right-aligned, "350 m" / "1.2 km") on first row, concise local address (street + neighborhood, not full country path) on second row. No raw category text — category communicated via icon only. `AutocompleteSuggestion` enriched with `secondaryText`, `distanceLabel`, `maki` fields. `buildSecondaryText()` extracts concise context from Mapbox hierarchical address data. Expanded maki → Ionicons icon mapping. Results sorted by proximity (closest first) when user location is available
- Completed in bicycle rental (2026-03-29): new Overpass API client (`bicycle-rental.ts`) fetches bicycle rentals from OSM (`amenity=bicycle_rental`, `bicycle_rental=docking_station`, `shop=bicycle+service:bicycle:rental=yes`) excluding disused/abandoned. Dark green (#2E7D32) circle markers with "R" label at zoom 12+. Visible on all three screens. Removed onPress handlers from parking/rental layers to fix marker disappearing bug
- Completed in weather + air quality (2026-03-29): live weather widget (Open-Meteo, no API key) in route planning showing temperature, weather icon, precipitation %, wind speed, and European AQI with color-coded text. Weather warning modal in route preview for rain >50%, freezing, temp swings >5°C, wind >25km/h, poor AQI >100, high PM2.5 >25μg/m³. Air quality fetched in parallel with weather data
- Completed in basemap (2026-03-29): Shield Mode basemap using Mapbox Standard style with `StyleImport` component. Auto day/dawn/dusk/night lighting (30-min refresh). Safety-semantic road colors (red motorways, brown trunks, sandy cyclable). Hidden POI/transit labels and 3D objects. Warm gray land, steel blue water, natural green parks. Montserrat font
- Completed in map centering (2026-03-29): route planning map now centers on user GPS location instead of hardcoded Bucharest. `DEFAULT_ROUTE_REQUEST` cleared to `0,0` placeholder. Camera uses `key` prop to force re-center when coordinates change. `planningOrigin` and parking/rental hooks skip `0,0` origins. Persisted store cleared on first launch after update
- Completed in hazard visualization (2026-03-30): hazard zones now rendered as striped red/black line segments on the route during navigation. Each nearby hazard gets a ~100m segment centered on its location, rendered as a black base LineLayer (8px) + red dashed LineLayer (6px) overlay. Route midpoint + half-route-distance radius used as query center for hazard fetching instead of user-only position, covering the full route. `useNearbyHazards` radius param now passed from navigation screen based on route length
- Completed in Cloud Run redeployment (2026-03-30): fixed supabaseAdmin dynamic import failing in Docker — switched to static import already at top of v1.ts. Redeployed via `cloudbuild.yaml`. Set `SUPABASE_SERVICE_ROLE_KEY` env var on Cloud Run service. Hazards endpoint now works on production (`/v1/hazards/nearby` returns data)
- Completed in bicycle lanes (2026-03-31): new Overpass API client (`bicycle-lanes.ts`) fetches all cycling infrastructure from OSM (`highway=cycleway`, `cycleway=lane/track/shared_lane`, `cycleway:left/right=lane/track`, `bicycle=designated`) as way geometries. Teal (#4A9EAF) LineLayer at 3px width renders before route layers so routes paint on top with bike lane peeking as a subtle border. Toggle button (bicycle icon) in route planning right rail. Always visible in route preview and navigation. 10-minute TanStack Query cache. `lineEmissiveStrength: 1` for night mode resistance
- Completed in map rendering (2026-03-31): added `emissiveStrength: 1` to all overlay layers (12 LineLayer, 7 CircleLayer, 4 SymbolLayer) so route lines, risk segments, hazard zones, parking/rental markers, and origin/destination dots maintain full brightness regardless of Mapbox Standard style day/night/dawn/dusk lighting transitions. Prevents overlays from dimming in night mode
- Completed in route planning (2026-03-31): GPS recenter button now calls `refreshLocation()` to get fresh GPS fix and animates camera to new position. Previously only centered on cached location
- Completed in POI system (2026-04-01): cyclist-relevant POI markers from Mapbox vector tiles (`mapbox-streets-v8/poi_label`). Six categories: Hydration (W), Bike Shops (B), Restrooms (WC), Bike Rental (R), Bike Parking (P), Supplies (S). All rendered as brand yellow (#D4A843) circles with white text labels, `circleEmissiveStrength: 1` for night mode resistance. Each category independently toggleable from Profile → Map Layers. Visibility controlled via filter-based approach (impossible `__off__` filter when disabled) to avoid mount/unmount rendering bugs. Tappable — shows info card with type, name, and website link. Bike shops also augmented with Overpass API fallback (`shop=bicycle`, `craft=bicycle`, `amenity=bicycle_repair_station`) and broadened Mapbox filter (`shop` maki with bike-related type names). POI search via Mapbox Search Box API for additional results near user and destination
- Completed in weather (2026-04-01): weather warnings now check remaining hours only (not full day). Fetches hourly forecast data from Open-Meteo. Computes remainingPrecipMax, remainingWindMax, remainingTempMin/Max from current hour onward. Morning rain no longer triggers afternoon warning. Graceful fallback to daily aggregates if hourly data unavailable
- Completed in notifications (2026-04-01): push notification infrastructure scaffolded — `expo-notifications` installed, `NotificationProvider` created (currently disabled pending EAS project ID), `push-notifications.ts` with lazy-load pattern to avoid native module crash. Notification preferences (Weather/Hazard/Community toggles) in Profile screen. Sign-out button with confirmation dialog. Provider disabled until native rebuild with proper EAS project configuration
- Completed in developer workflow (2026-04-01): `npm run check:bundle` script validates Metro can serve the JS bundle (HTTP 200 check) before testing on phone. Catches build errors early. Project moved to `C:\dev\defpedal` short path to avoid Windows 260-char CMake path limit. `.claude/rules/bundle-check.md` added to ensure future sessions run the check after code changes
- Completed in POI system (2026-03-31): cyclist POI layers using Mapbox vector tiles (mapbox-streets-v8 `poi_label` source layer) for hydration (drinking-water, cafe), bike shops (bicycle, shop+bike type), restrooms (toilet), bike rental (bicycle-share), and supplies (convenience, grocery). Each category independently toggleable from Profile → Points of Interest. All POIs render as yellow (#D4A843) circles with dark (#1A1A1A) letter labels (W, B, WC, R, P, S) at zoom 14+. Filter-based visibility using `__off__` impossible-match pattern instead of conditional mount/unmount. Medical POI category removed
- Completed in POI enrichment (2026-03-31): Mapbox Search Box API (`/search/searchbox/v1/category/`) fetches additional POIs near user location and destination for hydration (fountain, cafe, coffee_shop), and supplies (convenience_store, supermarket, grocery). New `poi-search.ts` client and `usePoiSearch` hook with per-category TanStack Query (10-min cache). Searched POIs rendered as yellow "B" dots via separate ShapeSource with tap-to-info card
- Completed in bike shops (2026-03-31): Overpass API fallback for bike shops (`shop=bicycle`, `craft=bicycle`, `amenity=bicycle_repair_station`). Broadened Mapbox vector tile filter to match `shop` maki with bike-related type names (Bicycle, Bicycle Shop, Bike, Bike Shop, Bicycle Repair). New `bicycle-shops.ts` client and `useBikeShops` hook (only fetches when repair POI toggle is on)
- Completed in POI toggle fix (2026-03-31): POI markers now properly appear/disappear when toggled. ShapeSource layers use opacity-based hiding (circleRadius: 0, circleOpacity: 0, textOpacity: 0 when off) plus conditional rendering with `key` prop for forced remount. Searched POIs filtered by current visibility state in useMemo to handle TanStack Query cache retention
- Completed in POI categories (2026-03-31): replaced Transit POI with Bike Rental (controls both Overpass ShapeSource R markers and Mapbox vector tile bicycle-share layer). Added separate Bike Parking toggle (controls Overpass ShapeSource P markers). Profile → Points of Interest now shows: Water & Cafés, Bike Shops, Bike Rental, Bike Parking, Restrooms, Supplies
- Completed in bike lanes (2026-03-31): bike lane toggle moved from map button to Profile → Map Layers section. Bike lanes now use Mapbox vector tiles (`road` source layer filtered for cycling classes) instead of Overpass API — eliminates rate limit risk. Teal continuous line at 3px with emissive strength
- Completed in dev workflow (2026-03-31): added `npm run check:bundle` pre-flight script that verifies Metro can build the full Android JS bundle (HTTP 200 from `/index.bundle`). Catches missing modules, syntax errors, and resolution failures before they reach the phone as blank screens. Script checks Metro is running, requests the bundle with 120s timeout, and shows error details on failure. Added to root `package.json` as `check:bundle`. Run after code changes, before testing on phone
- Completed in push notifications (2026-04-01): full push notification system using Expo Push Service. Supabase tables: `push_tokens` (per user+device, upserted on app open), `notification_log` (audit trail with sent/suppressed status). Profiles extended with `notify_weather`, `notify_hazard`, `notify_community` toggles and `quiet_hours_start/end/timezone`. Server: `push.ts` Expo Push API client (send/batch/receipts), `notifications.ts` dispatch logic with category suppression and quiet hours check. New endpoints: `PUT /v1/push-token`, `DELETE /v1/push-token`, `POST /v1/notifications/send` (admin). Community triggers in `feed.ts` fire-and-forget notifications on likes and comments. Client: `expo-notifications` installed, `NotificationProvider` in AppProviders registers token on auth, handles foreground display and tap deep-linking. Profile → Notifications section with Weather/Hazard/Community toggles and Quiet Hours display (default 22:00–07:00). All preferences persisted via Zustand and synced to server
- Completed in weather warnings (2026-04-01): weather warnings now check only the **remaining hours** of the day (from current hour onward) instead of full-day aggregates. Fetches hourly forecast from Open-Meteo (`hourly=temperature_2m,precipitation_probability,wind_speed_10m`). Computes `remainingPrecipMax`, `remainingWindMax`, `remainingTempMin/Max` from hourly slices. Morning rain no longer triggers afternoon warnings. Graceful fallback to daily aggregates if hourly data unavailable
- Completed in dev workflow (2026-03-31): project moved from long path (`C:\Users\Victor\Documents\1. Projects\...`) to `C:\dev\defpedal` to permanently fix Windows 260-char CMake path limit and Metro cache issues. Debug builds now via `C:\dev\defpedal` directly. Old path junction no longer needed
- Completed in CI (2026-03-27): all TypeScript errors resolved — mobile-api test files excluded via tsconfig, feed schemas/routes fixed for ShareTripRequest type, IconButton secondary variant added, RouteMap readonly coordinate casts, NavigationHUD thenStripStandalone style added, TripCard safetyColors.warning→danger, useRouteGuard typed route cast. CI now passes green
- Completed in route-share slice 0 (2026-04-18, PR #20): web infra + universal/app-link config. New `apps/web/` Next.js 14.2.35 workspace deployed to `https://routes.defensivepedal.com` on Vercel with branded holding page, stub `/r/[code]` that 404s (slice 1 will SSR-render the viewer), and published `.well-known/apple-app-site-association` + `assetlinks.json`. Mobile `app.config.ts` declares `ios.associatedDomains` + Android `intentFilters` with `autoVerify: true` for all 3 flavors (pathPrefix `/r/`). `_layout.tsx` adds `RouteShareDeepLinkHandler` sibling to Mia parser that toasts "Route sharing coming soon" on `/r/<code>` URLs. `scripts/build-preview.sh` Step 1d idempotently patches AndroidManifest so preview/production APKs keep the intent filter after the C:\dpb sync. Root `package.json` wires `typecheck:web` into the root typecheck script. Security note: `next@14.2.35` has unfixed CVEs only patched in 15.5.15+/16.x (all affect features not used in slice 0 — middleware, rewrites, next/image, server actions); documented in `apps/web/README.md` and flagged to upgrade in slice 1+. HITL executed 2026-04-18: DNS + TLS + Vercel env vars green, Google Digital Asset Links API verified all 3 package_names with the debug-keystore SHA-256 (`FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`). iOS Universal Links **deferred** — `FILL_ME_TEAM_ID` still live in the published AASA; no runtime impact today because iOS link-tap verification is blocked on iPhone hardware (CLAUDE.md known gap). Fill in when Apple Developer seat + iPhone hardware available: replace 3 strings in `apps/web/public/.well-known/apple-app-site-association`, redeploy, Apple CDN validator will repopulate in <24h.
- Completed in route-share slice 1 — tracer bullet (2026-04-18, PR #21): planned-route share end-to-end. Core helpers `shareCodeGenerator` (base62 8-char, ~47 bits entropy), `shareDeepLinkBuilder`, `routeShareContract` (zod discriminated union on `source`; `planned` active, `saved`/`past_ride` stubbed with `z.never()`). Supabase migration `20260418150119_route_shares_slice1` creates `route_shares` table with RLS + `get_public_route_share` RPC (SECURITY DEFINER, atomic `UPDATE ... RETURNING` for view-count increment). Mobile API `POST /v1/route-shares` + `GET /v1/route-shares/public/:code` + `DELETE /v1/route-shares/:id` with schema validation + service-role writes, feature-flagged via `ENABLE_ROUTE_SHARES`. Mobile: `useShareRoute` TanStack Query mutation + `ShareRouteButton` atom wired into `route-preview.tsx`, native `Share.share` with URL fallback. Web viewer: `app/r/[code]/page.tsx` SSR (force-dynamic, no-store) fetches the public view + renders `<ShareLayout>` with `<ShareMap>` (Mapbox GL JS client component, safety-colored segments), `<ShareStatsBar>` (distance/duration/mode/safety score + sharer avatar), `<ShareCtas>` (Open-in-app universal link + Play Store CTA). Cloud Run revision `defpedal-api-00051-xyz`. Vercel production at `routes.defensivepedal.com`. `dp_share_code` attribution cookie set by server-side `page.tsx` at first render (later moved to middleware, see slice 2).
- Completed in route-share slice 2 — claim flow (2026-04-18, PR #22): invitee deep-link → claim → route-preview. Supabase migration `20260418194113_route_share_claims_slice2` creates `route_share_claims` table + `claim_route_share` RPC (idempotent with `ON CONFLICT DO NOTHING`, returns full planned-route payload + sharer display/avatar + `alreadyClaimed` flag). Mobile API `POST /v1/route-shares/:code/claim` with JWT-auth gating. Mobile deep-link parser in `_layout.tsx` extracts the code from `https://routes.defensivepedal.com/r/<code>` app-link intents, stamps it into a Zustand `pendingShareClaim` slot; `ShareClaimProcessor` provider drains the slot on next render, calls the claim API, maps the response to a `RoutePreviewResponse` via new `lib/shareClaimToPreview.ts` (handles `flat`→`safe+avoidHills` routing-mode mapping, documents empty-riskSegments gap), then `setRoutePreview` + `router.push('/route-preview')` unless `appState === NAVIGATING`. Cold-install fallbacks: `lib/installReferrer.ts` (react-native-play-install-referrer, dynamic import so vitest ESM mocks can intercept), `lib/clipboardFallback.ts` (reads first-launch clipboard only once, discards anything that isn't a route-share URL). Web `ShareCtas.tsx` Play Store CTA carries `&utm_source=share&utm_medium=web&utm_campaign=r_<code>&referrer=share=<code>` so `installReferrer.ts` can parse `share=<code>` on first app launch post-install. HITL executed 2026-04-18: Android App Links verified on device (`pm get-app-links` showed `verified`), link-tap from SMS opens the app directly, claim API round-trip confirmed in server logs. Cloud Run revision `defpedal-api-00052-pkt`.
- Completed in route-share Vercel production repair (2026-04-19): six layered deploy failures diagnosed and fixed after all slice-1+ Vercel builds silently fell through to the slice-0 error boundary. Root causes: (1) `.vercelignore` was stripping `packages/core` from the build sandbox — fixed with whitelist `packages/*\n!packages/core`; (2) `transpilePackages` alone didn't flatten zod transitive resolution on Vercel's `--workspaces=false` install — added webpack `resolve.alias` for zod; (3) tsc pass didn't honor webpack alias — added `paths` for zod in `apps/web/tsconfig.json`; (4) missing `NEXT_PUBLIC_MOBILE_API_URL` + `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` in Vercel env — added via dashboard; (5) zod `.datetime()` rejected Postgres `timestamptz`'s `+00:00` offset serialization — added `{ offset: true }` to the isoDateTime schema in `routeShareContract.ts` (affects createdAt/expiresAt/revokedAt on both record + publicView schemas); (6) Next.js 15 rejected `cookies().set()` during Server Component render — moved `dp_share_code` cookie write to `apps/web/middleware.ts` (matcher `/r/:code*`, SameSite=Lax, httpOnly=false so the slice-7 PostHog snippet can read it, 30-day max-age); (7) Next.js 15 rejected `onClick={e => e.preventDefault()}` on the "Coming to iOS" anchor (event handlers forbidden on Server Component DOM props) — replaced with `<span role="button" aria-disabled="true">` + `pointer-events: none`/`user-select: none`; (8) `apps/web/components/ShareMap.tsx` called `decodePolyline(geometryPolyline6, 6)` and swapped coords from `[lat, lon]` to `[lon, lat]` — both wrong: core's decoder takes precision as a scale divisor (default 1e6 matches the "polyline6" = 6 decimal digits convention), and already returns `[lon, lat]` (see `packages/core/src/polyline.ts:73`). Passing `6` divided lats by 6 instead of 1e6, producing values in the 7M+ range that Mapbox's `LngLat` rejects with "Invalid LngLat latitude value"; the swap then re-inverted every coordinate. Fixed by calling `decodePolyline(geometryPolyline6)` with default precision and no swap. Viewer now renders end-to-end on desktop Chrome incognito with Mapbox map + safety-colored polyline + origin (green) / destination (yellow) markers + stats panel + CTAs. Follow-up tracked in TODO.md: replace the placeholder `com.defensivepedal.mobile` Play Store link in `apps/web/components/ShareCtas.tsx:19` with the real listing before production launch.
- Completed in route-share slice 3 — ambassador rewards (2026-04-19): turns a claim into a rewarded event. DB migration `route_share_ambassador_rewards_slice3` (applied directly via MCP; file `2026041901_route_share_ambassador_rewards.sql`) seeds 3 Ambassador badges (bronze @ 1 conversion, silver @ 5, gold @ 25), adds `profiles.mia_non_cyclists_converted` INT counter, and extends `claim_route_share` RPC inside its existing SECURITY DEFINER transaction to atomically (a) award +50 XP to the invitee once per lifetime via `xp_events` action='referral_welcome', (b) award +100 XP to the inviter capped 5/calendar month via action='referral' with an inline monthly-count check, (c) evaluate Ambassador badge tier crossings on distinct-invitee COUNT across all of the inviter's shares using `ON CONFLICT DO NOTHING` on user_badges, (d) increment `mia_non_cyclists_converted` when the inviter is on an active Mia journey. Return JSONB gains a `rewards` sub-object with invitee/inviter XP deltas, new-badges arrays, `inviterUserId`, and `miaMilestoneAdvanced` flag. New `services/mobile-api/src/lib/ambassadorRewards.ts` dispatches a community-category push notification to the sharer ("Someone joined via your share! — +100 XP + Ambassador badge") with a "first 3/day high-priority bypass" over the stock 1-per-24h daily budget in `dispatchNotification`, driven by counting today's notification_log rows tagged `{kind:'referral'}`. Fastify schema on `/v1/route-shares/:code/claim` strips all inviter-side reward fields before replying (additionalProperties:false enforces it). Core contract extended with `routeShareClaimInviteeRewardsSchema` on `routeShareClaimResponseSchema`. Mobile `ShareClaimProcessor` reads rewards on 'ok' branch: enqueues invitee badges onto `pendingBadgeUnlocks` (drained by existing `BadgeUnlockOverlayManager` with 2/session + NAVIGATING-suppression), renders `XpGainToast` for the +50 welcome XP. New `/my-shares` screen stub as push-notification landing target (data.deepLink = '/my-shares'). Cloud Run revision `defpedal-api-00054-44f`. Tests: +8 ambassadorRewards unit (priority bypass, no-op on cap, badge suffix in copy), +4 route-shares integration (rewards flow, inviter-field stripping, sharerDisplayName pass-through). Total 395 mobile-api, 437 core, 12 ShareClaimProcessor — all passing. Bundle HTTP 200, typecheck green.
- Completed in auth/signup fix (2026-04-19): email signup was failing with GoTrue 500 "Database error saving new user" (error_code=unexpected_failure). Postgres logs showed `ERROR: relation "profiles" does not exist (SQLSTATE 42P01)` inside the `handle_new_user()` trigger. The trigger is SECURITY DEFINER but had no `search_path` pinned (long-standing `function_search_path_mutable` advisor warning); GoTrue runs the signup INSERT in a transaction whose search_path is `auth, pg_catalog` so the trigger body's unqualified `profiles` reference couldn't resolve. Fix: migration `2026041902_fix_handle_new_user_search_path.sql` applied via MCP — `ALTER FUNCTION public.handle_new_user() SET search_path = public, auth, pg_temp`. One-line change, no function body touched. Matches the pattern in `202604120001_set_search_path_on_security_definer.sql` which hardened other SECURITY DEFINER functions but missed this one. Unrelated to slice 3.
- Completed in Trophy Case crash fix (2026-04-19): account B (fresh user that claimed a share so `ambassador_bronze` is in their catalog) crashed when opening the Trophy Case. Server returned 200; the crash was client-side in `achievements.tsx:214` where `counts[item.badge.displayTab].total++` threw because the slice-3 seed used `display_tab='social'` which is not a member of `BadgeDisplayTab` (`firsts | riding | consistency | impact | safety | community | explore | events`). `counts['social']` was undefined. Fix: migration `2026041903_ambassador_badges_use_community_tab.sql` applied via MCP — UPDATEs the 3 ambassador rows to `category='community'` + `display_tab='community'`. Slice 3 migration file `2026041901_*.sql` also corrected in the repo so a fresh DB rebuild doesn't regress.
- Completed in account-switch cache reset (2026-04-19): after signing out of account A and signing in with account B, Trophy Case / tier card / Impact Dashboard / Mia journey tracker surfaced A's values until each individual query happened to refetch. Two layers of staleness fixed in lockstep: (1) TanStack Query keys like `['badges']`, `['tiers']`, `['mia-journey', persona]` are not user-scoped — `queryClient.clear()` on user-id change; (2) Zustand persist whitelist keeps user-scoped projections (`cachedImpact`, `cachedStreak`, `earnedMilestones`, `pendingBadgeUnlocks`, `pendingTierPromotion`, `persona`, `mia*`, `onboardingCompleted`, `cyclingGoal`, `queuedMutations`, `tripServerIds`, `activeTripClientId`, `navigationSession`, `routeRequest`, `routePreview`, `pendingTelemetryEvents`, `homeLocation`, `recentDestinations`, `pendingShareClaim`, `anonymousOpenCount`, `ratingSkipCount`) — new `store.resetUserScopedState()` action resets all of these to initial defaults while preserving true device preferences (`themePreference`, `locale`, `voiceGuidanceEnabled`, `offlineRegions`, `poiVisibility`, `showBicycleLanes`, `showRouteComparison`, `shareTripsPublicly`, `bikeType`, `cyclingFrequency`, `avoidUnpaved`, `avoidHills`, `notify*`, `quietHours*`). New `UserCacheResetBridge` provider lives inside `QueryClientProvider` AND under `AuthSessionProvider` (needs both contexts) — tracks previous user id via `useRef` and fires on X→null (sign-out) and X→Y (account switch). Skips null→X (initial sign-in) and X→X (refresh-token rotation). Verified on phone after Metro hot-reload.
- Completed in route-share slice 4 — private-profile pending follow (2026-04-19): invitees claiming a share from a private sharer now get `user_follows.status='pending'` instead of `'accepted'`. XP/badges/saved-route all still fire (PRD: access isn't gated on follow approval). DB migration `2026041904_route_share_claim_private_follow.sql` applied as `route_share_claim_private_follow_slice4`: adds `user_follows.source TEXT` column with CHECK constraint allowing NULL or `'route_share_claim'`; replaces `claim_route_share` RPC with inline `is_private` lookup + branched INSERT status + source tag. Return JSONB gains `rewards.followPending` boolean. API: Fastify schema on invitee-facing rewards accepts followPending with default false; `/profile/follow-requests` endpoint selects `user_follows.source` and emits a human `context` string ("Signed up via your shared route") when source=='route_share_claim'. Core contract: `FollowRequest.context?: string` optional field; `claimInviteeRewardsSchema` gains `followPending: z.boolean().default(false)`. Mobile: `ShareClaimProcessor` swaps toast text on first-time claim when `rewards.followPending=true` → "Shared route added. Follow request sent." (idempotent re-claims keep the standard copy); `FollowRequestItem` gains optional `context?: string` prop rendered as italic muted subtitle under the timestamp; `profile.tsx` Follow Requests section passes `request.context` through. Tests (TDD): +4 core contract (followPending accept/default/reject), +3 mobile-api route-shares (pass-through / backward-compat), +3 mobile ShareClaimProcessor (copy branches), +5 FollowRequestItem props contract. Cloud Run revision `defpedal-api-00055-xkg`.
- Completed in route-share slice 5a — saved-route source variant (2026-04-19): replaces the slice-1 `z.never()` stub for `source: 'saved'` with a real schema (`savedRouteId` uuid + `route` payload identical to planned). `past_ride` stays stubbed until a future slice delivers server-side re-planning + ghost polyline. API `createShare` branches on source: when `saved`, runs `validateSavedRouteOwnership` (SELECT `saved_routes.id, user_id` via maybeSingle with a belt-and-suspenders user_id re-check on the returned row) before code generation, then persists `route_shares.source_ref_id = savedRouteId` for analytics. Core: new `routeShareCreateSavedSchema` variant + `RouteShareCreateSaved` type. Request schema: conditional `allOf` requires `savedRouteId` when `source='saved'` and forbids it when `source='planned'`. Mobile: transient `lastLoadedSavedRouteId` slot on Zustand (NOT persisted; `setRouteRequest` clears it on any origin/destination/mode/waypoints change), `handleLoadSavedRoute` sets it after routing, `useShareRoute` reads it at share-time and auto-branches to `source='saved'` with a saved-route caption (`I saved this safer X km cycling route — open it in Defensive Pedal`). No new UI surface — the existing route-preview share button auto-emits the saved variant after a saved route is loaded. Tests: +5 core, +4 service (ownership pass/fail/not-found/DB-error). Cloud Run revision `defpedal-api-00056-sc2`. No DB migration — `route_shares.source_ref_id` exists from slice 1.
- Completed in route-share slice 6 — per-share privacy trim toggle (2026-04-19): new `apps/mobile/src/design-system/molecules/ShareOptionsModal.tsx` molecule — pre-share sheet with "Hide exact start/end address (recommended)" toggle. Defaults ON per PRD, resets each open (not persisted across shares). Short-route fallback (<400m) disables the toggle with helper text "Route too short to trim safely". Route-preview's Share button now opens the modal instead of jumping straight to native share; `handleShareConfirm` plumbs the chosen flag through `useShareRoute`. Core: new `trimEndpointsForShare(polyline, { hideEndpoints, trimMeters? })` helper that wraps the existing `trimPrivacyZone` with the 400m safeguard and returns `{ polyline, endpointsHidden, shortRouteFallback, fullLengthMeters }`. API: request schema accepts optional `hideEndpoints: boolean`; `createShare` conditionally sets `route_shares.hide_endpoints` — omitting the field preserves the DB-level default (true) so the privacy guarantee stays authoritative at the schema layer. Web viewer fix: `apps/web/components/ShareMap.tsx` now derives start/end marker positions from the trimmed polyline's first/last coord when `share.endpointsHidden=true` (previously pinned the real home/work addresses — a privacy regression the slice-1 comment correctly anticipated but the code didn't enforce). Tests (TDD): +11 core `trimEndpointsForShare` (trim effect, short-route fallback, idempotency, empty input), +3 mobile-api service (opt-in / opt-out / omitted-default). Cloud Run revision `defpedal-api-00057-twk`. No DB migration — `hide_endpoints` column, `trimmedGeometryPolyline6` precompute, and `get_public_route_share` RPC trim logic were all in place from slice 1; this slice connects the UI toggle and closes the marker-leak gap.
- Completed in route-share slice 7a — OG preview image for rich link unfurls (2026-04-20): `/r/<code>/opengraph-image` route (Next.js 15 convention) renders a 1200×630 PNG via `next/og` ImageResponse. Layout per PRD: Mapbox Static Images API render on the left 60% (uses `@defensivepedal/core` `mapboxStaticImageUrl` helper reused from the in-app image-sharing feature), stats panel on the right 40% (routing mode eyebrow, distance hero number, duration + safety-score tile, sharer avatar chip), 56px yellow brand footer across the bottom. Fallback: any non-ok share state (404/410/fetch error/missing `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`) renders a branded "This route is no longer available" card at the same 1200×630 size so any previously-scraped OG card gets visually replaced on re-scrape. Runtime `nodejs` (not edge), `revalidate=3600`, `Cache-Control: public, immutable, max-age=31536000` on the response. `generateMetadata` in `page.tsx` populates `<title>`, `og:title`, `og:description`, `og:site_name`, `og:type`, and `twitter:card=summary_large_image` from the live share (e.g. "victor shared a 6.8 km cycling route"). Next.js auto-wires `og:image` / `twitter:image` + width/height tags from the `opengraph-image.tsx` convention, with a per-deploy fingerprint query param so scrapers re-fetch after re-deploys. Verified live on share code `NX0MHjeZ`: HTML meta tags all present and populated; image endpoint returns `image/png` with the immutable cache header and `X-Robots-Tag: noindex, nofollow`. Vercel `dpl_DvConagdQSiggV2Xe55tzJrSYkTR`. Slice 7b (next-intl EN+RO) and 7c (PostHog share_view/install_cta_click/app_open_intent events) deferred as separate follow-up slices — independent of the OG card.
- Completed in route-share slice 8b post-ship fixes (2026-04-20): two on-device findings after dev APK install. (1) Require cycle in `AmbassadorImpactCard` — organism imported `useTheme` from the `..` barrel (`src/design-system/index.ts`) which re-exports organisms and closed a cycle; switched to importing from `../ThemeContext` directly to match how every other organism sources its theme. Non-fatal (RN ran anyway) but the warning was noisy in Metro. (2) "VirtualizedLists should never be nested inside plain ScrollViews" warning on `/my-shares` — the shared `Screen` wrapper renders children inside a `ScrollView`, so hosting a `FlatList` inside nested a VL in a SV of the same orientation. Refactored `my-shares.tsx` to compose `SafeAreaView` + `ScreenHeader` atom + `FlatList` directly, matching the pattern used by `community-feed.tsx` / `history.tsx`. Bundle HTTP 200, typecheck green, verified hot-reloaded on-device.
- Completed in route-share slice 8b — mobile UI + web beacon (2026-04-20): Ambassador observability surfaces + deployed backend. `gcloud builds submit` built image `sha256:c1f77f78…`, `gcloud run deploy` shipped revision `defpedal-api-00058-6m6` and then `00059-cj5` after a content-type parser fix (Fastify rejected POSTs without a Content-Type header with 415; added wildcard `addContentTypeParser('*')` on `services/mobile-api/src/app.ts` that resolves empty/unknown bodies to `undefined` so curl/scraper beacons go through the route handler cleanly — verified live with `Googlebot/2.1` UA → HTTP 200 `{bumped:false,firstView:false}`). Mobile UI: `apps/mobile/app/my-shares.tsx` replaces the slice-3 landing stub with a real `FlatList` list (per-row `shortCode`, createdAt, expiry countdown, opens/signups counters, revoked pill) + `Copy link` / `Share again` / `Revoke` actions. Revoke is optimistic via the `useMyShares` hook (removes the row from cached `['my-shares']` data immediately, rolls back on 502/auth_required). Pull-to-refresh + empty state with CTA back to `/route-planning`. `AmbassadorImpactCard` organism (`src/design-system/organisms/AmbassadorImpactCard.tsx`) renders 4-stat tile (shares sent / opens / signups / XP earned) with `hideWhenEmpty` defaulting on — rendered at the top of My Shares. `apps/mobile/src/hooks/useMyShares.ts` wraps `GET /v1/route-shares/mine` with TanStack Query (staleTime 30s) + revoke mutation with onMutate/onError/onSettled rollback and invalidation. Profile: new "Share activity feed" toggle in Account section controlling `shareConversionFeedOptin` (persisted in Zustand, synced to backend via `PATCH /profile`, surfaces on initial sync effect), and a new "My shared routes" nav row in Account section with share-social icon. `appStore.ts` gains `shareConversionFeedOptin: boolean` (default true) + `setShareConversionFeedOptin` action, added to persisted state whitelist. Core contract: `ActivityType` union extends with `'route_share_signup'`; new `RouteShareSignupActivity` interface + `RouteShareSignupPayload` interface, `ActivityFeedItem` union now includes the variant. `services/mobile-api/src/lib/activityFeedSchemas.ts` extends the Fastify response-schema type enum so the new rows flow through `get_ranked_feed` without being silently stripped (error-log #9). `ActivityFeedCard` switch handles the new type via an internal `RouteShareSignupContent` (icon + "Someone signed up via a shared route" copy). Web viewer: new `apps/web/components/ShareViewBeacon.tsx` client component POSTs `/v1/route-shares/:code/view` on mount with a `sessionStorage` de-dupe so React Strict Mode / tab-focus re-renders don't double-bump the counter. Mounted on `/r/[code]/page.tsx` on the ok branch alongside `<ShareAnalytics>`. Fire-and-forget — no UX impact if the beacon fails; server-side per-IP throttle already protects against abuse. api.ts client: `listMyShares()` + `revokeMyShare(id)` methods + `MyShareRowClient` / `AmbassadorStatsClient` / `MySharesResult` / `RevokeRouteShareResult` types. Tests: 474 core (unchanged), 424 mobile-api (unchanged), typecheck green across api+mobile+web, mobile bundle check HTTP 200. 3 pre-existing mobile test suites still fail (ConnectivityMonitor × 4, FeedCard.champion parse error, LeaderboardSection) — confirmed unrelated to slice 8 via stash-bisect. Cloud Run revision `defpedal-api-00059-cj5` live on `https://defpedal-api-1081412761678.europe-central2.run.app`.
- Completed in route-share slice 8a — backend (2026-04-20): Ambassador observability + control. Migration `2026042001_route_share_slice8.sql` (applied via MCP as `route_share_slice8_ambassador_observability`) extends `activity_feed.type` CHECK to allow `'route_share_signup'`, adds `profiles.share_conversion_feed_optin BOOLEAN DEFAULT TRUE`, creates `revoke_route_share(p_id, p_user_id)` SECURITY DEFINER RPC (owner-checked, collapses non-owner/unknown to `not_found` for anti-enumeration, idempotent on already-revoked), creates `record_route_share_view(p_code)` SECURITY DEFINER RPC (atomic `UPDATE ... RETURNING view_count` — `firstView := view_count = 1`, Postgres row lock guarantees exactly one caller observes `firstView=true` under concurrent beacons), and replaces `claim_route_share` with a new body identical to slice 4 except it inserts an `activity_feed` row of type `'route_share_signup'` with payload `{sharerUserId, inviteeUserId, shareId, routePreviewPolylineTrimmed}` when the sharer has `share_conversion_feed_optin=true` (feed row owned by sharer so followers see it). Core contract extensions: `myShareRowSchema`, `mySharesResponseSchema`, `ambassadorStatsSchema`, `routeShareViewBeaconResponseSchema`, `routeShareSignupFeedPayloadSchema` in `packages/core/src/routeShareContract.ts` + 17 new unit tests (58 total in contract). `ProfileUpdateRequest`/`ProfileResponse` gain `shareConversionFeedOptin`. API endpoints (`services/mobile-api/src/routes/route-shares.ts`): `GET /v1/route-shares/mine` (auth, returns `{shares[], ambassadorStats}` with lifetime `sharesSent/opens/signups/xpEarned` — XP summed from `xp_events WHERE action='referral'`), `DELETE /v1/route-shares/:id` (auth, owner-only via RPC, 204 on success, 404 on non-owner/unknown), `POST /v1/route-shares/:code/view` (public, UA-filtered via hardcoded `BOT_UA_PATTERNS` regex list in `routeShareService.ts`, per-IP throttled 60/min via existing `dependencies.rateLimiter` with new `publicShareView` bucket, fires-and-forgets `dispatchFirstViewNotification` when `firstView=true`). Service methods: `listMyShares`, `revokeShare`, `recordView` in `routeShareService.ts`; `isBotUserAgent` exported helper. `ambassadorRewards.ts` adds `dispatchFirstViewNotification({sharerUserId, shortCode})` — same 3/day high-priority bypass as the conversion push, `kind:'referral_view'` tag in `notification_log` so conversion + first-view budgets don't collide, title "Someone just opened your shared route", `deepLink:'/my-shares'`. Profile preferences (`PATCH /profile`) extended to accept + return `shareConversionFeedOptin` (default-true fallback on legacy rows). Tests: 424 mobile-api (was 405, +19), 474 core (was 457, +17). Typecheck green across api+mobile+web. Bot filter tested across Googlebot/Slackbot/WhatsApp/curl/python-requests/HeadlessChrome + real Chrome/Safari/mobile UAs. First-view push tested for empty-user-id no-op + 0/2/3 priority bypass. Mobile UI (slice 8b — My Shares screen, AmbassadorImpactCard, profile toggle, RouteShareSignupFeedCard) tracked as follow-up PR; backend is shippable standalone (new endpoints just aren't consumed yet). Cloud Run redeploy required to activate endpoints — pending user-triggered `gcloud builds submit`.
- Completed in route-share slice 7c — PostHog web analytics + mobile claim event (2026-04-20): three events captured on the web viewer with `{ share_code }` property so funnels join end-to-end with the mobile-side `share_claim_success`. Web: `apps/web/package.json` adds `posthog-js ^1.160.0`. New `apps/web/components/ShareAnalytics.tsx` client component reads `NEXT_PUBLIC_POSTHOG_API_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` (default `https://eu.i.posthog.com` — matches mobile default). Dynamic import of `posthog-js` keeps it out of the SSR bundle. Initializes with `person_profiles: 'identified_only'` so OG scrapers (WhatsApp/Twitter/Slack) that render preview cards don't create anonymous profiles that bill against PostHog quota. Fires `share_view` on mount; sets up a delegated `click` listener that reads `data-share-cta="<event_name>"` attributes and captures the matching event (`install_cta_click` on Google Play, `app_open_intent` on Open-in-app). Keeps `ShareCtas` as a pure Server Component — no onClick prop required, no client-component conversion (slice-1 Vercel repair #7 proved that path forbidden). `apps/web/app/r/[code]/page.tsx` mounts `<ShareAnalytics shareCode={code} />` alongside `ShareLayout` on the ok branch only; non-ok (404/410) branches don't fire analytics since the view is a dead link. `apps/web/next.config.js` switches the zod webpack alias from a hardcoded `apps/web/node_modules/zod` path to `require.resolve('zod/package.json')` — works on both Vercel (`--workspaces=false`) and local workspace installs (where zod hoists to the repo root). Mobile counterpart: `ShareClaimProcessor` imports `telemetry` and captures `share_claim_success` on the `ok` branch with `{ share_code, already_claimed, follow_pending }` so re-claims and private-sharer follow branches remain distinguishable in funnel slices. Tests (+2 new mobile): fires with correct properties on ok; does NOT fire on 404/gone/invalid/auth_required/network_error branches. 17/17 `ShareClaimProcessor` green; `@sentry/react-native` + `posthog-react-native` stubbed at test time (ESM strictness). Graceful degradation: absent `NEXT_PUBLIC_POSTHOG_API_KEY` → `ShareAnalytics` is a silent no-op, page still renders and CTAs still click through. No new user-identifiable fields leak — only `share_code` (already in the URL) is emitted; `sharer_user_id` stays server-side. Verified live on share code `NX0MHjeZ` (Vercel `dpl_AM3YMBc5AFFTmx67asSzQxavy1Ck`): both `data-share-cta` attributes present in HTML, posthog references in the /r/[code] page chunk (hash `page-9ca834075bdd9db8.js`, was `bf1dee1a` in slice 6). **User action required**: set `NEXT_PUBLIC_POSTHOG_API_KEY` (and optionally `NEXT_PUBLIC_POSTHOG_HOST`) on the Vercel project (reuse the same PostHog project key from `apps/mobile/.env` `EXPO_PUBLIC_POSTHOG_API_KEY`), then trigger a Redeploy to pick up the env var. Cookie-based distinct_id bridge (PRD's "share_code also bridged via cookie at claim time") deferred — the common flow already stitches via `share_code` property join, which covers the funnels the PRD lists. Slice 7b (next-intl EN+RO + manual toggle) still deferred as a separate follow-up slice.
- Goal:
  - keep route preview anonymous-first
  - require auth for persisted writes like trips, hazards, and feedback
  - surface auth and telemetry state clearly inside the mobile app
  - protect routing/write endpoints from burst traffic while avoiding extra client complexity
  - keep Android native validation deterministic even when the bridgeless dev client is unavailable

## Next Up

1. **Route-share slice 5 — `past_ride` source variant**: the contract discriminator still has `past_ride` stubbed with `z.never()`. Slice 5b would replace it with `tripId` + server-side re-planning + ghost polyline. Saved variant (slice 5a) already shipped.
2. **Vercel redeploy for web beacon**: `ShareViewBeacon` is a new client component on `/r/[code]/page.tsx`; next Vercel deploy picks it up automatically on push to main.
4. **Replace placeholder Play Store URL** in `apps/web/components/ShareCtas.tsx:19` with the real listing once the app ships to production. Logged in TODO.md.
5. **Defer-until-hardware — Apple Team ID for AASA**: replace 3x `FILL_ME_TEAM_ID` in `apps/web/public/.well-known/apple-app-site-association` with the real 10-char Team ID from App Store Connect → Membership Details, then redeploy. Blocked on Apple Developer seat + iPhone hardware (CLAUDE.md).
6. **Consider Next.js upgrade to 15.5.15 or 16.x** — Vercel production now runs real runtime code, so remaining 14.2.x CVEs (middleware, server components) are no longer dormant.
7. Decide whether to fix the bridgeless debug client or rely on the release validator for native QA until later.
8. Start iPhone validation on macOS hardware.
9. Deepen release automation with store-secret checks and staged-rollout operations.
10. Run production-scale steady/burst load tests against a staging environment with Redis enabled.
11. Capture fresh device screenshots for the redesigned screens, review them on a physical device, and fine-tune spacing, density, and motion based on actual Android/iPhone visual QA.
12. Add a database migration for `hazard_type` if we want every selected hazard category stored explicitly in Supabase instead of using the current compatibility fallback when that column is absent.

## Stable Baseline Program

This section tracks the repo-hardening work needed to turn the current migration state into a stable
mobile-first baseline for normal frontend and feature development.

### Baseline milestone definition

We will call the repo "stable baseline" when all of the following are true:

- the committed source tree contains the real mobile app, shared core package, and mobile API
- the default validation command is green and does not depend on unrelated legacy-web breakage
- test discovery is deterministic and excludes worktrees, temp folders, and generated output
- Android release-style validation is the documented default native QA path
- iPhone has at least one documented smoke-tested validation pass
- the backend has a staging validation path plus production-like load-test evidence
- schema changes are stored as real migrations, including the current `hazard_type` addition
- CI and release workflows are aligned with the mobile-first product path

For normal day-to-day feature work, we also recognize a softer milestone:

- "stable feature-development baseline"
  - the repo is green locally
  - the mobile-first workflow is documented
  - Android validation is dependable
  - the backend has a repeatable local load baseline
  - remaining work can be treated as release-hardening backlog instead of repo-foundation instability

### Phase 0: Capture the real repo state

- Status: Done
- Evidence:
  - `codex/mobile-current-snapshot` now contains the committed mobile-first repo snapshot
  - the stabilization worktree now runs on top of that committed snapshot instead of the earlier pre-migration commit
- Notes:
  - the snapshot intentionally excluded local-only files such as `.env`, `apps/mobile/.env.preview`, `services/mobile-api/.env`, generated `output/`, `tmp/`, and ignored native build artifacts

### Phase 1: Build and CI determinism

- Status: In progress
- Checklist:
  - completed: separate the default mobile validation path from legacy web build conflicts
  - completed: resolve the root entrypoint collision between the Vite web build and Expo Router mobile entry
  - completed: introduce explicit validation scripts such as `validate:mobile` and `validate:web`
  - completed in branch behavior: CI and release workflows now inherit the stable validation path through `npm run validate`
  - completed: exclude worktree/helper folders from test discovery by constraining Vitest to source roots and excluding `.claude`, `.expo`, `output`, and `tmp`
  - remaining: confirm one green CI run on the stabilization branch
- Exit criteria:
  - one local green validation run
  - one green CI run on the stabilization branch

### Phase 2: Repo shape and developer workflow

- Status: In progress
- Checklist:
  - completed: make root scripts clearly favor `dev:mobile`, `dev:api`, and native validation
  - completed: tighten `.gitignore` to avoid noisy runtime artifacts and staging leftovers
  - completed: refresh `README.md`, `CONTEXT.md`, and related docs around the mobile-first happy path
  - completed: define the legacy web app as an opt-in reference surface instead of the default workflow
  - remaining: sanity-check the updated workflow docs against one clean onboarding pass
- Exit criteria:
  - a new contributor can follow one documented happy path from install to native validation

### Phase 3: Schema and backend readiness

- Status: In progress
- Checklist:
  - completed: move active loose SQL changes into a real migration folder and naming convention
  - completed: add the `hazard_type` change as an ordered migration path
  - completed: document staging deployment inputs and migration prerequisites in the backend operations docs
  - completed: align repo docs so the backend contract now points to the ordered migration path for `hazard_type`
  - remaining: recover or replace the corrupted legacy root SQL blobs if they still matter operationally
- Exit criteria:
  - schema updates are tracked and re-runnable
  - backend staging path is documented and testable

### Phase 4: Native validation and release readiness

- Status: In progress
- Checklist:
  - completed: keep Android release-style validation as the supported default path for now
  - completed: treat bridgeless debug-client recovery as backlog unless it is proven to block developer velocity
  - completed: deepen release workflow guardrails for secrets, environment checks, and rollout sanity
  - completed: add `iphone_validation.md` as the canonical record for the first in-repo iPhone smoke pass
  - remaining: run and document one iPhone smoke-validation pass on macOS hardware
- Exit criteria:
  - remaining: Android and iPhone each have one documented smoke-tested path
  - completed: preview release workflow has a documented preflight and rollback path

### CO2 Savings Calculator (2026-04-02)

- Status: Done
- Evidence:
  - `packages/core/src/co2.ts` — calculateCo2SavedKg, formatCo2Saved, calculateEquivalentTreeDays, calculateTrailDistanceMeters (EU avg 120g CO2/km)
  - `packages/core/src/co2.test.ts` — 22 unit tests covering all functions
  - `packages/core/src/contracts.ts` — UserStats type, co2SavedKg field on FeedItem
  - `services/mobile-api/src/routes/v1.ts` — GET /v1/stats endpoint (cumulative user stats)
  - `services/mobile-api/src/lib/submissions.ts` — getUserStats via Supabase RPC, actual_distance_meters stored on trip save
  - `services/mobile-api/src/routes/feed.ts` — co2SavedKg computed in feed item mapper
  - `services/mobile-api/src/lib/feedSchemas.ts` — co2SavedKg added to JSON Schema (prevents Fastify stripping)
  - `apps/mobile/src/design-system/atoms/Co2Badge.tsx` — reusable leaf + CO2 display component
  - `apps/mobile/src/design-system/organisms/TripCard.tsx` — CO2 from actual GPS trail distance
  - `apps/mobile/src/components/FeedCard.tsx` — CO2 Saved stat in community feed cards
  - `apps/mobile/app/history.tsx` — "Your Impact" card (trips, km cycled, CO2 saved, tree-days)
  - `apps/mobile/app/navigation.tsx` — shares actual GPS distance to community feed
  - `supabase/migrations/202604020001_user_trip_stats.sql` — get_user_trip_stats RPC
  - `supabase/migrations/202604020002_actual_distance_meters.sql` — actual_distance_meters column + updated RPC
- Key decisions:
  - CO2 = distance_km × 0.12 kg (EU avg 120g/km for cars, ~0g for cycling)
  - Uses actual GPS trail distance via haversine sum, falls back to planned route distance
  - Stats RPC uses COALESCE(actual_distance_meters, planned_route_distance_meters) for backwards compatibility
  - "Your Impact" card placed in History tab (not Profile) per user preference
  - API deployed to Cloud Run (revision defpedal-api-00006-rmg)

### Phase 5: Staging and handoff

- Status: In progress
- Checklist:
  - completed locally: capture repeatable route-core smoke, steady, and burst evidence in `mobile_api_load_test_baseline.md`
  - completed: declare the stable feature-development baseline milestone in this tracker
  - completed: list the remaining backlog items that should not block normal feature work
  - remaining: run staging smoke, steady, and burst load tests with Redis enabled
- Exit criteria:
  - completed for feature work: stable feature-development baseline is explicitly declared
  - remaining for release hardening: Redis-backed staging evidence and iPhone validation

### React Native Performance Optimizations (2026-04-07)

- Status: Done
- Changes:
  - Hoisted Mapbox layer styles to module scope (7 layer files: RouteLayers, HazardLayers, MarkerLayers, SearchedPoiLayer, VectorTileLayers, HistoryLayers, OverpassPoiLayers)
  - Used `useShallow` for batched Zustand selectors in profile.tsx (consolidated 27 selectors into 2)
  - Wrapped `data?.pages.flatMap()` in useMemo for stable array references (community-feed.tsx)
  - Extracted renderItem to useCallback, moved StatTile outside component (community-trip.tsx)
  - GPU-accelerated scaleX animation with useNativeDriver:true (BadgeProgressBar.tsx)
  - Added `borderCurve: 'continuous'` for iOS squircle corners (Card, Button, TripCard, FeedCard, Modal)
- UX improvements:
  - Moved trip list below stats dashboard in History screen (better information hierarchy)
  - Added confirmation dialog to "End Ride" button (prevents accidental trip cancellation)
  - Added global ErrorBoundary for crash recovery (ErrorBoundary.tsx wraps entire app in _layout.tsx)
- Translations: Added en/ro strings for End Ride confirmation and error boundary
- Evidence: All changes verified on phone via Metro hot reload

### Unified ScreenHeader Atom (2026-04-08)

- Status: Done
- Changes:
  - **ScreenHeader atom** (`apps/mobile/src/design-system/atoms/ScreenHeader.tsx`): 4 variants — `back` (yellow circle chevron), `close` (X button), `brand-logo` (logo + title/subtitle card), `title-only` (centered text)
  - **Screen wrapper** updated with `headerVariant` prop (defaults to `brand-logo`); nav-style headers fixed above scroll, brand-logo scrolls with content
  - **7 screens migrated** from ad-hoc inline headers to unified ScreenHeader:
    - `faq.tsx` → Screen + `back`
    - `daily-quiz.tsx` → Screen + `close`
    - `achievements.tsx` → SafeAreaView + ScreenHeader `back`
    - `impact-dashboard.tsx` → SafeAreaView + ScreenHeader `back`
    - `user-profile.tsx` → SafeAreaView + ScreenHeader `back`
    - `trip-compare.tsx` → SafeAreaView + ScreenHeader `back`
    - `auth.tsx` → SafeAreaView + ScreenHeader `close`
  - **Profile layout**: user card (sign-in/avatar) moved above badges, sign-out button moved to bottom of Account section
  - Map screens excluded (route-planning, route-preview, navigation) — use MapStageScreen
  - BackButton atom retained for floating map buttons (trip-map.tsx)
  - Exported from `atoms/index.ts` barrel
- Evidence: Bundle check passing, verified on phone via Metro hot reload

### Search UX Improvements (2026-04-07)

- Status: Done
- Changes:
  - **Recent Destinations**: Last 10 selected destinations shown when focusing empty destination search field
    - `RecentDestination` type in `packages/core/src/contracts.ts` (extends AutocompleteSuggestion with selectedAt)
    - `recentDestinations` state + `addRecentDestination` action in Zustand store (persisted)
    - De-duplicates by coordinates (most recent wins), max 10 items
    - Display with clock icon and "Recent" header in SearchBar dropdown
    - Wired to destination SearchBar in route-planning.tsx
  - **No Results Message**: Shows "No matches yet. Keep typing or try a nearby landmark." when search returns empty (previously dropdown was hidden)
    - Fixed `showSuggestions` logic to include `hasSearchedWithNoResults` condition
- Translations: Added `search.recent` key in en.ts ("Recent") and ro.ts ("Recente")
- Evidence: Verified on phone via Metro hot reload

### Navigation Remaining Distance / ETA Fix (2026-04-13)

- Status: Done
- Bug: `remainingDistanceMeters` and `remainingDurationSeconds` in `getNavigationProgress` were systematically too low — missing the current step's distance/duration segment. The error was proportionally small early in a ride but grew near the end, and caused visible upward jumps when steps advanced.
- Root cause: `futureSteps = route.steps.slice(currentStepIndex + 1)` skipped the current step's `distanceMeters` (the segment from the approaching maneuver to the next maneuver). Duration used a broken `progressThroughStep` ratio that divided distance on the previous step's segment by the current step's total length (mixing two different segments).
- Fix in `packages/core/src/navigation.ts`:
  - Distance: added `currentStep.distanceMeters` to the remaining sum
  - Duration: replaced broken progress ratio with `timeToManeuverSeconds` estimated from the previous step's pace, plus `currentStep.durationSeconds` + future steps
- Tests: 2 new tests in `navigation.test.ts` — verifies current step inclusion and monotonic decrease across step advance
- Evidence: 984 tests passing (core: 284), 0 type errors

### Fix: Third Waypoint Search Box Disappearing (2026-04-13)

- Status: Done
- Bug: After navigating away from route-planning (e.g., to route-preview) and returning, tapping "Add stop" for a new waypoint showed no search box. The pending waypoint search bar never rendered.
- Root cause: `waypointQueries` is local React state initialized as `[]` on every mount, but `waypoints` persists in Zustand across screen transitions. After remount with 2 persisted waypoints, `handleAddStop` pushed one empty string making `waypointQueries.length = 1`, but the pending search condition `waypointQueries.length > waypoints.length` (i.e., `1 > 2`) was false.
- Fix: `handleAddStop` now pads `waypointQueries` to match persisted `waypoints.length` before appending the new empty entry.
- File: `apps/mobile/app/route-planning.tsx`
- Evidence: 0 type errors

### Fix: Remaining Climb/Descent Indicator Bugs (2026-04-13)

- Status: Done
- P2-1: `!navigationSession?.remainingDistanceMeters` treated `0` as falsy (JS `!0 === true`), causing the climb indicator to briefly fall back to total route climb instead of live `↑0 m` when exactly at a maneuver. Fixed: changed to `== null` check.
- P2-2: FooterCard compared static total route descent against live remaining climb — as remaining climb decreased during the ride, the label flipped to "Descent ↓(total)m" prematurely. Fixed: added `computeRemainingDescent` (mirror of `computeRemainingClimb`) so both values are live-remaining, making the comparison apples-to-apples.
- Files: `packages/core/src/navigation.ts` (new `computeRemainingDescent`), `apps/mobile/app/navigation.tsx` (both fixes), `packages/core/src/navigation.extended.test.ts` (8 new descent tests)
- Evidence: 1015 tests passing (core: 315), 0 type errors
- Regression test file: `packages/core/src/navigation.regression.test.ts` — 23 comprehensive tests across all 3 fixes (walk-through, monotonic decrease, edge cases, climb/descent symmetry, full ride simulation)

### Fix: Post-Ride XP Always Shows Zero (2026-04-13)

- Status: Done
- Bug: Post-ride impact card always showed 0 XP earned, regardless of trip length.
- Root cause: `GET /v1/rides/:tripId/impact` hardcoded `xpBreakdown: []` and `totalXpEarned: 0`. It read cumulative XP from `profiles` but never queried ride-specific XP from `xp_events` (where the POST endpoint writes via `award_ride_xp` RPC with `source_id = tripId`).
- Fix: GET handler now queries `xp_events` for rows matching `source_id = tripId`, builds `xpBreakdown` array and sums `totalXpEarned` from the log.
- File: `services/mobile-api/src/routes/v1.ts` (GET `/rides/:tripId/impact` handler)
- Evidence: 420 API tests passing, 0 type errors
- Deployed: Cloud Run revision `defpedal-api-00046-lpc` (2026-04-13)

### Fix: Destination Field Shows 0.0000, 0.0000 by Default (2026-04-13)

- Status: Done
- Bug: Route planning destination search field initialized to `0.0000, 0.0000` (the default sentinel coordinate) instead of being blank.
- Root cause: `destinationQuery` state initialized via `formatCoordinateLabel(routeRequest.destination)` which formatted the default `{lat: 0, lon: 0}` as `"0.0000, 0.0000"`.
- Fix: Added `isDefaultCoordinate` helper; destination field initializes to `''` when destination is `{0, 0}`. Also prevents a wasted reverse-geocode API call for default coordinates.
- File: `apps/mobile/app/route-planning.tsx`
- Evidence: 1015 tests passing (core: 315, mobile-api: 210, mobile: 490), 0 type errors, verified on phone

### Feat: Steep Grade Indicator During Navigation (2026-04-13)

- Status: Done
- Feature: Compact pill indicator appears above the footer card during navigation when the rider is on a steep road segment. Uphill >= 8% shows amber pill with trending-up icon and "Steep" label. Downhill >= 7% shows red pill with trending-down icon and "Steep" label. Hidden when grade is below thresholds or when off-route.
- Core: `computeCurrentGrade()` in `packages/core/src/navigation.ts` — computes road grade (%) at rider's position from elevation profile (rise/run per segment, one-decimal precision)
- UI: `SteepGradeIndicator` component in `apps/mobile/src/design-system/organisms/NavigationHUD.tsx` — pill with Ionicons trending icon, accessible label
- Integration: `currentGrade` useMemo in `apps/mobile/app/navigation.tsx` — live grade from elevation profile + remaining distance, suppressed when off-route
- Tests: 15 new tests in `packages/core/src/navigation.extended.test.ts` covering edge cases, threshold detection, segment selection, clamping, precision
- Evidence: 1030 tests passing (core: 330, mobile-api: 210, mobile: 490), 0 type errors, verified on phone

### Security: Risk Score IP Protection (2026-04-13)

- Status: Done (P0 fixes deployed)
- Threat: External actors could scrape risk segment scores via unauthenticated API endpoints to reverse-engineer the safety scoring algorithm
- P0 fixes applied:
  1. Quantized `riskScore` to 7 bucket midpoints (was raw float — e.g. 54.2 → 55). Client still works; attacker gets only 7 distinct values
  2. Auth required on `/v1/routes/preview`, `/v1/routes/reroute`, `/v1/risk-segments` (were fully open)
  3. Auth required + rate limiting always applied on `/v1/risk-map` (was open with zero rate limiting)
  4. Rate limiting keyed on userId (was IP-only, trivially bypassed with proxies)
- Files: `services/mobile-api/src/lib/risk.ts`, `services/mobile-api/src/routes/v1.ts`, test files updated
- Security tests: 22 new tests in `services/mobile-api/src/__tests__/security-risk-ip.test.ts`
- Evidence: 1052 tests passing (core: 330, mobile-api: 232, mobile: 490), 0 type errors
- Deployed: Cloud Run revision `defpedal-api-00047-cjs` (2026-04-13)
- Verified: curl to production returns 401 for unauthenticated `/routes/preview` and `/risk-map`
- Tracking: `securityfix.md` has full fix list (P0 done, P1/P2 open)

### Fix: Post-Ride Impact Stats Inflated When Rider Didn't Move (2026-04-13)

- Status: Done
- Bug: Post-ride impact screen showed CO2, microlives, and money stats based on planned route distance even when the rider started a ride and immediately ended it without moving.
- Root cause: `initialImpact` in `feedback.tsx` fell back to `routeDist` (planned route distance) when `trailDist` (GPS trail) was 0. This inflated all derived stats.
- Fix: Always use actual GPS trail distance. No movement = zero stats.
- File: `apps/mobile/app/feedback.tsx`

### Fix: Always Show Remaining Climb in Navigation Footer (2026-04-13)

- Status: Done
- Change: Navigation footer was flipping between "Climb ↑X m" and "Descent ↓X m" based on which was greater. Now always shows remaining climb (total ascent from current position to route end).
- File: `apps/mobile/src/design-system/organisms/NavigationHUD.tsx`

### Feat: Social Network Expansion — Public Profiles, Follow System, Unified Activity Feed (2026-04-17, GitHub #7)

- Status: Done
- Scope: 34 files changed, 5836 insertions. 19 new files, 14 modified. 5 Supabase migrations. Cloud Run revision `defpedal-api-00051-q9c`.
- **Database (5 migrations)**:
  - `activity_feed` table: unified feed with 5 types (ride, hazard_batch, hazard_standalone, tier_up, badge_unlock), JSONB payload, geography location, GIST spatial index
  - `activity_reactions` table: replaces `feed_likes` + `trip_loves` with unified (activity_id, user_id, reaction_type) unique constraint
  - `activity_comments` table: replaces `feed_comments`, references activity_feed
  - `user_follows` table: added `status` column (pending/accepted) to existing table, self-follow CHECK constraint, update policy for approve flow
  - Profile changes: `is_private` boolean (default false), `auto_share_rides` default changed to true, `trim_route_endpoints` default changed to true for new users
  - `get_ranked_feed` RPC: blended feed (own posts + followed users any distance + nearby strangers within 50km). Scoring: `recency_decay * (type_weight + follow_boost + own_demotion + reaction_score + comment_score + proximity_score)`. 12h half-life decay. Private profile exclusion. Cursor pagination on (score, id).
  - `get_suggested_users` RPC: nearby active riders within 15km in last 30 days, ranked by mutual follows then activity count, excludes already-followed
  - `get_user_public_profile` RPC: fixed jsonb_agg bug, migrated from trip_shares to activity_feed, added followStatus/isPrivate fields
  - Backfill migration: 116 trip_shares migrated to activity_feed (type=ride), 6 reactions + 1 comment preserved, old tables archived (not dropped)
- **API (5 new files, 2 modified)**:
  - `follow.ts`: POST /users/:id/follow (public=instant accept, private=pending + push notification), DELETE /users/:id/follow, POST /users/:id/follow/approve, POST /users/:id/follow/decline, GET /profile/follow-requests, GET /feed/suggested-users
  - `activity-feed.ts`: GET /v1/v2/feed (ranked feed via RPC), POST /v1/v2/feed/:id/react (like/love), DELETE /v1/v2/feed/:id/react/:type, GET/POST comments
  - `autoPublish.ts`: auto-publish service with 5 functions — autoPublishRide (respects auto_share_rides, trim_route_endpoints 200m, private profile skip), autoPublishHazardBatch, autoPublishHazardStandalone, autoPublishBadgeUnlock, autoPublishTierUp
  - `v1.ts`: wired auto-publish fire-and-forget calls into ride impact handler (ride + hazard batch + badges + tier promotion) and hazard submit handler (standalone hazards)
  - `feed-profile.ts`: removed old simple follow/unfollow (moved to follow.ts), added is_private to profile PATCH/GET
  - `feedSchemas.ts`: added isPrivate to profile request/response schemas
  - `followSchemas.ts`, `activityFeedSchemas.ts`: new JSON schemas
- **Core types (2 modified)**:
  - `contracts.ts`: 15+ new types — ActivityFeedItem discriminated union (5 variants with typed payloads), ActivityFeedResponse, FollowStatus, FollowRequest, SuggestedUser. Updated UserPublicProfile (followStatus, isPrivate), ProfileUpdateRequest, ProfileResponse
  - `polyline.ts`: `trimPolylineEndpoints(encoded, trimMeters)` — trims first/last N meters for privacy. 6 tests in polyline.test.ts
- **Mobile — Components (5 new)**:
  - `FollowButton` atom: 3 states (Follow/Requested/Following), 32px pill
  - `SuggestedUserCard` molecule: 140px compact card for horizontal scroll
  - `FollowRequestItem` molecule: approve/decline row with avatar + tier pill
  - `ActivityFeedCard` organism: discriminated union renderer for all 5 activity types (ride map, hazard batch chips, hazard standalone, tier mascot, badge icon), shared header + ReactionBar
  - `SuggestedUsersRow` organism: horizontal scroll, session-dismissable, FadeSlideIn animation
- **Mobile — Hooks & API (4 new, 1 modified)**:
  - `useActivityFeed.ts`: useActivityFeedQuery (infinite scroll ranked), useActivityReaction (optimistic like/love), useActivityComments, usePostActivityComment
  - `useFollow.ts`: useFollowUser, useUnfollowUser, useApproveFollowRequest, useDeclineFollowRequest, useFollowRequests, useSuggestedUsers
  - `api.ts`: 11 new methods (getActivityFeed, reactToActivity, unreactToActivity, getActivityComments, postActivityComment, approveFollowRequest, declineFollowRequest, getFollowRequests, getSuggestedUsers, updated followUser response type)
- **Mobile — Screens (2 modified)**:
  - `community-feed.tsx`: replaced old FeedCard/useFeedQuery with ActivityFeedCard/useActivityFeedQuery, SuggestedUsersRow injected every 10 items, merged data array with discriminated union rendering
  - `profile.tsx`: added Private Profile toggle (SettingRow), Follow Requests section with count badge + FollowRequestItem list (visible when isPrivate=true)
- **Tests**: 62 new API tests (follow-system: 20, activity-feed: 25, auto-publish: 17), 6 polyline tests. Fixed latent v1.test.ts mock issue (vi.restoreAllMocks → vi.clearAllMocks). Total: 677 passing (345 core + 332 API)
- Evidence: Typecheck 0 errors, bundle HTTP 200, all 677 tests passing, verified on phone via Metro hot reload

### Feat: Image-Based Social Sharing — Strava-Style Shares Across 6 Surfaces (2026-04-17, GitHub #8)

- Status: Done
- Scope: Five-phase implementation replacing text `Share.share({message})` with image-based sharing (1080×1080 PNG + caption) on post-ride hero, trip history, community trip detail, milestone modal, badge detail modal, and Mia level-up overlay.
- **Phase 1 — Pure core modules** (`packages/core/src/`):
  - `sharePrivacy.ts`: `trimPrivacyZone(coords, trimMeters=200)` with linear interpolation at exact 200m cut points, unchanged-return for routes shorter than 2×trim
  - `mapboxStaticImageUrl.ts`: builds Mapbox Static Images API URLs with GeoJSON path overlays (short routes) and encoded-polyline fallback (long routes >8192 chars), retina + styleId + risk segments
  - `shareCaption.ts`: `buildShareCaption({type: 'ride'|'milestone'|'badge'|'mia', ...})` — always English regardless of locale
  - 38 new unit tests (`sharePrivacy.test.ts`, `mapboxStaticImageUrl.test.ts`, `shareCaption.test.ts`)
- **Phase 2 — Mobile infra** (`apps/mobile/src/`):
  - `providers/OffScreenCaptureHost.tsx`: context provider with a hidden 1080×1080 mount, `useCaptureHost().capture(node, {width, height})` returns a PNG file URI via `captureRef`
  - `lib/shareImage.ts`: `shareImage(uri, caption)` wraps `Sharing.shareAsync` + `MediaLibrary.saveToLibraryAsync`, handles cancellation as non-error, `NativeModules` guard prevents crash on unrebuilt APK (Error #23 pattern)
  - `hooks/useShareRide.ts`: composes `trimPrivacyZone` → `mapboxStaticImageUrl` → `captureHost.capture(<RideShareCard/>)` → `shareImage`, gated on `useConnectivity().isOnline` (toast on offline)
  - Added `react-native-view-shot`, `expo-sharing`, `expo-media-library` to `apps/mobile/package.json` (via `npx expo install` for SDK 55 compat)
  - 13 new tests
- **Phase 3 — `RideShareCard`** (`apps/mobile/src/components/share/`):
  - 1080×1080 `forwardRef<View>` component: brand header + Mapbox static map image + 5 stat tiles (distance, duration, CO₂, safety, microlives) + "defensivepedal.com" footer
  - Conditional tile rendering for optional fields; deterministic (no animations) for offscreen capture
  - 12 new tests
- **Phase 4 — Card upgrades**:
  - `MilestoneShareCard`, `BadgeShareCard`, `MiaShareCard` now accept `variant?: 'preview' | 'capture'` (default preview) and forwardRef<View>. `capture` variant is 1080×1080 branded card.
  - Removed internal `Share.share` calls and inline share buttons. Cards are now pure presentational; consumers (modals) own share actions.
  - 44 tests across the three card suites
- **Phase 5a — Ride surfaces**:
  - `app/feedback.tsx`: "Share this ride" button above Continue on impact step; passes GPS trail + risk segments + stats to `useShareRide`
  - `app/trips.tsx`: share icon on each trip card; falls back to decoded polyline if GPS trail missing
  - `app/community-trip.tsx`: share button decodes `geometryPolyline6` and shares with origin/destination text labels
  - i18n: `share.shareRide`
- **Phase 5b — Card surfaces**:
  - `hooks/useShareCard.ts`: unified card share hook (no offline gating for cards); captures card element + calls `shareImage` + `buildShareCaption`
  - `design-system/organisms/BadgeDetailModal.tsx`: removed `Share.share`, wired to `useShareCard({type:'badge'}, card: <BadgeShareCard variant="capture"/>)`
  - `design-system/organisms/MiaLevelUpOverlay.tsx`: added Share CTA button; `_layout.tsx` wires `useMiaJourney()` stats into the overlay so the share card has live data
  - `app/feedback.tsx` milestone modal: replaced `Share.share` with `useShareCard({type:'milestone'})`
  - i18n: `share.shareLevelUp`
  - 6 hook tests
- **Out of scope per PRD (kept as text)**:
  - `route-planning.tsx` hazard alert share — stays text for speed
  - `profile.tsx` Mia referral link share — stays text (it's a deep-link URL, not an achievement)
- **Cumulative test impact**: +113 tests. Core 345 → 383. Mobile 612 → 649 passing (pre-existing 4 failures unchanged: ConnectivityMonitor x3, FeedCard.champion, LeaderboardSection).
- Evidence: `npm run typecheck` passes (0 errors), `npm run check:bundle` HTTP 200.
- **Dev APK rebuild required** to activate the 3 new native modules: `cd apps/mobile/android && ./gradlew installDevelopmentDebug`. Until then, `shareImage` fails soft with a guarded warning (Error #23 pattern, same as offline NetInfo).
