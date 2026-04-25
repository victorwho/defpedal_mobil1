# Changelog

## 2026-04-25 — Strip AD_ID Permission for Play Store Compliance (v0.2.21)

### Behavior
- **`com.google.android.gms.permission.AD_ID` removed from the shipped manifest.** The app does not run ads or read the Android advertising ID, so the permission was being added transitively by `play-services-measurement-api` (pulled in by Firebase Messaging) without justification. Keeping it would have forced a "Yes" answer in the Play Store **Data Safety → Advertising ID declaration** form. With the permission stripped, the app can declare "No" and pass review without an ads section.
- `android.permission.ACCESS_ADSERVICES_AD_ID` is intentionally retained — it is the Android 13+ AdServices permission used by Firebase Messaging to mint IID tokens for FCM, and is *not* what triggers the Play Store advertising-id question. Removing it would risk breaking push tokens on certain devices.

### Files
- `apps/mobile/app.config.ts` — added `android.blockedPermissions: ['com.google.android.gms.permission.AD_ID']` so any future `expo prebuild` regenerates the manifest with the merge directive baked in. This is the durable source-of-truth fix.
- `apps/mobile/android/app/src/main/AndroidManifest.xml` — added explicit `<uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove"/>` so the merge directive applies for the current build (the project ships with a checked-in `android/` folder and the build pipeline does not run `expo prebuild`, so `blockedPermissions` alone would not have stripped the permission until a regeneration). Note: this file is gitignored and not in source control — the durable answer lives in `app.config.ts`.
- `apps/mobile/android/app/build.gradle` — `versionCode 22 → 23`, `versionName "0.2.20" → "0.2.21"`.

### Verification
- `manifest-merger-preview-release-report.txt` shows the directive REJECTED 4 library contributions: `play-services-measurement-api`, `play-services-measurement-impl`, `play-services-ads-identifier`, `play-services-measurement-sdk-api`.
- Final `packaged_manifests/.../AndroidManifest.xml` contains only the desired permission set (no `com.google.android.gms.permission.AD_ID`).
- Bonus iOS additions in the same `app.config.ts` change: `NSAppTransportSecurity` exception for the OSRM IP `34.116.139.172` (HTTP-only routing endpoints) and `NSPhotoLibraryUsageDescription` / `NSPhotoLibraryAddUsageDescription` for the image-based share-card flow shipped in session 25. These were already staged in the working tree from prior iOS prep and are now committed alongside.
- `npm run typecheck` clean across mobile + web + api workspaces.

### Release
- AAB built via `npm run bundle:production` → `C:\dev\defpedal\apkreleases\DefensivePedal-Production-v0.2.21.aab` (103 MB).
- Signing cert verified: `Owner: CN=Victor Rotariu, OU=Defensive Pedal, ...` (upload keystore, valid through 2056). Not debug-signed.
- Target track: Google Play closed testing.
- Commit `93eb93c` on `main`.

## 2026-04-22 — Signup Gate Threshold + Hardware-Back Hardening

### Behavior
- **Mandatory signup now triggers at the 3rd anonymous app launch** (was 5th). The dismissible prompt at launch #2 is unchanged.
- **Mandatory gate now survives hardware back / silent navigation.** The `OnboardingGuard` in `apps/mobile/app/_layout.tsx` previously short-circuited via `hasRedirectedRef` after the first redirect, so a user who hardware-backed out of the mandatory signup-prompt could land back on `/route-planning` and keep riding. The guard now re-evaluates the mandatory branch on every pathname change and re-redirects to `/onboarding/signup-prompt?mandatory=true` whenever `anonymousOpenCount >= 3` and the user is off the `/onboarding/*` subtree. The non-mandatory (count == 2) branch keeps the one-shot behavior so dismissing the dismissible prompt doesn't re-prompt mid-session.
- Only real signup/sign-in (Google OAuth or email via `/auth`) clears the gate — both existing handlers already call `resetAnonymousOpenCount()`, so no store-layer change was needed.

### Files
- `apps/mobile/app/_layout.tsx` — threshold lowered, mandatory branch lifted above the `hasRedirectedRef` short-circuit, JSDoc updated.

### Tests
- `npm run check:bundle` HTTP 200.
- `npx tsc --noEmit -p apps/mobile/tsconfig.json` clean.
- No new automated tests: this is a threshold constant + re-ordering of an existing effect, both covered by existing onboarding flow tests.

### Release
- Ships in the next preview APK (version bump handled when distributed, not in this commit).

## 2026-04-22 — Route Preview "Back" Label + Custom Start Label Fix (v0.2.4 + v0.2.5)

### Changes
- **v0.2.4**: "Back to planning" button on route preview shortened to "Back" (`apps/mobile/app/route-preview.tsx`). Paired version bump to `0.2.4` / versionCode 6.
- **v0.2.5**: Route-planning origin card no longer shows the stale GPS-location label after the user changes to a custom start and returns from preview. `apps/mobile/app/route-planning.tsx` now (a) reverse-geocodes `routeRequest.startOverride` into `customStartLabel` via a dedicated TanStack query, (b) renders that label in the origin card subtitle when `customStartEnabled`, and (c) hydrates `startOverrideQuery` on first mount so tapping the pencil opens the edit field pre-filled with the current custom start instead of blank. Paired version bump to `0.2.5` / versionCode 7.

### Release
- Both builds already distributed via Firebase App Distribution to the `early-access-preview` group.

