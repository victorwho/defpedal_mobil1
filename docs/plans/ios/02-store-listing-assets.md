# iOS App Store — Listing, Assets, Privacy & HIG Readiness

> Shared task #2 (owner: `ios-store`). Research/planning only — no app code modified.
> Source app version at time of writing: **v0.2.90** (`apps/mobile/app.config.ts:179`).
> Companion docs in this folder: 01 (build/signing/EAS), 03 (TestFlight/review submission) — owned by other agents.
>
> **Legend for every line item:**
> `[USER]` = Victor does it (account, legal, manual upload, device testing).
> `[DEV]` = a code/config/asset change a developer makes.
> `[BOTH]` = needs a dev change AND a user action (e.g. dev produces asset, user uploads it).

---

## 0. Executive summary — critical path items

1. **`[DEV]` App Store icon has an alpha channel → guaranteed rejection.** `apps/mobile/assets/icon.png` is **1024×1024 RGBA** (verified: `mode=RGBA`, `has_alpha=True`). Apple rejects marketing icons with transparency/alpha. A flattened, opaque 1024×1024 RGB PNG (no rounded corners, no alpha) must be produced before any submission. See §2.1.
2. **`[DEV]` Export-compliance key is missing.** `ITSAppUsesNonExemptEncryption` is **not present** anywhere in `app.config.ts` `ios.infoPlist` (verified: grep returns no matches). Without it, every TestFlight/App Store upload stops to ask the compliance question. Add `ITSAppUsesNonExemptEncryption: false`. See §4.
3. **UGC moderation is already shipped — Apple Guideline 1.2 is satisfiable.** The app has block-user (`useBlockUser.ts`, `blocked-users.tsx`), report-content with 7 reason categories (`useReportContent.ts`), and an EULA path. This is the single most common rejection reason for social apps and we already pass it. See §1 (age rating + UGC) and §5.
4. **`[USER]` No Support URL page exists yet.** `apps/web/app/` has `privacy/`, `terms/`, `account-deletion/` but **no `support/`**. App Store Connect requires a reachable Support URL. See §1.7.
5. **`[USER]` App Privacy "nutrition labels" map cleanly from the existing Android Data Safety doc — no tracking, no ATT prompt needed.** All third parties receive data for app-functionality/analytics, none for cross-app advertising tracking. See §3.

---

## 1. App Store Connect metadata

All text fields live in App Store Connect → your app → **App Information** + the per-version **(Localization)** pane. Primary localization should be **English (U.S.)**; a Romanian (`ro`) localization is optional but recommended given the RO-first content (`[DEV]` strings already exist in `apps/mobile/src/i18n/`).

### 1.1 Name & subtitle `[USER]` to enter, `[DEV]` copy below is ready to paste

| Field | Limit | Proposed value | Notes |
|---|---|---|---|
| **App Name** | 30 chars | `Defensive Pedal` | 15 chars — safe. Matches production `appNameByVariant.production` (`app.config.ts:156`). |
| **Subtitle** | 30 chars | `Safer cycling routes` | 20 chars. Appears under the name on the product page + search. Keyword-relevant. Alt: `Safe bike routes & hazards`. |

### 1.2 Promotional text `[USER]`

| Field | Limit | Proposed value |
|---|---|---|
| **Promotional Text** | 170 chars | `Plan rides that avoid the dangerous roads. Real road-risk scoring, live hazard alerts from other cyclists, weather & air-quality checks — built to keep you safe.` |

> Promotional text can be updated **without** submitting a new build — use it for seasonal/launch messaging.

### 1.3 Description `[USER]` to paste, `[DEV]` copy below

Plain text, 4000-char limit. No HTML. Drawn from the value prop ("safety-first routing") and the live feature inventory in `.claude/CLAUDE.md`:

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

### 1.4 Keywords `[USER]`

Single 100-char comma-separated string (no spaces after commas — every char counts). Do **not** repeat words already in the App Name/Subtitle (Apple indexes those separately). Proposed (99 chars):

```
bike,bicycle,cyclist,navigation,route planner,safety,hazard,commute,GPS,air quality,map,ride
```

### 1.5 Category `[USER]`

- **Primary category:** `Navigation`
- **Secondary category:** `Health & Fitness` (covers the ride-tracking / CO2 / streak side; optional but improves discovery).

