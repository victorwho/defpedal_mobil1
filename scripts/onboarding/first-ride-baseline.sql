-- Onboarding → first ride: weekly cohort baseline.
-- Spec: docs/plans/onboarding-first-ride.md (Goal / [D1], Rollout [D8]).
--
-- Cohort = profiles created that ISO week. A profile row is created at the
-- anonymous sign-in on first open, so created_at is effectively install time.
-- Testers are excluded by app_environment (synced since 2026-09-10; older rows
-- are NULL and kept — before that date preview installs cannot be told apart).
--
--   installs    every profile created that week
--   signed_up   of those, now a real account (is_anonymous = false)
--   started_24h signed-up riders with a trip started within 24 h of install
--   saved_7d    signed-up riders with a SAVED ride started within 7 days
--               (end_action in saved/prompt_saved/completed — the north star)
--
-- Always quote the N next to any percentage.
with cohort as (
  select p.id, p.created_at, p.is_anonymous
  from profiles p
  where p.created_at >= now() - interval '16 weeks'
    and coalesce(p.app_environment, 'production') = 'production'
),
per_user as (
  select c.id,
         date_trunc('week', c.created_at)::date as week,
         c.is_anonymous,
         exists (select 1 from trips t
                 where t.user_id = c.id
                   and t.started_at < c.created_at + interval '24 hours') as started_24h,
         exists (select 1 from trips t
                 where t.user_id = c.id
                   and t.started_at < c.created_at + interval '7 days'
                   and t.end_action in ('saved', 'prompt_saved', 'completed')) as saved_7d
  from cohort c
)
select week,
       count(*)                                                as installs,
       count(*) filter (where not is_anonymous)                as signed_up,
       count(*) filter (where not is_anonymous and started_24h) as started_24h,
       count(*) filter (where not is_anonymous and saved_7d)    as saved_7d,
       (week + 7 > current_date - 7)                           as saved_7d_incomplete
from per_user
group by week
order by week;
