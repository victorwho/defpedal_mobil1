-- ═══════════════════════════════════════════════════════════════════════════
-- Badge #144: Confident Cyclist (Mia journey completion)
-- Awarded when a Mia persona user completes all 5 journey levels.
-- Category: firsts, display_tab: firsts, tier: 0 (one-time achievement)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO badge_definitions (
  badge_key,
  category,
  display_tab,
  name,
  flavor_text,
  criteria_text,
  criteria_unit,
  tier,
  tier_family,
  is_hidden,
  is_seasonal,
  sort_order,
  icon_key
) VALUES (
  'mia_confident_cyclist',
  'firsts',
  'firsts',
  'Confident Cyclist',
  'From nervous to confident. You ARE a cyclist now.',
  'Complete the Mia guided journey (reach Level 5)',
  NULL,
  0,
  NULL,
  false,
  false,
  113,
  'mia_confident_cyclist'
)
ON CONFLICT (badge_key) DO NOTHING;
