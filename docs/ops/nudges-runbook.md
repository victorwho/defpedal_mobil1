# Pedal Nudge System Runbook

Operational guide for the Pedal Nudge System v0.1 in production. Implements the spec at [`docs/plans/pedal-nudge-system.md`](../plans/pedal-nudge-system.md). Live as of session 62 (2026-05-26).

## TL;DR

- **9 of 10 triggers live.** Server-side priority queue + P0 fire-and-forget fast path from `/trips/end` + `/hazards`.
- **Kill switch:** `NUDGES_ENABLED` env var on Cloud Run. Currently `true`.
- **Roll-back (one command):**
  ```bash
  gcloud run services update defpedal-api --region europe-central2 --update-env-vars NUDGES_ENABLED=false
  ```
  New revision live within ~30 s. All crons + the P0 fast path immediately return without dispatching.
- **Health check (one command):** `bash scripts/nudges-health.sh`

## What runs and when

| Job | Schedule | Endpoint | Purpose |
|---|---|---|---|
| `nudges-evaluate-cron` | `*/30 * * * *` Europe/Bucharest | `POST /v1/nudges/evaluate` | Walks streak-state buckets, picks one slot-2 nudge per eligible user via priority queue, dispatches |
| `nudges-attribute-cron` | `*/15 * * * *` Europe/Bucharest | `POST /v1/nudges/attribute` | 2-h action attribution sweep — scans `nudge_log` rows sent 15min-2h ago for actionable triggers, sets `action_completed_at` if `trip_tracks` shows a ride since `sent_at` |
| `nudges-pattern-cron` | `0 4 * * *` Europe/Bucharest (daily 04:00) | `POST /v1/nudges/recompute-pattern` | Recomputes `user_ride_pattern.typical_start_hour` per `notify_streak=true` user from last 14 days of trips. Enables `daily_ride_reminder` timing. |

All three require `Authorization: Bearer ${CRON_SECRET}` (the same secret reused across all server crons — `hazards-expire-cron`, `retention-*-cron`, `leaderboard-settle-*`, etc.).

In addition, two real-time paths fire **without going through the cron**:
- **P0 post-ride / post-hazard pushes** — fired from `routes/v1.ts` after successful `/trips/end` or `/hazards` writes, via `firePostRideEventsAsync()` / `fireP0Event()` in `services/mobile-api/src/lib/nudges/eventFirer.ts`. These bypass the daily cap + safety floor (they celebrate completed action, not ask for a ride).
- **Telemetry callback** — `POST /v1/nudges/telemetry` records `tapped_at` from the mobile client when a notification is opened.

## Triggers — what fires and when

