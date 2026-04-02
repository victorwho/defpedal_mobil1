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
