# GPX Course Import — plan

**Status:** Phases 1 + 2 shipped and device-confirmed (commit ead20c3). Phase 3 OS "Open with" implemented 2026-09-04, not yet device-verified.
**Created:** 2026-09-04

> **Phases 1 and 2 are shipped and device-confirmed** (commit `ead20c3`, preview
> v0.2.132 / build 135). A GPX file can be imported, scored, saved to the device,
> reopened and ridden turn-by-turn, with auto-reroute suppressed.
>
> **Phase 3's OS "Open with" is implemented but NOT device-verified.** Intent
> resolution is a device behaviour — the manifest XML parses and the JS is unit
> tested, but whether Drive actually offers this app for a given .gpx can only be
> answered on a phone, and it needs a rebuild because the Android manifest is
> native. The iOS half has never run at all (no macOS hardware — the standing
> caveat for every iOS change in this repo).
>
> Files: `packages/core/src/courseSteps.ts`,
> `apps/mobile/src/lib/{gpx-parse,gpx-import,course-route,courseStorage}.ts`,
> `apps/mobile/app/course-import.tsx`, `GpxOpenHandler` in `app/_layout.tsx`
> (+ 6 test files). Touched: `contracts.ts` (`source` union), `riskStretch.ts`
> (`findHighRiskStretches`), `premiumCatalog.ts` + `entitlement.ts`
> (`importedCourses` limit + `canImportAnotherCourse`), `mapbox-routing.ts`
> (exported the two enrichers), `components/map/*` (`focusCoordinate`),
> `navigation.tsx` (the reroute gate), `route-planning.tsx` (entry point +
> course list), `appStore.ts` (`importedCourses` + transient
> `pendingCourseImport`), `usePremium.ts`, `PremiumLimitCard.tsx`,
> `AndroidManifest.xml` (intent filters), `app.config.ts` (iOS document types),
> `i18n/{en,ro,es}.ts`.
>
> ⚠️ **Verifying the bundle on this machine needs care.** The Metro on :8081 is
> served from `C:\Users\Victor\orca\workspaces\defpedal\Sesizari`, a different
> workspace — bundling against it returns HTTP 200 for a bundle that contains
> none of this repo's code. Start Metro from `C:\dev\defpedal\apps\mobile` on a
> free port and **grep the bundle for a symbol you just added** rather than
> trusting the status code. See error-log #103.

Import a `.gpx` file, follow it turn-by-turn, and render our risk scoring on
top of it.

---

## 1. Why this feature is not "just another route"

Every other route in this app is *computed*: the rider gives us an O/D pair and
we choose the roads. A GPX course is the opposite — the line is **fixed and
given**, imported from Komoot / Strava / RideWithGPS / a club ride, and the
rider's whole reason for importing it is that they want *that* line.

So the product promise inverts:

| | Normal route | Imported course |
|---|---|---|
| Who picks the roads | We do | The rider's source did |
| Our value | We route you around danger | We **X-ray** the route and warn you before each dangerous stretch |
| Off-route response | Reroute | **Return to course** — never reroute |

This is a genuinely strong angle and it is the feature's headline: *"you
imported a stranger's route — here are its 3 sketchy stretches and exactly
where they are."* Nobody else importing GPX tells you that.

It is also why this cannot be bolted onto the existing saved-route path (§4).

---

## 2. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Turn-by-turn | **Synthesize from geometry** | Preserves the imported line exactly; zero API cost; offline-capable. Map-matching *rewrites geometry*, which can silently move a rider off the course they chose. |
| Storage | **Local-only (device)** | No migration, no Cloud Run deploy, no RLS. Ships client-side, works offline. Sync is a later add. |
| Pricing | **Free but capped** | Mirrors the existing `FREE_LIMITS.savedRoutes: 5` pattern. Free riders feel the risk-X-ray value before hitting a wall. |
| Vocabulary | **"Course"**, not "route" | Distinguishes fixed-line-from-file from computed-route, and matches the word Garmin/Strava users already have. `gpx-export.ts` already uses it. |

---

## 3. What already exists and is reusable

This is much less new code than it looks, because the risk half is already
geometry-driven rather than route-driven:

