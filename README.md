# Defensive Pedal

This repository now contains the original web app plus the first implementation slice of the
mobile-first migration:

- `packages/core`: shared route, navigation, and API contract logic
- `services/mobile-api`: Fastify backend-for-frontend for mobile routing/search
- `apps/mobile`: Expo/React Native app scaffold
- root web app: the current React/Vite reference implementation

## Workspace layout

```text
defpedal_mobil1/
  apps/mobile
  packages/core
  services/mobile-api
  components
  hooks
  services
  utils
```

## What is implemented

- Shared core package for route types, formatting, distance math, route analysis, navigation
  helpers, and normalized mobile API contracts
- Mobile API scaffold for:
  - `GET /health`
  - `GET /v1/coverage`
  - `POST /v1/routes/preview`
  - `POST /v1/routes/reroute`
  - `POST /v1/search/autocomplete`
  - `POST /v1/search/reverse-geocode`
- Expo app scaffold with:
  - typed routing
  - global providers
  - route planning and preview screens
  - navigation session shell
  - offline/auth/settings placeholders
  - Mapbox-backed route preview component
- Existing web app now reads shared logic from `packages/core` through re-exported local modules

## Run locally

Prerequisites:

- Node.js 22+
- npm 10+

Install workspace dependencies from the repo root:

```bash
npm install
```

Run the existing web app:

```bash
npm run dev:web
```

Run the mobile API:

```bash
npm run dev:api
```

Run the Expo app:

```bash
npm run dev:mobile
```

Run the repeatable native Android validation workflow on Windows:

```powershell
npm run android:validate:native
```

Run the repo validation suite locally:

```bash
npm run validate
```

## Environment

- Web app: existing `.env` / `.env.example`
- Mobile app: `apps/mobile/.env.example`
- Mobile API: `services/mobile-api/.env.example`

### Mobile app variants

The Expo config now supports three app variants:

- `development`
- `preview`
- `production`

Set these in `apps/mobile/.env` for local work when needed:

```env
APP_VARIANT=development
EXPO_PUBLIC_APP_ENV=development
```

Variant-specific env files are also supported:

- `apps/mobile/.env.development`
- `apps/mobile/.env.preview`
- `apps/mobile/.env.production`

The mobile app bundle/package identifiers change by variant:

- `development` -> `com.defensivepedal.mobile.dev`
- `preview` -> `com.defensivepedal.mobile.preview`
- `production` -> `com.defensivepedal.mobile`

### Native Mapbox Android builds

For native Android builds with `@rnmapbox/maps`, provide a secret Mapbox download token:

- `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`

Local validation also falls back to existing secret-token env keys like `MAPBOX_ACCESS_TOKEN` or
`VITE_MAPBOX_ACCESS_TOKEN` when they contain an `sk.` token, which matches the current repo setup.

The short-path Android validation flow in [native_android_validation.md](./native_android_validation.md)
uses that token during Expo prebuild so Gradle can resolve native Mapbox dependencies.

### Mobile observability

The mobile app now supports env-driven observability wiring:

- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_SENTRY_ENVIRONMENT`
- `EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`
- `EXPO_PUBLIC_POSTHOG_API_KEY`
- `EXPO_PUBLIC_POSTHOG_HOST`

When those values are present, the app will:

- initialize Sentry for crash/error capture
- initialize PostHog for product analytics
- track key events like route preview success/failure, navigation start/completion, reroutes,
  auth events, and offline sync outcomes
- expose telemetry configuration status in the native Settings screen

The mobile API also emits structured request telemetry logs for key endpoints such as route
preview, reroute, search, trips, hazards, and feedback.

### Mobile API load testing

The repo now includes a lightweight load-test harness for `mobile-api`:

- `npm run loadtest:api:smoke`
- `npm run loadtest:api:steady`
- `npm run loadtest:api:burst`

By default, the harness targets `http://127.0.0.1:8080` and writes JSON reports to:

- `output/load-tests/`

Use `--base-url` to point it at staging or production-like environments.

### Mobile API protection

The mobile API now includes a first production-hardening baseline for:

- route preview caching
- reroute caching
- per-endpoint rate limiting for route preview, reroute, and authenticated write endpoints
- optional shared Redis backing for multi-instance production

Key env knobs live in [services/mobile-api/.env.example](./services/mobile-api/.env.example):

- `REDIS_URL`
- `REDIS_KEY_PREFIX`
- `REDIS_CONNECT_TIMEOUT_MS`
- `ROUTE_PREVIEW_CACHE_TTL_MS`
- `ROUTE_REROUTE_CACHE_TTL_MS`
- `RATE_LIMIT_ROUTE_PREVIEW_MAX`
- `RATE_LIMIT_ROUTE_PREVIEW_WINDOW_MS`
- `RATE_LIMIT_ROUTE_REROUTE_MAX`
- `RATE_LIMIT_ROUTE_REROUTE_WINDOW_MS`
- `RATE_LIMIT_WRITE_MAX`
- `RATE_LIMIT_WRITE_WINDOW_MS`

When `REDIS_URL` is set, the mobile API uses Redis for shared route caching and rate limiting.
Without it, local development and tests continue to use the in-memory backend.

## CI and EAS

- GitHub Actions CI now runs from [ci.yml](./.github/workflows/ci.yml)
- GitHub Actions mobile release automation now runs from [mobile-release.yml](./.github/workflows/mobile-release.yml)
- EAS build profiles live in [eas.json](./apps/mobile/eas.json)
- The release runbook lives in [mobile_release_runbook.md](./mobile_release_runbook.md)
- The mobile API rollout runbook lives in [mobile_api_operations_runbook.md](./mobile_api_operations_runbook.md)

Example preview build from the mobile app directory:

```bash
cd apps/mobile
npx eas-cli build --profile preview --platform android
```

Example production build:

```bash
cd apps/mobile
npx eas-cli build --profile production --platform android
```

Manual dispatch is now available in GitHub Actions through `Mobile Release`, which:

- runs `npm run validate`
- triggers an EAS build for `android` or `ios`
- optionally enables `--auto-submit`
- uses the `preview` and `production` submit targets configured in `apps/mobile/eas.json`

The current submit defaults are:

- `preview` Android -> Google Play `internal`
- `production` Android -> Google Play `production` as `draft`
- iOS -> App Store Connect / TestFlight using the configured Expo credentials

## Migration reference

The end-to-end migration plan lives in [mobile_implementation_plan.md](./mobile_implementation_plan.md).
The current Android validation status and workflow live in [native_android_validation.md](./native_android_validation.md).
The current release automation and rollout guidance live in [mobile_release_runbook.md](./mobile_release_runbook.md).
The current mobile API deployment and load-test guidance live in [mobile_api_operations_runbook.md](./mobile_api_operations_runbook.md).
