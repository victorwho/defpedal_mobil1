-- UGC moderation: report + block + soft-hide.
--
-- Implements Item 7 of the Play Store compliance plan. Required by Play
-- policy for any app with user-visible text/photos:
--   1. Reporting: any user can flag any UGC piece for review.
--   2. Blocking: any user can hide another user's content from their own feed.
--   3. Soft-hide: a moderator (Victor) can mark a comment / hazard / share as
--      hidden without deleting it (preserves audit trail + lets us reverse).
--
-- The auto-filter cron (item 7d) flips is_hidden=true on regex matches and
-- inserts a content_reports row tagged auto_filter=true so Victor can review.
--
-- All FKs cascade on auth.users delete so account deletion (item 1) doesn't
-- leave orphaned reports / blocks.

begin;

-- ---------------------------------------------------------------------------
-- 1. content_reports — user-submitted moderation queue.
-- ---------------------------------------------------------------------------
create table if not exists content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users on delete cascade,
  target_type text not null check (target_type in ('comment', 'hazard', 'trip_share', 'profile')),
  target_id uuid not null,
  reason text not null check (reason in (
    'spam', 'harassment', 'hate', 'sexual', 'violence', 'illegal', 'other'
  )),
  details text,
  -- Status flow: pending -> reviewing -> (resolved | dismissed). Auto-filter
  -- entries land as 'pending' with auto_filter=true so they're easy to filter.
  status text not null default 'pending' check (status in (
    'pending', 'reviewing', 'resolved', 'dismissed'
  )),
  auto_filter boolean not null default false,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users on delete set null,
  -- Action taken by the reviewer: hide / delete / no_action / ban_user.
  -- Free text so we can extend without migration.
  action text,
  constraint content_reports_unique_per_user_target
    unique (reporter_user_id, target_type, target_id)
);

create index if not exists idx_content_reports_status_created
  on content_reports (status, created_at desc);
create index if not exists idx_content_reports_target
  on content_reports (target_type, target_id);
create index if not exists idx_content_reports_auto_filter
  on content_reports (auto_filter)
  where auto_filter = true;

alter table content_reports enable row level security;

-- Users can insert their own reports + read their own report history.
-- Service role (used by the moderation API) bypasses RLS for queue management.
do $$ begin
  drop policy if exists "content_reports_insert_own" on content_reports;
  create policy "content_reports_insert_own"
    on content_reports for insert
    to authenticated
    with check (reporter_user_id = auth.uid());

  drop policy if exists "content_reports_select_own" on content_reports;
  create policy "content_reports_select_own"
    on content_reports for select
    to authenticated
    using (reporter_user_id = auth.uid());
end $$;

-- ---------------------------------------------------------------------------
-- 2. user_blocks — per-viewer mute list.
-- ---------------------------------------------------------------------------
create table if not exists user_blocks (
  blocker_user_id uuid not null references auth.users on delete cascade,
  blocked_user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  -- Self-block makes no sense and would silently hide the user from their own
  -- feed if they ever appeared there.
  constraint user_blocks_no_self check (blocker_user_id <> blocked_user_id)
);

create index if not exists idx_user_blocks_blocker
  on user_blocks (blocker_user_id);

alter table user_blocks enable row level security;

do $$ begin
  drop policy if exists "user_blocks_select_own" on user_blocks;
  create policy "user_blocks_select_own"
    on user_blocks for select
    to authenticated
    using (blocker_user_id = auth.uid());

  drop policy if exists "user_blocks_insert_own" on user_blocks;
  create policy "user_blocks_insert_own"
    on user_blocks for insert
    to authenticated
    with check (blocker_user_id = auth.uid());

  drop policy if exists "user_blocks_delete_own" on user_blocks;
  create policy "user_blocks_delete_own"
    on user_blocks for delete
    to authenticated
    using (blocker_user_id = auth.uid());
end $$;

-- ---------------------------------------------------------------------------
-- 3. is_hidden column on every UGC table.
-- ---------------------------------------------------------------------------
alter table feed_comments add column if not exists is_hidden boolean not null default false;
alter table trip_shares   add column if not exists is_hidden boolean not null default false;
alter table hazards       add column if not exists is_hidden boolean not null default false;

create index if not exists idx_feed_comments_visible
  on feed_comments (trip_share_id, created_at desc)
  where is_hidden = false;
create index if not exists idx_trip_shares_visible
  on trip_shares (shared_at desc)
  where is_hidden = false;
create index if not exists idx_hazards_visible
  on hazards (created_at desc)
  where is_hidden = false;

-- ---------------------------------------------------------------------------
-- 4. Tighten SELECT policies — hide blocked users + hidden rows from feed.
--
-- Replaces the existing _select_authenticated policies with versions that
-- filter on is_hidden + user_blocks. The service role still bypasses RLS for
-- the moderation API.
-- ---------------------------------------------------------------------------

-- trip_shares
drop policy if exists "trip_shares_select_authenticated" on trip_shares;
create policy "trip_shares_select_authenticated"
  on trip_shares for select
  to authenticated
  using (
    is_hidden = false
    and user_id not in (
      select blocked_user_id from user_blocks where blocker_user_id = auth.uid()
    )
  );

-- feed_comments
drop policy if exists "feed_comments_select_authenticated" on feed_comments;
create policy "feed_comments_select_authenticated"
  on feed_comments for select
  to authenticated
  using (
    is_hidden = false
    and user_id not in (
      select blocked_user_id from user_blocks where blocker_user_id = auth.uid()
    )
  );

-- hazards (existing policy is permissive 'select on hazards using true' for all
-- roles. We keep public read for anonymous users — hazards on the map serve
-- safety even for not-signed-in viewers — but filter authenticated viewers
-- through their block list. Anonymous viewers cannot block anyone, so they
-- get the unfiltered map. is_hidden filter applies to everyone.)
drop policy if exists "Allow public select on hazards" on hazards;
create policy "Allow public select on hazards"
  on hazards for select
  using (
    is_hidden = false
    and (
      auth.uid() is null
      or user_id is null
      or user_id not in (
        select blocked_user_id from user_blocks where blocker_user_id = auth.uid()
      )
    )
  );

commit;
