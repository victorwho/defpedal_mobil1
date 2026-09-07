# Loop Generator — recreational loop routes

**Status:** built 2026-09-06 — core + generator + screen shipped and bundle-verified; rejoin splice, saved-loop storage and route-preview hand-off outstanding (see the implementation record at the end). Screen `/loop-planner`, i18n namespace `loop.*`.

A rider picks distance, terrain, surface and heading and gets loops that start and finish
where they are standing. No destination. Readable form of this design:
https://claude.ai/code/artifact/77d0fdec-2220-4ad4-9244-aeffb52402d9

---

## 1. Three constraints that shaped everything

**OSRM cannot make loops.** `osrm-routed` serves `/route` and `/trip`; neither does
round-trip generation (that is GraphHopper). Loops are synthesized: waypoint ring →
route → measure → adjust radius → repeat.

**Climb is measurable, not requestable.** Profiles are `bicycle36` and `bicycle36-flat`
(7× uphill penalty). There is no hill-*seeking* profile. Elevation comes from Mapbox
Terrain-RGB *after* the route exists (`lib/elevation.ts`). Consequence: **Flat is a real
routing constraint** (route the rings through `osrm-flat`); **Hilly is only a ranking.**
The two behave differently on purpose.

**Offroad difficulty has no data path.** `bicycle36.lua:1165` declares
`excludable = Sequence { Set{'unpaved'} }` — one binary class. `tracktype` (line 1569) and
`mtb:scale` (line 2134) fold into the risk score only; OSRM cannot route on them. A
technicality dial needs new excludable classes → full EU extract/partition/customize
(~7 h) + regression gate + blue-green swap. That is an OSRM_Server project, not a mobile
feature.

**No fallback exists.** Loops need `exclude=unpaved`, `annotation.classes` AND the safety
profile. `routeFeatures.ts:253` records that Mapbox Directions does not populate `classes`
on the cycling profile. So the feature is OSRM-only → **31 countries or nothing.** Outside
coverage the FAB renders dimmed and explains itself, offering the existing
`country_waitlist` signup.

## 2. Controls — four on the sheet, one on the map

| Control | States | Notes |
|---|---|---|
| Start | Current location (default), long-press to move the pin | "Start somewhere else ›" |
| How far | 5/10/15/20/30/40/60/80/100 km, snapped | derived time from rider history, fallback 15 km/h |
| Terrain | Flat / Rolling / Hilly | Flat → `osrm-flat`; others → standard + rank |
| Surface | Paved only / Allow offroad | default seeded by `avoidUnpavedForBikeType` |
| Which way | draggable arc on the map + readout row → 9-option list | a gesture is never the only path |

Distance is the contract; the time estimate is decoration and never promised. Snapped
steps because 23 vs 24 km is a distinction the generator cannot honour.

## 3. Generation pipeline

Client-side, `apps/mobile/src/lib/loop-generator.ts`.

1. **Eight rings** — radius from target, 3 waypoints at 120° spacing, 8 bearings inside
   the heading arc. One OSRM request each: `start;w1;w2;w3;start` with
   `annotations=true`, `steps=true`, `alternatives=false` (forced by waypoints). Free —
   OSRM is our own box, not behind the API rate limiter.
2. **Instance by terrain** — Flat → `osrm-flat`, else standard.
3. **Converge on distance** — adjust radius and re-request until |actual − target| ≤ 12%,
   bounded retry count. Non-converging rings are dropped.
4. **Measure three, escalate only on a miss** — 3 × `/elevation-profile`; if none
   satisfies the terrain ask, spend three more, then declare the miss.
5. **Rank** — least High-risk metres → closest to target distance → closest to terrain ask.

> ⚠ `/elevation-profile` and `/risk-segments` share the **`routePreview` bucket:
> 30 req / 60 s** (`config.ts:114`). Measuring all eight per attempt would let a rider
> rate-limit their own app in three attempts — and take the risk overlay down with it.
> Budget: 3 hits typical, 6 on a miss → ~10 attempts/min available.

**Relaxation ladder** — fixed order, always named on the result card:
heading arc → distance tolerance (±12% → ±25%) → terrain ask.

**Total failure** claims nothing about the cause, because we cannot know it:
*"No 15 km loop from here / The roads around this spot don't join up into one."*
plus [Try 25 km] [Try another direction] [Start somewhere else].

