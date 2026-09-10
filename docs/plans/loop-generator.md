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

## The sizing model, and how it was wrong for the feature's whole life

Every constant below was MEASURED against the live safety profile, not
reasoned about. The originals were guesses, and each guess was wrong in a way
that no test could see because the tests asserted self-consistency rather than
agreement with the road network.

**Ring detour: 1.25 guessed, 2.11-2.54 measured.** 120 rings in five cities
(Rasnov, Brasov, Bucharest, Cluj, Timisoara) at 15/30/50 km. Three-point rings
realise a median 2.11x the ideal polygon perimeter, six-point 2.54x. At 1.25
every first attempt came back about 86% too long; one damped correction reaches
only ~26% off; the tolerance is 12%. With a two-attempt budget essentially
NOTHING landed — at Bucharest 30 km, zero of ten rings passed the distance
gate. The search therefore relaxed its own distance filter on every run, which
is why loops came back the wrong length and why so few survived. Fixed: the
gate went from 0-1 of 5 to 4-5 of 5. `ringDetourFactor(n)` is shape-aware
because a hexagon detours a fifth more than a triangle.

**Stem detour: 1.86, measured separately.** A lollipop's stem is a
point-to-point ride that can take the direct road; a ring is dragged through
waypoints no single road serves. Using the ring's factor for both skewed the
split between how far out the loop sits and how big it is.

**`MAX_RADIUS_ITERATIONS` is 3, not 2.** With the first guess right most
candidates return on attempt one or two and never spend the third, so average
cost is LOWER than the old two, where nearly every candidate used both and
still missed.

## Two kinds of repeated road, and only one of them is a complaint

`ringRetracedShare` counts every metre ridden twice. That single number hides
two things a rider experiences completely differently:

- A **spur** is an out-and-back excursion hanging off the ride. It is what
  makes a loop stop feeling like one ride.
- A **shared corridor** is leaving town on the one road out and returning on it
  at the end. Also repeated road, structurally unavoidable in a valley, and it
  still reads as a loop.

Measured at 30 km: Bucharest rings retrace 0.15-0.30 but spur 0.00-0.03 — all
corridor. Around Rasnov the same aggregate range hides individual spurs of 6.0,
6.8 and 4.0 km.

**A spur ends in a U-turn**, so the same edge appears twice IN A ROW with the
edges either side mirroring outward. A corridor's two passes sit at opposite
ends of the ride and are never adjacent. `spurMeters` matches that mirror
exactly — no geometry, no distance threshold. Excursions under
`MIN_SPUR_METERS` (200) are ignored: a U-turn at a junction is how roads work.

`MAX_SPUR_SHARE` is 0.08, chosen from the gap in the data — loops that read as
one ride cluster at 0.00-0.03, loops that read as a loop plus errands at
0.15-0.34, and nothing observed lands between. Ranking settles spurs BEFORE the
aggregate figure, which is what matters where the cap has to bend: the rider
gets the least spurry loop rather than an arbitrary one.

## The doubling-back cap was unreachable at 0.10

Exactly ONE of 40 candidates passed it. Typical ring-retrace is 0.14-0.39 in a
dense grid and 0.27-0.68 out of a valley town. A filter nothing can satisfy is
not strict, it is inert: the ladder reached its last rung on essentially every
search and the cap was bent every time, so what reached the rider was decided
by ranking alone. The note under each result fired on nearly every loop too,
and a warning that always fires carries no information.

Now 0.35, where it binds. A pure out-and-back still fails outright — it has no
ring at all, so it scores 1 by construction and cannot pass any threshold below
that.

## Around Rasnov the spur cap still bends, and that is honest

Every loop measured there at 30 km has a spur above 0.08. The rider gets the
least spurry one, labelled. The terrain may simply not hold a spur-free 30 km
loop; if that reads badly on the road the answer is a longer minimum distance,
not a tighter cap.

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

---

# Server-side generation — 2026-09-10

Loop generation moved off the handset. The app now makes **one** request,
`POST /v1/loops`, and the server does the whole fan-out. Behind a flag, with the
on-device generator untouched and still reachable, until the new path is
validated.

