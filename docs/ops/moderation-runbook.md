# UGC Moderation Runbook

Operational guide for the user-generated-content moderation queue. Single moderator (Victor); this runbook documents the SLAs, the holiday-OOO procedure, the escalation chain, and the day-to-day workflow.

Implements the operational layer of compliance plan item 7. Required by Google Play's UGC policy and the EU Digital Services Act (DSA Art. 16).

## Contact

- **DSA / privacy point of contact:** `dsa@defensivepedal.com` (or alias to `victor@defensivepedal.com` until provisioned).
- **Escalation:** named co-founder / outside counsel with read-only Supabase admin access — to be filled in.

## SLA

| Severity | Triage | Action |
|---|---|---|
| **Illegal** (CSAM, terrorism, hate speech, violent threats, doxxing) | 24h | Immediate removal on confirmation. Mandatory under DSA Art. 16 regardless of team size. |
| **Other policy violations** (spam, harassment, off-topic) | 48h | Action within 7 days. |

## Daily workflow

1. Open Supabase SQL editor or the `pending_content_reports` view.
2. Query the queue:
   ```sql
   select id, target_type, target_id, reason, details, auto_filter, created_at, reporter_user_id
   from content_reports
   where status = 'pending'
   order by
     case
       when reason in ('illegal', 'violence') then 0
       else 1
     end,
     created_at asc;
   ```
3. For each row, fetch the target content and the reporter context.
4. Take an action and update the row:
   ```sql
   update content_reports
   set status = 'resolved',
       reviewed_at = now(),
       reviewed_by = '<your-uid>',
       action = 'hide' -- or 'delete' / 'no_action' / 'ban_user'
   where id = '<report-id>';
   ```
5. To hide content: set `is_hidden = true` on the relevant row in `feed_comments` / `hazards` / `trip_shares`. The RLS policies (migration `202604270001_ugc_moderation.sql`) take effect on next read.
6. To delete content: use `delete from feed_comments where id = '...'` etc. Cascade FKs handle child rows.
7. To ban a user: hide all their content first (`update feed_comments set is_hidden = true where user_id = '...'`), then `delete from auth.users where id = '...'` — cascades remove all their data.

## Auto-filter pipeline

Two layers fire automatically:

1. **Inline at write time** — `services/mobile-api/src/routes/feed-comments.ts` runs every new comment through `commentSanitize.ts` (URL detection) and `moderationFilter.ts` (slur / threat / doxx wordlist). Matches → `is_hidden=true` + `content_reports` row tagged `auto_filter=true`.
2. **Sweep cron** — `POST /v1/moderation/auto-filter-sweep` (Bearer `CRON_SECRET`). Cloud Scheduler runs this every 15 minutes against the last 24h of un-hidden comments. Catches comments that pre-date a wordlist update.

Auto-filter rows still need human review — the system optimises for low-latency hiding, not final adjudication. Review them with:
```sql
select * from content_reports where auto_filter = true and status = 'pending' order by created_at asc;
```

## Holiday / OOO procedure

When Victor is unavailable for >48h:

1. Set `COMMENTS_ENABLED=false` on Cloud Run (env var; client surfaces "Comments temporarily paused" toast).
2. Existing comments stay visible. New comments are rejected with HTTP 503.
3. Hazard reports + reactions remain enabled — these are safety-critical and the auto-filter handles obvious abuse.
4. On return: review the queue + flip `COMMENTS_ENABLED=true`.

Pausing UGC is acceptable to Play — the report mechanism stays in place.

## Escalation

If Victor is incapacitated for >72h:

1. The named co-founder / lawyer with Supabase admin access takes over the queue.
2. Same SLAs apply.
3. Document any actions in the `content_reports.action` field with the reviewer's uid in `reviewed_by`.

## Feature-flag reference

| Flag | Env var | Effect when off |
|---|---|---|
| Comments | `COMMENTS_ENABLED=false` | `POST /v1/feed/:id/comments` returns 503; existing comments still visible. |
| Auto-filter sweep | (none — disable in Cloud Scheduler) | Inline filter still runs at write time; only the retroactive sweep stops. |

## Cloud Scheduler jobs

| Job | Schedule | Endpoint | Runbook |
|---|---|---|---|
| `moderation-auto-filter-sweep-cron` | every 15 min, Europe/Bucharest | `POST /v1/moderation/auto-filter-sweep` | `Authorization: Bearer ${CRON_SECRET}` |
| `hazards-expire-cron` | `0 3 * * *` Europe/Bucharest | `POST /v1/hazards/expire` | (existing — unrelated) |

Create the moderation cron with:
```bash
gcloud scheduler jobs create http moderation-auto-filter-sweep-cron \
  --location=europe-central2 \
  --schedule="*/15 * * * *" \
  --time-zone="Europe/Bucharest" \
  --uri="https://defpedal-api-1081412761678.europe-central2.run.app/v1/moderation/auto-filter-sweep" \
  --http-method=POST \
  --headers="Authorization=Bearer ${CRON_SECRET}"
```

## Rate-limit reference

Defaults aligned with the compliance plan. Override via Cloud Run env vars:

| Bucket | Default | Env vars |
|---|---|---|
| Reports | 5 / 10 min / user | `RATE_LIMIT_REPORT_MAX`, `RATE_LIMIT_REPORT_WINDOW_MS` |
| Blocks | 20 / 1h / user | `RATE_LIMIT_BLOCK_MAX`, `RATE_LIMIT_BLOCK_WINDOW_MS` |
| Comments | 3 / 15 min / user | `RATE_LIMIT_COMMENT_MAX`, `RATE_LIMIT_COMMENT_WINDOW_MS` |

## DSA transparency report (annual)

Optional unless monthly active recipients in EU exceed thresholds. First draft due ~12 months post-launch. One paragraph at `defensivepedal.com/transparency` listing reports received / actioned / median time-to-action is sufficient for the first year.

Generate stats with:
```sql
select
  count(*) filter (where status = 'pending')   as pending,
  count(*) filter (where status = 'resolved')  as resolved,
  count(*) filter (where status = 'dismissed') as dismissed,
  count(*) filter (where auto_filter = true)   as auto_filter,
  percentile_cont(0.5) within group (order by extract(epoch from reviewed_at - created_at))
    filter (where reviewed_at is not null) as median_time_to_action_seconds
from content_reports
where created_at >= now() - interval '12 months';
```

## Things this runbook doesn't yet cover

- Email notification when a new report lands. Implement with a Supabase Edge Function or a `pg_net` trigger pushing to a webhook → email.
- A queue UI (currently SQL-only). A small admin web page is on the roadmap.
- ML-based filtering (Perspective API, OpenAI moderation). Scope decision deferred until queue volume justifies the dependency.
