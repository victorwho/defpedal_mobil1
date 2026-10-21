# Commute Mode — Plan

Status: **PLANNED** (2026-10-21). Feature #1 of the value-add review in
`changestoimplement.md`. Subsumes the Phase 7 item "Tomorrow's route safety
preview (needs saved commute routes)" and fixes backlog UX-16.

## Goal

A rider who commutes sets Home and Work once, picks the days and time they
leave, and on those mornings gets one notification:

> **Dry and 12°C at 07:45** — safe route to Work, 22 min. Tap to check today's hazards.

One tap opens route preview Home → Work with **live** hazards, risk and
weather. An optional evening briefing does Work → Home.

Why this one first: commuters ride most days, so it is the cheapest lever on
retention and on the streak engine. Most of the parts exist (saved places,
the weather-ping scheduler, the validated "replay a route from a notification"
path of the first-ride reminder).

## Success criteria

Measured, with the session count stated next to every rate (production volume
is ~28 sessions / 48 h, so read early numbers as direction, not proof):

1. **Works:** a briefing fires on each enabled day within the accepted Doze
   drift (5–15 min), carries the forecast for the departure **hour**, and a tap
   lands on route preview Home → Work. Verified on a preview build.
2. **Used:** `commute_enabled` riders / riders with both places saved.
3. **Pulls rides:** `commute_briefing_tapped` → ride started within 2 h of the
   tap.
4. **Kill criterion:** if after 4 weeks fewer than ~10% of taps lead to a ride,
   stop at phase 1 and do not build the server-side phase 2.

## Key decision — on-device scheduling (phase 1), not server push

| | On-device local notifications (recommended) | Server push |
|---|---|---|
| Home/Work location | stays on the phone | must be stored server-side — a home address is sensitive personal data; Privacy Policy + Data Safety form change |
| Deploy | client only, no migration, no API deploy | migration + API + cron + client |
| Content freshness | computed at the last app open/foreground: weather from a ≤7-day forecast, ETA from a route fetched then | computed at send time |
| Rider who stops opening the app | briefings stop after the 7-day horizon | keeps going |

Phase 1 uses the existing pattern of the cycling-weather ping (generation-tagged
one-shot local notifications, rescheduled on every open/foreground). The stale
part is avoided rather than solved: **hazards are not put in the notification
text** — the tap opens route preview, which fetches them live. Server push is
phase 2, and only if the kill criterion above is passed.

## Phase 1 scope

### 1. Saved places that can actually be managed (UX-16)

Today (`SearchBar.tsx`): unset Home/Work rows are `accessibilityRole="button"`
with `onPress={undefined}`; saving needs an unhinted 500 ms long-press on a
search result; `setSavedPlace(type, null)` has no UI caller.

- Unset row tap → enters "set Home / set Work" mode: the field stays focused,
  a hint line reads "Pick an address to save as Home", and the next selected
  suggestion is saved instead of routed to.
- Set row: a trailing edit control → menu *Change* / *Remove*. *Remove* calls
  `setSavedPlace(type, null)`.
- The same controls in the new Profile › Commute section (below).

### 2. Commute settings (store)

Own slice, `src/store/commuteSlice.ts` (built 2026-10-21), **user-scoped**
like `savedPlaces` (cleared by `resetUserScopedState`, persisted via
`partialize`). No persist migration: it is a new top-level key, so older saved
state simply falls back to the default.

```ts
commute: {
  enabled: boolean;              // default false (opt-in)
  days: number[];                // ISO weekdays 1..7, default [1,2,3,4,5]
  departTime: string | null;     // 'HH:MM'; null until picked in setup (no default)
  returnTime: string | null;     // 'HH:MM' or null (evening briefing off, the default)
  routeEstimates: {              // one per direction, refreshed at most once a day
    direction: 'to_work' | 'to_home';
    durationSeconds: number;
    distanceMeters: number;
    fetchedAt: string;           // ISO
    placesKey: string;           // identifies the Home/Work pair; a change invalidates it
  }[];
}
```

The lead time is a constant, `COMMUTE_LEAD_MINUTES = 15`, not state: nothing
in the UI changes it. Malformed times are ignored, never stored.

Turning it off, removing Home or Work, or `resetUserScopedState` all cancel
the scheduled briefings (the weather ping's toggle-off lesson: with several
one-shots queued, "stop scheduling" alone is not enough).

### 3. Pure schedule + message builders (`src/lib/commute-schedule.ts`)

No I/O, fully unit-tested:

- `buildCommuteFires(now, settings, horizonDays = 7)` → `{ at: Date; direction: 'to_work' | 'to_home' }[]`.
  Calendar-day math via `addDays` (DST-safe — the weather scheduler already
  paid for raw-ms hour offsets once), skip fires in the past, briefing time =
  departure − `leadMinutes`.
