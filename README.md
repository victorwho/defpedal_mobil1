# Defensive Pedal

Mobile cycling safety app built with Expo/React Native.

## Workspace layout

```text
defpedal_mobil1/
  apps/mobile          Expo/React Native app
  packages/core        shared contracts, navigation logic, route helpers
  services/mobile-api  Fastify backend-for-frontend
  supabase/migrations  ordered database migrations
```

## Default workflow

1. Run the mobile API: `npm run dev:api`
2. Run the Expo mobile app: `npm run dev`
3. Validate: `npm run validate`

## Run locally

Prerequisites:

- Node.js 22+
- npm 10+

Install workspace dependencies from the repo root:

```bash
npm install
```

Run the mobile app:

```bash
npm run dev
```

Start the preview variant and auto-sync the active ngrok tunnel into `apps/mobile/.env.preview`:

```bash
npm run dev:mobile:preview
```

If you only want to refresh the preview env file without starting Expo:

```bash
npm run sync:mobile:preview-url
```

Run the mobile API:

```bash
npm run dev:api
```

Run the repeatable native Android validation workflow on Windows:

```powershell
npm run android:validate:native
```

Run the mobile validation suite:

```bash
npm run validate
```

## Environment

- Mobile app: `apps/mobile/.env.example`
- Mobile API: `services/mobile-api/.env.example`

Local-only env files such as `apps/mobile/.env`, `apps/mobile/.env.preview`, and
`services/mobile-api/.env` should stay uncommitted.

## Database migrations

Active schema changes live in `supabase/migrations/`. Apply them in filename order.

Historical SQL files from the webapp era are preserved in `supabase/migrations/legacy/` for reference only.

### Mobile app variants

The Expo config supports three app variants:

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

For the preview variant, `npm run sync:mobile:preview-url` reads the active tunnel from the local
ngrok API at `http://127.0.0.1:4040/api/tunnels` and updates `apps/mobile/.env.preview`
automatically.

The mobile app bundle/package identifiers change by variant:

- `development` -> `com.defensivepedal.mobile.dev`
- `preview` -> `com.defensivepedal.mobile.preview`
- `production` -> `com.defensivepedal.mobile`

### Native Mapbox Android builds

For native Android builds with `@rnmapbox/maps`, provide a secret Mapbox download token:

- `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`

The short-path Android validation flow in [native_android_validation.md](./native_android_validation.md)
uses that token during Expo prebuild so Gradle can resolve native Mapbox dependencies.

### Mobile observability

The mobile app supports env-driven observability wiring:

- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_SENTRY_ENVIRONMENT`
- `EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`
- `EXPO_PUBLIC_POSTHOG_API_KEY`
- `EXPO_PUBLIC_POSTHOG_HOST`

### Mobile API load testing

The repo includes a lightweight load-test harness for `mobile-api`:

- `npm run loadtest:api:smoke`
- `npm run loadtest:api:steady`
- `npm run loadtest:api:burst`

By default, the harness targets `http://127.0.0.1:8080` and writes JSON reports to `output/load-tests/`.

### Mobile API protection

The mobile API includes production-hardening for route preview/reroute caching, per-endpoint rate
limiting, and optional shared Redis backing. See `services/mobile-api/.env.example` for knobs.

## CI and EAS

- GitHub Actions CI: [ci.yml](./.github/workflows/ci.yml)
- GitHub Actions mobile release: [mobile-release.yml](./.github/workflows/mobile-release.yml)
- EAS build profiles: [eas.json](./apps/mobile/eas.json)
- Release runbook: [mobile_release_runbook.md](./mobile_release_runbook.md)
- iPhone validation: [iphone_validation.md](./iphone_validation.md)
- API operations runbook: [mobile_api_operations_runbook.md](./mobile_api_operations_runbook.md)
- Load test baseline: [mobile_api_load_test_baseline.md](./mobile_api_load_test_baseline.md)
- Stable baseline plan: [mobile_stable_baseline_plan.md](./mobile_stable_baseline_plan.md)
- Database migrations: [supabase/README.md](./supabase/README.md)
