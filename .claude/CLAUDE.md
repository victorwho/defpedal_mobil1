# Defensive Pedal — Project Rules

## Bundle Health Check (MANDATORY)

After making any code changes to `apps/mobile/` or `packages/core/`, **always run the bundle check before telling the user to test on phone**:

```bash
npm run check:bundle
```

- If ✅ (HTTP 200) → safe to test
- If ❌ (HTTP 500) → fix the error before proceeding
- If Metro is not running → start it first: `cd apps/mobile && npx expo start`

**Never skip this step.** Blank screens on the phone are almost always caused by a bundle build error that this check catches.

## Project Paths

- **Main repo:** `C:\dev\defpedal` (short path, use this for all builds)
- **Metro:** run from `C:\dev\defpedal\apps/mobile`
- **API:** run from `C:\dev\defpedal\services/mobile-api`
- **Debug APK build:** `cd C:\dev\defpedal\apps\mobile\android && ./gradlew installDebug`
- **Release APK build:** use `C:\dpb` copy (for preview variant, avoids CMake path issues)

## Phone Connection

After USB reconnect, always restore port forwarding:
```bash
adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8080 tcp:8080
```

## Cloud Run API

- Production URL: `https://defpedal-api-1081412761678.europe-central2.run.app`
- GCP Project: `gen-lang-client-0895796477`
- Region: `europe-central2`
- Redeploy: `gcloud builds submit --config cloudbuild.yaml --timeout=600`

## App Variants

| Variant | Package | Name | How it gets JS |
|---------|---------|------|---------------|
| development | `com.defensivepedal.mobile.dev` | Defensive Pedal Dev | Metro via USB (hot reload) |
| preview | `com.defensivepedal.mobile.preview` | Defensive Pedal Preview | Embedded bundle (untethered, Cloud Run API) |
| production | `com.defensivepedal.mobile` | Defensive Pedal | Embedded bundle |

## Commit Workflow

1. Make changes
2. Run `npm run check:bundle` ✅
3. Test on phone
4. Commit to main with descriptive message
5. Update `progress.md` with what was done
6. Push to GitHub: `git push origin main`
