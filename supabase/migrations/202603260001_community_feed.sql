-- Community Feed: profiles, trip_shares, feed_likes, feed_comments
-- Requires PostGIS extension (already enabled for road_risk_data)

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  avatar_url text,
  auto_share_rides boolean not null default false,
  trim_route_endpoints boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles_select_authenticated"
  on profiles for select
  to authenticated
  using (true);

create policy "profiles_insert_own"
  on profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Auto-create a profile row when a new user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Drop if exists so migration is re-runnable
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. trip_shares
-- ---------------------------------------------------------------------------
create table if not exists trip_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  trip_id uuid references trips on delete set null,
  title text not null default '',
  start_location_text text not null default '',
  destination_text text not null default '',
  distance_meters numeric not null default 0,
  duration_seconds numeric not null default 0,
  elevation_gain_meters numeric,
  average_speed_mps numeric,
  safety_rating int check (safety_rating is null or (safety_rating >= 1 and safety_rating <= 5)),
  geometry_polyline6 text not null,
  start_coordinate geography(Point, 4326) not null,
  safety_tags text[] not null default '{}',
  note text,
  shared_at timestamptz not null default now()
);

create index if not exists idx_trip_shares_start_coordinate
  on trip_shares using gist (start_coordinate);

create index if not exists idx_trip_shares_shared_at
  on trip_shares (shared_at desc);

create index if not exists idx_trip_shares_user_id
  on trip_shares (user_id);

alter table trip_shares enable row level security;

create policy "trip_shares_select_authenticated"
  on trip_shares for select
  to authenticated
  using (true);

create policy "trip_shares_insert_own"
  on trip_shares for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "trip_shares_update_own"
  on trip_shares for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "trip_shares_delete_own"
  on trip_shares for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. feed_likes
-- ---------------------------------------------------------------------------
create table if not exists feed_likes (
  id uuid primary key default gen_random_uuid(),
  trip_share_id uuid not null references trip_shares on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  unique (trip_share_id, user_id)
);

create index if not exists idx_feed_likes_trip_share_id
  on feed_likes (trip_share_id);

alter table feed_likes enable row level security;

create policy "feed_likes_select_authenticated"
  on feed_likes for select
  to authenticated
  using (true);

create policy "feed_likes_insert_own"
  on feed_likes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "feed_likes_delete_own"
  on feed_likes for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. feed_comments
-- ---------------------------------------------------------------------------
create table if not exists feed_comments (
  id uuid primary key default gen_random_uuid(),
  trip_share_id uuid not null references trip_shares on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_feed_comments_trip_share_id
  on feed_comments (trip_share_id);

alter table feed_comments enable row level security;

create policy "feed_comments_select_authenticated"
  on feed_comments for select
  to authenticated
  using (true);

create policy "feed_comments_insert_own"
  on feed_comments for insert
  to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. RPC: get_nearby_feed (spatial + aggregate query)
-- ---------------------------------------------------------------------------
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
  comment_count bigint,
  liked_by_me boolean,
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
    coalesce(cc.cnt, 0) as comment_count,
    exists(
      select 1 from feed_likes fl
      where fl.trip_share_id = ts.id and fl.user_id = requesting_user_id
    ) as liked_by_me,
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
