# Native Android Validation

Last updated: 2026-03-16

This file tracks the real-device/emulator validation state for the React Native Android app.

## Current Status

- Emulator detected: `emulator-5554`
- Physical Android phone validated: `R5CX61E737J`
- Mobile API health reachable locally: `http://127.0.0.1:8080/health`
- Direct native build from the main repo path: blocked on Windows path length during Android CMake/Ninja compilation
- Repeatable workaround now available: [scripts/validate-android-native.ps1](./scripts/validate-android-native.ps1)
- Short-path staging launch succeeds from `C:\dpm`
- Native emulator package confirmed:
  - `com.defensivepedal.mobile.dev`
- Diagnostics screen is reachable in the emulator and reports live validation state
- Background navigation survives Android backgrounding without crashing
- Selected-route offline pack download reaches `ready`
- Diagnostics exposes queue-action press count/result details for authenticated offline-sync QA
- The staged Metro session bundles the mobile app successfully from `apps/mobile` without importing the legacy web-only services
- A release / embedded-bundle validation path is available via `npm run android:validate:native:release`
- The release / embedded-bundle path builds and installs successfully from `C:\dpm`
- The earlier release startup crash in `AuthSessionProvider` is fixed after aligning the workspace to a single React version
- The release validator now rewrites the staged mobile API URL to `http://127.0.0.1:8080` and configures `adb reverse`
- The generated staged Android manifest now includes `android:usesCleartextTraffic="true"`
- Diagnostics now reports the local mobile API as reachable from the release build
- Authenticated queued-write drain is now validated end to end on the emulator
- Physical-device Diagnostics now confirms local API reachability, signed-in persisted-write eligibility, and granted background location permission
- Authenticated queued-write drain is now also validated on a physical Android phone after disabling connectivity on-device and reconnecting
- Diagnostics now records recent background location history and summarizes whether real movement was detected during locked-screen validation
- Offline Maps now reports whether the currently selected route already has a ready offline pack before connectivity is disabled
- Physical Android locked-screen movement validation is now confirmed with `Movement detected: Yes` and `Recent movement distance: 216 m`
- Physical Android selected-route offline readiness is now confirmed after downloading the selected route pack
- Physical Android offline continuity is now confirmed: the active route remained usable with both Wi-Fi and mobile data disabled

## What Was Confirmed

1. The Android emulator is available from this machine via `adb devices`.
2. The mobile API is healthy and reports the active shared-store backend.
3. A direct `expo run:android` from the repo root path fails because the workspace path is too long for native Android object-file generation on Windows.
4. The short-path staging workflow can prebuild, install, and launch the Android app on the emulator.
5. The native app opens into the real React Native route-planning flow and can navigate to `/diagnostics`.
6. Diagnostics confirmed:
   - app environment: `development`
   - Mobile API URL: `http://127.0.0.1:8080`
   - Mapbox token configured: `Yes`
   - API reachable: `Yes`
   - shared store backend: `memory`
   - queued writes: `0` when idle
   - native offline packs: `0`
7. Live ride validation confirmed:
   - foreground location granted
   - background location granted
   - GPS-backed route preview loads from the rider’s current location
   - navigation session starts successfully
   - after backgrounding the app and moving emulator GPS, Diagnostics reported:
     - `Background navigation: active`
     - updated persisted fix timestamp
     - `Active session: navigating`
8. Offline pack validation confirmed:
   - selected route pack download started successfully
   - offline region `safe-1` reached `ready`
   - progress reached `100%`
   - resources reached `6/6`
9. Release-build validation confirmed:
   - `EXPO_NO_METRO_WORKSPACE_ROOT=1` fixes Expo embedded bundling for the monorepo mobile app
   - the release APK builds successfully from the short-path workspace
   - the release APK installs successfully on the emulator
   - the release app launches far enough to request runtime location permission
   - the prior release-only `TypeError: Cannot read property 'useState' of null` crash is no longer present after React version alignment
10. Localhost transport hardening confirmed:
   - the staged validator rewrites the mobile API URL to `http://127.0.0.1:8080`
   - `adb reverse tcp:8080 tcp:8080` is active during the release validation run
   - the staged manifest includes `android:usesCleartextTraffic="true"`
   - Diagnostics refresh succeeds from the native release build
