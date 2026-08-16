# iPhone Validation

Last updated: 2026-03-17

This file is the iPhone smoke-validation record for the React Native app.

## Current Status

- Smoke-validation pass: pending
- Blocking dependency: macOS hardware plus an iPhone or TestFlight-capable tester device
- Current repo policy: Android release-style validation remains the default native QA path on this Windows machine until an iPhone pass is recorded here

## Required Smoke Pass

Record the first stable iPhone pass with:

- date
- device model
- iOS version
- app profile: `preview` or `production`
- build source: EAS build link or TestFlight build number
- tester name

## Smoke Checklist

1. Install the preview or production build on the iPhone.
2. Launch the app and confirm route planning opens without a crash.
3. Accept foreground location permission.
4. Accept background location permission when prompted.
5. Confirm current-location route preview works.
6. Start navigation and lock the phone briefly.
7. Reopen the app and confirm the navigation session is still active.
8. Open `Settings -> Diagnostics` and confirm API reachability plus auth state.
9. Download the selected-route offline pack and confirm it reaches `ready`.
10. Queue one authenticated write while offline, reconnect, and confirm the queue drains.

## Pass Template

Use this template for the first recorded pass:

```text
Date:
Device:
iOS version:
Build profile:
Build reference:
Tester:

Confirmed:
- install / launch:
- route preview:
- navigation start:
- background resume:
- Diagnostics API reachable:
- signed in for writes:
- offline pack ready:
- offline queue drain:

Issues:
- none / list findings
```

## Release Gating Note

- Until this file contains at least one completed pass, iOS release dispatches should always include an explicit `native_validation_ref` that points to the external validation note, ticket, or TestFlight smoke result being used for sign-off.
