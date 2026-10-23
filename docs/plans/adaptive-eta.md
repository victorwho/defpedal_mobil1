# Adaptive ETA: every ride time at the rider's own pace

Status: Phase 1 in progress (2026-10-21). Step 1 built (`0771736`):
`resolveEtaPace`, `personalRideSeconds`, `paceSlice`, `useRiderPace`, the
Display setting, and the commute briefing on top of them. Route preview
and its comparison line built (`4b15d9c`; device check deferred to the
phase 1 preview pass). Map screen-reader summary, course screen, HUD, loop planner and
`eta_accuracy` built. Phase 2 built (`adaptiveEta.ts`, `hud-eta.ts`);
on E-bike it still blends, since the ride's own speed is the right bike.
Phase 3 built (`7c1787e`): migration `202610210001` live, API
`defpedal-api-00185-724` deployed. The client half ships with the next
build. Loops are routed on the standard graph, so a loop on an e-bike
records the bike but no prediction, and its time is not scaled by the
e-bike factor. Next: the preview build and device pass.

## Problem

Every time the app shows for a ride is the router's, the same for every
rider: route preview, the safe-vs-fast comparison, the navigation HUD
(remaining time and arrival clock), the map's screen-reader summary, and the
GPX course screen. A rider who rides faster or slower than the profile
assumes is told the wrong time on every ride, by about the same amount, and
the in-ride ETA never learns from how the current ride is actually going.

GPX courses are worse: their time is distance at a fixed 15 km/h
(`DEFAULT_COURSE_SPEED_MPS`) plus the app's climb penalty.

Only the loop planner (`riderPace` + `rideMinutes`, core) and, as of today,
the commute briefing use the rider's pace.

## Measured constraint

There is no single "router speed" to scale a rider's pace against. The safe
router's own average speed across four flat city routes was 12.9, 13.7, 14.5
and 19.1 km/h (live `osrm.defensivepedal.com`, 2026-10-21). Its durations
carry turn costs, signals and road class, not one cruising speed. So
"router time x (default speed / your speed)" is wrong by up to ~45% on a flat
route, and the plan does not use it.

## Approach: three layers, each shippable alone

### Phase 1: the rider's pace before the ride (client only)

Same method the loop planner already uses, applied everywhere a time is shown
before or at the start of a ride.

- **Core:** one function, `personalRideSeconds(route, pace)`. With a personal
  pace (>= `MIN_RIDES_FOR_PACE` usable rides): `rideMinutes(distance, climb,
  pace.kmh)`. Otherwise the router's `adjustedDurationSeconds`, unchanged.
  The commute's `commuteRideSeconds` becomes a call to it.
- **Mobile:** `useRiderPace()` hook over the existing `['trip-history']`
  query (already shared by six screens, so no new request). The last computed
  pace is persisted in a small user-scoped store field, so offline and cold
  starts still show a personal time; it is cleared by
  `resetUserScopedState()` on account switch.
- **Surfaces:** route preview (2 places), `RouteComparisonPanel` (both routes
  through the same function, so the "+X min for a calmer ride" gap stays
  honest), `useMapA11ySummary`, course import (replaces the fixed 15 km/h),
  the navigation HUD's starting remaining time, and the commute briefing.
- **Label:** a personal time says so ("at your pace"); a router time keeps
  today's wording. Same rule as the loop planner: never present the default
  as a measurement.
- **E-bike until Phase 3:** history can't tell the bikes apart yet, so with
  E-bike selected the estimate stays the e-bike router's time (that graph
  already models a 25 km/h pedelec). The personal pace applies only to the
  normal-bike modes until per-bike history exists.
- **Display only.** `adjustedDurationSeconds` stays the router's value
  everywhere it is DATA: the navigation session, the feedback payload
  (`feedback.tsx`), trip records, saved routes, share payloads. A shared
  route then shows each recipient their own pace automatically.

### Phase 2: learning from the ride in progress

This is the part that answers "does it adapt to my speed on this ride".

- **Core:** `adaptiveRemainingSeconds({ remainingDistance, remainingClimb,
  priorSeconds, ridden })`. It blends the Phase 1 estimate for what is left
  with the speed actually observed on this ride.
