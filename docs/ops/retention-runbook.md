# Data Retention Runbook

Operational guide for the GDPR Art. 5(1)(e) "storage limitation" pipeline. Implements the operational layer of compliance plan item 13.

## What runs and when

| Job | Schedule | Endpoint | Purpose |
|---|---|---|---|
| `retention-gps-truncate-cron` | `0 3 * * *` Europe/Bucharest (daily 3 AM) | `POST /v1/retention/truncate-gps` | NULL out `trip_tracks.gps_trail` for rides >90 days old (unless author opted into full history) |
| `retention-flag-inactive-cron` | `0 5 * * MON` Europe/Bucharest (weekly Mon 5 AM) | `POST /v1/retention/flag-inactive` | Mark accounts >=23 months inactive for the warning email |
| `retention-inactive-mailer-cron` | `30 5 * * MON` Europe/Bucharest (weekly Mon 5:30 AM) | Edge Function `inactive-warning` | Send the 23-month warning email via Resend; idempotent |
| `retention-purge-inactive-cron` | `0 6 * * MON` Europe/Bucharest (weekly Mon 6 AM) | `POST /v1/retention/purge-inactive` | Delete accounts flagged >=30 days ago AND still inactive |

All four require `Authorization: Bearer ${CRON_SECRET}` (same secret already used by the hazards-expire cron). Each job is **batched** (LIMIT 50–200 per call) and **idempotent** — backlog drains over multiple ticks. The mailer's idempotency relies on `profiles.inactive_warning_email_sent_at` (added in migration `202604280002_inactive_warning_email_audit.sql`); successfully-delivered rows leave the queue.

## Retention table — what's actually kept and for how long

This table is the authoritative answer for the privacy policy (item 3) and Play Console *Data Safety* form (item 9):

| Data | Retention | Mechanism |
|---|---|---|
| `auth.users` row, `profiles` | While account active; deleted on user request | In-app delete (item 1) |
| `trips` summary (distance, duration, CO2, route mode) | While account active | Lifetime stats / badges / XP integrity |
| `trip_tracks.gps_trail` (raw breadcrumb array) | **90 days, then truncated to `[]`** | `truncate_old_gps_trails()` cron — opt-out via `profiles.keep_full_gps_history` |
| `hazards` | 45 days past `expires_at` (existing migration) | `hazards-expire-cron` |
| `feed_comments`, `feed_likes`, `trip_loves` | While account active; deleted on user/comment delete | Cascade FKs |
| `rider_xp_log`, `xp_events` | While account active | Tier integrity |
| `leaderboard_snapshots` | 24 months rolling | Snapshot table — old rows aren't queried, can be DROP'd manually if needed |
| `mia_journey_events` | 12 months | TODO — separate cron not yet implemented |
| **Inactive-account purge** | **24 months without app open** → soft-delete with 30-day email warning | `flag_inactive_users` (week 23) → `select_purgeable_inactive_users` (week 24+) |

## Cloud Scheduler setup

Run these once per environment. The Cloud Run URL is the same as the existing hazards-expire cron — reuse the project + region.

```bash
# Daily 3am — GPS truncate
gcloud scheduler jobs create http retention-gps-truncate-cron \
  --location=europe-central2 \
  --schedule="0 3 * * *" \
  --time-zone="Europe/Bucharest" \
  --uri="https://defpedal-api-1081412761678.europe-central2.run.app/v1/retention/truncate-gps" \
  --http-method=POST \
  --headers="Authorization=Bearer ${CRON_SECRET}"

# Weekly Mon 5am — flag inactive
gcloud scheduler jobs create http retention-flag-inactive-cron \
  --location=europe-central2 \
  --schedule="0 5 * * 1" \
  --time-zone="Europe/Bucharest" \
  --uri="https://defpedal-api-1081412761678.europe-central2.run.app/v1/retention/flag-inactive" \
  --http-method=POST \
  --headers="Authorization=Bearer ${CRON_SECRET}"

# Weekly Mon 6am — purge inactive
gcloud scheduler jobs create http retention-purge-inactive-cron \
  --location=europe-central2 \
  --schedule="0 6 * * 1" \
  --time-zone="Europe/Bucharest" \
  --uri="https://defpedal-api-1081412761678.europe-central2.run.app/v1/retention/purge-inactive" \
  --http-method=POST \
  --headers="Authorization=Bearer ${CRON_SECRET}"
```

## Inactive-warning email pipeline