| Existing | Reuse |
|---|---|
| `POST /v1/risk-segments` | Takes a bare GeoJSON LineString. **Works on GPX geometry unchanged.** |
| `POST /v1/elevation-profile` | Same — bare coordinate array. Gain/loss/profile for free. |
| `enrichRouteWithRisk` / `enrichRouteWithElevation` (`mapbox-routing.ts:365-425`) | Both take `(route, coordinates)`. Callable on a synthesized `RouteOption`. |
| `MAX_RISK_GEOMETRY_POINTS = 12_000` + `downsampleCoordinates` | The oversized-body defense already exists; GPX files are exactly the case it was built for. |
| `longestHighRiskStretchMeters` (`core/riskStretch.ts`) | The busy-stretch callout, already tuned to fire only on the top two bands. |
| `RiskDistributionCard`, `ElevationChart`, `RouteMap` risk layers | Render an imported course with zero new map code. |
| `buildManeuverInstruction` (`maneuverInstructions.ts`) | **Key win** — already maps OSRM's exact modifier vocabulary through i18n and handles empty street names. Synthesized steps get EN/RO/ES for free, no new turn-instruction keys. |
| `gpx-export.ts`, `gpx-share.ts`, `garmin.ts` | Export already ships. Import is the missing half of a pair. |
| `PaywallSheet`, `PremiumLimitCard`, `canSaveAnotherRoute` | The cap gate is a copy of an existing gate. |

---

## 4. Why `saved_routes` cannot host this

`SavedRoute` (`core/contracts.ts:1431`) stores `origin` / `destination` /
`waypoints` / `mode` — **no geometry**. Opening one re-runs the router
(`route-planning.tsx:395-408` sets the request and pushes to preview).

Re-routing an imported course would replace the rider's line with our own.
That is the exact failure the feature exists to avoid. Courses therefore need
geometry-first storage of their own (§7).

---

## 5. Architecture — parse to normalize to enrich to follow

```
.gpx file
   |  expo-document-picker  OR  OS "Open with" intent
   v
gpx-parse.ts          (new, pure)      -> { name, coords[], elevations?[] }
   v
courseSteps.ts        (new, pure core) -> NavigationStep[]  (synthesized)
   v
buildCourseRoute()    (new)            -> RouteOption
   v
enrichRouteWithRisk + enrichRouteWithElevation   (EXISTING, unchanged)
   v
RoutePreviewResponse -> course-import screen -> navigation (course mode)
```

The output is an ordinary `RouteOption`, so every downstream surface — map
layers, risk card, elevation chart, HUD, progress math — works untouched.

### 5.1 `apps/mobile/src/lib/gpx-parse.ts` (new, pure)

Sibling to the existing `gpx-export.ts`, same "pure, no native deps, unit
testable" contract.

Must handle:

