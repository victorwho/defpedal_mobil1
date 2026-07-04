-- Fix two broken retention RPCs:
--
-- flag_inactive_users:         "column reference 'email' is ambiguous" — the
--   RETURNS TABLE declares an output variable also named 'email', which
--   conflicts with bare 'email' references inside the CTE WHERE clauses.
--   Fix: alias the CTE column to 'user_email' throughout and cast varchar→text.
--
-- select_purgeable_inactive_users: "Returned type character varying(255) does
--   not match expected type text in column 2" — auth.users.email is varchar(255)
--   but the function signature declares 'email text'. Fix: cast u.email::text.

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
      u.email::text as user_email,
      greatest(
        coalesce(u.last_sign_in_at, u.created_at),
        coalesce((select max(t.started_at) from trips t where t.user_id = u.id), u.created_at)
      ) as latest_activity
    from auth.users u
    join profiles p on p.id = u.id
    where p.inactive_warning_sent_at is null
  ),
  candidates as (
    select uid, user_email
    from last_activity
    where latest_activity < warning_cutoff
      and user_email is not null
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
  select c.uid, c.user_email
  from candidates c
  where c.uid in (select id from marked);
end;
$$;

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
    u.email::text,
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

grant execute on function flag_inactive_users() to service_role;
grant execute on function select_purgeable_inactive_users() to service_role;
