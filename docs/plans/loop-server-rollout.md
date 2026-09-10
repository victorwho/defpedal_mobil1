# Loop generation: rollout, validation, and the cleanup that follows

Companion to `loop-generator.md`. That document explains what was built and why;
this one is the checklist for turning it on and the prepared change for taking
the old path out.

**Nothing here has been applied.** The flag is off, the app still runs the
on-device generator, and the removal in the last section is written down rather
than done.

---

## 1. Deploy

No change to the OSRM box. This is an ordinary API deploy.

⚠ `gcloud builds submit` uploads the WORKING DIRECTORY, not the commit you
pushed. Two parallel sessions each deployed their own tree on 2026-08-27 and the
second silently reverted the first. Check first, every time:

```bash
git fetch && git status          # HEAD must equal origin/main, nothing ahead or behind
```

Then, from a clean tree:

```bash
gcloud builds submit --config cloudbuild.yaml --timeout=600 \
  --project gen-lang-client-0895796477

gcloud run deploy defpedal-api \
  --image europe-central2-docker.pkg.dev/gen-lang-client-0895796477/defpedal-api/mobile-api:latest \
  --region europe-central2 --platform managed --allow-unauthenticated \
  --project gen-lang-client-0895796477
```

`builds submit` only pushes the image. Without the second command Cloud Run
keeps serving the old code.

Read back which revision is actually live, rather than trusting a revision id
from a commit message:

```bash
gcloud run services describe defpedal-api --region europe-central2 \
  --project gen-lang-client-0895796477 \
  --format='value(status.traffic[0].revisionName)'
```

### Verify the deploy, before touching the flag

The endpoint is live from this deploy even with the flag off — the flag only
tells the APP whether to call it. So it can be exercised immediately.

```bash
API=https://defpedal-api-1081412761678.europe-central2.run.app

# 1. The service is up at all.
curl -s $API/health
# expect: {"status":"ok", …}

# 2. The endpoint exists and is guarded. A missing route 404s; a live one 401s.
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/v1/loops \
  -H 'content-type: application/json' -d '{}'
# expect: 401   (NOT 404 — a 404 means this deploy does not have the endpoint)

# 3. A real search. TOKEN is a Supabase access token; an anonymous one works.
curl -N -s -X POST $API/v1/loops \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"start":{"lat":44.4268,"lon":26.1025},"targetDistanceMeters":15000,
       "terrain":"rolling","surface":"any","heading":"any","locale":"en"}'
```

Expect newline-delimited JSON arriving over a few seconds: `candidate` and
`progress` lines, then exactly one `result` line carrying up to five loops.

⚠ **Watch that the lines ARRIVE SEPARATELY.** If the whole body lands at once
after a pause, something between you and Cloud Run buffered it, and the
progressive draw on the phone is gone even though every test passes. `-N` on
curl is required for this to be a real check.

Two more, worth doing once:

```bash
# 4. The flag is reaching clients. Should read false before rollout.
curl -s $API/v1/profile -H "authorization: Bearer $TOKEN" | grep -o '"loopServerEnabled":[a-z]*'

# 5. Out of coverage refuses rather than degrading.
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/v1/loops \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"start":{"lat":40.7128,"lon":-74.006},"targetDistanceMeters":15000,
       "terrain":"rolling","surface":"any","heading":"any","locale":"en"}'
# expect: 403
```

---

## 2. Validation

Run this BEFORE the flag goes on for anyone. The endpoint answers regardless of
the flag, so all of it can be done against production with nobody affected.

### 2a. The measured pass

```bash
API_BASE_URL=https://defpedal-api-1081412761678.europe-central2.run.app \
LOOP_PROBE_TOKEN=<supabase access token> \
LOOP_PROBE_GEOJSON=loops.geojson \
  node scripts/probe-loop-service.mjs
```

Five starts (Bucharest, Râșnov, Brașov, Cluj, Amsterdam) times three distances
(10, 20, 30 km) is fifteen searches, about two minutes.

What to look at, in order:

| Column | What a good result looks like | What a bad one means |
|---|---|---|
| `status` | `ok` on at least 12 of 15 | An `empty` in a dense city is a defect, not terrain |
| `err` | median under 12% | The sizing model has drifted |
| `relaxed` | `none` or `heading` on most rows | A ladder reaching its last rung every time is a defect report, not the feature working |
| `ring-retrace` | under 35% | Above it means the cap was bent |
| `spur` | under 8% | Above it is "a loop plus errands" |
| `wall` | under 5 s | Slower than the client path defeats the point |
| `stem` | non-zero on SOME rows | Always zero means lollipops are still being vetoed — see defect 2 |

Then repeat with `LOOP_PROBE_TERRAIN=flat` and `LOOP_PROBE_TERRAIN=hilly`, and
once with `LOOP_PROBE_SURFACE=paved`.

⚠ **`surface=paved` is expected to fail today.** That is defect 1 in
`loop-generator.md`, measured before this change and unfixed on purpose. Record
what it does; do not treat it as a regression from this work.

### 2b. The map pass

Numbers say a loop is 15.2 km and repeats 14% of itself. Only a map says whether
it is a ride. Drop `loops.geojson` on geojson.io and look at all of them.

For each, ask three questions:
1. Does it read as one ride, or as a loop with errands hanging off it?
2. Does it go anywhere, or circle the same three blocks?
3. Would you ride it?

### 2c. Old versus new, on the phone

