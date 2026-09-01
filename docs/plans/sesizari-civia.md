# Sesizări — hazard → civic complaint handoff (Romania)

**Status:** planned, not started · **Branch:** `victorwho/Sesizari`
**Goal (chosen):** rider agency / retention. Success is the rider feeling their
report went somewhere beyond a map pin — *not* measured civic outcomes.

When a rider reports (or opens) an eligible hazard in Romania, offer to escalate
it to the competent authority through [civia.ro](https://civia.ro). We compose a
Romanian petition paragraph locally, copy it to the clipboard, and hand off to
Civia's form in an in-app browser. The rider completes and sends it there.

---

## 1. Recon — what Civia actually is

Reverse-engineered from their Next.js bundle (civia.ro 403s plain fetch; chunks
were pulled directly). **All of this is external and unversioned — treat it as
observation, not contract.**

| Fact | Consequence for us |
|---|---|
| The form reads exactly **one** URL param: `?continue=<draftId>` → `GET /api/sesizari/drafts?id=` | There is no supported prefill-by-URL. Clipboard is the only coupling-free path. |
| `?continue=` restores `tip, titlu, locatie, descriere, sector, county` — **not** lat/lng, **not** photos | Even the draft API wouldn't carry coordinates. |
| `?continue=` is **ignored entirely** if the browser holds a local draft in `localStorage` | Draft-based prefill would fail silently for returning users. Another reason we're not using it. |
| Final submit requires `author_name` + `author_address` (OG 27/2002 art. 7 — anonymous petitions may be disregarded) | **We can never file on the rider's behalf.** Identity is typed on Civia. This is a handoff, permanently. |
| Their pipeline has `/api/ai/classify`, `/api/ai/detect-city`, `/api/ai/improve` — free text is rewritten into formal language and the city is detected from prose | Argues *for* one rich paragraph over a labelled block: prose is their happy path. |
| They already append a `ref` param to outbound links | Attribution is a concept they've built; `?ref=defensivepedal` is free to add. |
| 21 problem categories, 335 cities, 42 counties | 6 of our 10 hazard types map cleanly. |
| Launched April 2026 · **262 sesizări total**, 100 answered, 24 resolved | Small project. Their URL structure is young and may move. Hence the served base URL + kill switch (§6). |

**Decision:** clipboard + plain link. No dependency on any Civia internal.

---

## 2. Locked decisions

| # | Decision | Chosen |
|---|---|---|
| 1 | Purpose | Rider agency / retention |
| 2 | Prefill mechanism | **Clipboard + plain link** — no Civia API coupling |
| 3 | Clipboard payload | **One rich Romanian paragraph** (address + problem + date + GPS + request) |
| 4 | Handoff target | `civia.ro/sesizari` in the **in-app browser** (`expo-web-browser`) |
| 5 | Trigger surfaces | **Post-ride batched card** (feedback screen) **+ HazardDetailSheet row** **+ at-report CTA on route-planning** (added 2026-08-28 — see §5a) |
| 6 | Eligible hazard types | `pothole`, `poor_surface`, `dangerous_intersection`, `illegally_parked_car`, `blocked_bike_lane`, `aggro_dogs` |
| 7 | Romania gating | **Reverse-geocode the hazard coordinate**, gate on `RO` |
| 8 | Persistence | **Server record** in a new `sesizari` table |
| 9 | Award trigger | **Tap-through** (we never observe an actual filing) |
| 10 | Reward | **Tiered badge ladder 1 / 5 / 25**, new `civic` tier_family |
| 11 | Farm guard | **None** — explicit decision, see §9 |
| 12 | Hazard reference | **Snapshot columns + nullable `hazard_id`** |
| 13 | Duplicates | Show escalation count, allow parallel filings, **block same rider re-filing same hazard** |
| 14 | Prompt arbitration | Claims a slot, **below `ReviewPromptCard`** |
| 15 | Photos | **None in v1**; handoff copy nudges the rider to add one on Civia |
| 16 | Preview sheet | **None** — copy and go |
| 17 | Paste discovery | **Native Alert first, browser opens from the OK handler** |
| 18 | Ineligible types / non-RO | **Render nothing** |
| 19 | Account gate | **Anonymous allowed** (Civia collects identity itself) |
| 20 | Ops posture | **Kill switch only**, no advance notice to Civia |
| 21 | Kill switch | `SESIZARI_ENABLED` + `SESIZARI_BASE_URL` env vars, served via `GET /v1/profile` |
| 22 | Badge art | 3 holo PNGs **before ship** (keeps `list-missing-holo-badges.py` at 0 gaps) |
| 23 | Counter surface | **Impact dashboard** row + trophy case |

---

## 3. Core — `packages/core/src/sesizare.ts`

Pure, offline-capable, fully unit-testable. Lives in core for the same reason the
`pedalVoice` catalogs do: it is civic copy, not UI chrome, and it must never be
run through the i18n layer (the text is **always Romanian**, regardless of app
locale — the recipient is a Romanian public authority).

```ts
export const SESIZARE_ELIGIBLE_HAZARD_TYPES = [
  'pothole', 'poor_surface', 'dangerous_intersection',
  'illegally_parked_car', 'blocked_bike_lane', 'aggro_dogs',
] as const satisfies readonly HazardType[];

export const isSesizareEligible = (t: HazardType): boolean => ...

/** Civia category slug, recorded on the row for future routing. */
export const CIVIA_CATEGORY_BY_HAZARD_TYPE = {
  pothole:                'groapa-in-asfalt',
  poor_surface:           'trotuar-stricat',
  dangerous_intersection: 'semafor-defect',
  illegally_parked_car:   'parcare-pe-trotuar',
  blocked_bike_lane:      'ocupare-abuziva-domeniu-public',
  aggro_dogs:             'caini-fara-stapan',
} as const;

export interface SesizareInput {
  readonly hazardType: HazardType;
  readonly address: string;    // from reverseGeocodeAddress
  readonly coordinate: Coordinate;
  readonly observedAt: string; // ISO
}
export const composeSesizareText = (input: SesizareInput): string => ...
```

**Shape of the output** (one paragraph, six templates keyed by hazard type):

> Pe strada Fabrica de Glucoză nr. 5, Sector 2, București, există o groapă în
> carosabil care pune în pericol bicicliștii care circulă pe această stradă. Am
> observat problema pe 27 august 2026, în timp ce mă deplasam cu bicicleta.
> Coordonate GPS: 44.4612, 26.1109. Vă rog să dispuneți remedierea.

Template rules, locked by tests:

- Always Romanian, correct diacritics, formal register (`Vă rog să dispuneți…`).
- No emoji, no markdown, no placeholder may leak raw (same guard as `pedalVoice`).
- Date rendered as Romanian long form (`27 august 2026`).
- Coordinates to 4 decimals.
- `illegally_parked_car` / `blocked_bike_lane` name **Poliția Locală** as the
  competent body; the rest address the primărie generically.

---

## 4. Romania gating — `apps/mobile/src/hooks/useSesizareAvailability.ts`

⚠️ **Do not use `resolveCountryFromCoord`.** The `RO` bbox in
`countryCoverage.ts` deliberately over-includes Belgrade and Chișinău
(documented in CLAUDE.md) — it would offer Romanian city-hall complaints to
riders in Serbia and Moldova.

Instead: `reverseGeocodeAddress(coordinate)` (already exists in
`mapbox-search.ts`) returns both the street address we need for the text **and**
the country. One call, two purposes. Wrap in TanStack Query keyed by hazard id
with a long `staleTime` — the address of a pothole does not change.

```
eligible = sesizariEnabled            // kill switch, §6
        && isSesizareEligible(type)   // §3
        && geocode.countryCode === 'RO'
        && geocode.address != null
```

Anything false → **render nothing** (no disabled row, no explanation).

Offline: the geocode fails, so the CTA does not appear. Acceptable — the handoff
needs a browser anyway. It appears next time the hazard is opened online.

---

## 5. Mobile — the handoff

`apps/mobile/src/hooks/useSesizare.ts`

```
startSesizare(input):
  1. text = composeSesizareText(input)
  2. await Clipboard.setStringAsync(text)      // expo-clipboard, already a dep
  3. enqueueMutation('sesizare', { ... })      // offline queue, survives a flaky POST
  4. Alert.alert(
       'Textul sesizării e copiat',
       'Lipește-l în câmpul „Descriere" pe Civia. Adaugă și o poză — crește
        mult șansa să fie rezolvată.',
       [{ text: 'Deschide Civia', onPress: openBrowser }]
     )
  5. openBrowser → WebBrowser.openBrowserAsync(`${baseUrl}?ref=defensivepedal`)
```

Both `expo-clipboard` and `expo-web-browser` are **already dependencies** — no
new native module, no `expo prebuild`.

The Alert is load-bearing: with no preview sheet it is the only moment the rider
learns something is on their clipboard. Opening from the OK handler guarantees
it is read (this is the `useShareCard` pattern, which already does exactly this
for the Play Store link).

### Surfaces

**(a) `HazardDetailSheet`** — a row under the vote buttons on any hazard, yours
or a neighbour's. Not an ask-surface, no arbitration needed. Shows the
escalation count when > 0: *„2 bicicliști au dus deja această problemă la
primărie"*. Hidden entirely when this rider has already escalated this hazard.

**(b) Post-ride batched card** — on `feedback.tsx`, listing the eligible hazards
reported during that ride with a per-hazard CTA. **Must** claim through
`claimPromptSlot` (CLAUDE.md: *all* new attention-asking cards do), registered
**below `ReviewPromptCard`** in `prompt-arbitration.ts`:

```
SaveRideCard > ReviewPromptCard > SesizareCard > AnalyticsOptInCard
```

**(c) Impact dashboard** — one row in the lifetime-counters block:
*„X sesizări către primărie"*, beside CO₂ saved and hazards reported.

---

## 6. Server

### 6.1 Migration — `sesizari` table

```sql
create table public.sesizari (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  hazard_id      uuid references public.hazards(id) on delete set null, -- nullable
  hazard_type    text not null,
  civia_category text not null,
  lat            double precision not null,
  lon            double precision not null,
  geog           geography(Point,4326) not null,
  address        text,
  created_at     timestamptz not null default now()
);
create unique index sesizari_user_hazard_uniq
  on public.sesizari (user_id, hazard_id) where hazard_id is not null;
create index sesizari_hazard_idx on public.sesizari (hazard_id);
create index sesizari_user_idx   on public.sesizari (user_id);
```

**Why the snapshot columns:** hazards are written through the offline queue, so a
hazard reported three minutes ago may have **no server id** when the post-ride
card renders. The row carries its own coordinate/type/address and links to the
hazard only when the id happens to be known. This also survives the hazard later
expiring or being hard-deleted by the 3 AM cron.

RLS: insert own row only, select own rows only, no public read, no update/delete
policies (service role for admin). Revoke the Supabase default-ACL excess — see
the `road_risk_data` v22 migrations for that pattern.

Cross-user escalation counts do **not** come from RLS-readable rows; they come
from a `security definer` aggregate (below).

### 6.2 Endpoints

- `POST /v1/sesizari` — `requireWriteUser` (**anonymous allowed**). Body:
  `{ hazardId?, hazardType, coordinate, address? }`. Server derives
  `civia_category`. `409` on the unique-index conflict (already escalated).
  Full Fastify request **and response** JSON Schema in
  `services/mobile-api/src/lib/sesizareSchemas.ts` — **Gotcha #9**: unknown
  response fields are silently stripped.
- `sesizareCount` added to each item in `GET /v1/hazards/nearby`, via a
  `security definer` RPC aggregating `sesizari` by `hazard_id`. **Must be added
  to the existing hazard response schema** or it will be dropped.
- `GET /v1/profile` gains `sesizariEnabled: boolean` and
  `sesizariBaseUrl: string`, sourced from env. The client caches both in the
  store; **default ON** if the profile read fails (fail-open, matching
  `NUDGES_ENABLED`).

### 6.3 Kill switch

`SESIZARI_ENABLED` (default `true`) and `SESIZARI_BASE_URL` (default
`https://civia.ro/sesizari`) on Cloud Run, read through `validateConfig()` in
`config.ts`.

```
gcloud run services update defpedal-api --region europe-central2 \
  --update-env-vars SESIZARI_ENABLED=false --project gen-lang-client-0895796477
```

Live in ~30 s. Serving the **URL** as well as the flag is deliberate: the whole
feature is a URL, and Civia is four months old. If they rename `/sesizari`, this
is fixable in 30 seconds instead of a store release.

### 6.4 Offline queue

New mutation type `sesizare` in `offlineQueue.ts` + `queueSlice.ts`. Not
trip-critical, so it does **not** join the immediate-drain kick and does **not**
need `flushPersistedWrites()`. It rides the normal 15 s tick.

---

## 7. Badges

Three badges, new `tier_family = 'civic_sesizari'`, category/display_tab
`community`, `criteria_unit = 'sesizări'`:

| Tier | Threshold | Suggested name |
|---|---|---|
| 1 | 1 | Vocea Străzii |
| 2 | 5 | Cetățean Activ |
| 3 | 25 | Schimbă Orașul |

- One migration inserting three rows into `badge_definitions` (pattern:
  `202604150006_mia_confident_cyclist_badge.sql`).
- `check_and_award_badges` extended with `count(*) from sesizari where user_id = …`.
- **Copy must be honest.** We only know the rider *opened* Civia with a composed
  petition. Flavor text says *„ai dus problema mai departe"* — never
  *„sesizare trimisă"*.
- **Art:** 3 PNGs through `scripts/process-holo-badges.py` (1254 → 480, die-cut
  alpha) + entries in `holoBadges.ts`. Verify with
  `scripts/list-missing-holo-badges.py` — it must still report **0 gaps**.

---

## 8. i18n

UI chrome in EN/RO/ES (`sesizare.*` keys). The word *sesizare* is kept
untranslated as a proper noun, with a gloss in EN/ES (`Report to the city hall` /
`Reclamación al ayuntamiento`).

**The composed petition text is never localized** — it lives in core and is
always Romanian.

---

## 9. Accepted trade-offs (stated, not hidden)

1. **The 25-tier is farmable.** The award fires on tap-through and there is no
   rate limit or quality gate, so a rider can report 25 hazards and escalate
   each. A guard was offered and declined. If it shows up in the data, the fix is
   a `sesizare` rate-limit bucket (3/day) — but badges already granted cannot be
   clawed back cleanly.
2. **We copy Romanian text on behalf of riders who may not read it.** No preview
   sheet was chosen. An EN/ES-locale rider in Bucharest gets Romanian on their
   clipboard with only the Alert as context.
3. **Civia is not being told.** They handle ~262 sesizări total; Romanian cycling
   traffic could be a step change. The kill switch protects us, not them.
4. **No verification of filing, ever.** Every number in the app — counter,
   badges — measures *escalations started*. Keep the copy aligned with that.
5. **Third-party DOM/URL risk.** Mitigated by the served base URL + kill switch,
   not eliminated. Nothing detects Civia changing their field labels.

---

## 9b. The other direction — importing Civia sesizări as hazards (2026-09-01)

This plan covers the OUTBOUND hand-off. The inbound half — pulling Civia's
public sesizări onto the map as hazards — is built on the hazard-import
pipeline and documented in
[`hazard-import-pipeline.md` §17](./hazard-import-pipeline.md).

Two things there are load-bearing for *this* feature:

1. **Round-trip suppression.** Because we feed Civia, an imported sesizare can
   be one of our own riders' hand-offs coming home. `suppressRoundTrips()`
   matches incoming imports against the `sesizari` ledger (same hazard type,
   ≤120 m, ≤30 days) and drops them, so a rider never sees a second pin beside
   their own report.
2. **One definition of "cycling-relevant".** The import mapping deliberately
   reuses `SESIZARE_ELIGIBLE_HAZARD_TYPES` from this feature. If you change the
   eligible set here, change the import mapping with it — otherwise the two
   halves disagree about what a cycling hazard is.

---

## 10. Phasing

| Phase | Work | Gate |
|---|---|---|
| 1 | `packages/core/src/sesizare.ts` + templates + tests | 6 templates, diacritics, no-emoji, no raw placeholder |
| 2 | Migration + `POST /v1/sesizari` + schemas + env/kill switch + `/v1/profile` fields | API tests incl. anonymous-allowed, 409 conflict, schema round-trip |
| 3 | `useSesizareAvailability` + `useSesizare` + HazardDetailSheet row | Non-RO renders nothing; ineligible types render nothing |
| 4 | Post-ride card + `prompt-arbitration` registration | Yields to ReviewPromptCard; never two ask-surfaces |
| 5 | Badge migration + eval + 3 holo PNGs + manifest | `list-missing-holo-badges.py` reports 0 gaps |
| 6 | Impact dashboard row + i18n ×3 | — |
| 7 | Ship | `npm run check:bundle` 200 · `npm run typecheck` 0 · device test on a **preview** build · Cloud Run deploy · migration applied by hand (memory `reference_supabase-migration-apply`) |

**Pre-ship verification, per error-log #83:** confirm `sesizari` and the badge
rows exist **in the live DB** (`information_schema`) before the client that reads
them ships. A migration file in `supabase/migrations/` proves nothing — this repo
applies them by hand.

---

## 5a. Amendment (2026-08-28) — at-report CTA on route-planning

Decision #5 originally locked two trigger surfaces. Preview testing of
v0.2.129 found a gap it had not anticipated: **reporting a hazard outside
navigation offered no sesizare path at all.**

`appendSessionHazardReport` is called from exactly one place —
`app/navigation.tsx:646`. Route-planning's own report paths
(`handleHazardTypeSelect` for a long-press, `handleHazardPlacementConfirm` for
the crosshair FAB, and `submitHazardOther` for free-text) record nothing, so an
armchair report never lands in `sessionHazardReports`, never reaches the
feedback screen (there was no ride), and the only way back was spotting your
own pin on the map and tapping it.

Decision #5 assumed every hazard report happens during a ride. It does not —
and the non-ride case is arguably the **higher-intent** one. Armchair reporting
is deliberate, stationary and two-handed; a rider at home reporting the pothole
outside their block is precisely the person who files a petition. Post-ride is
the batched, low-attention moment.

**Implementation.** `SesizareRow` is rendered inside the existing success toast
on `route-planning.tsx`, above the share button. The row already self-hides on
ineligible type / outside Romania / kill switch off, so no new gating was
needed — it is a drop-in. `surface` gains a third value, `'report'`, used only
for the `sesizare_started` telemetry label (it never reaches the server).

**Two decisions worth not undoing:**

1. **It does NOT claim a prompt slot.** Like the HazardDetailSheet row — and
   unlike the post-ride card — this is a consequence of an action the rider
   just took, not an unsolicited ask. Claiming would block the analytics
   prompt for the whole session over a contextual follow-up, inverting the
   intent of the arbitration rule. Precedent: neither `SesizareRow` nor
   `HazardDetailSheet` calls `claimPromptSlot`; only `feedback.tsx`,
   `impact-dashboard.tsx` and `AnalyticsOptInCard` do.
2. **The toast lives 15s instead of 5s for eligible types.** Five seconds is
   not enough to notice a CTA and decide. The Romania gate is async (a reverse
   geocode inside the row), so the duration keys off the cheap synchronous
   `isSesizareEligible` check — a rider outside Romania simply gets a slightly
   longer toast, which is harmless.

Both are pinned by `apps/mobile/src/lib/__tests__/sesizare-report-surface.test.ts`.

Note `submitHazardOther` always submits `hazardType: 'other'`, which is not
sesizare-eligible, so the free-text path correctly shows no CTA.
