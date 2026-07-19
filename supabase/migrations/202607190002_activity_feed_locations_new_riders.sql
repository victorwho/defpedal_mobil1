-- Feed densification (Phase 5, 2026-07-19)
--
-- 1. Backfill `location` on badge_unlock / tier_up activity_feed rows.
--    These rows shipped with location = NULL, which makes get_ranked_feed
--    treat them as follower-only — 176 badge unlocks + 13 tier-ups were
--    invisible to everyone except followers, a big part of why the feed
--    felt empty. The location is the user's most recent located ride
--    activity (their real riding area — used only for spatial filtering,
--    never displayed).
--
--    Privacy: only users with auto_share_rides = true are backfilled —
--    the sharing toggle is what consents to stranger visibility. Users
--    with the toggle off keep NULL locations (follower-only, unchanged),
--    and private accounts additionally stay behind get_ranked_feed's
--    private_blocked filter either way.
--
--    (The API's autoPublishBadgeUnlock/autoPublishTierUp stamp the same
--    location at publish time going forward — see lib/autoPublish.ts.)

update activity_feed af
set location = (
  select af2.location
  from activity_feed af2
  where af2.user_id = af.user_id
    and af2.type = 'ride'
    and af2.location is not null
  order by af2.created_at desc
  limit 1
)
where af.type in ('badge_unlock', 'tier_up')
  and af.location is null
  and exists (
    select 1 from profiles p
    where p.id = af.user_id and p.auto_share_rides = true
  )
  and exists (
    select 1 from activity_feed af3
    where af3.user_id = af.user_id
      and af3.type = 'ride'
      and af3.location is not null
  );

-- 2. "N new riders joined this week" aggregate — real profile rows only.
--    Non-anonymous accounts created in the last p_days; when a radius is
--    given, only riders whose shared rides place them in that area count
--    (community scope passes NULL = no spatial requirement). Returns a
--    bare count — no per-user data leaves the database.

create or replace function get_new_rider_count(
  user_lat double precision,
  user_lon double precision,
  radius_meters double precision default null,
  p_days integer default 7
)
returns integer
language plpgsql stable
as $$
declare
  v_point geography;
  v_count integer;
begin
  v_point := ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography;

  select count(*)::int into v_count
  from profiles p
  where p.is_anonymous = false
    and p.created_at >= now() - make_interval(days => p_days)
    and (
      radius_meters is null
      or exists (
        select 1 from trip_shares ts
        where ts.user_id = p.id
          and ts.is_hidden = false
          and ST_DWithin(ts.start_coordinate, v_point, radius_meters)
      )
    );

  return coalesce(v_count, 0);
end;
$$;