## 2026-04-22 — Pre-Ride Checklist FAQ Entry

### Content
- **New FAQ item: "What should I check before every ride?"** — added as the second entry in the **Safety & Routing** section of `apps/mobile/app/faq.tsx`, immediately after the "What is Defensive Pedal?" intro. Provides a 60-second pre-ride checklist organised into four groups: **Bike (ABC)** — air, brakes, chain; **You** — helmet, lights, bell, phone, visibility; **Route** — destination set, risk distribution + elevation glance, weather/AQI check, hazards on route; **Mind** — hydration/energy, voice guidance, plan first turn. Closes with the rule "If anything fails the check, fix it before you ride — not at the first red light."
- Renders inside the existing single-`Text` answer block using `\n` line breaks and `\u2022` bullet markers; em-dashes use `\u2014` to match the encoding style of surrounding answers.

### Tests
- `npx tsc --noEmit` on `apps/mobile` passes with zero errors. Pure data addition (one string entry into an existing `FAQ_SECTIONS` array) — no new imports, no native code, no schema or type changes.
- Bundle check not run from sandbox (Metro lives on the Windows host); JS-only change cannot affect bundle compilation. User to run `npm run check:bundle` from `C:\dev\defpedal` before phone testing.

### Build impact
- Picked up automatically by the next APK build of any variant. Dev APK gets it via Metro hot reload; preview/production APKs embed the refreshed JS bundle during the existing Gradle bundling step. No clean, no cache reset, no native rebuild required.

## 2026-04-21 — Screen-Reader Access to Mapbox Map State (P1-21 Phase 3)

### Features
- **Textual map summary for assistive tech** — Mapbox `SymbolLayer` / `CircleLayer` content is rendered natively and invisible to TalkBack and VoiceOver. Phase 3 adds a parallel text representation so screen readers can announce what's on the map.
- **`useMapA11ySummary` hook** (`apps/mobile/src/components/map/useMapA11ySummary.ts`) — pure, memoized, i18n-aware. Inputs: mode (`planning` / `navigating` / `historical` / `feed` / `empty`), selected route, hazards on route, nearest approaching hazard, off-route flag, remaining distance. Outputs `{ label, liveRegionText }`. Live-region output is bucketed in 50 m steps to prevent 1 Hz GPS-tick spam.
- **`ScreenReaderMapSummary` component** (`apps/mobile/src/components/map/ScreenReaderMapSummary.tsx`) — 1×1 transparent, `pointerEvents="none"` sibling of `Mapbox.MapView` with `accessibilityLiveRegion="polite"` + `accessibilityRole="summary"`. Uses a key-change pattern to force re-announce when the same transient text is emitted twice.
- **`RouteMap` `a11yContext` prop** — replaces the hard-coded `accessibilityLabel="Navigation map"`. Surfaces that already carry full info in surrounding card text pass `{ decorative: true }` (container becomes `accessibilityElementsHidden`). Surfaces that add information pass `{ mode, hazardsOnRoute?, nearestApproachingHazard?, isOffRoute?, remainingDistanceMeters?, suppressHazardLive? }`.
- **11 callsites specialized:**
  - `decorative: true` — `FeedCard`, `community-trip.tsx`, `ActivityFeedCard`, `TripCard`, `onboarding/safety-score.tsx` (card-level text is already complete).
  - `mode: 'planning'` — `route-preview.tsx`, `route-planning.tsx`, `onboarding/first-route.tsx`.
  - `mode: 'historical'` — `trip-map.tsx`, `trip-compare.tsx`.
  - `mode: 'navigating'` with live fields — `navigation.tsx`. Computes the closest hazard within 200 m, passes `isOffRoute` from `offRouteDetails`, `remainingDistanceMeters` from `navigationSession`, and `suppressHazardLive = activeHazardAlert != null` so the polite map summary yields to the assertive `HazardAlert` component and never double-announces.
- **Live-region rules**
  - Off-route transition → *"Off route. Rerouting in progress."* fires once. On recovery → *"Back on route."* fires once.
  - Approaching hazard ≤ 200 m → *"Hazard ahead: `<type>`, `<distance>` meters away."* Re-announces only when the rider crosses a 50 m bucket (200→150→100→50), not every GPS update. Suppressed entirely while `HazardAlert` is mounted.
  - Off-route has priority over hazards — no overlap.

### i18n
- **`mapA11y.*` keys** added to `en.ts` + `ro.ts` — `hint`, `empty`, `routeSummary`, `routeWithClimb`, `riskBreakdown`, `hazardsOnRoute_one` / `_other`, `hazardUpcoming`, `offRouteEntered`, `offRouteCleared`, `navigating`, `planning`, `historical`, `userLocationKnown`.
- **`hazard.types.*`** added for all 10 hazard types so announcements read natural human labels in both locales.

### Tests
- **16 new unit tests** on `useMapA11ySummary` covering label composition, mode-specific prefixes, pluralization, risk-mix phrase, off-route priority, 50 m hazard bucket dedup, 200 m radius gate, and `suppressHazardLive` suppression. All green.
- `npm run typecheck` passes across api + mobile + web.
- `npm run check:bundle` HTTP 200.

### Tracker
- `issuefix.md` P1-21 flipped from OPEN → FIXED (pending device QA), repair log entry added.
- `TODO.md` issuestofix updated with remaining physical-device TalkBack QA pass.