## Why it moved

Not because the phone was slow. Because of what it was carrying.

| Per loop search, before | Count |
|---|---|
| OSRM requests, typical | 10 to 20 |
| OSRM requests, worst case | about 60 |
| Enrichment calls to our API | 15 to 45 |
| Bytes per OSRM ring response, measured at Bucharest 15 km | 165 KB |

So a single search pulled **1.6 to 5 MB** over mobile data and discarded all but
five loops. Worse, the enrichment calls — `/v1/elevation-profile`,
`/v1/risk-segments`, `/v1/scenic-segments` — share the `routePreview` bucket at
30 requests per 60 seconds. Five finalists cost fifteen, an escalation fifteen
more, the cap-rescue branch another fifteen: **one unlucky search could exhaust a
rider's own budget and take the risk overlay down with it for the next minute.**

Server-side those three are in-process function calls. No HTTP, no bucket. What
bounds the work instead is a `loopSearch` rate limit on the endpoint itself,
which is the right place for it — one bound on one rider action, rather than a
shared bound on an internal step of it.

Measured end to end against the live router from a developer machine: **1.3 s**
for a complete 15 km Bucharest search, twenty candidates routed, five offered.
The design doc budgeted 3–8 s on 4G for the client path. The enrichment half was
NOT measured locally (that checkout has no API credentials), so the real figure
is higher than 1.3 s and lower than the client path — do not quote 1.3 s as the
end-to-end number.

## Where it lives, and what did NOT move

In the existing API — `services/mobile-api/src/lib/loops/` plus
`routes/loops.ts` — not in a new service next to OSRM. The deciding factor was
that loop quality does not come from OSRM alone: climb comes from Mapbox terrain
tiles, risk and scenery from Supabase, and all three already live behind this
API with its credentials, auth, rate limiting and deploy pipeline. Placing the
service beside OSRM would have made the routing half free and the measuring half
a long hop, plus a change to the OSRM box for no gain.

**Nothing on the OSRM deployment changed.** No nginx edit, no new container, no
profile or data change.

`packages/core/src/loopPlan.ts` still owns every product decision — ring
geometry, the convergence controller, terrain cuts, the ladder, the caps, the
ranking. Both implementations import it. Only the sequencing was ported.

## The contract

```
POST /v1/loops
{ "start": {"lat":44.4268,"lon":26.1025}, "targetDistanceMeters": 15000,
  "terrain": "flat|rolling|hilly", "surface": "paved|any|offroad",
  "heading": "any|N|NE|E|SE|S|SW|W|NW", "locale": "en|ro|es" }
```

Answers newline-delimited JSON, one frame per line:

```
{"type":"candidate","loop":{ ... }}
{"type":"progress","resolved":3,"attempted":5}
{"type":"result","status":"ok","loops":[ ... ],"relaxation":"heading","checked":5}
```

It streams because the planner draws each loop onto the map as it lands. A
buffered response would replace that with a spinner over the same wait.

⚠ **It always ends with exactly one terminal frame** — `result`, `empty` or
`error`. A truncated stream and an empty result are otherwise indistinguishable,
and one of them is a failure nobody would ever see. The client treats a stream
ending without one as an error.

⚠ **Failures after the first byte are frames, not status codes.** Headers leave
before the search can fail. Everything checkable up front — auth, body,
rate limit, coverage — answers with a real status; anything later is an `error`
frame on a 200.

⚠ **Turn instructions arrive in English and the client rebuilds them.** OSRM
ships no instruction text and the phrase catalogue lives in the app's i18n
layer. Rendering what the server sends would put English turn cues in front of
every Romanian and Spanish rider.

⚠ **`toNavigationSteps` reads EVERY leg.** A ring has four legs and a lollipop
six. The server's existing `normalizeRoutePreviewResponse` reads `legs[0]`,
which is right for the single-leg A-to-B routes it was written for and would
give a loop rider turn-by-turn for the opening quarter of the ride and silence
after that. That is why loops build their own route object rather than reusing
that normaliser. Measured on a real response: 94 steps across four legs, 28 in
the first.

