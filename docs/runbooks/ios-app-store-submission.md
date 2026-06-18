# iOS App Store Submission Runbook

How Defensive Pedal's iOS binary gets from a code change to **Submitted for Review** on the
App Store — built entirely from **Windows** via EAS cloud (no Mac, no iPhone).

Companion docs:
- **Build recipe / first-build blockers:** memory `reference_ios-build-submit-recipe.md` (the 10
  first-build fixes, Apple ASC API-key auth, EAS env vars, ITMS-90771, pod-install drift).
- **Google sign-in nonce:** memory `reference_ios-google-signin-nonce.md`.
- This file focuses on the **submit → App Store Connect → review** half of the pipeline.

## Key identifiers

| Thing | Value |
|-------|-------|
| ASC App ID (Apple ID) | `6778694757` |
| Apple Team ID | `ZL4PR7TJQ9` (ANTIFRAGIL SRL — org account) |
| Bundle ID (production) | `com.defensivepedal.mobile` |
| EAS project | `@victorwho/defensive-pedal-mobile` (`f8bcd740-c785-47a3-beed-26891c89425a`) |
| ASC API key (`.p8`) | `C:\dev\adminInfo\apple_app_store_connect_api\AuthKey_HK7JVSQ89Q.p8` (OUTSIDE repo) |
| ASC key ID | `HK7JVSQ89Q` |
| ASC issuer ID | `bb1a088b-0532-40c9-be0c-fa0c90b1998b` |
| TestFlight URL | https://appstoreconnect.apple.com/apps/6778694757/testflight/ios |

The ASC key path / id / issuer are also exported as **User env vars** (`HKCU\Environment`):
`EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`. `eas build` reads these
automatically; **`eas submit` does NOT** (see Submit step).

## Versioning model (read before worrying about "1.0" vs "0.2.91")

- `apps/mobile/app.config.ts` `version` is the **CFBundleShortVersionString** (currently `0.2.91`).
- `eas.json` has `"appVersionSource": "remote"` + production `"autoIncrement": true`, so EAS
  manages the **build number** (CFBundleVersion) remotely and bumps it each build (… 14 → 15 …).
  You do **not** hand-edit the build number.
- The App Store **version record** (e.g. `1.0`) is a separate field you create in App Store
  Connect. Apple's review email shows it as `1.0 (15)` = `{ASC version record} ({CFBundleVersion})`.
  A `0.2.91` binary attaches fine to the `1.0` record — build 14 did, and build 15 does too.
  **No version-string edit is needed to resubmit after a rejection.**

## The pipeline

### 1. Make the code change + verify
```bash
npm run typecheck          # 0 errors across all workspaces (CI gate)
npm run check:bundle       # HTTP 200
```
Commit to `main`. EAS builds from **committed git state**, so the fix must be committed (not just
saved) before building.

### 2. Build (EAS cloud, ~15–25 min)
```bash
cd /c/dev/defpedal/apps/mobile
npx eas build --platform ios --profile production --non-interactive
```
- Non-interactive works because the Distribution Cert + provisioning profile are already stored on
  EAS (first build had to be interactive — see the build recipe memory).
- **A capability change (new entitlement) requires ONE interactive build** to regenerate the
  profile, then non-interactive resumes.
- Watch for `Incrementing buildNumber from N to N+1` — confirms remote auto-increment.
- Output ends with `🍏 iOS app: https://expo.dev/artifacts/eas/<…>.ipa` and a build ID.

### 3. Submit to App Store Connect
`eas submit` **does not read the `EXPO_ASC_*` env vars** and can't set up a key in
`--non-interactive`. You must put the key in `eas.json` `submit.production.ios` **temporarily**,
then revert it (keep the machine-specific `.p8` path OUT of git):

```jsonc
// eas.json → submit → production → ios  (ADD these 3, then REMOVE after submit)
"ascAppId": "6778694757",
"appleTeamId": "ZL4PR7TJQ9",
"ascApiKeyPath": "C:\\dev\\adminInfo\\apple_app_store_connect_api\\AuthKey_HK7JVSQ89Q.p8",
"ascApiKeyId": "HK7JVSQ89Q",
"ascApiKeyIssuerId": "bb1a088b-0532-40c9-be0c-fa0c90b1998b"
```
```bash
cd /c/dev/defpedal/apps/mobile
APP_VARIANT=production EXPO_PUBLIC_APP_ENV=production \
  npx eas submit --platform ios --profile production --id <BUILD_ID> --non-interactive
```
Set `APP_VARIANT=production` or `app.config.ts` resolves the `.dev` bundle.
**After it finishes, revert `eas.json`** (`git diff -- apps/mobile/eas.json` must be empty).

Success looks like: `✔ Submitted your app to Apple App Store Connect!` Then Apple processes the
binary (~5–10 min) before it appears as a usable build.

