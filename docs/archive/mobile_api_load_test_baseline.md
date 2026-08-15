# Mobile API Load-Test Baseline

Last updated: 2026-03-17

This file captures the local baseline evidence gathered during the mobile-first stabilization pass.

## Environment

- Date: 2026-03-17
- Repo branch: `codex/mobile-stable-baseline`
- API instance: isolated local `mobile-api` process on `http://127.0.0.1:18080`
- Shared-store backend: `memory`
- Notes:
  - the isolated process used local-only elevated rate-limit env values so the run measured route/cache latency instead of the rate limiter
  - these results are a local feature-development baseline, not a Redis-backed staging result

## Commands Used

Smoke:

```bash
node ./scripts/load-test-mobile-api.mjs --profile smoke --base-url http://127.0.0.1:18080 --operations health,coverage,preview,reroute
```

Steady:

```bash
node ./scripts/load-test-mobile-api.mjs --profile steady --base-url http://127.0.0.1:18080 --operations health,coverage,preview,reroute --duration-ms 30000 --concurrency 4
```

Burst:

```bash
node ./scripts/load-test-mobile-api.mjs --profile burst --base-url http://127.0.0.1:18080 --operations health,coverage,preview,reroute
```

## Results

### Smoke

- Total requests: `12`
- Error rate: `0.00%`
- Overall latency:
  - average: `100 ms`
  - p95: `550 ms`
  - p99: `550 ms`
- Route cache:
  - preview hits/misses: `4 / 1`
  - reroute hits/misses: `2 / 2`
- Report:
  - `output/load-tests/mobile-api-smoke-2026-03-17T07-38-38-244Z.json`

### Steady

- Duration: `30 s`
- Concurrency: `4`
- Total requests: `36328`
- Error rate: `0.00%`
- Overall latency:
  - average: `3 ms`
  - p95: `4 ms`
  - p99: `6 ms`
- Route cache:
  - preview hits/misses: `21839 / 2`
  - reroute hits/misses: `9604 / 8`
- Report:
  - `output/load-tests/mobile-api-steady-2026-03-17T07-40-01-725Z.json`

### Burst

- Duration: `30 s`
- Concurrency: `14`
- Total requests: `66111`
- Error rate: `0.00%`
- Overall latency:
  - average: `6 ms`
  - p95: `10 ms`
  - p99: `16 ms`
- Route cache:
  - preview hits/misses: `41148 / 14`
  - reroute hits/misses: `16555 / 28`
- Report:
  - `output/load-tests/mobile-api-burst-2026-03-17T07-40-39-668Z.json`

## Interpretation

- The route-core backend path is now stable enough for ongoing frontend and feature development.
- Health, coverage, safe-route preview, and reroute all behaved consistently under local smoke, steady, and burst traffic.
- The cache path is working and dominates latency after the first miss, which is expected for repeated route requests in this harness.

## Deferred Follow-Ups

- This baseline does not replace a Redis-backed staging run.
- On 2026-03-17, the current local Mapbox geocoding token returned `401` during direct validation, so autocomplete/search was intentionally excluded from the isolated branch-owned baseline run.
- Staging smoke/steady/burst validation with Redis enabled remains the next production-hardening step.
