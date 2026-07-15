# Error Log

Recurring mistakes and lessons learned during development. Reference this file before making changes to avoid repeating past errors.

## Build & Bundle Errors

### 1. Missing imports cause blank screen
**Pattern:** Using a variable (e.g., `brandColors`) without importing it. Metro bundles successfully but the app crashes at runtime with "Property X doesn't exist".
**Fix:** Always verify imports when using design tokens or utility functions in a file for the first time.
**Occurrences:** brandColors in navigation.tsx, SafeAreaView in community-feed.tsx

### 2. Top-level `import *` of native modules crashes app
**Pattern:** `import * as Notifications from 'expo-notifications'` at the top level crashes if the native module isn't in the APK or isn't initialized yet.
**Fix:** Use lazy `require()` inside a try/catch at call-time, not top-level imports. Wrap in setTimeout for initialization delay.
**Occurrences:** expo-notifications in NotificationProvider

### 2b. `require()` guard alone is not enough for native modules
**Pattern:** Wrapping `require('expo-notifications')` in try/catch silences import errors, but the JS module itself may load fine while the native bridge is absent. Any subsequent call (e.g. `N.setNotificationHandler()`) then throws "Cannot find native module 'ExpoPushTokenManager'" — outside the try/catch, logged visibly in dev overlay.
**Fix:** Detect the native module BEFORE calling `require()`. If absent, return null immediately. The try/catch is a secondary safety net.
> ⚠️ **DO NOT use `NativeModules.ExpoPushTokenManager` for this check — see #21.** That was the original guidance here and it is wrong under the New Architecture (bridgeless), which the preview/production variants run. expo-notifications registers via the Expo Modules API, so the legacy `NativeModules` bridge entry is always `undefined` on release builds — the guard returns false and silently disables ALL notifications (no permission prompt, no scheduled pings) while still working on the dev variant's old-arch bridge. Use the shared helper `apps/mobile/src/lib/notificationNativeModule.ts` (`hasNotificationsNativeModule()`), which probes via `requireOptionalNativeModule` from `expo-modules-core` and is arch-independent.
**Occurrences:** push-notifications.ts + NotificationProvider.tsx on dev builds without native rebuild (2026-04-06); silent notification failure on every preview/production build until v0.2.59 (2026-05-21) — the `NativeModules` guard masked the morning weather ping entirely on bridgeless.

### 3. Debug APK overwritten by release APK
**Pattern:** Installing a release APK with the same package name (`com.defensivepedal.mobile.dev`) overwrites the debug build. The release build ignores Metro and uses embedded JS — code changes via hot reload stop working. No dev menu appears on shake.
**Fix:** Check with `adb shell input keyevent 82` (dev menu test). If no menu, rebuild and reinstall debug APK.
**Occurrences:** Multiple times after preview APK installs

### 4. Windows 260-char path limit breaks CMake builds
**Pattern:** Android native builds fail with "Filename longer than 260 characters" when the project path is long (e.g., `C:\Users\Victor\Documents\1. Projects\...`).
**Fix:** Build from a short path (`C:\dpb` or `C:\dev\defpedal`). Use robocopy to copy project, then `npm install --legacy-peer-deps`, then `expo prebuild --platform android && cd android && ./gradlew assembleRelease`.
**Occurrences:** Every native rebuild attempt from the original path

### 5. Missing `react-refresh` or `react-dom` after project copy
**Pattern:** Copying project to a new directory and running `npm install` sometimes leaves Metro dependencies incomplete. Bundle fails with "Cannot find module 'react-refresh/babel'" or "react-dom/client".
**Fix:** Run `npm install react-refresh react-dom --legacy-peer-deps` after copying to a new path.
**Occurrences:** After moving project to C:\dev\defpedal

### 35. ESLint `eslint-disable-next-line` directive referencing an unregistered rule fails CI lint-ratchet
**Pattern:** Writing an inline directive like `// eslint-disable-next-line react-hooks/exhaustive-deps` for a rule that is **not** registered in this project's ESLint config produces an ESLint error of its own (`Definition for rule 'react-hooks/exhaustive-deps' was not found`). The repo runs a `lint-ratchet` script (`apps/mobile/scripts/lint-ratchet.mjs`) in CI that compares each file's violation count against a baseline; one extra violation = `+1 regression` and CI fails. The local pre-push hook (until 2026-05-01) only ran `npm run typecheck`, so the bad directive shipped to origin and only blew up minutes later in GitHub Actions.

This repo's ESLint config does **not** include `eslint-plugin-react-hooks` — both `react-hooks/exhaustive-deps` AND `react-hooks/rules-of-hooks` are unregistered. A disable directive for either becomes its own lint error.

**Fix:**
1. **Don't add disable directives for rules you haven't confirmed are active.** Before writing `// eslint-disable-next-line some-rule`, run `npx eslint <the-file>` first — if no violation appears for that rule, the rule isn't on, so don't write the directive (it'll error on its own).
2. **An empty `useEffect` dep array doesn't need silencing in this project.** Without `react-hooks/exhaustive-deps`, ESLint won't warn about missing deps. Just write a plain comment explaining the intent if needed.
3. **Run `npm run lint:mobile:check` from the repo root before pushing.** The pre-push hook (`.git/hooks/pre-push`) was extended on 2026-05-01 to run lint alongside typecheck, mirroring what CI does. The hook source of truth is tracked at `scripts/git-hooks/pre-push`; install it on a fresh clone with `bash scripts/install-git-hooks.sh` (idempotent — re-run after any change to the tracked template).
4. **Recovery path if CI has already failed:** edit the file to remove the directive, run `npm run lint:mobile:check` to confirm green, commit + push.

**Occurrences:** Commit `146b205` (2026-05-01) — `// eslint-disable-next-line react-hooks/exhaustive-deps` in `apps/mobile/app/onboarding/choose-username.tsx` failed CI; pre-push hook only ran typecheck so the bad directive landed on origin/main. Fixed in `a73845f` by dropping the directive (kept the explanatory comment about the empty dep array). Hook extended to also run `npm run lint:mobile:check` in the same session.

## State & Data Errors

### 6. Zustand persist hydration race condition
**Pattern:** After `startNavigation()` sets in-memory state to `NAVIGATING`, Zustand persist hydrates from AsyncStorage with old state (e.g., `IDLE`), causing the route guard to redirect back to route-planning.
**Fix:** `useRouteGuard` now locks with `hasPassedRef` — once the guard passes, it stays passed regardless of subsequent state changes.
**Occurrences:** Navigation screen bouncing back 1-3 seconds after starting

### 7. Persisted store has stale keys after schema change
**Pattern:** Adding new store fields (e.g., `bikeParking`, `bikeRental`) — old persisted state doesn't have these keys, so `poiVisibility?.newKey` is `undefined`. Conditional rendering based on `undefined` works (falsy) but can cause subtle bugs.
**Fix:** Clear app data with `adb shell pm clear com.defensivepedal.mobile.dev` after store schema changes. Or add migration logic in Zustand `onRehydrateStorage`.
**Occurrences:** POI toggles not working after adding new categories

### 8. `DEFAULT_ROUTE_REQUEST` with hardcoded destination
**Pattern:** The initial route request had a hardcoded Bucharest destination, causing the map to always center there on first load instead of user's GPS.
**Fix:** Set destination to `{ lat: 0, lon: 0 }` placeholder. Skip hooks when coords are `0,0`.
**Occurrences:** Map centering on wrong location

## API & Server Errors

### 9. Dev bypass user ID is not a UUID
**Pattern:** `DEV_AUTH_BYPASS_USER_ID=dev-user` in `.env` is not a valid UUID. Supabase queries with `user_id = 'dev-user'` fail with "invalid input syntax for type uuid".
**Fix:** Use a real UUID for the dev bypass user ID, or ensure queries handle non-UUID gracefully.
**Occurrences:** Trip history, feedback endpoints returning 401/500

### 10. Supabase service role key placeholder
**Pattern:** `.env` had a placeholder `SUPABASE_SERVICE_ROLE_KEY` that lacked permissions. Risk segment queries failed silently with "permission denied for table road_risk_data".
**Fix:** Use the real service role key from Supabase dashboard.
**Occurrences:** Risk segments returning empty arrays

### 11. `routes.put()` is not a function in Fastify
**Pattern:** Declaring routes outside the Fastify plugin closure (`routes.put` instead of inside `async function(fastify)` where `fastify.put` works).
**Fix:** All route declarations must be inside the async plugin function passed to `app.register()`.
**Occurrences:** API server crash on startup after adding push token routes

## Map & UI Errors

### 12. Mapbox conditional layer mount/unmount doesn't work
**Pattern:** Conditionally rendering `<Mapbox.ShapeSource>` children (mount when on, unmount when off) causes layers to persist visually even after unmounting. Mapbox's native renderer caches the features.
**Fix:** Always render all layers. Use `key={visibility ? 'on' : 'off'}` prop on ShapeSource to force remount, or use filter-based hiding with `['==', ['get', 'maki'], '__off__']`.
**Occurrences:** POI markers persisting after toggle off, parking/rental not disappearing

### 13. Emoji in Mapbox SymbolLayer textField don't render on Android
**Pattern:** Setting `textField: '💧'` or other emojis in a Mapbox SymbolLayer produces invisible labels on Android.
**Fix:** Use plain text characters (W, B, WC, S, T, +, P, R) instead of emoji. White text on colored circle background.
**Occurrences:** POI icons not visible after switching to emoji

### 14. Overpass API rate limiting
**Pattern:** Multiple Overpass queries (parking + rental + lanes + shops) in rapid succession hit the rate limit. Server returns HTML error page instead of JSON.
**Fix:** Use Mapbox vector tiles (`mapbox.mapbox-streets-v8`) for POI/lane data where possible — zero API calls, no rate limits. Reserve Overpass for data not in Mapbox (specific OSM tags).
**Occurrences:** Bike lanes not loading, intermittent empty results

### 15. SafeAreaView from react-native is iOS-only
**Pattern:** `SafeAreaView` from `'react-native'` does nothing on Android. Content overlaps status bar and system navigation buttons.
**Fix:** Use `useSafeAreaInsets()` from `'react-native-safe-area-context'` and apply as `paddingTop: insets.top`, `paddingBottom: insets.bottom`.
**Occurrences:** All screens before the safe area fix

## Port Forwarding & USB

### 16. Blank screen after USB disconnect/reconnect
**Pattern:** Phone disconnects from USB, port forwarding (`adb reverse tcp:8081 tcp:8081`) is lost. App shows blank screen because it can't reach Metro.
**Fix:** Run `adb devices && adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8080 tcp:8080` after every reconnect. Force close and reopen app.
**Occurrences:** Every USB disconnection (dozens of times)

### 17. Metro not running after node processes killed
**Pattern:** `taskkill //F //IM node.exe` kills Metro. Next app open shows blank screen. `curl http://localhost:8081/status` returns nothing.
**Fix:** Restart Metro: `cd apps/mobile && npx expo start --clear`. Wait for "Waiting on http://localhost:8081" before opening app.
**Occurrences:** After every Metro restart

### 18. Cloud Run serves old code after `gcloud builds submit`
**Pattern:** `gcloud builds submit` builds and pushes a new Docker image, but Cloud Run keeps serving the old revision. The new endpoints return 404.
**Fix:** After `gcloud builds submit`, you MUST also run `gcloud run deploy defpedal-api --image <image-url> --region europe-central2 --platform managed --allow-unauthenticated` to create a new revision. Verify with `gcloud run revisions list --service defpedal-api --region europe-central2`.
**Occurrences:** CO2 stats endpoint deployment (2026-04-02)

### 20. Stale closures in `useRef(PanResponder.create(...))`
**Pattern:** `PanResponder.create({...})` is passed to `useRef()`, so it runs once on mount. Any variables captured in the `onPanResponderMove` / `onPanResponderRelease` closures reflect the *first render* values only, even if those variables change on later renders (e.g. a height derived from an async prop like `peekContent`).
**Fix:** For values that change after mount, use a ref (`const myRef = useRef(initialValue); myRef.current = currentValue`) and read `myRef.current` inside the PanResponder callbacks instead of the captured variable.
**Occurrences:** MapStageScreen `CollapsibleSheet` peek state — `effectiveCollapsed` was 48 on first render (before route loaded), panResponder captured that value, so swiping down ignored the peek height after route data arrived (2026-04-06)

### 21. Supabase embedded joins require direct FK
**Pattern:** Using PostgREST embedded resource syntax `profiles(display_name, avatar_url)` in a Supabase select requires a direct FK from the source table to the target. If both tables reference `auth.users` independently (e.g., `feed_comments.user_id → auth.users` and `profiles.id → auth.users`), there's no direct FK between them — the join silently fails or returns a 502.
**Fix:** Use two separate queries instead: (1) fetch the source rows, (2) batch-fetch profiles by user IDs with `.in('id', userIds)`, (3) merge in application code.
**Occurrences:** GET /feed/:id/comments returned 502 — comments never visible (2026-04-06)

### 22. Fastify response schema strips undeclared fields silently
**Pattern:** When a Fastify route has `additionalProperties: false` in its response schema, any fields returned by the handler that aren't listed in `properties` are silently removed from the response. The client receives the response with missing fields and no error.
**Fix:** When adding new fields to a handler response, ALWAYS add them to the JSON Schema `required` array and `properties` object too. Check all response schemas after modifying handler return values.
**Occurrences:** Impact dashboard missing totalMicrolives + totalCommunitySeconds (2026-04-06); guardian tier removal broke GET /profile (2026-04-05)

### 23. useRef values used across renders must be cleared on unmount
**Pattern:** A `useRef<Set<string>>` or similar mutable ref that accumulates state during a session (e.g., dismissed hazard IDs) persists its contents even after the component unmounts and remounts. Starting a new navigation session reuses the old ref contents, suppressing alerts that should fire.
**Fix:** Clear ref contents in a useEffect cleanup: `useEffect(() => { return () => { myRef.current.clear(); }; }, []);`
**Occurrences:** dismissedHazardIdsRef in navigation.tsx persisted across rides (2026-04-06)

### 24. Gradle build cache produces APK with stale JS bundle
**Pattern:** After syncing source files to C:\dpb via robocopy, `./gradlew assembleRelease` produces an APK containing the OLD JS bundle. Gradle's file hash cache (`.gradle/`) doesn't detect robocopy changes and marks the bundle task as `UP-TO-DATE`.
**Fix:** Always delete `app/build/generated/assets/`, `app/build/intermediates/assets/`, and `app/build/outputs/` before building. Use `npm run build:preview:install` which automates this.
**Occurrences:** Post-ride impact changes not appearing in preview APK (2026-04-10)

### 25. Release APK installs as dev variant
**Pattern:** `build.gradle` hardcodes `applicationId 'com.defensivepedal.mobile.dev'` with no product flavors. `assembleRelease` produces `com.defensivepedal.mobile.dev` which overwrites the debug dev app. The app.config.ts variant system (development/preview/production) is not reflected in Gradle.
**Fix:** Open "Defensive Pedal Dev" after installing a release APK from C:\dpb — it has the embedded bundle. The bridgeless dev-client Metro loading issue makes this the reliable testing path.
**Occurrences:** Preview APK not showing as separate app on phone (2026-04-10)

### 26. Google sign-in shows blank screen on Android (Chrome Custom Tab doesn't close)
**Pattern:** After selecting a Google account, the `oauth-redirect` edge function responds with a 302 to an Android intent URI. The intent successfully launches the app and delivers the deep link, but the Chrome Custom Tab stays open showing a blank white page. `signInWithGoogle()` blocks at `await WebBrowser.openAuthSessionAsync(...)` waiting for the tab to dismiss, so the PKCE code exchange never runs until the user manually swipes the tab away.
**Fix:** Call `WebBrowser.dismissBrowser()` in `resolveOAuthCallback()` immediately after the deep link resolves. This programmatically closes the Custom Tab, unblocking `openAuthSessionAsync`.
**Occurrences:** Google OAuth sign-in on Android (2026-04-11)

### 27. Preview APK uses wrong OAuth scheme (intent goes to dev app)
**Pattern:** The preview APK's JS bundle used scheme `defensivepedal-dev` instead of `defensivepedal-preview` because `APP_VARIANT=development` in `C:\dpb\apps\mobile\.env`. After Google auth, the edge function's intent URI targeted the dev app. Additionally, the AndroidManifest.xml (from prebuild) only had the `defensivepedal-dev` scheme, so even with the correct JS scheme, the intent filter wouldn't match.
**Fix:** (1) Build script now sets `APP_VARIANT` to match the Gradle flavor. (2) Build script patches AndroidManifest.xml to add the correct scheme per flavor. (3) Never run `expo prebuild` on C:\dpb — it overwrites source files. Patch the manifest directly instead.
**Occurrences:** Preview APK Google sign-in showing "item not found" (2026-04-11)

### 19. Dev app points to production API, not localhost
**Pattern:** `.env` has `EXPO_PUBLIC_MOBILE_API_URL` pointing to Cloud Run production URL. Changes to API code aren't visible until deployed to Cloud Run, even though a local API server is running on port 8080.
**Fix:** Either deploy API changes to Cloud Run before testing, or temporarily switch .env to `http://localhost:8080` for local testing (requires `adb reverse tcp:8080 tcp:8080`).
**Occurrences:** CO2 feature testing (2026-04-02)

### 20. Dev and release builds have different icons/resources
**Pattern:** The `C:\dpb` short-path copy used for preview/production builds has its own `android/app/src/main/res/` directory. Changing icons, manifest, or resources in `C:\dev\defpedal` only affects dev builds. Release builds from `C:\dpb` keep stale resources until explicitly synced.
**Fix:** `build-preview.sh` now syncs the entire `android/app/src/` tree via `robocopy --MIR`. If you ever add files outside `android/app/src/` or `android/app/build.gradle`, add them to the sync section in the script.
**Occurrences:** App icon mismatch between dev and production (2026-04-16), missing AndroidManifest cleartext flag (2026-04-15), missing google-services.json preview entry (2026-04-15)

### 21. Expo native module detection — use requireOptionalNativeModule, not NativeModules
**Pattern:** Expo SDK 55 modules (expo-image-picker, expo-haptics, expo-notifications, etc.) register via Expo Modules API (`globalThis.expo.modules`), NOT the classic React Native `NativeModules` bridge. Checking `NativeModules.ExpoImagePicker` always returns `undefined` even when the module is installed. **This is architecture-dependent:** the dev variant runs old-arch (bridge mode), where some Expo modules' compat shims happen to populate `NativeModules`, so the wrong check appears to work; the preview/production variants run the New Architecture (bridgeless), where `NativeModules.Expo*` is always `undefined`. A `NativeModules`-based guard therefore passes on dev and silently fails on every release build — the worst kind of bug to catch, because it works on the device you're testing on.
**Fix:** Use the shared primitive `hasExpoNativeModule(name)` from `apps/mobile/src/lib/expoNativeModule.ts` — it wraps `requireOptionalNativeModule` from `expo-modules-core` (returns the module or `null`, never throws), with a legacy-bridge fallback and a try/catch so it degrades to `false` in non-native runtimes (e.g. vitest under node, where an unmocked `expo-modules-core` import throws a `__DEV__` reference error). This is the ONE primitive for any Expo native-module presence check — do not hand-roll `NativeModules.Expo*`. Pass the module's *registered* name, often different from the package name (`ExponentImagePicker` not `ExpoImagePicker`; expo-notifications uses `ExpoPushTokenManager`/`ExpoNotificationPresenter`; expo-haptics uses `ExpoHaptics` — confirm via the module's Android/iOS `Name("…")` declaration). Canonical examples: `notificationNativeModule.ts` (delegates to `hasExpoNativeModule`), `haptics.ts` + `useHaptics.ts` (`'ExpoHaptics'`), `profile.tsx` (`'ExponentImagePicker'`), `shareImage.ts` (async-import variant).