### 4. Finish in App Store Connect (web — manual)
1. App → the version record (e.g. `1.0`) → **Build** → select the new build.
2. If this is a resubmission after rejection: **Resolution Center** → reply to App Review.
3. **Submit for Review**.

## Gotcha: EAS submission queue can stall (no error, no outage)

The submit runs on **EAS's submission worker**, not your machine — the local CLI just polls, so its
log "freezes" on `- Submitting` (in-place spinner). A submission can sit `IN_QUEUE` for a long time
with `error: null` even when https://status.expo.dev is all-green (iOS submit queue times are a
known recurring soft-slowness; there was a resolved incident 2026-06-10).

- `updatedAt` staying equal to `createdAt` is **normal** for `IN_QUEUE` — the row only timestamps on
  transition to `IN_PROGRESS`. It does **not** mean wedged.
- **Cancelling + resubmitting resets queue position** (fresh entry goes to the back). Only do it if
  an entry truly looks stuck; it won't jump the queue.
- There is **no faster Windows path** — direct upload to Apple needs Transporter (Mac-only); Apple
  has no binary-upload REST API. Waiting is usually the only real option.

## Verifying status headlessly (the part the EAS UI hides)

`eas build:view` error codes are useless; the real state lives in two APIs. Both auth off the same
ASC `.p8` / the EAS session in `~/.expo/state.json`.

### A. Is the build at Apple yet? (App Store Connect API, ES256 JWT)
Sign a short-lived JWT with the `.p8` (EC P-256) and GET `/v1/builds`. Node one-liner pattern
(`crypto.sign('sha256', …, { dsaEncoding: 'ieee-p1363' })` — JOSE raw sig, NOT DER):
```js
const sig = crypto.sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
// GET https://api.appstoreconnect.apple.com/v1/builds?filter[app]=6778694757
//     &sort=-uploadedDate&fields[builds]=version,processingState,uploadedDate,expired
//     Authorization: Bearer <jwt>   (header { alg:ES256, kid, typ:JWT }, payload { iss, iat, exp, aud:appstoreconnect-v1 })
```
A successful UPLOAD can still be Apple-**rejected** during processing (cf. build 10 ITMS-90771) —
trust `processingState` (`PROCESSING` → `VALID`/`INVALID`), not the EAS "submitted" message. A
rejected binary is **invisible in TestFlight**, so "no build in TestFlight" ≠ "still processing".

### B. Is the EAS submission stuck or errored? (EAS GraphQL)
`POST https://api.expo.dev/graphql` with header `expo-session: <sessionSecret from ~/.expo/state.json>`.
```graphql
query($id:ID!){ submissions{ byId(submissionId:$id){ status error{ errorCode message } } } }
# status: IN_QUEUE | IN_PROGRESS | FINISHED | ERRORED | CANCELED
```
Cancel a stuck queued submission (mutation namespace is `submission`):
```graphql
mutation($id:ID!){ submission{ cancelSubmission(submissionId:$id){ id status } } }
```
(`retrySubmission(parentSubmissionId)` also exists.)

---

## Log: 2026-06-17/18 — Guideline 5.1.1(iv) resubmission (build 15)

**Rejection.** First App Store submission (**v1.0 build 14**, reviewed 2026-06-17, submission
`10455ac9-c5ac-472a-a4b7-d279fcaba69b`) rejected under **Guideline 5.1.1(iv)**: the onboarding
pre-permission screen (`apps/mobile/app/onboarding/index.tsx`) explained why location is used, then
its primary button — which triggers the OS location dialog — said **"Enable Location"**. Apple
treats directive verbs as "encouraging/directing" the grant; they require a neutral word like
**"Continue"**/"Next". Explaining *why* before the prompt is allowed; only the button verb was the
problem.

**Fix (`3c40fb5`).** String-only, all 3 locales (`enableLocation` key in `apps/mobile/src/i18n/`):
EN `Enable Location → Continue`, ES `Activar ubicación → Continuar`, RO `Activează locația →
Continuă`. Component logic, explanatory copy, and denied/skip paths unchanged. Other location call
sites (`useCurrentLocation`, `useForegroundNavigationLocation`) are runtime requests on actual
feature use, not directive pre-prompts → outside this guideline.

**Build/submit trail.**
- Build 15 — id `c972b102-1470-447d-93ad-dfb06054bba5`, version 0.2.91, auto-incremented 14 → 15. ✅
- Submit #1 — submission `e56ee5b1-…` sat `IN_QUEUE` ~53 min with no error/outage → **CANCELED**
  via the GraphQL mutation.
- Submit #2 — submission `f2bdffbf-b803-454a-8745-08b30a1d4703` → **FINISHED**, binary uploaded.
- Apple processing → **build 15 `VALID`** (uploaded 2026-06-17T12:56:01-07:00, not expired).
- `eas.json` ASC-key reverted (git diff empty).

**App Review reply used:** explained the button changed from "Enable Location" to the neutral
"Continue" in all languages; the screen now just proceeds to the standard iOS prompt with the user
in control; app remains usable if location is denied.
