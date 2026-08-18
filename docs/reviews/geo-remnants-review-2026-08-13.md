# Geographic Remnants Review — Romania-era / Romania+Spain-era leftovers
Generated: 2026-08-13

> 27 of 29 findings were fixed the same day — see the **Fix status** table at the bottom of this file. The four that remain (G-01 Play Console default language, G-28/G-29 counsel wording, EUR currency) are carried in [`TODO.md`](../../TODO.md) §issuestofix.

Scope: UI/UX remnants from the RO-only era (launch → 2026-05) and RO+ES era (2026-05 → 2026-07-13) that are useless or confusing now that the app serves 31 countries (EU-27 + EEA + CH). Method: 4 parallel audit agents (static content / route+community screens / notifications+nudges / repo-wide geo sweep), top findings independently re-verified against source by the orchestrator.

## Summary

| Severity | Count | Theme |
|----------|-------|-------|
| Verify-now (potential P0) | 1 | Play listing default language |
| P1 | 11 | Broken quiz, false onboarding claims, silent risk degradation, Bucharest defaults, stale store listing, zero-density community, localization debt |
| P2 | ~15 | Copy accuracy, sparse-country UX, orphaned screens, moderation gaps |
| P3 | ~14 | Currency, formats, minor copy/hygiene |

**The structural finding:** the app has two coverage concepts — OSRM routing coverage (31 countries) and `road_risk_data` coverage (RO+ES only) — and **only the first has any UI representation**. There is no `isRiskDataAvailable(country)` predicate in `packages/core`, no field on the `CoverageRegion` contract, and no i18n string anywhere expressing the risk-data limit. Every risk surface degrades by rendering `null`. The only place in the app that tells the truth is the FAQ (`apps/mobile/app/faq.tsx:51,66`) — its wording is the template for every fix below.

Three Bucharest-shaped root causes drive most of the notification findings:
1. No per-user locale column exists → every server push is English.
2. `quiet_hours_timezone` defaults to `'Europe/Bucharest'` **at the schema level** and is only ever written from the Profile screen.
3. `resolveUserLocation`'s Bucharest fallback sets `fromFallback: true` — which **no production code consumes**.

---

## VERIFY IMMEDIATELY (potential P0)

### G-01 · Play Console default listing language may still be Romanian
`apps/mobile/store-listing/README.md:22-30` instructs: "Romania is the launch country, so `ro-RO` is the **default** listing language… Set default language to `Romanian (ro-RO)`." Only `ro-RO/` and `en-US/` listings exist. Play serves the **default** language to every locale without a dedicated translation — if the live console matches the doc, a rider in Germany/Poland/France/Italy sees a Romanian store page. Repo can't confirm live console state.
**Action:** check Play Console. If ro-RO is default: flip default → `en-US`, keep `ro-RO` as translation, add `es-ES` (Spain is one of only two risk-data markets and the app ships a Spanish UI, yet has no Spanish listing). Fix the README either way.

---

## P1 — Fix before next release

