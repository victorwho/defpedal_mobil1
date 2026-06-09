# Defensive Pedal — iOS App Store Release: Master Plan

**Owner:** `ios-lead` (coordinator/synthesizer)
**Date:** 2026-06-09
**App version at time of writing:** v0.2.90 (`apps/mobile/app.config.ts`)
**Status:** Phase A DEV items **landed in code 2026-06-09** (uncommitted, awaiting review) — see the Phase A status box below. Phases B–E not started.

> ### Phase A — DEV status (2026-06-09)
> **Done in code (Android build verified unaffected — see below):**
> - ✅ B2 `NSMotionUsageDescription` + ✅ B4 `ITSAppUsesNonExemptEncryption:false` → `app.config.ts` `ios.infoPlist`
> - ✅ B3 opaque iOS icon → `assets/icon-ios.png` wired via `ios.icon` (Android icons untouched)
> - ✅ B5 Sign in with Apple → `expo-apple-authentication ~55.0.13` + `ios.usesAppleSignIn:true` + `AppleSignInButton.ios.tsx`/`.tsx` split + `signInWithAppleIdToken()` + button in `auth.tsx`
> - ✅ B1 Google iOS plumbing → `iosClientId` in `GoogleSignin.configure`; `GIDClientID` + reversed-scheme `CFBundleURLTypes` injected from env, **gated** until `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set
> - ✅ B6 Support page → `apps/web/app/support/page.tsx`
>
> **Android-safety proof:** all `app.config.ts` changes are under `ios:`/`extra` only; the Apple button is a `.ios.tsx`/`.tsx` platform split so Android's bundle never imports `expo-apple-authentication`; `expo-apple-authentication` has no Android native code + no config plugin. Verified: typecheck clean (api+mobile+web); Metro bundle HTTP 200 for **both** `platform=android` and `platform=ios`; `expo config` shows the new keys only under `expo.ios` with zero leakage into the `android` block and the `plugins` array unchanged; lint ratchet 0 violations.
>
> **Phase A USER inputs — DONE (2026-06-09):** iOS OAuth client created → `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` set in `apps/mobile/.env` (GIDClientID + reversed scheme verified active); Apple provider enabled in Supabase (**native flow — bundle-ID "Client IDs" only; no Services ID / .p8 key needed**, those are web-OAuth-only); support page email set to `contact@defensivepedal.com`; AASA filled with Team ID `ZL4PR7TJQ9` (`ZL4PR7TJQ9.com.defensivepedal.mobile` ×3); 3 Supabase OAuth redirect URIs added.
>
> **Remaining before the first iOS build (Phase B):** redeploy `apps/web` so the live AASA + support page update (Universal Links verify against the live file); run `eas credentials --platform ios` (dist cert, provisioning profiles, APNs key); confirm the EAS iOS environment carries `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`, `SENTRY_AUTH_TOKEN`, and the `EXPO_PUBLIC_GOOGLE_*` client IDs (the `.env` is gitignored, so EAS cloud builds need these as EAS env vars).

**This is THE master plan.** It synthesizes two specialist audits and reconciles the stale 2026-04-23 handoff:

- `docs/plans/ios/01-technical-readiness.md` — native/build/EAS audit (`ios-native`)
- `docs/plans/ios/02-store-listing-assets.md` — listing/assets/privacy/HIG audit (`ios-store`)
- `docs/plans/ios-testflight-launch.md` — **STALE** 2026-04-23 handoff (reconciled in §6; do not blindly trust)

It mirrors the Android staged-rollout philosophy captured in `.claude/CLAUDE.md` "Play Store Release" and the release-workflow memory.

---

## 1. Executive summary — correcting the "blocked on macOS hardware" misconception

**The old assumption that this launch is blocked on Mac hardware is WRONG.** The app is a **managed Expo (SDK 55 / RN 0.83) project with NO `apps/mobile/ios/` directory** — every iOS build runs Continuous Native Generation (`expo prebuild`) **in the cloud on EAS Build's macOS runners.** You never touch Xcode. All iOS native config flows through `app.config.ts` (config-as-code).

What that means in practice:

| Resource | Needed? | Why |
|---|---|---|
| **A Mac / Xcode** | ❌ **NO** | EAS Build compiles the `.ipa` on Apple-hosted macOS runners (~12–20 min/build). All iOS config is `app.config.ts`. |
| **A physical iPhone** | ✅ **YES** | There is **no working Simulator path** for this app (Mapbox GL + real GPS + push). Every smoke/bug-hunt/stabilization step needs a real device, iOS 15+. Two models (one older, one current) recommended for the stabilization phase. |
| **Apple Developer Program** | ✅ **YES — $99/yr** | Required to sign, use TestFlight, and submit. Individual or Organization (see §3, task 1). |
| **Windows dev box (current)** | ✅ fine | `eas build`/`eas submit`/`eas credentials` all run from the existing Windows machine via the EAS CLI. |

**Net:** the only hard external dependencies are (a) **$99 Apple Developer enrollment**, (b) **one physical iPhone**, and (c) a handful of **dashboard actions** (Apple, GCP, Supabase). No new hardware purchase beyond the iPhone you test on.

**Posture (mirrors Android):** like the Play Console, the goal is a **staged public rollout** (1%→100% via Apple's Phased Release) gated on crash-free metrics, not a big-bang launch. Apple's TestFlight replaces the Play closed-test track. There is no Apple equivalent of the Play "14-day closed test" mandate — TestFlight internal testing is instant and the public rollout cadence is a quality decision, exactly as on Android.

### The blocker shortlist (must fix in code/config before submission)

| # | Blocker | Type | Source | Owner |
|---|---|---|---|---|
| B1 | **Google Sign-In has zero iOS config** — no `GIDClientID`, no reversed-client-id URL scheme → Google login dead on iOS | code + GCP dashboard | 01 §3 | DEV + USER |
| B2 | **`expo-sensors` needs `NSMotionUsageDescription`** (holo-badge gyro) → reject/crash on motion access | `app.config.ts` | 01 §4a | DEV |
| B3 | **App Store icon is RGBA-with-alpha** → Apple auto-rejects marketing icon | asset | 02 §2.1 | DEV |
| B4 | **`ITSAppUsesNonExemptEncryption: false` missing** → every upload stalls on the encryption question | `app.config.ts` | 02 §4 | DEV |
| B5 | **Sign in with Apple NOT implemented** — offering Google login obliges Apple Guideline 4.8 parity → likely rejection | code + Supabase + Apple entitlement | §4 risk register | DEV + USER |
| B6 | **No Support URL page** under `apps/web` → ASC requires a reachable Support URL | web | 02 §1.7 | DEV/USER |
| B7 | **AASA file has `FILL_ME_TEAM_ID` ×3** → route-share deep links won't verify (NOT a submission blocker — deep links only) | web | 01 §5 | DEV (after Team ID) |
| B8 | **`review-prompt.ts` hardcodes a Play Store fallback URL** → on iOS the fallback opens Play Store (polish, not a hard reject) | code | 02 §5.6 | DEV (after Apple app ID) |

**Already satisfied — do NOT re-do:**
- ✅ **ATS is clean** — OSRM is HTTPS since 2026-04-28. The old plan's `NSAppTransportSecurity` exception is **OBSOLETE; do not re-apply** (01 §2).
- ✅ **`react-native-play-install-referrer` is Android-only and already `Platform.OS`-guarded** — safe on iOS, no change (01 §4c).
- ✅ **UGC moderation (report content + block user) is shipped** → Guideline 1.2 satisfiable (02 §1.8).
- ✅ **In-app account deletion exists** (`apps/mobile/app/delete-account.tsx`, reachable from `profile.tsx:921`; web mirror at `apps/web/app/account-deletion/`) → Guideline 5.1.1(v) satisfied. Apple requires deletion to be reachable **in-app**, not only on the web — it is.
- ✅ **No ATT prompt needed** — no tracking, `AD_ID` blocked, no IDFA, Mapbox telemetry off (02 §3.3).
- ✅ **`supportsTablet: false`** → no iPad screenshots required or accepted.

---

## 2. Phased plan A → E

Each phase: **entry criteria → work items (owner DEV or USER) → exit criteria → rough wall-clock.**

### Phase A — Pre-build config (code + dashboards)

**Entry:** Apple Developer enrollment in progress (Team ID not yet required for most of A); iOS OAuth client created in GCP.

| Work item | Owner | Detail |
|---|---|---|
| Add `NSMotionUsageDescription` to `ios.infoPlist` | DEV | B2. `'Defensive Pedal uses motion to add a subtle 3D tilt effect to your achievement badges.'` |
| Add `ITSAppUsesNonExemptEncryption: false` to `ios.infoPlist` | DEV | B4. Self-certifies the HTTPS-only encryption exemption; skips the per-upload interview. |
| Create iOS OAuth client in GCP `gen-lang-client-0895796477` | USER | B1. Bundle IDs `com.defensivepedal.mobile` (+ `.preview`/`.dev` ideally). Yields iOS client ID + reversed client ID. |
| Add `GIDClientID` + reversed-client-id URL scheme (prefer the `@react-native-google-signin/google-signin` config plugin with `iosUrlScheme`) | DEV | B1. CNG-correct: the plugin re-writes the keys on every prebuild. |
| Implement **Sign in with Apple** — (1) add `expo-apple-authentication` to `apps/mobile/package.json`; (2) **set `ios.usesAppleSignIn: true` in `app.config.ts`** — this is the key that injects the `com.apple.developer.applesignin` entitlement into the provisioning profile; **omit it and Apple auth silently fails on device**; (3) add an Apple button at **equal prominence** to Google on `app/auth.tsx`; (4) wire `supabase.auth.signInWithIdToken({ provider: 'apple', … })` | DEV + USER | B5. See §4. Apple Developer (Service ID + key) + Supabase Apple provider are USER dashboard steps (task 5). |
| Produce opaque, alpha-free `appstore-icon-1024.png` (flatten onto `#F7D02A`) | DEV | B3. Verify `mode=RGB`. |
| Add Support page at `routes.defensivepedal.com/support` | DEV | B6. Minimal: contact `privacy@defensivepedal.com` + FAQ link. Redeploy `apps/web` (Vercel). |
| Add 3 Supabase OAuth redirect URIs | USER | `defensivepedal://auth/callback`, `defensivepedal-preview://…`, `defensivepedal-dev://…`. Needed for **email-confirm** redirect (Google no longer round-trips Supabase). |
| Ensure EAS secrets exist for iOS profiles: `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`, `SENTRY_AUTH_TOKEN`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | USER | Mapbox CocoaPods auth at `pod install` is the single most likely first-build failure. |
| Typecheck (`npm run typecheck`) + bundle check (`npm run check:bundle`) | DEV | Project gate before any build. |