Implemented as a Supabase Edge Function at `supabase/functions/inactive-warning/`. Triggered by Cloud Scheduler on a 30-min lag after `retention-flag-inactive-cron`, so the flag commit has settled before the mailer reads. Both `clear_inactive_warning(uid)` (called from the auth refresh path) and the mailer's idempotency column (`profiles.inactive_warning_email_sent_at`) are managed by migration `202604280002_inactive_warning_email_audit.sql`.

### Setup once per environment

See [`supabase/functions/inactive-warning/README.md`](../../supabase/functions/inactive-warning/README.md) for:

- `supabase functions deploy inactive-warning --project-ref uobubaulcdcuggnetzei`
- `supabase secrets set CRON_SECRET=… RESEND_API_KEY=…`
- Cloud Scheduler `gcloud scheduler jobs create http retention-inactive-mailer-cron …`

### Email template

The function picks one of two templates based on `profiles.locale`:

- `ro` → Romanian template
- anything else (including `NULL`) → English fallback

Both templates render the deletion date in the user's locale + Europe/Bucharest timezone, computed as `inactive_warning_sent_at + GRACE_DAYS (30)` to match `select_purgeable_inactive_users()`.

> **Subject (EN):** Your Defensive Pedal account hasn't been used in 23 months
>
> Hi,
>
> We haven't seen activity on your Defensive Pedal account in 23 months. To respect GDPR data-minimization rules, accounts that stay inactive for 24 months are automatically deleted along with all their data — trip history, badges, XP, profile, everything.
>
> If you'd like to keep your account, just open the app once before [DATE]. That counts as activity and resets the timer.
>
> If you'd rather we delete your account now, you can do that yourself from Profile → Account → Delete account in the app, or on the web at https://routes.defensivepedal.com/account-deletion.
>
> Questions: privacy@defensivepedal.com
>
> Defensive Pedal

### Manual reconciliation (rare)

If the mailer cron is paused for any reason, the queue is observable via SQL:

```sql
SELECT id, email, inactive_warning_sent_at
  FROM profiles
 WHERE inactive_warning_sent_at IS NOT NULL
   AND inactive_warning_email_sent_at IS NULL
 ORDER BY inactive_warning_sent_at;
```

Resume by re-enabling the Cloud Scheduler job. The next tick drains the queue.

## Verification

**Dry-run the GPS truncate** against a known old row before letting the cron loose:
```sql
-- Find a candidate row
select id, user_id, created_at, jsonb_array_length(gps_trail) as breadcrumb_count
from trip_tracks
where created_at < now() - interval '90 days'
  and jsonb_array_length(gps_trail) > 0
limit 5;

-- Run the function manually
select * from truncate_old_gps_trails();

-- Confirm
select id, jsonb_array_length(gps_trail) from trip_tracks where id = '<the-id-from-above>';
-- Should now be 0
```

**Dry-run flag-inactive** against a test account:
```sql
-- Manually age a test profile (NEVER DO THIS ON A REAL USER)
update auth.users set last_sign_in_at = now() - interval '24 months' where email = '<test-account>';
-- Run flag
select * from flag_inactive_users();
-- Confirm
select inactive_warning_sent_at from profiles where id = '<test-uid>';
```

**Verify purge selection** lists the right candidates without actually deleting:
```sql
-- Manually back-date the warning on a test account
update profiles set inactive_warning_sent_at = now() - interval '31 days' where id = '<test-uid>';
-- Confirm the candidate is selected
select * from select_purgeable_inactive_users();
```

## Auditability

Every truncation and purge logs structured events through the existing pino logger. Sample queries you can run on Cloud Run logs (Log Explorer):

- `jsonPayload.event="retention_truncate_gps"` — daily summary, count + batch_complete flag
- `jsonPayload.event="retention_inactive_warning_pending"` — every email that was due
- `jsonPayload.event="retention_purge_succeeded"` — every account that was actually deleted, with `warnedAt` + `latestActivity` for the audit trail
- `jsonPayload.event="retention_purge_failed"` — anything that errored (will retry next tick)

Keep these logs for 12 months minimum. Romania's audit-trail expectation for GDPR data subject rights actions is 1 year.

## What's NOT covered yet

- **`mia_journey_events` 12-month retention** — separate cron not implemented. Low priority (Mia events aren't precise location). Add to backlog.
- **`leaderboard_snapshots` 24-month rolling DELETE.** Today nothing actually deletes old snapshots; the table just accumulates. Manual `delete from leaderboard_snapshots where snapshot_period_end < now() - interval '24 months'` is fine for now; add a cron after launch if storage becomes an issue.
- **DSAR (data subject access request) export.** A user requesting "give me everything you have on me" needs an export endpoint. Account deletion (item 1) is the reverse path; the export is a separate item not yet planned.