### G-02 · Daily quiz hard-locks for every rider outside RO/ES (verified)
- Pools: GENERIC = **30** questions, RO = 44, ES = 44 (`services/mobile-api/src/data/quiz-questions-generic.ts`, `quiz-questions.ts`, `quiz-questions-es.ts`)
- `services/mobile-api/src/routes/v1.ts:3418-3441`: questions answered in the last **30 days** are excluded; empty pool → `404 'No quiz questions available.'`
- A daily player outside RO/ES consumes all 30 questions in 30 days; from ~day 31 the pool is empty (day-1's answer is still inside the rolling window unless fetched later in the day than originally answered). `daily-quiz.tsx` shows "Failed to load quiz" + a Retry that never recovers. RO/ES riders have 14 questions of headroom and never hit this.
- The quiz is 1 of 5 streak qualifiers, so this silently removes a streak-protection option for 29 countries.
**Fix (any):** grow GENERIC past ~40 (see G-19); or scale cooldown to pool size `min(30, pool.length − k)`; or fall back to least-recently-answered instead of 404.

### G-03 · Onboarding screen 1 promises risk-scored routes to all 31 countries (verified)
`apps/mobile/src/i18n/en.ts:1101` "…find the safest cycling routes near you, **scored with real road risk data**" and `:1105` "**Every route scored by real road risk data**" (mirrors ro.ts:1092/1096, es.ts:1092/1096; rendered at `onboarding/index.tsx:107,126`). This is the first screen every install sees, before the region gate, and is categorically false in 29 of 31 countries — it sets the exact expectation that G-05 then silently violates.
**Fix:** soften to something true everywhere ("built on street-level safety data" / "calmer routes") and make the street-by-street scoring claim country-conditional — the region gate knows the country one screen later.

### G-04 · "Routes 2.1× safer than Google Maps" — unqualified, RO-data-derived (verified)
`en.ts:1100,1102-1103` + hardcoded `2.1×` badge at `onboarding/index.tsx:113`. The figure comes from a route study that can only have been run where `road_risk_data` exists. An unqualified numeric superiority claim naming a competitor, shown in 31 markets, is EU comparative-advertising exposure (Dir. 2006/114/EC) on top of being misleading outside RO/ES.
**Fix:** qualify to the measured basis ("on measured routes in Romania") or gate the numeral on RO/ES; keep substantiation linkable.

### G-05 · Risk features silently vanish outside RO/ES — no "supported, no risk data" UI state exists anywhere
For a rider in Berlin/Paris/Warsaw (`resolvedCountry.routeSupported === true`, so every existing gate passes):
- **route-planning.tsx:1362-1404** — Safe/Fast/Flat pills identical to Bucharest's; the honest coverage notice at `:1406-1418` only fires *outside* the 31 — the wrong boundary for risk features.
- **route-preview.tsx:878-883** — `riskSegments.length > 0 ? <RiskDistributionCard/> : null`: the entire "Route risk" card vanishes with no placeholder; the condition conflates "not loaded yet" with "your country has no data."
- **RouteLayers.tsx:119-123** (+ `useFeatureCollections.ts:84-95`) — plain yellow route line, visually indistinguishable from a route where every street scored green-safe.
- **mapbox-routing.ts:529-534** — `COMPARISON_ELIGIBLE_COUNTRIES = ['RO','ES']` is function-local and unexported; comparison badge correctly absent, with zero user-facing explanation. Bonus waste: `enrichRouteWithRisk` (`:514-518`) still POSTs `/v1/risk-segments` per route alternative in 29 countries, always returning `[]` — one useless authenticated call per alternative per preview.
- **onboarding/region-check.tsx:109-113** — gate is binary (supported → silent pass / unsupported → waitlist); no rung tells the German rider that the screen-1 promise doesn't apply to them.
**Fix:** export `isRiskDataAvailable(country)` from `packages/core/src/countryCoverage.ts` as the single source of truth (optionally a `riskDataAvailable` field on `CoverageRegion` in `contracts.ts` — today `coverage` says `supported/safeRouting: true` for Germany, actively pointing the wrong way). Then: third state on the route-planning notice, one-line explainer in the preview card slot (reuse `faq.tsx:66` wording), skip the risk-segments fetch outside RO/ES.

### G-06 · Quiet hours run on the Bucharest clock for anyone who never opens Profile (verified)
`supabase/migrations/202604010001_push_notifications.sql:63` — `quiet_hours_timezone TEXT DEFAULT 'Europe/Bucharest'` (schema default → column is *populated* with Bucharest, never NULL). The **only** writer in the app is the Profile-screen mount effect (`apps/mobile/app/profile.tsx:229-241` + `:212-221`); no sync at launch, login, or trip end. Server gates at `nudges.ts:129,725`, `eventFirer.ts:50`.
Symptom: 22:00–07:00 enforced on Bucharest wall clock. Lisbon/Dublin: 20:00–05:00 local (prime evening suppressed, pushes legal from 5am). Reykjavík summer: 19:00–**04:00** local — riders can be push-woken at 4am. Legacy stack disagrees: `lib/notifications.ts:47` falls back to `'UTC'` for the same column — two subsystems, two clocks, same user.
Verified NOT broken (don't "fix"): `daily_ride_reminder` is self-consistent — `computeRidePattern` derives and compares hours in the same zone, so the relative offset survives; only absolute anchors (22:00/07:00) break.
**Fix:** sync `Intl.DateTimeFormat().resolvedOptions().timeZone` at session bootstrap or push-token registration (also fixes travelers); DB default → NULL; one shared fallback helper for both stacks.

### G-07 · Bucharest coordinate fallback leaks into push copy and the safety floor; `fromFallback` has no consumer (verified)
`services/mobile-api/src/lib/nudges/userLocation.ts:26-27` — `FALLBACK_LAT = 44.43 // Bucharest`; `:78` returns `fromFallback: true`, which is documented as the skip-hook (`:39`) but grep confirms **no production consumer** (only tests). Consequences for riders with no resolvable trip location (new users, streaks built on quiz/hazard actions, any swallowed DB error at `:74-76`):
- `{city}` resolves to "Bucharest" in ~20 pedalVoice EN variants — a Warsaw rider gets "**Bucharest** is calling. The bike is ready."
- Safety floor gates on Bucharest's 44.4°N weather/sunset: Helsinki (60.2°N) December — ride-asking nudges keep firing ~90 min after local dark (the floor failing open in exactly the condition it exists for); June inverse wastes ~2h of daylight.
- Send-window offset falls back to UTC+2 (`nudges.ts:1235`).
**Fix:** consume `fromFallback` — suppress safety-gated triggers and leave city unset (the localized "your city" fallback mechanism already exists, `cities.ts:44-45`, `pedalVoice.ts:222-247`).

### G-08 · Store description still declares a Romania-only launch — plus two false functionality claims
`apps/mobile/store-listing/en-US/full_description.txt:25-27` "ROMANIA-FOCUSED FOR LAUNCH… launching first in Romania" (+ ro-RO mirror). Same file: line 19 claims a "daily 9 AM forecast notification" (cadence randomized since 2026-07-18); line 23 claims "You can use the app anonymously" — the guest path was removed 2026-07-26, so this is a functionality claim the app contradicts (Play policy exposure, not just staleness).
**Fix:** replace the Romania section with the FAQ coverage statement (31 countries, risk colors in RO+ES); correct the notification and anonymous claims in the same edit.

### G-09 · Community tab opens on "Cyclists in <city>: 0 / 0 / 0 / 0"
`community.tsx:28` → `CommunityStatsCard.tsx:82-128`: first card on the Community tab, hardcoded 15 km radius (`feed.ts:45,197`), server always returns a row, only early-return is `!stats` — so a Berlin rider sees "Cyclists in Berlin", 0 trips / 0 km / 0 hrs / 0.0 kg, "0 active riders". This is the **last surface that never got the session-95 visibility ladder** (ranked feed and City Heartbeat were wired; this card wasn't) — and it's the one users hit first.
**Fix:** apply the same window→radius ladder + scope-aware labels.

### G-10 · The entire FAQ is hardcoded English
`faq.tsx:23-173` — `FAQ_SECTIONS` is literal English (27 items; CLAUDE.md says 19 — doc drift). Only `faq.title`/`faq.subtitle` go through `t()`; section headers render `section.titleKey` verbatim (`:240`). RO/ES riders — the two launch markets — get a fully-localized UI and then 27 English answers, including account-deletion and location-data, the ones read by people who actually need them.
**Fix:** per-locale FAQ content module keyed by id.

### G-11 · All server push copy is English; the commissioned RO/ES catalogs are dead code
`nudges.ts:409,482,496` + `eventFirer.ts:117` pass the literal `'en'` ("Phase 2 stores locale on profile" — never built; grep for `preferred_locale`/`profiles.locale` = zero matches). `pickMessage` dispatches correctly over `{en,ro,es}` catalogs (`pedalVoice.ts:137-140`) — full RO+ES pools exist and never reach users. Separately, `firstRideNotifications.ts:145-251` has four templates as inline English literals with no catalog at all. Inverse-geo (nobody gets *wrong-country* copy; RO/ES riders get English) but it's the same launch-era debt.
**Fix:** add `profiles.preferred_locale`, sync from device locale via the existing notification-consent PATCH, thread through `toUserNudgeProfile` → `dispatchNudge`. Sequence AFTER commissioning ES City Pulse copy (G-24) — fixing this first makes that gap newly visible.

### G-12 · (non-geographic, found in scope) FAQ states the opposite of the app's analytics behavior
`faq.tsx:169`: "…product analytics defaults OFF until you opt in during onboarding." Both halves false since 2026-07-16/19: PostHog defaults ON (`appStore.ts` v6 migration) and the onboarding consent screen was deleted. Given the ANSPDCP/ePrivacy review for the default-ON flip has NOT happened, the app's own privacy explainer making a stronger promise than the code delivers is the worst version of this to be caught with. **Fix the FAQ text now** (the first-screen transparency notice at `en.ts:1158-1161` is already correct — mirror it).

---

## P2 — Fix when convenient (grouped)

### Region-gate & onboarding copy accuracy
- **G-13** `en.ts:1169` / `region-check.tsx:272`: rider in the UK sees "Not in United Kingdom yet" directly above "…currently covers **Europe**" — self-contradictory for the most likely English-speaking unsupported cohort (UK/Serbia/Ukraine/Turkey). Say "the EU, EEA and Switzerland".
- **G-14** `en.ts:1178` "safety scores and hazard data are limited outside Europe" understates three ways: safe/flat routing is *gone* (force-downgrade to `fast`, `route-planning.tsx:154-161`), not "limited"; OSRM absence unmentioned; "outside Europe" wrong for UK/Serbia. Name the real limits.
- **G-15** `signup-prompt.tsx:169` "Hazard alerts and safety scores only work because every report comes from a real rider" — safety scores are not crowd-sourced (OSM + modeling). Drop "and safety scores".
- **G-16** Latent, fix BEFORE widening reachability: `RiskScoreExplainerSheet` copy asserts "Every road, path and cycleway on the map carries a Risk Score" (`en.ts:142-143`) with no coverage caveat. Today it's unreachable outside RO/ES only because its sole entry is the ⓘ inside the G-05-gated card — adding an explainer link elsewhere turns this into an outright false claim. Related: `riskLegend.ts:40` defines a "No data" band that is unreachable by construction (SQL filters null scores; empty countries yield `[]`) — the one affordance that would explain the German case exists and can never render.

### Bucharest defaults (beyond P1)
- **G-17** Map camera cold-start fallback is Bucharest: `map/constants.ts:4` `DEFAULT_CENTER = [26.1025, 44.4268]` via `useCameraConfig.ts:42` / `useFeatureCollections.ts:320-331`. Before GPS resolves — or forever if permission is denied — a Warsaw rider's map opens on Bucharest. Seed from persisted `regionGate.countryCode` centroid or a zoomed-out Europe view. (Related P3: `offlinePacks.ts:73` returns a central-Bucharest bbox for an empty polyline.)
- **G-18** City Pulse local send-window falls back to UTC+2 when no dataset city is within 30 km (`nudges.ts:444,1186,1235`; `cityPulse.ts:265,283`) — rural Portuguese rider's "[07:00, 21:30] local" computes 2h early; compounds with G-06. Derive from longitude (`Math.round(lon/15)`).

### Quiz depth & dispatch
- **G-19** GENERIC pool is thinner and easier than RO/ES: 30 vs 44 (−32%), road_safety halved (9 vs 19), **one** difficulty-3 question total. Author ~15-20 new GENERIC questions weighted to road_safety / difficulty 2-3 — this also resolves the G-02 lockout. (Pool header documents it was curated *down* from RO; growing it means writing content, not re-filtering.)
- **G-20** `v1.ts:3414` (and `/quiz/answer`) default `country ?? 'RO'` — any client that omits the param gets Romanian law questions anywhere on earth; route comment at `:3372` still says "(RO or ES)". Flip default to `'GENERIC'`.
- **G-21** Profile quiz-region picker (`profile.tsx:1226-1247`) resolves with `coords: null` while the quiz resolves WITH GPS (which wins, `quizCountry.ts:151-154`) — so "Auto · detected: General (Europe)" can sit over Romanian-law content and vice versa. Feed the picker the same `useResolvedQuizCountry()`.

### Community surfaces in sparse countries
- **G-22** City Heartbeat: bare "**ALL TIME**" card of zeros (`city-heartbeat.tsx:254-292`, totals deliberately pinned to un-widened 15 km, label never made scope-aware) sits in the same scroll as a scope-aware community "all-time" card — two contradictory "all time" numbers. Bare "TOP CONTRIBUTORS" header (`:313-346`) lists Bucharest riders ~1,800 km away at community scope. `community.tsx:52` "cyclists in your area" is false at the moment it renders once the feed widens. Feed scope chip is `ListHeaderComponent`-only (scrolls away) and never discloses the 365-day window widening (`communityVisibility.ts:81`).
- **G-23** Leaderboard: after one ride, the only rider within the fixed 15 km becomes rank #1 with the champion trophy mascot (`LeaderboardSection.tsx:75-89,160-164`) — but the settlement cron ranks **globally** (`leaderboard.ts:335-337`, radius 50,000 km), so the celebration has no backing badge/XP. Add a minimum-participant floor and align read/settle radii.

### Localization & moderation
- **G-24** City Pulse has no Spanish copy — `pedalVoice.ts:396-397` (`CITY_PULSE_BODIES` = en+ro only, comment says "ES copy not commissioned yet"). Masked today by G-11; becomes user-visible the moment G-11 ships. Commission ES first.
- **G-25** `weather_invitation` asserts "Perfect cycling weather this weekend" **without consulting any forecast** (`firstRideNotifications.ts:201-214` — weekday check only, UTC weekday math treating Fri/Sat as weekend). It can promise sunshine into a Dublin downpour. Wire the existing Open-Meteo client + `resolveUserLocation`.
- **G-26** UGC moderation prefilter covers only EN+RO (`moderationFilter.ts:17-43` — header says outright it matched the launch market). No Spanish patterns despite the shipped ES UI; slurs/threats in 29 languages ride until a human report. Add ES at minimum; the generic 10-digit doxx regex degrades acceptably.

### Dead code absorbing live effort
- **G-27** Three orphaned onboarding screens: `safety-score.tsx` (nothing routes to it; renders **fabricated** `FALLBACK_SCORE = 52` identically to a real score on timeout/failure, and renders a red animated "0/100" as "maximally dangerous" for zero-segment areas — the server correctly distinguishes, `v1.ts:2313-2317`, the client never reads it), `goal-selection.tsx`, `first-route.tsx` — which is **still being edited**: session-103 `RiskScoreExplainerSheet` work landed on it in the current working tree (`first-route.tsx:11,381-384` + `firstRouteRiskHint` keys `en.ts:1129-1131`). Delete all three (still deep-linkable Expo routes) + ~20 dead `onboarding.*` keys ×3 locales.

### Legal (route to counsel, don't self-edit)
- **G-28** Privacy policy + deletion page name ANSPDCP as *the* supervisory authority (`privacy/page.tsx:277`, `account-deletion/page.tsx:296-297`). Correct as lead authority (controller in Brașov) but incomplete: GDPR Art. 77(1) allows complaint to the rider's home authority — 30 of 31 markets are elsewhere. One added sentence + EDPB list link.
- **G-29** Terms ground the withdrawal waiver in "Directive 2011/83/EU … and Romanian OUG 34/2014" (`terms/page.tsx:147-149`) — other member states' transpositions apply to their consumers (Rome I Art. 6). Low risk; counsel wording.

---

## P3 — Track for later
- **Currency:** money-saved is EUR everywhere — `ImpactSummaryCard.tsx:305`, `impact-dashboard.tsx:298,351`, `trip/[id].tsx:78`, `eurSaved` keys; 11 of 31 countries are non-euro **including Romania itself** (predates the expansion). `StatsDashboard.tsx:439` additionally recomputes client-side with its own hardcoded €0.35/km while the server sends `moneySavedEur` — one rate from Iceland to Bulgaria, two code paths.
- `CITY_PULSE_MIN_N = 40` floor exists to satisfy Romanian grammar ("{n} de oameni" needs n≥20) and is applied to all 31 countries (`cityPulse.ts:12-14,107`) — a rider near a 3,000-person Estonian village is told ≥40 people are riding. Scope to RO if plausibility matters.
- Daily-weather notification titles/advice are English-only with no locale param (`daily-weather-messages.ts:45,102-108`; call at `daily-weather-notification.ts:181`) — geographically clean, linguistically launch-era.
- Saved-place keyword shortcuts match EN/RO/ES only (`savedPlaceKeywords.ts:24-27`) — "Zuhause"/"travail" get no Home/Work shortcut (graceful degrade).
- Mixed date locales: 4 feed surfaces use bare `toLocaleDateString()` (`FeedCard.tsx:44`, `ActivityFeedCard.tsx:94`, `ActivityCommentSheet.tsx:80`, `FollowRequestItem.tsx:56`) while TripCard/BadgeDetailModal/RideShareCard correctly pass `intlLocaleTag(locale)`.
- `lib/countries.ts` — English-only names in the region picker (known Hermes `Intl.DisplayNames` constraint) and a wrong header comment saying "EU+EEA+CH+**UK**".
- Liechtenstein absent from the 5,516-row cities dataset (`citiesData.ts`) — LI riders resolve to nearest CH/AT city; acceptable, noted.
- Legacy notifications stack (`notifications.ts:47` → `'UTC'`) vs nudge stack (→ `'Europe/Bucharest'`) disagree on the same column — unify when fixing G-06.
- `daily-quiz.tsx:190` renders raw category enums (ROAD_SAFETY…); `:82` hardcoded English "Option" in the a11y label.
- Dead i18n keys `preview.coverage`/`preview.coveragePending` (no call sites, translated ×3); Profile `formatQuizCountryName` `default:` falls through to Romania (latent); City Heartbeat nav title stays "City Heartbeat" at community scope; `community-feed.tsx:329-332` empty state says "nearby" when only reachable if the global feed is empty.
- Non-geo hygiene: `apkreleases/release-notes-template.txt` smoke checklist still instructs testing "a fresh anonymous session" — impossible since mandatory registration; silently invalidates a checklist step every release.
- `COUNTRY_BBOXES` ordering trap: RO/ES must stay first (first-match attribution gates the comparison) — enforced only by a comment (`countryCoverage.ts:40-44`); worth a locking test.
- `HEAT_ROUTING_COUNTRIES = ['RO']` (`countryCoverage.ts:200`, WIP on shade): the Cool pill is silently absent outside Romania — including Spain, arguably the highest-value heat market. Note for the avoidHeat rollout plan.

---

## Checked and fine — do not re-report
- **FAQ coverage disclosure is exemplary** (`faq.tsx:51,66`): "Safe routing is available across 31 European countries (the EU, EEA and Switzerland). Street-by-street risk colors are currently live in Romania and Spain." Use this wording for every fix above.
- Coverage-degradation toasts honest (`coverageOriginUnsupported`/`Destination` — "Safe routing isn't available in your area yet — using standard cycling routes").
- **Load-bearing guard — do not remove:** `mapbox-routing.ts:582` `length > 0` backstop on the comparison. `avgRisk([])` returns 0, and the `'same'` verdict would fire on `0 === 0`, rendering a green "Same safety as the safe route" shield from two empty arrays.
- Quiz country dispatch correct (`quizCountry.ts`: override → GPS bbox → locale region → GENERIC; deliberately separate from routing coverage; ES widened to include the Canaries for quiz purposes); GENERIC content verified country-agnostic; pool IDs collision-free across RO/ES/GENERIC; clients always pass `country`.
- i18n dictionaries nearly free of hardcoded geography (full grep: only the legitimately-named quiz-region picker labels).
- Hazard reporting/alerts fully coordinate-driven, not geo-gated — works in all 31 countries; `navigation.tsx` reads neither `riskSegments` nor `routeSupported`.
- Search country logic generic (derives from `SUPPORTED_APP_COUNTRIES`, hint cleared outside); `useResolvedCountry` has no RO default.
- `cityPulse` `COUNTRY_CYCLING_SHARE` covers all 31 with a documented EU-average default; EN pedalVoice catalog verified geography-neutral (safe fallback); placeholder fallbacks localized incl. `city → "your city"`; `solarTime` pure NOAA; Open-Meteo `timezone: 'auto'`.
- Units correct everywhere: km, km/h, °C, European AQI, EU-wide 112 in quiz content.
- `RiskScoreExplainerSheet` currently unreachable without risk data by construction (single entry via the gated card).
- Cloud Scheduler `Europe/Bucharest` cron zones are phase-only, not user-visible; per-user timing is driven by `profiles.quiet_hours_timezone` (whose *default* is the bug, G-06).
- `config.ts` `supportedSafeCountries` correctly additive over the legacy `SUPPORTED_SAFE_COUNTRIES=RO,ES` env var.
- Region gate itself: device-scoped one-shot, full 202-country picker, GPS-noise handling — sound.

---

## Recommended action plan

**Phase 1 — copy-only, one sitting (no native rebuild for server/store items):**
1. Verify/fix Play default listing language (G-01) + store description (G-08).
2. Onboarding screen-1 strings ×3 locales (G-03, G-04).
3. Region-gate "Europe" strings (G-13, G-14), signup-prompt (G-15), FAQ analytics answer (G-12).

**Phase 2 — the risk-data honesty layer:**
4. `isRiskDataAvailable(country)` in core (+ optional `riskDataAvailable` on `CoverageRegion`).
5. Fix explainer-sheet copy (G-16) BEFORE widening its reachability.
6. "Supported, no risk data" state on route-planning notice + route-preview card slot (G-05); skip the wasted risk-segments POSTs.

**Phase 3 — quiz:** grow GENERIC pool (G-19 → fixes G-02), flip API default to GENERIC (G-20), align the Profile picker (G-21).

**Phase 4 — de-Bucharest the defaults:** consume `fromFallback` (G-07), device-timezone sync at bootstrap + unified fallback (G-06), map default center from region gate (G-17), City Pulse offset (G-18).

**Phase 5 — sparse-country community UX:** ladder on CommunityStatsCard (G-09), City Heartbeat labels (G-22), leaderboard floor (G-23).

**Phase 6 — localization debt (largest):** commission ES City Pulse copy (G-24) → `profiles.preferred_locale` + threading (G-11) → FAQ translation (G-10) → firstRide catalog + real forecast (G-25) → ES moderation patterns (G-26).

**Phase 7 — hygiene & counsel:** delete orphaned onboarding screens + dead keys (G-27); counsel review of ANSPDCP/terms wording (G-28, G-29).

---

## ⚠️ Premise correction (2026-08-13, later the same day)

The review's central premise — "`road_risk_data` covers only RO+ES" — was **12 days stale**. It came from this repo's CLAUDE.md (May-2026 v22 state); the OSRM_Server project had already swapped a **b36v1 EU-wide generation (67,885,320 segments, all 31 covered countries)** into the app's live Supabase on **2026-08-01**. Verified from the app side: Berlin center holds 28k segments, and `get_segmented_risk_route` / `get_neighborhood_safety_score` return real scored data for Berlin/Paris/Stockholm coordinates.

Consequence: the app-side RO/ES gating (which predates this review — `COMPARISON_ELIGIBLE_COUNTRIES`, the empty risk overlays) was the only thing withholding risk scores from 29 countries with live data. **Same session, the gate was widened**: `RISK_DATA_COUNTRIES` now equals the full routing footprint, so risk overlays, the Risk Score card, and the safe-vs-fast comparison activate in all 31 countries; onboarding restored the (now true) "scored with real road risk data" claim; FAQ/store-listing/explainer coverage statements updated to 31 countries. The G-05 honest-degradation surfaces stay armed as the fallback if data and routing generations ever diverge again, and G-02/G-19/G-20 (quiz), G-06/G-07 (Bucharest defaults), and all localization fixes are unaffected.

The findings below were accurate for what the app *rendered* at review time; only their root-cause attribution ("no data") was wrong for the period after 2026-08-01 ("data present, gate stale").

## Fix status (same day, 2026-08-13 — session 105)

All phases executed in-session and **shipped as commit `e0784c6` on `shade`** (pushed; 93 files, +4233/−1881 — carries the cool/avoidHeat work too, since the two share ~20 files and no split typechecks standalone). Migration `202608130001` applied to the live DB. Full verification green (typecheck, core 871 / api 674 / mobile 1450, lint ratchet, bundle HTTP 200), and preview **v0.2.124 (vc 127)** was device-tested and approved before the commit.

| Finding | Status | Notes |
|---|---|---|
| G-01 | ⚠️ REPO FIXED, CONSOLE UNVERIFIED | README + listings corrected, es-ES created. **Victor must verify/flip the default language in Play Console.** |
| G-02 | ✅ Fixed | Pool 30→46 + exhaustion serves least-recently-answered instead of 404. |
| G-03/G-04 | ✅ Fixed | Screen-1 copy truthful ×3; 2.1× scoped to its RO/ES measurement basis. |
| G-05 | ✅ Fixed | `isRiskDataAvailable` in core; honest notices on planning + preview; wasted risk POSTs skipped. |
| G-06 | ✅ Fixed | Schema default dropped (live), NULL→UTC unified, bootstrap tz sync via `ProfileDeviceSyncManager`. |
| G-07 | ✅ Fixed | `fromFallback` consumed — safety floor fails closed; no forecast fetch on fallback coords. |
| G-08 | ✅ Fixed | Romania-launch section, anonymous claim, and 9 AM claim all corrected (en/ro; es created). |
| G-09 | ✅ Fixed | CommunityStatsCard first-rider empty state replaces the zero wall. |
| G-10 | ✅ Fixed | FAQ → per-locale modules `src/content/faq.{en,ro,es}.ts`, 25 items ×3. (Review said 27 — actual count is 25.) |
| G-11 | ✅ Fixed | `profiles.preferred_locale` (live) + threading through nudges, eventFirer, firstRide. Needs Cloud Run deploy. |
| G-12 | ✅ Fixed | FAQ analytics answer now matches the app's real defaults ×3 locales. |
| G-13/14/15 | ✅ Fixed | Region-gate + signup-prompt copy ×3. |
| G-16 | ✅ Fixed | Explainer intro carries the RO/ES coverage sentence ×3 (fixed before widening reachability, as sequenced). |
| G-17 | ✅ Fixed | Camera cold-start seeds from regionGate country centroid (`getCountryCenter`); Bucharest last-resort only. |
| G-18 | ✅ Fixed | `utcOffsetFromLongitude` replaces `?? 2` at all three sites. |
| G-19 | ✅ Fixed | 16 new trilingual questions; road_safety 17, level-3 6; floor test raised to 40. |
| G-20 | ✅ Fixed | Default `'GENERIC'` on both quiz endpoints; tests updated. |
| G-21 | ✅ Fixed | Picker resolves from persisted GPS origin; `formatQuizCountryName` defaults to GENERIC. |
| G-22 | ✅ Fixed | "ALL TIME · NEAR YOU" + hidden at zero; scope-aware TOP CONTRIBUTORS; feedSub honest. |
| G-23 | ✅ Fixed | Champion celebration floor: ≥3 ranked riders. |
| G-24 | ✅ Fixed | Full ES City Pulse pool (20+20), locale widened. |
| G-25 | ✅ Fixed | Real forecast via `isGoodCyclingDay`, fail-closed ×3 exits; localized catalog + per-locale dedupe markers. |
| G-26 | ✅ Fixed | ES slur/threat/+34-doxx patterns + first moderation test file. |
| G-27 | ✅ Fixed | 3 orphaned screens deleted (+first-route WIP backed up); ~45 dead keys removed ×3. |
| G-28/G-29 | ⏸ COUNSEL | Deliberately not self-edited — route ANSPDCP/OUG-34 wording to counsel. |
| P3 currency (EUR) | ⏸ DEFERRED | Needs an FX/product decision; tracked, not fixed. |
| P3 Cool-pill-Spain | ⏸ NOTED | Belongs to the avoidHeat rollout plan (WIP on shade). |