### Known followups
- Manual TalkBack QA on a physical Android device is the last merge gate. Five test cases documented in-session.

## 2026-04-20 — Branded Signup Email + Cross-Device Confirmation

### Features
- **Branded sender** — signup emails now come from `team@defensivepedal.com` (Resend SMTP, DKIM/SPF verified on `defensivepedal.com`) instead of the default `noreply@supabase.io`.
- **Edge function `email-confirm`** (`supabase/functions/email-confirm/index.ts`) — HTTPS intermediary that branches per platform:
  - Android → 302 `intent://auth/callback?code=...#Intent;scheme=defensivepedal-dev;package=com.defensivepedal.mobile.dev;end` (Chrome opens the app natively, no JS redirect).
  - iOS → 302 `defensivepedal-dev://auth/callback?code=...` (OS opens the app).
  - Desktop → 302 to `routes.defensivepedal.com/email-confirmed` (branded success page).
- **Mobile client wiring** — `signUpWithEmail` in `apps/mobile/src/lib/supabase.ts` now sets `emailRedirectTo` pointing at the edge function with the active app scheme. `AuthSessionProvider` deep-link handler extended to support both PKCE `code` (same-device) and non-PKCE `token_hash + type` (cross-device) flows, plus surfaces Supabase redirect errors.
- **Desktop success page** — new Next.js route `apps/web/app/email-confirmed/page.tsx` renders a branded green-check "Email confirmed" card; the database-level confirmation has already happened at `/auth/v1/verify` so no code exchange is needed on desktop.
- **Updated signup status message** — "Check your inbox — we sent a confirmation link. Tap it on this device to finish signing in." (en + ro).

### Infra
- **Supabase SMTP** configured in dashboard with Resend credentials; DNS records (DKIM TXT at `resend._domainkey`, SPF MX + TXT at `send`) verified.
- **Redirect URL allowlist** extended for the 3 app schemes + edge function URL.
- **Migration `202604200001_cascade_user_fks.sql`** — adds `ON DELETE CASCADE` to 14 FK constraints on `auth.users(id)` (trips, hazard_validations, ride_impacts, streak_state, user_badges, user_quiz_history, user_follows ×2, quiz_answers, xp_events, leaderboard_snapshots, mia_journey_events, mia_detection_signals, user_telemetry_events). Fixes generic "Database error deleting user" from the Supabase dashboard delete button.

### Tests
- Typecheck green on mobile + web + api. Mobile bundle check HTTP 200. Existing AuthSessionProvider tests pass.

### Known followups
- Consider Android App Links + iOS Universal Links for a smoother UX that skips the browser-flash step.

## 2026-04-20 — Route-Share Slice 8b (Mobile UI + Web Beacon)

### Features
- **My Shares screen** (`apps/mobile/app/my-shares.tsx`) — replaces the slice-3 landing stub with a real list of the user's shares, per-row opens + signups counters, expiry countdown, revoked pill, and Copy / Share again / Revoke actions with a confirm dialog.
- **Ambassador Impact card** — new `AmbassadorImpactCard` organism rendered at the top of My Shares showing shares sent, opens, signups, and XP earned.
- **Profile toggle** — "Share activity feed" in Profile → Account controls `shareConversionFeedOptin` (default on). When off, claimed shares no longer publish a conversion card to the sharer's activity feed. Rewards (XP + badges) ship regardless.
- **My Shared Routes nav** — new row in Profile → Account deep-linking to `/my-shares`. Target for slice-8a first-view push notifications (`data.deepLink = '/my-shares'`).
- **Activity feed** — `ActivityFeedCard` now renders the new `'route_share_signup'` row type via an internal `RouteShareSignupContent` variant. Wire-response schema in `activityFeedSchemas.ts` extends the type enum so `get_ranked_feed` rows don't get stripped.
- **Web viewer beacon** — new `ShareViewBeacon` client component on `/r/[code]/page.tsx` POSTs `/v1/route-shares/:code/view` on mount. Fire-and-forget, `sessionStorage` de-duped so Strict Mode / tab-refocus don't double-bump. Triggers first-view push notifications to sharers server-side.

### Infra
- **Cloud Run redeploy** — revision `defpedal-api-00058-6m6` shipped slice 8a endpoints; follow-up revision `defpedal-api-00059-cj5` ships the content-type parser fix: Fastify was rejecting POSTs without a `Content-Type` header (415) before the route handler could run, which broke the public view beacon for any caller that didn't explicitly set the header. Added a wildcard `addContentTypeParser('*')` on `services/mobile-api/src/app.ts` that resolves empty/unknown bodies to `undefined`. Verified live with `Googlebot/2.1` UA → HTTP 200 `{bumped:false,firstView:false}`.
- **Core contract** — `ActivityType` extends with `'route_share_signup'`; new `RouteShareSignupActivity` / `RouteShareSignupPayload` interfaces, `ActivityFeedItem` union updated.
- **Zustand store** — `shareConversionFeedOptin: boolean` (default true) + `setShareConversionFeedOptin` action persisted to AsyncStorage.

### Tests
- 474/474 core, 424/424 mobile-api, typecheck green across api + mobile + web, mobile bundle check HTTP 200.
- 4 pre-existing mobile test failures (ConnectivityMonitor × 4 NetInfo mock issue, FeedCard.champion parse error, LeaderboardSection) confirmed unrelated via stash-bisect.

