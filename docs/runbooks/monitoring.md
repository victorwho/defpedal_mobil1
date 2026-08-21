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
7. **Trip-tracking loss check** (`trips.end_action`, live since 2026-07-29 —
   see `docs/reviews/gps-tracking-audit-2026-07-29.md`):
   ```sql
   SELECT end_action, count(*) FROM trips
   WHERE started_at > now() - interval '14 days'
   GROUP BY 1 ORDER BY 2 DESC;
   ```
   Reading it: `saved`/`discarded`/`prompt_*`/`auto_recovered` are explicit
   rider outcomes (stamped by v0.2.122+ clients); `abandoned` = the nightly
   reaper closed a trip whose trip_end never arrived (churned one-ride
   users — ~25/week at the 07-29 baseline, `ended_at` stays NULL on these);
   NULL with `ended_at` set = pre-endAction client. TRUE LOSS is a ride
   with a `ride_impacts` row but no `trip_tracks` row (3/14d before the
   ride-end drain fix; expect ~0 once v0.2.122+ dominates):
   ```sql
   SELECT count(*) FROM ride_impacts ri
   WHERE ri.created_at > now() - interval '14 days'
     AND NOT EXISTS (SELECT 1 FROM trip_tracks tt WHERE tt.trip_id = ri.trip_id);
   ```
   A sudden jump in `abandoned` or in the true-loss count is a regression
   in the offline queue / ride-end drain — treat like an error spike.

8. **Push delivery health** (Supabase SQL) — this is the signal that surfaced
   error-log #69 (Android delivery silently dead for months, visible only as a
   lopsided failed-vs-sent ratio). Since 2026-08-18 the statuses are precise:
   `failed` means **we had a token and Expo rejected the send**, and
   `suppression_reason` carries the Expo error code; everything we chose not to
   send is `suppressed` with a reason (`no_push_token`, `daily_budget`,
   `quiet_hours`, `category_disabled`):
   ```sql
   SELECT status, coalesce(suppression_reason,'(none)') AS reason,
          category, count(*) AS n, max(created_at)::date AS last_seen
   FROM notification_log
   WHERE created_at > now() - interval '30 days'
   GROUP BY 1,2,3 ORDER BY n DESC;
   ```
   **Any material count of `failed`** now deserves triage — look at the reason:
   `InvalidCredentials` = a missing/expired FCM V1 key for that package (the #69
   shape, NOT a stale token), `MessageRateExceeded` = throttling,
   `DeviceNotRegistered` = a dead token that the immediate prune should have
   removed. A large `suppressed/no_push_token` count is **expected and benign** —
   it just means the cron targeted users who never registered a device (319 such
   users at the 2026-08-17 baseline); it is a targeting-efficiency signal, not an
   outage. Rows written before 2026-08-18 use the old semantics (token-less users
   logged as `failed`, no reason), so don't compare across that date.


9. **Cron health** (Cloud Scheduler) — nothing watched cron OUTCOMES until
   2026-08-18, and `mia-notification-cron` had been returning **504 at its 300s
   deadline every single day for at least 8 days** across four revisions without
   anyone noticing. Partial cron runs are silent by nature: the job writes some
   rows, dies, and the next run starts over from the same place.
   ```bash
   gcloud scheduler jobs list --location europe-central2      --project gen-lang-client-0895796477      --format="table(name.basename(), schedule, state, lastAttemptTime, status.code)"
   ```
   `status.code` is the thing to read: **empty = OK**, `4` = DEADLINE_EXCEEDED,
   `2` = UNKNOWN/5xx. For detail, the scheduler logs the outcome per attempt:
   ```bash
   gcloud logging read 'resource.type="cloud_scheduler_job" AND severity>=ERROR'      --project gen-lang-client-0895796477 --limit 10 --freshness 2d      --format="value(timestamp, resource.labels.job_id, jsonPayload.status, jsonPayload.debugInfo)"
   ```
   **Alerting (added 2026-08-18):** alert policy *"Cloud Scheduler job failed"*
   (`alertPolicies/10278737109769293908`) fires on any `severity>=ERROR` entry in
   `cloudscheduler.googleapis.com/executions`, i.e. ANY job, and emails the
   *"Victor (defpedal ops)"* channel, rate-limited to one notification per hour.
   ✅ **Channel VERIFIED 2026-08-21** — delivery proven end-to-end via
   `notificationChannels:sendVerificationCode` → `:verify`, so
   `verificationStatus: VERIFIED` is recorded state, not an inference.

   ⚠️ **`monitoring.googleapis.com` must stay ENABLED.** It was *disabled* on
   this project when these policies were created — and creating them still
   returned 200 with real resource IDs, which read back as `enabled: True`.
   Only a service-consuming method (`sendVerificationCode`) surfaced the truth
   with `403 SERVICE_DISABLED`. So "the policy exists and looks enabled" does
   NOT prove alerting works. Check with:
   ```bash
   gcloud services list --enabled --project gen-lang-client-0895796477      --filter="config.name:monitoring.googleapis.com"
   ```
   Blank output means alerting is inert; re-enable with
   `gcloud services enable monitoring.googleapis.com --project …`.