| Trigger | Priority | Where it's decided | Conditions |
|---|---|---|---|
| `post_ride_celebration` | P0 | P0 fast path | Every `/trips/end` save |
| `post_hazard_thanks` | P0 | P0 fast path | Every `/hazards` save |
| `milestone_celebration` | P0 | P0 fast path | `streak_count` after save IN (7, 21, 30, 42, 88, 100, 365) |
| `streak_at_risk_dramatic` | P1 | cron | `current_streak >= 7 AND not qualified today`. Safety-floor gated. |
| `daily_ride_reminder` | P2 | cron | `user_ride_pattern.confidence >= 0.4 AND current_local_hour == typical_start_hour - 1 AND not qualified today`. 22h dedup. Safety-floor gated. |
| `streak_at_risk_mild` | P3 | cron | `current_streak 4-6 AND not qualified today`. Safety-floor gated. |
| `streak_lost_apology` | P0 | cron | `current_streak = 0 AND longest_streak >= 3 AND last_qualifying_date 1-3 days ago`. 7-day dedup. NOT safety-floor gated (apologizes, doesn't ask for ride). |
| `lapsed_reengagement` | P3 | cron | `current_streak = 0 AND last_qualifying_date 3-30 days ago`. 4-day dedup. NOT safety-floor gated (gentle copy, doesn't push immediate ride). |
| `community_signal` | P3 | cron | Weekly CO2 leaderboard rank dropped ≥3 positions between two most recent snapshots. 6-day dedup. |
| `badge_proximity` | P2 | DEFERRED | Server has no `BadgeProgress` query today — needs new RPC or core port of mobile math. |

## Safety floor (real, fail-closed)

Every ride-asking trigger goes through:

1. **`isBadCyclingWeather()`** in `packages/core/src/cyclingWeather.ts` — fails closed if Open-Meteo doesn't respond. Suppresses on storm WMO codes ≥71, temp <2°C or >35°C, rain >60%, wind >40 km/h.
2. **`isAfterSunset()`** in `packages/core/src/solarTime.ts` — NOAA solar position algorithm, no deps, fails closed for polar coords or invalid lat/lon.
3. **Quiet hours** per-user from `profiles.quiet_hours_start` / `quiet_hours_end` / `quiet_hours_timezone` (default 22:00-07:00 Europe/Bucharest).
4. **Daily cap** — 2 pushes per user per rolling 24h across `nudge_log` + `notification_log`. P0 events bypass.

User lat/lon resolved from most recent `trips.start_location` PostGIS point; falls back to Bucharest (44.43, 26.10) for users with no trip history.

## Daily health-check queries

Run these via the **Supabase SQL editor** (project `uobubaulcdcuggnetzei`, set role to `service_role` if Table Editor shows zero rows — RLS hides everything from `authenticated` view).

### 1. Funnel breakdown (last 7 days)

```sql
SELECT
  trigger_id,
  count(*)                                                          AS total,
  count(*) FILTER (WHERE outcome = 'sent')                          AS sent,
  count(*) FILTER (WHERE tapped_at IS NOT NULL)                     AS tapped,
  count(*) FILTER (WHERE action_completed_at IS NOT NULL)           AS acted,
  round(100.0 * count(*) FILTER (WHERE tapped_at IS NOT NULL) /
        NULLIF(count(*) FILTER (WHERE outcome = 'sent'), 0), 1)      AS tap_pct,
  round(100.0 * count(*) FILTER (WHERE action_completed_at IS NOT NULL) /
        NULLIF(count(*) FILTER (WHERE outcome = 'sent'), 0), 1)      AS action_pct
FROM public.nudge_log
WHERE created_at >= now() - interval '7 days'
GROUP BY trigger_id
ORDER BY total DESC;
```

What healthy looks like: P0 triggers (`post_ride_celebration`, `post_hazard_thanks`, `milestone_celebration`) should dominate `total`. Tap rate ≥10 % is good for P0; ≥5 % for P1/P2 is acceptable.

### 2. Outcome distribution (last 24 hours)

```sql
SELECT
  outcome,
  count(*) AS rows,
  round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM public.nudge_log
WHERE created_at >= now() - interval '24 hours'
GROUP BY outcome
ORDER BY rows DESC;
```

What to watch for:
- **`sent`** should be the bulk of rows — that's the happy path.
- **`expo_error`** spike → push tokens have gone stale OR Expo is having an outage. Cross-check with `notification_log` for the same window.
- **`suppressed_no_token`** spike → users with `notify_streak = true` but no row in `push_tokens` (uninstalled the app but didn't toggle off).
- **`suppressed_weather`** > 20% → either the weather is genuinely bad across the user base, or `fetchCyclingForecast` is returning null and we're failing closed. Check Cloud Run logs.
- **`suppressed_cap`** > 30% → riders are hitting the 2/day limit too often. May want to tune.

### 3. Per-variant performance (for variant winnowing — run after ~4 weeks of data)

```sql
SELECT
  trigger_id,
  variant_id,
  count(*)                                                      AS sent,
  count(*) FILTER (WHERE tapped_at IS NOT NULL)                 AS tapped,
  count(*) FILTER (WHERE action_completed_at IS NOT NULL)       AS acted,
  round(100.0 * count(*) FILTER (WHERE tapped_at IS NOT NULL) /
        NULLIF(count(*), 0), 1)                                  AS tap_pct
FROM public.nudge_log
WHERE outcome = 'sent'
  AND created_at >= now() - interval '28 days'
GROUP BY trigger_id, variant_id
ORDER BY trigger_id, tap_pct DESC NULLS LAST;
```

Promote the winning `variant_id` per trigger as `v1` in `packages/core/src/pedalVoice.ts` and demote the losers. Sticky-bucket assignment means users will continue to see their assigned variant until you swap them in code.

### 4. Recent activity by user (debugging one rider's experience)

```sql
SELECT
  trigger_id,
  variant_id,
  outcome,
  scheduled_at,
  sent_at,
  tapped_at,
  action_completed_at,
  context
FROM public.nudge_log
WHERE user_id = '<UUID>'
ORDER BY scheduled_at DESC
LIMIT 50;
```

### 5. Ride-pattern coverage

```sql
SELECT
  count(*)                                  AS total_patterns,
  count(*) FILTER (WHERE confidence >= 0.4) AS pattern_eligible,
  avg(confidence)                           AS avg_confidence,
  avg(sample_count)                         AS avg_sample_count,
  max(last_computed_at)                     AS last_run_at
FROM public.user_ride_pattern;
```

`pattern_eligible` is the size of the audience that `daily_ride_reminder` can actually fire for. Until `nudges-pattern-cron` runs at 04:00 Europe/Bucharest, the table is empty.

## Cloud Run + scheduler health

```bash
# Confirm the kill switch state on the live revision
gcloud run services describe defpedal-api --region europe-central2 \
  --format='value(spec.template.spec.containers[0].env[].name,spec.template.spec.containers[0].env[].value)' \
  | tr ';' '\n' | grep -i nudges

# Last few cron runs (any status)
gcloud scheduler jobs describe nudges-evaluate-cron --location europe-central2 \
  --format='value(lastAttemptTime,state,status.code)'
gcloud scheduler jobs describe nudges-attribute-cron --location europe-central2 \
  --format='value(lastAttemptTime,state,status.code)'
gcloud scheduler jobs describe nudges-pattern-cron --location europe-central2 \
  --format='value(lastAttemptTime,state,status.code)'

# Structured log events from the last 1 hour
gcloud logging read 'resource.type="cloud_run_revision"
  AND resource.labels.service_name="defpedal-api"
  AND timestamp>="'$(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -v-1H '+%Y-%m-%dT%H:%M:%SZ')'"
  AND jsonPayload.event=~"nudge"' \
  --limit=50 \
  --format='table(timestamp,jsonPayload.event,jsonPayload.evaluated,jsonPayload.sent,jsonPayload.suppressed,jsonPayload.attributed)'
```

Or just run `bash scripts/nudges-health.sh` which wraps all of the above.

## Diagnostic flows

### "No rows are showing up in `nudge_log`"

1. Check the kill switch: `gcloud run services describe defpedal-api --region europe-central2 --format='value(spec.template.spec.containers[0].env)' | grep NUDGES_ENABLED`. If `false`, you've found it.
2. Confirm Cloud Scheduler has actually ticked: `gcloud scheduler jobs describe nudges-evaluate-cron --location europe-central2 --format=value(lastAttemptTime)`. The timestamp should be < 30 min old. If not, the scheduler job is paused / failed.
3. Check active-streak population: `SELECT count(*) FROM streak_state WHERE current_streak >= 4;` — if this is 0, there are no candidates for `streak_at_risk_*`. Zero rows is correct behavior; the system writes nothing.
4. Inspect Cloud Run logs for the cron's structured `nudge_evaluate_complete` event — `evaluated`/`sent`/`suppressed` counts tell the story.

### "All my pushes show `outcome='suppressed_no_token'`"

The user has `notify_streak = true` on the profile but no row in `push_tokens` for any device. Typical causes:
- User uninstalled the app
- User signed in on a new device but the old `expo_push_token` is gone and the new one didn't get registered (check that `registerForPushNotifications` ran successfully on app open)
- User denied OS-level notification permission

The system is doing the right thing — it knows there's no token to push to and short-circuits. No action needed unless the cohort is too large.

### "Pushes fire but `action_completed_at` is always null"

The 2-h attribution sweep looks for `trip_tracks` rows with `created_at >= sent_at`. Check:
- The user actually completed a ride within 2 hours of the push (true outcome — not always)
- `nudges-attribute-cron` is actually running (15-min cadence — `gcloud scheduler jobs describe nudges-attribute-cron`)
- The trigger is in the actionable set — `ACTIONABLE_TRIGGERS` in `routes/nudges.ts`. P0 triggers like `post_ride_celebration` are NOT actionable (they celebrate a ride that already happened).

### "Variant distribution looks wrong"

`pickVariantIndex(userId, trigger, 3)` is a deterministic djb2 hash. Same user + same trigger always picks the same variant. If you're seeing one variant dominate, run query 3 above grouped by `variant_id` — uniform-ish distribution across `v1` / `v2` / `v3` is expected only with hundreds of users. With fewer than 30 users per trigger the distribution can look skewed because the hash output is finite.

## Roll-back procedure

The kill switch is the only knob you should need:

```bash
# Pause the system instantly (within ~30s)
gcloud run services update defpedal-api --region europe-central2 \
  --update-env-vars NUDGES_ENABLED=false

# Confirm
gcloud run services describe defpedal-api --region europe-central2 \
  --format='value(spec.template.spec.containers[0].env[].name,spec.template.spec.containers[0].env[].value)' \
  | tr ';' '\n' | grep -i nudges

# Resume when ready
gcloud run services update defpedal-api --region europe-central2 \
  --update-env-vars NUDGES_ENABLED=true
```

While off, the cron jobs continue to fire on schedule but immediately return `{evaluated:0, sent:0, suppressed:0}` and log `nudge_*_kill_switch` structured events. No new rows are written to `nudge_log`. No pushes are dispatched. Existing `nudge_log` rows are not modified.

To go further (e.g. drop the system entirely while debugging a Cloud Run issue):

```bash
# Pause individual jobs
gcloud scheduler jobs pause nudges-evaluate-cron --location europe-central2
gcloud scheduler jobs pause nudges-attribute-cron --location europe-central2
gcloud scheduler jobs pause nudges-pattern-cron --location europe-central2

# Resume
gcloud scheduler jobs resume nudges-evaluate-cron --location europe-central2
gcloud scheduler jobs resume nudges-attribute-cron --location europe-central2
gcloud scheduler jobs resume nudges-pattern-cron --location europe-central2
```

## When to call this an incident

| Signal | Severity | Action |
|---|---|---|
| `outcome='expo_error'` > 20% over any 1-hour window | P2 | Check Expo Push status page; flip kill switch if widespread |
| `nudge_log` writes stopped > 1 hour during US/EU prime time | P2 | Check Cloud Run logs; verify scheduler is firing; flip kill switch if uncertain |
| Mass complaints about creepy / inappropriate copy | P1 | Flip kill switch; review recent `variant_id` distribution; revise catalog |
| Crash spike on app open after a release | P1 | Check Sentry; the nudge code doesn't crash the app (suppressed during `NAVIGATING`, all native-module guards in place) but worth ruling out |
| Push sent during quiet hours / bad weather | P1 | Flip kill switch; the safety floor failed open somewhere. Check `eligibility.ts` and `cyclingWeather.ts` |

## What's deferred (out of scope for v0.1)

- **`badge_proximity` trigger.** Needs `get_badge_progress(user_id)` Postgres RPC or core port of mobile-side progress math. Catalog + priority + push integration already in place; only candidate detection is missing.
- **`RallyFriendsOverlay` mobile UI** (plan section 3.3) — the "rally a friend when streak at risk" share surface. Adds a new mobile organism + share-text rendering + nudge-tap handler wiring.
- **Sentry-driven auto-pause.** Currently manual kill switch only. Plan section 11 = v1.1 scope.
- **Image-based share cards** for milestones. Currently text-share only via the existing share flow.
- **Looker / Metabase dashboards.** Currently just structured Cloud Run logs + the SQL queries above.

## References

- Plan: [`docs/plans/pedal-nudge-system.md`](../plans/pedal-nudge-system.md)
- Spec session in progress.md: Session 62 (2026-05-25 / 2026-05-26)
- Cloud Run service: `defpedal-api` in `gen-lang-client-0895796477` / `europe-central2`
- Supabase project: `uobubaulcdcuggnetzei` (pedal1)
- Current live revision: see CLAUDE.md "Current State"
