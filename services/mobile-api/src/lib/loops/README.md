# Server-side loop generation

`POST /v1/loops` generates recreational loops — rides that start and finish in
the same place — and streams them back as they are found.

It replaces a fan-out the app used to do itself. Before this, one loop search
made up to sixty OSRM requests and fifteen enrichment calls from the handset.
Measured on a 15 km Bucharest ring, one OSRM response is about 165 KB, so a
single search pulled megabytes over mobile data to show five rows, and the
enrichment calls shared the rider's own `routePreview` rate-limit budget.

## Where the pieces are

| File | What it owns |
|---|---|
| `osrm.ts` | Routing one candidate ring, and everything measurable off the answer for free |
| `measure.ts` | Climb, risk and scenery for a finalist, in-process |
| `search.ts` | The sequencing: which ring next, how many, when to stop |
| `flag.ts` | The `LOOP_SERVER_ENABLED` rollout switch |
| `../../routes/loops.ts` | The endpoint, auth, validation and the stream |

Nothing about loop QUALITY lives here. Ring geometry, the convergence
controller, the relaxation ladder, the caps and the ranking are all in
`packages/core/src/loopPlan.ts`, which the app imports too. That is deliberate:
every number in there is a product claim, and a claim that exists twice drifts.

## Environment

| Variable | Default | Notes |
|---|---|---|
| `SAFE_OSRM_BASE_URL` | `https://osrm.defensivepedal.com/route/v1/bicycle` | Standard safety profile |
| `SAFE_OSRM_FLAT_BASE_URL` | `https://osrm-flat.defensivepedal.com/route/v1/bicycle` | Used only when terrain is `flat` |
| `LOOP_SERVER_ENABLED` | `false` | Whether the app is told to use this endpoint |
| `RATE_LIMIT_LOOP_SEARCH_MAX` | `6` | Searches per window, per rider |
| `RATE_LIMIT_LOOP_SEARCH_WINDOW_MS` | `60000` | The window |

`LOOP_SERVER_ENABLED` defaults to OFF, unlike every other kill switch in this
service. Those guard shipped features and fail open; this one guards the
unvalidated path and has to fail onto the client generator riders already run.

The endpoint stays registered and answerable whatever the flag says. A flag that
also switched off the server would make turning it on a two-step operation with
a window in between where the client asks and the server refuses.

## Running it locally

```bash
cd services/mobile-api
npm run dev
```

Then, with a rider's Supabase access token:

```bash
curl -N -X POST http://localhost:8080/v1/loops \
  -H 'authorization: Bearer <SUPABASE_ACCESS_TOKEN>' \
  -H 'content-type: application/json' \
  -d '{
        "start": { "lat": 44.4268, "lon": 26.1025 },
        "targetDistanceMeters": 15000,
        "terrain": "rolling",
        "surface": "any",
        "heading": "any",
        "locale": "en"
      }'
```

`-N` matters. Without it curl buffers the whole body and you lose the thing
worth looking at, which is loops arriving one at a time.

Expect newline-delimited JSON, one object per line, ending in exactly one
terminal frame:

```
{"type":"candidate","loop":{ ... }}
{"type":"progress","resolved":1,"attempted":1}
{"type":"candidate","loop":{ ... }}
{"type":"result","status":"ok","loops":[ ... ],"relaxation":"none","checked":5}
```

The other two terminal frames are `{"type":"empty"}` — the roads here do not
close into a loop of that length — and `{"type":"error","message":"…"}`.

A search takes a few seconds. If it returns instantly with `empty`, check that
`SAFE_OSRM_BASE_URL` points somewhere reachable.

## The contract, and why it looks like this

**It streams.** The planner draws each loop onto the map as it lands, under a
live counter. A buffered response would replace that with a spinner over the
same wait.

**It always ends with a terminal frame.** A truncated stream and an empty result
are otherwise indistinguishable, and one of them is a failure nobody would ever
see. The client treats a stream that ends without one as an error.

**Failures after the first byte are frames, not status codes.** Headers leave
before the search can fail, so everything checkable — auth, validation, the rate
limit, coverage — is checked up front and answers with a real status. Anything
after that is an `error` frame on a 200.

**Turn instructions are English.** OSRM ships none, and the localised phrase
catalogue lives in the app's i18n layer, so the client rebuilds the
rider-visible string from `maneuver` and `streetName`. Rendering what the server
sends would put English turn cues in front of every Romanian and Spanish rider.

**Loops carry `source: "generated_loop"`.** That is what suppresses ordinary
reroute. On a loop the destination IS the origin, so an unsuppressed reroute
asks for the shortest way home and silently deletes the rest of the ride.

## Tests

```bash
cd services/mobile-api

# Everything, no network needed
npx vitest run src/lib/loops src/__tests__/loops-parity.test.ts \
  src/__tests__/loops-routes.test.ts

# Against a real router — run before a deploy, and after any sizing change
LOOP_INTEGRATION_OSRM_URL=https://osrm.defensivepedal.com/route/v1/bicycle \
  npx vitest run src/lib/loops/integration.test.ts
```

`__fixtures__/` holds four responses captured from the live router on
2026-09-10, with the request geometry that produced each one. They are real
because three separate features in this codebase shipped dead while their tests
passed against hand-built fixtures in the shape the code assumed — a fixture you
wrote yourself proves you can parse your own assumption and nothing else
(error-log #113).

`loops-parity.test.ts` runs this implementation AND the app's over one
deterministic fake router and compares the ranked output, the request budget,
the measurement count and the order candidates are drawn. It exists because the
two are duplicated for as long as the feature flag can point either way. When
the flag goes, the app's copy and that test go with it.