> **Expo vs community/core distinction (confirmed by the 2026-05-21 sweep):** This bug is *specific to Expo Modules API modules*, which live in their own registry (`globalThis.expo.modules`) and are NEVER in `NativeModules`. **Community RN native modules (TurboModules like RNCNetInfo, RNViewShot) and core RN modules (I18nManager, SettingsManager) ARE exposed through `NativeModules` by the bridgeless interop proxy**, so guarding *those* on `NativeModules.<Name>` is correct — do NOT "fix" them with `hasExpoNativeModule` (it only knows the Expo registry). For community TurboModules, `TurboModuleRegistry.get('<Name>')` is the belt-and-suspenders companion check (see `OffScreenCaptureHost.tsx`). Rule of thumb: npm package starts with `expo-` → `hasExpoNativeModule`; anything else → `NativeModules` / `TurboModuleRegistry`.
**Occurrences:** Profile photo upload silently disabled (2026-04-16); all notifications silently disabled on preview/production — no permission prompt, no morning weather ping — until v0.2.59 (2026-05-21); haptics silently dead on every release build until v0.2.61 (2026-05-21, same root cause, found by sweeping for sibling guards). See #2b.

### 22. expo-image-picker must be in mobile workspace package.json
**Pattern:** Dependencies in the root `package.json` are available to JS `require()` but Expo autolinking only reads the workspace `apps/mobile/package.json` to decide which native modules to compile. A module in root-only won't be linked into the native build.
**Fix:** Always `cd apps/mobile && npm install <package>` for native Expo modules, not `npm install` at root.
**Occurrences:** expo-image-picker installed at root but not linked into APK (2026-04-16)

### 23. @react-native-community/netinfo throws invariant before try/catch can catch
**Pattern:** `require('@react-native-community/netinfo')` evaluates the module's top-level code, which throws `NativeModule.RNCNetInfo is null` if the native module isn't compiled into the APK. This invariant throw escapes `try/catch` around `require()` in some RN runtimes.
**Fix:** Check `NativeModules.RNCNetInfo` from `react-native` BEFORE calling `require('@react-native-community/netinfo')`. If null, skip the require entirely and fall back to `isOnline: true`. This is the same pattern as error #2b but for a community (non-Expo) native module — use `NativeModules` directly (not `requireOptionalNativeModule` which is Expo-only).
**Occurrences:** ConnectivityMonitor.tsx blank screen on dev build without native rebuild (2026-04-16)

### 24. Expo `app.config.ts` `android.blockedPermissions` is silently ignored when prebuild is not part of the build pipeline
**Pattern:** Expo's `android.blockedPermissions` config emits `<uses-permission ... tools:node="remove"/>` directives — but only when `expo prebuild` regenerates `android/`. This project ships with a checked-in `android/` folder and the build pipeline (`scripts/build-preview.sh`, `npm run bundle:production`) never runs `expo prebuild`, so anything declared in `blockedPermissions` after the last prebuild run is silently inert. The packaged manifest can still contain the permission you "blocked" months ago. Concretely: `com.google.android.gms.permission.AD_ID` was listed in `blockedPermissions` but still shipped in v0.2.20's AAB because the source manifest at `apps/mobile/android/app/src/main/AndroidManifest.xml` did not have a corresponding remove directive.
**Fix:** Two-layer pattern. (1) Keep the entry in `app.config.ts` `blockedPermissions` as the source-of-truth — when someone runs `expo prebuild` it gets re-applied automatically. (2) Also write the directive directly into `apps/mobile/android/app/src/main/AndroidManifest.xml`: `<uses-permission android:name="..." tools:node="remove"/>`. The `tools:` namespace is already declared on the `<manifest>` element. Verify with `manifest-merger-<variant>-report.txt` that the library contributions are marked `REJECTED`. Caveat: the source manifest is `.gitignore`d (`/android` rule), so the manifest edit cannot be committed — the durable answer always lives in `app.config.ts`. Verify after a release build by grepping `app/build/intermediates/packaged_manifests/.../AndroidManifest.xml` for the permission name.
**Occurrences:** AD_ID permission shipped in v0.2.18–v0.2.20 AABs despite being listed in `blockedPermissions`; discovered during Play Store closed-testing prep (2026-04-25). Fixed in v0.2.21.

### 28. SECURITY DEFINER triggers on auth.users need explicit search_path
**Pattern:** `public.handle_new_user()` is a trigger on `auth.users` that mirrors new rows into `public.profiles`. It is SECURITY DEFINER but has no `SET search_path` clause, so when GoTrue executes the signup INSERT its search_path is `auth, pg_catalog` — the unqualified `profiles` reference in the trigger body fails with `relation "profiles" does not exist (SQLSTATE 42P01)`. GoTrue surfaces this to the client as a generic 500 "Database error saving new user" (error_code=unexpected_failure).
**Fix:** `ALTER FUNCTION public.handle_new_user() SET search_path = public, auth, pg_temp` — pin the function search_path so references resolve regardless of the caller's context. Applies to every SECURITY DEFINER function that touches `public.*` tables. The Supabase linter flags this as `function_search_path_mutable` — always clear these warnings before shipping. See migration `2026041902_fix_handle_new_user_search_path.sql` and the bulk-hardening pattern in `202604120001_set_search_path_on_security_definer.sql`.
**Occurrences:** Email signup failing with 500 (2026-04-19)