### Deferred
- **Past-ride share variant** (slice 5b) — contract discriminator still stubs `past_ride` with `z.never()`.
- **Richer feed-card** — current `RouteShareSignupContent` is minimal (icon + "Someone signed up via a shared route"). A future slice can add the trimmed polyline mini-map preview if conversion CTR warrants it.

### Post-ship fixes (verified on-device)
- **Require cycle** in `AmbassadorImpactCard` — the organism was importing `useTheme` / `ThemeColors` from the `..` barrel (`src/design-system/index.ts`), which re-exports organisms and forms a cycle. Switched to importing from `../ThemeContext` directly (the same path other organisms use for their theme imports).
- **VirtualizedLists-should-never-be-nested warning** on `/my-shares` — the shared `Screen` wrapper nests children inside a `ScrollView`, and our `FlatList` was triggering the React Native dev warning. Refactored `my-shares.tsx` to compose `SafeAreaView` + `ScreenHeader` atom + `FlatList` directly (matches the pattern used by `community-feed.tsx` and `history.tsx` which also host FlatLists).

## 2026-04-20 — Route-Share Slice 8a (Ambassador Backend)

### Features
- **`GET /v1/route-shares/mine`** — authenticated list of caller's shares (active + revoked, newest first) with per-row `{shortCode, sourceType, createdAt, expiresAt, viewCount, signupCount, revokedAt}` + lifetime `ambassadorStats: {sharesSent, opens, signups, xpEarned}`.
- **`DELETE /v1/route-shares/:id`** — authenticated, owner-only. Non-owner and unknown id both return 404 (anti-enumeration). Idempotent on already-revoked shares.
- **`POST /v1/route-shares/:code/view`** — public UA-filtered + per-IP throttled (60/min) view beacon. Fires a first-view push notification to the sharer on the atomic 0→1 view_count transition.
- **First-view push notification** — new `dispatchFirstViewNotification` dispatcher with the same 3/day high-priority bypass pattern used for conversion pushes. `kind:'referral_view'` tag so conversion + first-view budgets don't collide. Title "Someone just opened your shared route", deep link `/my-shares`.
- **`profiles.share_conversion_feed_optin`** BOOLEAN (default TRUE) — sharer-controlled opt-out for the activity-feed conversion card. Extended to `PATCH /profile` + `GET /profile`.
- **Activity feed integration** — `claim_route_share` RPC now inserts an `activity_feed` row of type `'route_share_signup'` (gated on sharer opt-in) with payload `{sharerUserId, inviteeUserId, shareId, routePreviewPolylineTrimmed}`. Feed row owned by sharer so followers see it.

### Schema
- **`activity_feed.type` CHECK** — dropped and re-added with `'route_share_signup'` included.
- **`profiles.share_conversion_feed_optin`** — new BOOLEAN column, default TRUE.
- **`revoke_route_share(p_id, p_user_id)`** — new SECURITY DEFINER RPC.
- **`record_route_share_view(p_code)`** — new SECURITY DEFINER RPC using atomic `UPDATE ... RETURNING view_count` for exactly-once first-view detection under concurrent beacons.
- **`claim_route_share`** — replaced with slice-4-body + activity_feed fork gated on sharer opt-in.
- Migration: `2026042001_route_share_slice8.sql` / applied as `route_share_slice8_ambassador_observability`.

### Tests
- `packages/core` — 17 new (contract schemas) → 474 total.
- `services/mobile-api` — 19 new (bot UA filter + first-view dispatch) → 424 total. Typecheck green across api + mobile + web.

### Deferred (slice 8b)
- My Shares mobile screen (replaces current stub)
- `AmbassadorImpactCard` organism on Impact Dashboard
- Profile toggle for `shareConversionFeedOptin`
- `RouteShareSignupFeedCard` component
- Web viewer beacon hook (`POST /r/:code/view`)

### User action required
- **Cloud Run redeploy** so the new endpoints become callable: `gcloud builds submit --config cloudbuild.yaml --timeout=600 && gcloud run deploy defpedal-api --image ... --region europe-central2 --platform managed --allow-unauthenticated`. Migration already applied via MCP.

## 2026-04-20 — Route-Share Slice 7c (PostHog Analytics)

### Features
- **Three web events** captured on `/r/[code]` with `{ share_code }` property so funnels join end-to-end with the mobile-side `share_claim_success`:
  - `share_view` — fires on page mount
  - `install_cta_click` — fires on Google Play CTA tap
  - `app_open_intent` — fires on Open-in-app universal-link tap
- **Mobile counterpart**: `ShareClaimProcessor` captures `share_claim_success` on the ok branch with `{ share_code, already_claimed, follow_pending }` so re-claims and private-sharer follow branches stay distinguishable in PostHog.
- **Delegated click listener**: `data-share-cta="<event_name>"` attributes on the CTA anchors are read at click time. Keeps `ShareCtas` a pure Server Component — no onClick prop, no client-component conversion.
- **Quota protection**: PostHog initialized with `person_profiles: 'identified_only'` so OG scrapers (WhatsApp/Twitter/Slack) that render preview cards don't create anonymous profiles that bill against quota.
- **Graceful no-op**: absent `NEXT_PUBLIC_POSTHOG_API_KEY` → `ShareAnalytics` silently returns; page renders and CTAs work unchanged.

### Build infra
- **Web zod alias**: switched `apps/web/next.config.js` from a hardcoded `apps/web/node_modules/zod` path to `require.resolve('zod/package.json')`. Works on both Vercel (`--workspaces=false`) and local workspace installs (where zod hoists to the repo root).

