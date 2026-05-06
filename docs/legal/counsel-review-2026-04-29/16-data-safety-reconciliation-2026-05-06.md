# Play Console — Data Safety form reconciliation (2026-05-06)

> **Why this doc exists.** The 2026-05-06 readiness audit
> (`docs/reviews/playstore-readiness-2026-05-06-revised.md`) flagged the
> single biggest current risk as a Data Safety / Privacy Policy / shipped-
> code mismatch (P0-NEW). This is the operational checklist for the Play
> Console form change that closes that gap.

## ⚠️ TIMING RULE — read this before you click anything in Play Console

**Apply this checklist AFTER, not before, the new production AAB is live in
Open Testing.** The exact order:

1. Build production AAB (`npm run bundle:production`).
2. Verify cert owner is `CN=Victor Rotariu, …`, NOT `CN=Android Debug, …` —
   `keytool -printcert -jarfile apkreleases/DefensivePedal-Production-v*.aab | grep -i owner`.
3. Upload AAB to Play Console → Open Testing track.
4. **Wait** until the rollout reaches your tester pool (≈5–10 min after
   upload; the rollout indicator on the release page will say "Available
   to testers").
5. Apply the table in §2 below to Play Console → App content → Data safety.
6. Submit. Play re-reviews in 24–48 h.

**Why "after".** Play's re-review can cross-reference the latest live AAB
against the form. If you update the form FIRST while the still-live AAB
ships `firebase-analytics`, you create a mismatch in the opposite direction
(form claims clean, AAB dirty) — same enforcement risk. Submitting the
form before the build only flips which side of the mismatch is wrong.

**Skip-list during the wait.** While the AAB rolls out, do NOT touch:
- The Privacy Policy URL (already updated in commit 7e51ff0; live).
- Tester opt-out lists (the new build needs to reach actual testers to
  validate the consent-default-OFF behaviour change).
- Any other Play Console field — Data Safety is the only thing changing.

## Where to apply

Play Console → All apps → Defensive Pedal → App content → Data safety →
**Manage form** → Edit each section.

## Section-by-section update

### 1. Data collection and security

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (all backends are HTTPS; OSRM moved to TLS 2026-04-28) |
| Do you provide a way for users to request that their data is deleted? | **Yes** — both in-app (Profile → Account → Delete account) and via web (`routes.defensivepedal.com/account-deletion`) |

### 2. Data types — what to declare collected

The list below is exhaustive for the 2026-05-06 build. Anything not in this
list should NOT be checked.

| Category → Data type | Collected? | Shared? | Required / Optional | Purposes |
|---|---|---|---|---|
| **Location → Approximate location** | Yes | Yes | Required | App functionality, Analytics |
| **Location → Precise location** | Yes | Yes | Required | App functionality, Analytics |
| **Personal info → Name** | Yes | No | Optional | Account management |
| **Personal info → Email address** | Yes | No | Optional | Account management |
| **Personal info → User IDs** | Yes | No | Required | Account management, Analytics |
| **Personal info → Other info** *(profile photo URL only if user uploads one)* | Yes | No | Optional | Account management |
| **App activity → App interactions** | Yes | Yes | Optional | Analytics, App functionality |
| **App activity → In-app search history** *(destination autocomplete typed by user)* | Yes | No | Optional | App functionality |
| **App activity → Other user-generated content** *(hazard reports, ride shares, comments, reactions)* | Yes | Yes | Optional | App functionality |
| **App info and performance → Crash logs** | Yes | Yes | Optional | App functionality, Analytics |
| **App info and performance → Diagnostics** | Yes | Yes | Optional | App functionality, Analytics |
| **Device or other IDs → Device or other IDs** *(install referrer + Expo push token)* | Yes | Yes | Required | Account management, Analytics |
| **Photos and videos** | **No** | — | — | (iOS-only permission strings; not collected on Android Play release) |
| **Financial info** | No | — | — | — |
| **Health and fitness** | No | — | — | (We do NOT declare distance/duration here — Play's "Health and fitness" category is for true health data; cycling distance is "App activity") |
| **Messages** | No | — | — | — |
| **Audio** | No | — | — | — |
| **Files and docs** | No | — | — | — |
| **Calendar** | No | — | — | — |
| **Contacts** | No | — | — | — |
| **Web browsing** | No | — | — | — |

> **Why "Crash logs / Diagnostics → Optional".** These are gated behind the
> consent screen at `/onboarding/consent` and Profile → Privacy & analytics.
> First-time default is OFF as of v0.2.32+. Mark as Optional, NOT Required.

> **Why Location is "Required" + "App functionality".** Routing and
> navigation cannot work without it. Analytics is added because Mapbox
> receives GPS coordinates as part of every map tile / routing request,
> which Play classifies as sharing for analytics purposes.

### 3. Specific recipients to mention in the "Sharing" elaboration

Play Console doesn't have a free-text recipient field per se, but the
**"Why is this data collected and/or shared?"** drop-downs should accurately
reflect the destinations. The recipients you actually share data with, and
which Privacy Policy paragraph documents each:

| Recipient | What we send | Purpose | Privacy Policy entry |
|---|---|---|---|
| Supabase (US, will move to EU) | Account, ride, hazard, feed data | App functionality | "Sub-processors and third-party services" |
| Google Cloud Run (EU) | All API requests | App functionality | same |
| Mapbox | GPS coordinates per tile/route request, geocoding queries | App functionality (telemetry SDK is **disabled**) | same |
| OSRM / Overpass / OpenStreetMap | GPS coordinates per route request | App functionality | same |
| Open-Meteo | GPS coordinates of weather location | App functionality | same |
| Google OAuth | Email + display name (only on Google sign-in) | Account management | same |
| Expo Push Service (exp.host) | Push token + notification payload | App functionality | same |
| Sentry (EU) | Anonymised crash stacks, only on opt-in | Analytics | same |
| PostHog (EU host) | Anonymised app events, only on opt-in | Analytics | same |
| Firebase App Distribution | Tester APK installs only — not shipped to public | Tester distribution | same (note: Firebase Analytics is NOT shipped) |

### 4. Section to explicitly **uncheck** if previously declared

Confirm these are NOT marked, since the new build no longer ships them:

- ❌ "Personal info → Phone number" — never collected
- ❌ "Personal info → Address" — never collected
- ❌ "Personal info → Race and ethnicity" — never collected
- ❌ "Personal info → Political or religious beliefs" — never collected
- ❌ "Personal info → Sexual orientation" — never collected
- ❌ "Financial info → User payment info" — no payments
- ❌ "Financial info → Purchase history" — no purchases
- ❌ "Financial info → Credit score" — no payments
- ❌ "Health and fitness → Health info" — we don't track health vitals
- ❌ "Health and fitness → Fitness info" — keep as App activity instead;
  if Play insists, justify cycling-as-activity not vitals
- ❌ Anything in "Photos and videos" — Android does not request photo
  permission; iOS strings carry over but iOS isn't in this submission

### 5. Save + submit

After saving each section, the form will warn if anything is incomplete.
Submit only when all four sections are clean (data types, purposes,
sharing/security, encryption + deletion). Submission triggers a re-review
— typically 24–48 hours.

## Verification after submit

1. **Confirm Play Console flagged the change as "applied".** Within 1 hour
   of submit, the listing's "Data safety" section refreshes on the Play
   Store entry. Open the public Play Store page in an incognito browser
   and verify the listing card matches what was submitted.
2. **Spot-check the Privacy Policy.** Open
   `https://routes.defensivepedal.com/privacy` in an incognito browser
   and verify it shows "Last updated: 6 May 2026" and the expanded
   sub-processor list.
3. **Crash check.** Watch Play Console → Quality → Android vitals for
   24–48 hours. The Data Safety re-review can occasionally trigger
   tester confusion (re-prompts on consent), but no APK uploads are
   triggered by the form change itself.

## When to re-do this

Trigger another Data Safety reconciliation if any of these change:

- A new sub-processor is added (e.g. enabling Redis Memorystore, switching
  Supabase region, adopting a new analytics provider).
- A new permission is added to `app.config.ts` or
  `apps/mobile/android/app/src/main/AndroidManifest.xml`.
- A consent toggle becomes Required (currently both Sentry + PostHog are
  Optional / opt-in).
- A new data type is sent to any third party (e.g. the Mia journey
  starts forwarding fitness data to a coach service — currently it does
  not).