> Note: even though we file under Health & Fitness as *secondary*, the App Privacy labels deliberately do **not** declare "Health & Fitness" data — cycling distance is "App activity", consistent with the Android Data Safety decision (data-safety doc §2, line 97).

### 1.6 Copyright `[USER]`

`2026 Victor Rotariu` (sole proprietor per the privacy policy, `apps/web/app/privacy/page.tsx:119`). Format Apple expects: `© 2026 Victor Rotariu` — but enter without the `©`; ASC prepends it.

### 1.7 URLs `[USER]` / `[BOTH]`

| Field | Required? | Value | Status |
|---|---|---|---|
| **Privacy Policy URL** | Required | `https://routes.defensivepedal.com/privacy` | ✅ live (`apps/web/app/privacy/page.tsx`, indexable). |
| **Support URL** | Required | `https://routes.defensivepedal.com/support` | ❌ **does not exist** — `apps/web/app/support/` is absent. `[BOTH]` Dev must add a minimal support page (contact email `privacy@defensivepedal.com` / a support alias + FAQ link); user can alternatively point this at a mailto-only page or an existing reachable URL. **Apple rejects unreachable Support URLs.** A stopgap is to reuse `https://routes.defensivepedal.com/account-deletion` only if it lists a contact route — but a real support page is cleaner. |
| **Marketing URL** | Optional | `https://routes.defensivepedal.com/` | ✅ live landing page (`apps/web/app/page.tsx`). |

### 1.8 Age rating `[USER]` + UGC obligations

Complete the **Age Rating questionnaire** in ASC. Expected outcome: **17+ is NOT required**, but because the app has **user-generated content** (community feed, comments, hazard reports, ride shares, reactions) you MUST answer the UGC question honestly:

- *"Does your app contain user-generated content?"* → **Yes** (unrestricted web access = No; UGC = Yes).
- This typically yields a **12+** rating (UGC with moderation). Do not claim "no UGC" — Apple cross-checks against the live app and the community feed is obvious.

**Apple Guideline 1.2 (Safety — User-Generated Content) obligations — and our compliance status:**

| Apple requirement | Status | Evidence |
|---|---|---|
| A method for filtering objectionable material | ⚠️ partial | Reporting + blocking exist; confirm server-side moderation/auto-hide of `score<=-3` hazards already serves as the filter. `[DEV]` document this in the review notes. |
| A mechanism for users to **flag/report** objectionable content | ✅ shipped | `useReportContent.ts` — targets `comment` / `hazard` / `trip_share` / `profile`, reasons `spam,harassment,hate,sexual,violence,illegal,other`. |
| A mechanism to **block abusive users** | ✅ shipped | `useBlockUser.ts` + `useUnblockUser` + `blocked-users.tsx` screen + `profile.tsx` entry. |
| Published contact info for users to reach the developer | ✅ | `privacy@defensivepedal.com` (privacy policy). Surface it in the Support URL page (§1.7). |
| Act on reports & remove offending content / ejecting violators | `[USER]` operational | This is an ongoing operational commitment, not code. Be ready to describe the moderation workflow in App Review notes. |

> **App Review note (write this in the "Notes" field at submission, `[USER]`):** "Community feed, comments, hazard reports and ride shares are user-generated. Users can report any item (7 reason categories) via the ⋯ menu and block any user from Profile → Blocked users. Reported/low-trust content is hidden server-side. A demo account is provided below." Include a **demo/review account** (`[USER]` create one — Apple needs to reach the community surfaces without going through anonymous-only auth; supply email+password in the Sign-In Information section of the submission).

### 1.9 What's New (release notes) `[USER]`
First submission: short "Initial release. Plan safer cycling routes, get live hazard alerts, and track your impact." Subsequent versions: mirror `progress.md` highlights.

---

## 2. Visual assets — exact specs

App Store Connect screenshot/icon requirements as of the 2024–2026 simplification: Apple now requires **one** 6.9" iPhone set as the baseline; a 6.5" set is accepted/recommended for older-device display. Because **`supportsTablet: false`** (`app.config.ts:253`), **no iPad screenshots are required or accepted** — do not generate any.

### 2.1 App Store icon `[BOTH]` — CRITICAL

| Spec | Requirement |
|---|---|
| Size | **1024 × 1024 px** |
| Format | PNG or JPEG, **flattened, no alpha channel, fully opaque** |
| Corners | **Square** — do NOT pre-round; Apple applies the mask |
| Color space | sRGB or P3, **no transparency** |