### User action required
- Set `NEXT_PUBLIC_POSTHOG_API_KEY` (and optionally `NEXT_PUBLIC_POSTHOG_HOST`) on the Vercel project and redeploy to pick up the env var. Reuse the existing PostHog key from `apps/mobile/.env` (`EXPO_PUBLIC_POSTHOG_API_KEY`).

### Deferred
- **7b** — next-intl EN + RO bundles + manual language toggle
- **cookie-based distinct_id bridge** — PRD's "share_code also bridged via cookie at claim time" isn't needed for the funnels the PRD lists; the `share_code` property join already stitches web + mobile events.

### Verified
- Vercel `dpl_AM3YMBc5AFFTmx67asSzQxavy1Ck` READY at 1776659204946.
- HTML on live share `NX0MHjeZ` carries both `data-share-cta` attributes; page bundle `page-9ca834075bdd9db8.js` contains `posthog` / `share_view` / `share-cta` tokens.

### Tests
- mobile: +2 new in `ShareClaimProcessor.test.tsx` (fires on ok with correct properties; does NOT fire on 404/gone/invalid/auth_required/network_error). 17/17 `ShareClaimProcessor` green.

## 2026-04-20 — Route-Share Slice 7a (OG Preview Image)

### Features
- **Rich link previews**: pasting a share link into WhatsApp, iMessage, Slack, Twitter, Discord, etc. now shows a 1200×630 preview card with the route map, stats, and branding instead of a generic text card. Generated on-demand via Next.js 15's `opengraph-image.tsx` convention.
- **Image layout** (per PRD): Mapbox Static Images render on the left 60%, stats panel on the right 40% (routing mode eyebrow, distance hero, duration + safety-score tile, sharer avatar chip), 56px yellow brand footer across the bottom.
- **Branded fallback**: 404 / 410 / fetch error / missing `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` all render a "This route is no longer available" card at the same 1200×630 size, so a previously-scraped OG card gets visually replaced on re-scrape instead of becoming a broken-image icon.
- **Meta tags**: `generateMetadata` on `/r/[code]` populates `<title>`, `og:title`, `og:description`, `og:site_name`, `og:type`, and `twitter:card=summary_large_image` from the live share payload (e.g. "victor shared a 6.8 km cycling route"). Next.js auto-wires `og:image` / `twitter:image` + width/height from the `opengraph-image.tsx` convention, with a per-deploy fingerprint query param so scrapers re-fetch after re-deploys.
- **Cache headers**: `Cache-Control: public, immutable, max-age=31536000` on the image response; `revalidate=3600` on the route handler. OG scrapers cache aggressively; this balances "fresh on re-share" against "don't re-render every OG scraper hit."

### Follow-ups deferred as separate slices
- **7b** — `next-intl` EN + RO bundles, Accept-Language detection, manual toggle
- **7c** — PostHog JS snippet with `share_view` / `install_cta_click` / `app_open_intent` events + web→mobile cookie bridge

### Verified on live share
- Share code `NX0MHjeZ` renders the full card; HTML meta tags and `Content-Type: image/png` on the image endpoint both check out. Vercel `dpl_DvConagdQSiggV2Xe55tzJrSYkTR`.

## 2026-04-19 — Route-Share Slices 4, 5a, 6

