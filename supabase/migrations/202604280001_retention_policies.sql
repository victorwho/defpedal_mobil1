-- Data retention policies — compliance plan item 13.
--
-- Three concerns this migration addresses:
--
--   1. Raw GPS breadcrumbs are the highest-sensitivity precise-location
--      dataset we hold. Auto-truncate trip_tracks.gps_trail after 90 days
--      so we keep ride summaries (distance, duration, CO2) forever but
--      drop the per-second coordinate stream. Users who want full history
--      can opt in via profiles.keep_full_gps_history.
--
--   2. GDPR Art. 5(1)(e) "storage limitation" — sustained inactive-account
--      retention is the most common ANSPDCP enforcement finding for RO
--      apps. We flag accounts at 23 months of inactivity (warning email
--      window) and purge at 24 months.
--
--   3. The privacy policy / Data Safety form (compliance plan items 3 + 9)
--      need real numbers; this migration is the source of truth for the
--      retention table they cite.
--
-- All three functions are SECURITY DEFINER so the cron API endpoints
-- (Bearer CRON_SECRET, run from the service role) can invoke them without
-- depending on RLS. Functions are batched (LIMIT 200 per call) so a
-- single tick never holds long transactions; the cron just runs again
-- next tick to drain the backlog.

begin;

-- ---------------------------------------------------------------------------
-- 1. profiles columns: keep_full_gps_history opt-out + inactive_warning track
-- ---------------------------------------------------------------------------
alter table profiles
  add column if not exists keep_full_gps_history boolean not null default false;
alter table profiles
  add column if not exists inactive_warning_sent_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. truncate_old_gps_trails — daily cron, drops per-second coords > 90d.
--    Trip summary survives in `trips`. Distance / duration / CO2 stats are
--    computed at trip-end and stored on `trips`, so the post-truncate row
--    in trip_tracks is essentially a row stub (planned route + reasons).
-- ---------------------------------------------------------------------------
create or replace function truncate_old_gps_trails()
returns table (truncated_count int, batch_complete boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  cutoff timestamptz := now() - interval '90 days';
  batch_size int := 200;
  affected int;
begin
  with candidates as (
    select tt.id
    from trip_tracks tt
    where tt.created_at < cutoff
      and jsonb_array_length(tt.gps_trail) > 0
      and tt.user_id not in (
        select p.id from profiles p where p.keep_full_gps_history = true
      )
    limit batch_size
  )
  update trip_tracks
  set gps_trail = '[]'::jsonb
  from candidates
  where trip_tracks.id = candidates.id;

  get diagnostics affected = row_count;

  return query select affected, (affected < batch_size);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. flag_inactive_users — weekly cron. Marks users >=23 months inactive
--    so the warning-email pipeline can pick them up. Activity = max of
--    auth.users.last_sign_in_at and the user's most recent trip.created_at.
--
--    Returns the list of (user_id, email) flagged in this batch so the
--    API caller can hand them to the email mailer (TODO — currently the
--    endpoint logs them but doesn't send mail; SendGrid integration is a
--    follow-up).
-- ---------------------------------------------------------------------------
create or replace function flag_inactive_users()
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  warning_cutoff timestamptz := now() - interval '23 months';
  batch_size int := 200;
begin
  return query
  with last_activity as (
    select
      u.id as uid,
      u.email,
      greatest(
        coalesce(u.last_sign_in_at, u.created_at),
        coalesce((select max(t.started_at) from trips t where t.user_id = u.id), u.created_at)
      ) as latest_activity
    from auth.users u
    join profiles p on p.id = u.id
    where p.inactive_warning_sent_at is null
  ),
  candidates as (
    select uid, email
    from last_activity
    where latest_activity < warning_cutoff
      and email is not null  -- skip anonymous users; they're handled by Supabase's anon GC
    order by uid
    limit batch_size
  ),
  marked as (
    update profiles p
    set inactive_warning_sent_at = now()
    from candidates c
    where p.id = c.uid
    returning p.id
  )
  select c.uid, c.email
  from candidates c
  where c.uid in (select id from marked);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. select_purgeable_inactive_users — weekly cron. Returns ids of users
--    flagged >=30 days ago AND still inactive AND email-bearing (anon GC
--    handled separately by Supabase). API layer iterates the list and
--    calls supabase.auth.admin.deleteUser(id) for each — that cascades
--    through every FK in the cascade migration (account-deletion item 1).
--
--    We don't do the delete in SQL because auth.users delete via SQL is
--    fragile (Supabase recommends going through the admin API). We just
--    return the candidates and let the API layer batch-call.
-- ---------------------------------------------------------------------------
create or replace function select_purgeable_inactive_users()
returns table (user_id uuid, email text, warned_at timestamptz, latest_activity timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  warned_cutoff timestamptz := now() - interval '30 days';
  inactive_cutoff timestamptz := now() - interval '24 months';
  batch_size int := 100;
begin
  return query
  select
    u.id as uid,
    u.email,
    p.inactive_warning_sent_at,
    greatest(
      coalesce(u.last_sign_in_at, u.created_at),
      coalesce((select max(t.started_at) from trips t where t.user_id = u.id), u.created_at)
    ) as latest_activity
  from profiles p
  join auth.users u on u.id = p.id
  where p.inactive_warning_sent_at is not null
    and p.inactive_warning_sent_at < warned_cutoff
    and u.email is not null
    and greatest(
      coalesce(u.last_sign_in_at, u.created_at),
      coalesce((select max(t.started_at) from trips t where t.user_id = u.id), u.created_at)
    ) < inactive_cutoff
  order by u.id
  limit batch_size;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. clear_inactive_warning — invoked when a previously-flagged user comes
--    back (signs in, posts a trip, etc.). Resets the warning so they don't
--    get purged when the next purge cron runs. The API layer can call this
--    from session-start handlers if desired; for now nothing calls it
--    automatically — manual cleanup tool for moderator.
-- ---------------------------------------------------------------------------
create or replace function clear_inactive_warning(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set inactive_warning_sent_at = null
  where id = target_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants for functions to be invoked by the service_role.
-- ---------------------------------------------------------------------------
grant execute on function truncate_old_gps_trails() to service_role;
grant execute on function flag_inactive_users() to service_role;
grant execute on function select_purgeable_inactive_users() to service_role;
grant execute on function clear_inactive_warning(uuid) to service_role;

commit;
