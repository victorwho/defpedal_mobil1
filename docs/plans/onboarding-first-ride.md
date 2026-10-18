# Onboarding → First Ride

Status: **spec, not built** (2026-10-16). Decisions below were settled in a
grill-me session with the product owner; each is marked **[D#]** so a later
reader can tell a decision from a suggestion.

## Goal

| | Definition | Where measured |
|---|---|---|
| **Goal [D1]** | A new rider taps **Start** on a route they built during onboarding | `trips` row whose `user_id` was created ≤ 24 h earlier |
| **North star [D1]** | That rider **saves** a first ride within 7 days (`trips.end_action IN ('saved','prompt_saved','completed')`) | `trips` ⋈ `profiles.created_at` |

Starts alone will inflate: the median discarded trip is 1 minute (trial
starts, `docs/reviews/gps-tracking-audit-2026-09-10.md`). Never report the goal
without the north star beside it, and never a percentage without its N.

## Today (read from code, 2026-10-16)

`onboarding/index` (welcome + location) → `region-check` → **`signup-prompt`
(mandatory wall)** → `choose-username` → `bike-type` (via
`computePostSignupStepTarget`) → empty `/route-planning` map.

No feature is shown and nothing points at a first ride. The rider's first
look at the product's core value happens after every ask, or never.

## New flow [D2–D6]

Value first, wall second [D2]. Pedal narrates every beat, one line, never over
the route [D7].

| # | Screen (path) | Pedal | What happens |
|---|---|---|---|
| 1 | Welcome + location — `onboarding/index` (existing, re-skinned) | `wave` | Permission ask. Transparency notice footer stays (legal condition of the consent-screen removal). |
| 2 | Region check — `onboarding/region-check` (existing, unchanged logic) | — | Silent pass in coverage. No longer marks onboarding complete — moves to #8. |
| 3 | **Ride intent** — `onboarding/ride-intent` (new) | `map` | Two questions on one screen: *Where to?* chips [D3] and *What do you ride?* chips [D5]. |
| 4 | Destination search — `onboarding/ride-intent` (inline) | — | Only for the commute / specific chips. Same autocomplete as route planning. |
| 5 | **Route reveal** — `onboarding/route-reveal` (new) | `binoculars` → `point` | Loading beat, route draw-on + risk fade-in, then 3 coachmarks [D4]. CTA: **Save this route & ride it**. |
| 6 | Signup wall — `onboarding/signup-prompt` (existing, copy changed) | `stand` | "Create your account to save this route." Route stays visible as a thumbnail above the buttons. |
| 7 | Username — `onboarding/choose-username` (existing, prefilled) [D5] | — | One tap to continue. |
| 8 | **Ride it** — real `/route-preview` with the stashed route restored | `ride` | Primary **Start ride**; secondary **Ride it later** [D6]. Onboarding marked complete here. |

`bike-type` as a separate screen is retired for new installs; its question
moves into #3. `computePostSignupStepTarget` already skips riders whose
`bikeTypePromptSeen` is true, so a rider who answered in #3 is not asked again.
Existing installs mid-flow are unaffected.

### #3 Ride intent [D3, D5]

**Where to?**
- **My commute** (work / school) → search → saved as a Saved Place later.
- **A short, easy ride from here** → on-device loop generator, `placement:
  'around_here'`, target 5 km, **1–2 candidates max** (not the full search —
  the fan-out is several seconds of OSRM calls at the first impression).
  Keeps `source: 'generated_loop'` so reroute stays suppressed.
- **Somewhere specific** → search.

**What do you ride?** Mountain bike · Road or city bike · E-bike · **I don't have one yet** (split from a single "regular bike" on 2026-10-17, owner request). Only **Road or city** turns "Avoid unpaved roads" ON; every other answer sets it OFF explicitly, so changing the answer after going back cannot leave the previous setting behind.
`setBikeType` applies the routing default (`avoidUnpavedForBikeType`) before
the route is computed. "I don't have one yet" is recorded as the new
bike-type id `none` ([D11]) for the near-cyclist cohort.

### #5 Route reveal [D4]

Must live under `/onboarding/*`: `computeOnboardingGateTarget` walls every
non-exempt path for an anonymous session, so the real `/route-preview` cannot
render before signup. The screen **composes the same organisms** as
`route-preview` (`RouteMap`, the comparison card, `RiskDistributionCard`,
hazards on route) rather than drawing a fake — so what the rider learns here
is the screen they use every day (#8). Do not fork those components.

Intro motion: existing route opacity transitions + a draw-on of the line
(≤ 600 ms total; Reduce Motion → instant).

Coachmarks (new `Coachmark` organism — none exists today): spotlight + one
bubble, tap to advance, **Skip** always visible, 44 pt targets, screen-reader
announces each step, suppressed motion under Reduce Motion.

1. **Risk colours** — tier-only wording.
2. **Safe vs Fast** — the time difference.
3. **Hazards on the way** — rider-reported count, or "none reported".

Copy rules (error-prevention #35): name or compare **tiers only**, never two
shades; the validated claim is **severity, not frequency**. Sass goes in the
framing, never in the safety claim.

### #8 Ride it [D6]

- **Start ride** → existing navigation start path (`startTripRecord`).
- **Ride it later** → saves the route (`saved_routes`, or `saved_loops` for a
  loop) and opens a slot picker: *Tomorrow morning / This weekend / Pick a
  time*. This is the contextual moment to request notification permission via
  `ensureNotificationPermissionAsync()`.
  - Local scheduled notification at that slot (±15 min Doze drift is accepted,
    as for the weather ping — no `SCHEDULE_EXACT_ALARM`).
  - Body carries the forecast for that slot from the existing Open-Meteo
    8-day fetch: "Dry, 14°. Your calm route is ready."
  - `data.type = 'first_ride_reminder'` + saved route id. Tap deep-links to
    that route's preview with Start one tap away.
  - The randomized weather pings skip that calendar day.
  - Full new-notification checklist (CLAUDE.md › Notifications) applies.

## Edge cases [D9]

| Case | Behaviour |
|---|---|
| Location denied | Hide the loop chip; search chips remain. No re-prompt. |
| Outside risk coverage (`isRiskDataAvailable(country)` false — use the core predicate, never a local list) | Route still drawn. Skip coachmarks 1–2; Pedal `binoculars`: "We don't have road-risk data here yet, but routes and hazard reports work." Never a fabricated score. |
| Route or loop fails | One silent retry → "Couldn't plan that one. Try another destination." with chips. Second failure → **Skip for now** straight to the wall. Never a dead end before signup. |
| Rider quits before signup | Next open resumes at #1 (onboarding not complete). Stashed route discarded. |

## Engineering traps found while specifying

1. ~~**Signup wipes the route.**~~ **Wrong — corrected 2026-10-17 while
   building step 2.** `UserCacheResetBridge` deliberately skips
   `resetUserScopedState` on the anonymous → real-account transition, so
   `routePreview` survives signup and `finishPostSignupSteps` already opens
   `/route-preview` with it. No device-scoped stash was needed. The real gap
   was narrower: EMAIL signups land on `/`, where `app/index.tsx` clears a
   real account's ROUTE_PREVIEW as stale. The non-persisted
   `onboardingRouteFresh` flag now exempts the onboarding route there. Loops
   never live in `routePreview`, so they are handed over in the (also
   non-persisted) `onboardingLoop` field and started from
   `onboarding/ride-loop` through `beginLoopRide`.
2. **E-bike is Plus-gated.** `bike-type.tsx` opens the paywall when
   `premium.blockEbikeRouting()`. A paywall before the signup wall would be
   the worst possible first impression. Resolved by [D10].
3. **Anonymous cost.** Every rider who reaches #5 costs OSRM + Mapbox +
   `/v1/risk-segments` calls whether or not they sign up. Rate limits already
   apply to anonymous sessions; watch Mapbox usage after launch.
4. **Gate ordering.** Onboarding completion moves from `region-check` to #8.
   `computeOnboardingGateTarget` sends an anonymous rider with
   `onboardingCompleted === false` back into the intro — check that a
   hard-close between #6 and #8 (account exists, onboarding incomplete) lands
   on #8 with the stashed route, not on #1.
5. **Apple 4.8.** The signup wall still offers Sign in with Apple wherever
   Google is offered; moving it later does not change that.

## Rollout and measurement [D8]

**Baseline (measured 2026-10-16, `scripts/onboarding/first-ride-baseline.sql`,
production installs only):**

| Week of | Installs | Signed up | Started ≤24 h | Saved ride ≤7 d |
|---|---|---|---|---|
| 2026-08-31 | 335 | 41 | 16 | 2 |
| 2026-09-07 | 189 | 38 | 13 | 2 |
| 2026-09-14 | 85 | 50 | 16 | 3 |
| 2026-09-21 | 46 | 29 | 15 | 5 |
| 2026-09-28 | 48 | 26 | 8 | 2 |
| 2026-10-05 * | 432 | 290 | 47 | 6 |

\* 7-day window not yet closed. Over the nine closed weeks Aug 3 – Sep 28:
356 signed up, 121 started within 24 h, 25 saved a ride within 7 days.
Volume is higher than the ~28 sessions/48 h figure suggested, but the north
star is still **2–6 riders a week**, so A/B testing remains out. Installs
include anonymous profiles that never progressed (reinstalls, campaign
spikes), so read signup rate with care.

- **All fresh installs**, behind the remote kill switch in [D12]. **Fails
  CLOSED** to today's flow for the first release (same rule as
  `LOOP_SERVER_ENABLED`). Flip to fail-open once the cohort data holds.
- **Baseline first, before any code ships**: server-side, per weekly signup
  cohort — trips started ≤ 24 h and saved rides ≤ 7 d after
  `profiles.created_at`. PostHog before v0.2.160 is unreliable
  (`identify(null)` bug) and must not be the baseline.
- **No A/B test.** At 2–6 saved first rides a week the north star cannot
  reach significance; compare cohorts with N stated.
- PostHog events, all prefixed `onb_`: `onb_intent_selected {intent,
  bikeType}`, `onb_route_shown {mode, riskAvailable, isLoop, ms}`,
  `onb_coachmark {step, action: next|skip}`, `onb_route_failed {reason}`,
  `onb_cta_save_tapped`, existing `signup_wall_shown` (now with `source: route_reveal|intro`) /
  `signup_completed` (keeps `source: 'wall'` so the registration-funnel
  dashboard is unchanged, adds `from: route_reveal|intro`), `onb_ride_now`, `onb_ride_later {slot}`,
  `onb_reminder_tapped`, `onb_route_skipped {reason: no_location|route_failed}`.

## Copy (EN draft — RO/ES after approval)

Voice: Pedal, sassy but softer than the nudges [D7]. No exclamation marks in
safety lines.

| Beat | Line |
|---|---|
| #1 wave | Hi, I'm Pedal. I find the calm roads. |
| #3 map | Where are we riding? |
| #3 bike | What do you ride? |
| #3 chip | I don't have one yet |
| #5 loading | Scouting the quiet streets… |
| Coachmark 1 | Green is calmer, red is busier. This route keeps you on more of the green. |
| Coachmark 2 | The fast way saves {{minutes}} min and puts you on more busy road. Your call. |
| Coachmark 3 | {{count}} hazards reported by riders on this route. / No hazards reported on this route. |
| #5 CTA | Save this route & ride it |
| #6 wall | Create your account to keep this route. |
| #8 ride | It's ready when you are. |
| #8 later | Ride it later |
| Reminder | {{weather}}. Your calm route is ready. |
| No coverage | We don't have road-risk data here yet, but routes and hazard reports work. |

Coachmark 1 must not say or imply that red roads are where crashes happen
*more often*; if a severity line is wanted: "busier roads, where crashes tend
to be more serious".

## Resolved questions (2026-10-16)

1. **[D10] E-bike for Plus-locked riders in #3:** record `bikeType = 'ebike'`,
   route on Safe, no paywall anywhere in onboarding.
2. **[D11] "I don't have one yet" is a new `BikeTypeId`** (`none`, in
   `packages/core/src/bikeTypes.ts`). Checked 2026-10-16: the server stores no
   bike type on `profiles`; it only receives `bikeType` as a free string
   (`maxLength: 50`, no enum) on trip start/track/impact and copies it to
   `trips.bike_type` / `trip_tracks.bike_type`. So no migration and no deploy
   ordering. What `none` must handle: `isBikeTypeId`, the locale-aware bike
   detection in `bikeTypes.ts`, `avoidUnpavedForBikeType` (return null), the
   calorie/microlives path (a `none` rider who rides is on a borrowed or rental
   bike — treat as acoustic), and the Profile bike picker (label in EN/RO/ES).
3. **[D12] Kill switch = a field on `GET /v1/profile`**, same pattern as
   `loopServerEnabled`: env `ONBOARDING_FIRST_RIDE_ENABLED` on Cloud Run,
   returned as `onboardingFirstRideEnabled`. That route uses `requireUser`
   (`requireAuthenticatedUser`), which accepts the anonymous session every
   fresh install already has, so it is readable before signup — no new
   endpoint. Rules:
   - The decision is taken **once, at the end of region-check** (#2 → #3),
     not at app start — by then anonymous sign-in and the profile read have had
     several seconds.
   - **Fails closed**: profile not loaded, request failed, or field absent
     (older server) → today's flow.
   - The answer is **persisted per install** once the server has actually
     answered, so flipping the switch mid-flow never strands a rider between
     two flows. A timeout or failed read runs today's flow for that pass and
     is NOT persisted (code review 2026-10-17): a slow first launch must not
     lock the install out of the new flow for good.
   - Cost of the decision: region-check now waits up to 2.5 s for the profile
     read on a fresh install, on BOTH flows (normally well under that).
   - Add the field to the Fastify response schema or it is stripped
     (CLAUDE.md gotcha #9), and test that an anonymous session receives it.
   - PostHog feature flags were rejected: analytics can be switched off by the
     rider, and a kill switch must not depend on analytics consent.
4. **[D13] Reminder starts count toward the goal** when the ride starts within
   24 h of signup, tagged `source: 'reminder'` so the two paths can be split.

## Build order

1. ✅ Baseline query + kill switch, server half — LIVE 2026-10-17 on Cloud Run
   `defpedal-api-00182-km7` (main `0407a10`, deployed by digest
   `sha256:b777f781…`; verified with a throwaway anonymous session: field
   present, `false`). Switch is OFF.
   The client read + per-install persistence lands with step 2, where it has
   a consumer.
2. ✅ Built 2026-10-17 (not yet device-tested, not released): client half of
   the switch (decided once at the end of region-check, persisted per install,
   fails closed — including when the profile read throws synchronously),
   `onboarding/ride-intent`, `onboarding/route-reveal` (no coachmarks yet),
   `onboarding/ride-loop`, "keep this route" copy on the wall, prefilled
   username, bike type `none` (Profile picker + legacy bike-type screen too),
   comparison copy extracted to `src/lib/routeComparisonCopy.ts` and shared
   with `/route-preview`. Deviations from the spec, deliberately:
   - **Location denied hides BOTH ways to route**, not only the loop: an A-to-B
     route needs a start too. The screen explains and offers **Skip for now**
     to the wall.
   - **A failed route offers "Try another" AND "Skip for now" at once**,
     rather than skip only after a second failure.
   - Bike answers map to ids: Mountain → `mountain`, Road/City → `city`
     (shows the existing "we'll turn on Avoid unpaved" line), E-bike → `ebike`,
     none → `none`.
   - The loop screen (#8) has **Maybe later**, which drops the hand-off and
     opens the planner. Until step 4's "Ride it later" exists, a rider who
     does not want to ride now would otherwise be bounced back to it.
   Still to verify on a device: Google, Apple and email signups each reach the
   kept route (A-to-B and loop); a hard-close between signup and #8 lands on
   the planner (expected — the hand-off is in memory only).
3. ✅ Built 2026-10-18 (not device-tested): `Coachmark` organism
   (`src/design-system/organisms/Coachmark.tsx`) — dims everything but the
   target, one bubble with Next/Got it/Skip, Android back skips, a step whose
   target is not on screen is skipped, announced to screen readers, motion via
   FadeSlideIn. Runs once per app session, after the hazard count settles.
   Steps: **risk** (spotlights the map; names the three tiers), **compare**
   (the Safe-vs-Fast card; "N min quicker, with more High-risk road" only when
   the busy-road saving is real, otherwise a neutral line), **hazards** (a new
   hazard row on the reveal). Outside risk coverage only the hazard step runs.
   The hazard count comes from up to four `/v1/hazards/nearby` reads along the
   route (radius 5,000 m, centres 8 km apart, reports within 40 m of the line);
   a route too long for four reads shows no hazard claim at all
   (`src/lib/routeHazards.ts`). Also no claim when any read returns the
   server's 200-row cap (`get_nearby_hazards` default `p_limit`) — in
   Amsterdam or under the UK imports a 5 km circle holds thousands of
   reports and a truncated read would say "none" falsely — or takes over 4 s.
   The hazard coachmark does NOT promise an alert: imported reports with
   `alertEligible=false` never fire one (code review 2026-10-18).
4. ✅ Built 2026-10-18 (not device-tested — needs a PREVIEW build, dev's
   bridge mode hides bridgeless notification failures): "Ride it later" on
   `/route-preview` (only on the arrival from onboarding) and on
   `onboarding/ride-loop`. Slots: **Tomorrow morning 08:00 / Tomorrow evening
   18:00 / This weekend 10:00** (first Sat/Sun at least 2 h away). Deviation:
   no "Pick a time" — a clock picker would be a new native module; the three
   fixed slots replace it. Route: saved to the account, and the reminder still
   schedules if that save fails because the payload carries the route itself.
   Loop: saved like loop-planner does (account, then local cache); a failed
   save is a failure, since the reminder reopens the saved loop. One local
   notification (`first-ride-reminder`, channel `ride-reminder`), body
   "14°, 10% chance of rain. Tap to ride it." from Open-Meteo for that day.
   Tap → `/route-preview` with the route, or `/loop-planner?loopId=`; never
   during a ride; payload validated. The weather ping skips that calendar day
   (`firstRideReminderAt`), and a reschedule runs immediately. Rides started
   after a reminder tap emit `onb_ride_now {source: 'reminder'}` [D13].
5. RO/ES copy, render tests, bundle-content check, preview build, device pass
   in and out of coverage, then fresh-install production release.

## Audit fixes (2026-10-18)

An audit against published onboarding research (notification opt-in timing,
deferred signup, time to value, tour length, implementation intentions)
found four gaps; all four were fixed the same day. NOT deployed, NOT in a
preview build yet.

1. **No unexplained notification dialog at signup.** For first-ride installs
   the weather scheduler stays silent until the rider has ridden once and is
   back on an idle screen, at most once per session
   (`src/lib/weatherPermissionTiming.ts`, `DailyWeatherScheduler`). Before
   that, the only ask is inside "Ride it later", which now says what the
   notification will be first ("I'll send you one reminder, with that day's
   weather"). Older installs are unchanged.
2. **First ride before signup — behind `ONBOARDING_ANONYMOUS_RIDE_ENABLED`**
   (server, default OFF, delivered on `GET /v1/profile` as
   `onboardingAnonymousRideEnabled`; client fails closed and re-reads it on
   every reveal, so turning it off reaches installs that already decided).
   When on: the reveal's main button is **Ride it now** (A-to-B → the real
   `/route-preview`; loop → `onboarding/ride-loop`), with "Save it to an
   account instead" as the alternative. The gate lets that anonymous rider
   reach `/route-preview` (and `/loop-planner` only with a pending loop
   reminder) until one ride is done; leaving sends them to
   `/onboarding/ride-intent`, never the welcome screens; after the ride the
   wall asks to **keep this ride**. Rides already sync anonymously
   (`requireWriteUser`) and `merge_anonymous_account` re-parents them —
   into a FRESH account only, so the copy says "create a new account".
   ⚠️ Trades against the mandatory-registration decision (community trust):
   that is why it is a separate switch.
3. **Earlier follow-up.** Leaving the onboarding route preview without riding
   or setting a reminder offers "Ride it later" once ("Not riding now?"). The
   server's `first_ride_nudge` moves from 48 h to 24 h after signup
   (`FIRST_RIDE_NUDGE_DELAY_HOURS`) — needs the API deploy.
4. **Welcome-screen claim removed.** "2.1× safer than Google Maps — measured
   in Romania & Spain" predates the 32-country footprint; re-measure before
   restoring it.

Not changed on purpose: the tour still starts automatically. Self-started
tours complete more often, but completion is not the goal; decide on the
`onb_coachmark` skip rates.
