-- Consolidate the like/love reaction split into a single reaction (review P3).
--
-- Two feeds each had separate "like" + "love" reactions:
--   • v1 trip-share feed: feed_likes + trip_loves
--   • v2 activity feed:    activity_reactions (reaction_type 'like' | 'love')
--
-- The UI is consolidating to a single heart. This folds every "love" into a
-- "like" (preserving each user's reaction, just unified) so the counts read by
-- get_nearby_feed (love_count ← trip_loves) and get_ranked_feed (love ←
-- activity_reactions) naturally become 0 — no feed-RPC rewrite needed. The
-- /love endpoints are aliased to write likes (server change) so neither source
-- table refills.

-- ── v1: trip-share feed ──
-- Fold trip_loves into feed_likes (dedup on the unique (trip_share_id,user_id)),
-- then empty trip_loves so love_count = 0.
insert into feed_likes (trip_share_id, user_id)
select trip_share_id, user_id from trip_loves
on conflict (trip_share_id, user_id) do nothing;

delete from trip_loves;

-- ── v2: activity feed ──
-- Fold reaction_type='love' into 'like'. activity_reactions is unique on
-- (activity_id, user_id, reaction_type), so a user can hold BOTH — drop the
-- love where a like already exists, then convert the remaining loves.
delete from activity_reactions l
 where l.reaction_type = 'love'
   and exists (
     select 1 from activity_reactions k
     where k.activity_id = l.activity_id
       and k.user_id = l.user_id
       and k.reaction_type = 'like'
   );

update activity_reactions set reaction_type = 'like' where reaction_type = 'love';