- `buildCommuteMessage({ direction, departTime, departAt, origin, forecast, route, units, t })` →
  `{ title, body, tone }`. Good weather → short positive line; bad weather
  (storm, snow, freezing, strong wind, heavy rain — reuse the thresholds in
  `daily-weather-messages.ts` / core `cyclingWeather`) → a warning line.
  Temperature stays metric (project rule); ETA through the core formatters
  with the rider's `measurementSystem`; i18n strings carry no unit.
- After sunset at departure (`solarTime.isAfterSunset`) → append "it'll be
  dark — lights on" (cheap overlap with feature #5).

### 4. Forecast at the departure HOUR

The weather ping uses daily max/min, which is wrong for a 07:45 departure.
Fetch Open-Meteo **hourly** `temperature_2m, precipitation_probability,
wind_speed_10m, weather_code` for the home (morning) and work (evening)
coordinates, 8 days, `timezone=auto`, with the same 10 s abort. Fetch fails →
keep the previously scheduled set (same rule as the weather ping: fetch first,
then cancel + reschedule).

### 5. Route ETA

On a scheduling pass, if `cachedRoute` for a direction is missing, older than
24 h or `placesKey` changed, fetch a Safe route through the existing client
routing (`mapbox-routing.ts`, respecting the rider's `isEbike` / `avoidUnpaved`)
and store duration + distance. Outside routing coverage or on failure → the
message omits the ETA rather than inventing one.

### 6. Scheduler (`src/lib/commute-notification.ts` + `CommuteScheduler` provider)

Mirrors `daily-weather-notification.ts`: lazy `require('expo-notifications')`
behind `hasNotificationsNativeModule()`, test seam, identifiers
`commute-briefing-g<gen>-<i>`, schedule the new generation BEFORE cancelling
the old one (crash mid-pass ⇒ duplicates the next pass sweeps, never an empty
queue), one retry per fire, `timeInterval` one-shots (no exact alarms — Play
restricts that permission). Android channel `commute`. Runs on mount and on
foreground with a 15 min rate limit. Permission: reuse
`ensureNotificationPermissionAsync()` **only when the rider turns Commute on**
— that is the moment the ask makes sense.

Pending-notification budget: commute ≤ 14 (7 days × 2) + weather ≤ 12, under
iOS's 64.

### 7. Coexistence with the cycling-weather ping

Two weather messages on the same morning is noise. On a day with a commute
briefing the weather ping sends nothing. Done the way the first-ride reminder
already does it: `daily-weather-notification.ts` drops any planned fire that
`isSameLocalDay` as a reminder; commute days join that filter. No change to
`buildWeatherSchedule` (the `excludeDays` input first planned here is not
needed). Days without a commute keep the weather ping unchanged.

### 8. Tap → route preview

New `data.type: 'commute'` case in `handleNotificationResponse`, modelled on
the first-ride reminder case: validate the payload (direction + both
coordinates, numbers in range) because it is replayed into routing; do nothing
while `NAVIGATING`; `setRouteRequest({ origin, destination, waypoints: [],
mode: 'safe', … })` with the rider's e-bike / unpaved preferences, then
`router.push('/route-preview')`. The payload carries coordinates, not a
reference to the store, so a tap still works if the places changed after
scheduling (it routes where the notification said).

### 9. Profile › Commute section

Home and Work rows (set / change / remove), Commute briefing toggle, days
(7 pills), departure time and optional return time (reuse the half-hour
pickers from quiet hours, `src/lib/quietHours.ts` — zero-padded `'HH:MM'`).
The toggle is disabled with a hint until both places are set. **Turning it on
for the first time opens a short setup step** that asks the departure time
(no preselected value — the rider must choose), the days (Mon–Fri
preselected) and offers the evening return briefing. Commute is not enabled
until a departure time is chosen; `buildCommuteFires` returns nothing while
`departTime` is null. Free, not
Plus-gated (it is a retention lever; gating it shrinks the population it is
meant to retain).

### 10. i18n, telemetry, tests

- EN / RO / ES for every string; message pools small (3–4 good-weather variants
  per direction, rotated, no emoji).
- PostHog: `commute_enabled` / `commute_disabled`, `commute_briefing_scheduled`
  (count per pass), `commute_briefing_tapped` (direction), and
  `navigation_started` gains `source: 'commute'` when the preview came from a
  briefing tap.
- Tests: schedule builder (weekday masks, DST week, past fires, lead time,
  return off), message builder (good / bad / after sunset / no ETA / imperial),
  scheduler (fetch-failure keeps the old set, generation sweep, toggle-off and
  `resetUserScopedState` cancel), weather `excludeDays`, tap handler (valid
  payload → preview, invalid → planning, NAVIGATING → no-op), SearchBar
  set/remove flows, store migration.
- Diagnostics (dev/preview only): "Fire commute briefing in 10 s".

## Out of scope (phase 1)

Server-sent briefings, hazard counts in the notification text, learning the
departure time from `user_ride_pattern`, detecting commutes automatically from
trip history, transit/multimodal.

## Files

New: `src/lib/commute-schedule.ts` (+test), `src/lib/commute-messages.ts`
(+test), `src/lib/commute-notification.ts` (+test),
`src/providers/CommuteScheduler.tsx`, a Profile `CommuteSection` organism.
Changed: `src/store/appStore.ts` (slice, partialize, reset, migration),
`src/design-system/molecules/SearchBar.tsx` + `app/route-planning.tsx`
(UX-16), `src/lib/daily-weather-schedule.ts` + `daily-weather-notification.ts`
(`excludeDays`), `src/lib/push-notifications.ts` (tap case),
`src/providers/AppProviders.tsx` (mount), `app/profile.tsx`,
`app/diagnostics.tsx`, `src/i18n/{en,ro,es}.ts`.
No server, migration or Cloud Run change.

## Build order

1. UX-16 saved-place fixes (shippable alone). **Code done and device-confirmed on the
   dev build 2026-10-21, not yet committed**: `SearchBar` set mode + Change/Remove menu,
   `onRemovePlace` at the four route-planning call sites, EN/RO/ES keys, 5 new
   tests (mutation-checked). Known gap kept on purpose: the Home/Work rows only
   appear once at least one place is set, so a rider with neither has no search
   entry point; the Profile › Commute section (step 5) is that entry point.
2. Store slice. **Built 2026-10-21** (`commuteSlice.ts`, 13 tests, reset and
   persistence wiring mutation-checked); no UI yet, so nothing to device-test.
3. Pure builders + tests. **Built 2026-10-21**: `src/lib/commute-schedule.ts`
   (`buildCommuteFires`, DST-safe, weekday mask, lead time, optional evening)
   and `src/lib/commute-messages.ts` (`buildCommuteMessage`, one weather
   condition named by severity, ETA via core formatters, lights note after
   dark, localized via a passed `t`); `commute.*` copy in EN/RO/ES; 21 tests,
   including every key in every locale. Not imported by the app yet.
4. Hourly forecast + ETA cache + scheduler + weather skip. **Built and
   device-confirmed 2026-10-21** (dev build: test fire, real schedule, tap): `commute-forecast.ts` (hourly parse, local hour
   key), `commute-notification.ts` (pass, cancel, Diagnostics test fire; ETA
   only from a route that came back SAFE, cached 24 h per Home/Work pair, an
   older estimate kept if a refresh fails), `CommuteScheduler` provider (mount,
   foreground with 15 min limit, and every settings/places change), weather
   ping skip via `commuteDepartures`, Diagnostics card "Commute briefing (dev)"
   (fire in 10 s / leave in 20 min / off). The tap case (§8) shipped with it:
   since 2026-10-21 EVERY notification tap first shows its full text in-app
   (owner request), and the card's "Show route" button runs the commute action.
5. Tap handler + Profile section + i18n + telemetry + diagnostics button.
   **Built 2026-10-21**: `app/commute.tsx` (Profile > Commute) with its own
   address search (`CommutePlaceSearch`, so a rider with no saved places can
   set them) and `CommuteTimePicker`. Turning the briefing on is the setup:
   permission first, then the departure time (no default); closing either
   leaves Commute off. Days (never empty), optional evening briefing.
   Telemetry: `commute_enabled` / `commute_disabled`,
   `commute_briefing_scheduled`, `commute_briefing_tapped`, and
   `navigation_started` with `source: 'commute'` within 2 h of "Show route".
   8 screen tests. The tap handler and Diagnostics card came with step 4.
6. `npm run typecheck`, tests, `npm run check:bundle` **plus a bundle grep for
   `commute-briefing`** (a port is not an identity — error-log #103), preview
   build, device pass: set places, enable, fire via Diagnostics, tap, confirm
   preview; then a real weekday morning.

## Risks

- **Rider not at home when the briefing fires** — the preview starts from
  saved Home. Acceptable for v1; route preview already supports changing the
  start.
- **Stale ETA** — at most 24 h old; routes rarely change that fast.
- **Doze drift** of 5–15 min is accepted, as for the weather ping.
- **Briefings stop after 7 days without an open.** Deliberate for phase 1;
  this is the main argument for phase 2.

## Product decisions (answered 2026-10-21)

1. Evening return briefing: **in v1**, optional, off by default, offered in setup.
2. On commute days the briefing **replaces** the cycling-weather ping (§7).
3. Departure time: **asked during setup**, no default.
4. **Free**, not Plus-gated.