10. **API 5xx** — alert policy *"API 5xx response"*
    (`alertPolicies/4031446777758626143`, added 2026-08-21) fires **per
    occurrence** on any `httpRequest.status>=500` from `defpedal-api`, emailing
    the *"Victor (defpedal ops)"* channel, rate-limited to one per hour.
    ```bash
    gcloud logging read 'resource.type="cloud_run_revision" AND
      resource.labels.service_name="defpedal-api" AND httpRequest.status>=500'       --project gen-lang-client-0895796477 --limit 50 --freshness 7d       --format="value(httpRequest.status, httpRequest.requestUrl)" | sort | uniq -c
    ```
    **Why per-occurrence and not a rate?** Sentry already captures these (central
    5xx `HttpError` capture in `app.ts` `setErrorHandler`), but its only alert is
    the error-**rate** burst rule 733370 — and a 100%-broken *low-traffic*
    endpoint never spikes. `POST /v1/saved-routes` 500'd on every attempt for a
    week (~6 requests total) and nothing fired (error-log #83). Volume-based
    alerting cannot catch that class by construction.
    **Baseline at creation:** 26 in the prior 7 days — 18 saved-routes
    (`avoid_heat`, fixed), 4 firstride 504s (cron batching, fixed), 4
    billing-webhook (Pedal Plus rollout day, resolved; the current revision has
    23 clean 200s). **Steady state should be ~0, so treat any alert as real.**
    Check Sentry first for the stack, then Cloud Run logs for that URL.

    ⚠️ **Still not covered: a first-seen Sentry issue that never returns 5xx** —
    a caught-and-swallowed exception, or a mobile-side crash. Sentry's alert-rule
    APIs return HTTP 410 ("This API no longer exists"), so that rule cannot be
    created programmatically with the current token; it needs the Sentry UI:
    **Alerts → Create Alert → Issues → "A new issue is created" → email**.


## Healthy baselines (as of 2026-07-23, ~70 DAU reporting)

- Mobile errors: ≤ ~5/day, dominated by known benign titles (OSRM NoRoute,
  request timeouts, NoSegment, route-too-long guard). Unhandled crashes ≈ 0.
- API errors: ≤ ~10/day, dominated by "Elevation profile fetch failed"
  (external Mapbox Terrain flake, no user impact — clients fall back).
- PostHog: ~1,000–1,200 events/day, 50–75 distinct users/day (post
  default-ON, 07-20). `mobile_error` ≤ ~10/day, all known messages.
  **Baseline correction (2026-07-29):** the 07-20/21 peak was inflated by
  the default-ON update wave (every fleet device flipped analytics ON on its
  first open after updating to 0.2.119). Observed steady state since 07-24:
  ~200–450 events/day, 19–28 users/day, decaying gradually — no cliff, no
  error signals, so read as wave-settling, not breakage. Re-baseline once
  the v0.2.121 rollout reaches 100%; investigate only if users/day drops
  below ~15 or falls suddenly between adjacent days.
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
