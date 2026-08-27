-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-27: `civic_sesizari` badge ladder (1 / 5 / 25 escalations).
--
-- Thresholds are mirrored in packages/core/src/sesizare.ts
-- (SESIZARE_BADGE_THRESHOLDS) and a core test asserts [1, 5, 25]. Change both
-- or neither.
--
-- ⚠️ Deliberately does NOT touch check_and_award_badges(). That function is
-- 913 lines and the live copy has drifted from this repo (see memory
-- `reference_supabase-rpc-drift`); a CREATE OR REPLACE from the tracked source
-- would silently roll back production fixes. This adds a small, additive
-- evaluator instead, writing into the same `user_badges` table so the Trophy
-- Case, progress bars and unlock overlay all work unchanged.
--
-- Honesty note: a row in `sesizari` records a TAP-THROUGH to civia.ro, never a
-- confirmed filing. Flavor text says "ai dus problema mai departe" — never
-- "sesizare trimisă". See docs/plans/sesizari-civia.md §7.
-- ════════════════════════════════════════════════════════════════════════════

begin;

insert into badge_definitions (
  badge_key, category, display_tab, name, flavor_text, criteria_text,
  criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key
) values
  ('sesizare_1',  'community', 'community', 'Vocea Străzii',
   'You took a pothole further than a map pin.',
   'Escalate 1 hazard to the authorities',
   'sesizări', 1, 'civic_sesizari', false, false, 840, 'civic_sesizari'),
  ('sesizare_5',  'community', 'community', 'Cetățean Activ',
   'Five problems that now have someone official looking at them.',
   'Escalate 5 hazards to the authorities',
   'sesizări', 2, 'civic_sesizari', false, false, 841, 'civic_sesizari'),
  ('sesizare_25', 'community', 'community', 'Schimbă Orașul',
   'Twenty-five. The city knows your name by now.',
   'Escalate 25 hazards to the authorities',
   'sesizări', 3, 'civic_sesizari', false, false, 842, 'civic_sesizari')
on conflict (badge_key) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- award_sesizare_badges — additive evaluator, called by POST /v1/sesizari.
--
-- Returns the same JSONB row shape as check_and_award_badges() so the mobile
-- BadgeUnlockOverlay can consume it without a second code path.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.award_sesizare_badges(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count      bigint;
  v_candidates text[] := array[]::text[];
  v_result     jsonb;
begin
  select count(*) into v_count from public.sesizari where user_id = p_user_id;

  if v_count >= 1  then v_candidates := array_append(v_candidates, 'sesizare_1');  end if;
  if v_count >= 5  then v_candidates := array_append(v_candidates, 'sesizare_5');  end if;
  if v_count >= 25 then v_candidates := array_append(v_candidates, 'sesizare_25'); end if;

  -- Drop the ones already held, so the return value contains ONLY newly
  -- awarded badges and the client doesn't re-celebrate an old one.
  select coalesce(array_agg(c), array[]::text[])
  into v_candidates
  from unnest(v_candidates) as c
  where not exists (
    select 1 from public.user_badges ub
    where ub.user_id = p_user_id and ub.badge_key = c
  );

  if array_length(v_candidates, 1) is null then
    return '[]'::jsonb;
  end if;

  insert into public.user_badges (user_id, badge_key)
  select p_user_id, bd.badge_key
  from public.badge_definitions bd
  where bd.badge_key = any(v_candidates)
  on conflict (user_id, badge_key) do nothing;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'badge_key',     bd.badge_key,
        'category',      bd.category,
        'display_tab',   bd.display_tab,
        'name',          bd.name,
        'flavor_text',   bd.flavor_text,
        'criteria_text', bd.criteria_text,
        'criteria_unit', bd.criteria_unit,
        'tier',          bd.tier,
        'tier_family',   bd.tier_family,
        'is_hidden',     bd.is_hidden,
        'is_seasonal',   bd.is_seasonal,
        'sort_order',    bd.sort_order,
        'icon_key',      bd.icon_key,
        'earned_at',     ub.earned_at
      )
      order by bd.sort_order
    ),
    '[]'::jsonb
  )
  into v_result
  from public.badge_definitions bd
  join public.user_badges ub
    on ub.badge_key = bd.badge_key and ub.user_id = p_user_id
  where bd.badge_key = any(v_candidates);

  return v_result;
end;
$$;

revoke all on function public.award_sesizare_badges(uuid) from public, anon, authenticated;
grant execute on function public.award_sesizare_badges(uuid) to service_role;

commit;