**Exit:** all of B1–B6 landed in code/config; GCP iOS client + Supabase URIs + EAS secrets in place; `npm run typecheck` clean. (B7 AASA Team-ID fill happens once enrollment yields the Team ID — can trail into Phase B.)
**Wall-clock:** ~1–2 days of DEV work + the iOS-OAuth/Supabase dashboard actions (minutes), running in parallel with Apple enrollment.

---

### Phase B — First EAS iOS dev build + cold smoke

**Entry:** Phase A code merged; Apple Team ID available (needed so EAS can mint signing credentials); `eas login` done; one iPhone on hand.

| Work item | Owner | Detail |
|---|---|---|
| `eas credentials --platform ios` (interactive) | USER | Distribution cert, provisioning profiles, **APNs key** for all bundle IDs. |
| `cd apps/mobile && eas build --profile development --platform ios` | DEV | ~12–20 min cloud build. |
| Verify build log: `[eas-hook] Wrote ~/.netrc for Mapbox CocoaPods download`, clean `pod install`, generated `Info.plist` contains `GIDClientID` + reversed-client-id scheme + `NSMotionUsageDescription` + location strings | DEV | Inspect EAS logs, NOT native files. |
| Install on iPhone, cold smoke | USER | Boot → Mapbox renders → GPS prompt → **OSRM route returns** (proves HTTPS routing) → **Google sign-in shows native sheet** → **Sign in with Apple works** → holo-badge tilt works (proves motion permission) → push permission prompt fires. |
| **Verify the generated iOS Privacy Manifest** (`PrivacyInfo.xcprivacy`) | DEV | **(QA HIGH — do not skip.)** Apple auto-rejects the *upload* (at binary validation, before human review) for missing "required-reason API" declarations. Extract the manifest from the EAS build (or `eas build:inspect`) and confirm reasons are declared for: **NSUserDefaults** (`expo-secure-store` / async-storage) → `CA92.1`; **File timestamp** (RN bundler / `expo-file-system`) → `C617.1`/`0A2A.1`; **Disk space** (Mapbox tile cache) → `E174.1`; **System boot time** if used → `35F9.1`. Confirm bundled SDKs (`@rnmapbox/maps`, `posthog-react-native`, `@sentry/react-native`) ship their own merged manifests, else add their reasons app-level. Confirm **no `NSPrivacyTracking=true` and no tracking domains** (keeps the "no ATT" claim true). Fix via the Expo privacy-manifest config before Phase D submit. |

