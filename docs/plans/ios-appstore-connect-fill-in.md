# iOS — App Store Connect: your fill-in runbook (no iPhone needed)

> Everything here is browser/portal work you can do **before** the physical iPhone arrives. Paste-ready values; rationale lives in `docs/plans/ios/02-store-listing-assets.md`.
> Legend: **[YOU]** = you do it in a browser. **[CLAUDE]** = I do it in code once you hand me a value.

---

## STEP 1 — Create an App Store Connect API key  [YOU]  (~10 min) — *unblocks the EAS 2FA error*

1. https://appstoreconnect.apple.com → **Users and Access** → **Integrations** tab → **App Store Connect API** → **Team Keys** → **＋**.
2. Name: `EAS CI`. Access role: **App Manager** (or Admin). **Generate**.
3. **Download `AuthKey_XXXXXXXXXX.p8` now** (one-time download). Save it OUTSIDE the repo, e.g. `C:\Users\Victor\keys\AuthKey_XXXXXXXXXX.p8`.
4. Note the **Key ID** (10 chars) and **Issuer ID** (UUID) shown on that page.

→ **Send me:** the `.p8` path + Key ID + Issuer ID. I'll wire it so all EAS Apple operations (credentials, build, submit) skip the 2FA SMS that's currently failing.

---

## STEP 2 — Create the app record  [YOU]  (~10 min) → produces the numeric Apple ID

1. First register the App ID (if not done): https://developer.apple.com/account → **Identifiers** → **＋** → App IDs → App → Bundle ID `com.defensivepedal.mobile` (Explicit) → enable **Push Notifications** + **Sign in with Apple** capabilities → Register.
2. https://appstoreconnect.apple.com → **Apps** → **＋ New App**:
   - Platform: **iOS**
   - Name: **Defensive Pedal**
   - Primary language: **English (U.S.)**
   - Bundle ID: **com.defensivepedal.mobile**
   - SKU: `defensive-pedal` (any unique string)
   - User access: Full
3. After creation: **App Information** → note the **Apple ID** (a ~10-digit number).

→ **Send me:** that numeric **Apple ID** — I'll fill `IOS_APP_STORE_APP_ID` in `review-prompt.ts` and `ascAppId` in `eas.json` so `eas submit` works.

---

## STEP 3 — Fill the listing  [YOU]  (paste these)

App Store Connect → your app → version **(localization: English U.S.)** + **App Information**.

| Field | Paste / select |
|---|---|
| **Name** | `Defensive Pedal` |
| **Subtitle** | `Safer cycling routes` |
| **Primary category** | `Navigation` |
| **Secondary category** | `Health & Fitness` |
| **Copyright** | `2026 Victor Rotariu` |
| **Privacy Policy URL** | `https://routes.defensivepedal.com/privacy` |
| **Support URL** | `https://routes.defensivepedal.com/support` |
| **Marketing URL** | `https://routes.defensivepedal.com/` |

**Promotional Text** (≤170 chars):
```
Plan rides that avoid the dangerous roads. Real road-risk scoring, live hazard alerts from other cyclists, weather & air-quality checks — built to keep you safe.
```

**Keywords** (one 100-char string, no spaces after commas):
```
bike,bicycle,cyclist,navigation,route planner,safety,hazard,commute,GPS,air quality,map,ride
```

**Description** (paste as-is):
```
Defensive Pedal is a cycling navigation app built around one idea: the safest route matters more than the fastest one.

SAFETY-FIRST ROUTING
Instead of just shortest or fastest, Defensive Pedal scores roads using real road-risk data and routes you around the dangerous stretches. Choose Safe, Fast, or Flat — and see exactly how risky each option is with a colour-coded risk breakdown before you ride.

LIVE HAZARD ALERTS FROM REAL CYCLISTS
See potholes, aggressive-traffic spots, missing bike lanes and dangerous intersections reported by the community, right on your map. Get spoken-distance alerts as you approach one during navigation, and report new hazards in two taps. Upvote or downvote so the good reports rise and the stale ones fade.

KNOW BEFORE YOU GO
Live weather, wind, precipitation and European air-quality (AQI) for your route. An optional morning notification tells you whether it's a good day to ride.

TURN-BY-TURN NAVIGATION
A 3D follow camera, clear maneuver cards, a remaining-climb tracker, steep-grade warnings, and a GPS-quality indicator. Bike lanes, parking, rentals, repair shops, water and transit are all on the map.

TRACK YOUR IMPACT
Every ride logs distance, time, elevation and CO2 saved. Build streaks, earn badges, climb the rider tiers, and see how your neighbourhood stacks up on the safety leaderboard.

COMMUNITY
Share rides, react and comment, and follow the City Heartbeat dashboard to feel your city's cycling pulse.

PRIVACY
Crash diagnostics are minimal and you can opt out. Product analytics are off by default. We never sell your data and we don't use it for advertising. Full policy at routes.defensivepedal.com/privacy.

Ride safer. Pedal defensively.
```