## The flag

`LOOP_SERVER_ENABLED` on Cloud Run, surfaced to the client through
`GET /v1/profile` as `loopServerEnabled` — the same channel the Sesizări kill
switch uses, so flipping it takes effect on the rider's next app open with no
store release.

It **fails closed**, which is the opposite of every other switch in this
codebase, and the asymmetry is deliberate: those guard shipped features where
darkening them is the regression, this one guards the unvalidated path where
serving it by accident is. An older server, a failed profile read and a fresh
install all mean "use the on-device generator".

```bash
# on
gcloud run services update defpedal-api --region europe-central2 \
  --update-env-vars LOOP_SERVER_ENABLED=true \
  --project gen-lang-client-0895796477
# off
gcloud run services update defpedal-api --region europe-central2 \
  --update-env-vars LOOP_SERVER_ENABLED=false \
  --project gen-lang-client-0895796477
```

A dev or preview build can override with `EXPO_PUBLIC_LOOP_GENERATION_SERVER`,
in both directions. Ignored on production builds, gated on BOTH `appVariant` and
`appEnv` like the cool-mode and diagnostics gates.

⚠ **There is no silent fallback.** A failed server search shows a failure, not
"no loops here". Those are completely different to a rider — one says change
your distance, the other says try again — and folding the second into the first
is exactly how a broken rollout looks healthy.

## Holding the port honest

`services/mobile-api/src/__tests__/loops-parity.test.ts` runs BOTH orchestrators
over one deterministic fake router and compares the ranked output field by
field, plus the request budget, the measurement count and the order candidates
are drawn. Seven scenarios.

It was mutation-tested rather than trusted. Four deliberate divergences
introduced into the server copy, all caught: swapping two rungs of the ladder,
halving the measured finalists, dropping a cap-rescue sweep, and changing ring
concurrency. Two gaps were found and closed that way — the first version could
not see a ladder reorder (no scenario forced the ladder to climb) and could not
see a concurrency change (the fake resolved instantly). The delay added to fix
the second was `setTimeout`, which made the test flaky at 1–5 ms; it counts
microtasks now, which is deterministic and immune to machine load.

