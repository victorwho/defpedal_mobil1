# Monitoring runbook — Sentry + PostHog + Cloud Run

How to check production health headlessly from this machine. No secrets in
this file — only where they live (all locations are gitignored / outside
the repo). First written 2026-07-23 (session 96) after the v0.2.119 release
health check; keep the "healthy baseline" numbers updated as the fleet grows.

## Access

| System | Auth | Where |
|---|---|---|
| Sentry (org `defensive-pedal`, region `https://de.sentry.io`, project `defensive-pedal-mobile`) | Claude Code Sentry MCP plugin (interactive sessions) OR `SENTRY_AUTH_TOKEN` (`sntryu_` user token, has alert-write scope) | token in `apps/mobile/.env` (gitignored) |
| PostHog (EU, project id `162527`) | Personal API key "Claude Code" (`phx_…`) | `C:\dev\adminInfo\posthog\personal-api-key.txt` (outside repo) |
| Cloud Run (`defpedal-api`, `europe-central2`) | gcloud (already authed) | always pass `--project gen-lang-client-0895796477` |
| Supabase live DB | `supabase db query --linked` (CLI authed, project `pedal1`) | run from repo root |

The mobile app and the API report into the SAME Sentry project
(`defensive-pedal-mobile`); discriminate by release: mobile releases look
like `com.defensivepedal.mobile@X.Y.Z+BUILD`, API releases like
`defpedal-api-00NNN-xxx`.

## Standard health check (run each of these)

1. **New Sentry issues** (last few days):
   `search_issues(org='defensive-pedal', query='is:unresolved firstSeen:-5d', sort='user')`
2. **Error counts by release** — catches API bursts and bad mobile releases:
   `search_events(dataset='errors', fields=['release','app_variant','count()'], sort='-count()', period='5d')`
3. **Unhandled mobile crashes for the current release** (the rollout-gate proxy):
   `search_events(dataset='errors', query='release:com.defensivepedal.mobile@<ver> handled:no', fields=['title','count()','count_unique(user)'])`
   (True crash-free % + ANR still need Play Console Android Vitals.)
4. **PostHog daily volume + users** (HogQL via
   `POST https://eu.posthog.com/api/projects/162527/query/`,
   header `Authorization: Bearer <personal key>`):
   ```sql
   SELECT toDate(timestamp) AS day, count() AS events,
          count(DISTINCT person_id) AS users
   FROM events WHERE timestamp > now() - INTERVAL 14 DAY
   GROUP BY day ORDER BY day
   ```
5. **PostHog error channel**:
   ```sql
   SELECT properties.message AS msg, count() AS c FROM events
   WHERE event = 'mobile_error' AND timestamp > now() - INTERVAL 4 DAY
   GROUP BY msg ORDER BY c DESC LIMIT 10
   ```
6. **Cloud Run revision sanity**: `gcloud run revisions list …` — confirm
   which revision serves 100% and that Sentry errors aren't pinned to it.

## Healthy baselines (as of 2026-07-23, ~70 DAU reporting)

- Mobile errors: ≤ ~5/day, dominated by known benign titles (OSRM NoRoute,
  request timeouts, NoSegment, route-too-long guard). Unhandled crashes ≈ 0.
- API errors: ≤ ~10/day, dominated by "Elevation profile fetch failed"
  (external Mapbox Terrain flake, no user impact — clients fall back).
- PostHog: ~1,000–1,200 events/day, 50–75 distinct users/day (post
  default-ON, 07-20). `mobile_error` ≤ ~10/day, all known messages.
- A sudden PostHog volume DROP is as significant as an error spike — it can
  mean the consent plumbing or the SDK broke.

## Alerting

- **Sentry issue-alert rule 733370 "API error burst (defpedal-api releases)"**
  (created 2026-07-23 via REST): fires when an issue with release containing
  `defpedal-api` exceeds >30 events/1h OR >75 events/1d; emails active org
  members; 60-min renotify. Created because the 2026-07-21 hazards burst
  (~130 errors in 45 min from one wedged Cloud Run instance, fixed by a
  same-image redeploy) fired nothing — the default rule 512369 only
  triggers on NEW issues, and recurring HttpErrors group into existing ones.
- Known infra failure mode: a single wedged Cloud Run instance failing one
  endpoint at full rate. Remedy: redeploy the same image
  (`gcloud run deploy … --image …:latest`) — takes ~1 min, zero downtime.

## Known-benign error catalog (don't chase these)

- `Route is too long for fast routing…` — client-side validation message.
- `OSRM routing failed (400) NoRoute` / `NoSegment` — user pin placement.
- `Elevation profile fetch failed` — Mapbox Terrain-RGB flake; retried/fallback.
- `ApiClientError: Request timed out` — mobile network conditions.
- Single-user Android `WorkManager "job with no constraints"` crash — on the
  watchlist; investigate only if it grows with rollout percentage.