`[DEV]` **Action required:** the current `apps/mobile/assets/icon.png` is **RGBA with alpha** — it will be rejected as the marketing icon and can also trip Xcode's asset validation. Produce a separate, opaque 1024 icon:

```
python -c "from PIL import Image; im=Image.open(r'apps/mobile/assets/icon.png').convert('RGB'); im.save(r'apps/mobile/assets/appstore-icon-1024.png')"
```

(Flatten onto the brand background `#F7D02A` if any transparent pixels are meaningful, rather than onto black — match `android.adaptiveIcon.backgroundColor`, `app.config.ts:267`.) Verify after: mode must read `RGB`, not `RGBA`. `[USER]` uploads it to ASC (or it ships in the EAS-built `.ipa`'s asset catalog — coordinate with the 01-build doc owner so the in-binary icon is also alpha-free; Expo/EAS will flatten via the asset catalog, but the **ASC marketing icon must be alpha-free regardless**).

### 2.2 iPhone screenshots `[BOTH]`

| Set | Device class | **Exact portrait px** | Required? | Count |
|---|---|---|---|---|
| 6.9" | iPhone 16 Pro Max / 15 Pro Max class | **1320 × 2868** (portrait) | **Yes — baseline** | 3–10 (use **6**) |
| 6.5" | iPhone 11 Pro Max / XS Max class | **1242 × 2688** (portrait) | Recommended | 3–10 (mirror the same 6) |

- Orientation: **portrait** (the app's map/nav screens are portrait-locked via `useLockOrientation`; ship portrait shots only).
- Min 3, max 10 per set. **Plan for 6** to tell the safety story.
- `[DEV]` capture on a 6.9" simulator/device at native resolution; downscale-or-recapture for the 6.5" set (do not upscale 6.5"→6.9").
- Optional: add localized RO screenshots if a `ro` localization is created.

**Recommended 6 screens (real, screenshot-worthy surfaces in the app):**

1. **Route preview with risk breakdown** (`app/route-preview.tsx`) — the colour-coded Safe/Fast/Flat risk distribution card. *This is the differentiator; make it screen #1.* Caption: "See how risky every route is — before you ride."
2. **Turn-by-turn navigation, 3D camera + hazard alert** (`app/navigation.tsx` + `RouteFeatureAlertStack`) — maneuver card + an approaching-hazard alert. Caption: "Live hazard alerts as you ride."
3. **Map with community hazards + bike infrastructure** (`RouteMap` on `app/route-planning.tsx`) — hazard markers, bike lanes, parking. Caption: "Potholes, bad intersections and bike lanes, mapped by cyclists."
4. **Post-ride impact summary** (`ImpactSummaryCard` / `app/feedback.tsx`) — CO2 saved, XP, badges earned. Caption: "Every ride counts — track your impact."
5. **Trophy Case / holographic badges** (`app/achievements.tsx`) — the holo badge grid. Caption: "Earn badges. Climb the tiers."
6. **City Heartbeat / Safety Leaderboard** (`app/city-heartbeat.tsx`) — community pulse + leaderboard. Caption: "See your city's cycling pulse."

> `[DEV]` optional polish: overlay short caption text + device frame on each screenshot (a marketing/Canva pass) — Apple allows framed/annotated screenshots. Keep the first screenshot legible as a thumbnail.

### 2.3 App preview video `[USER]` optional

- Optional. If made: **15–30 s**, captured on-device (Apple requires real device-captured footage, not a screen recording of a simulator for the final upload), portrait, per-device-class resolution matching the screenshot sets (6.9": 886×1920 / 1080×1920 family — use the size ASC's Media Manager states for the selected device).
- Skip for v1 unless time allows; screenshots are sufficient for approval.

---

## 3. App Privacy "nutrition labels"

Filled under ASC → App Privacy. Mapped **directly** from the Android Data Safety reconciliation (`docs/legal/counsel-review-2026-04-29/16-data-safety-reconciliation-2026-05-06.md`). Apple's model differs from Google's: per data type you declare **(a)** is it collected, **(b)** is it linked to the user's identity, **(c)** is it used to **track** (cross-app/ cross-company advertising), **(d)** the purpose(s).

**Global answers `[USER]`:**
- *Does this app collect data?* → **Yes**.
- *Is any data used to track you?* → **NO** for every type (see §3.2). Therefore **App Tracking Transparency (ATT) prompt is NOT required** (see §3.3).

### 3.1 Data types to declare (collected)

| Apple data type | Collected | Linked to user? | Used for tracking? | Purpose(s) | Maps from Android type |
|---|---|---|---|---|---|
| **Location → Precise Location** | Yes | Yes | **No** | App Functionality, Analytics | Location → Precise location (data-safety §2) |
| **Location → Coarse Location** | Yes | Yes | **No** | App Functionality, Analytics | Location → Approximate location |
| **Contact Info → Email Address** | Yes | Yes | **No** | App Functionality (account) | Personal info → Email address |
| **Contact Info → Name** | Yes | Yes | **No** | App Functionality (account) | Personal info → Name |
| **Identifiers → User ID** | Yes | Yes | **No** | App Functionality, Analytics | Personal info → User IDs |
| **Identifiers → Device ID** | Yes | Yes | **No** | App Functionality, Analytics | Device or other IDs (Expo push token; install-referrer is Android-only — see note) |
| **User Content → Other User Content** | Yes | Yes | **No** | App Functionality | App activity → Other UGC (hazards, shares, comments) + Photos (only if user attaches one) |
| **Search History** | Yes | Yes | **No** | App Functionality | App activity → In-app search history (destination autocomplete) |
| **Usage Data → Product Interaction** | Yes | Yes | **No** | Analytics, App Functionality | App activity → App interactions |
| **Diagnostics → Crash Data** | Yes | No (anonymised) | **No** | App Functionality, Analytics | App info & performance → Crash logs (Sentry) |
| **Diagnostics → Performance Data** | Yes | No | **No** | App Functionality, Analytics | App info & performance → Diagnostics |

> **"Linked to user"** = stored against the account. For an anonymous/not-signed-in session most of the above is still linked to the anonymous user ID, so mark Linked = Yes except the anonymised diagnostics streams. `[USER]` if you want crash/perf marked "Not Linked", confirm Sentry is configured to strip the user ID on iOS — currently diagnostics are opt-in and anonymised per the privacy policy, so **Not Linked** is defensible for the two Diagnostics rows.

> **iOS-specific deltas from Android:**
> - **Install Referrer (Google Play) does NOT exist on iOS** — drop that Device-ID justification on iOS; the only Device ID is the Expo push token. (`[DEV]` confirm no Apple Search Ads attribution SDK is added; if AdServices/`AAAttribution` is ever wired in, it becomes a tracking concern.)
> - **Photos**: iOS *does* request photo-library access (`NSPhotoLibraryUsageDescription` / `NSPhotoLibraryAddUsageDescription` exist in `app.config.ts:258-261`), whereas the Android build declared Photos = No. On iOS, only declare a Photos/User-Content collection if a user-attached image is actually uploaded to the backend. If photo attach is not yet wired to a real upload, declare **No** and rely on the usage-string purpose only. `[DEV]/[USER]` verify whether hazard/share photo attach actually transmits an image; declare accordingly.

### 3.2 Recipients (informational — Apple has no per-recipient field, but keep consistent with the privacy policy)

Same sub-processor set as the Android doc §3: Supabase, Google Cloud Run, Mapbox (telemetry **disabled**), OSRM/Overpass, Open-Meteo, Google OAuth, Expo Push, Sentry (EU), PostHog (EU, opt-in). All receive data for **App Functionality** or **Analytics** — **none for advertising/tracking**.

### 3.3 ATT (App Tracking Transparency) `[DEV]` decision — NOT needed

- ATT (`AppTrackingTransparency` / the `NSUserTrackingUsageDescription` prompt) is required **only** if the app tracks users across apps/websites owned by other companies, or shares data with data brokers, or uses IDFA for advertising.
- Defensive Pedal does **none** of these: no ad SDKs, no IDFA, Mapbox telemetry disabled, analytics are opt-in and first-party, `AD_ID` permission is blocked on Android (`app.config.ts:289`) which signals the same intent.
- **Therefore: do NOT add `NSUserTrackingUsageDescription`, do NOT call `requestTrackingAuthorization`, and answer "No" to all tracking questions in App Privacy.** Adding an ATT prompt with nothing to track is itself a rejection risk (Guideline 5.1.2). `[DEV]` ensure no dependency silently pulls in an ad/attribution SDK.

---

## 4. Export compliance `[DEV]`

The app uses only standard HTTPS/TLS (all backends HTTPS per data-safety doc §1; OSRM on TLS since 2026-04-28) — i.e. **exempt** encryption. To avoid the per-upload compliance interview and to self-certify the exemption:

`[DEV]` add to `app.config.ts` → `ios.infoPlist`:

```ts
ios: {
  // ...
  infoPlist: {
    // ...existing keys...
    ITSAppUsesNonExemptEncryption: false,
  },
},
```

- **Verified missing today** (grep for `ITSAppUsesNonExemptEncryption` across `apps/` returns no matches).
- With this set, TestFlight/App Store uploads skip the encryption question and no annual self-classification report (ERN) is needed for exempt apps.
- `[USER]` if ASC still shows the export-compliance prompt for a build that predates the key, answer: *"Uses standard encryption (HTTPS) only"* → exempt.

---

## 5. iOS UX / HIG deltas from Android — screens to device-check `[DEV]` + `[USER]`

The app is RN/Expo and largely cross-platform, but several Android-shaped behaviours need an on-device iOS pass (real device or simulator). None are known-broken — these are verification items.

| # | Area | Android behaviour today | iOS delta to verify | Where |
|---|---|---|---|---|
| 1 | **Safe area / notch / Dynamic Island** | Project rule mandates `useSafeAreaInsets()` from `react-native-safe-area-context`, never RN `SafeAreaView` (CLAUDE.md). | `[DEV]` Confirm top insets clear the **Dynamic Island** (iPhone 15/16 Pro) on map overlay cards (origin/destination/search FABs in `route-planning.tsx`) and `NavigationHUD`. Map overlay cards use fixed `#FFFFFF` and absolute positioning — re-check top offset. | `app/route-planning.tsx`, `app/navigation.tsx`, `MapStageScreen.tsx`, `NavigationHUD.tsx` |
| 2 | **No hardware Back button** | Code review found **no `BackHandler`/`hardwareBackPress` usage** (grep clean) — good, nothing relies on the Android back button. | `[DEV]` Verify every screen has a visible in-app back/close affordance (`ScreenHeader` `back`/`close` variants). Modal sheets (`HazardDetailSheet`, `CitySuggestionSheet`, `EarlyEndReasonModal`, `BadgeDetailModal`) must be dismissable without a hardware back. | `ScreenHeader` atom; all `*Sheet`/`*Modal` organisms |
| 3 | **Swipe-back gesture** | Expo Router stack; Android uses back button. | `[USER]/[DEV]` On iOS the **edge swipe-back** is expected. Verify it works on pushed routes and is **disabled during `NAVIGATING`** (the route guard locks navigation — confirm a swipe can't escape an active ride). | Expo Router `_layout.tsx` stack screens; `useRouteGuard` |
| 4 | **Status bar** | `StatusBar style="auto"` (`app/_layout.tsx:232`). | `[DEV]` Confirm contrast on the dark map (nav forces dark theme). `style="auto"` should resolve light content on dark map — verify on device, especially the forced-dark `NAVIGATING` state. | `app/_layout.tsx` |
| 5 | **Haptics** | `expo-haptics` via `hasExpoNativeModule('ExpoHaptics')` guard. | `[USER]` Verify haptic intensity feels right on iOS Taptic Engine (Android vs iOS differ) on press primitives + safety-critical hazard alerts. No code change expected — just a feel-check. | `PressableScale`, `haptics.ts`, `RouteFeatureAlertStack` |
| 6 | **In-app review** | `expo-store-review.requestReview()` → maps to **`SKStoreReviewController`** on iOS automatically. ✅ | `[DEV]` The **URL fallback is hardcoded to the Play Store** (`review-prompt.ts:33`, `PLAY_STORE_REVIEW_URL`). On iOS the native sheet will normally fire, but the fallback would open a Play Store URL on an Apple device. Add a platform-conditional App Store fallback URL (`itms-apps://…` / `https://apps.apple.com/app/id<APPLE_ID>`) once the Apple app ID exists. | `src/lib/review-prompt.ts` |
| 7 | **Location permission strings** | Present and iOS-appropriate (`locationWhenInUsePermission`, `…AlwaysAndWhenInUse…`, background enabled). ✅ | `[USER]` Apple scrutinises **background location** ("Always") — be ready to justify in review notes: needed for turn-by-turn while screen-locked. `UIBackgroundModes` already includes `location` (`app.config.ts:257`). | `app.config.ts` expo-location plugin |
| 8 | **Photo permission strings** | `NSPhotoLibraryUsageDescription` + `…AddUsageDescription` present. | `[DEV]` Ensure the photo-attach feature these strings describe is actually reachable on iOS; an unused permission string with no feature is a (minor) review flag. Cross-reference with §3.1 Photos decision. | `app.config.ts:258-261` |
| 9 | **Push notifications** | Expo push + local 8:30 weather ping; bridgeless guards in place. | `[USER]/[DEV]` iOS requires an **APNs key** (handled in the 01-build/EAS-credentials doc) and the OS permission prompt — verify the prompt fires and `DailyWeatherScheduler` schedules on iOS. Provisioning profile must include the Push entitlement. | (cross-ref 01-build doc) |
| 10 | **Map attribution / telemetry** | Mapbox telemetry disabled (`Mapbox.setTelemetryEnabled(false)`). | `[DEV]` Confirm the disable call runs on iOS too (same `RouteMap.tsx`/`offlinePacks.ts` path) so the App Privacy "no tracking" claim holds on iOS. | `RouteMap.tsx`, `offlinePacks.ts` |

> These are HIG/parity checks, not blockers. The two **must-fix-before-submit** code items are §0.1 (icon alpha) and §0.2 (`ITSAppUsesNonExemptEncryption`). Item 6 (review URL fallback) and the Support URL (§1.7) are strongly recommended fixes but not hard rejections on their own.

---

## 6. Consolidated action checklist (tagged)

**Code / config (DEV):**
- `[DEV]` Produce opaque, alpha-free 1024×1024 App Store icon (`appstore-icon-1024.png`). *(§0.1, §2.1 — CRITICAL)*
- `[DEV]` Add `ITSAppUsesNonExemptEncryption: false` to `ios.infoPlist`. *(§0.2, §4 — CRITICAL)*
- `[DEV]` Add iOS App Store fallback URL in `review-prompt.ts` (platform-conditional). *(§5 item 6)*
- `[DEV]` Verify Mapbox telemetry-off + no ad/attribution SDK on iOS (keeps "no tracking" true). *(§3.3, §5 item 10)*
- `[DEV]` Decide Photos data declaration based on whether photo-attach actually uploads. *(§3.1)*

**Web (BOTH):**
- `[BOTH]` Add a reachable **Support page** at `routes.defensivepedal.com/support`. *(§1.7)*

**App Store Connect / legal / device (USER):**
- `[USER]` Enter Name, Subtitle, Promo, Description, Keywords, Category, Copyright, URLs. *(§1)*
- `[USER]` Complete Age-Rating questionnaire → answer UGC = Yes; write the UGC moderation review note + create a demo review account. *(§1.8)*
- `[USER]` Complete App Privacy labels per §3 table; tracking = No everywhere; no ATT.
- `[USER]` Upload 6× 6.9" (1320×2868) + 6× 6.5" (1242×2688) screenshots; upload the alpha-free icon. *(§2)*
- `[USER]` Export-compliance: answer "exempt / standard encryption only" if prompted. *(§4)*
- `[USER]` On-device HIG pass: Dynamic Island insets, swipe-back lock during nav, haptics feel, status-bar contrast, background-location justification, push prompt. *(§5)*

---

### Sources consulted
- `apps/mobile/app.config.ts` (iOS infoPlist, supportsTablet, permissions, version) — verified live.
- `apps/mobile/assets/icon.png` — verified **RGBA / 1024² / alpha=True** via PIL.
- `docs/legal/counsel-review-2026-04-29/16-data-safety-reconciliation-2026-05-06.md` — Android Data Safety mapping source.
- `apps/web/app/` tree — privacy ✅, terms ✅, account-deletion ✅, **support ❌**.
- `apps/mobile/src/hooks/useReportContent.ts`, `useBlockUser.ts`, `app/blocked-users.tsx` — UGC moderation confirmed shipped.
- `apps/mobile/src/lib/review-prompt.ts` — `expo-store-review` integration + Play-only fallback URL.
- `.claude/CLAUDE.md` — value prop, feature inventory, design system, app variants.
