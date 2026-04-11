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

### 19. Dev app points to production API, not localhost
**Pattern:** `.env` has `EXPO_PUBLIC_MOBILE_API_URL` pointing to Cloud Run production URL. Changes to API code aren't visible until deployed to Cloud Run, even though a local API server is running on port 8080.
**Fix:** Either deploy API changes to Cloud Run before testing, or temporarily switch .env to `http://localhost:8080` for local testing (requires `adb reverse tcp:8080 tcp:8080`).
**Occurrences:** CO2 feature testing (2026-04-02)
