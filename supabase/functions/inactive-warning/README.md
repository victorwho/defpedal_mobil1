# `inactive-warning` Edge Function

Sends the 23-month inactivity warning email to users flagged by the
`flag_inactive_users()` RPC. Closes the **mailer TODO** documented in
[`docs/ops/retention-runbook.md`](../../../docs/ops/retention-runbook.md).

- **Trigger:** Cloud Scheduler, weekly Mon 5:30 AM `Europe/Bucharest`
  (30 minutes after `retention-flag-inactive-cron` marks the queue).
- **Auth:** `Authorization: Bearer ${CRON_SECRET}`. Same secret as the
  other retention crons.
- **Mailer:** Resend REST API. Same `team@defensivepedal.com` from-address
  used by Supabase Auth's branded emails (set up in
  [`supabase/functions/email-confirm/README.md`](../email-confirm/README.md)).
- **Idempotency:** writes `profiles.inactive_warning_email_sent_at` after
  successful delivery. Re-runs only target rows where the column is
  still `NULL`.
- **Batch size:** 50 emails per tick. The queue rarely exceeds this for a
  Romania-only launch, but the cron tick is weekly so any backlog drains
  over multiple weeks if it ever grows.

## Deploy (one command)

The full deploy — migration push + function deploy + secrets + Cloud Scheduler upsert + smoke test — is wrapped in `scripts/deploy-inactive-warning.sh`. From repo root, after authenticating once with `supabase login` and `gcloud auth login`:

```bash
CRON_SECRET="<same value used by Cloud Run retention crons>" \
RESEND_API_KEY="re_..." \
  ./scripts/deploy-inactive-warning.sh
```

The script is **idempotent** — re-running upgrades the function in place, overwrites secrets, upserts the scheduler job. Pass `SKIP_MIGRATION=1` if the migration was already applied via Supabase MCP.

## Manual deploy (if you cannot run the script)

```bash
# 1. Apply migration (or use Supabase MCP apply_migration)
supabase db push --project-ref uobubaulcdcuggnetzei

# 2. Deploy the function
supabase functions deploy inactive-warning --project-ref uobubaulcdcuggnetzei

# 3. Set secrets (auto-injected SUPABASE_URL + SERVICE_ROLE_KEY don't need
#    to be set manually — only these two)
supabase secrets set --project-ref uobubaulcdcuggnetzei \
  CRON_SECRET="..." \
  RESEND_API_KEY="re_..."

# 4. Create Cloud Scheduler job
gcloud scheduler jobs create http retention-inactive-mailer-cron \
  --project=gen-lang-client-0895796477 \
  --location=europe-central2 \
  --schedule="30 5 * * 1" \
  --time-zone="Europe/Bucharest" \
  --uri="https://uobubaulcdcuggnetzei.supabase.co/functions/v1/inactive-warning" \
  --http-method=POST \
  --headers="Authorization=Bearer ${CRON_SECRET}"
```

To rotate the Resend key (no re-deploy needed):

```bash
supabase secrets set --project-ref uobubaulcdcuggnetzei RESEND_API_KEY="re_<new>"
# Smoke-test before revoking the old key in Resend's dashboard.
```

## Schedule context

The mailer fits between `flag-inactive` and `purge-inactive` in the weekly retention sequence:

| Job | Schedule (Bucharest) | Endpoint |
|---|---|---|
| `retention-gps-truncate-cron` | 03:00 daily | Cloud Run API |
| `retention-flag-inactive-cron` | 05:00 Mon | Cloud Run API |
| `retention-inactive-mailer-cron` | **05:30 Mon** | **Edge Function (this one)** |
| `retention-purge-inactive-cron` | 06:00 Mon | Cloud Run API |

Order matters: flag → mailer → purge. The 30-min gap after flag-inactive ensures the mark commits before the mailer reads, and the 30-min gap before purge-inactive lets the mailer drain its first batch.

## Manual test

```bash
# Replace <CRON_SECRET> with the actual value
curl -i -X POST \
  -H "Authorization: Bearer <CRON_SECRET>" \
  https://uobubaulcdcuggnetzei.supabase.co/functions/v1/inactive-warning
```

Expected response (when the queue is empty, which is the default state):

```json
{
  "runAt": "2026-04-27T...",
  "queueSize": 0,
  "sentCount": 0,
  "failedCount": 0,
  "sentIds": [],
  "failed": [],
  "batchComplete": true
}
```

To force a real test:

```sql
-- 1. Pick a TEST account you own. Back-date its sign-in to trigger the queue.
UPDATE auth.users
   SET last_sign_in_at = NOW() - INTERVAL '24 months'
 WHERE email = '<your-test-account>';

-- 2. Run the flag step
SELECT * FROM flag_inactive_users();

-- 3. Confirm the row is in the mailer queue
SELECT id, email, inactive_warning_sent_at, inactive_warning_email_sent_at
  FROM profiles
 WHERE inactive_warning_sent_at IS NOT NULL
   AND inactive_warning_email_sent_at IS NULL;

-- 4. Trigger the mailer (curl above)

-- 5. Confirm the email arrived AND inactive_warning_email_sent_at is set
SELECT id, email, inactive_warning_email_sent_at
  FROM profiles
 WHERE id = '<test-uid>';
```

Remember to undo the back-date afterwards:

```sql
UPDATE auth.users SET last_sign_in_at = NOW() WHERE email = '<your-test-account>';
SELECT clear_inactive_warning('<test-uid>');
```

## Email content

The function sends one of two templates picked from `profiles.locale`:

- `ro` → Romanian template
- anything else (including NULL) → English template

Subjects:

- EN: *Your Defensive Pedal account hasn't been used in 23 months*
- RO: *Contul tău Defensive Pedal nu a fost folosit de 23 de luni*

The deletion date is rendered in the user's locale + Europe/Bucharest
timezone, with a 30-day grace window from `inactive_warning_sent_at`.

## When this changes

- **Email copy** — edit `index.ts` `buildContent()`, redeploy with
  `supabase functions deploy inactive-warning`.
- **Sender or branding** — edit `FROM_ADDRESS` constant.
- **Batch size** — `BATCH_SIZE` constant (currently 50).
- **Grace window** — `GRACE_DAYS` constant must match
  `select_purgeable_inactive_users()` SQL definition (currently 30).
- **New locales** — add a branch to `buildContent()`. Default to EN.

## Related

- Mailer queue column: `profiles.inactive_warning_email_sent_at` (added by
  migration `202604280002_inactive_warning_email_audit.sql`).
- Marking RPC: `flag_inactive_users()` (sets `inactive_warning_sent_at`).
- Reset RPC: `clear_inactive_warning(uuid)` (clears both columns; called
  from auth refresh path).
- Purge selection RPC: `select_purgeable_inactive_users()` (must wait the
  same `GRACE_DAYS` after the warning before deletion).
- Compliance plan item 13: `docs/plans/compliance-implementation-plan.md`.