### 29. BadgeDisplayTab union is strict — unknown tab values crash Trophy Case
**Pattern:** `BadgeDisplayTab` in `packages/core/src/contracts.ts:773` is a closed union: `firsts | riding | consistency | impact | safety | community | explore | events`. The Trophy Case (`apps/mobile/app/achievements.tsx`) indexes into a tab-counter object keyed by exactly these 8 strings (`counts[item.badge.displayTab].total++`). Seeding a badge with any other value — e.g. the slice-3 ambassador seed initially used `display_tab='social'` — passes server-side schema validation but crashes the client with `TypeError: Cannot read properties of undefined (reading 'total')` the first time a user whose catalog includes that badge opens Trophy Case.
**Fix:** Only seed `category` + `display_tab` with values from the BadgeDisplayTab union. For community/social achievements like referral badges, use `'community'`. See `2026041903_ambassador_badges_use_community_tab.sql`. A stricter server-side schema (enum CHECK constraint on badge_definitions.display_tab) would catch this at write time — still TODO.
**Occurrences:** Fresh claimant account Trophy Case crash with ambassador_bronze present (2026-04-19)

### 31. Supabase Edge Functions cannot serve rendered HTML
**Pattern:** Any non-redirect response from a Supabase Edge Function gets wrapped by the gateway with `Content-Type: text/plain`, `Content-Security-Policy: default-src 'none'; sandbox`, and `X-Content-Type-Options: nosniff` — regardless of what the function sets. Browsers show raw HTML source instead of rendering. This is an anti-phishing/anti-abuse default on Supabase's edge runtime. Our first email-confirm function returned an HTML success page directly and desktop visitors saw raw source (em-dashes also double-decoded because the browser fell back to Windows-1252 after the charset mismatch).
**Fix:** Edge Functions should only return 302 redirects. For any branded HTML response, redirect to a static page on the web app (`routes.defensivepedal.com/email-confirmed`) or another host that controls its own headers.
**Occurrences:** email-confirm edge function desktop branch (2026-04-20)

### 32. PKCE code exchange relies on SecureStore — cross-device email confirmation won't auto-sign-in
**Pattern:** The Supabase JS client with `flowType: 'pkce'` stores the code_verifier in SecureStore during `signUp`. When the user clicks the confirmation link on the **same device**, `exchangeCodeForSession(code)` reads the verifier and completes the exchange. When the user clicks the link on a **different device** (e.g. desktop browser), the verifier isn't there and any attempted exchange fails. The account IS confirmed at the `/auth/v1/verify` step before the edge function is reached, so the user can sign in manually on the original device — but no session is established on the clicking device.
**Fix:** Accept cross-device confirmation as sign-in-on-original-device only. For desktop visitors, skip the exchange entirely and show a branded "Email confirmed, open the app on your phone" page (this is what `/email-confirmed` does). Do NOT attempt `verifyOtp` with a PKCE `code` — the parameter types are different and Supabase will return `One-time token not found`.
**Occurrences:** Email-confirm flow design (2026-04-20)

### 33. Foreign keys to auth.users need ON DELETE CASCADE or dashboard delete fails
**Pattern:** Many app tables reference `auth.users(id)` as a foreign key but omit `ON DELETE CASCADE`. The Supabase dashboard's "Delete user" button then throws a generic `Failed to delete selected users: Database error deleting user` because at least one child row blocks the delete.
**Fix:** Every FK to `auth.users(id)` should declare either `ON DELETE CASCADE` (user-owned data) or `ON DELETE SET NULL` (community data the app wants to keep without attribution, like hazards). Migration `202604200001_cascade_user_fks.sql` retrofits 14 constraints. Going forward, use `pg_constraint` + `pg_get_constraintdef` to audit new tables before shipping.
**Occurrences:** Test user delete blocked; required manual row cleanup across 14 tables before auth.users DELETE succeeded (2026-04-20)

### 34. Trip data fans out to four tables — deleting just one leaves orphans on community surfaces
**Pattern:** A completed ride writes to multiple Supabase tables that are read by different user-visible surfaces — the table that backs History is **not** the source of truth for the community surfaces:
- `trip_tracks` → History tab, per-period Stats Dashboard
- `trip_shares` → City Heartbeat aggregates (`get_city_heartbeat`), Community Stats (`get_community_stats`), Neighborhood Leaderboard ride counts (`get_neighborhood_leaderboard`), Community Feed (`get_nearby_feed`)
- `activity_feed` (with `payload->>tripId`) → unified social feed `get_ranked_feed` (own profile, follower feeds, suggested users)
- `trips` → lifecycle metadata only; not read by user-facing screens

A "delete trip" handler that only touches `trip_tracks` removes the ride from History + Stats but leaves the share/feed entries intact — the deleted ride still inflates community counters, still shows up on the leaderboard, still appears as a card on the Community Feed, and still shows on the user's social profile feed and their followers' feeds. The natural intuition "delete the row backing the UI I clicked" is wrong here because that UI ≠ the source of truth for the parallel UIs.

**Fix:** A user-driven trip deletion handler must scrub all three user-visible tables: `(a)` `DELETE FROM trip_tracks WHERE id = ? AND user_id = ?` with `.select('id, trip_id')` to atomically capture the parent `trip_id`, `(b)` `DELETE FROM trip_shares WHERE user_id = ? AND trip_id = parent_trip_id` (cascades `feed_likes` / `feed_comments` / `trip_loves` via existing FK rules), `(c)` `DELETE FROM activity_feed WHERE user_id = ? AND type = 'ride' AND payload->>tripId = parent_trip_id` (cascades `activity_reactions` / `activity_comments`). Short-circuit before `(b)` and `(c)` when `not_found` or when the deleted track had a `NULL` parent `trip_id` (legacy data). Do **not** unwind `profiles.total_*`, `ride_impacts`, `ride_microlives`, awarded badges, accumulated XP, or `leaderboard_snapshots` — those are immutable historical records and the confirm dialog is explicit that "past achievements and impact totals are kept". The same fan-out applies if anything else ever needs to "remove a ride" (privacy purge, retention policy, GDPR deletion subset). See `services/mobile-api/src/lib/submissions.ts:362` `deleteTripTrack`.
**Occurrences:** Initial `DELETE /v1/trips/:id` (commit `8c224ce`, 2026-04-28) only deleted `trip_tracks`; deleted rides lingered on City Heartbeat aggregates, the Community Feed, the Neighborhood Leaderboard, and follower Activity Feeds. Caught by the `/review diagnose community-trip-count-divergence` audit and fixed in commit `a25eba4` same session.

### 36. One-shot navigation locks (`hasNavigatedRef`) freeze a screen on re-focus
**Pattern:** A screen uses `const hasNavigatedRef = useRef(false)` to prevent double-firing of navigation from a single tap (set to `true` before `router.push`/`router.replace`, gates every handler with `if (hasNavigatedRef.current) return`). Works fine going forward. But when forward nav uses `router.push` (not `replace`), the screen is preserved in the stack underneath the pushed screen — same component instance. When the user presses system back, the underlying instance re-focuses with `hasNavigatedRef.current` still `true`. Every tap handler short-circuits silently, no state change fires, no re-render — the screen looks identical but is completely unresponsive. Reads as a hard freeze.