**Exit:** app boots and the smoke checklist passes on a real device; no `pod install`/CocoaPods failure; no immediate crash; Privacy Manifest verified (all required-reason entries present, no tracking flag).
**Wall-clock:** ~0.5–1 day (mostly build wait + first-device setup).

---

### Phase C — iOS-specific bug hunt

**Entry:** Phase B smoke passed.

Walk the HIG-delta checklist (02 §5) + the historical 10-item iOS risk surface. File each finding as `iOS-N` in `issuefix.md`, fix → rebuild → retest.

| Verify | Where | Owner |
|---|---|---|
| Dynamic Island / notch insets on map overlay cards + `NavigationHUD` | `route-planning.tsx`, `navigation.tsx`, `MapStageScreen.tsx` | DEV/USER |
| Edge **swipe-back** works on pushed routes AND is locked during `NAVIGATING` | Expo Router `_layout.tsx`, `useRouteGuard` | DEV/USER |
| Every modal/sheet dismissable without a hardware back button | `*Sheet`/`*Modal` organisms | DEV/USER |
| Status-bar contrast on the dark map (forced-dark nav) | `app/_layout.tsx` | DEV/USER |
| Haptic feel on the Taptic Engine | `PressableScale`, `haptics.ts` | USER |
| `expo-store-review` native sheet fires; Play-Store fallback URL replaced with App Store URL (B8) | `review-prompt.ts` | DEV |
| Background-location justification narrative ready for review | review notes | USER |
| Daily 8:30 weather local notification schedules on iOS | `DailyWeatherScheduler` | USER |
| NetInfo module linked (offline detection works) | `ConnectivityMonitor` | DEV |
| Share-card capture (`react-native-view-shot`) renders correctly | `useShareCard` | USER |
| Universal Links open the app (after B7 AASA Team-ID fill + redeploy) | AASA | DEV/USER |

