# Are we counting all active users? — No

Generated: 2026-09-11
Question: are the people we see using the app in a day all the people who actually used it?
Method: PostHog HogQL (project 162527) cross-joined against live Supabase, plus a code read of the telemetry stack. `identify()` uses the Supabase user id, which makes the two systems joinable.

## Verdict

**No. The count is wrong in both directions.** PostHog's person count sits
*below* the number of humans we can prove used the app on several days, while
its `distinct_id` count runs ~2.2x the person count — so a DAU built on ids
inflates and a DAU built on persons undercounts.

## Measured — 30 days to 2026-09-11

| | |
|---|---|
| Users with server-side proof of app use | **209** |
| …with **no PostHog event under their own id** | **107 (51%)** |
| PostHog `distinct_id`s in the same window | 796 |
| …matching a real `profiles` row | **183** |
| …matching no account (device-anonymous) | **613 (77%)** |

One day end to end, **2026-09-10**: 15 provable users; PostHog counted **11
persons** across 26 ids; **8 of the 15 absent**, including `953e89ac…`, who
completed a full ride with an impact recorded. Traced across 60 days of
PostHog, those 8 have **zero events, ever** — not a transient delivery failure.

Days where PostHog persons < provable humans: 09-10 (11 vs 15), 09-08 (9 vs
12), 08-30 (12 vs 16). On most other days PostHog legitimately sees MORE, which
is correct: a rider who opens the app and looks at the map writes nothing
server-side, and an anonymous rider who has not opted into riding tips does not
even register a push token.

## Cause

`TelemetryProvider`'s identify effect ran on every mount while `user` was still
null, because auth resolves asynchronously. `telemetry.identify(null)` calls
PostHog's `reset()`, which **mints a brand-new anonymous `distinct_id`**. So
every cold start began a fresh identity, events fired under it, and the link to
the account was made late or never — which is what 613 unlinked ids looks like.

`reset()` is a sign-out operation. "Auth has not answered yet" is not a
sign-out. Fixed by gating on `isLoading`, which was already on the auth context
and simply not consulted. Pinned by `TelemetryProvider.test.tsx`, whose first
spec fails against the old code.

## Ruled out — do not re-investigate

- **PostHog key missing from the build.** No. It is in `assets/app.config`, not
  the JS bundle. A bundle-only grep comes back empty and looks alarming; the key
  reaches the app through `extra.posthogApiKey`, so search the whole APK.
- **`reset()` discarding queued events.** No. posthog-react-native's `reset()`
  explicitly keeps `PostHogPersistedProperty.Queue` (plus AiQueue, LogsQueue),
  and `persistence` defaults to `'file'`, so events survive a reset AND an app
  kill. The comment in `disablePostHog()` claiming otherwise was wrong and is
  corrected.
- **No app-open event.** No. `captureAppLifecycleEvents` defaults to true in
  SDK v4 and the client wires `AppState` itself, firing `Application Opened` /
  `Became Active` / `Backgrounded`. `RouteTelemetryObserver` also emits a
  `$screen` per route change.
- **Stale pre-2026-07-19 opt-out default.** Not the main cause: **83 of the 107**
  missing accounts were created *after* the default flipped to ON.

## Still open

**Analytics consent is never recorded server-side.** The only consent column on
`profiles` is `notify_riding_tips_consented_at`. So the opt-out population is
structurally unknowable and the PostHog denominator cannot be corrected — we
cannot measure our own analytics coverage. One nullable column on `profiles`,
synced the same way `app_environment` now is, would close it.

**The fix is forward-only.** It repairs identity for sessions on builds that
carry it; the 613 historical unlinked ids stay unlinked. Treat PostHog
per-user history before this release as covering about half the active
population.

## Method note

A first pass measured 37 "server-witnessed" users on 2026-09-07 and nearly
reported a 5x undercount. That day was a Monday, and `xp_events` showed 32
users — the weekly leaderboard settlement cron awarding XP to people who never
opened the app. The real figure was 7. Every number here excludes cron-written
tables (`xp_events`, `activity_feed`) and counts only client-driven writes.
