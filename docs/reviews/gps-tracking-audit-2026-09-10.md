# GPS Trip-Tracking — third pass: the metric, not the pipeline

Generated: 2026-09-10
Scope: "most trips are not being recorded" (reported from an analytics dashboard covering Apr–Jul 2026).
Method: live Supabase decomposition via the Management API, against current code.
Predecessors: `gps-tracking-audit-2026-07-15.md`, `gps-tracking-audit-2026-07-29.md`.

## Verdict

**There is no upload bug. When a rider taps Save, the track arrives: 96 of 97 rides (99%) in Aug–Sep.**

The reported decline is real but stopped two months ago, and the metric it was
measured with counts deliberate discards as failures. This is the **third**
time the question has been raised from the same number.

## Coverage by month (ended trips with a `trip_tracks` row)

| Apr | May | Jun | Jul | Aug | Sep |
|---|---|---|---|---|---|
| 98% | 76% | 44% | 26% | **42%** | **45%** |

The reported series stopped at July. The fixes from the 07-29 audit shipped
**2026-07-29** in v0.2.122 (immediate queue drain on enqueue, `end_action`,
stale-trip reaper). Recovery is visible from August.

## What the "missing" trips are (Aug–Sep, by `end_action`)

| end_action | trips | tracked | median duration |
|---|---|---|---|
| **saved** | 97 | **96 (99%)** | 52 min |
| discarded | 106 | 0 — by design | **1 min** |
| prompt_discarded | 25 | 1 | zombie rows (~150 h) |
| prompt_saved | 3 | 3 (100%) | — |
| null (old client) | 12 | 4 | — |

64 of 106 discards are under two minutes. The MEAN discard is 42 minutes and
is six outliers; quoting it would have sent the investigation somewhere wrong,
which is the same trap error-log #117(i) records.

**The denominator is the defect.** `% of ended trips with a track` cannot rise
while trial riders exist, and the registration wall is growing exactly that
cohort. `end_action` was added on 2026-07-29 *specifically* so this could be
settled; the dashboard does not read it. Correct denominator:
`end_action IN ('saved','prompt_saved','completed')`.

## Two-point trails — real, small, shrinking

| | Jun | Jul | Aug | Sep |
|---|---|---|---|---|
| tracks with ≤2 points | 24/61 (39%) | 22/96 (23%) | 9/85 (11%) | 2/23 (9%) |
| median points | 3 | 96 | 466 | 469 |

Filtering to a genuine ride with no trail leaves **3 cases in two months**:
67 min/0 points, 47 min/1 point (`app_killed`), 26 min/2 points. Every other
degenerate trail is a sub-minute ride, where two points is the correct answer.
Likely cause is background-location permission, not truncation. Not worth
chasing further until instrumented.

## The per-platform claim could not be reproduced

`trips` has no platform column. Attribution is only possible by joining
`push_tokens.platform`, which covers **250 of 446** trip users since June
(56%) and is consent-gated for anonymous riders, so it is partial and biased.
"iOS collapsed in July, Android in June" is plausibly an artifact of version
rollout timing inside that sample.

## Shipped in response (migration 202609100001)

1. **Build provenance** — `profiles.app_environment / app_version /
   app_platform`, synced by `ProfileDeviceSyncManager` at session bootstrap.
   Preview and development installs were previously indistinguishable from
   store installs in every dashboard number. Resolution is in
   `apps/mobile/src/lib/appBuildInfo.ts` and **fails toward non-production**
   when the variant and env disagree: under-counting production is
   recoverable, polluting it with tester rides is the bug being fixed.
   ⚠️ This is the LAST build a user ran, not the build that wrote a row. It
   answers "is this user a tester?". Per-row attribution would mean the same
   columns on `trips`; deliberately not done.
2. **Planned route at trip start** — `trips.planned_route_polyline6 /
   planned_route_distance_meters / routing_mode`, written by `startTripRecord`
   and sent from all three ride-start paths (route preview, GPX course,
   generated loop). Previously the geometry lived only on `trip_tracks`,
   written at ride END, so any ride whose track never uploaded lost the route
   even though the geometry existed the moment Start was pressed.

**Ordering:** none required. `tripStartRequestSchema` is
`additionalProperties: false`, but Fastify's ajv defaults to
`removeAdditional: true`, so an old server silently strips the new fields
rather than 400-ing the ride. Asserted by a test in `routes-v1.test.ts` rather
than assumed — if that test ever fails, the client must not ship first.

## What is actually worth attention

Not tracking. **106 riders started a ride and killed it inside a minute.**
That is an activation problem, and it is larger than anything on this page.
