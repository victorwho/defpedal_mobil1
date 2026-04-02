-- trip_loves table + update get_nearby_feed RPC with love_count/loved_by_me
-- Also adds missing hazard_validations SELECT policy and missing indexes.
--
-- The trip_loves table and trip_shares.love_count column already exist in the
-- live database (applied manually).  This migration uses IF NOT EXISTS / IF
-- EXISTS guards so it is safe to run against both fresh and existing databases.

-- ---------------------------------------------------------------------------
-- 1. trip_loves table
-- ---------------------------------------------------------------------------
create table if not exists trip_loves (
  id uuid primary key default gen_random_uuid(),
  trip_share_id uuid not null references trip_shares on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz default now(),
  unique (trip_share_id, user_id)
);

create index if not exists idx_trip_loves_trip_share_id
  on trip_loves (trip_share_id);

alter table trip_loves enable row level security;

-- Idempotent policy creation: drop-if-exists then create
do $$ begin
  drop policy if exists "Anyone can read loves" on trip_loves;
  create policy "Anyone can read loves"
    on trip_loves for select
    to authenticated
    using (true);

  drop policy if exists "Authenticated users can love" on trip_loves;
  create policy "Authenticated users can love"
    on trip_loves for insert
    to authenticated
    with check (user_id = (select auth.uid()));

  drop policy if exists "Users can unlove their own" on trip_loves;
  create policy "Users can unlove their own"
    on trip_loves for delete
    to authenticated
    using (user_id = (select auth.uid()));
end $$;

-- ---------------------------------------------------------------------------
-- 2. trip_shares.love_count column (denormalized counter)
-- ---------------------------------------------------------------------------
alter table trip_shares add column if not exists love_count integer default 0;

-- ---------------------------------------------------------------------------
-- 3. Trigger to keep love_count in sync
-- ---------------------------------------------------------------------------
create or replace function update_love_count()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update trip_shares
    set love_count = coalesce(love_count, 0) + 1
    where id = NEW.trip_share_id;
    return NEW;
  elsif TG_OP = 'DELETE' then
    update trip_shares
    set love_count = greatest(coalesce(love_count, 0) - 1, 0)
    where id = OLD.trip_share_id;
    return OLD;
  end if;
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists trip_loves_count_trigger on trip_loves;
create trigger trip_loves_count_trigger
  after insert or delete on trip_loves
  for each row execute function update_love_count();

-- ---------------------------------------------------------------------------
-- 4. Update get_nearby_feed RPC to include love_count and loved_by_me
--    Must DROP first because the return type changed (added love_count, loved_by_me).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_nearby_feed(double precision, double precision, double precision, integer, timestamptz, uuid);

create or replace function get_nearby_feed(
  user_lat double precision,
  user_lon double precision,
  radius_meters double precision,
  feed_limit int,
  cursor_shared_at timestamptz,
  requesting_user_id uuid
)
returns table (
  id uuid,
  user_id uuid,
  title text,
  start_location_text text,
  destination_text text,
  distance_meters numeric,
  duration_seconds numeric,
  elevation_gain_meters numeric,
  average_speed_mps numeric,
  safety_rating int,
  safety_tags text[],
  geometry_polyline6 text,
  note text,
  shared_at timestamptz,
  like_count bigint,
  love_count int,
  comment_count bigint,
  liked_by_me boolean,
  loved_by_me boolean,
  profiles jsonb
)
language sql stable
as $$
  select
    ts.id,
    ts.user_id,
    ts.title,
    ts.start_location_text,
    ts.destination_text,
    ts.distance_meters,
    ts.duration_seconds,
    ts.elevation_gain_meters,
    ts.average_speed_mps,
    ts.safety_rating,
    ts.safety_tags,
    ts.geometry_polyline6,
    ts.note,
    ts.shared_at,
    coalesce(lc.cnt, 0) as like_count,
    coalesce(ts.love_count, 0) as love_count,
    coalesce(cc.cnt, 0) as comment_count,
    exists(
      select 1 from feed_likes fl
      where fl.trip_share_id = ts.id and fl.user_id = requesting_user_id
    ) as liked_by_me,
    exists(
      select 1 from trip_loves tl
      where tl.trip_share_id = ts.id and tl.user_id = requesting_user_id
    ) as loved_by_me,
    jsonb_build_object(
      'display_name', coalesce(p.display_name, 'Rider'),
      'avatar_url', p.avatar_url
    ) as profiles
  from trip_shares ts
  left join profiles p on p.id = ts.user_id
  left join lateral (
    select count(*) as cnt from feed_likes fl where fl.trip_share_id = ts.id
  ) lc on true
  left join lateral (
    select count(*) as cnt from feed_comments fc where fc.trip_share_id = ts.id
  ) cc on true
  where ST_DWithin(
    ts.start_coordinate,
    ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography,
    radius_meters
  )
  and (cursor_shared_at is null or ts.shared_at < cursor_shared_at)
  order by ts.shared_at desc
  limit feed_limit;
$$;

-- ---------------------------------------------------------------------------
-- 5. Missing hazard_validations SELECT policy
-- ---------------------------------------------------------------------------
do $$ begin
  drop policy if exists "hazard_validations_select_own" on hazard_validations;
  create policy "hazard_validations_select_own"
    on hazard_validations for select
    to authenticated
    using (user_id = (select auth.uid()));
end $$;

-- ---------------------------------------------------------------------------
-- 6. Missing indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_hazards_expires_at
  on hazards (expires_at)
  where expires_at is not null;

create index if not exists idx_trip_shares_trip_id
  on trip_shares (trip_id)
  where trip_id is not null;