### Slice 4 — Private-Profile Pending-Follow
- Invitees claiming a share from a private sharer get `user_follows.status='pending'` instead of `'accepted'`. XP + badges + saved-route all still fire (PRD: access isn't gated on follow approval).
- `user_follows.source TEXT` column tags rows created by `claim_route_share` so the Follow Requests UI can render attribution context without a join at read time.
- Mobile toast on first-time claim swaps to "Shared route added. Follow request sent." when `rewards.followPending=true`; `FollowRequestItem` gains optional `context?: string` prop rendered as italic muted subtitle.
- Migration `2026041904_route_share_claim_private_follow.sql`. Cloud Run `defpedal-api-00055-xkg`.

### Slice 5a — Saved-Route Source Variant
- Replaces the slice-1 `z.never()` stub for `source: 'saved'` with a real schema (`savedRouteId` uuid + route payload identical to planned). API validates `saved_routes.user_id` ownership and persists `route_shares.source_ref_id` for analytics.
- `past_ride` stays stubbed until a follow-up slice delivers server-side re-planning.
- Mobile: transient `lastLoadedSavedRouteId` Zustand flag auto-branches the share emit after a saved route is loaded. No new UI surface — the existing route-preview share button does the right thing. New caption: "I saved this safer X km cycling route — open it in Defensive Pedal."
- Cloud Run `defpedal-api-00056-sc2`. No DB migration (source_ref_id exists from slice 1).

### Slice 6 — Per-Share Privacy Trim Toggle
- New `ShareOptionsModal` molecule — pre-share sheet with "Hide exact start/end address (recommended)" toggle. Defaults ON per PRD, resets each open. Short-route fallback (<400m) disables the toggle with helper text.
- Core helper `trimEndpointsForShare(polyline, { hideEndpoints, trimMeters? })` wraps `trimPrivacyZone` with the 400m safeguard and returns `{ polyline, endpointsHidden, shortRouteFallback, fullLengthMeters }`.
- API request accepts optional `hideEndpoints`; omitting it preserves the DB-level default (true).
- **Web viewer privacy fix**: `ShareMap` now derives start/end markers from the trimmed polyline's first/last coord when `endpointsHidden=true` — previously pinned the real home/work addresses even while the polyline hid them.
- Cloud Run `defpedal-api-00057-twk`. No DB migration.

### Test counts after all three slices
- core: 441 → 456 (+15)
- mobile-api: 398 → 405 (+7)
- mobile: no net change (existing useShareRoute / ShareClaimProcessor suites green)

## 2026-04-19 — Route-Share Slice 3 + Follow-Up Fixes

### Features — Slice 3 (Ambassador Rewards)
- **Rewarded claim**: taking a share link now awards XP on both sides. Invitee earns +50 welcome XP once in their lifetime (action `referral_welcome`). Inviter earns +100 XP per conversion (action `referral`), capped at 5 per calendar month.
- **Ambassador badges**: 3-tier progression (`ambassador_bronze` @ 1 conversion, `ambassador_silver` @ 5, `ambassador_gold` @ 25). Evaluated inside the claim RPC using a distinct-invitee COUNT across all of the inviter's shares.
- **Mia milestone**: when the inviter is on an active Mia journey, `profiles.mia_non_cyclists_converted` increments. Auxiliary stat for the Mia Journey Tracker — not a level-up gate.
- **Push notification**: "Someone joined via your share! — +100 XP + Ambassador badge." dispatched to the sharer on first-time claim. A "first 3 referral pushes per calendar day" bypass overrides the stock 1-per-24h daily budget; subsequent same-day referral pushes fall through to the normal suppression path.
- **Mobile surfaces**: `ShareClaimProcessor` enqueues invitee badges onto the existing `BadgeUnlockOverlayManager` and renders `XpGainToast` for the +50. New `/my-shares` stub screen as the push-notification landing target.
- **DB**: migration `2026041901_route_share_ambassador_rewards.sql` (applied as `route_share_ambassador_rewards_slice3`) seeds badges + adds the Mia counter + extends `claim_route_share` RPC.
- **API**: new `lib/ambassadorRewards.ts` dispatcher. Fastify schema strips inviter-side reward fields from the claim response before replying (additionalProperties:false enforces the barrier). Cloud Run revision `defpedal-api-00054-44f`.

### Fixes
- **Email signup 500 "Database error saving new user"**: `public.handle_new_user()` is SECURITY DEFINER but had no `search_path` pinned (long-standing `function_search_path_mutable` advisor warning). GoTrue's signup transaction runs with `search_path=auth, pg_catalog`, so the trigger body's unqualified `profiles` reference threw `relation "profiles" does not exist`. Fix: migration `2026041902_fix_handle_new_user_search_path.sql` pins the function's search_path to `public, auth, pg_temp`. One-liner, no body change. Same pattern as `202604120001_set_search_path_on_security_definer.sql` which had hardened the other SECURITY DEFINER functions but missed this one.
- **Trophy Case crash on fresh claimant account**: the slice-3 seed used `display_tab='social'` for the ambassador badges, but `BadgeDisplayTab` in `packages/core/src/contracts.ts` is a strict union (`firsts | riding | consistency | impact | safety | community | explore | events`). `achievements.tsx:214` indexes into a tab-counter by `displayTab`, so `counts['social']` was undefined and `.total++` threw. Fix: migration `2026041903_ambassador_badges_use_community_tab.sql` UPDATEs the 3 rows to `category='community' + display_tab='community'`. Slice 3 migration file also corrected in the repo for fresh rebuilds.
- **Stale badges/tiers/XP after account switch**: signing out of account A and signing in with B surfaced A's values until each individual query happened to refetch. Two layers of staleness: TanStack Query keys (`['badges']`, `['tiers']`, `['mia-journey', persona]`) aren't user-scoped, and the Zustand persist whitelist caches user-scoped projections (`cachedImpact`, `cachedStreak`, `earnedMilestones`, `pendingBadgeUnlocks`, `pendingTierPromotion`, `persona`, `mia*`, `queuedMutations`, `tripServerIds`, etc.). Fix: new `store.resetUserScopedState()` action + new `UserCacheResetBridge` provider that sits inside QueryClientProvider and under AuthSessionProvider. Tracks previous user id via `useRef` and on X→null (sign-out) or X→Y (account switch) calls `queryClient.clear()` + `resetUserScopedState()` in lockstep. Skips null→X (initial sign-in) and X→X (refresh-token rotation). Device preferences (theme, locale, voice, offline map packs, bike type, routing prefs, notify toggles) are preserved across sign-outs.

## 2026-04-19 — Route-Share Vercel Production Repair

### Fixes
- **Share viewer client-side crash**: `apps/web/components/ShareMap.tsx` called `decodePolyline(geometryPolyline6, 6)` — but core's decoder takes precision as a scale divisor (default `1e6`, matching the "polyline6" = 6 decimal digits convention). Passing literal `6` divided latitudes by 6 instead of 1e6, producing values in the 7M+ range that Mapbox's `LngLat` rejects with "Invalid LngLat latitude value: must be between -90 and 90". A second bug re-inverted every coordinate: the decoder already returns `[lon, lat]` (`polyline.ts:73`), so the extra `.map(([lat, lon]) => [lon, lat])` swap was wrong. Fixed by calling `decodePolyline(geometryPolyline6)` with default precision and no swap.
- **Next.js 15 cookie mutation during SSR**: `apps/web/app/r/[code]/page.tsx` called `cookies().set('dp_share_code', ...)` during Server Component render, which Next.js 15 forbids with a runtime error. Moved the cookie write to `apps/web/middleware.ts` (matcher `/r/:code*`, SameSite=Lax, not HttpOnly so the slice-7 PostHog snippet can read it, 30-day max-age).
- **Event handler on Server Component anchor**: the "Coming to iOS" CTA had `onClick={e => e.preventDefault()}` to suppress its `href="#"`, but `ShareCtas.tsx` is a Server Component — Next.js 15 rejects DOM event handlers. Replaced with `<span role="button" aria-disabled="true">` + CSS `pointer-events: none` / `user-select: none`.
- **Zod `.datetime()` rejecting Postgres offsets**: `timestamptz` columns serialize as `+00:00` offset form (`2026-04-19T04:54:28.298107+00:00`), which strict `.datetime()` rejects. Added `{ offset: true }` to the shared `isoDateTime` schema in `packages/core/src/routeShareContract.ts` — affects createdAt/expiresAt/revokedAt on both record + publicView schemas.
- **Vercel packages/core resolution**: `.vercelignore` was stripping `packages/core` from the Vercel build sandbox; fixed with whitelist `packages/*\n!packages/core`. Transitive zod resolution still broke with `transpilePackages` alone (Vercel installs with `--workspaces=false`, so `packages/core` has no `node_modules`) — added webpack `resolve.alias` for zod pointing at `apps/web/node_modules/zod`, plus matching `paths` entry in `apps/web/tsconfig.json` so the tsc pass honors the alias too.
- **Share error boundary now surfaces error details**: `apps/web/app/r/[code]/error.tsx` renders a debug pre-block with `error.name`, `error.message`, `digest`, and `stack` so future client-side crashes don't require DevTools to diagnose.

### Follow-ups
- Placeholder Play Store URL in `apps/web/components/ShareCtas.tsx:19` still points at `com.defensivepedal.mobile` — swap for the live listing before production launch. Tracked in `TODO.md`.

## 2026-04-18 — Route-Share Slices 1 + 2 (Tracer Bullet + Claim Flow)

### Features — Slice 1 (PR #21)
- **Shared planned-route viewer**: tap Share on route preview → 8-char base62 code (~47 bits entropy) → `https://routes.defensivepedal.com/r/<code>` → Next.js SSR viewer renders Mapbox GL map with safety-colored segments, stats bar (distance/duration/mode/safety score + sharer avatar), and CTAs (Open-in-app universal link + Google Play).
- **Core contracts**: `packages/core/src/shareCodeGenerator.ts`, `shareDeepLinkBuilder.ts`, `routeShareContract.ts` — zod discriminated union on `source` with `planned` active and `saved`/`past_ride` stubbed as `z.never()` for forward-compatibility.
- **API**: `POST /v1/route-shares`, `GET /v1/route-shares/public/:code`, `DELETE /v1/route-shares/:id` with schema validation and feature-flag gating via `ENABLE_ROUTE_SHARES`.
- **DB**: migration `20260418150119_route_shares_slice1` — `route_shares` table + RLS + `get_public_route_share` RPC (SECURITY DEFINER, atomic view-count increment).

### Features — Slice 2 (PR #22)
- **Claim flow**: invitee taps link → app opens via Android App Link → deep-link parser stamps the code → `ShareClaimProcessor` drains it into `POST /v1/route-shares/:code/claim` → claim response mapped to a `RoutePreviewResponse` → user lands on route-preview screen with the shared route rendered.
- **Cold-install fallbacks**: `installReferrer.ts` (react-native-play-install-referrer) parses `share=<code>` from Play Store install referrer. `clipboardFallback.ts` reads first-launch clipboard once and discards anything that isn't a route-share URL.
- **Idempotent claims**: `claim_route_share` RPC uses `ON CONFLICT DO NOTHING` and returns `alreadyClaimed` so repeat taps don't duplicate state.
- **DB**: migration `20260418194113_route_share_claims_slice2` — `route_share_claims` table + RPC.

### HITL
- DNS + TLS + Vercel env vars green at `routes.defensivepedal.com`.
- Google Digital Asset Links verified all 3 package IDs with debug-keystore SHA-256.
- Android App Links confirmed `verified` on device via `pm get-app-links`; link-tap from SMS opens the app directly.
- iOS Universal Links still blocked on Apple Developer seat + hardware; `FILL_ME_TEAM_ID` placeholder live in published AASA.

## 2026-04-04 — Session 3: Social Features + Impact Summary Fix + Polish

### Features
- **Follow/unfollow users**: user_follows table, follow/unfollow API endpoints, optimistic UI
- **User profile page**: public profile screen with stats, recent trips, follower/following counts, follow button
- **Username in community feed**: @username shown instead of email, tappable to open profile
- **Post-ride impact summary**: Fixed to always appear — synchronous computation from store, no async dependency
- **Elevation descent display**: Navigation footer shows "Descent" when route is net-descending
- **Trip distance from GPS**: Trip cards show actual GPS trail distance, not planned route distance

### Fixes
- **Impact summary not appearing**: Root cause 1 — OnboardingGuard redirecting /feedback to signup for anonymous users. Root cause 2 — async useEffect failing silently. Fixed with synchronous useMemo from store + guard exclusion for /feedback and /navigation
- **Stats mismatch**: Dropped duplicate get_trip_stats_dashboard RPC (old 1-arg version)
- **Like/love counter reverting**: Delayed query invalidation by 3s to preserve optimistic update
- **Toast text truncated**: Removed numberOfLines limit, wider max width, rounded rectangle instead of pill

### History Section
- Added EUR saved + hazards reported to Your Impact card and Stats Dashboard summary
- Both use same formula: EUR = distance_km × 0.35

### Deployments
- Cloud Run: revisions defpedal-api-00017 through defpedal-api-00019
- Supabase: user_follows table, get_user_public_profile RPC, username column, dropped duplicate RPC

---

## 2026-04-03 — Session 2: Habit Engine Refinements + Multi-Stop + Username

### Features
- **Multi-stop routes**: Up to 3 intermediate waypoints with autocomplete search, yellow map markers, works with both safe/fast routing
- **Username system**: Unique usernames (case-insensitive), set after sign-up, editable in Profile, shown as `@username` in community feed
- **Sign-up enforcement**: Anonymous open counter — dismissible signup prompt at 2nd open, mandatory at 5th
- **Choose username screen**: Post-sign-up flow prompting for unique username
- **Speed indicator**: Live GPS speed (km/h) in navigation footer card with dividers between metrics

### Onboarding Improvements
- Road risk overlay on safety-score map (colored line segments from Supabase road_risk_data)
- 4-category safety score (safe/average/risky/v.risky) with correct thresholds
- Safety score inverted to 100-avgRisk (higher = safer)
- Circuit route: origin -> nearest POI -> origin (searches park/cafe/grocery/bakery, picks safest)
- Route title shows "and back" for circuit routes
- Auto-skip location permission screen if already granted
- Fixed goal-selection bounce-back bug (safety-score auto-dismiss timer)
- Compact score card at bottom, map fully interactive (zoom/pan)
- Fixed onboarding guard to trigger on fresh app open

### Hazard Reporting
- Hazard markers visible on route planning map (same as navigation)
- Crosshair + "Report here" button flow (pan map to position, tap button)
- 2x3 grid hazard picker (same as navigation style)
- Tappable hazard info cards (type, confirm/deny counts)
- Hazard zone 50% smaller (SPREAD 8 -> 4)
- Alert radius reduced 30% (100m -> 70m)
- Toast: "Reported! Other cyclists will be warned."

### History Section Redesign
- Inline streak card, guardian tier, daily quiz (removed separate Impact Dashboard)
- Order: Your Impact -> Streak -> Guardian Tier -> Stats Dashboard -> Daily Quiz -> View My Trips
- EUR saved + hazards reported added to Your Impact card and Stats Dashboard

### Fixes
- Like/love counter: delayed invalidation (3s) to preserve optimistic update
- Impact summary only for rides >50m (skip zero-distance)
- Fixed end-ride crash (missing calculateTrailDistanceMeters in preview build)
- Toast visibility (positioned higher, wider, no text truncation)
- Navigation footer dividers between Speed/ETA/Dist/Climb
- Daily quiz scrollable (explanation no longer cut off)
- Safety-score card text overflow fixed (compact 4-category layout)
- Risk categories: Very safe boundary 30 -> 33

### Deployments
- Cloud Run: revisions defpedal-api-00010 through defpedal-api-00016
- Supabase: username column, risk map RPC, updated safety score RPC, guardian tier trigger, quiz questions seeded (25)
- Multiple preview APK builds for untethered testing

---

## 2026-04-02 — Session 1: Habit Engine MVP + Community Stats

### Features
- **Habit Engine (Phases 0-6)**: Full implementation across 24 tasks
  - Anonymous auth (Supabase) with identity merge on sign-up
  - 5-screen onboarding flow (location -> safety score -> goal -> route -> signup)
  - Post-ride impact summary (animated CO2/money/hazards counters with variable equivalents)
  - Streak engine (4AM cutoff, 5 qualifying actions, freeze mechanic)
  - Impact Dashboard (StreakChain, AnimatedCounters, guardian tier progress)
  - Daily safety quiz (50+ questions, streak qualifier)
  - Enhanced hazard reporting (2-tap FAB, armchair long-press, confirm/deny display)
  - Guardian tier system (reporter -> watchdog -> sentinel -> guardian_angel, auto-promotion)
  - Milestone share cards with detection and dedup
  - Scheduled notifications (streak protection, weekly impact, social digest)
- **Community stats by locality**: Aggregate stats (trips, km, time, CO2) with reverse geocoding for city name
- **Continuous Learning v2.1**: Observation hooks configured for project-scoped instinct tracking

### Database
- 6 new tables: ride_impacts, streak_state, user_badges, quiz_questions, user_quiz_history, reward_equivalents
- 5 new RPCs: qualify_streak_action, record_ride_impact, get_impact_dashboard, get_neighborhood_safety_score, get_community_stats
- 3 triggers: guardian tier promotion, hazard count increment, love count sync
- 26 reward equivalents seeded
- Profile columns: cycling_goal, guardian_tier, onboarding_completed_at, total_co2/money/hazards/riders

### Testing
- 40 new integration tests, all passing
- 0 regressions across 443 existing tests
- 1 bug found and fixed by quality agent (comments handler missing guardianTier)

### Team
- 4-agent team (architect, frontend, backend, quality) coordinated via task system
- All code reviewed by architect agent before merge

### Deployments
- Cloud Run: revisions defpedal-api-00008 through defpedal-api-00009
- Supabase: all migrations applied
- Branch: feature/habitengine