11. Authenticated queue drain confirmed:
   - signed in with the developer bypass account
   - stopped the host mobile API to simulate backend unavailability during validation
   - queued sample writes and observed:
     - `Queued writes: 4`
     - `Queue detail: trip_start:syncing, hazard:queued, feedback:queued, trip_end:queued`
     - `Queue action result: queued`
     - `Queue action last mutation count: 4`
   - restarted the host mobile API and waited through the sync interval
   - Diagnostics then reported:
     - `Queued writes: 0`
     - `Queue detail: none`
   - API logs confirmed successful `trip_start`, `hazards`, `feedback`, and `trip_end` requests after the restart
12. Physical Android validation confirmed:
   - release validator successfully targeted phone `R5CX61E737J`
   - Diagnostics on the phone reported:
     - `API reachable: Yes`
     - `Signed in for writes: Yes`
     - `Background location: granted`
   - real offline queue validation succeeded on-device:
     - connectivity was disabled on the phone
     - queued sample writes were created while offline
     - connectivity was restored
     - the queue drained successfully after reconnect
   - locked-screen movement validation succeeded on-device:
     - the phone was moved with the app backgrounded / locked
     - Diagnostics later reported:
       - `Movement detected: Yes`
       - `Recent movement distance: 216 m`
   - selected-route offline-pack readiness succeeded on-device:
     - Offline Maps initially reported `Offline-ready for selected route: No`
     - the selected route pack was downloaded
     - Offline Maps then reported `Offline-ready for selected route: Yes`
   - offline continuity succeeded on-device:
     - Wi-Fi and mobile data were disabled
     - the active route and map remained usable

Reference screenshots:

- [launch screen](/C:/Users/Victor/Documents/1.%20Projects/0_PedalaDefensiva/0_App/mobile_dev/defpedal_mobil1/output/emulator/native-android-validation.png)
- [diagnostics top](/C:/Users/Victor/Documents/1.%20Projects/0_PedalaDefensiva/0_App/mobile_dev/defpedal_mobil1/output/emulator/native-android-diagnostics-attempt.png)
- [diagnostics lower](/C:/Users/Victor/Documents/1.%20Projects/0_PedalaDefensiva/0_App/mobile_dev/defpedal_mobil1/output/emulator/native-android-diagnostics-lower.png)
- [background recovery fixed](/C:/Users/Victor/Documents/1.%20Projects/0_PedalaDefensiva/0_App/mobile_dev/defpedal_mobil1/output/emulator/diagnostics-after-background-fix-lower.png)
- [offline pack ready](/C:/Users/Victor/Documents/1.%20Projects/0_PedalaDefensiva/0_App/mobile_dev/defpedal_mobil1/output/emulator/offline-maps-ready-lower.png)
- [release permission prompt](/C:/Users/Victor/Documents/1.%20Projects/0_PedalaDefensiva/0_App/mobile_dev/defpedal_mobil1/output/emulator/native-release-postfix.png)
- [API reachable in release validator](/C:/Users/Victor/Documents/1.%20Projects/0_PedalaDefensiva/0_App/mobile_dev/defpedal_mobil1/output/emulator/native-dev-diagnostics-after-cleartext.png)

## Known Blockers

- Current repo path:
  - `C:\Users\Victor\Documents\1. Projects\0_PedalaDefensiva\0_App\mobile_dev\defpedal_mobil1`
- Native build failure symptom:
  - Expo/Gradle reaches Android native compilation and then fails with long-path CMake/Ninja errors such as `build.ninja still dirty after 100 tries`.
- The short-path validation command is still a long-running dev-build flow, so command-line automation may hit tool timeouts even after the app is successfully installed and launched.
- Direct builds from the original long Windows repo path are still not reliable; use the short-path staging workflow.
- The earlier short-path Metro root-entry issue is fixed, but the Android bridgeless dev client is still failing to consume the staged bundle over `10.0.2.2:8081`.
- Current debug-mode failure signature:
  - Metro bundles `apps/mobile/index.tsx` successfully
  - the dev client logs `java.net.ProtocolException: Expected leading [0-9a-fA-F] character but was 0xd`
  - `files/BridgelessReactNativeDevBundle.js` stays empty
  - the emulator remains on a blank white screen
