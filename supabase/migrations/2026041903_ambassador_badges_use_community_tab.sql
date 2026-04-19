-- Fix: ambassador badges seeded by 2026041901 used display_tab='social', which
-- is not a member of the BadgeDisplayTab union in packages/core/src/contracts.ts:
--   firsts | riding | consistency | impact | safety | community | explore | events
--
-- When a user (particularly a fresh account that just claimed a share and
-- therefore has the ambassador_bronze in their catalog) opens Trophy Case,
-- achievements.tsx groups definitions by display_tab and calls
-- counts[item.badge.displayTab].total++. counts['social'] is undefined → crash.
--
-- Remap to 'community' — the closest semantic match for a social referral
-- achievement. Both display_tab (controls the tab the badge appears under) and
-- category (grouping label) are updated so the client contract stays internally
-- consistent.

UPDATE badge_definitions
   SET category    = 'community',
       display_tab = 'community'
 WHERE badge_key IN ('ambassador_bronze', 'ambassador_silver', 'ambassador_gold');