- **Observed speed:** distance ridden / time elapsed since the ride started,
  from the sanitised breadcrumbs (`sanitizeBreadcrumbs`, error-log #53).
  Stops at lights stay in, because they will happen on the rest of the ride
  too. A stationary gap longer than 2 minutes is taken out (a cafe stop is
  not riding pace).
- **Weight:** the observed speed's weight grows with distance ridden, from 0
  at the start to a cap (proposed 0.7 after 3 km), so the ETA doesn't lurch
  in the first few hundred metres and the history still counts on a short
  ride.
- **Where:** computed for the HUD only (remaining time and arrival clock).
  The persisted `navigationSession.remainingDurationSeconds` and reroute sync
  are untouched (`syncSessionToRoute`, error-log #136: nothing read in the
  per-fix effect may depend on the session).
- Reroutes keep the observed speed (same rider, same ride); a GPX course and
  a loop get it too.

### Phase 3: calibrating against the router (server + client)

Phase 1 throws away what the router knows (signals, turns, road class). The
better long-term number is "how this rider compares with the router":
the median of actual ride time / router-predicted time over past rides.
That needs the prediction stored, which it isn't today.

- **Migration:** `trips.planned_route_duration_seconds` (nullable, no
  default; NULL = not recorded). Written by `startTripRecord` from all three
  start paths, alongside the planned distance it already writes.
- **API:** add the field to the trip-start schema and to
  `GET /v1/trips/history`. Order: migration, then API, then app (an old
  server strips the field, pinned by `routes-v1.test.ts`; the history read
  must be verified live, error-log #83b).
- **Core:** `riderRouterFactor(history)`: median of actual/planned over
  completed, saved rides with no reroute and at least 1 km. Personal once
  there are >= 3. `personalRideSeconds` prefers it over Phase 1's pace.
- **Mobile:** nothing new to show; the numbers just get better. They take
  weeks to arrive because no past ride has a prediction stored, and there is
  no backfill.

## Known limits of Phase 3 (independent verification, 2026-10-21)

- ~~`is_ebike` records the E-bike routing MODE, not the bike.~~ Resolved
  2026-10-22: the pace follows the Profile bike (decision 1, revised).
- **One router factor is pooled across routers.** Safe, Flat, Cool (OSRM
  graphs) and Fast (Mapbox Directions) feed the same median, which is then
  applied to whichever mode is chosen. If the routers are biased
  differently, the factor carries that across modes. Check with
  `eta_accuracy` split by mode before keying the factor per router.
  Since the bike now comes from Profile this also covers the graphs: an
  e-bike owner's factor pools rides on the e-bike graph and on the standard
  one (Safe, Flat, Cool, loops), whose predictions differ by 7-30%. Read
  `eta_accuracy` by `ebike_routing` before splitting it.
- **A ride on someone else's bike counts for the Profile bike.** The bike is
  what Profile said at the time, not what was ridden.
- ~~The first ride recorded on the e-bike drops unrecorded older rides from
  the normal pace.~~ Resolved 2026-10-22: every ride has a bike, so nothing
  is dropped.
- Fixed before shipping: the in-ride ETA and `eta_accuracy` applied the
  factor to a GPX course's fixed-speed time and to an e-bike loop's
  standard-graph time. `routerTimeIsEstimate` (core) is now the one rule.

## Device pass (Android emulator, 2026-10-22)

Preview build at `6a78fca` (x86_64 APK), API `00186-2w8`, test account
`eta-emulator-test-20261022@example.com` (kit and credentials outside the
repo: `C:\Users\Victor\defpedal-ops\emulator-test\README.md`). Three rides
replayed with fake GPS (actual / router 0.71, 0.57, 0.67 → factor 0.68).

- Under 3 rides: router time, no label. After 3: preview "7 min at your
  pace" (router 10 min), comparison "+2 min at your pace for a calmer ride",
  HUD 7 min with no label, commute briefing "about 6 min at your pace"
  (Diagnostics reports "router time x 0.68").
- Display switch off: "10 min", "+3 min for a calmer ride", no label.
- Fixed after the pass: the Display subtitle still said "(not in E-bike
  mode)", stale since the pace follows the Profile bike; and "7 min" and
  "at your pace" ran together in the expanded summary.
- Not tested: the Profile bike on E-bike (it sits behind Pedal Plus and the
  test account has none), the course screen, Phase 2's in-ride blending (the
  replay rode at a constant speed).