The only comparison that settles the parity question in the field. On a preview
build:

1. Set `EXPO_PUBLIC_LOOP_GENERATION_SERVER=false`, generate loops at five
   starts across two cities, three distances each. Screenshot every result list.
2. Set it to `true`, rebuild, repeat the identical fifteen searches.
3. Compare: distance, climb, the relaxation note, and the shape on the map.

They will not be identical — the router is asked fresh each time and the road
network answers slightly differently — but they should be the same KIND of loop
at the same length with the same note. A systematic difference is a parity bug
the tests missed, and worth finding before the flag is public.

Also check, on the server build:
- loops draw onto the map one at a time, not all at once at the end;
- the counter moves;
- Cancel stops it;
- turn instructions are in the phone's language, not English;
- Start ride works and the ride does not get rerouted home when you leave the
  line.

### 2d. Rollout

```bash
gcloud run services update defpedal-api --region europe-central2 \
  --update-env-vars LOOP_SERVER_ENABLED=true \
  --project gen-lang-client-0895796477
```

Then watch, for a few days:
- Sentry, for `LoopSearchRequestError` and for `loop_search_failed` telemetry —
  this is what the no-silent-fallback rule buys, so use it;
- the Cloud Run logs for `loop_search_completed`, which carries duration,
  relaxation and how many loops were offered;
- PostHog `loop_results_shown` volume against the week before. A DROP is as
  significant as an error spike.

Rollback is one command, and takes effect on each rider's next app open:

```bash
gcloud run services update defpedal-api --region europe-central2 \
  --update-env-vars LOOP_SERVER_ENABLED=false \
  --project gen-lang-client-0895796477
```

---

## 3. The cleanup — PREPARED, NOT APPLIED

Do this only after the flag has been on long enough to trust, and after the two
defects in `loop-generator.md` are fixed (they have to be fixed in both
implementations while both exist; once only one exists, that stops being true,
so fixing them FIRST is cheaper).

### Delete

| File | Why it goes |
|---|---|
| `apps/mobile/src/lib/loop-generator.ts` | The on-device orchestrator |
| `apps/mobile/src/lib/loop-generator.test.ts` | Its tests |
| `apps/mobile/src/lib/loopServerFlag.ts` | The switch |
| `apps/mobile/src/lib/loopServerFlag.test.ts` | Its tests |
| `services/mobile-api/src/__tests__/loops-parity.test.ts` | It compares two things; there will be one |
| `services/mobile-api/src/lib/loops/flag.ts` | The server half of the switch |

### Edit

**`apps/mobile/app/loop-planner.tsx`** — remove the `searchLoops` and
`isLoopServerEnabled` imports and the `loopServerFlag` store read, then collapse
the branch:

```ts
// before
const useServer = isLoopServerEnabled(loopServerFlag);
outcome = useServer
  ? await searchLoopsRemote(searchRequest, searchCallbacks)
  : await searchLoops(searchRequest, searchCallbacks);

// after
outcome = await searchLoopsRemote(searchRequest, searchCallbacks);
```

Keep the surrounding `try`/`catch` and the `error` search state exactly as they
are. They belong to the remote path, which is the only path left.

**`apps/mobile/src/store/appStore.ts`** — remove `loopServerEnabled`,
`setLoopServerEnabled`, its default and its `partialize` entry. Bump the persist
version and add a migration that drops the key, or leave it: an orphaned
persisted boolean is harmless, and the migration is the riskier of the two.

**`apps/mobile/src/providers/ProfileDeviceSyncManager.tsx`** — remove the
`setLoopServerEnabled` call.

**`services/mobile-api/src/routes/feed-profile.ts`** — remove the three
`loopServerEnabled: isLoopServerEnabled(),` lines and the import.

**`packages/core/src/contracts.ts`** — remove `loopServerEnabled` from the
profile response type. **`services/mobile-api/src/lib/feedSchemas.ts`** — remove
it from the schema.

⚠ **Leave the field in the response for one release after the app stops reading
it.** An app that still reads it will see `undefined`, which means "off", which
would send a not-yet-updated rider back to a generator that no longer exists in
their build. Order: ship the app that only uses the server path, wait for the
fleet, then remove the field.

**`apps/mobile/src/lib/mapbox-routing.ts`** — `fetchLoopRoute` and
`fetchRouteScenicScore` lose their only callers. Check with
`git grep -n fetchLoopRoute` before removing; `fetchScenicVias` is separate and
stays.

**`apps/mobile/src/i18n/{en,ro,es}.ts`** — nothing to remove. The four `loop.error*`
keys belong to the remote path.

### Keep

`packages/core/src/loopPlan.ts` in full, including the `GeneratedLoop`,
`LoopSearchRequest`, `LoopSearchOutcome` and `LoopStreamFrame` contracts. The
server imports all of it and the client imports the types.

### Verify after

```bash
npm run typecheck && npm run lint:mobile:check
npx vitest run --dir packages/core
cd apps/mobile && npx vitest run
cd services/mobile-api && npx vitest run --no-file-parallelism
npm run check:bundle     # then grep the bundle for searchLoopsRemote
```

The parity test is gone by then, so the thing holding loop quality is
`loopPlan.test.ts` in core plus `search.test.ts` and `osrm.test.ts` in the API.
Run `integration.test.ts` against the live router as well — with one
implementation left, it is the only test that can notice the router changing
underneath it.
