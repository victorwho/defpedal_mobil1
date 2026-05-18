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
**Fix:** Check `NativeModules.ExpoPushTokenManager` (or `NativeModules.ExpoNotifications`) BEFORE calling `require()`. If absent, return null immediately. The try/catch is a secondary safety net.
**Occurrences:** push-notifications.ts + NotificationProvider.tsx on dev builds without native rebuild (2026-04-06)

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
**Pattern:** Expo SDK 55 modules (expo-image-picker, expo-haptics, etc.) register via Expo Modules API (`globalThis.expo.modules`), NOT the classic React Native `NativeModules` bridge. Checking `NativeModules.ExpoImagePicker` always returns `undefined` even when the module is installed.
**Fix:** Use `requireOptionalNativeModule('ExponentImagePicker')` from `expo-modules-core` to detect presence. Check the module's source for the registered name (often different from the package name — e.g., `ExponentImagePicker` not `ExpoImagePicker`).
**Occurrences:** Profile photo upload silently disabled (2026-04-16)

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
