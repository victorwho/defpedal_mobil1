# Mobile API

Fastify-based backend-for-frontend for the React Native app.

## Responsibilities

- Route preview and reroute orchestration
- Safe routing via the custom OSRM cluster
- Fast routing via Mapbox Directions
- Search and reverse geocoding proxy
- Elevation enrichment
- Risk segment enrichment from Supabase/PostGIS
- Coverage resolution and rollout gates

## Local development

1. Copy `.env.example` to `.env`.
2. Install workspace dependencies from the repo root with `npm install`.
3. Run `npm run dev:api` from the repo root.

## Load testing

From the repo root:

```bash
npm run loadtest:api:smoke
npm run loadtest:api:steady
npm run loadtest:api:burst
```

Use `scripts/load-test-mobile-api.mjs --base-url ...` to target staging or production-like
environments directly.

## Operations

Deployment, Redis rollout, and load-test guidance live in:

- `mobile_api_operations_runbook.md`
