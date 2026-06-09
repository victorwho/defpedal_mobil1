# iOS App Store — 01. Technical Readiness Audit

**Author:** `ios-native` (RN/Expo native-platform specialist)
**Date:** 2026-06-09
**Status:** Research/audit only — no code changed, nothing installed, nothing committed.
**Scope:** Verify the current codebase against everything iOS needs for a first EAS iOS build + App Store submission. Supersedes the stale 2026-04-23 handoff `docs/plans/ios-testflight-launch.md` (verified obsolete in places — see §7).

This is the engineering-readiness section of the larger iOS launch plan. Sibling docs (Apple Developer enrollment steps, App Store Connect listing/screenshots/privacy nutrition labels, App Review prep, the user's own action checklist) are owned by `ios-lead` / other sections. **This doc answers one question: what must change in code/config before `eas build --platform ios` will produce a working, submittable binary, and what runtime iOS bugs are likely.**

---

## 0. Headline verdict

The app is **architecturally ready** for iOS — it's a managed Expo SDK 55 / RN 0.83 app, all production network endpoints are HTTPS (no ATS blocker), and every native module in use is either cross-platform or already platform-guarded. **It is NOT build-ready as-is.** There are **3 hard blockers** that will break either the build or a core feature on the first iOS build, all fixable in `app.config.ts` + 1 web file + dashboard actions:

1. **Native Google Sign-In has zero iOS configuration** — no `GIDClientID`, no reversed-client-id URL scheme. Sign-in with Google will fail on iOS. (§3, blocker)
2. **`expo-sensors` DeviceMotion (holo-badge gyro tilt) needs `NSMotionUsageDescription`** or the app will be rejected / crash on first sensor access under iOS privacy rules. (§4, blocker)
3. **Universal Links AASA file still has `FILL_ME_TEAM_ID` placeholders** — route-share deep links (`applinks:routes.defensivepedal.com`) won't verify until the real Apple Team ID is filled in and the file redeployed. (§5, blocker for deep links; not for first boot)

Everything else (ATS, install-referrer, notifications, push tokens, secure-store, sqlite, clipboard, store-review) is already correct or a no-op on iOS.

---

## 1. Build model: managed CNG prebuild (this matters a lot)

**There is NO `apps/mobile/ios/` directory.** Verified: `git ls-files apps/mobile/ios` → 0 files. By contrast `apps/mobile/android/` IS partially tracked (`build.gradle`, `AndroidManifest.xml`, `gradle.properties` force-added despite the root `.gitignore` `android`/`ios` rules) and is **hand-managed** — CLAUDE.md states "this project never runs `expo prebuild`" for Android.

**Implication for iOS — the opposite is true and unavoidable:** because no `ios/` folder exists, **EAS will run Continuous Native Generation (`expo prebuild`) for iOS on every build.** That means:

- **All iOS native config MUST flow through `app.config.ts`** (the `ios.infoPlist`, `ios.entitlements`, and config plugins). You cannot hand-edit a `Podfile` or `Info.plist` — there isn't one in the repo, and any generated one is thrown away and regenerated each build.
- The 3 Android-only config plugins (`plugins/withAndroidFirebaseAnalyticsDisabled.js`, `withAndroidForegroundServiceLocation.js`, `withAndroidSentryTags.js`) are no-ops on iOS — they only touch `AndroidManifest`/gradle. No iOS equivalent needed; their concerns (firebase-analytics, foreground-service-location, Sentry tags) are handled differently on iOS (analytics never shipped; iOS background location via `UIBackgroundModes`; Sentry via the `@sentry/react-native/expo` plugin which is cross-platform).
- **Do NOT `expo prebuild` and commit an `ios/` folder.** Keep iOS fully managed/CNG. If you ever commit `ios/`, you inherit the same hand-maintenance burden Android has, and the Android lesson (error-log #24: `blockedPermissions` silently inert because prebuild never runs) shows how that drifts. For iOS, prebuild DOES run, so config-as-code in `app.config.ts` is authoritative — keep it that way.

**Action:** none structural — just be aware every fix below is an `app.config.ts` edit, verified by inspecting the EAS build's generated `Info.plist` in the build logs, not by editing native files.

---

## 2. App Transport Security (ATS) — VERIFIED CLEAN, no exception needed

The 2026-04-23 handoff's entire Phase A1 was about adding an `NSAppTransportSecurity` exception for the **plaintext OSRM direct IP `34.116.139.172`**. **That is now obsolete.** OSRM went HTTPS on 2026-04-28 (CLAUDE.md "OSRM HTTPS migration"). I grepped every network base URL in the mobile bundle:

| Service | File:line | URL | Scheme |
|---|---|---|---|
| OSRM safe (RO) | `src/lib/mapbox-routing.ts:43` | `osrm.defensivepedal.com/route/v1/bicycle` | https |
| OSRM flat (RO) | `src/lib/mapbox-routing.ts:44` | `osrm-flat.defensivepedal.com/...` | https |
| OSRM safe (ES) | `src/lib/mapbox-routing.ts:47` | `osrm-es.defensivepedal.com/...` | https |
| OSRM flat (ES) | `src/lib/mapbox-routing.ts:48` | `osrm-es-flat.defensivepedal.com/...` | https |
| Mapbox Directions | `src/lib/mapbox-routing.ts:53` | `api.mapbox.com/directions/v5/...` | https |
| Mapbox Search/POI | `src/lib/mapbox-search.ts:27-28`, `poi-search.ts:40` | `api.mapbox.com/...` | https |
| Cloud Run mobile API | env `EXPO_PUBLIC_MOBILE_API_URL` (`src/lib/env.ts:57`) | `defpedal-api-…run.app` | https |
| Supabase | env `EXPO_PUBLIC_SUPABASE_URL` (`env.ts:60`) | `…supabase.co` | https |
| Open-Meteo weather/AQI | `src/lib/weather.ts:1-2`, `daily-weather-notification.ts:31` | `api.open-meteo.com`, `air-quality-api.open-meteo.com` | https |
| Overpass (parking/rental/shops/lanes) | `bicycle-*.ts:12-13`, `bicycle-lanes.ts:79` | `overpass-api.de` | https |
| PostHog | `env.ts:76` | `eu.i.posthog.com` | https |
| Play Store fallback | `review-prompt.ts:34` | `play.google.com` | https (Android-only path) |

**Only `http://` hits in `src/`:** test files (`localhost:8080`, fine — not shipped) and `gpx-export.ts:40` which is the **GPX XML namespace string** `http://www.topografix.com/GPX/1/1` — a schema identifier, never fetched. **No cleartext network calls ship.**

**Confirmed:** the current `app.config.ts` `ios` block (lines 252–263) has **NO `NSAppTransportSecurity` key.** That is correct. Default ATS (TLS-only) is satisfied.

**Action:** **Do NOT add any ATS exception.** If you copied one from the stale plan, delete it. The only thing to watch: if OSRM ever reverts to an IP/plaintext host, ATS will silently block routing on iOS with `App Transport Security policy requires the use of a secure connection` (visible in Sentry/Xcode console, not in JS). Keep all hosts HTTPS.

---

## 3. Native Google Sign-In — **HARD BLOCKER, currently 0% iOS config**

`@react-native-google-signin/google-signin@^16.1.2` replaced browser OAuth on 2026-05-21 (CLAUDE.md "Native Google Sign-In"). It's wired in `src/lib/supabase.ts` `signInWithGoogle()` — destructure-inside-try guard per error-log #45 is correct, and it only needs the **web** client ID (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`) for the `signInWithIdToken` audience. **But the native iOS SDK additionally requires an iOS OAuth client + URL scheme**, and the current `ios` block in `app.config.ts` has **none of it**:

```
ios: {
  supportsTablet: false,
  bundleIdentifier: appIdentifierByVariant[appVariant],
  associatedDomains: ['applinks:routes.defensivepedal.com'],
  infoPlist: { UIBackgroundModes, NSPhotoLibraryUsageDescription, NSPhotoLibraryAddUsageDescription },
}
```

No `GIDClientID`, no `CFBundleURLTypes` with the reversed client ID, no config plugin for the library. On iOS the GoogleSignin native module reads `GIDClientID` from `Info.plist` and requires the reversed-client-id custom URL scheme to receive the auth callback. Without these, `GoogleSignin.configure()` / `signIn()` fails and the catch in `signInWithGoogle` returns `Google sign-in is unavailable in this build` — i.e. **the entire Google sign-in button is dead on iOS.** (Email/password + anonymous auth still work — Supabase JS only, no native module — so this is not a first-boot crash, but it IS a launch-blocking feature gap for a primary sign-in path.)

### Required, concretely:

**(a) GCP — create an iOS OAuth client** in project `gen-lang-client-0895796477` (the SAME project as the web + Android OAuth clients — NOT the Firebase project; CLAUDE.md is explicit). Bundle ID = `com.defensivepedal.mobile` (and ideally `.preview` / `.dev` too). Google issues an **iOS client ID** of the form `<NNN>-<hash>.apps.googleusercontent.com` and a **reversed client ID** `com.googleusercontent.apps.<NNN>-<hash>`. *(This is a user/dashboard action — flag to `ios-lead`.)*

**(b) `app.config.ts` — three additions to the `ios` block:**

1. Add `GIDClientID` to `ios.infoPlist` — the **iOS** client ID (NOT the web one):
   ```
   infoPlist: {
     ...existing,
     GIDClientID: '<NNN-hash>.apps.googleusercontent.com',  // the iOS OAuth client
   }
   ```
2. Add the reversed-client-id URL scheme so the native SDK's callback resolves. Either via `ios.infoPlist.CFBundleURLTypes`:
   ```
   CFBundleURLTypes: [
     { CFBundleURLSchemes: ['com.googleusercontent.apps.<NNN-hash>'] },
   ],
   ```
   (Append it — don't drop the existing app `scheme`/router schemes, which Expo injects automatically; CFBundleURLTypes is additive but verify the generated plist keeps both the app scheme and this one.)
3. **Preferred:** add the library's config plugin instead of hand-writing the two keys, so the values stay correct across CNG prebuilds:
   ```
   plugins: [
     ...,
     ['@react-native-google-signin/google-signin', { iosUrlScheme: 'com.googleusercontent.apps.<NNN-hash>' }],
   ]
   ```
   The plugin writes `GIDClientID` derivation + the URL scheme during prebuild. Using the plugin is the CNG-correct approach for this repo (config-as-code, survives every prebuild). Confirm the installed plugin version's exact option name during implementation (`iosUrlScheme` for current versions).

**(c)** No `GoogleService-Info.plist` is needed — verified none exists in the repo, and sign-in doesn't use Firebase (mirrors the Android note that `google-services.json` is unused by sign-in). Do NOT add Firebase to satisfy GoogleSignin.

**Per-variant note:** `bundleIdentifier` is `appIdentifierByVariant[appVariant]` (`.dev` / `.preview` / production). If you only register the production bundle ID + create one iOS OAuth client for it, Google sign-in works on production/TestFlight-production builds but fails on `.preview` / `.dev`. For a clean dev loop, register all three bundle IDs as iOS OAuth clients (cheap), or accept that Google sign-in is production-only on iOS during bring-up.

---

## 4. Native module iOS audit — privacy strings & platform guards

Full dependency sweep of `apps/mobile/package.json`. iOS-relevant findings:

### 4a. `expo-sensors ~15.0.0` (DeviceMotion) — **BLOCKER: needs `NSMotionUsageDescription`**

Used by `src/design-system/hooks/useHoloTilt.ts` (gyro tilt on holographic badges) via `DeviceMotion.addListener`. On iOS, `DeviceMotion` is backed by **CoreMotion device-motion** (attitude/rotation — the `CMMotionManager` device-motion API), which Apple gates behind the **`NSMotionUsageDescription`** Info.plist string. (Note: it's device-motion, NOT the pedometer/`CMPedometer` API, so the relevant key is `NSMotionUsageDescription`, the generic motion-usage string — there is no separate device-motion key.) **Without it, iOS terminates the app the moment the motion sensor is accessed, and App Review rejects the binary for a missing purpose string.**

The hook IS already bridgeless-guarded (`hasExpoNativeModule('ExponentDeviceMotion')`, error-log #21) so it degrades to drag-only if the sensor is absent — but a *present* sensor with no usage string is the crash case, and that's exactly iOS.

**Action — `app.config.ts` `ios.infoPlist`:**
```
NSMotionUsageDescription: 'Defensive Pedal uses motion to add a subtle 3D tilt effect to your achievement badges.',
```
(expo-sensors does not auto-inject this via a plugin in SDK 55 for the holo use-case — add it explicitly.)

### 4b. `expo-location ~55.1.2` — already correct

The `expo-location` plugin block (app.config.ts lines 214–223) already sets `locationWhenInUsePermission`, `locationAlwaysAndWhenInUsePermission`, and `isIosBackgroundLocationEnabled: true`. `UIBackgroundModes` includes `location` (line 257). This generates `NSLocationWhenInUseUsageDescription` + `NSLocationAlwaysAndWhenInUseUsageDescription` correctly. **App Store review scrutinizes background location heavily** — be ready to justify it (turn-by-turn nav with screen locked). The string already says exactly that. Good. No code change; just a review-narrative note for `ios-lead`.

### 4c. `react-native-play-install-referrer ^1.1.9` — **SAFE on iOS as-is, no guard change needed**

This is **Android-only** (Play Store install attribution). I read `src/lib/installReferrer.ts`: it returns `null` immediately on `Platform.OS !== 'android'` (line 56), *before* any `require()` or `NativeModules.PlayInstallReferrer` access (line 62) and before the lazy `await import(...)` (line 68). On iOS the native module simply won't be linked (the autolinked pod has no iOS target), and the code path never touches it. **The runtime is fully guarded — no `Platform.OS` guard is missing, it's already there.**

The repo-root patch `patches/react-native-play-install-referrer+1.1.9.patch` only edits the module's **Java** file (`PlayInstallReferrer.java`, widening a `catch` to prevent a background-thread crash, error-log #56) — it has zero iOS surface. **The iOS build will not break and there is no iOS-side referrer crash risk.** Verdict: ship as-is. (One thing to confirm during the build: that the library's autolinking doesn't add an empty/failing iOS pod — extremely unlikely for an Android-only lib, but watch the `pod install` step in the first EAS iOS build log.)

### 4d. Other Expo/native modules — iOS specifics

| Package | iOS status | Notes |
|---|---|---|
| `expo-secure-store ~55.0.8` | ✅ config present | `faceIDPermission` already set in the plugin block (app.config.ts:238–242) → generates `NSFaceIDUsageDescription`. Used as the Supabase auth session store (`src/lib/supabase.ts`). Keychain-backed on iOS — correct. |
| `expo-sqlite ~55.0.10` | ✅ no iOS string | Plugin block present (FTS on, SQLCipher off). No iOS privacy string. Fine. |
| `expo-clipboard ~8.0.8` | ✅ no string needed | iOS 14+ shows a *system* paste banner on `getString`; we only **write** (holo share-card copy via `useShareCard`), which is silent. No `NSPasteboard*` key required. |
| `expo-store-review ~55.0.14` | ✅ native on iOS | Maps to `SKStoreReviewController`/`requestReview`. `review-prompt.ts` guards on `hasExpoNativeModule('ExpoStoreReview')` and falls back to `Linking.openURL`. The fallback URL is `play.google.com` (Android) — for iOS the fallback should point at the App Store listing once the app exists, but the **native path works without it**, so this is a polish item, not a blocker. Flag: update the iOS fallback URL after the App Store ID is assigned. |
| `expo-notifications ~55.0.16` | ✅ works on iOS | Plugin block sets icon/color (Android-cosmetic; harmless on iOS). Permission requested via `ensureNotificationPermissionAsync()`. `setNotificationChannelAsync` calls (`daily-weather-notification.ts:64`, `push-notifications.ts:77`) are **Android-only no-ops on iOS** — safe. See §6 for push-token + APNs. |
| `@react-native-community/netinfo ^12.0.1` | ✅ cross-platform | `ConnectivityMonitor` guards `NativeModules.RNCNetInfo` (error-log #23). On iOS the module IS linked, so offline detection works (better than Android dev where the guard falls back to `isOnline:true`). No change. |
| `@rnmapbox/maps ^10.1.41` | ⚠️ build-time secret | Needs the Mapbox **download** token at `pod install`. The EAS pre-build hook (`eas/build/pre-build.sh:26–35`) already writes `~/.netrc` for `machine api.mapbox.com` on the `ios` branch. This was the A4 edit and it's committed. **This is the single most likely first-build failure** (CocoaPods auth) if `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` isn't set as an EAS secret. Verify the build log prints `[eas-hook] Wrote ~/.netrc for Mapbox CocoaPods download`. |
| `@sentry/react-native ^8.4.0` | ✅ cross-platform | Activated via `@sentry/react-native/expo` plugin (app.config.ts:138) when `SENTRY_ORG`/`SENTRY_PROJECT` set. Source-map upload needs `SENTRY_AUTH_TOKEN` EAS secret (already required; prod build fail-fasts without it, app.config.ts:120–132). Works on iOS. |
| `expo-image-picker`, `expo-media-library` | ✅ strings present | `NSPhotoLibraryUsageDescription` + `NSPhotoLibraryAddUsageDescription` set in `ios.infoPlist` (app.config.ts:258–261). Profile uses `launchImageLibraryAsync` only (no camera) → **no `NSCameraUsageDescription` needed** (confirmed by the stale plan and unchanged in code). expo-media-library save uses the Add string. Good. |
| `expo-speech`, `expo-haptics`, `expo-web-browser`, `expo-file-system`, `expo-sharing`, `react-native-view-shot`, `react-native-qrcode-svg`, `posthog-react-native` | ✅ no iOS string | All cross-platform, no privacy prompts. `expo-haptics` guards `hasExpoNativeModule('ExpoHaptics')`. |

---

## 5. Universal Links / deep links — **BLOCKER for share links (`FILL_ME_TEAM_ID`)**

`app.config.ts:255` declares `associatedDomains: ['applinks:routes.defensivepedal.com']`. The matching server-side AASA file exists at `apps/web/public/.well-known/apple-app-site-association` but **still contains placeholder Team IDs**:
```
"appIDs": [
  "FILL_ME_TEAM_ID.com.defensivepedal.mobile",
  "FILL_ME_TEAM_ID.com.defensivepedal.mobile.preview",
  "FILL_ME_TEAM_ID.com.defensivepedal.mobile.dev"
]
```
Until these are replaced with the real 10-char Apple Team ID and `apps/web` is redeployed, iOS will not verify the associated domain, and tapping a `routes.defensivepedal.com/r/<code>` route-share link on iOS will open Safari instead of the app. **This does not block first boot or submission** — it's a feature degradation for inbound share links. The custom-scheme deep links (`defensivepedal://`, used by Supabase email-confirm redirect via `src/lib/supabase.ts:185`) work independently of AASA.

**Action (blocked on Apple Team ID, a user/enrollment output):**
1. Replace `FILL_ME_TEAM_ID` ×3 in `apps/web/public/.well-known/apple-app-site-association` with the real Team ID.
2. Redeploy `apps/web` (Vercel).
3. Verify: `curl -sI https://routes.defensivepedal.com/.well-known/apple-app-site-association` → `200` + `Content-Type: application/json`, **no redirect**. (`apps/web/next.config.js` already forces the JSON content-type + `skipTrailingSlashRedirect` per the stale plan — no web-config change needed, only the Team ID fill.)
4. Cross-check with an AASA validator using `<TeamID>.com.defensivepedal.mobile`.

The Android counterpart (`assetlinks.json`) is separate and already exists — not iOS's concern.

---

## 6. Push notifications + APNs (iOS-specific)

The app uses **Expo Push** (`getExpoPushTokenAsync({ projectId })` in `push-notifications.ts:88–90`, projectId `f8bcd740-…` from `extra.eas.projectId`). Server sends via the Expo Push API. On iOS, Expo Push requires an **APNs key (.p8) registered with Expo / EAS credentials** — without it, iOS devices get a token but Expo can't deliver. `UIBackgroundModes` already includes `remote-notification` (app.config.ts:257). The daily 8:30am weather ping uses **local** scheduling (`expo-notifications` `timeInterval` trigger) which works on iOS without APNs.

**Action (credentials step, not code):** during `eas credentials --platform ios` (or first `eas build`), generate/upload the **APNs key** so push tokens are deliverable. This is part of the §7 credentials work, flagged to `ios-lead`. No `app.config.ts` change — `aps-environment` entitlement is injected automatically by EAS when push is configured. Local notifications need no APNs and will work day 1.

---

## 7. EAS config, credentials & the stale-plan reconciliation

### `eas.json` current state (verified):
- `appVersionSource: 'remote'` (build numbers auto-managed by EAS — good for iOS `CFBundleVersion`).
- `build.production` has `autoIncrement: true` and `android.buildType: 'app-bundle'`. **No iOS build config block** — fine, defaults produce an iOS archive, but you may want `ios.simulator`/`ios.resourceClass` knobs later.
- `submit.preview.ios: {}` and `submit.production.ios: {}` are **empty placeholders** — they need `appleId`, `ascAppId`, `appleTeamId` (and an ASC API key) before `eas submit --platform ios` works.

### Credentials to generate (the A5 item from the stale plan — still valid):
Run `cd apps/mobile && eas credentials --platform ios` (interactive; user must be `eas login`'d) to generate, per bundle ID (`com.defensivepedal.mobile`, `.preview`, `.dev`):
- iOS Distribution certificate
- Provisioning profiles
- **APNs key** (for push, §6)

Then fill `submit.ios` under `preview` + `production` with `appleId`, `ascAppId` (10-digit numeric from App Store Connect), `appleTeamId`, and the ASC API key (`ascApiKeyPath` / `ascApiKeyIssuerId` / `ascApiKeyId`). **Store the `.p8` ASC API key OUTSIDE the repo** (absolute path or EAS env var) and gitignore it.

### Stale-plan items that are now OBSOLETE — do NOT re-apply:
- ❌ **A1 (ATS exception for `34.116.139.172`)** — obsolete, OSRM is HTTPS (§2). The stale plan's "Uncommitted local edits" table and "Gotcha #1 (OSRM ATS exception is the single most likely Phase B failure)" are both wrong now. Do not add `NSExceptionDomains`.
- ⚠️ The stale plan predates Native Google Sign-In entirely — it has **no mention of GIDClientID / reversed-client-id** (§3) or **`NSMotionUsageDescription`** (§4a). These are the genuinely new blockers this audit adds.

### Stale-plan items still VALID:
- ✅ A3 (fill AASA Team ID) — §5.
- ✅ A4 (pre-build.sh netrc for Mapbox on iOS) — **already committed**, verified in `eas/build/pre-build.sh:26–35`.
- ✅ A5 (eas credentials + fill `submit.ios`) — §7 above.
- ✅ A6 (Supabase dashboard: add OAuth redirect URIs `defensivepedal://auth/callback`, `defensivepedal-preview://…`, `defensivepedal-dev://…`). **Note:** with Native Google Sign-In these matter for the **email-confirm** custom-scheme redirect (`src/lib/supabase.ts:185` builds `${appScheme}://auth/callback`), NOT for Google (Google no longer round-trips through Supabase). Still add them — email signup confirmation on iOS depends on it.

---

## Consolidated action list (code/config only — owners noted)

**`app.config.ts` `ios` block edits (ios-native, after iOS OAuth client exists):**
1. Add `GIDClientID` (iOS OAuth client ID) to `ios.infoPlist`. *(§3)*
2. Add reversed-client-id URL scheme — preferably via the `@react-native-google-signin/google-signin` config plugin with `iosUrlScheme`. *(§3)*
3. Add `NSMotionUsageDescription` to `ios.infoPlist`. *(§4a)*
4. (Polish) iOS App Store fallback URL in `review-prompt.ts` once the App Store ID exists. *(§4d)*

**Web (ios-native, blocked on Apple Team ID):**
5. Replace `FILL_ME_TEAM_ID` ×3 in `apps/web/public/.well-known/apple-app-site-association`, redeploy, verify 200/json. *(§5)*

**Credentials / dashboard (user + ios-lead, blocked on Apple enrollment):**
6. Create iOS OAuth client in GCP project `gen-lang-client-0895796477` (prod + ideally `.preview`/`.dev` bundle IDs). *(§3a)*
7. `eas credentials --platform ios`: distribution cert, provisioning profiles, **APNs key**. *(§6, §7)*
8. Fill `submit.ios` blocks in `eas.json` with ASC identifiers + API key (key outside repo). *(§7)*
9. Add 3 Supabase OAuth redirect URIs (for email-confirm on iOS). *(§7/A6)*
10. Ensure `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` + `SENTRY_AUTH_TOKEN` EAS secrets exist for the iOS build profiles. *(§4d, §7)*

**Do NOT do:**
- ❌ Add any `NSAppTransportSecurity` exception. *(§2)*
- ❌ Add a `Platform.OS` guard to `installReferrer.ts` — it's already guarded. *(§4c)*
- ❌ Commit an `apps/mobile/ios/` folder — keep iOS managed/CNG. *(§1)*
- ❌ Add Firebase / `GoogleService-Info.plist` for Google Sign-In. *(§3c)*

**First-build smoke order:** with edits 1–3 + secrets in place, run `eas build --profile development --platform ios` (or `preview`). Watch the build log for (a) `[eas-hook] Wrote ~/.netrc for Mapbox CocoaPods download`, (b) clean `pod install`, (c) generated `Info.plist` containing `GIDClientID`, the reversed-client-id scheme, `NSMotionUsageDescription`, and the location strings. On device: boot → Mapbox renders → GPS prompt → OSRM route returns (proves HTTPS routing works) → Google sign-in shows the native sheet → holo-badge tilt works (proves motion permission).
