# iOS App Store Plan — QA Review

> Read-only verification of the three iOS planning docs against the actual codebase + Apple policy, performed 2026-06-09 by the `ios-qa` reviewer. Every claim below was checked with Read/Grep/Bash; file:line evidence cited. Reviewed docs: `01-technical-readiness.md`, `02-store-listing-assets.md`, `ios-app-store-release.md`.

## CONFIRMED (verified true against code)

| # | Claim | Evidence |
|---|-------|----------|
| C1 | `react-native-play-install-referrer` is Android-only & fully guarded | `apps/mobile/src/lib/installReferrer.ts:56` — `if (Platform.OS !== 'android') return null;` fires before the `NativeModules` check (l.62) and `await import()` (l.68). Patch touches only Java. Safe on iOS as-is. |
| C2 | No `NSAppTransportSecurity` block in `app.config.ts` | Zero grep matches for ATS/NSExceptionDomains/AllowsArbitraryLoads. `ios` block (l.252–263) has only supportsTablet/bundleIdentifier/associatedDomains/infoPlist. Old plan's A1 exception is obsolete. |
| C3 | All network base URLs are HTTPS | OSRM ro/es/flat `https://osrm*.defensivepedal.com` (`mapbox-routing.ts:43-48`), Mapbox `https://api.mapbox.com` (l.53), Cloud Run/Supabase env-injected https (`env.ts:57,60`), Open-Meteo/AQI https (`weather.ts`), Overpass https (`bicycle-*.ts`), PostHog `https://eu.i.posthog.com` (`env.ts:76`). Only `http://localhost` is in test files; one GPX XML-namespace string is not fetched. |
| C4 | Privacy page exists; support page does NOT | `apps/web/app/privacy/page.tsx` present; `apps/web/app/support/` absent. `apps/web/app/` has email-confirmed/account-deletion/terms/privacy only. |
| C5 | UGC moderation shipped | `useReportContent.ts` (targets comment/hazard/trip_share/profile; reasons spam/harassment/hate/sexual/violence/illegal/other), `useBlockUser.ts:21,34`, `app/blocked-users.tsx`. Guideline 1.2 satisfied. |
| C6 | App Store icon is RGBA with alpha → must flatten | PIL: `apps/mobile/assets/icon.png` → `RGBA (1024,1024)`, has_alpha True. |
| C7 | `ITSAppUsesNonExemptEncryption` missing | Zero grep matches in `apps/mobile/`. |
| C8 | `NSMotionUsageDescription` absent; `expo-sensors` present | Zero grep matches; `expo-sensors ~15.0.0` `package.json:44`. |
| C9 | Google iOS config absent | No `GIDClientID`/`iosUrlScheme`/`CFBundleURLTypes` in `app.config.ts`; `@react-native-google-signin/google-signin ^16.1.2` `package.json:22`. |
| C10 | AASA has `FILL_ME_TEAM_ID` ×3 | `apps/web/public/.well-known/apple-app-site-association` — mobile/preview/dev entries all placeholder. |
| C11 | Mapbox telemetry disabled | `RouteMap.tsx:57` + `offlinePacks.ts:25` `Mapbox.setTelemetryEnabled(false)`. |
| C12 | EAS iOS `.netrc` pre-build hook committed | `apps/mobile/eas/build/pre-build.sh:26-34` writes `~/.netrc` for `machine api.mapbox.com` on iOS. |
| C13 | `eas.json` `submit.ios` empty | `"ios": {}` under preview (l.41-42) and production (l.46-47). |
| C15 | Sign in with Apple NOT implemented | No `expo-apple-authentication`/`usesAppleSignIn`/`com.apple.developer.applesignin`/`signInWithApple` anywhere; not in `package.json`. |
| C16 | `review-prompt.ts` fallback is Play-Store-only | `review-prompt.ts:33-34` `PLAY_STORE_REVIEW_URL`; no `itms-apps://`/platform branch. |
| C17 | In-app account deletion exists & reachable | `app/delete-account.tsx` present; `profile.tsx:921` `router.push('/delete-account')`. Apple 5.1.1(v) satisfied. |
| C18 | No ATT prompt in codebase | No `NSUserTrackingUsageDescription`/`AppTrackingTransparency`/`requestTrackingAuthorization`. |
| C19 | No `BackHandler`/`hardwareBackPress` | Zero matches in `apps/mobile/app/` — iOS swipe-back must work natively. |

## CORRECTIONS

