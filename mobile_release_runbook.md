# Mobile Release Runbook

Last updated: 2026-03-17

This runbook describes the current release automation for the React Native app and the safe path
to move builds from preview to store submission.

## Current Automation

- GitHub Actions workflow: `.github/workflows/mobile-release.yml`
- EAS config: `apps/mobile/eas.json`
- Release preflight script: `scripts/check-mobile-release.mjs`
- Manual trigger: `workflow_dispatch`

The workflow now:

1. checks out the repo
2. verifies `EXPO_TOKEN`
3. enforces dispatch guardrails for production, iOS, and auto-submit runs
4. installs dependencies
5. runs `npm run validate`
6. validates local release config against `apps/mobile/eas.json` and `apps/mobile/.env.example`
7. installs `eas-cli`
8. triggers an EAS build with the selected `platform` and `profile`
9. optionally enables `--auto-submit`

The workflow uses `--no-wait`, so GitHub Actions finishes after queueing the build instead of
waiting for the store build to complete.

## Supported Native QA Path

- Default supported native QA path on this Windows machine: Android release-style validation via `npm run android:validate:native:release`
- Reference validation notes: `native_android_validation.md` and `physical_android_validation.md`
- iPhone status: no completed smoke pass is recorded in-repo yet; track the first one in `iphone_validation.md`

That means Android release-style validation is the baseline sign-off path today. iOS release work
should always include an explicit validation reference until `iphone_validation.md` contains a
completed smoke pass.

## Supported Release Paths

### Preview

- EAS build profile: `preview`
- Android submit target: Google Play `internal`
- iOS submit target: TestFlight via the configured Expo/EAS submit credentials

Use this when:

- validating a staging build with testers
- checking native release quality before store promotion

### Production

- EAS build profile: `production`
- Android submit target: Google Play `production`
- Android release status: `draft`
- iOS submit target: TestFlight / App Store Connect using the configured Expo/EAS credentials

Use this when:

- you want a production-signed build
- you want Android submissions to land safely as drafts before manual rollout

## Required GitHub Inputs And Secrets

Repo secret:

- `EXPO_TOKEN`

Workflow inputs:

- `platform`
- `profile`
- `auto_submit`
- `native_validation_ref`
- `release_notes_ref`
- `confirm_store_readiness`

Recommended store credentials outside git:

- Android Google Play service account credentials configured in Expo/EAS
- iOS App Store Connect credentials configured in Expo/EAS

If those store credentials are not configured, the build can still run, but auto-submit will fail.

## Workflow Guardrails

The release workflow now fails fast when:

- `EXPO_TOKEN` is missing
- `auto_submit=true` but `confirm_store_readiness=false`
- `profile=production` and `release_notes_ref` is empty
- `profile=production` and `native_validation_ref` is empty
- `platform=ios` and `native_validation_ref` is empty
- the selected EAS build or submit profile is missing
- Android submit defaults drift away from:
  - preview -> `internal`
  - production -> `production` with `draft` release status
- `apps/mobile/.env.example` no longer documents the required mobile release env keys

## How To Trigger A Release

From GitHub:

1. Open `Actions`
2. Open `Mobile Release`
3. Click `Run workflow`
4. Choose:
   - `platform`: `android` or `ios`
   - `profile`: `preview` or `production`
   - `auto_submit`: `true` or `false`
   - `native_validation_ref`: latest device-validation note, doc path, or ticket
   - `release_notes_ref`: release notes path, ticket, PR, or changelog entry
   - `confirm_store_readiness`: `true` only after confirming EAS store credentials and rollout ownership

Recommended defaults:

- preview Android tester build:
  - `platform=android`
  - `profile=preview`
  - `auto_submit=true`
  - `native_validation_ref=native_android_validation.md`
  - `release_notes_ref=<ticket or PR>`
  - `confirm_store_readiness=true`
- production Android store-ready build:
  - `platform=android`
  - `profile=production`
  - `auto_submit=true`
  - `native_validation_ref=physical_android_validation.md`
  - `release_notes_ref=<release notes or ticket>`
  - `confirm_store_readiness=true`
- production iOS store-ready build:
  - `platform=ios`
  - `profile=production`
  - `auto_submit=true`
  - `native_validation_ref=iphone_validation.md or external smoke note`
  - `release_notes_ref=<release notes or ticket>`
  - `confirm_store_readiness=true`

## Release Preflight Checklist

1. `npm run validate`
2. Confirm latest Android release-style validation notes in `native_android_validation.md`
3. Confirm latest physical Android notes in `physical_android_validation.md` for production-impacting changes
4. If releasing iOS, confirm the latest iPhone smoke note in `iphone_validation.md` or capture an external validation reference
5. Confirm EAS store credentials are still valid
6. Confirm release notes or ticket reference is ready
7. Prefer a preview release before any production release with substantial feature or native changes

## Manual CLI Fallback

From `apps/mobile`:

```bash
eas build --platform android --profile preview
eas build --platform android --profile production --auto-submit
eas build --platform ios --profile preview
eas build --platform ios --profile production --auto-submit
```

To submit an existing latest build:

```bash
eas submit --platform android --profile preview --latest
eas submit --platform android --profile production --latest
eas submit --platform ios --profile preview --latest
eas submit --platform ios --profile production --latest
```

## Rollout Guidance

Android:

- keep `preview` on the `internal` track
- keep `production` submissions as `draft` until release notes and rollout checks are complete
- promote to a staged or full production rollout from Google Play Console after manual review

iOS:

- use TestFlight as the first production checkpoint
- after validation, promote the selected build in App Store Connect for App Review

## Rollback Path

Android preview:

- stop promoting the affected internal build
- queue a replacement preview build

Android production:

- if the build is still a Play draft, discard the draft and queue a corrected build
- if rollout has started, halt rollout in Google Play Console before shipping a replacement

iOS:

- remove or expire the affected TestFlight build for testers
- if App Review has not started, cancel the submission in App Store Connect
- queue the corrected build and re-run the smoke checklist

## Stable-Baseline Note

Phase 4 is only partially complete until the first iPhone smoke pass is captured. The repo now
has stronger release guardrails and a documented rollback path, but iPhone validation remains the
last external dependency for full Phase 4 completion.
