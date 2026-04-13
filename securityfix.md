# Risk Score IP Protection — Security Fixes

Generated: 2026-04-13

## Problem

The road risk scoring algorithm (core IP) is fully extractable by external actors through multiple API endpoints. Raw floating-point risk scores are returned in responses, several endpoints require no authentication, and rate limiting is insufficient to prevent systematic scraping.

## Attack Vectors

| Endpoint | Auth | Rate Limit | Raw Score Exposed | Severity |
|---|---|---|---|---|
| `POST /v1/routes/preview` | None | 30/min per IP (in-memory) | Full float (e.g. `54.3`) | **P0** |
| `GET /v1/risk-map` | None | **None at all** | Full GeoJSON dump | **P0** |
| `POST /v1/risk-segments` | None | 30/min per IP | Full float | **P0** |
| `POST /v1/routes/reroute` | None | 60/min per IP | Full float | **P0** |
| `GET /v1/safety-score` | Anon session | 20/min per user | Aggregated counts | P1 |
| `POST /v1/loop-route` | Anon session | 20/min per user | Full float | P1 |
| OSRM direct | None | None | Behavior only (side channel) | P2 |

### Worst case: `/v1/risk-map`

Zero rate limiting for unauthenticated callers. Returns bulk GeoJSON with risk scores. Bucharest can be tiled in ~36 requests (5km radius grid). Complete city extraction in under a minute with a curl loop.

### Second worst: `/v1/routes/preview`

No auth, 30 req/min per IP. With 10 rotating proxy IPs (~$50/month), attacker harvests ~15,000 segment scores per minute. Complete city coverage in under an hour. In-memory rate limiter resets on each Cloud Run instance.

## Fixes

### P0 — Fix immediately

1. **Strip `riskScore` from API responses** — return only the color/category string. The mobile client renders colors, not numbers. Change `services/mobile-api/src/lib/risk.ts` to omit `riskScore` from the response object. Update `RiskSegment` type in `packages/core/src/contracts.ts` accordingly.

2. **Add auth to `/v1/risk-map` and always apply rate limiting** — the current code at `v1.ts:1548-1551` skips rate limiting for unauthenticated callers. Require at minimum an anonymous Supabase session and always apply the rate limit.

3. **Add auth to `/v1/routes/preview`** — require an authenticated user (anonymous session acceptable). The mobile app already obtains one during onboarding.

4. **Add auth to `/v1/risk-segments`** — same as above.

5. **Add auth to `/v1/routes/reroute`** — same as above.

### P1 — Before next release

6. **Activate Redis rate limiting** — the in-memory limiter (`createMemoryRateLimiter`) is per-Cloud-Run-instance. Under horizontal scaling, each new instance starts with a fresh window. Activate by provisioning GCP Memorystore and setting `REDIS_URL`.

7. **Rate-limit by user identity, not IP** — IP keying is defeated by VPN/proxy rotation. Use `userId` from the authenticated session.

8. **Quantize scores to 4-5 buckets** — return `'safe' | 'moderate' | 'risky' | 'dangerous'` instead of `54.2`. Gives the app everything it needs while destroying the precision needed to reconstruct the model.

### P2 — Longer term

9. **Require Google OAuth (not anonymous) for risk data** — anonymous Supabase sessions are trivially created in bulk. Requiring OAuth adds friction without impacting real users.

10. **Move score thresholds server-side only** — thresholds (`33, 43.5, 51.8, 57.6, 69, 101.8`) in `riskDistribution.ts` and `risk.ts` are visible in the compiled JS bundle. Compute categories server-side only and remove thresholds from the client bundle.

## Status

| # | Fix | Status |
|---|-----|--------|
| 1 | Quantize `riskScore` to bucket midpoints | FIXED (2026-04-13) |
| 2 | Auth + rate limit on `/v1/risk-map` | FIXED (2026-04-13) |
| 3 | Auth on `/v1/routes/preview` | FIXED (2026-04-13) |
| 4 | Auth on `/v1/risk-segments` | FIXED (2026-04-13) |
| 5 | Auth on `/v1/routes/reroute` | FIXED (2026-04-13) |
| 6 | Redis rate limiting | OPEN (deferred — needs GCP Memorystore) |
| 7 | User-keyed rate limits | OPEN |
| 8 | Quantize scores to buckets | OPEN |
| 9 | Require OAuth for risk data | OPEN |
| 10 | Server-side thresholds only | OPEN |