`__fixtures__/` holds four responses captured from the live router on
2026-09-10, with the request geometry that produced each. Real, because three
features in this codebase shipped dead while their tests passed against
hand-built fixtures in the shape the code assumed (error-log #113).

## Two live defects found while porting — BOTH FIXED

Both were pre-existing and both were in the shipped app. Both are fixed in every
implementation at once: a defect fix that lands on one side only would make the
feature flag change behaviour, which is the one thing it must not do.

Both were found by probing the live router rather than by reading code, and in
both cases the first write-up OVERSTATED the impact by generalising from a
single sample. The corrected numbers are in each section, and the pattern is
worth naming on its own: one probe point measured many times is still one probe
point.

### 1. The paved fallback was unreachable — FIXED 2026-09-10

OSRM reports "nothing connects these points under the constraints you gave" as
**HTTP 400** with `{"code":"NoRoute"}` in the body. Every fetcher here was
written status-first:

```
if (!response.ok) throw ...                                   // <- the 400 lands here
const data = await response.json();
if (avoidUnpaved && isNoRoute(data.code)) { retry without it } // never reached
```

So the retry that exists precisely for this case was dead, in three separate
fetchers, for the whole life of each.

**Corrected numbers.** The first write-up said "all six Bucharest attempts
failed" and reported it as a property of Bucharest. It was a property of ONE
COORDINATE: the probe used Piața Unirii as the start for every Bucharest sample.
Re-measured across twelve start points in five cities:

| | |
|---|---|
| paved-only rings answering NoRoute | 78 of 216 |
| start points where EVERY ring failed | 2 of 12 |
| point-to-point pairs answering NoRoute | 102 of 280 |

The two start points that failed completely are the ones that matter: a rider
standing there asked for a paved loop and got nothing at all, every time. On
real Bucharest place-to-place pairs, 42 of 56 routed fine and all 14 failures
touched that same coordinate — which is what a start snapped to an unpaved edge
looks like.

**Point-to-point was the worse half.** On a loop the candidate is dropped in
silence and the rider is told no loops exist here. On an A-to-B route the throw
propagates out of `directPreviewRoute` and the whole route preview fails.

**The fix is one shared reader**, `packages/core/src/osrmResponse.ts`, used by
all three fetchers so they cannot drift again. It reads the body FIRST and then
classifies, into four outcomes: `ok`, `no_route`, `empty` (the router answered
successfully with nothing) and `failed`.

⚠ **It is NOT "stop throwing on 400".** The live router returns `InvalidValue`,
`InvalidQuery` and `InvalidOptions` at the same status, and swallowing those
would turn a real bug into a silent wrong answer. Only `NoRoute` and `NoSegment`
trigger the fallback; everything else still throws, now with the code in the
message. The body is also read exactly once, as text, which is why the old shape
could not simply be reordered — it called `.json()` on the success path and
`.text()` on the error path.

Verified against the live router with the real fetcher after the change:

| start | before | after |
|---|---|---|
| bucharest/unirii | 0 of 18 | 18 of 18, all via fallback |
| rasnov/north | 0 of 18 | 18 of 18, all via fallback |
| brasov/centre | 12 of 18 | 18 of 18, 6 via fallback |
| cluj/manastur | 9 of 18 | 18 of 18, 3 via fallback |
| amsterdam/centre | 18 of 18 | 18 of 18, none via fallback |

Ninety rings, zero outright failures, 45 fallbacks — every one of which was
previously a silent drop. Amsterdam is unchanged, which is the control.

The rider is told: `pavedFallback` reaches `loop.noPavedLoop` on the result card
and `PAVED_FALLBACK_WARNING` reaches route-preview, both already translated into
all three locales. A fallback nobody sees would be the same silence in a new
place.

**Still open, and deliberately untouched:** the server's own point-to-point
client, `lib/clients/customOsrm.ts`, has NO paved fallback at all rather than an
unreachable one. Adding one is a behaviour change rather than a repair, and that
path is dormant — the app routes client-side. Worth doing if the server ever
becomes the routing path.

### 2. The out-and-back guard was measuring the wrong thing — FIXED 2026-09-10

`loopRoundness` divides the furthest point a route reaches by the radius a
CIRCLE of that length would have. A lollipop rides out before it loops, so its
excursion is large by construction and the whole-route ratio is structurally
inflated. A real captured lollipop out of Râșnov scored **1.905** against a
**1.9** threshold while its ring repeated only **0.9%** of itself.

**The first report of this overstated it, and the correction is the useful
part.** Generalising from that one fixture, it was written up as the lollipop
shape being thrown away. Measured properly across 300 live candidates — five
cities, three distances, five bearings, both ring shapes, both shapes of route —
the guard rejected **5 of 150** lollipops, and **all five would have failed the
doubling-back or spur cap anyway**. None of them could ever have reached a
rider.

Worse for the proposed fix: scoping roundness to the ring produced results
**identical to having no guard at all**. Shipping it alone would have been
deleting a check while appearing to repair it.

| Across 300 live candidates | whole-route guard | ring-scoped guard | no guard |
|---|---|---|---|
| candidates produced | 295 | 300 | 300 |
| offerable at the strict rungs | 84 | 85 | 85 |
| out-and-backs reaching the last rung | 50 | 53 | 53 |

**What the measurement did find is the real defect.** At the last rung the
doubling-back and spur caps are both dropped, so a route that is really a ride
out and back could be offered as "the least we could find". Fifty of 300
candidates reached that rung in that state and the guard stopped three of them.
Against a control set of genuine out-and-backs, whole-route roundness caught
four of seven where `ringRetracedShare` caught seven of seven.

**Both halves shipped together**, because the first is only safe with the
second:

- `ringRoundness` / `isRingOutAndBack` measure the LOOP, taking the reference
  point from where the loop begins and ends — the snapped start for a plain
  ring, the anchor for a lollipop. Plain rings are untouched: the scope is the
  same and the reference-point change flipped no verdict in 300 measurements.
- `RETRACE_CEILING = 0.9` with `withinRetraceCeiling` is never relaxed at any
  rung. 0.9 sits in the only visible gap in the data, 0.893 to 0.930, and 30 of
  the 300 candidates sat at exactly 1.000 — every metre of the loop ridden
  twice.

Verified against the live router after the change:

| | before | after |
|---|---|---|
| candidates produced | 295 | 300 |
| offerable at the strict rungs | 100 | 101 |
| lollipops among those | 26 | 27 |
| available at the last rung | 295 | 259 |
| repeating over 90% of themselves | 38 | **0** |
| searches left with nothing to offer | 0 of 15 | **0 of 15** |

That last row is the one that mattered. The ceiling removes every degenerate
route without starving a single search, and no search dropped even to one or
two candidates.

⚠ **Two things worth knowing for whoever touches this next.**

`MAX_LOOP_ROUNDNESS = 1.9` is calibrated against ROAD distances, not geometric
ones, and the comment claiming "a true circle scores 1.0" is wrong. A circle
through its own start scores **2.0** with no detour, and about **0.95** with the
measured 2.11x ring detour. Real rings land at 0.41 to 1.20 only because the
road distance in the denominator is roughly double the geometric path. Any
synthetic test fixture must carry a realistic detour or it measures a shape no
router returns — an earlier draft of these tests built a "lobed city loop" that
scored 6.2.

And 1.9 sits almost exactly at the MEDIAN of real out-and-backs, which measured
1.875. That is why it was close to a coin flip on the population it was written
for, and why the ceiling rather than the threshold is what now does that job.
`isRingOutAndBack` is kept because a lollipop whose three ring waypoints all
snap onto one road is structurally reachable and the check costs one comparison,
but it fired on none of the 300 and must not be relied on.

## Server-side TODO — improvements deliberately deferred

Ordered by what a rider would notice first.

1. **The sizing model is uncalibrated below 15 km.** A 5 km ring came back at
   **11.7 km** on the first attempt — 135% over — because `ringDetourFactor` was
   measured at 15/30/50 km. The controller recovers, at the cost of two extra
   round trips on every short search, and 5 km is the first entry in the picker.
   Measure it at 5 and 10 km and make the factor distance-aware.
2. **Cache rings across riders.** Two riders starting near each other with the
   same settings currently pay for the same OSRM work twice. Now that generation
   is server-side this is a real option, and it was listed as a cut in section 9
   of the original design specifically because it needed a server.
3. **Raise concurrency.** `RING_CONCURRENCY` is 4, chosen so a handset drew
   loops at a legible pace and did not burst the OSRM box. On the server the
   first reason is gone and the second is better handled by the rate limit.
4. **Reconcile the loop-session meter server-side.** It is still local and
   therefore still trusted; the endpoint is the natural place to settle it.
5. **Revisit the terrain escalation.** Measuring five more after the first five
   appears to be a no-op in most shapes, because the pool is at most ten by the
   time the terrain rung runs and the two passes together cover it. Worth
   confirming before anyone relies on it.
6. **Delete the on-device generator** once the flag has been on long enough.
   `loop-generator.ts`, its test, `loopServerFlag.ts`, the flag itself and the
   parity test all go together.

## Validating it

`scripts/probe-loop-service.mjs` drives the endpoint over a grid of starts and
distances and prints distance error, doubling back, spur share and which rung of
the ladder each search stopped at. With `LOOP_PROBE_GEOJSON=out.geojson` it
also writes every loop for visual checking, which is the part the numbers cannot
settle.

```bash
API_BASE_URL=https://defpedal-api-1081412761678.europe-central2.run.app \
LOOP_PROBE_TOKEN=<supabase access token> \
LOOP_PROBE_GEOJSON=loops.geojson \
  node scripts/probe-loop-service.mjs
```
