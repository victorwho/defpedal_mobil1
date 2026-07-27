# Garmin (and friends) Route Hand-off — Plan & Status

Goal: riders follow Defensive Pedal routes on their Garmin smartwatch / bike
computer (and other devices/apps) with as few taps as possible.

## Path A — "Send to Garmin Connect" via explicit Android intent — ✅ SHIPPED 2026-07-27

When the Garmin Connect Android app is installed, every GPX export surface
(route preview, trip detail, saved routes) offers a chooser: **Send to Garmin
Connect** / Save or share file / Cancel. The Garmin option writes the GPX and
fires an explicit `ACTION_VIEW` intent at `com.garmin.android.apps.connectmobile`
with a FileProvider `content://` URI — Garmin's course-import screen opens
directly; after the user saves, Garmin Connect auto-syncs the course to their
paired device (watch: Navigation → Courses). Without Garmin installed the
chooser is invisible (straight to the share sheet — zero regression). iOS uses
the ordinary share sheet, where Garmin Connect appears as a target if installed.

Implementation map:
- `src/lib/garmin.ts` — package constant, installed-detection via
  `getApplicationIconAsync` probe (session-cached), `sendGpxToGarminConnect`
  (explicit VIEW intent). Guarded sync `require()` + loader seams (error-log #72).
- `src/hooks/useGpxDestinationChooser.ts` — the chooser (native Alert, 3 buttons).
- `src/lib/gpx-share.ts` — `target: 'share' | 'garmin'` with silent fallback to
  the share sheet when the hand-off fails.
- AndroidManifest `<queries><package com.garmin...(/></queries>` — Android 11+
  package visibility. New native dep `expo-intent-launcher` (autolinked;
  native rebuild required on dev APKs).

Device-verified end-to-end 2026-07-27 (chooser → Garmin course-import screen).

## Path B — Garmin Courses API (true one-tap, auto-sync) — ⏳ BLOCKED ON APPLICATION

The Connect Developer Program's Courses API pushes courses server-side into the
user's Garmin Connect account after a one-time OAuth 2.0 link — no Garmin-app
interaction; course lands on the watch automatically. This is the Komoot/Strava
mechanism.

- **Next step (Victor):** apply at developer.garmin.com (Connect Developer
  Program). Business-use program, free, response ~2 business days, then portal
  access + integration call; Garmin quotes 1–4 weeks typical integration.
- **Architecture when approved:** partner consumer key/secret live ONLY on
  Cloud Run (never in the app). mobile-api gets OAuth link/callback endpoints +
  a `garmin_connections` token table (Supabase, RLS deny-all) + a course-push
  endpoint converting route polyline+elevation to the Courses payload. Mobile
  gets Profile → "Connect Garmin" and a "Send to Garmin" one-tap on the route
  surfaces (skipping the Path-A chooser hop when linked). ≤50 courses/sync
  (Garmin limit, irrelevant at our scale).
- Sources: developer.garmin.com/gc-developer-program/{courses-api,overview,program-faq}

## Future hand-off targets (Path A pattern generalizes)

Verified/likely GPX "open-with" support on Android — each target ≈ a registry
entry (package + label) + one manifest `<queries>` line + a native rebuild:

| Target | Package | Notes |
|---|---|---|
| Komoot | `de.komoot.android` | Confirmed share-to-import; biggest EU route community — top candidate |
| Wahoo ELEMNT | (verify on device) | #2 bike computer; companion app accepts GPX → syncs to unit |
| Suunto | `com.stt.android.suunto` | Watch route import via app |
| COROS | (verify) | Watch route import via app |
| OsmAnd | `net.osmand` | Phone navigation for riders without a device |

**UI constraint:** Android's native Alert caps at 3 buttons — a second target
requires replacing the Alert with a small option sheet listing detected apps
("Send to Garmin Connect", "Send to Komoot", …, "Save or share file").

**Not possible:** Strava (mobile app cannot open GPX; API has no route-push —
web-only import at strava.com) and Polar (web-only import). Answer for users:
export the file and upload it on the respective website.

**Before adding targets:** log which chooser option users pick + which target
apps are detected installed (PostHog) — let demand data pick the next button.
