# Changelog

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