**Exit:** every `iOS-N` item closed; clean rebuild; no P0/P1 on device.
**Wall-clock:** ~2–4 days (batch fixes between builds — each rebuild is 12–20 min).

---

### Phase D — TestFlight (internal → external)

**Entry:** Phase C green; ASC app record created; `submit.ios` filled in `eas.json`.

| Work item | Owner | Detail |
|---|---|---|
| `eas build --profile preview --platform ios` → `eas submit --platform ios --profile preview` | DEV | Uploads to App Store Connect. |
| ASC → TestFlight → **Internal Testing** → add build → invite 3–5 internal testers (your own Apple IDs, no review) | USER | Instant availability. |
| Optional: **External Testing** group (up to 10,000) — requires a one-time **Beta App Review** (~1 day) | USER | Use only if you want wider beta before public; can be skipped to go straight to public. |
| Fill TestFlight "Test Information" (what to test, contact email) | USER | Required to start external testing. |

**Exit:** build live in TestFlight, internal testers running it; (optional) external beta approved.
**Wall-clock:** internal ~same day; +1 day if doing a Beta App Review for external.

---

### Phase E — App Store public submission + review + phased release

**Entry:** TestFlight build stable (≥3–5 days clean Sentry for the `iOS` tag, no P0/P1 tester reports); all ASC listing fields + privacy + age rating + screenshots done.

| Work item | Owner | Detail |
|---|---|---|
| Complete ASC listing (name, subtitle, description, keywords, category, URLs, copyright) | USER | Copy ready in 02 §1. |
| Complete Age Rating (UGC = Yes → ~12+), App Privacy labels (tracking = No everywhere), Export Compliance (exempt) | USER | 02 §1.8, §3, §4. |
| Upload 6× 6.9″ (1320×2868) + 6× 6.5″ (1242×2688) portrait screenshots + alpha-free icon | USER | 02 §2. |
| Write App Review notes (UGC moderation workflow + background-location justification) + supply a **demo review account** (email+password) | USER | Apple must reach community surfaces without anonymous-only auth. |
| Select the TestFlight/preview build as the release build; **enable Phased Release for automatic updates** | USER | Apple's 7-day phased ramp (1→2→5→10→20→50→100% over 7 days). |
| **Submit for Review** | USER | Apple review typically 24–48 h (can be hours, can be a few days). |
| On approval → **release manually** with Phased Release ON | USER | Watch Sentry crash-free + ASC metrics each phased day; pause if crash-free drops below threshold. |

