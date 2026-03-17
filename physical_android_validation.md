# Physical Android Validation

Last updated: 2026-03-16

This checklist covers the next validation step after emulator success: run the React Native app on a real Android phone and verify background navigation, offline continuity, and authenticated write sync under real network loss.

## Latest Result

- Partial pass completed on phone `R5CX61E737J`
- Confirmed:
  - `API reachable: Yes`
  - `Signed in for writes: Yes`
  - `Background location: granted`
  - queued sample writes drain successfully after real on-device connectivity loss and reconnect
  - locked-screen movement validation succeeded with `Movement detected: Yes` and `Recent movement distance: 216 m`
  - selected-route pack download succeeded until `Offline-ready for selected route: Yes`
  - active route/map continuity remained usable with Wi-Fi and mobile data disabled
- Still to verify:
  - no additional Android physical validation is currently blocking release-readiness

## Before You Start

You need:

- an Android phone with Developer options enabled
- USB debugging enabled on the phone
- a USB cable connected to this Windows machine
- the screen unlock PIN available on the phone
- mobile data enabled on the phone
- location services enabled on the phone

Optional but recommended:

- uninstall any older `Defensive Pedal Dev` build from the phone before starting
- keep the emulator disconnected or use the device serial flag shown below

## 1. Confirm The Phone Is Visible To adb

From the repo root:

```powershell
adb devices
```

You should see one physical device serial such as:

```text
R58W123ABC	device
```

If it shows `unauthorized`, unlock the phone and accept the USB debugging prompt.

## 2. Start The Local Mobile API

From the repo root:

```powershell
npm run dev:api
```

Leave this terminal open.

## 3. Install The Native Validation Build On The Phone

In a second terminal, run the release validator against the phone serial:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\validate-android-native.ps1 -AndroidVariant release -DeviceSerial YOUR_DEVICE_SERIAL
```

Example:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\validate-android-native.ps1 -AndroidVariant release -DeviceSerial R58W123ABC
```

What this does:

- stages the repo into `C:\dpm`
- prebuilds Android from the short-path copy
- installs the release validation APK on the phone
- configures `adb reverse` so the phone can reach the local API at `127.0.0.1:8080`

## 4. First Launch On The Phone

On the phone:

1. Open `Defensive Pedal Dev`.
2. Accept foreground location permission.
3. Accept background location permission if Android prompts separately.
4. Confirm the route-planning screen opens and shows your current position.

Success criteria:

- the app opens without crashing
- GPS location appears
- route planning is interactive

## 5. Sign In For Persisted Writes

On the phone:

1. Open `Auth`.
2. Tap `Use developer auth`.
3. Confirm the screen shows:
   - `Session: Signed in`
   - `Provider: dev-bypass`

If you prefer a real test account, sign in with that instead.

## 6. Open Diagnostics

On the phone:

1. Go to `Settings`
2. Open `Diagnostics`
3. Tap `Refresh diagnostics`

Success criteria:

- `API reachable: Yes`
- `Shared store backend:` shows a value such as `memory`
- `Signed in for writes: Yes`

## 7. Validate Background Navigation On Real Hardware

On the phone:

1. Go back to route planning.
2. Generate a route from your current location.
3. Start navigation.
4. Lock the phone screen.
5. Walk or ride a short distance, or simulate movement if you have a mock-location workflow on-device.
6. Reopen the app and check `Diagnostics`.

Success criteria:

- background navigation status updates
- latest fix timestamp changes while the app was backgrounded
- the active session remains in navigation state
- `Movement detected: Yes` appears in Diagnostics after refreshing
- `Recent movement distance` is greater than `0 m`

## 8. Validate Real Offline Queue Behavior

This is the key physical-device check that the emulator could not fully prove.

On the phone:

1. Stay signed in.
2. Open `Diagnostics`.
3. Turn off both:
   - Wi-Fi
   - mobile data
4. Tap `Queue sample writes`.
5. Wait 15 to 20 seconds.

Expected offline result:

- `Queued writes:` becomes `4`
- `Queue detail:` shows queued or syncing entries
- `Queue action result:` shows `queued`

Then reconnect:

1. Turn Wi-Fi or mobile data back on.
2. Wait 20 to 30 seconds for the sync loop.
3. Tap `Refresh diagnostics`.

Expected drain result:

- `Queued writes:` returns to `0`
- `Queue detail:` returns to `none`

## 9. Validate Offline Map Continuity

On the phone:

1. Download an offline region for the current route.
2. Confirm it reaches `ready`.
3. Start a route inside that downloaded region.
4. Turn off connectivity.
5. Confirm the map and active route still remain usable.

Success criteria:

- downloaded region stays available
- current route remains visible
- app does not crash or reset the session
- Offline Maps shows `Offline-ready for selected route: Yes` before connectivity is disabled

## 10. Collect Evidence

After the run, capture:

- one screenshot of Diagnostics with `API reachable: Yes`
- one screenshot showing queued writes while offline
- one screenshot showing the queue drained back to `0`
- one screenshot of offline maps showing `ready`

Also save:

- the phone model
- Android version
- whether the test used Wi-Fi, mobile data, or both
- any crash, stall, or permission oddity

## Recommended Pass Order

Run the checks in this order:

1. install and launch
2. permission acceptance
3. developer auth sign-in
4. diagnostics API health
5. route preview
6. navigation background check
7. offline queue check
8. offline map continuity check

## If Something Fails

- `API reachable: No`
  Check that `npm run dev:api` is still running, then run `adb reverse --list` and confirm `tcp:8080 tcp:8080` is present for the phone.

- Device not targeted correctly
  Re-run the validator with `-DeviceSerial YOUR_DEVICE_SERIAL`.

- Permission prompts never appear again
  On the phone, open App Info for `Defensive Pedal Dev`, clear permissions, then relaunch.

- Queue never drains after reconnect
  Wait at least 30 seconds, tap `Refresh diagnostics`, then capture the queue detail text exactly as shown.