**The wait** (3–8 s on 4G): each candidate draws onto the map as it resolves — faint
while unmeasured, solid when final, fading out when rejected — under a plain counter and
a Cancel. `useReducedMotion` → static list, no fades.

## 4. Navigation — the trap and the fix

> ⚠ **Auto-reroute would delete the ride.** On a loop `destination == origin == start`.
> `buildRerouteRequest` reads destination straight from the store, so auto-reroute —
> which fires unattended 60 s after going off-route — asks OSRM for **the shortest way
> home**. A rider 12 km into a 30 km loop silently loses the remaining 18 km and the app
> looks like it worked. Flat compounds it: `effectiveRouteRequest` (navigation.tsx:796)
> downgrades flat reroutes to Mapbox Fast.

**Fix — rejoin, don't go home.** Reroute retargets to the nearest polyline point *ahead*
of the rider, then splices:

```
route = rejoinLeg ⊕ loop[i..n]
  source  'generated_loop'   ← MUST survive the splice
  steps   leg.steps ⊕ loop.steps
  totals  recomputed
```

HUD says "Back on the loop in 800 m". The leg gets one `/risk-segments` call; on failure
or offline it draws plain and never blocks the rejoin.

**One new field fixes two problems.** `NavigationSession` tracks only `currentStepIndex`
and `lastSnappedCoordinate` — no high-water mark. So rejoin-ahead has nothing to be ahead
of, and a self-crossing loop can snap to the wrong branch and jump
`remainingDistanceMeters` by kilometres. Add a persisted **`furthestVertexIndex`** and
gate a forward-only snap window on it.

Widen the existing predicate rather than adding a second one:

```
- isCourseRoute(r)        // gpx_course
+ isFixedLineRoute(r)     // gpx_course | generated_loop
```

Applied to **all fixed-line routes**, which also repairs figure-8 GPX imports.
Destination routes keep today's behaviour untouched. Needs an escape hatch for a rider
who legitimately doubles back.

## 5. Storage

```sql
-- saved_routes (existing): origin = start, destination = start,
-- waypoints = [ring], mode / avoid_unpaved / avoid_hills
ALTER TABLE saved_routes
  ADD COLUMN is_loop        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN saved_distance INTEGER,
  ADD COLUMN saved_climb    INTEGER;
```

> ⚠ **`is_loop` is not optional.** `origin == destination` is not a safe marker — a route
> home *from* home matches it. Reopening must restore `source: 'generated_loop'`, or the
> reroute retargeting and the forward snap window are both silently lost and §4's bug
> returns on a route the rider trusts.

**Drift notice:** saved loops re-route on open, so a new one-way, a closed bridge or an
OSRM rebuild can reshape them. Compare against `saved_distance` / `saved_climb`; past
~10% show one quiet line: *"This loop has changed since you saved it — now 17.9 km, was
15.4"*.

**Routes sheet:** a third section, LOOPS, beside Saved routes and Imported courses. The
three kinds behave differently (two suppress ordinary reroute, one does not), so keeping
the kind visible keeps the behaviour predictable.

## 6. Metering

`TierLimits.loopSessionsPerMonth: 3 | null`. A **session is 30 minutes from the first
loop drawn** — not a button press. Reuses `flatRoutePeriodKey()`; add `sessionStartedAt`
to the meter.

| Action | Cost |
|---|---|
| First loop drawn | charges 1 |
| Try another, all session | free |
| Change distance, terrain, surface, heading | free |
| Leave the screen and return inside 30 min | free |
| Cancel before any loop draws | free |
| Search returns nothing | free |
| Save / start / ride | free |

Session results **accumulate** into a scrollable list (cap 12) so nothing found is lost
to one more tap.

> ⚠ **Known collision.** Flat terrain routes via `osrm-flat`, which is the metered Plus
> surface, so starting a Flat loop charges `flatRidesPerMonth` *as well as* the loop
> session — two meters for one ride. Show remaining flat rides on the sheet before
> generating, never at the Start button.

## 7. Result sheet

Reuse the `/course-import` layout verbatim: Stat row (distance / est. time / climb),
`ElevationChart`, Busy stretches via the shared `findHighRiskStretches`,
`RiskDistributionCard`, then [Save] [Start ride].