**Exit:** app live on the App Store, phased release ramping to 100% with metrics within gate.
**Wall-clock:** review 1–3 days + 7-day phased release ramp.

---

## 3. Tasks YOU (Victor) must do — ordered checklist

This is the consolidated, **ordered** list of USER actions the original request asked for. Do them roughly in this sequence; items 1–2 and 6 can start immediately and run in parallel with DEV's Phase A code work.

| # | Task | Where (URL) | Inputs needed | Output produced | Est. time |
|---|---|---|---|---|---|
| 1 | **Enroll in Apple Developer Program** | https://developer.apple.com/enroll/ | $99/yr; Apple ID. **Individual** = instant, but your personal legal name shows as the App Store "seller". **Organization** = needs a **D-U-N-S number** (you have one) + a 2–5 business-day verification wait, and lets the company name be the seller + enables team roles. | Membership + **10-char Apple Team ID** (developer.apple.com/account → Membership) | Individual: minutes. Org: **2–5 business days** wait. |
| 2 | **Create iOS OAuth client** (for Google Sign-In) | https://console.cloud.google.com → project **gen-lang-client-0895796477** → Credentials | Bundle IDs `com.defensivepedal.mobile` (+`.preview`/`.dev`). **Same GCP project as web/Android clients — NOT Firebase.** | iOS client ID `<NNN>-<hash>.apps.googleusercontent.com` + reversed client ID `com.googleusercontent.apps.<NNN>-<hash>` (hand to DEV for `app.config.ts`) | ~15 min |
| 3 | **Add Supabase OAuth redirect URIs** | Supabase Dashboard → Authentication → URL Configuration → Redirect URLs | The 3 scheme URLs: `defensivepedal://auth/callback`, `defensivepedal-preview://auth/callback`, `defensivepedal-dev://auth/callback` | Email-confirm redirect works on iOS | ~5 min |
| 4 | **Register the App ID + create the ASC app record** | https://developer.apple.com/account → Identifiers (App ID `com.defensivepedal.mobile`, enable Push + Sign in with Apple capabilities) → then https://appstoreconnect.apple.com → Apps → **+ New App** | App name `Defensive Pedal`, bundle ID, primary language, SKU | **`ascAppId`** (10-digit numeric, for `eas.json`) | ~15 min |
| 5 | **Enable the Apple provider in Supabase** (native flow — pairs with DEV's code in B5) | Supabase → Authentication → Providers → **Apple** | Just the app **bundle ID(s)** in the "Client IDs" field (`com.defensivepedal.mobile`[,`.preview`,`.dev`]). **No Services ID / .p8 key needed** — those are only for web OAuth; the native `signInWithIdToken` flow validates the token signature + bundle-ID audience. The App ID's Sign-in-with-Apple capability is provisioned by `ios.usesAppleSignIn` during `eas credentials`. | Apple provider enabled | ~10 min |
| 6 | **Run `eas credentials --platform ios`** (interactive) | terminal, `cd apps/mobile` (must be `eas login`'d) | Apple ID + Team ID; walk all 3 bundle IDs | iOS distribution cert, provisioning profiles | ~20 min |
| 7 | **Generate/upload an APNs key** | inside `eas credentials` (or developer.apple.com → Keys → + → APNs) | — | **`.p8` APNs key** registered with Expo Push (push deliverable on iOS) | ~10 min |
| 8 | **Create an App Store Connect API key** | https://appstoreconnect.apple.com → Users & Access → Integrations → Keys | Admin/App Manager role | **`.p8` API key** + **Key ID** + **Issuer ID** (for `eas submit`). **Store the `.p8` OUTSIDE the repo; gitignore it.** | ~10 min |
| 9 | **Fill `submit.ios` in `eas.json`** | repo (`apps/mobile/eas.json`) | `appleId`, `ascAppId` (task 4), `appleTeamId` (task 1), `ascApiKeyPath`/`ascApiKeyIssuerId`/`ascApiKeyId` (task 8) | `eas submit --platform ios` works | ~10 min |
| 10 | **Capture + upload screenshots** | on-device + ASC → your app → version → Media | 6× 6.9″ (1320×2868) + 6× 6.5″ (1242×2688) **portrait**; the 6 surfaces in 02 §2.2 | App Store product page imagery | ~1–2 h |
| 11 | **Fill App Privacy + Age Rating + Export Compliance** | ASC → App Privacy / Age Rating / (export prompt at upload) | Privacy table (02 §3); UGC = **Yes**; tracking = **No** everywhere; encryption = **exempt** | Privacy nutrition labels + ~12+ rating + export self-cert | ~45 min |
| 12 | **Set up TestFlight testers** | ASC → TestFlight → Internal Testing (+ optional External) | Tester Apple IDs; Test Information text | Build distributed to testers | ~20 min (+~1 day if external Beta App Review) |
| 13 | **Create a demo review account + write App Review notes** | ASC → version → App Review Information | A working email+password login; UGC-moderation + background-location narrative | Reviewer can reach all surfaces | ~20 min |
| 14 | **Submit for Review** (then release with Phased Release ON) | ASC → version → Submit for Review | All of the above complete | App in review → live | submit ~5 min; **review 24–48 h**; phased release **7 days** |

> **Individual vs Organization decision (task 1):** if you want to ship *today* and don't mind your personal name as the seller, pick **Individual** (instant). If the business name on the listing matters or you want team roles, pick **Organization** (D-U-N-S + 2–5 day wait). You can later migrate Individual → Organization but it's friction; decide up front.

---

## 4. Risk register — top rejection risks + mitigations

| Risk | Severity | Guideline | Why it bites | Mitigation / work item |
|---|---|---|---|---|
| **Sign in with Apple missing** | **HIGH / BLOCKER** | **4.8** | The app offers **Google Sign-In** (a third-party social login). Guideline 4.8 requires an **equivalent privacy-preserving login option** (Sign in with Apple) be offered **alongside** it, unless a narrow exemption applies. Apple routinely rejects social apps that ship Google login without Apple login. | **Implement it (B5):** add `expo-apple-authentication`, set `ios.usesAppleSignIn: true` (Expo injects the `com.apple.developer.applesignin` entitlement), wire `supabase.auth.signInWithIdToken({ provider: 'apple', token })`, and enable the **Apple provider in Supabase** (USER tasks 4–5). Place the Apple button per Apple's HIG (equal prominence to Google). **Exemption note:** 4.8 exempts apps whose *only* login is the developer's own account system or a recognized enterprise/education/non-3rd-party login — **Defensive Pedal does NOT qualify** because it deliberately offers Google as a third-party social login. Email/password + anonymous alone would dodge 4.8, but since Google is a headline path, Apple login is required. **Do not gamble on an exemption — implement it.** |
| **iOS Privacy Manifest (`PrivacyInfo.xcprivacy`)** | MEDIUM | App Store Privacy program | Since 2024 Apple requires a privacy manifest declaring data types collected + **"required-reason API" usage** (file timestamps, UserDefaults, system boot time, disk space). Several common RN/Expo deps trigger required-reason APIs. Missing/incomplete manifest → upload warning or rejection. | EAS/Expo SDK 55 auto-generates a baseline `PrivacyInfo.xcprivacy` during CNG prebuild, and well-maintained Expo modules ship their own manifests that get merged. **Action:** after the first build, confirm the generated manifest covers UserDefaults + any analytics SDK; if `posthog-react-native`/`@sentry/react-native` need entries, add via the Expo privacy-manifest config. Verify there's **no tracking-domains** entry (keeps the "no ATT" claim true). Low effort, but verify — don't assume. |
| **Background location (Always)** | MEDIUM | **5.1.1** | Apple scrutinizes "Always"/background location hard; vague justification → rejection or a request for a screen recording. | Strings already set (`locationAlways…`, `UIBackgroundModes:['location']`). **Mitigation:** review note must state plainly: *"Background location powers turn-by-turn navigation while the screen is locked/app is backgrounded during an active ride."* Be ready to supply a short screen recording of nav-with-screen-locked. |
| **App Store icon alpha** | HIGH | Asset validation | RGBA icon auto-rejected (B3). | Ship opaque 1024 RGB icon (Phase A). |
| **Export-compliance stall** | LOW (friction) | Export | Missing `ITSAppUsesNonExemptEncryption` halts every upload on the encryption question. | Add `false` (B4); answer "exempt / standard HTTPS only" if ever prompted. |
| **UGC moderation (Guideline 1.2)** | LOW — **already satisfied** | **1.2** | #1 rejection reason for social apps: no report/block. | **Already shipped** (`useReportContent.ts` 7 reasons, `useBlockUser.ts` + `blocked-users.tsx`, server hides `score<=-3`). Just **document the workflow in App Review notes** + provide the demo account. No code work. |
| **Minimum functionality (4.2)** | LOW | **4.2** | Apple rejects thin/"web-wrapper" apps. | Defensive Pedal is a rich native nav app (Mapbox GL, GPS, OSRM routing, gamification) — comfortably clears 4.2. No action; just don't ship a stripped build. |
| **Sign-in walls / account deletion (5.1.1)** | LOW — satisfied | **5.1.1** | Apps requiring accounts must offer in-app deletion + not gate non-account features behind login. | **Anonymous auth** lets the app work without an account; **in-app account deletion** exists at `apps/mobile/app/delete-account.tsx`, reachable from `profile.tsx:921` (web mirror at `apps/web/app/account-deletion/`). |
| **Mapbox CocoaPods auth fail (build-time)** | MEDIUM (build, not review) | — | `pod install` fails if `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` EAS secret is missing. | Verify the secret + the `[eas-hook] Wrote ~/.netrc…` log line in the first build (Phase B). |
| **Deep links broken (AASA placeholders)** | LOW (feature, not reject) | — | `FILL_ME_TEAM_ID` ×3 → Universal Links don't verify (B7). | Fill real Team ID, redeploy `apps/web`, verify `curl -sI …/.well-known/apple-app-site-association` → 200 + `application/json`, no redirect. Not a submission blocker. |

---

## 5. What changed since the 2026-04-23 plan

The stale handoff (`docs/plans/ios-testflight-launch.md`) is **directionally right but wrong in specifics.** Reconciliation:

| 2026-04-23 plan said | Now (2026-06-09) | Verdict |
|---|---|---|
| **A1: add `NSAppTransportSecurity` exception for plaintext OSRM `34.116.139.172`** | OSRM went HTTPS on 2026-04-28; all hosts are TLS. The current `app.config.ts` ios block has **no** ATS key (correct). | ❌ **OBSOLETE — do NOT add.** The stale plan's "Gotcha #1 (ATS is the most likely Phase B failure)" is wrong now. |
| (no mention of Google Sign-In — predates it) | **Native Google Sign-In** shipped 2026-05-21; needs `GIDClientID` + reversed-client-id + iOS OAuth client (B1). | ➕ **NEW blocker** this plan adds. |
| (no mention of `expo-sensors`) | **Holo-badge gyro** (`expo-sensors`) shipped May 2026; needs `NSMotionUsageDescription` (B2). | ➕ **NEW blocker.** |
| (no mention) | **`react-native-play-install-referrer`** added since; **already `Platform.OS`-guarded** → safe on iOS. | ➕ Verified safe, no change. |
| Scope ends at **TestFlight internal + 7-day Sentry**; store listing explicitly **out of scope** | This master plan **extends through public App Store submission + phased release**, folding in the listing/assets/privacy work (doc 02). | 🔁 **Scope expanded** to full public launch. |
| Sign in with Apple: not mentioned | Now flagged as a **HIGH/BLOCKER** Guideline 4.8 risk (B5). | ➕ **NEW blocker.** |
| Icon alpha, `ITSAppUsesNonExemptEncryption`, Support URL: not mentioned | All three surfaced as must-fix (B3/B4/B6). | ➕ **NEW.** |
| A3 (AASA Team ID), A4 (pre-build netrc for Mapbox), A5 (eas credentials), A6 (Supabase URIs) | **Still valid.** A4 is **already committed** (`eas/build/pre-build.sh`). A3/A5/A6 carried forward. | ✅ Carried forward. |

**Bottom line:** keep A3/A4/A5/A6, drop A1, and add the five new items (Google Sign-In iOS config, `NSMotionUsageDescription`, icon flatten, encryption key, Sign in with Apple) plus the full store-listing track.

---

## 6. DEV vs USER split + recommended end-to-end timeline

### DEV owns (code/config/asset/web)
- `app.config.ts`: `NSMotionUsageDescription`, `ITSAppUsesNonExemptEncryption`, `GIDClientID` + reversed-client-id (plugin), `usesAppleSignIn` (B1/B2/B4/B5)
- `expo-apple-authentication` wiring + Supabase `signInWithIdToken` Apple path (B5)
- Opaque 1024 App Store icon (B3)
- Support page + AASA Team-ID fill + redeploy (B6/B7)
- iOS App Store fallback URL in `review-prompt.ts` (B8)
- Privacy Manifest verification (§4)
- `eas build`, reading build logs, the Phase C fix loop

### USER owns (accounts/dashboards/device/store)
- Apple Developer enrollment, App ID, ASC app record (tasks 1, 4)
- GCP iOS OAuth client, Supabase OAuth URIs + Apple provider (tasks 2, 3, 5)
- `eas credentials`, APNs key, ASC API key, fill `submit.ios` (tasks 6–9)
- Screenshots, App Privacy, Age Rating, Export Compliance (tasks 10–11)
- Demo review account + review notes (task 13)
- On-device smoke/bug-hunt/stabilization testing
- TestFlight tester setup + Submit for Review + phased release (tasks 12, 14)

### Recommended end-to-end timeline (Gantt-style)

```
Day 0      ┌ USER: start Apple enrollment (Individual=instant | Org=2–5 business days)
           ├ USER: create GCP iOS OAuth client; add Supabase redirect URIs + Apple provider
           └ DEV : Phase A code (motion str, encryption key, Google iOS, Apple Sign-In,
                   icon flatten, Support page) — runs in parallel with enrollment
Day 1–2    ┌ DEV : finish Phase A, typecheck + bundle check, commit
           └ USER: (Org path) waiting on enrollment verification
Day 2–3    ┌ USER: Team ID arrives → App ID + ASC app record + eas credentials + APNs +
           │       ASC API key; DEV fills/verifies submit.ios; DEV fills AASA Team ID
           └ DEV : Phase B — first EAS iOS dev build (~15 min) → USER cold-smoke on iPhone
Day 3–6    └ Phase C — iOS bug hunt (Dynamic Island, swipe-back lock, haptics, deep links);
                   fix → rebuild → retest loop
Day 6–7    ┌ DEV : Phase D — preview build → eas submit
           └ USER: TestFlight Internal (instant); optional External (+~1 day Beta Review)
Day 7–11   └ Phase E prep — USER fills listing, screenshots, App Privacy, age rating,
                   review notes + demo account; ~3–5 day TestFlight stabilization watch
Day 11–12  └ USER: Submit for Review (Phased Release ON)
Day 12–15  └ Apple review (24–48 h typical) → approve
Day 15–22  └ Phased Release ramp 1→100% over 7 days, watching Sentry crash-free each day
```

**Realistic span: ~2 weeks** if enrollment is Individual (instant) and the bug hunt is light; **~3 weeks** with Organization enrollment + an External TestFlight beta + a couple of review round-trips. The two longest fixed waits are **Org enrollment (2–5 business days)** and **Apple review + 7-day phased ramp**; everything else is DEV/USER throughput.

---

## 7. QA review outcomes

This plan was independently verified against the live codebase (`docs/plans/ios/03-qa-review.md`). 19 claims confirmed with `file:line` evidence (install-referrer guard, clean ATS, all-HTTPS hosts, icon alpha, missing encryption/motion keys, missing Google-iOS config, UGC moderation shipped, in-app account deletion, no ATT). Two findings were folded back into this plan:

- **BLOCKER (folded in):** the `ios.usesAppleSignIn: true` entitlement key is now an explicit Phase A sub-item (§2 Phase A, B5 row) — without it the Apple-Sign-In entitlement never reaches the provisioning profile and on-device auth fails silently.
- **HIGH (folded in):** an iOS **Privacy Manifest** required-reason-API verification step was added to Phase B — Apple auto-rejects the *upload* (pre-review) for missing entries.

Lower-severity QA notes (all tracked, none blocking): `review-prompt.ts` needs a `Platform.select` branch before TestFlight (B8 / Phase C); `remote-notification` in `UIBackgroundModes` is required-and-not-removable for Expo Push; optional `ios.resourceClass` for the large asset bundle; `expo-speech` needs no usage string. Verdict: **plan is sound and actionable; 0 unresolved blockers.**

---

### Sources
- `docs/plans/ios/01-technical-readiness.md` (native/build/EAS — `ios-native`)
- `docs/plans/ios/02-store-listing-assets.md` (listing/assets/privacy/HIG — `ios-store`)
- `docs/plans/ios-testflight-launch.md` (stale 2026-04-23 handoff — reconciled §5)
- `.claude/CLAUDE.md` "Play Store Release" + `reference_playstore-release-workflow.md` (staged-rollout posture)
- `apps/mobile/app.config.ts` (verified: ios block has no ATS/GIDClientID/NSMotionUsageDescription/ITSAppUsesNonExemptEncryption today)
