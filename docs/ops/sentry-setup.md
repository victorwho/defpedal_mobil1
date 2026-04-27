# Sentry Setup — Defensive Pedal

One-time setup to wire the Sentry React Native v8 SDK to a real Sentry project. The SDK + JS init are already in place; this doc covers the bits that need a real Sentry account.

## Why we need this

- **Crash symbolication on release builds.** Without source maps + native debug symbols, Sentry shows minified Hermes stack traces that are useless for debugging.
- **The Privacy & Analytics screen** in the app has a Sentry toggle that's currently hidden because `sentryConfigured` is `false` (no DSN in `.env`). Once a DSN is set, the toggle appears and users can opt in.
- **Compliance plan item 8** depends on this for the "Optional (consent)" annotation in the Play Console Data Safety form (item 9).

## What's already wired up in code

- `@sentry/react-native@8.4.0` in `apps/mobile/package.json`.
- `Sentry.init({ dsn, environment, tracesSampleRate, sendDefaultPii: false })` in `apps/mobile/src/lib/telemetry.ts`, gated by user consent.
- `Sentry.wrap(RootLayout)` in `apps/mobile/app/_layout.tsx` — captures unhandled rejections + React breadcrumbs.
- `app.config.ts` reads `SENTRY_ORG` and `SENTRY_PROJECT` from process env and conditionally registers the `@sentry/react-native/expo` config plugin.
- `mobileEnv.sentryDsn` reads `EXPO_PUBLIC_SENTRY_DSN`.

## What you need to do (5 minutes at sentry.io)

1. **Create a Sentry account / sign in** at https://sentry.io. Free tier is fine for this scale.
2. **Create an organization** (or use an existing one). Note the **org slug** — it's the URL fragment, e.g. `https://sentry.io/organizations/<org-slug>/`.
3. **Create a project**:
   - Platform: **React Native**
   - Project name: `defensive-pedal-mobile`
   - Alert frequency: defaults are fine
   - Note the **project slug** (usually matches the project name, lowercased).
4. After creation, Sentry shows a quickstart page with the **DSN** — looks like `https://abc123@o45678.ingest.sentry.io/9876543`. Copy it.
5. **Generate an auth token** for source-map uploads:
   - Go to https://sentry.io/settings/account/api/auth-tokens/
   - Click **Create New Token**
   - Scopes needed: `project:releases`, `project:write`, `org:read`
   - Name it something like `defensive-pedal-mobile-eas-uploads`
   - Copy the token (you only see it once).

## What to send back

Three values:

```
DSN          = https://...@o....ingest.sentry.io/...
SENTRY_ORG   = <your-org-slug>
SENTRY_PROJECT = defensive-pedal-mobile  (or whatever you named it)
```

(The auth token doesn't go through me — see below.)

## Where the values land

Once you send the three values:

1. I'll add to `apps/mobile/.env`:
   ```
   EXPO_PUBLIC_SENTRY_DSN=<DSN>
   EXPO_PUBLIC_SENTRY_ENVIRONMENT=development
   SENTRY_ORG=<org-slug>
   SENTRY_PROJECT=<project-slug>
   ```
2. The `@sentry/react-native/expo` plugin auto-activates on next `expo prebuild` (it's gated on `SENTRY_ORG` + `SENTRY_PROJECT` being set in env).
3. The Privacy & Analytics toggle for crash reports starts appearing.

## Auth token (you do this directly, never via me)

The auth token is a write-credential to your Sentry org. Do NOT paste it in chat or commit it. Set it as an EAS secret so cloud builds can upload source maps:

```bash
eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <your-token>
```

Verify with `eas secret:list`. The plugin reads `SENTRY_AUTH_TOKEN` from the EAS build env automatically — no further config needed.

For LOCAL release builds (`./gradlew assembleProductionRelease`), set the same variable in your shell or `~/.gradle/gradle.properties`:
```
SENTRY_AUTH_TOKEN=<your-token>
```

## Verification

After the DSN is set + a build is shipped:

1. Open the app, walk through onboarding consent, toggle **Share crash reports** ON.
2. Trigger a test error. From a debugger or `adb shell`:
   ```js
   require('@sentry/react-native').captureException(new Error('test event'))
   ```
3. Open the Sentry Issues view for the project. Should see the event within 30s.
4. For a release build with proper source maps, the stack trace shows TypeScript file names + line numbers. Without source maps you'll see Hermes bytecode addresses — that means `SENTRY_AUTH_TOKEN` wasn't set during the build.

## Costs

- **Free tier:** 5K errors/month, 10K performance units, 50 replays. Fine for the launch period.
- **Paid:** $26/mo for the Team plan if you outgrow free. Worth tracking after launch.

## Privacy/legal note

- Sentry stores stack traces, device info, and breadcrumbs. The `sendDefaultPii: false` flag in our `Sentry.init` already disables IP / cookie / user-agent capture by default. We pass `id` only (no email) for anonymous users.
- The Privacy Policy (item 3 of the compliance plan) must mention Sentry as a sub-processor.
- Sentry has EU-region data residency available — pick the EU region when you create the org if you want to keep all data in EEA. This affects the privacy policy's "international transfers" section.
