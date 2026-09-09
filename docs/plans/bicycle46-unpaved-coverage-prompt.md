> **RESOLVED 2026-09-09 — do not run this.**
>
> The answer turned out to be yes, it mattered: OSRM_Server widened the class in
> `090c226` to cover `highway=path` and `bridleway` without a paved surface tag
> (`footway` deliberately excluded — untagged urban footways are usually paved
> sidewalks). It shipped as generation b46v2 on 2026-09-09. Measured after:
> Brasov -> Rasnov moved 15.7% -> 63.1% unpaved, and `exclude=unpaved` now
> returns a fully paved route only +377 m longer.
>
> Device-confirmed by the product owner on preview v0.2.154. Kept for the
> reasoning, not as an open task. Regression check:
> `node scripts/probe-unpaved-widening.mjs`.

# Prompt: does bicycle46 classify unsurfaced paths as `unpaved`?

Paste this into a session in `C:\dev\OSRM_Server`.

---

In the Defensive Pedal app, "avoid unpaved" sends `?exclude=unpaved` to the
safety OSRM, and the app now also measures how much of a route is unpaved by
reading `steps[].intersections[].classes`. Both depend entirely on which ways
the Lua profile marks with `result.forward_classes['unpaved']`.

I need to know whether the LIVE profile classifies ways that are unsurfaced in
practice but carry no `surface` tag — specifically `highway=path`,
`highway=bridleway` and `highway=footway`.

**What I already know, so don't re-derive it:**

- `exclude=unpaved` works. Undefined classes are rejected with
  `InvalidValue: Exclude flag combination is not supported`, and on five test
  pairs around Rasnov the exclusion took routes from 10–34 classed
  intersections to zero. The mechanism is sound.
- `bicycle38.lua` (newest on `feat/severity-first-risk`) classifies:
  ```lua
  local unpaved_surfaces = Set {
    'unpaved','gravel','fine_gravel','dirt','ground',
    'sand','grass','mud','earth','wood'
  }
  if (surface and unpaved_surfaces[surface])
     or (highway == 'track' and not (surface and profile.paved_surfaces[surface]))
  ```
  So: an explicit unpaved `surface` tag, OR `highway=track` without a paved
  surface. **`path`, `bridleway` and `footway` with no surface tag are not
  covered.**
- Production runs **b46v1** since 2026-09-01. `bicycle46.lua` lives on branch
  `victorwho/integration`, which was not fetchable from the machine that did
  this analysis, so the rule above is unverified against what is actually live.

**What I want:**

1. Read the live rule: `git show victorwho/integration:bicycle46.lua`, find the
   `forward_classes['unpaved']` assignment, and quote the condition verbatim.
2. Say plainly whether `highway=path` / `bridleway` / `footway` **without** a
   `surface` tag are classified.
3. If they are not, tell me how much it would matter before changing anything.
   In OSM, an unsurfaced path is very often tagged `highway=path` with no
   `surface` at all — so the question is how many such ways the router is
   actually choosing. Measure it rather than estimating: take a handful of
   real routes through the Rasnov / Bran / Zarnesti area, pull the way ids the
   route uses (`annotations=nodes` plus an Overpass lookup, or the OSM extract
   you already have locally), and report what share of route metres sits on
   `highway=path|bridleway|footway` with no `surface` tag.
4. Only then recommend. If the share is negligible, say so and change nothing.
   If it is material, propose the narrowest rule that fixes it and say what it
   would cost — widening `unpaved` changes both routing (more ways excluded
   when a rider asks) and reported percentages, and it is a full graph rebuild.

**Constraints:**

- A rebuild is expensive. Do not propose one without the measurement in (3).
- Do not widen the class to anything a road cyclist would happily ride. The
  point is "the rider asked to avoid unpaved and got a forest trail", not
  "every way lacking a surface tag is suspect" — `highway=residential` with no
  surface tag is almost always paved and must NOT become unpaved.
- Whatever you conclude, record the measured share in the profile comment next
  to the rule, so the next person does not have to re-derive it. This project
  has already been bitten twice by constants that were guessed and described as
  deliberate.

**Context on why this came up:** the app was reporting every route as 100%
paved. That turned out to be an app-side bug — it read `leg.annotation.classes`,
which OSRM never populates, instead of `steps[].intersections[].classes`. Fixed
in defpedal `2910b08`; the same routes now report 55.0%, 53.7% and 44.6%
unpaved. The profile-coverage question above is the remaining unknown, and it
is genuinely open — it may well turn out to be nothing.