- The release path is now the reliable native QA path on this machine, but the command still needs enough free host-disk space for Android release intermediates and native symbol extraction.
- Physical-device queued-write drain, locked-screen movement detection, selected-route offline readiness, and offline-map continuity are now confirmed.

## Validation Workflow

Use the short-path validation runner from the main repo:

```powershell
npm run android:validate:native
```

To target a physical Android phone while keeping the emulator attached:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\validate-android-native.ps1 -AndroidVariant release -DeviceSerial YOUR_DEVICE_SERIAL
```

What it does:

1. Mirrors the repo into `C:\dpm`, excluding heavy/generated folders.
2. Runs `npm install` in the short-path staging copy.
3. Regenerates the Android native project in the staging copy with Expo prebuild.
4. Starts Metro explicitly from `apps/mobile` for debug validation, then launches Android from the short-path copy.
5. Forces `EXPO_NO_METRO_WORKSPACE_ROOT=1` during staged native validation so Expo resolves the embedded bundle against `apps/mobile` instead of the workspace root.
6. Falls back to a fresh short-path sibling staging directory if the previous staging folder still has locked Gradle artifacts.
7. Rewrites the staged mobile API URL to `http://127.0.0.1:8080` and configures `adb reverse` for the API port during validation.
8. Supports an explicit `-DeviceSerial` override so physical-device validation does not fight with attached emulators.

For a release / embedded-bundle validation build:

```powershell
npm run android:validate:native:release
```

Notes:

- The script relies on the Expo `@rnmapbox/maps` config plugin plus `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` support to resolve native Mapbox Android dependencies.
- The app can also fall back to the existing secret Mapbox token env keys when they contain an `sk.` token, which keeps local validation aligned with the current repo setup.
- The Android build requires `RECEIVE_BOOT_COMPLETED` so Expo background location can schedule persisted jobs without crashing.
- The Android build also applies a local config plugin that injects `android:usesCleartextTraffic="true"` for staged validation builds that target the local HTTP mobile API.
- The current remaining debug harness issue is the bridgeless bundle downloader. Metro now bundles the staged mobile entry correctly, but the dev client still fails while downloading the bundle from `10.0.2.2:8081`.
- For a stable native emulator session on this Windows machine, the release / embedded-bundle path is the preferred validation route.

## In-App Validation Aids

- Diagnostics screen:
  - route: `/diagnostics`
  - entry: Settings -> Diagnostics
- It shows:
  - foreground/background location permission status
  - background navigation status and last persisted fix
  - saved background-fix count, recent movement distance, straight-line movement, and a simple movement-detected result
  - API health and shared-store backend
  - offline region counts and queued writes
  - selected-route offline readiness and matching ready-pack counts
  - active navigation session state

## Remaining Manual Checks

1. Sign in with a real non-bypass test user and repeat persisted write validation.
2. Repeat the mobile validation path for iPhone on macOS hardware.
3. Decide whether to repair the bridgeless debug client or continue using the release validator for native QA.

## Recent Hardening Added

- Mobile API calls in the React Native app now fall back across `fetch` and `XMLHttpRequest` instead of depending on only one transport.
- Offline mutation sync has a watchdog timeout in code so a queued mutation cannot remain `syncing` forever.
- Diagnostics shows queued-mutation error text and uses a timed API health probe instead of an unbounded request.
- Diagnostics also shows queue-button press count, last attempt time, last result, last queued trip id, and last queued mutation count.
- Developer sample-write queuing runs through a tested Zustand store action.
- The mobile Metro config blocklists the legacy root web app files so native bundling no longer pulls `import.meta.env`-based web modules.
- The Android validator supports both debug-mode staged Metro validation and a release / embedded-bundle validation path.
- The validator disables Expo workspace-root promotion for native staging and can fall back to a fresh short-path sibling workspace when the previous one is still locked.
- The mobile dependency graph resolves to a single React version, removing the release-only invalid hook crash in `AuthSessionProvider`.
- The staged release validator now routes the local mobile API through `127.0.0.1` plus `adb reverse` instead of depending on `10.0.2.2`.
- A local Expo config plugin now guarantees `android:usesCleartextTraffic="true"` in the generated manifest for staged release validation.

These changes all pass local typecheck and tests. The release / embedded-bundle Android validation path is now working end to end, while debug-mode Android validation still needs a clean bridgeless bundle download path.
