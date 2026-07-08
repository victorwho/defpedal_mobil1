-- GPS-trail retention throughput (audit 2026-07-05 SCALE-11 P1).
--
-- truncate_old_gps_trails ran at batch_size 200/day — capacity ~73k trips/
-- year. Above ~200 trips/day crossing the 90-day mark, the backlog grows
-- forever and the privacy policy's storage-limitation commitment silently
-- stops being met. Raised to 5000/run; the daily cron keeps calling it once,
-- and `batch_complete=false` still signals when a drain loop is needed.
-- Candidate scan is served by idx_trip_tracks_created_at_with_trail
-- (migration 202607070001). Body otherwise identical to the live definition
-- (pulled via pg_get_functiondef 2026-07-07 — no drift vs 202604280001).

create or replace function truncate_old_gps_trails()
returns table(truncated_count integer, batch_complete boolean)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  cutoff timestamptz := now() - interval '90 days';
  batch_size int := 5000;
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