**What's New** (first release):
```
Initial release. Plan safer cycling routes, get live hazard alerts, and track your impact.
```

---

## STEP 4 — Age Rating  [YOU]

ASC → your app → **Age Rating** → Edit. Answer the questionnaire honestly. The one that matters:
- **"Does your app contain user-generated content?"** → **Yes** (community feed, comments, hazard reports, ride shares). Expect a **12+** result. Do **not** answer "No" — Apple cross-checks the live app.

---

## STEP 5 — App Privacy ("nutrition labels")  [YOU]

ASC → **App Privacy** → Get Started. Global: **Yes, we collect data**; **No** to "used to track you" for **every** type (so **no ATT prompt** — don't add one).

Declare these data types — each is **Linked to user = Yes**, **Used for tracking = No**, purposes **App Functionality** (+ **Analytics** where noted):

| Data type (Apple) | Purposes |
|---|---|
| Location → **Precise Location** | App Functionality, Analytics |
| Location → **Coarse Location** | App Functionality, Analytics |
| Contact Info → **Email Address** | App Functionality |
| Contact Info → **Name** | App Functionality |
| Identifiers → **User ID** | App Functionality, Analytics |
| Identifiers → **Device ID** (Expo push token) | App Functionality, Analytics |
| User Content → **Photos or Videos** (profile avatar upload → Supabase Storage; verified `profile.tsx:100`) | App Functionality |
| User Content → **Other User Content** (hazards, shares, comments) | App Functionality |
| Browsing/Search → **Search History** (destination autocomplete) | App Functionality |
| Usage Data → **Product Interaction** | Analytics, App Functionality |
| Diagnostics → **Crash Data** (Sentry) | App Functionality, Analytics — *mark **Not** linked* |
| Diagnostics → **Performance Data** | App Functionality, Analytics — *mark **Not** linked* |

> **Photos — CONFIRMED collected (2026-06-10):** the profile avatar uploads to Supabase Storage (`profile.tsx:100` `.from('avatars').upload(...)`), so **Photos or Videos must be declared** (Linked to user = Yes, tracking = No, App Functionality). The Diagnostics rows reflect the consent split: Sentry crash/perf is on by default (opt-out) and anonymised → mark **Not Linked**; PostHog product analytics is opt-in (off by default) but still declared since it *can* collect Product Interaction.

---

## STEP 6 — Export compliance  [YOU] (already handled in code)

I've set `ITSAppUsesNonExemptEncryption: false`, so uploads shouldn't prompt. If ASC ever asks: choose **"Uses standard encryption (HTTPS) only" → exempt**. No annual report needed.

---

## STEP 7 — App Review info + demo account  [YOU]

ASC → version → **App Review Information**:
- **Sign-in required:** Yes → provide a **demo account** (create a normal email+password account in the app and put the credentials here — Apple's reviewer needs to reach the community/account surfaces; anonymous-only won't show them everything).
- **Notes** (paste):
```
Background location powers turn-by-turn navigation while the screen is locked during an active ride.

User-generated content (community feed, comments, hazard reports, ride shares) can be reported via the ⋯ menu (7 reason categories) and any user can be blocked from Profile → Blocked users. Reported/low-trust content is hidden server-side. Demo account credentials are provided above.
```

---

## STEP 8 — Screenshots  [YOU, needs a Mac+Simulator OR the iPhone]

Upload one set each (portrait). Min 3, recommended **6**:
- **6.9"** — exactly **1320 × 2868**
- **6.5"** — exactly **1242 × 2688**

The 6 screens to capture (in this order): 1) Route preview risk breakdown, 2) Navigation + hazard alert, 3) Map with community hazards + bike lanes, 4) Post-ride impact summary, 5) Trophy Case / holo badges, 6) City Heartbeat / leaderboard.

> Capturable today from an iOS **Simulator** (no physical device, no Apple signing) if you have a Mac — Apple accepts simulator screenshots. Otherwise capture on the iPhone when it arrives.

---

## What I've already done (code) so you don't have to
- `ITSAppUsesNonExemptEncryption: false`, `NSMotionUsageDescription`, opaque App Store icon, Sign in with Apple, Google iOS config, Support page (live), AASA Team ID — all shipped in commit `9d3bbe5`.
- `review-prompt.ts` no longer opens the Play Store on iOS (it'll use the App Store URL the moment you send me the numeric Apple ID from Step 2).
- EAS env (Mapbox/Supabase/Google tokens) populated for development, preview, and production.

## What I still need from you (just two values)
1. **Step 1** ASC API key → `.p8` path + Key ID + Issuer ID
2. **Step 2** numeric **Apple ID** for the app

With those, the EAS build + submit path is fully unblocked — no iPhone required to get the build onto TestFlight.