- GPX **1.0 and 1.1** (namespace differs; don't match on the 1.1 xmlns).
- `<trk><trkseg><trkpt>` **and `<rte><rtept>`** — a lot of exporters emit
  `<rte>`. Our own exporter deliberately emits `<trk>`; importers must be
  more permissive than exporters.
- Multiple `<trkseg>` in one `<trk>` → concatenate (segments are pauses).
- Multiple `<trk>` in one file → take the longest, and say so in the UI.
- `<ele>` when present, 1:1 with points, else drop the whole array (the same
  invariant `buildRouteGpx` already enforces in the other direction).
- Course name from `<metadata><name>` → `<trk><name>` → filename.

Returns a discriminated result, never throws:

```ts
type GpxParseResult =
  | { ok: true; course: ParsedCourse }
  | { ok: false; reason: 'not_xml' | 'no_track' | 'too_few_points' | 'bad_coords' };
```

### 5.2 `packages/core/src/courseSteps.ts` (new, pure)

Synthesizes OSRM-shaped steps from bare geometry. Lives in core next to
`navigation.ts` / `distance.ts` because it is pure geometry.

Algorithm:

1. Bearing between consecutive points.
2. Accumulate distance until the bearing delta from the step-start bearing
   exceeds **35°** → close the step.
3. **Require the turn to be sustained over at least 15 m** before it counts.
   Without this, GPS jitter baked into the source trace generates hundreds of
   phantom turns — this is the single thing most likely to make the feature
   feel broken.
4. Classify the signed delta into OSRM's own modifier vocabulary
   (`sharp left | left | slight left | straight | slight right | right | sharp right`)
   so `buildManeuverInstruction` renders it, localized, unchanged.
5. First step `type: 'depart'`, last `type: 'arrive'`.
6. `streetName: ''` — already an expected case downstream.

Duration: GPX carries none. Estimate from distance at a cycling default, then
run it through the existing elevation-aware `computeAdjustedDuration`.

---

## 6. UX design

### 6.1 Entry points (two, and the second one matters more)

**A. In-app.** The Saved Routes modal in `route-planning.tsx` becomes
**"Routes"** with a `Saved` / `Courses` segmented control, and an
`Import GPX` row. (Note: that modal's title is currently a hardcoded English
string at `route-planning.tsx:1821` — localize it while in there.)

**B. OS "Open with" — the real unlock.** Tap a `.gpx` in Gmail / Files / Drive
→ Defensive Pedal appears in the share sheet → lands straight on the course
review screen. This is how people actually receive GPX files, and it is where
this feature wins against apps that only offer an in-app picker.

- Android: `intent-filter` in the **hand-managed** `AndroidManifest.xml`
  (this project never runs `expo prebuild` — error-log #27).
- iOS: `CFBundleDocumentTypes` + UTI `com.topografix.gpx` via
  `app.config.ts` `infoPlist`. The UTI constant already exists in
  `gpx-share.ts`.

### 6.2 Course review screen — `app/course-import.tsx`

The heart of the feature. `MapStageScreen` (map-first, collapsible sheet),
matching `route-preview.tsx`.

- **Map:** the imported line, drawn with **risk colouring already applied**.
  The first thing the rider sees is where the route goes red.
- **Peek strip:** course name (editable), distance, climb, and the headline —
  safety score plus `3 busy stretches`.
- **Expanded sheet:**
  - `RiskDistributionCard` (reused)
  - `ElevationChart` (reused)
  - **"Busy stretches"** list — each row taps to fly the map to that stretch.
    This is the feature's signature interaction and the reason someone
    imports into *this* app instead of Garmin.
- **Footer:** primary `Start ride`, secondary `Save course`.

A `Course` badge (distinct from the Safe/Fast/Flat pills) marks it as
imported, so the rider is never confused about whether we chose these roads.

### 6.3 Navigation — "course mode"

Reuses `navigation.tsx` wholesale with three changes:

1. **Auto-reroute is disabled.** See §8. Non-negotiable.
2. **Off-course banner** replaces silent rerouting: distance and direction back
   to the course, plus a `Rejoin` affordance. Riders leave a course all the
   time (coffee, closed road) and expect to come back to it.
3. Hazard alerts and route-feature alerts fire exactly as today — that is the
   entire point of importing here.

*(Optional, Phase 3: a risk-segment proximity alert — "Busy road ahead,
400 m" — reusing the `RouteFeatureAlertStack` pattern. Valuable in every mode,
not just courses; scope it separately.)*

### 6.4 States that must be designed, not improvised

| State | Copy direction |
|---|---|
| Malformed / not GPX | "This file isn't a valid GPX." |
| GPX with waypoints but no track | "This file has no route line in it." |
| Track outside risk-data coverage | **Be honest:** "Risk scoring isn't available in this area yet." Show the course, show elevation, show **no** safety score. |
| Huge file (100k+ points) | Downsample silently via the existing 12k cap; no user-facing error. |
| Multi-track file | Import the longest, tell the rider: "This file had 3 tracks — imported the longest." |
| At the free cap | `PremiumLimitCard`, same shape as saved routes. |

The coverage row is a hard rule, not a nicety. `isRiskDataAvailable`
(`core/countryCoverage.ts`) gates risk by country — a GPX from Colorado gets
no risk data. **Never render a fallback number as if it were real.** The
deleted `safety-score.tsx` did exactly that and it is called out in CLAUDE.md
as a mistake not to repeat.

---

## 7. Storage and the free cap

**Geometry** → `FileSystem` as encoded polyline6 (`gpx-share.ts` already
demonstrates the legacy-API import pattern; note the static-import requirement
— dynamic `await import()` fails silently in Hermes release bytecode).

**Index** → a persisted, **device-scoped** Zustand slice: id, name, distance,
climb, safety score, createdAt, file path. Device-scoped because the courses
live on the device — so it is **not** cleared by `resetUserScopedState`
(same reasoning as `reviewPromptState`).

Follow the `offlineRouteCache.ts` pattern for the on-disk half and its
`isValid…` type-guard-on-read discipline.

**Cap** — add to the existing catalog rather than inventing a parallel gate:

- `TierLimits.importedCourses` → `2` in `FREE_LIMITS`, `null` in `PLUS_LIMITS`
- `canImportAnotherCourse(entitlement, count)` in `entitlement.ts`, a direct
  copy of `canSaveAnotherRoute` (including its "grandfather content, cap new
  additions" promise — existing courses stay usable above the cap)

Persist migration: bump the store version and default the new slice. Note
`appStoreMigration.test.ts` locks migration behaviour — extend it.

---

## 8. The one thing that must not be got wrong

`navigation.tsx:1085-1097` fires `shouldTriggerAutomaticReroute` after 60 s
off-route and calls `rerouteMutation` → `setRoutePreview(...)`.

On an imported course that **silently replaces the rider's course with an OSRM
route**, mid-ride, with no undo. From the rider's point of view it is data
loss of the thing they came to the app to follow.

The gate must live on the **route**, not on the screen — mark the synthesized
`RouteOption` as course-sourced and check that flag inside the auto-reroute
effect, so any future caller inherits the protection. A screen-level `if` will
be missed by the next reroute entry point (the skip-stop path at
`navigation.tsx:1063-1077` is already a second one).

Manual reroute should also be suppressed or re-labelled — "reroute" is
meaningless when the rider's intent is a fixed line.

---

## 9. Other traps

- **`expo-document-picker` is not installed.** Must go in
  `apps/mobile/package.json`, not the root — autolinking only reads the
  workspace (error-log #22b). Needs a native rebuild; verify on a **preview**
  build, since the dev variant's old-arch bridge hides bridgeless-only
  failures.
- **Coordinate order.** `decodePolyline` / `encodePolyline` and GeoJSON are
  `[lon, lat]`; GPX attributes are `lat` / `lon`. `gpx-export.ts` swaps in one
  direction — the parser must swap in the other. Easy to get backwards, and a
  swapped course looks plausible on a world map.
- **Elevation 1:1 invariant.** Only pass `elevations` through when the array
  length equals the coordinate count, matching what `buildRouteGpx` enforces.
- **XML parsing.** No DOM in React Native. Use a small pure regex/scanner
  parser (the trkpt grammar is trivial and fixed) rather than adding an XML
  dependency — keeps it testable in Vitest with no native mocking, same as
  `gpx-export.ts`.
- **Bundle check.** `npm run check:bundle` after changes; `npm run typecheck`
  and the lint ratchet before push.

---

## 10. Phasing

**Phase 1 — parse and review (no navigation). ✅ IMPLEMENTED 2026-09-04.**
`gpx-parse.ts`, `courseSteps.ts`, `buildCourseRoute`, `course-import.tsx`,
in-app picker entry point, risk and elevation enrichment, coverage-honest
empty state. Ships as "import and inspect a course" — already useful alone.

Notes from building it:

- **The turn detector's load-bearing constant is the bearing *window*, not the
  angle threshold.** Measuring heading between adjacent points makes GPS jitter
  the signal; measuring it over 15 m of travel makes a turn have to be
  sustained. A first cut also let that window silently collapse near either end
  of a course, which grew phantom turns in the first and last few meters —
  vertices without a full window on both sides are now skipped.
- **Turn clustering must key off the gap between consecutive candidates**, not
  distance from the cluster start: a corner taken on a wide radius flags a
  continuous run of vertices that easily exceeds any fixed spacing, and
  measuring from the run's start splits one sweeping turn into two cues.
- **`nav.maneuverShort.*` already had the whole vocabulary**, so synthesized
  turns are localized in EN/RO/ES with zero new turn-instruction keys.
  `buildManeuverInstruction` was deliberately NOT reused — it renders
  "Turn right onto {{street}}", which becomes "onto the road" on every cue.
- **Busy-stretch detection lives in `riskStretch.ts`**, sharing
  `BUSY_ROAD_CATEGORIES` with the existing callout;
  `longestHighRiskStretchMeters` now delegates to `findHighRiskStretches`, so
  there is exactly one definition of "busy" (error-log #20).
- ⚠️ **A risk-band consolidation was already uncommitted in the tree** (8 bands
  → No data / Safer / Typical / High risk), touching `riskDistribution.ts`,
  `riskStretch.ts`, `riskLegend.ts` and `services/mobile-api/src/lib/risk.ts`.
  The busy-stretch list inherits that definition automatically — but if that
  work is reverted, `BUSY_ROAD_CATEGORIES` reverts with it.
- **Running the full test suite in parallel fails ~11 mobile-api files on this
  machine** (the first request in each file times out while Fastify boots).
  `npx vitest run --fileParallelism=false` in `services/mobile-api` is green at
  1004/1004. Pre-existing and environmental, unrelated to this feature.

**Phase 2 — follow it. ✅ IMPLEMENTED 2026-09-04.**
Course-mode navigation, the reroute gate (§8), off-course banner, local
storage plus the free cap and paywall surface.

What landed:

- **`isCourseRoute` in core** is the single marker, and the gate is enforced
  inside `rerouteMutation`'s `mutationFn` — not only at its callers — so all
  three reroute entry points inherit it. It fails safe: a missing route
  returns `false`, because suppressing reroute on a *normal* route (a rider
  genuinely lost, never recalculated) is the worse failure.
- **Off-COURSE banner** replaces the countdown and the "Reroute now" action,
  and reports how far back the line is. The spoken cue switches too: "off
  route" implies we will fix it, which on a course is a lie.
- **Storage is split**: geometry as one JSON file per course under
  `documentDirectory` (NOT `cacheDirectory` — the cache is evictable, and a
  course vanishing between planning and setting off is the one failure this
  cannot have), metadata in a device-scoped Zustand slice so lists render
  without disk reads. Geometry is re-validated on read, since a truncated
  write would otherwise reach the router as malformed geometry.
- **Metadata is deleted before the file**: an orphaned file is reclaimed by
  `pruneOrphanedCourses` (swept once per session when the routes sheet opens),
  whereas a row pointing at deleted geometry is a course the rider can tap and
  never open.
- **The cap follows the saved-route pattern exactly** — `importedCourses: 2`
  in `FREE_LIMITS`, `canImportAnotherCourse` in `entitlement.ts`, and
  `blockImportCourse` on `usePremium` so the dark-launch gate is folded in
  once rather than repeated at the call site.
- `/course-import` now takes **either** a file `uri` or a saved `courseId`,
  which keeps one screen for both paths — and is the same single-input shape
  the OS "Open with" intent will use in Phase 3.

**Phase 3 — reach. ✅ OS "Open with" IMPLEMENTED 2026-09-04.**
Android intent filters + iOS document types, and the handler that receives
them. Risk-segment proximity alerts and opt-in map-matched street names are
still open (both were always "optional / scope separately").

What landed:

- **The two platforms are exact opposites here, and getting it backwards
  produces silence.** Android's manifest is hand-maintained — `intentFilters`
  in `app.config.ts` would never land, because this project does not run
  `expo prebuild` (error-log #27). iOS is the reverse: `infoPlist` entries in
  `app.config.ts` DO apply, because iOS builds go through EAS, which prebuilds
  on the build server.
- **GPX is not a system UTI on iOS.** `LSItemContentTypes: ['com.topografix.gpx']`
  alone names an identifier iOS has never heard of, and the app simply never
  appears — so `UTImportedTypeDeclarations` declares it (conforming to
  `public.xml`, tagged with the extension and MIME type). `LSHandlerRank` is
  `Alternate`: we are a legitimate handler but should not outrank a dedicated
  GPS app the rider deliberately installed.
- ⚠️ **Never widen the Android filter to `android:mimeType="*/*"`.** That is
  the lazy way to catch every provider and it offers this app as a handler for
  every file on the device. Two filters instead: correct MIME types
  (`application/gpx+xml`, `application/xml`, `text/xml`) with **no** path
  constraint — cloud content URIs carry no extension, so a `pathPattern` would
  never match them and the MIME type is the only usable signal; plus
  `application/octet-stream` (what Drive and several mail clients report for
  .gpx) **narrowed** by a `.gpx` `pathPattern`.
- **Stage the file immediately, then decide where to go.** Android grants read
  access to a `content://` URI only for the life of the receiving task, so
  `GpxOpenHandler` copies it into our cache the moment it arrives and drops the
  borrowed handle. Deferring the read until after onboarding — which is exactly
  what the suppression rule below does — would otherwise hand `/course-import`
  a permission that has lapsed.
- **Navigation is suppressed during `NAVIGATING` and during onboarding**, the
  same rule `ShareClaimProcessor` uses (review 2026-06-12 P1). A fresh install
  opening a shared .gpx must not be yanked past the signup wall that has been
  mandatory since 2026-07-26. The staged path waits in the **transient,
  non-persisted** `pendingCourseImport` slot; persisting it would re-navigate on
  every cold start, at a cache path that may no longer exist.
- **`/course-import` needed no change** — it already took a bare file `uri`,
  which was the point of giving it that input contract in Phase 1.

**Deliberately NOT shipped: ACTION_SEND** ("share to Defensive Pedal"). Android
puts that URI in `EXTRA_STREAM` rather than the intent data, so
`Linking.getInitialURL()` returns null for it. Supporting it needs native code
or `expo-share-intent` — it is not another manifest entry, and pretending
otherwise would ship a filter that silently does nothing.

⚠️ **Neither platform's filter is verifiable from this environment.** Intent
resolution is a device behaviour; the manifest XML parses and the JS is unit
tested, but "does Drive actually offer us for this .gpx" can only be answered on
a phone, and the iOS half has never run at all (no macOS hardware — the standing
caveat for every iOS change in this repo).

Each phase is independently shippable and each ends with a user-visible win,
per design-context D2.