**Fix:** Reset the ref on every focus using `useFocusEffect` from `expo-router` (NOT `useEffect` — `useEffect` cleanup doesn't fire on push navigation since the screen stays mounted; only focus events do):
```ts
useFocusEffect(
  useCallback(() => {
    hasNavigatedRef.current = false;
  }, []),
);
```

Same diagnosis logic applies to ANY one-shot lock that should re-arm when the user re-enters a screen via stack pop. The Expo Router Stack does NOT unmount preserved screens, so any ref/state used as a "did this screen already do its thing" flag must explicitly reset on focus.
**Occurrences:** `apps/mobile/app/onboarding/goal-selection.tsx` — Goal advanced to `/onboarding/first-route` via `router.push`, leaving Goal preserved underneath. Pressing system back from first-route returned to Goal with every goal card silently no-op-ing. Fixed in commit `a6aa8c7` (2026-05-08); same defensive reset added to `safety-score.tsx`.

### 37. `adb reverse` can run at ~8 s per request even when raw USB transport is fast
**Pattern:** Dev variant shows blank Splash forever; logcat ends at `BridgelessReact: ReactHost{0}.loadJSBundleFromMetro()` and goes silent. Probing with `adb shell "curl http://127.0.0.1:8081/status"` returns ~8 s latencies for a 23-byte response, or times out outright. Meanwhile `adb shell echo hello` runs in 78 ms and `adb shell "dd if=/dev/zero bs=1M count=4 | wc -c"` runs at ~34 MB/s — raw USB/adb transport is healthy. The slowness is specific to the reverse port-forwarding pipe.

**Fix:** This is system-level interference, not project code. The 17 MB dev bundle simply cannot stream through an 8 s/request pipe. Things to try, in order:
1. **Replace the USB cable** — even if `adb shell` is fast, low-quality cables can degrade the kernel-level adb-reverse handshake.
2. **Check Windows Defender / corporate AV** — temporarily disable real-time protection and re-test. Some AV/firewall setups intercept the per-connection setup that `adb reverse` does.
3. **Restart the phone** — clears the on-device adb daemon state.
4. **Punt to preview build for testing.** `npm run build:preview` produces an embedded-bundle APK that doesn't need Metro at all. Push to Firebase App Distribution group `early-access-preview` and let testers install via the Firebase tester app.

**Do NOT bother with `adb tcpip 5555` over WiFi** — empirically tested and timed out worse than the broken USB reverse. Metro is bound to `0.0.0.0:8081` but Windows Firewall blocks external interfaces by default, so even `192.168.x.x:8081` from the same PC times out without a manual firewall rule.
**Occurrences:** 2026-05-08 dev-variant install round-trip stalled at `loadJSBundleFromMetro`; `adb shell` clean, reverse pipe degraded; preview build via Firebase used as the workaround.

### 38. Multi-ABI native build OOMs on Windows with default JVM args
**Pattern:** `./gradlew installDevelopmentDebug` (or any task that triggers `:app:configureCMake[*]` for all four `reactNativeArchitectures` — `armeabi-v7a,arm64-v8a,x86,x86_64`) crashes the Gradle daemon mid-build. Two flavors: (1) `# Native memory allocation (mmap) failed to map ... bytes ... 'The paging file is too small for this operation to complete' (DOS error/errno=1455)` — the 4 GB Gradle daemon plus a Kotlin daemon plus parallel CMake workers plus Metro plus IDEs/Chrome can exceed Windows's commit budget on a 16 GB / typical-pagefile machine. (2) Generic `Gradle build daemon disappeared unexpectedly` — `hs_err_pidNNNNN.log` next to the project's `android/` folder confirms the same OOM root cause.

**Fix:** Build for only the device's ABI and serialize workers. Pre-check with `adb shell getprop ro.product.cpu.abi` (modern Samsung/Pixel devices return `arm64-v8a`). Then:
```bash
./gradlew --stop
./gradlew installDevelopmentDebug \
  -PreactNativeArchitectures=arm64-v8a \
  --no-daemon --max-workers=1 \
  -Dorg.gradle.jvmargs="-Xmx3072m -XX:MaxMetaspaceSize=768m"
```
Slower (~3 min instead of parallel) but fits within the system commit budget. **Do not lower `MaxMetaspaceSize` below 768m** — KSP processing of `expo-updates` / `expo-manifests` blew through 512m in session 36. **Do not skip `--no-daemon`** when memory is tight — daemons accumulate and amplify commit pressure across runs.

If the OOM persists even with arm64-only + serial workers, the Windows pagefile is the bottleneck. System Properties → Advanced → Performance Settings → Advanced → Virtual memory → set to system-managed or 16+ GB.
**Occurrences:** 2026-05-08 — first crash with `errno=1455` during `configureCMakeDebug[arm64-v8a]`; second crash with daemon-disappeared during `mergeExtDexDevelopmentDebug`. Third attempt with the flags above succeeded in under 4 min total.

### 39. Don't assume a Postgres column exists from how it's used elsewhere — verify schema first
**Pattern:** Refactoring a Supabase route, I lifted the column list (`'id, persona, mia_journey_level, mia_journey_status, mia_total_rides, mia_rides_with_destination, mia_started_at, notify_mia, created_at, last_ride_at'`) from the previous handler and dropped the persona/mia fields, keeping `created_at` and `last_ride_at`. Cron returned 500. Logs: `column profiles.last_ride_at does not exist`. The previous handler must have been broken too, just never observed because it failed silently inside `notify_mia=true` filter that returned an empty set. Any handler that "always worked" with a non-existent column simply never got to the point of selecting it.

**Fix:** Before reusing a column list from existing code, verify each column actually exists in the live schema (`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='last_ride_at'`). When the column is missing, source the value from a related table — for "last activity" timestamps, the canonical source is the originating event table:
```sql
SELECT ended_at FROM trips
 WHERE user_id = $1 AND ended_at IS NOT NULL
 ORDER BY ended_at DESC LIMIT 1
```

Same lesson applies to any "denormalized aggregate" column you assume exists on `profiles` (`total_rides`, `last_ride_at`, `streak_count`) — these are convenience fields maintained by triggers/cron, and the trigger may have been removed without the column being dropped, or the column may have been planned but never added. Always verify in `information_schema.columns` before depending on them in a new handler.
**Occurrences:** 2026-05-10 — first run of the new `firstRideNotifications` cron returned 500 immediately after Cloud Run deploy of revision `defpedal-api-00076-jt8`. Fixed by computing `last_ride_at` from `trips` per user in commit `61ccda4`; redeployed as revision `defpedal-api-00077-xj7`; manual cron run logged `evaluated=183, notified=92`.

### 30. TanStack Query keys and persisted Zustand state leak across account switches
**Pattern:** Query keys in `useBadges`, `useTiers`, `useMiaJourney`, `useLeaderboard` etc. are not user-scoped (`['badges']` not `['badges', userId]`). When user A signs out and user B signs in, the cached responses remain under the shared key until each query happens to refetch. Simultaneously, the Zustand persist whitelist keeps user-scoped projections (`cachedImpact`, `cachedStreak`, `earnedMilestones`, `pendingBadgeUnlocks`, `pendingTierPromotion`, `persona`, `mia*`, `queuedMutations`, `tripServerIds`, `activeTripClientId`, `navigationSession`, `routeRequest`, `routePreview`, `pendingTelemetryEvents`, `homeLocation`, `recentDestinations`, `pendingShareClaim`, `onboardingCompleted`, `cyclingGoal`, `anonymousOpenCount`, `ratingSkipCount`) — so even after TanStack Query refetches, the persist layer re-hydrates A's values on app restart.
**Fix:** Both layers must clear in lockstep on user-id change. `store.resetUserScopedState()` resets the persisted user-scoped fields while preserving true device preferences (theme, locale, voice, offline map packs, POI visibility, bike type, routing prefs, notify toggles). `UserCacheResetBridge` provider sits inside QueryClientProvider AND under AuthSessionProvider; tracks previous user id via `useRef` and fires `queryClient.clear()` + `resetUserScopedState()` on X→null (sign-out) and X→Y (account switch). Skips null→X (initial sign-in) and X→X (refresh-token rotation). When adding a new user-scoped query key or new persisted store field, update `resetUserScopedState()` to include it.
**Occurrences:** Account B surfaced account A's XP/tier/badges after sign-out + sign-in (2026-04-19)

### 40. `expo-splash-screen` plugin config is ignored in bare Android projects — and the native splash drawables can't be reverted via git

**Pattern:** Three compounding gotchas hit during the Pedal splash attempt (commit `77e7bb0` reverts it). All bite at the same time:

1. **`app.config.ts` plugins only apply during `expo prebuild`.** The `[expo-splash-screen, { backgroundColor, image, imageWidth, ... }]` entry parses cleanly via `npx expo config` and types correctly — but a direct `./gradlew installDevelopmentDebug` skips prebuild entirely. The native android/ folder keeps whatever splash drawables and `colors.xml` values it had before. The plugin entry becomes inert dead code until someone runs `expo prebuild`.

2. **`android/` is gitignored** (`.gitignore` line: `android`). The hand-tuned native config (firebase-analytics removal in `build.gradle`, foreground-service plugin manifest entries, splash drawables) is NOT tracked. So `git checkout` can't restore `res/values/colors.xml` or `res/drawable-*/splashscreen_logo.png` after a manual edit, and `git revert` only undoes the plugin entry in `app.config.ts` — not the native files. If you overwrite the original Expo placeholder `splashscreen_logo.png` files (one per density: hdpi/mdpi/xhdpi/xxhdpi/xxxhdpi) without a backup, they're **gone**. The only path back to factory defaults is `expo prebuild --clean`, which also wipes the rest of the hand-tuned native config — defeats the point.

3. **Android 12+ system splash enforces a circular icon mask** (~108 dp container, ~67% inner content area). Tall portrait illustrations like the mascot's 1080×1350 frame get cropped into a small circle no matter what you pass to `imageWidth` or `resizeMode`. The "rich animated splash" pattern that apps like Duolingo use is a **two-stage splash**: brief native flash → custom full-screen JS overlay component (e.g. `<PedalSplashOverlay>` playing a video via `expo-video`) that takes over after the JS bundle starts. The native splash can never be the rich one.

**Fix / prevention:**
- Before adding any `expo-splash-screen` plugin entry to `app.config.ts`, decide whether you'll run `expo prebuild` (and accept that it may overwrite hand-tuned native files) OR edit the native android/ res files directly. Don't add the plugin entry expecting it to "just work" on a bare project.
- Before overwriting any file in `android/app/src/main/res/`, **copy the original to a backup directory first** (e.g. `design-work/android-defaults/`). The `android/` folder is gitignored — this is your only insurance against losing factory defaults.
- For rich-splash UX, build a JS overlay component inside `_layout.tsx` (after `useFonts` loads) that fills the screen until your animation completes. Keep the native splash minimal (white background + plain app icon as `splashscreen_logo.png`). Don't fight the Android 12+ icon mask.
- The user-supplied `splash_video.mp4` lives at `design-work/mascot/splash_video.mp4` for any future overlay attempt; `expo-video` was uninstalled when the work was reverted, so reinstalling it is part of any retry.

**Occurrences:** 2026-05-11/12 — Pedal splash attempt (commit `7f40a5f`, reverted by `77e7bb0`). Phone showed Pedal cropped in a circle on dark-mode-black background (system splash, not the configured yellow) AND the JS overlay couldn't start because Metro was hung from a prior session, manifesting as a permanently-stuck splash. Three failure modes layered on top of each other made the issue hard to diagnose. After full revert, native splash returned to a white background with `assets/icon.png` as the placeholder logo (closest reachable approximation of the original Expo defaults without running `expo prebuild --clean`).

### 41. Mapbox `full_address` and `place_formatted` always contain postcode + country — never let them fall through to a user-visible label

**Pattern:** Both fields are the full country-level address (`"Strada Eroilor 42, 410093, Oradea, Bihor, România"`). They look like clean strings, so it's tempting to use them as a quick fallback for a label slot or as the source for a `secondaryText` line. The result overflows single-line text inputs, leaks postcode + country into the dropdown's muted secondary line, and makes the user unsure they picked the right place. `stripAddressNoise` cleans these strings IF `context.postcode` is populated, but Mapbox sometimes (a) omits `context.postcode` entirely on POI features and (b) concatenates the postcode with the city name (`"410093 Oradea"`) instead of comma-separating it — the structured strip misses both cases.

**Fix:**
- Build `secondaryText` purely from `context.{address.street_name, address.address_number, neighborhood.name, locality.name, place.name, region.name}`. Never fall back to `place_formatted` / `full_address` for known feature types — return an empty string instead and let the consumer decide.
- Run a defensive regex sweep on any address string before display: `/(?:^|\s)\d{4,7}(?=\s|$)/g` strips inline 4-7 digit postcodes, then drop bare-numeric segments entirely. See `stripAddressNoise` in `apps/mobile/src/lib/mapbox-search.ts`.
- For server-routed reverse geocode (`mobileApi.reverseGeocode` only returns `{ coordinate, label }`), use `splitDisplayLabel(label)` to split on the first comma: `primary = "Eroilor 42"`, `secondary = "Iosia, Oradea"`. Works because `stripAddressNoise` already produced a clean label.

**Occurrences:** 2026-05-18 — session 51 two-line pill UX. Discovered when the destination card after selection showed `"Strada Eroilor 42, 410093 Oradea, Bihor"` overflowing the search box; tester couldn't confirm the picked spot. Romanian addresses surface both the prefix-concatenation shape AND the missing-`context.postcode` shape. Tested fixes against 22 unit tests in `mapbox-search.test.ts`.

### 42. Vitest can't `require()` a static PNG — switch to ES `import` and declare the module type

**Pattern:** RN's asset resolver returns an opaque numeric handle for `require('./icon.png')`, and the existing mascot-poses token file uses that form (`mascotPoses.ts`). The first test file that transitively loads a token that `require()`s a PNG will crash with `SyntaxError: Invalid or unexpected token` pointing at the .png line. Vitest's bundler parses source as ESM and lets Node evaluate `require()` at runtime against its own loader — which tries to parse the binary as JS and fails.

`resolve.alias` (Vite's regex find-and-replace on import specifiers) doesn't help because it runs against ES `import` statements, not runtime `require()` calls. Writing a Vite plugin with `resolveId` + `load` hooks doesn't help either — Node's runtime require bypasses the bundler entirely.

**Fix (the one that actually works):**
1. **Switch the token file from `require()` to ES `import`** — e.g.
   ```ts
   import tunnelIcon from '../../../assets/map-icons/tunnel.png';
   // …
   export const icons = { tunnel: { iconImage: tunnelIcon, … } };
   ```
   Vite resolves ES imports at compile time via its own resolver, so the bundler can substitute the asset reference for a stub. Metro accepts both `import` and `require()` for static-asset references — the change is runtime-neutral on device.
2. **Declare the module type** in a `.d.ts` at workspace root (e.g. `apps/mobile/assets.d.ts`):
   ```ts
   declare module '*.png' { const content: number; export default content; }
   declare module '*.jpg' { const content: number; export default content; }
   declare module '*.svg' { const content: number; export default content; }
   ```
   Add to `tsconfig.json` `include` so tsc picks it up. Without this, tsc rejects `import x from './x.png'` as a missing module.
3. **(Optional, defense-in-depth)** Add a tiny `stubPngPlugin` to `vitest.config.ts` so any future `require()` of a PNG hits the bundler-side stub instead of Node's loader:
   ```ts
   const stubPngPlugin = (): Plugin => ({
     name: 'stub-png', enforce: 'pre',
     resolveId(source) { if (source.endsWith('.png')) return '\0stub-png'; return null; },
     load(id) { if (id === '\0stub-png') return 'module.exports = 1;'; return null; },
   });
   ```
   Harmless if nothing uses `require()` for PNGs; cushions the next addition.

**Pre-change checklist:**
- Adding a new image-bearing token? Use ES `import` for the asset, even if neighbouring files use `require()` — the ergonomic asymmetry is worth it for test-runnable tokens.
- The mascot pose file (`mascotPoses.ts`) currently still uses `require()` because nothing tests it. If a test ever loads it, migrate it to ES `import` rather than fighting the bundler.

**Occurrences:** 2026-05-19 — session 53 route-feature SDF icon swap. First token file with image assets that's also covered by a contract test. Cost ~25 minutes of dead-end attempts (alias regex, Vite plugin variants) before switching to ES `import` cleared everything in one move.

### 43. Scheduled local notifications drift past their target time on Android — this is expected, not a bug
**Pattern:** The daily 8:30am weather ping arrived at 8:44. `computeTriggerSeconds` targets 08:30:00 exactly, so the scheduling math is correct. The drift comes from the trigger TYPE: `expo-notifications` `timeInterval` triggers are delivered via Android **inexact alarms**, which the OS batches under Doze to save battery. 5–15 min of drift is normal for any scheduled local notification on Android.
**Fix:** None — accept the drift for non-time-critical pings. Do NOT reach for `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`: Play Store restricts those permissions to alarm-clock/calendar app categories, so a cycling app risks policy rejection. A `DAILY` trigger (`{ type: 'daily', hour, minute }`) fires closer to target and repeats without reopening the app, but it freezes the notification content between app opens — we deliberately keep the one-shot `timeInterval` + reschedule-on-open so each morning's forecast is fresh. See the "Notifications" section in CLAUDE.md.
**Occurrences:** 2026-05-21 — daily weather ping delivered ~14 min late; confirmed expected Android behavior, left as-is by decision.

### 44. Native Google Sign-In: Android OAuth client must live in the SAME GCP project as the web client, keyed by package + signing SHA-1
**Pattern:** Switched Google sign-in from the Supabase browser/PKCE flow to native `@react-native-google-signin/google-signin` + `supabase.auth.signInWithIdToken` (so the OS account picker shows instead of a Chrome Custom Tab branded `…supabase.co`). Two project-topology traps make this fail with a `DEVELOPER_ERROR` (status code 10) that gives no useful message:
1. **Wrong project.** The web client ID configured in the Supabase Google provider (`1081412761678-…`) belongs to GCP project `gen-lang-client-0895796477` (project# `1081412761678`, same as the Cloud Run API). The Firebase project `defensive-pedal` (project# `1070156882676`, from `google-services.json`) is a DIFFERENT project. The Android OAuth clients MUST be created in the web client's project (`gen-lang-client-0895796477`), NOT the Firebase one — Google only issues an ID token with `aud = webClientId` when it finds a matching Android client (package + SHA-1) in the project that owns that web client.
2. **Wrong/missing SHA-1.** An Android OAuth client is keyed by (package name, signing-cert SHA-1). This app has 3 packages and 3 signing identities: dev (`com.defensivepedal.mobile.dev`, debug.keystore SHA-1 `5E:8F:16:…:F6:25`), preview (`com.defensivepedal.mobile.preview`, upload keystore `0B:C4:30:…:FD:E0`), production sideload (`com.defensivepedal.mobile`, upload keystore), and **Play-distributed production** (`com.defensivepedal.mobile`, **Play App Signing** SHA-1 from Play Console → Setup → App signing — NOT the upload key). Each combo needs its own Android OAuth client or sign-in throws code 10 on that build.
**Fix:** `webClientId` = the existing Supabase web client (so its audience is already trusted by `signInWithIdToken` — no Supabase "Authorized Client IDs" change needed). Wired via `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` → `app.config.ts` extra → `mobileEnv.googleWebClientId`. `google-services.json` is irrelevant to google-signin (it's only for FCM/push) — the empty `oauth_client: []` arrays there are a red herring. No `expo prebuild` / config plugin needed for Android; RN autolinking links the native module. Implementation in `apps/mobile/src/lib/supabase.ts` `signInWithGoogle` (lazy `require()` per native-module convention; returns `{ error, cancelled? }`). A native-module addition requires an APK rebuild (`./gradlew installDevelopmentDebug`) — the JS bundle resolves fine but the native lib isn't in the previously-installed APK.
**Occurrences:** 2026-05-21 — migrated to native sign-in to remove the `uobubaulcdcuggnetzei.supabase.co` branding from the Google account picker.

### 45. TurboModule `getEnforcing` escapes a try/catch that wraps only `require()`
**Pattern:** A community native module that registers via the New Architecture (e.g. `@react-native-google-signin/google-signin` → `RNGoogleSignin`) is accessed through a TurboModule proxy. The proxy lazily calls `TurboModuleRegistry.getEnforcing('<BridgeName>')` the first time you READ a property on it — NOT when `require()` returns. If the native lib isn't linked (typical after adding a new dependency without rebuilding the APK), that read throws `Invariant Violation: TurboModuleRegistry.getEnforcing(...): 'X' could not be found`. A `try { require(...) } catch {}` wrapped only around the import line does NOT catch this — `require` returns the module object cleanly; the throw fires later, on the destructure / property access that comes after.
**Symptom (the misleading one):** the throw surfaces as a yellow LogBox warning toast at the bottom of an otherwise-rendering screen, which can read as "the app is stuck at a loading screen" because the toast covers the screen's primary CTA. The screen actually rendered fine.
**Fix:** Pull the destructure / property access INSIDE the same try/catch as the `require`, so any TurboModule wakeup during access is caught and you can return a clean "unavailable in this build" error. Concretely (see `apps/mobile/src/lib/supabase.ts` `signInWithGoogle`):
```ts
// WRONG — destructure outside the guard; getEnforcing escapes
try { mod = require('@react-native-google-signin/google-signin'); } catch { /*…*/ }
const { GoogleSignin } = mod;  // ← throws here when native lib missing

// RIGHT — destructure inside the guard
let GoogleSignin; let isSuccessResponse; /* … */
try {
  const mod = require('@react-native-google-signin/google-signin');
  GoogleSignin = mod.GoogleSignin;          // accesses TurboModule proxy here, still inside try
  isSuccessResponse = mod.isSuccessResponse;
  /* … */
} catch { return { error: new Error('Sign-in unavailable in this build.') }; }
```
**The other fix (root cause):** after adding any new community native module to `package.json`, rebuild the APK — `cd apps/mobile/android && ./gradlew installDevelopmentDebug` for the dev variant. Metro/JS hot-reload picks up the JS-side change but the native lib isn't in the previously-installed APK. The defensive try/catch above doesn't substitute for the rebuild; it just prevents the missing module from blowing up unrelated UI flows.
**Note vs Expo modules (error #21):** Expo native modules register through `globalThis.expo.modules` and never appear in `NativeModules` — for those, gate on `hasExpoNativeModule(name)` from `apps/mobile/src/lib/expoNativeModule.ts`. Community TurboModules like `RNGoogleSignin` and `RNCNetInfo` ARE exposed via `NativeModules.<BridgeName>` (the bridgeless interop proxy), so a `NativeModules.RNGoogleSignin` boolean check before `require()` is also valid. Either-or: destructure-inside-try OR check `NativeModules.<BridgeName>` first.
**Occurrences:** 2026-05-23 — dev APK from before the May-21 Google-Sign-In commit (`1a34b2e`) lacked the autolinked `RNGoogleSignin`. The destructure on line 245 of `apps/mobile/src/lib/supabase.ts` was outside the try/catch wrapped only around the require call (line 239-244), so the invariant violation surfaced as a LogBox warning that read as "stuck loading screen". Rebuilt APK via `./gradlew installDevelopmentDebug` AND patched the destructure into the guard for any future re-occurrence.

### 46. `EXPO_PUBLIC_APP_ENV` not flipped per build — preview/prod events were tagged `environment=development` in Sentry/PostHog
**Pattern:** `scripts/build-preview.sh` step 1b rewrote only `APP_VARIANT` in `C:/dpb/apps/mobile/.env` when switching flavors; the sibling `EXPO_PUBLIC_APP_ENV` stayed at whatever SRC's `.env` had hardcoded (`development`). Because `mobileEnv.appEnv` reads `EXPO_PUBLIC_APP_ENV` first (per `apps/mobile/src/lib/env.ts:55`) and `mobileEnv.sentryEnvironment` cascades through `appEnv` (per `env.ts:66-70`), every preview AND production APK shipped Sentry events tagged `environment=development`. Production AABs v0.2.31 / v0.2.37 / v0.2.38 all went out this way — real user crash data was hiding under the dev env filter for months.
**Symptom (the misleading one):** Sentry filtered by `environment:production` returns zero issues, suggesting no prod telemetry is reaching the backend. The actual events are present but tagged `environment=development`. Easy to misread as "consent gate is blocking all prod traffic" — the consent gate is real, but the env mis-tag was the bigger contributor to the apparent gap.
**Detection signal:** the `app_variant` tag (injected by `enableSentry`'s `beforeSend` in `telemetry.ts:79-83`) IS trustworthy because it reads `mobileEnv.appVariant`, which only depends on `extra.appVariant` (set explicitly in `app.config.ts` from `APP_VARIANT`). When `app_variant` and `environment` disagree on the same event, the env tag is the wrong one.
**Fix:** `scripts/build-preview.sh` step 1b now flips both `APP_VARIANT` and `EXPO_PUBLIC_APP_ENV` in DST's `.env`. `apps/mobile/app.config.ts:97-98` fallback also realigned (`preview → preview`, was `preview → staging`) so the names match Gradle flavor / Android package / Firebase app / tester group conventions everywhere. New code: trust `app_variant` over `environment` when auditing Sentry historical data.
**Note for historical data:** v0.2.38 production users continue to mis-tag until they update past v0.2.62 — any cross-release audit must group by `app_variant` until those installs roll over.
**Occurrences:** 2026-05-24 — discovered via Diagnostics smoke-test card on a preview build showing `Environment: development`. Cross-referenced with Sentry, which confirmed `app_variant=production` + `environment=development` on MOBILE-5/6/7. Fixed in the same build (still v0.2.62 / build 64).

### 47. Mapbox `getPointInView` crashes fatally when JS hands it a nested coordinate
**Pattern:** `@rnmapbox/maps`'s `MapView.getPointInView(coordinate)` is a TurboModule call that crosses the RN bridge into a Kotlin function (`NativeMapViewModule.getPointInView` → `ReadableArrayKt.toCoordinate` → `ReadableNativeArray.getDouble(0)`). The native side strict-casts each element to a Java `Double`. If JS passes an array whose element 0 is itself an array — e.g. `[[lng, lat], …]` from a `LineString` or `Polygon` GeoJSON feature instead of a flat `[lng, lat]` Point — the cast throws `java.lang.ClassCastException: ReadableNativeArray cannot be cast to Double`. The mechanism is `UncaughtExceptionHandler`, fatal, and it escapes ANY JS try/catch because the throw happens off the JS thread.
**Where it bit:** `apps/mobile/src/components/map/overlays/PoiCard.tsx` `usePoiCardHandler`. The handler read `feature.geometry?.coordinates` and only checked `Array.isArray(coords) && coords.length >= 2`, not the geometry **type**. Mapbox vector tile source layers (e.g. `mapbox-streets-v8`) mix Point / LineString / Polygon features in the same layer — most POIs are Points, but bus stops can be Points, parks are Polygons, roads are LineStrings. Tap a non-Point feature → `coords[0]` is itself an array → bridge crash → app dies (Sentry MOBILE-9, v0.2.38, Samsung Galaxy A52s 5G / Android 14, 2026-05-15).
**Detection signal:** crash stack shows `ReadableNativeArray.getDouble` near the bottom and ends in `MessageQueueThreadHandler.dispatchMessage`. The owning native module's name appears one frame up (here `NativeMapViewModule`).
**Fix:** validate **both** the GeoJSON type (must be `Point`) **and** that both extracted coordinates are finite `number`s **before** crossing the bridge. Lives as a pure helper at `apps/mobile/src/components/map/extractPointCoordinate.ts` so it can't be skipped and can be unit-tested without rendering the map. The contract is intentionally strict — returns `null` for non-Point types rather than guessing a representative point (centroid, first vertex). Callers must decide what to do with non-Point features explicitly.
**General rule:** any native bridge call that takes a `number[]` coordinate is a crash surface for the same family of bugs. Validate the shape and finiteness of every element at the JS boundary before the call. Don't rely on the RN bridge to produce a recoverable error — strict-cast bridges throw on the wrong thread and bypass `try/catch`.
**Occurrences:** 2026-05-15 — Sentry MOBILE-9 on production v0.2.38, single fatal event, Iași user tapped a non-Point feature on `/route-planning`. Fixed 2026-05-24 (extractPointCoordinate helper + 27 unit tests covering Point variants, all non-Point types, malformed inputs, and non-finite numbers).

### 48. Android `<Image tintColor>` fills the bounding rect when the PNG has no alpha channel
**Pattern:** `<Image source={png} style={{ tintColor: '#000', opacity: 0.4 }} />` only respects the die-cut silhouette when the source PNG is RGBA. If the source is RGB (no alpha), Android's renderer applies the tint to every pixel including what looks like a "transparent background" to a human eye — the result on screen is the tinted color filling the full Image rectangle, not the sticker shape. Surfaced as a black square behind the holographic badge during the v0.2.63 → v0.2.64 hotfix loop.
**Detection signal:** when a tinted Image overlay appears as a perfect rectangle exactly matching the Image's width/height, the source PNG is RGB. Verify with `python -c "from PIL import Image; print(Image.open(path).mode)"` — should be `RGBA`, not `RGB`.
**Fix:** add an alpha channel to the source PNG before bundling. For die-cut artwork on a solid background, `scripts/process-holo-badges.py` does a corner flood-fill (tolerance 40) with a 1px Gaussian-blur edge softener and re-thresholds for clean interiors. Pixels inside the silhouette stay opaque, pixels reachable from the corners become transparent.
**General rule:** never trust artwork to ship with alpha. Always confirm the mode of every PNG that will be tinted or composited via `<Image>` on Android — RGB PNGs are surprisingly common from generic image tools and the failure mode (filled bounding rect) only shows once the asset reaches a tinted-overlay code path.
**Occurrences:** 2026-05-24 — `apps/mobile/assets/holo_badges/*.png` shipped as RGB (corners RGB ~10-18). Edge-thickness layer in `HoloSticker` painted a dark rect behind the sticker. Fixed by background-removing all 78 RGB PNGs and adding a `mode == 'RGBA'` short-circuit to the processing script so it's idempotent.

### 49. `borderRadius: width` on a wide rect renders as a rounded rectangle, not an ellipse
**Pattern:** RN clamps `borderRadius` to half the **shortest** dimension. A `198 × 79` View with `borderRadius: 198` does NOT render as a 198-wide ellipse — it renders as a 198 × 79 rounded rectangle with ~39.5 px corner radius. Visible failure: the "soft shadow ellipse" under a sticker reads as a hard rectangle.
**Fix:** for actual ellipses, use an SVG `<Ellipse>` with explicit `rx`/`ry`. `react-native-svg` is already a transitive dep through `@rnmapbox/maps` in this repo.
**General rule:** anytime you want an ellipse with non-equal axes, reach for SVG. `borderRadius` on a View is for rounded **corners**, not ellipses.
**Occurrences:** 2026-05-24 — `HoloSticker` cast shadow rendered as a rounded rect that read as part of the "dark square" the user saw in v0.2.64. Replaced with SVG `<Ellipse>` + vertical opacity gradient (denser top, fading rim) in v0.2.65.

### 50. `needsOffscreenAlphaCompositing: true` on a 3D-transformed Animated.View can paint a black backing on Android
**Pattern:** Setting `needsOffscreenAlphaCompositing` on a View that ALSO has a 3D `transform` (perspective + rotateX/rotateY) tells Android to render the layer into an offscreen buffer for alpha-correct compositing. On some Android versions / GPU drivers the offscreen buffer is allocated with a black clear color instead of transparent — visible through any pixel where the children are themselves transparent. Surfaces as a dark square exactly matching the View's bounds, lurking behind otherwise correct children.
**Detection signal:** a dark rectangle appears at exactly the size of the wrapping Animated.View, NOT at the size of any child. Removing `needsOffscreenAlphaCompositing` makes it disappear.
**Fix:** don't combine `needsOffscreenAlphaCompositing` with 3D transforms unless you have a specific reason. The 3D transform alone composites correctly in most cases. If you genuinely need the prop (translucent children mixing pre-composition), be ready to also set `backgroundColor: 'transparent'` explicitly AND test against multiple Android versions.
**General rule:** `needsOffscreenAlphaCompositing` is rarely necessary. It's a hammer for one specific compositing artifact, and it has its own. Reach for it only when you can describe the exact visual artifact it's solving, and remove it the moment that artifact goes away.
**Occurrences:** 2026-05-24 — `HoloSticker` added `needsOffscreenAlphaCompositing` as a "safety net" for 3D rotation in v0.2.64 hotfix. It created its own black-backing artifact. Removed in v0.2.65 with no visible regression.

### 51. PanResponder's `onStartShouldSetPanResponderCapture: true` swallows tap from any parent Pressable
**Pattern:** a child component that uses `PanResponder.create({ onStartShouldSetPanResponderCapture: () => true })` to win gesture arbitration over a parent `ScrollView` ALSO wins arbitration over a parent `Pressable`. The Pressable's `onPress` never fires — the gesture is captured at the child's responder and never bubbles back up. Looks like the parent's tap handler is "dead".
**Detection signal:** child component reacts to touch (e.g. fires its own glare/animation) but parent's `onPress` doesn't fire. Adding a `console.log` to the parent's onPress confirms it never runs.
**Fix:** the child component exposes its own `onTap?: () => void` callback. Inside `onPanResponderRelease`, detect tap-shaped releases (no drag movement, short duration) and call `onTap` alongside any visual feedback. The parent passes its `onPress` as `onTap`. Keep the callback in a `useRef` so the memoized PanResponder closure stays stable while still seeing the latest handler each render — otherwise PanResponder rebuilds on every parent re-render of a list.
**General rule:** any component that captures gestures with `onStartShouldSetPanResponderCapture: true` MUST expose a tap callback. The child is opting out of the normal responder bubbling and is responsible for forwarding the gesture-as-tap to its parent.
**Occurrences:** 2026-05-24 — `HoloSticker` swallowed tap-to-open-modal from `BadgeCard`'s wrapping Pressable. Trophy Case tapped the glare animation but never opened the detail modal. Fixed in v0.2.72 with the onTap-via-ref pattern.

### 52. `react-native-svg` `<Stop>` cannot be animated via `Animated.createAnimatedComponent`
**Pattern:** wrapping `Stop` in `Animated.createAnimatedComponent(Stop)` and binding `offset` or `stopColor` to an `Animated.Value` looks fine at compile time and bundles cleanly, but at runtime react-native-svg's native side receives `[object Object]` for the animated props instead of a parsed string. The gradient falls back to whatever it can — usually opaque black solid fill — and an animated sheen renders as a solid dark overlay covering the sticker. ReactNativeJS warnings in logcat: `"#7DFCFC" is not a valid color or "[object Object]" is not a valid offset`.
**Detection signal:** logcat warns about invalid `offset` while the gradient renders as solid color. The Svg parent and Defs work; only the animated Stops fail to interpret their dynamic values.
**Fix:** keep the gradient stops STATIC (literal `offset` and `stopColor` strings), then animate the entire gradient layer via `Animated.View` transforms (translate + rotate). The visual effect is identical — the rainbow slides across the sticker — but the animation runs on a wrapper View, not on SVG attributes.
**General rule:** treat `react-native-svg` element attributes as static. If you need an animated SVG, animate the wrapping View's transform. The only SVG element with first-class Animated support in this codebase is `Rect` (for x/y/width/height translation) and even then it's brittle.
**Occurrences:** 2026-05-24 — `HoloSticker` first draft animated Stop `offset` values. The sheen rendered as opaque black covering the badge (read by the user as "black screen, nothing visible"). Fixed by replacing animated Stops with a static gradient inside an animated wrapper View.

### 53. Stale/cached GPS "last-known" fix inflates trip distance by hundreds/thousands of km
**Pattern:** trip distance is the sum of haversine segments between consecutive GPS breadcrumbs (`calculateTrailDistanceMeters`), so a single bad fix corrupts the whole total. Two sources inject one: (a) `useForegroundNavigationLocation` hydrates the *previous ride's* persisted last-known location into the sample stream before the first fresh fix resolves, so it lands as breadcrumb #1; (b) Android's fused provider re-surfaces a cached far-away fix on the initial `getCurrentPositionAsync` or after a mid-ride signal gap. A Bucharest fix at the head of a Madrid ride adds ~2,470 km. The inflated value propagates everywhere distance is read — History, stats dashboard, CO2/money/microlives totals — and worse, *awards real achievements*: a phantom 2,441 km ride granted `distance_1500km` / `co2_150kg` / `single_200km` badges + their XP, inflated profile totals, and broadcast badge-unlocks to followers via `activity_feed`.
**Detection signal:** a ride shows a wildly wrong distance (thousands of km); the GPS trail draws a straight line from a different city to the real start. `actual_distance_meters > 500000` in `trip_tracks` is the corruption signature.
**Fix:** sanitize breadcrumbs before measuring or storing — `sanitizeBreadcrumbs` in `packages/core/src/breadcrumbs.ts`. Drops fixes stamped before the ride began (`ts < startedAt`), trims a lone leading outlier (first step implausible but second plausible → head is the suspect), and rejects teleport jumps via an implied-speed gate (>30 m/s when both points carry `ts`) with a 50 km distance-cap fallback (read-back trails have `ts` stripped to `{lat,lon}` by the API mapper). Wired into three choke points: `appStore.appendGpsBreadcrumb` (append-time), `calculateTrailDistanceMeters` (so all read surfaces self-correct), and the server's `saveTripTrack` (before computing `actual_distance_meters` AND storing `gps_trail`).
**General rule:** never trust a raw GPS sample stream for distance. Any new consumer of `gpsBreadcrumbs` must measure through `calculateTrailDistanceMeters` (which sanitizes) or call `sanitizeBreadcrumbs` first, and must never seed the trail from a persisted/hydrated last-known location.
**Occurrences:** 2026-06-03 — user cycled ~12 km in Madrid; ride recorded 2,441.6 km because the first GPS fix was a stale Bucharest location. Fixed in v0.2.89 (commit `6c84ff2`). 10-route regression at `apps/mobile/src/store/teleport-distance.regression.test.ts`. The one corrupted production ride + its cascade (8 false badges, XP, profile totals, feed posts) were repaired/unwound — see progress.md Session 70.

### 54. Casting a Postgres RPC's snake_case JSONB straight to a camelCase contract with `as` silently yields `undefined` on every field
**Pattern:** a SECURITY DEFINER RPC returns `jsonb_build_object('total_xp', …, 'new_tier', …, 'xp_awarded', …)` — **snake_case** keys. The handler does `const r = data as XpAwardResult` where `XpAwardResult` is camelCase (`totalXp`/`newTier`/`xpAwarded`). `as` is a COMPILE-TIME assertion only — there is no runtime key remap — so every camelCase read returns `undefined`. The `?? fallback` then masks it: `currentTotalXp: r?.totalXp ?? 0` → always `0`; `riderTier: r?.newTier ?? 'kickstand'` → always `'kickstand'`; `finalXp: r.xpAwarded` → `undefined`, so `reduce((s,i)=>s+i.finalXp,0)` → `NaN`. The post-ride impact card showed **Kickstand / 0% progress / NaN XP for every rider regardless of true tier**, latent since the XP system shipped (migration `202604090002`, 2026-04-09).
**The tell:** a key that is a single word survives the mismatch. `promoted` is identical in both cases, so `r.promoted` read correctly — which is why genuine tier-up overlays (`RankUpOverlay`) still fired even though the card read tier 1. Whenever the boolean/flag works but the data fields are all defaults, suspect a casing mismatch, not a missing value.
**Fix:** never `as`-cast an RPC result whose value you actually read — write an explicit normalizer that maps each snake_case key and coerces with safe defaults (`Number(r.total_xp ?? 0)`, never `undefined`/`NaN`). Lives at `services/mobile-api/src/lib/xp.ts` `normalizeXpAwardResult`, wired into the 3 read sites in the `/v1/rides/:tripId/impact` handler. Unit-tested in `services/mobile-api/src/__tests__/xp.test.ts`.
**General rule:** `as SomeContract` on `supabaseAdmin.rpc(...)` data is a lie unless the RPC emits exactly those camelCase keys. Most of our RPCs emit snake_case JSONB. Map explicitly. The other `award_xp` callers (feed reactions/comments/shares, leaderboard, hazard reports) were unaffected ONLY because they are fire-and-forget and never read the return value — and the DB write itself was always correct, so this was a pure display bug, no data corruption.
**Occurrences:** 2026-06-08 — diagnosed via `/review`; the existing route test never asserted on `currentTotalXp`/`riderTier`/`totalXpEarned`, which is exactly why it shipped. Fixed server-side and deployed to Cloud Run revision `defpedal-api-00089-9lc`.

### 55. Zustand `set()` then an action that reads a captured memo in the same tick uses STALE state
**Pattern:** a handler updates the store and then synchronously triggers an async action that depends on a derived value. `useAppStore.getState().set(...)` mutates the store immediately, but the component's `useAppStore(selector)` value (and anything `useMemo`'d from it) only updates on the NEXT render — which hasn't happened yet inside the same event handler. So the async action, if it closes over the memo, sees the pre-update value. Concretely: the "skip next stop" flow called `removeWaypoint(idx)` then `rerouteMutation.mutate(coord)`, but the mutation's `mutationFn` closed over `effectiveRouteRequest` (a `useMemo` of `routeRequest`). The reroute went out with the just-removed waypoint still in it — the skipped stop wouldn't actually be skipped.
**Detection signal:** an action that "should reflect a state change I just made" behaves as if the change didn't happen, but only when both run in the same handler. Adding a `setTimeout(..., 0)` or splitting into a `useEffect` keyed on the changed state "fixes" it — that's the tell it's a same-tick staleness bug, not a logic bug.
**Fix:** read fresh state at execution time inside the async fn — `const s = useAppStore.getState(); const base = s.routeRequest; …` — instead of relying on a captured render-time memo. See `apps/mobile/app/navigation.tsx` `rerouteMutation.mutationFn` (rebuilds the request from `getState()` so a same-tick `removeWaypoint` is honored). Equivalent alternatives: defer the action to a `useEffect` that watches the changed slice, or pass the fresh value explicitly into the action.
**General rule:** never pair a store mutation with a same-tick async action that depends on a *derived/memoized* view of that store. Either thread the new value through explicitly, or have the async fn re-read `getState()`. React state/memos are next-render; `getState()` is now.
**Occurrences:** 2026-06-08 — multi-stop "skip next stop" reroute initially kept the skipped waypoint because the reroute `mutationFn` captured the stale `effectiveRouteRequest` memo. Fixed by reading `useAppStore.getState()` inside the mutationFn.

### 56. Third-party native module crashes on a background thread — JS try/catch can't catch it; patch the Java
**Pattern:** `react-native-play-install-referrer` reads the Play install referrer by spawning its OWN `java.lang.Thread` inside the native module and calling `referrerClient.getInstallReferrer()` on it. That call throws `IllegalStateException: Service not connected` when the Play Store service disconnects between `onInstallReferrerSetupFinished(OK)` and the thread running. The library's `try` only catches `RemoteException`, so the `IllegalStateException` (a `RuntimeException`) escapes the thread → **uncaught background-thread exception → app crash** (Sentry MOBILE). The mobile `installReferrer.ts` already guards the module LOAD and wraps the JS call in try/catch, but none of that helps: the throw happens on the library's thread, not in the JS callback path, so no amount of JS try/catch catches it.
**Detection signal:** Sentry stack ends in `...$1$1.run(PlayInstallReferrer.java:..) at java.lang.Thread.run` with no JS frames — the crash is on a native thread the library spawned. JS-side guards are irrelevant for this class.
**Fix:** patch the library's Java via **patch-package** — widen `catch (RemoteException ex)` to `catch (Exception ex)` so the IllegalStateException is reported as a JS error event instead of crashing. See `patches/react-native-play-install-referrer+1.1.9.patch`. Setup: `patch-package` devDep + root `postinstall: patch-package`. **Build gotcha:** this repo's release build copies to `C:\dpb` and SKIPS `npm install` when node_modules is current, so the postinstall wouldn't run — `scripts/build-preview.sh` now (a) robocopies `patches/` to DST and (b) runs `npx patch-package` explicitly after the install check (Step 1a2), with a grep assertion that the patched `catch (Exception ex)` landed. **patch-package gotcha:** this library's published npm tarball mistakenly includes the author's `android/build/` artifacts, so a naive `npx patch-package <pkg>` produces a 25 KB patch full of build-artifact deletions (and the binary diff can crash patch-package). Trim the generated patch to only the source hunk you care about.
**General rule:** a crash whose Sentry stack is entirely native frames ending in `Thread.run` cannot be fixed from JS — fix it at the native layer (patch-package for a third-party module). Only the JS *entry* can be guarded; once control is on the library's own thread, JS is powerless.
**Occurrences:** 2026-06-09 — production install-referrer read crashed on devices where the Play service disconnected mid-read; fixed via patch-package. Ships in the next production build (native change — the live v0.2.90 AAB predates it).

### 57. Play Console permanently reserves a versionCode once uploaded — discarding the draft does NOT free it
**Pattern:** uploaded an AAB at versionCode N, then needed to replace it (e.g. a rebuilt AAB with a late fix at the SAME version). Deleted/discarded the draft release in Play Console and re-uploaded the new AAB — still at versionCode N — and Play rejected it: **"Version code N has already been used. Try another version code."** A versionCode is consumed for the app's whole lifetime the moment it touches ANY release (production/open/closed/internal, draft or published); discarding the release does not return it to the pool.
**Detection signal:** the exact Play upload error "Version code <N> has already been used." after a re-upload of a discarded draft.
**Fix:** bump `versionCode` in `apps/mobile/android/app/build.gradle` to N+1 and rebuild (`npm run bundle:production`). **`versionName` can stay the same** (it's a cosmetic display string; Play only requires `versionCode` to be unique and strictly increasing) — so the marketing version (e.g. 0.2.90) and the release notes don't need to change for a same-release re-upload. This project keeps versionCode ONLY in `build.gradle` (no `expo prebuild`), so that's the single edit. Re-verify the cert owner + the new versionCode in the rebuilt AAB before uploading (see reference_playstore-release-workflow memory).
**General rule:** never reuse a versionCode for a re-upload, even after discarding the draft. Every upload attempt that you might discard still burns the number — bump on each retry (N → N+1 → N+2…). Treat versionCode as monotonic and write-once.
**Occurrences:** 2026-06-09 — v0.2.90 first uploaded at build 92, discarded, then the install-referrer-patched rebuild (also 92) was rejected. Bumped to 93, versionName unchanged (0.2.90). Commit `992a142`.

### 58. iOS clips large text when a tight `lineHeight` token is spread under a bigger `fontSize`
**Pattern:** a style spreads a typography token that carries a `lineHeight` tuned for its own `fontSize`, then overrides `fontSize` to something larger WITHOUT raising `lineHeight`. On iOS, text is clipped to the line box, so a glyph taller than `lineHeight` loses its top and bottom. Android is forgiving and renders the overflow, so the bug is **iOS-only and invisible on the dev/Android build**. Concretely: `ImpactSummaryCard`'s big impact numbers spread `textDataMd` (`fontSize 20`, `lineHeight 24`) but set `fontSize: 28`, so the 28px digits rendered in a 24px line box and lost their tops/bottoms on the Apple build.
**Detection signal:** numbers/letters look vertically "cut off" (flat-topped digits) on iOS only; the same screen is fine on Android. Look for a style that does `...someTextToken, fontSize: <bigger-than-the-token>` with no `lineHeight`.
**Fix:** pass a matching `lineHeight` alongside the larger `fontSize` (~1.2× of the new size). See `apps/mobile/src/components/ImpactSummaryCard.tsx` `StaggeredCounter` (`fontSize: 28, lineHeight: 34`). Commit `1b8aa46`, session 77.
**General rule:** whenever you override `fontSize` on a style that spreads a typography token, override `lineHeight` too (or drop the token's lineHeight). A spread token's `lineHeight` does NOT scale with a later `fontSize`. Tokens that set their own lineHeight, or styles that spread no token (RN computes a font-derived default), are safe.
**Occurrences:** 2026-06-14 — post-ride impact card ML/kg/EUR numbers clipped on the iOS TestFlight build; Android never showed it.

### 59. Native Google Sign-In + Supabase on iOS — "Passed nonce and nonce in id_token should either both exist or not"
**Pattern:** `@react-native-google-signin/google-signin` v16.1.2's classic `GoogleSignin.signIn()` on iOS returns an id_token that the GoogleSignIn SDK has **baked a nonce into**, but the app calls `supabase.auth.signInWithIdToken({ provider:'google', token })` with no nonce. Hosted GoTrue's check is `if tokenHasNonce != paramsHasNonce { error }` (errors in BOTH directions), so token-has-nonce + params-none trips it. Android is unaffected (its Credential-Manager token carries no nonce).
**Detection signal:** the exact GoTrue red error *"Passed nonce and nonce in id_token should either both exist or not"* on iOS Google sign-in; Android Google sign-in works.
**Fix:** enable **"Skip nonce checks"** on the Supabase Google provider (Auth → Providers → Google). Server-side only, no rebuild. There is **no clean code fix**: v16.1.2 is the latest and exposes no nonce API / no `GoogleOneTapSignIn`, so the digest can't be controlled; the "decode the token's nonce claim and pass it back" trick CANNOT work — GoTrue SHA-256-hashes whatever raw nonce you pass before comparing (`hash := sha256(params.Nonce); if hash != idToken.Nonce`), so you'd need a preimage you don't have. See memory `reference_ios-google-signin-nonce.md`.
**General rule:** **never add a `nonce` to the Google `signInWithIdToken` call** to "fix it properly" — with Skip-nonce ON, passing a nonce re-creates the mismatch. The no-nonce call is correct. Apple sign-in is unrelated and DOES use a real controlled nonce (rawNonce → SHA-256 → hash to Apple, raw to Supabase) — leave it alone.
**Occurrences:** 2026-06-14 — iOS TestFlight build 13 Google sign-in failed until Skip-nonce was enabled on the Supabase Google provider.

### 60. trip_end/trip_track silently orphaned — depending on the volatile clientTripId→serverId map loses GPS tracks forever
**Pattern:** the offline-queue trip flow enqueues `trip_end`/`trip_track` carrying only a `clientTripId`, then resolves the real server id at send time via the in-memory/persisted `tripServerIds[clientTripId]` map (populated when `trip_start` syncs). When that map is lost — `trip_start` already drained from the queue, then the entry is dropped by `resetFlow`'s prune, OR the whole persisted slice is stale because the AsyncStorage write was **debounced** (3s/8s, `lib/storage.ts`) and the app was hard-killed before it flushed — `getResolvedTripId` returns null, `isMutationReady` returns false, and `shouldSkipMutation` **skips the mutation on every flush forever**. It is never retried, never marked dead, never surfaced. The `trips` row stays `in_progress` with no `trip_tracks`, so the ride is invisible to History/stats. Track-save coverage fell from ~85% to 15% over May–June 2026 (108 users / 190 trips) as the offline-queue build rolled out to the field (~May 4) and the persist debounce landed (Jun 13 → the Jun 22 cliff).
**Detection signal:** rising count of `trips` rows with `end_reason='in_progress'` (and `client_trip_id` set) that never get a `trip_tracks` row; PostHog `offline_sync_*` events absent for those rides (they're skipped, so no telemetry fires at all). Query per-week `count(*) FILTER (WHERE tt.trip_id IS NULL)` joined `trips→trip_tracks`.
**Fix:** (1) **never let a trip mutation depend only on the volatile map** — resolve a missing id from the **durable** server record: server `resolveTripIdByClientId` + `GET /v1/trips/resolve?clientTripId=` (reads `trips.client_trip_id`); `OfflineMutationSyncManager` calls it when the local map misses, then `setTripServerId` + proceeds; a 404 (trip_start truly never landed) dead-letters the mutation into `RideLossBanner` instead of skipping it. `isMutationReady`/`shouldSkipMutation` are queue-aware — process an orphan when no `trip_start` is pending, still wait when one is. (2) **force-flush the persist debounce after recovery-critical state changes** — `flushPersistedWrites()` after `enqueueMutation`/`resolveMutation`/`killMutation`/`setTripServerId`/`setActiveTripClientId` in `queueSlice.ts`, so the queue + id-map survive a hard kill while GPS-breadcrumb churn stays coalesced. Commit `38b84ab` (session 80).
**General rule:** any mutation whose success depends on cross-session state must resolve that state from a **durable, server-authoritative** source as a fallback, and must reach a terminal state (retried → succeeded or dead-lettered) — never an infinite silent skip. When you add a debounced/coalesced persist layer, every state change that a crash-recovery path reads MUST be force-flushed; "a few seconds of crash-recovery granularity is fine" is false for an offline queue that backs irreplaceable on-device data. The actual GPS trail is NEVER on the server for an unrecorded trip (`trips` has no geometry column), so prevention is the only fix — there is no server-side backfill.
**Occurrences:** May–June 2026 — trip_tracks-loss regression; diagnosed + fixed session 80 (2026-06-27), shipped in v0.2.92 / API `defpedal-api-00099-qns`.


### 61. gcloud builds submit silently runs in the WRONG project — global default is osrmro1, not the API project
**Pattern:** the machine's gcloud global config is `core/project = osrmro1` (the OSRM VMs project). Running the documented `gcloud builds submit --config cloudbuild.yaml` without `--project` submits the build to **osrmro1's** Cloud Build, whose service account has no `artifactregistry.repositories.uploadArtifacts` on `gen-lang-client-0895796477`'s registry. The Docker build compiles fully (~4 min, looks healthy) and only fails at the final image-push step with a permission-denied + "retry budget exhausted".
**Detection signal:** Cloud Build log ends with `denied: Permission 'artifactregistry.repositories.uploadArtifacts' denied on resource` after an otherwise clean build; `gcloud builds list` shows the FAILURE in osrmro1's history, not the API project's. Historical FAILURE rows in osrmro1 (2026-06-29, 2026-07-04) are this same mistake.
**Fix:** always pass `--project gen-lang-client-0895796477` explicitly on BOTH commands: `gcloud builds submit … --project gen-lang-client-0895796477` and `gcloud run deploy … --project gen-lang-client-0895796477`. Do NOT change the global default — the OSRM tooling relies on it.
**General rule:** any multi-project GCP workflow must pin `--project` per command instead of trusting `gcloud config`. A wrong-project submit is not an early hard error — it burns the full build time first.
**Occurrences:** 2026-07-06 — first Cloud Run deploy attempt of the audit-fix pass failed at push; re-run with explicit `--project` succeeded (revision `defpedal-api-00103-nhl`).

### 62. Global `GeoJSON.*` type namespace breaks when a dependency bump drops the transitive `@types/geojson` — and Dependabot must be fenced off native-coupled packages
**Pattern (a):** code typed against the **global** `GeoJSON` namespace (`GeoJSON.Feature[]`) compiles only while some dependency transitively installs `@types/geojson` (here: the deprecated stub `@types/mapbox-gl`). A routine `mapbox-gl` bump (which ships its own types) removes the transitive stub and the build fails with `Cannot find namespace 'GeoJSON'` — on the dependency branch, far from any code change.
**Fix (a):** import the module explicitly — `import type { Feature } from 'geojson'` — and declare `@types/geojson` as a DIRECT devDependency of the workspace that uses it. Never type against ambient global namespaces that arrive transitively. Fixed in `apps/web/components/ShareMap.tsx` (commit `4d2d168`).
**Pattern (b):** Dependabot's default sweep treats native-coupled RN/Expo packages like ordinary npm deps. Its first run (2026-07-06) proposed `expo-*` **SDK 57** majors and `react-native 0.83.2→0.86.0` (semver-minor, so it landed inside the innocuous-looking "minor-and-patch" GROUPED PR) against a repo pinned to **Expo SDK 55 / RN 0.83**. Any of these merges breaks the native Android/iOS builds; their Vercel previews can still be green because the web app doesn't consume them — green preview ≠ safe merge.
**Fix (b):** `.github/dependabot.yml` `ignore` list: `expo`, `expo-*`, `@expo/*`, `react-native`, `react-native-*`, `@react-native/*`, `@react-native-community/*`, `@react-native-google-signin/*`, `@rnmapbox/*`, `@sentry/react-native`, `posthog-react-native`, `react`, `react-dom`. These move ONLY during a deliberate SDK-upgrade project. PRs #41–45 closed.
**General rule:** in an Expo/RN monorepo, automated dependency tooling needs an explicit fence around everything native-coupled — semver is meaningless for react-native ("minor" 0.83→0.86 is a native migration) and Expo package majors track SDK releases, not API breaks.
**Occurrences:** 2026-07-06 — Vercel preview ERROR at 14:43 on Dependabot PR #41 (`Cannot find namespace 'GeoJSON'`); ShareMap fix + ignore rules shipped in `4d2d168`, all five native-coupled PRs closed.

### 63. A fallback path that hardcodes a required input to 0, plus a ">0" display gate, = a value silently missing forever
**Pattern:** `GET /v1/rides/:tripId/impact` auto-creates a `ride_impacts` row when none exists yet, but called `calculateCaloriesBurned(distMeters, 0, vehicle)` — duration **hardcoded to 0**. Calories = MET × weight × hours, so a 0 duration always returns 0 kcal, and `record_ride_impact` persists it. The client hides the calorie block when `(caloriesBurned ?? 0) <= 0` (`ImpactSummaryCard.tsx`, `TripCard.tsx`), so any trip whose impact was auto-created through this path showed **no calories, permanently** — and because the row now exists, the correct POST path (which forwards the client's real duration) 409s "already recorded" and never overwrites it. The primary POST path was right all along, which is exactly why fresh online rides looked fine and masked the fallback bug.
**Detection signal:** a value is present on SOME records and missing on others, and the missing ones all flowed through a fallback / auto-create path. When a "hide when zero/empty" display gate is involved, a wrongly-computed-0 is indistinguishable from "not applicable" — so the bug hides itself. (In the live data, *every* `ride_impacts` row was 0/null, which also flagged that the compute never worked end-to-end for anyone.)
**Fix:** compute the real input in the fallback too — derive duration from `trip_tracks.started_at`/`ended_at` and pass it (plus `p_duration_minutes`). Commit `a2de0ce`, deployed `defpedal-api-00105-l6z`. Data already poisoned with 0 needs a **separate backfill** (`202607110001_backfill_ride_impact_calories.sql`) because the upsert only fires when no row exists — a live-code fix does not retroactively repair stored zeros. Backfill conservatively (plausible rides only) so corrupt-timestamp trips stay hidden rather than surfacing garbage (some trips had implied speeds up to ~15,000 km/h). Add a regression test for the fallback path specifically — it had none (same "the test never asserted the field" root cause as #54).
**General rule:** never hardcode a required input to a neutral value in a fallback/degraded path just "to fill the slot" — compute it, or leave the field absent so downstream can tell "unknown" from "zero". Any path that mirrors a primary one (auto-compute vs client-supplied) must produce equivalent data AND be tested. A truthy/`>0` display gate turns a wrongly-zero value into an invisible bug.
**Occurrences:** 2026-07-11 — user noticed calories missing on some trips; every `ride_impacts` row was 0/null. GET-fallback duration=0 fixed, 68 historical rides backfilled, auto-compute path test-guarded (v1.ts, migration `202607110001`, `routes-habitengine.test.ts`).

### 64. Expanding a feature's input domain (EU-wide routes) silently blows a fixed input-size assumption on an existing endpoint
**Pattern:** `POST /v1/risk-segments` accepted a route's full GeoJSON geometry and had worked for a year — because rides were RO/ES city-scale. The EU-wide routing expansion (2026-07-12) made 1,000+ km cross-country routes possible; their geometry (hundreds of thousands of coordinate pairs) exceeds Fastify's 1 MiB default `bodyLimit` → `FST_ERR_CTP_BODY_TOO_LARGE` in Sentry within minutes of the first preview testing. The endpoint itself was untouched by the feature branch — the *distribution of inputs* changed, not the code.
**Detection signal:** an endpoint that never errored starts throwing size/limit errors right after a feature expands the range of user inputs (longer routes, bigger uploads, more items). Look for fixed limits (bodyLimit, maxLength, LIMIT, timeouts sized for the old workload) downstream of the expanded surface.
**Fix (both ends, both shipped):** route-scoped `bodyLimit: 8 MiB` on `/risk-segments` (unblocks clients already in the field; endpoint is OAuth-gated + rate-limited so the ceiling is bounded) + server-side `downsampleCoordinates(coords, 15_000)` before the PostGIS RPC (a monster geometry is also a query cost bomb); client downsamples to 12k points (~300 KB) before POSTing from v0.2.99+. Helper in `packages/core/src/geometrySampling.ts` — uniform stride, exact endpoints preserved, pass-through (same reference) when under the cap.
**General rule:** when a feature multiplies the size/length/count of an existing input (longer routes, bigger regions, more countries), sweep every endpoint and query that input flows through for fixed-size assumptions BEFORE shipping — body limits, schema maxItems, DB statement costs, timeouts. Cap unbounded client-generated payloads on BOTH sides: client-side for the steady state, server-side because old clients live in the field for months.
**Occurrences:** 2026-07-12 — Sentry `4bff25295b834de1828411847b4b6d50`, minutes into EU-preview testing; fixed in `f1935c0`, deployed same day.

---

## Error #65 (2026-07-15): Geometry-accepting endpoint missed the #64 sweep — and the error handler hid the 413 as a retryable 500

**What happened:** The #64 fix (route-scoped 8 MiB bodyLimit + server-side downsample for full-resolution route geometry) was applied to the two endpoints that had *visibly* failed in Sentry (`/elevation-profile`, `/risk-segments`) — but `/trips/track` accepts the same `overview=full` geometry (`plannedRoutePolyline6`) and got neither defense. Worse, its failure mode was silent and unrecoverable: a 400/413 on the track upload is classified permanent by the offline queue → the ride's GPS trail dead-letters. Found by the GPS-tracking audit (docs/reviews/gps-tracking-audit-2026-07-15.md P0-3), not by Sentry — no field failure yet because EU-length routes only became possible on 2026-07-12 and v0.2.101 hadn't rolled out.

**Compounding bug:** the global error handler (`app.ts`) only special-cased AJV validation errors and `HttpError`; every other native Fastify error — including `FST_ERR_CTP_BODY_TOO_LARGE`, which carries `statusCode: 413` — was force-mapped to 500. The client treats 5xx as retryable, so an over-limit payload burned all 5 retries (~31 s + 5 slots of the shared `write` rate bucket) before dead-lettering, and the Sentry alert was mislabeled as a generic 500.

**Fixes (commit `06cb647`):** `/trips/track` got the shared `ROUTE_GEOMETRY_BODY_LIMIT_BYTES`/`MAX_ROUTE_GEOMETRY_POINTS` defenses (decode → downsample → re-encode; under-cap passes byte-identical; malformed polylines drop the overlay, never the trail); error handler now preserves any native 4xx `statusCode` (code travels in `details`).

**Rules:**
1. When a payload-class bug is found on one endpoint, grep for EVERY endpoint accepting the same payload class before closing it — the fix sweep is by *input shape*, not by *which endpoints alerted*. `grep -l 'polyline6\|coordinates' src/routes/` would have caught `/trips/track` on 2026-07-12.
2. An error-handler that force-maps unknown errors to 500 converts permanent client errors into retryable server errors — check `error.statusCode` before defaulting.
3. Endpoints whose rejection dead-letters client data (offline-queue uploads) deserve the most defensive limits, not the defaults — a 4xx there is data loss, not a client bug report.

---

## Error #66 (2026-07-15): `crypto.randomInt(0, 2 ** 48)` — range cap is 2^48 − 1, so the CSPRNG hardening itself broke route sharing for nine days

**What happened:** The audit fix "CSPRNG share codes" (2026-07-05 SEC-6, live in `defpedal-api-00103` ~07-06) injected `randomSource: () => randomInt(0, 2 ** 48) / 2 ** 48` into the share-code generator. Node's `crypto.randomInt` requires `max - min <= 281474976710655` (2^48 **− 1**); the call asked for exactly 2^48 — one over — and threw `ERR_OUT_OF_RANGE` on **every** invocation. The route handler wrapped it as `HttpError 502 "Failed to create route share."`, so **POST /v1/route-shares failed 100% of the time from 2026-07-06 to 2026-07-15** (15 Sentry events = every user attempt). Found when Victor reported the share button showing HTTP 502; root cause was one `gcloud logging read jsonPayload.event="http_error_details"` away.

**Why tests missed it:** every route-share test injects its own `service` or deterministic `randomSource` — the ONE line that only runs in production (the seam wiring) had zero coverage. The 5xx-details policy also kept the real message out of Sentry (it's only in Cloud Run logs), so the alert title was just the generic wrapper text.

**Fix (commit this session):** `randomBytes(6).readUIntBE(0, 6) / 2 ** 48` — 48 uniform bits, no range API to misuse — extracted as exported `cryptoShareCodeRandomSource` and covered by a regression test that exercises the REAL production source (10k draws in [0,1) + valid codes through the real generator).

**Rules:**
1. A "hardening" change that swaps an implementation detail (Math.random → crypto) MUST be executed at least once against its real bounds before shipping — bounds-checked crypto APIs (`randomInt`, `randomFillSync` offsets) throw at call time, not import time.
2. When a factory wires a dependency that every test overrides, add one test that pins the PRODUCTION wiring (export the default, test it directly). The injected seam is exactly where dead-on-arrival code hides.
3. `crypto.randomInt` range is ≤ 2^48 − 1. For a uniform [0,1) source, prefer `randomBytes(6).readUIntBE(0, 6) / 2 ** 48`.
4. When Sentry shows a generic wrapped 5xx, the real cause is in Cloud Run logs under `jsonPayload.event="http_error_details"` (the 2026-06-12 policy logs 5xx details server-side only).

---

## Error #67 (2026-07-15): `vitest run | tail -N` masks test failures — red CI shipped on a "green" local run

**What happened:** The trail-thinning change (GPS audit P1-1) broke an existing test (`src/lib/__tests__/backgroundNavigation.test.ts` asserted the old ring-buffer eviction). The pre-commit verification ran the full suite as `npx vitest run 2>&1 | tail -3` — a pipeline's exit status is the LAST command's (`tail`, always 0), so the failure was invisible and three consecutive CI runs on main went red. The pre-push hook didn't catch it either (it runs typecheck + lint, not tests).

**Rules:**
1. Never gate on a test command piped through `tail`/`grep`/`head` without `set -o pipefail` in the same shell invocation.
2. When a behavior change is made, grep for tests of the OLD behavior in `__tests__/` directories too — this repo keeps tests both next to files AND in `__tests__/` subdirs (`backgroundNavigation.test.ts` lives in `src/lib/__tests__/`, not next to `src/lib/backgroundNavigation.ts`).
