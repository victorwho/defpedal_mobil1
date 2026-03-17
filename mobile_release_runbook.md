# Mobile Release Runbook

Last updated: 2026-03-16

This runbook describes the current release automation for the React Native app and the safe path
to move builds from preview to store submission.

## Current Automation

- GitHub Actions workflow: `.github/workflows/mobile-release.yml`
- EAS config: `apps/mobile/eas.json`
- Manual trigger: `workflow_dispatch`

The workflow now:

1. checks out the repo
2. installs dependencies
3. runs `npm run validate`
4. installs `eas-cli`
5. triggers an EAS build with the selected `platform` and `profile`
6. optionally enables `--auto-submit`

The workflow uses `--no-wait`, so GitHub Actions finishes after queueing the build instead of
waiting for the store build to complete.

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

## Required GitHub Secrets

- `EXPO_TOKEN`

Recommended store credentials outside git:

- Android Google Play service account credentials configured in Expo/EAS
- iOS App Store Connect credentials configured in Expo/EAS

If those store credentials are not configured, the build can still run, but auto-submit will fail.

## How To Trigger A Release

From GitHub:

1. Open `Actions`
2. Open `Mobile Release`
3. Click `Run workflow`
4. Choose:
   - `platform`: `android` or `ios`
   - `profile`: `preview` or `production`
   - `auto_submit`: `true` or `false`

Recommended defaults:

- preview Android tester build:
  - `platform=android`
  - `profile=preview`
  - `auto_submit=true`
- production Android store-ready build:
  - `platform=android`
  - `profile=production`
  - `auto_submit=true`
- production iOS store-ready build:
  - `platform=ios`
  - `profile=production`
  - `auto_submit=true`

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

## Recommended Release Checklist

1. `npm run validate`
2. Confirm latest Android physical validation notes in `native_android_validation.md`
3. Confirm mobile env and store credentials are configured in EAS
4. Trigger preview release first if the change is significant
5. Review EAS build logs
6. Review Play Console / App Store Connect submission status
7. Promote manually from draft/TestFlight after product sign-off