1. **Master plan §4 cites only the web account-deletion page for Guideline 5.1.1.** Apple requires *in-app* deletion; a web page alone is insufficient. The requirement IS satisfied because `app/delete-account.tsx` exists and is reachable from `profile.tsx:921`, but the doc's evidence pointer should point at the in-app screen. **Severity: LOW** (feature exists; only the citation is wrong).
2. `review-prompt.ts` fallback URL is on **line 34** (constant declared l.33). Minor.
3. Doc 02 §0 "verified RGBA" — independently re-confirmed correct.

## GAPS

| # | Gap | Severity |
|---|-----|----------|
| **GAP 1** | **`ios.usesAppleSignIn: true` is only in the §4 risk prose, not in the Phase A work-item table.** Without this key in `app.config.ts`, the `com.apple.developer.applesignin` entitlement is never injected into the provisioning profile and Sign in with Apple silently fails on device. Must be a tracked Phase A action alongside `expo-apple-authentication` + the equal-prominence Apple button on `auth.tsx`. | **BLOCKER** |
| **GAP 2** | **iOS Privacy Manifest (`PrivacyInfo.xcprivacy`) deferred to post-build with no required-reason API checklist.** Apple auto-rejects *uploads* (pre-review, at binary validation) for missing required-reason entries since 2024. Likely categories: NSUserDefaults (secure-store/async-storage), FileTimestamp (RN bundler), disk-space (Mapbox tile cache via expo-file-system). Third-party SDKs (@rnmapbox/maps, posthog-react-native, @sentry/react-native) must ship their own manifests or the app-level manifest must declare the reasons. Add a Phase B checklist. | **HIGH** |
| **GAP 3** | `UIBackgroundModes: ['location','processing','remote-notification']` is correct but no doc marks `remote-notification` as **required & not-removable** for Expo Push background delivery. | MEDIUM |
| **GAP 4** | `review-prompt.ts:61` calls `Linking.openURL(PLAY_STORE_REVIEW_URL)` unconditionally on the fallback path — opens a Play Store URL on iPhone. Needs a `Platform.select` branch by Phase C (can land immediately with a placeholder before the Apple app ID exists). | MEDIUM |
| **GAP 5** | No iOS `resourceClass` in `eas.json` production profile; large asset bundle (~13 MB mascots + ~15 MB holo PNGs) may want `"ios": { "resourceClass": "m-medium" }`. First build likely fine. | LOW |
| **GAP 6** | `expo-speech ~55.0.8` (`package.json:50`) omitted from doc 01's native-module table — harmless: `AVSpeechSynthesizer` needs no iOS usage string. | LOW |

## Policy completeness

| Policy | In plan? | Assessment |
|--------|----------|------------|
| Sign in with Apple (4.8) | Yes (B5, §4) | Blocker correctly identified; exemption reasoning sound (Google = third-party social login triggers 4.8; email/password + anonymous do not exempt it). Missing entitlement key → GAP 1. |
| iOS Privacy Manifest | Yes (risk register) | Acknowledged but no required-reason checklist → GAP 2. |
| Background location (5.1.1) | Yes | Strings present; `UIBackgroundModes:['location']` confirmed. Add review-note narrative. |
| Export compliance | Yes (B4) | `ITSAppUsesNonExemptEncryption:false` correctly flagged missing. |
| ATT (no prompt) | Yes | Verified correct — no ad SDKs/IDFA, AD_ID blocked, Mapbox telemetry off. |
| UGC moderation (1.2) | Yes | Already satisfied in code. |
| Account deletion (5.1.1) | Partially | In-app screen exists; doc citation imprecise (CORRECTION 1). |
| Minimum functionality (4.2) | Yes | Rich app; not a concern. |
| Demo account for review | Yes (USER task 13) | Correctly flagged. |

## Verdict

Plan is **directionally sound and actionable**; specialist audits are well-researched and codebase claims are accurate. **1 genuine BLOCKER** (GAP 1 — add `ios.usesAppleSignIn: true` to the Phase A table) and **1 HIGH** (GAP 2 — Privacy Manifest checklist in Phase B). The three critical fixes (icon alpha, `ITSAppUsesNonExemptEncryption`, `NSMotionUsageDescription`) are real and correct. ATS clean bill verified. Install-referrer guard confirmed.

**Required before Phase A starts:** add `ios.usesAppleSignIn: true` to the Phase A `app.config.ts` work items; add a Privacy Manifest review checklist to Phase B. *(Both folded into `ios-app-store-release.md` after this review.)*
