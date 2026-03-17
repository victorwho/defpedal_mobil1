# Mobile API Operations Runbook

Last updated: 2026-03-16

This runbook covers deployment, rollout, caching, Redis cutover, health checks, and load testing
for `services/mobile-api`.

## Purpose

`services/mobile-api` is the production boundary for:

- safe-route preview and reroute orchestration
- Mapbox-backed fast routing, autocomplete, and reverse geocoding
- elevation and risk enrichment
- authenticated writes for trips, hazards, and feedback
- route caching and rate limiting

## Deployment Shape

Current deployment target:

- containerized Node service using `services/mobile-api/Dockerfile`
- Cloud Run or a similar managed container platform
- HTTPS load balancer in front
- Redis enabled for shared cache and rate-limit state

Recommended production layout:

1. `mobile-api` instances behind managed HTTPS
2. Redis for shared route caching and rate limiting
3. Supabase as auth and data system of record
4. OSRM safe-routing cluster reachable from the API
5. Mapbox and elevation providers reachable from the API

## Required Runtime Configuration

Core:

- `PORT`
- `LOG_LEVEL`
- `CORS_ORIGIN`
- `SAFE_OSRM_BASE_URL`
- `MAPBOX_ACCESS_TOKEN`
- `MAPBOX_GEOCODING_BASE_URL`
- `MAPBOX_DIRECTIONS_BASE_URL`

Auth and write path:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Shared cache / rate limit:

- `REDIS_URL`
- `REDIS_KEY_PREFIX`
- `REDIS_CONNECT_TIMEOUT_MS`

Coverage and versioning:

- `SUPPORTED_SAFE_COUNTRIES`
- `ROUTING_ENGINE_VERSION`
- `ROUTING_PROFILE_VERSION`
- `MAP_DATA_VERSION`
- `RISK_MODEL_VERSION`

Traffic controls:

- `ROUTE_PREVIEW_CACHE_TTL_MS`
- `ROUTE_REROUTE_CACHE_TTL_MS`
- `RATE_LIMIT_ROUTE_PREVIEW_MAX`
- `RATE_LIMIT_ROUTE_PREVIEW_WINDOW_MS`
- `RATE_LIMIT_ROUTE_REROUTE_MAX`
- `RATE_LIMIT_ROUTE_REROUTE_WINDOW_MS`
- `RATE_LIMIT_WRITE_MAX`
- `RATE_LIMIT_WRITE_WINDOW_MS`

## Release Checklist

1. Run `npm run validate`
2. Confirm Android validation status in `native_android_validation.md`
3. Confirm production secrets exist in the target environment
4. Confirm `REDIS_URL` is configured for multi-instance rollout
5. Confirm `/health` returns `sharedStoreBackend: "redis"` in staging before production rollout
6. Run the steady load-test profile against staging
7. Review logs for rate-limit spikes, provider errors, and cache behavior
8. Deploy to production
9. Re-check `/health`
10. Run a smoke load test against production

## Local And Staging Load Tests

The repo now includes:

- script: `scripts/load-test-mobile-api.mjs`
- npm entrypoints:
  - `npm run loadtest:api:smoke`
  - `npm run loadtest:api:steady`
  - `npm run loadtest:api:burst`

Default target:

- `http://127.0.0.1:8080`

Example staging run:

```bash
node ./scripts/load-test-mobile-api.mjs --profile steady --base-url https://staging-api.example.com
```

Example production smoke run:

```bash
node ./scripts/load-test-mobile-api.mjs --profile smoke --base-url https://api.example.com
```

Reports are written to:

- `output/load-tests/`

The script measures:

- total requests
- error rate
- p50 / p95 / p99 latency
- per-endpoint latency
- route cache hit / miss counts for preview and reroute
- HTTP status distribution

The script exits non-zero if thresholds are exceeded.

## Load-Test Guidance

Use the profiles this way:

- `smoke`
  - short confidence check after deploy
- `steady`
  - staging or production-like verification against route preview/reroute/search traffic
- `burst`
  - short spike test for cache, rate-limit, and upstream resilience

Important:

- preview and reroute endpoints are rate limited
- if you want to measure service capacity rather than rate-limit behavior, temporarily raise the
  route/reroute limit values in staging before the test
- do not run `burst` against production during peak rider traffic

## Redis Rollout

Staging:

1. Set `REDIS_URL`
2. Deploy `mobile-api`
3. Check `/health`
4. Confirm `sharedStoreBackend` changes from `memory` to `redis`
5. Run smoke and steady load tests

Production:

1. Deploy with `REDIS_URL`
2. Confirm `/health`
3. Watch for:
   - higher error rates
   - route cache anomalies
   - Redis connection failures
4. If Redis causes instability, unset `REDIS_URL` and redeploy to fall back to in-memory storage

## Rollback Guidance

If production issues appear:

1. Roll back the container revision
2. Re-check `/health`
3. Run `smoke` load test against the rolled-back revision
4. If the issue is Redis-related, remove `REDIS_URL` and redeploy
5. If the issue is routing-profile related, revert the routing version env vars to the last known
   stable values

## Health And SLO Checks

Target SLOs from the implementation plan:

- mobile API availability: `99.9%`
- route preview p95: under `2500 ms`
- reroute p95: under `2000 ms`

Operational checks:

- `GET /health`
- request telemetry logs
- route cache hit/miss logs
- rate-limit warning logs

## Known Gaps

- no full synthetic load test for authenticated write endpoints yet
- no iPhone validation yet
- no automatic post-deploy canary gate yet

This runbook is the current operational baseline until deeper rollout automation is added.