Risk labels stay **unchanged app-wide** — no car-free special case. `RiskSegment` carries
no `highway` field (`risk.ts:129` strips everything but score/category/colour), and adding
one means touching `get_segmented_risk_route`, the RPC that paints every route in the app.
Accepted cost: a car-free technical trail can read "High risk", which the b46v1 severity
claim does not support. Never redeclare `BUSY_ROAD_CATEGORIES` (error-log #20).

## 8. Telemetry

`loop_search_started {km, terrain, surface, heading}` ·
`loop_results_shown {n, best_delta_pct, relaxed}` ·
`loop_search_empty {blocking_constraint}` ·
`loop_saved` · `loop_ride_started` · `loop_ride_completed`.

Answers the three questions that will actually come up: is 3/month too tight, is the
honest miss firing too often, and are loops ridden or only admired (the `loop_saved` →
`loop_ride_started` gap).

## 9. Not in this version

| Cut | Cost if revisited |
|---|---|
| Offroad technicality dial | full EU graph rebuild |
| Numeric climb target | unsatisfiable by design |
| "Ride it the other way" | 1 OSRM call, no home in the sheet |
| Unpaved-share readout | free to compute, nothing to prove with 2 surface states |
| GPX export of a loop | footer already carries two actions |
| Server-side generation + shared cache | new endpoint + deploy |
| Batch elevation endpoint | would raise 3 attempts/min → 30 |

## 10. Open risks

- **3 sessions/month is a guess.** The funnel exists to move that number, not defend it.
- **The rejoin splice is the largest single piece of code here** and runs at the worst
  moment — rider lost, signal poor. It must fail into the off-course banner, never into a
  broken route.
- **The forward snap window touches shipped course navigation.** Size it with a real
  escape hatch.
- Roughly 35 new i18n keys across EN / RO / ES.

---

# Implementation record — 2026-09-06

Built in one session. `npm run typecheck` clean, lint ratchet clean, **3,887 tests
passing** (core 1,114 · mobile 1,769 · api 1,004). Bundle verified **by content** on
Metro :8099 — see the port warning below.

## Where the code lives

| Concern | File |
|---|---|
| Ring geometry, ladder, terrain cuts, ranking, shape checks | `packages/core/src/loopPlan.ts` (+57 tests) |
| 30-minute session quota | `packages/core/src/loopSessionMeter.ts` (+26 tests) |
| Forward snap window, `isFixedLineRoute` | `packages/core/src/{navigation,courseSteps,distance}.ts` (+19 tests) |
| Forward geodesic | `packages/core/src/distance.ts` — `destinationPoint`, `closestPointOnPolylineWithin` |
| Tier limit + gate | `premiumCatalog.ts` (`loopSessionsPerMonth`), `entitlement.ts` (`canFindLoops`) |
| OSRM loop fetch | `apps/mobile/src/lib/mapbox-routing.ts` — `fetchLoopRoute` |
| Orchestration | `apps/mobile/src/lib/loop-generator.ts` (+20 tests) |
| Screen | `apps/mobile/app/loop-planner.tsx` |
| Store + gates | `store/premiumSlice.ts`, `hooks/usePremium.ts` |
| Copy | `src/i18n/{en,ro,es}.ts` — `loop.*` |

## The lollipop shape, and the three bugs that kept it off the screen

A lollipop rides out of town, loops out there, and comes home — the shape a
rider wants when the good riding is not where they live. It shipped broken in
three independent ways, all fixed 2026-09-07 (error-log #109):

1. **It was not a lollipop.** `lollipopWaypoints` offset the ring from the
   start but gave the router no waypoint out there, so OSRM entered and left
   that ring wherever was cheapest. Measured on the live router, the loop came
   back within **40 m of the start** on every candidate. The anchor is now a
   waypoint before and after the ring, so the route has to reach it.
2. **The stem exemption never fired.** It found the approach by matching a
   mirrored prefix of edges, assuming the way home reuses the way out. It does
   not: a literal `start -> X -> start` around Rasnov shares only 78 of 138
   edges. Every lollipop measured a 0 m stem. The stem is now taken from
   construction — the anchor is a leg boundary, so the approach is exactly the
   first and last leg.
3. **The ranking vetoed it anyway.** `rankCandidates` sorted on whole-route
   `retracedShare`, which a lollipop is guaranteed to score badly on. That put
   every lollipop below every plain ring before any preference was read. It now
   compares `ringRetracedShare`, the same figure the cap uses.

**Sizing is by clearance, not stem fraction.** The rider cares how far from
home the loop happens; a fixed third-of-the-budget stem put the ring's near
edge 1.3 km out on a 20 km ride, still inside a small town. Solving
`2·S·d + P·r·d = budget` with `S − r = clearance` targets the thing that
matters directly.

**Known limit, stated plainly.** A lollipop clears the doubling-back cap less
often than a plain ring, because it has to close a loop where the network is
thinner — at Rasnov the budget below ~40 km simply cannot hold both a real
clearance and a ring big enough to find roads. Candidates are sampled 1-in-2
rather than 1-in-3 to compensate. Where the terrain has nothing to offer the
rider correctly gets a plain ring instead.

**The cap is measured on the ring, and that is not a technicality.** A genuine
road loop out of Rasnov through two neighbouring towns measures **0.379**
whole-route — the one road out of the valley is also the one road back — so a
10% whole-route cap rejects every real loop the terrain can offer. The shipped split does not rescue that
case — a plain loop has no stem legs to exempt, so valley plain-rings still
fail the cap. What it rescues is the lollipop: a hand-checked one out of
Rasnov (out to Bran, loop Moieciu-Simon, home; 58.0 km) reads 0.515
whole-route but **0.063 on its ring**.

## Five things the build changed from the design

1. **`terrain_miss` was redundant.** The ladder's last rung *is* the honest miss, so
   there is one status (`ok`) carrying `relaxation` and `checked`. A second failure
   status would have been a second way to say the same thing, and the two would drift.
   Tests caught this.
2. **Measurement costs 6 bucket hits, not 3.** Ranking by least high-risk metres needs
   `/risk-segments` as well as `/elevation-profile` — 3 finalists × 2 calls, or 12 with
   escalation. Still comfortably inside 30/60s for a human tapping a button.
3. **Only 2 of 4 ladder rungs cost network.** `distance` and `terrain` re-filter loops
   already in the pool, so an attempt is capped at 16 OSRM calls, not 32.
4. **Added a shape check the design missed.** A there-and-back closes perfectly, hits
   the target length and is not a loop. `loopRoundness` / `isOutAndBack` reject it by
   comparing maximum excursion against the radius a real loop of that length needs.
5. **The snap window needed an escape hatch, and an ambiguity finding.** On a route
   that retraces itself a position is ambiguous *by construction* — the west end of a
   figure-eight is genuinely both vertex 2 and vertex 117, and the high-water mark is
   the only thing that disambiguates it. Correct behaviour, not a bug. The hatch is for
   a genuinely stale window: re-search unrestricted and let the mark move back.

## Not built yet

- **Rejoin splice.** The safety floor IS in — `navigation.tsx` now gates on
  `isFixedLineRoute`, so a generated loop can no longer be rerouted home. What is
  missing is the *upgrade*: retargeting the reroute onto the nearest point ahead and
  splicing `rejoinLeg ⊕ loop[i..n]`. Today a rider off a loop gets the off-course
  banner, which is the option the design explicitly ranked second.
- **`saved_routes` migration** (`is_loop`, `saved_distance`, `saved_climb`), the Save
  button, the drift notice, and the LOOPS section in the Routes sheet.
- **Hand-off to route-preview.** "Start ride" currently confirms in place; the loop is
  a finished `RouteOption` so the wiring is small, but it is not done.
- Server-side session reconciliation (the local meter is authoritative for now).

## Traps for the next session

- ⚠️ **:8081 is NOT this repo.** It is served from
  `C:\Users\Victor\orca\workspaces\defpedal\Sesizari`. `npm run check:bundle` targets
  :8081 by default and will return a healthy HTTP 200 for a bundle containing none of
  this code. This repo's Metro is on **:8099**. Verify by grepping the bundle for a
  symbol you just added (error-log #103, observed live this session).
- The mobile-api suite has **11 pre-existing failures under file parallelism** — all
  the first test in their file, all auth/health. `npx vitest run --no-file-parallelism`
  passes 1004/1004. Unrelated to this feature.
- `TierLimits` gained a required field. Any future literal must set
  `loopSessionsPerMonth` or it will not compile.
