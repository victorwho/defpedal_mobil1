# iPhone Deploy Guide — finishing the iOS App Store launch

> **Purpose:** a self-contained runbook to take Defensive Pedal from "first build is on TestFlight" to "live on the App Store," to be executed **once the physical iPhone is available**. Written so a **fresh Claude session with no prior context** can drive it. Read this top-to-bottom first.
>
> **Last updated:** 2026-06-10. **Owner:** Victor (victorrotariu@gmail.com). Repo: `C:\dev\defpedal` (branch `main`).

---

## 0. TL;DR — where we are, what's left

**DONE (committed `9d3bbe5`→`85bdb17`, build live on TestFlight):**
- iOS Phase A config + all 10 first-build blockers fixed. First iOS build (#10, v0.2.90) **built on EAS and submitted to TestFlight** from Windows (no Mac, no iPhone).
- App Store Connect app record created (Apple ID **6778694757**). Listing copy + privacy labels drafted (paste-ready). Support/privacy/terms web pages live.

**REMAINING (this guide):**
1. Install the TestFlight build on the iPhone and **smoke-test on the real device (Phase C)**.
2. Fix any iOS-specific bugs (rebuild→resubmit loop — now a 1-command build).
3. Finalize the App Store listing (screenshots from the device, demo account).
4. **Submit for App Store review** + phased release.

**Hard rule:** do **not** "Submit for Review" until the app has been smoke-tested on a real iPhone and screenshots/demo account are done. Apple reviews on real devices; an untested first iOS build risks rejection (each cycle is 24–48 h).

---

## 1. Critical identifiers & credentials (already configured)

| Thing | Value / location |
|---|---|
| Apple Team | `ZL4PR7TJQ9` (ANTIFRAGIL SOCIETATE CU RASPUNDERE LIMITATA — org account) |
| Bundle ID (production) | `com.defensivepedal.mobile` |
| ASC numeric Apple ID | `6778694757` |
| TestFlight | https://appstoreconnect.apple.com/apps/6778694757/testflight/ios |
| EAS project | `@victorwho/defensive-pedal-mobile` (projectId `f8bcd740-c785-47a3-beed-26891c89425a`), logged in as `victorwho` |
| ASC API key (Apple auth, **bypasses 2FA**) | Key ID `HK7JVSQ89Q`, Issuer `bb1a088b-0532-40c9-be0c-fa0c90b1998b`, `.p8` at `C:\dev\adminInfo\apple_app_store_connect_api\AuthKey_HK7JVSQ89Q.p8` (outside repo) |
| ASC key env vars | Persisted in Windows **User** env: `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID` (a *new* terminal has them automatically) |
| Mapbox download token | Scoped `Downloads:Read` `sk.` token in `apps/mobile/.env` (gitignored) + all 3 EAS env secrets `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` |
| Google iOS OAuth client | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in `.env` + EAS envs (id `1081412761678-n4eo50jdpcjdm7ambk640qtuq9v5p08m...`) |
| Last EAS iOS build | id `46cdd14b-034b-4449-896e-c5901e38576f`, build number 10, `.ipa` artifact on EAS |

**Secrets policy:** the `.p8` and the Mapbox `sk.` token are NOT in git (referenced by path / live in `.env` + EAS). Never paste them into committed files. The Key ID / Issuer ID above are identifiers (useless without the `.p8`).

---

## 2. Environment prerequisites (verify at session start)

```bash
cd C:\dev\defpedal && git status            # expect clean-ish; on branch main
cd C:\dev\defpedal\apps\mobile
npx --no-install eas whoami                 # expect: victorwho
# Apple auth env vars (should print the 3 EXPO_ASC_* values — new terminals inherit them):
powershell -c "$e=Get-ItemProperty HKCU:\Environment; $e.EXPO_ASC_API_KEY_PATH; $e.EXPO_ASC_KEY_ID; $e.EXPO_ASC_ISSUER_ID"
ls C:\dev\adminInfo\apple_app_store_connect_api\AuthKey_HK7JVSQ89Q.p8   # the .p8 must exist
```
If `eas whoami` is empty → the user must run `npx eas login` (interactive). If the `.p8` is missing → ask the user for it (or re-create an ASC API key with **Admin** role at App Store Connect → Users and Access → Integrations).

- **No Mac needed.** iOS builds run on EAS cloud macOS runners. A real iPhone is needed only for *testing* (TestFlight install) and screenshots.
- All 10 first-build fixes are committed, so a plain `eas build` now goes straight to compile.

---

## 3. STEP 1 — Install the TestFlight build on the iPhone  [USER on device]

The submitted build is a production/store build (embedded bundle → Cloud Run prod API), so **TestFlight is the install path** (no USB, no Metro, no device registration).

1. In App Store Connect → the app → **TestFlight** tab → confirm the build (v0.2.90 build 10) shows **"Ready to Test"** (after Apple finishes processing; if it shows "Missing Compliance", set Export Compliance → exempt/standard-HTTPS).
2. **TestFlight → Internal Testing →** create a group (or use the default) → add the user's Apple ID (`victorrotariu@gmail.com`) as an internal tester → add the build to the group.
3. On the iPhone: install the **TestFlight** app from the App Store → sign in with that Apple ID → accept the invite → install Defensive Pedal.

> If the build isn't there or you need a fresh one, build + submit again per **STEP 3** below.

---

## 4. STEP 2 — Phase C: on-device smoke test  [USER observes, Claude logs bugs]

Walk this checklist on the real iPhone. For each failure, capture what happened + any Sentry error, and file it (see STEP 3 fix loop). These are the iOS-specific risk surfaces (never verified on real hardware):

| # | Check | Proves |
|---|---|---|
| 1 | App boots; **Mapbox map renders** | Mapbox SDK + token |
| 2 | Location permission prompt → **Safe route returns** | GPS + OSRM HTTPS routing |
| 3 | **Turn-by-turn navigation** (3D camera, maneuver cards), screen-lock keeps nav | background-location entitlement (5.1.1) |
| 4 | **Google sign-in** shows native iOS sheet → signs in | `GIDClientID` + URL scheme |
| 5 | **Sign in with Apple** completes → signed in | `usesAppleSignIn` entitlement + Supabase Apple provider |
| 6 | **Holo badge tilts** when you move the phone | `expo-sensors` DeviceMotion + `NSMotionUsageDescription` |
| 7 | **Push permission** prompt fires; daily weather notification schedules | APNs key + entitlement |
| 8 | **Dynamic Island / notch** insets correct on map overlays + NavigationHUD | SafeArea |
| 9 | **Edge swipe-back** works on pushed screens, **locked during NAVIGATING** | Expo Router + route guard |
| 10 | Report a hazard, share a ride, share-card image renders | UGC + `react-native-view-shot` |
| 11 | Account: create email account, delete-account flow works | 5.1.1(v) in-app deletion |

**Exit criteria for Phase C:** all pass, no crashes, Sentry clean for the iOS build. Then proceed to STEP 4/5.

---

## 5. STEP 3 — Build / fix / resubmit loop (Claude drives)

### Build (non-interactive — credentials persist)
```bash
cd C:\dev\defpedal\apps\mobile
npx --no-install eas build --platform ios --profile production --non-interactive
```
~20–30 min on EAS. On success it prints the build id + `.ipa` URL.

> **When an INTERACTIVE build is required (rare):** only when **iOS capabilities change** (e.g. you add a new entitlement). Non-interactive `eas build` *skips* provisioning-profile regeneration, so after enabling a capability on the App ID (developer.apple.com → Identifiers → `com.defensivepedal.mobile`), the USER runs `npx eas build --platform ios --profile production` (no `--non-interactive`) once to regenerate the profile.

### Submit to TestFlight (note the quirks!)
```bash
cd C:\dev\defpedal\apps\mobile
# 1) APP_VARIANT MUST be set or app.config.ts resolves the .dev bundle:
$env:APP_VARIANT="production"; $env:EXPO_PUBLIC_APP_ENV="production"   # PowerShell
# 2) eas submit will NOT read EXPO_ASC_* and cannot set up a key in --non-interactive.
#    Temporarily add the ASC key to eas.json submit.production.ios, submit, then REVERT it
#    (keep the machine-specific .p8 path OUT of git — committed eas.json keeps only ascAppId+appleTeamId):
#    "ascApiKeyPath": "C:/dev/adminInfo/apple_app_store_connect_api/AuthKey_HK7JVSQ89Q.p8",
#    "ascApiKeyId": "HK7JVSQ89Q",
#    "ascApiKeyIssuerId": "bb1a088b-0532-40c9-be0c-fa0c90b1998b"
npx --no-install eas submit --platform ios --profile production --id <BUILD_ID> --non-interactive
# then: git checkout apps/mobile/eas.json   (revert the 3 ascApiKey* lines)
```

### Reading EAS build logs headlessly (the only way to see real errors)
`eas build:view <id> --json` returns a generic error; the real log is `.logFiles[0]` — a **signed GCS URL (valid ~15 min), gzip-compressed, bunyan JSON-per-line**:
```bash
URL=$(npx --no-install eas build:view <BUILD_ID> --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).logFiles[0]))")
curl -s --compressed "$URL" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const l of s.split('\n').filter(Boolean)){try{const o=JSON.parse(l);const m=(o.msg||(o.err&&o.err.message)||'').trim();if(m)console.log('['+o.phase+'] '+m)}catch(e){}}})" | tail -60
```
Filter by `phase`: `INSTALL_DEPENDENCIES`, `INSTALL_PODS`, `RUN_FASTLANE` (Xcode compile/sign).

### Project gates before any commit/push (enforced by pre-push hook)
```bash
cd C:\dev\defpedal
npm run typecheck            # must be clean (api+mobile+web)
npm run check:bundle         # must be HTTP 200 (Metro must be running: cd apps/mobile && npx expo start)
# lint ratchet runs on push; never use --no-verify
```
Commit to `main`, descriptive message, then `git push origin main`. (Pushing `apps/web` changes auto-deploys to Vercel.)

---

## 6. STEP 4 — Finalize the App Store listing  [USER, browser + device]

Everything is paste-ready in **`docs/plans/ios-appstore-connect-fill-in.md`** (name, subtitle, description, keywords, category, age rating, App Privacy labels, export compliance, review notes). Open it and fill App Store Connect. Remaining content only the user can produce:

- **Screenshots** — capture on the iPhone (Settings → … or the side-button+volume-up): 6 screens — ① route-preview risk breakdown, ② navigation + hazard alert, ③ map with community hazards + bike lanes, ④ post-ride impact summary, ⑤ Trophy Case / holo badges, ⑥ City Heartbeat / leaderboard. Upload the **6.9-inch (1320×2868)** set (required); add the **6.5-inch (1242×2688)** set if easy.
- **Demo account** — create a real email/password account in the app; put the credentials in App Store Connect → version → **App Review Information** (the reviewer needs it to reach community/account screens). Use the review note in the fill-in doc.

App Privacy correction already applied: **Photos IS collected** (profile avatar uploads to Supabase Storage), tracking = No everywhere, **no ATT prompt**.

---

## 7. STEP 5 — Submit for review + phased release  [USER]

Only after Phase C is green and the listing is complete:
1. On the version page, **Submit for Review** (Claude cannot click this).
2. Apple review: typically 24–48 h. Likely-rejection watch items (all handled, but verify on device first): **Sign in with Apple works** (4.8), **background location justified** in the review note (5.1.1), **UGC report/block present** (1.2 — already shipped).
3. On approval → release with **Phased Release ON** (Apple's 7-day 1%→100% ramp). Watch Sentry crash-free + App Store Connect metrics each day; pause if crash-free drops below ~99.5%.
4. After it's live: add Spain/Romania/etc. under Availability; the Spanish/Romanian store localizations are optional follow-ups.

---

## 8. Reference docs (read for full context)
- **`docs/plans/ios-app-store-release.md`** — the master plan (Phases A–E, risk register, what changed since the 2026-04-23 plan).
- **`docs/plans/ios-appstore-connect-fill-in.md`** — paste-ready listing + privacy labels (STEP 4).
- **`docs/plans/ios/01-technical-readiness.md`, `02-store-listing-assets.md`, `03-qa-review.md`** — the original audits.
- **`progress.md`** (Session 74 entries) — the full build narrative + the 10-fix recipe.
- **Memory `reference_ios-build-submit-recipe`** (auto-loaded via MEMORY.md in this project) — condensed build/submit recipe.

## 9. The 10 first-build fixes (already committed — context if a build regresses)
1. First iOS Distribution Cert → must be an **interactive** `eas build` (one-time; done).
2. `ENOSPC` → `.gitignore` excludes `apkreleases/`,`*.apk`,`*.aab`.
3. `EACCES mkdir node_modules` → root `.easignore` (excludes node_modules + heavy local content).
4–5. Windows archive → read-only dirs on builder → `eas-build-pre-install: chmod -R u+w ${EAS_BUILD_WORKINGDIR:-../..}` in **both** root + `apps/mobile` `package.json`.
6. `sharp` native build fails → moved to `optionalDependencies` (non-fatal).
7. Mapbox SDK 403 → `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` needs **`Downloads:Read`** scope (current token has it).
8. Provisioning profile missing **Associated Domains** → capability enabled on App ID + interactive profile regen (done).
9. Xcode-16 `EXFatal` undeclared → `patches/expo-sensors+15.0.8.patch` (postinstall patch-package applies it).
10. `eas submit` → needs `APP_VARIANT=production` + ASC key in `eas.json` (see STEP 3).

## 10. "Done" definition
App Store listing public (phased release ramping/complete), crash-free ≥ 99.5% on iOS in Sentry, no open P0/P1 from Phase C. Then update `progress.md`, `todo.md` (move "iPhone validation" to Completed), and this guide's status.