- Open: the collapsed peek strip shows the pace time without the label (the
  screen reader label has it).
- Testers (preview v0.2.198): the label overlapped the climb in the expanded
  summary. It now sits under the time; fixed in v0.2.199, checked on the
  emulator.
- Testers (preview v0.2.199): a 16 km ride previewed at 3 h 27 "at your
  pace". The rider had enough rides for an average speed but no router
  factor yet, so the time came from average speed plus the climb penalty,
  which charged 10 m of climb as one flat km. Fixed in v0.2.200: the
  penalty is 60 m per flat km (`CLIMB_METERS_PER_FLAT_KM`), the label has
  its own line under the summary strip, and decision 4 below. Checked on
  the emulator (factor 0.68): 30.2 km reads "1h 15m" with the climb in
  full and the label below; the no-factor path is covered by tests only.

## Measuring it (all phases)

There is no way today to tell whether any ETA is right. From Phase 1:

- At ride end, for a completed ride with no reroute, capture `eta_accuracy`
  with the router's prediction, the personal prediction, the actual time and
  the method used (`router` / `pace` / `factor`).
- Success: the personal error is lower than the router's at the median and
  at p80, across riders with >= 3 rides. Report the number of rides next to
  every figure (low volume, see the release-health memory).
- Phase 2's weights (2 min gap, 3 km, 0.7) are proposals. Tune them from
  this data, not by reasoning (error-log #111).

## Decisions (product owner, 2026-10-21)

1. **A separate pace per bike.** Trips don't record which bike was used
   today (`routing_mode` is `safe` for both). Phase 3 adds
   `trips.is_ebike` (nullable, no default; NULL = not recorded), written at
   trip start from the store's `isEbike`. Pace and router factor are then
   computed per bike, and the estimate uses the pace for the bike currently
   selected. Rides from before the column count for the normal bike only
   when the rider has never selected E-bike; otherwise they are left out
   rather than guessed.
   **Revised 2026-10-22 (owner):** the bike is the one picked in Profile
   (`bikeTypeId`), which every ride already stores on
   `trip_tracks.bike_type`, so history knows the bike for every ride and
   both paces are kept: no ride is dropped from either, and no bike picked
   counts as a normal bike. The E-bike routing mode no longer chooses the
   pace. `trips.is_ebike` stays, recording the routing mode, which
   `eta_accuracy` reports as `ebike_routing` beside `is_ebike` (the bike).
2. **Labels:** "at your pace" on route preview, the comparison and the
   course screen; no label in the navigation HUD.
3. **A setting to switch back.** Profile > Display: "Ride times at my pace"
   (`useRiderPaceEta`, default ON, persisted, device-scoped like the other
   Display toggles). OFF shows the router's time everywhere, including the
   commute briefing, and Phase 2's in-ride blending is off too. Built in
   Phase 1, together with the hook, so every surface reads one switch.
4. **A router's time stands until there is a router factor (2026-10-23).**
   The average-speed estimate is no longer used on a route a router timed:
   A-to-B routes, loops on the standard bike, the comparison, the commute
   briefing and the HUD prior show the router's time, unlabelled, until 3
   completed rides carry a router prediction; then router time x factor.
   Rides with no router time (GPX courses, loops planned on an e-bike,
   `routerIsEstimate`) still use the average speed once the rider has 3
   rides, because they can never get a factor. One predicate,
   `paceAppliesTo` in `packages/core/src/riderPace.ts`, decides both the
   number and every "at your pace" label.

## Starting point

The commute briefing already uses the rider's pace (uncommitted on main,
2026-10-21: `commute-messages.ts`, `commute-notification.ts`, `etaPersonal`
in EN/RO/ES). It ships as part of Phase 1, refactored onto
`personalRideSeconds`.

## Order of work

1. Phase 1 core function + hook + persisted pace + the Display setting,
   with tests.
2. Phase 1 surfaces, one commit each, plus `eta_accuracy` telemetry.
3. Preview build, device pass: preview, comparison, course, HUD start.
4. Phase 2 core function (tests on recorded breadcrumb fixtures, including
   a stop at lights and a cafe stop), then the HUD.
5. Device ride: ETA should settle toward the arrival actually reached.
6. Phase 3: migration (`planned_route_duration_seconds` + `is_ebike`), API
   deploy, client, verified live in that order.
