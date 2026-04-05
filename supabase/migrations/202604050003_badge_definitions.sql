-- ═══════════════════════════════════════════════════════════════════════════
-- Badge System Foundation — Phase 1
-- Creates badge_definitions table, seeds all ~146 badges, extends ride_impacts
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. badge_definitions — static catalog of all badges
CREATE TABLE IF NOT EXISTS badge_definitions (
  badge_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  display_tab TEXT NOT NULL,
  name TEXT NOT NULL,
  flavor_text TEXT NOT NULL,
  criteria_text TEXT NOT NULL,
  criteria_unit TEXT,
  tier INTEGER NOT NULL DEFAULT 0,
  tier_family TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  is_seasonal BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  icon_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Allow all authenticated users to read badge definitions (public catalog)
ALTER TABLE badge_definitions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "badge_definitions_select_all" ON badge_definitions;
  CREATE POLICY "badge_definitions_select_all"
    ON badge_definitions FOR SELECT
    TO authenticated
    USING (true);
END $$;

GRANT SELECT ON badge_definitions TO authenticated;
GRANT ALL ON badge_definitions TO service_role;

-- 2. Extend ride_impacts with badge evaluation data
ALTER TABLE ride_impacts ADD COLUMN IF NOT EXISTS elevation_gain_m NUMERIC DEFAULT 0;
ALTER TABLE ride_impacts ADD COLUMN IF NOT EXISTS weather_condition TEXT;
ALTER TABLE ride_impacts ADD COLUMN IF NOT EXISTS wind_speed_kmh NUMERIC;
ALTER TABLE ride_impacts ADD COLUMN IF NOT EXISTS temperature_c NUMERIC;
ALTER TABLE ride_impacts ADD COLUMN IF NOT EXISTS aqi_level TEXT;
ALTER TABLE ride_impacts ADD COLUMN IF NOT EXISTS ride_start_hour INTEGER;
ALTER TABLE ride_impacts ADD COLUMN IF NOT EXISTS duration_minutes NUMERIC DEFAULT 0;

-- 3. Seed ALL badge definitions
-- ═══════════════════════════════════════════════════════════════════════════
-- FIRSTS (13 badges) — one-time, tier=0, display_tab=firsts
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO badge_definitions (badge_key, category, display_tab, name, flavor_text, criteria_text, criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key) VALUES
('first_ride',       'firsts', 'firsts', 'First Pedal',       'The hardest part is starting. You did.',            'Complete your first ride',                   NULL,    0, NULL, false, false, 100, 'first_ride'),
('first_safe_route', 'firsts', 'firsts', 'Safety First',      'You chose the road less dangerous.',                'Complete a ride using a Safe route',          NULL,    0, NULL, false, false, 101, 'first_safe_route'),
('first_hazard',     'firsts', 'firsts', 'Watchful Eye',      'You saw something. You said something.',            'Report your first hazard',                   NULL,    0, NULL, false, false, 102, 'first_hazard'),
('first_share',      'firsts', 'firsts', 'Open Road',         'Your ride might inspire someone else''s.',          'Share a trip to the community feed',          NULL,    0, NULL, false, false, 103, 'first_share'),
('first_comment',    'firsts', 'firsts', 'Pit Stop Chat',     'Every ride is better with company.',                'Comment on a community trip',                 NULL,    0, NULL, false, false, 104, 'first_comment'),
('first_like',       'firsts', 'firsts', 'Thumbs Up',         'A little encouragement goes a long way.',           'Like or love a community trip',               NULL,    0, NULL, false, false, 105, 'first_like'),
('first_validation', 'firsts', 'firsts', 'Second Opinion',    'Trust, but verify.',                                'Confirm or deny a hazard report',             NULL,    0, NULL, false, false, 106, 'first_validation'),
('first_quiz',       'firsts', 'firsts', 'Quick Study',       'Knowledge is the best safety gear.',                'Complete your first daily safety quiz',        NULL,    0, NULL, false, false, 107, 'first_quiz'),
('first_multi_stop', 'firsts', 'firsts', 'Waypoint Wanderer', 'Why go one place when you can go three?',           'Complete a ride with 2+ waypoints',           NULL,    0, NULL, false, false, 108, 'first_multi_stop'),
('first_night_ride', 'firsts', 'firsts', 'After Dark',        'The city has a different heartbeat at night.',       'Complete a ride between 9 PM and 5 AM',       NULL,    0, NULL, false, false, 109, 'first_night_ride'),
('first_rain_ride',  'firsts', 'firsts', 'Rain Check Declined','They said it would rain. You went anyway.',        'Complete a ride when precipitation > 0',       NULL,    0, NULL, false, false, 110, 'first_rain_ride'),
('first_10km',       'firsts', 'firsts', 'Double Digits',     'Your first ride measured in tens.',                  'Complete a single ride of 10+ km',            'km',    0, NULL, false, false, 111, 'first_10km'),
('first_week_streak','firsts', 'firsts', 'Seven Strong',      'A week of showing up. Habit forming.',              'Reach a 7-day streak',                        'days',  0, NULL, false, false, 112, 'first_week_streak')
ON CONFLICT (badge_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- DISTANCE — Road Warrior (5) + Iron Legs (5), display_tab=riding
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO badge_definitions (badge_key, category, display_tab, name, flavor_text, criteria_text, criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key) VALUES
('distance_50km',   'riding', 'riding', 'Road Warrior I',   'Your first half-century. The road knows your name.',                   '50 km total',    'km', 1, 'road_warrior', false, false, 200, 'road_warrior'),
('distance_150km',  'riding', 'riding', 'Road Warrior II',  'You''ve outrun the train from Bucharest to Brasov.',                   '150 km total',   'km', 2, 'road_warrior', false, false, 201, 'road_warrior'),
('distance_500km',  'riding', 'riding', 'Road Warrior III', 'Half a thousand. The car dealers are getting nervous.',                 '500 km total',   'km', 3, 'road_warrior', false, false, 202, 'road_warrior'),
('distance_1500km', 'riding', 'riding', 'Road Warrior IV',  'That''s Bucharest to Paris. On two wheels.',                            '1,500 km total', 'km', 4, 'road_warrior', false, false, 203, 'road_warrior'),
('distance_5000km', 'riding', 'riding', 'Road Warrior V',   'You could have crossed Europe. Twice.',                                '5,000 km total', 'km', 5, 'road_warrior', false, false, 204, 'road_warrior'),

('single_10km',  'riding', 'riding', 'Iron Legs I',   'Double digits in a single push.',                                    '10 km in one ride',  'km', 1, 'iron_legs', false, false, 210, 'iron_legs'),
('single_25km',  'riding', 'riding', 'Iron Legs II',  'A proper ride. Respect.',                                            '25 km in one ride',  'km', 2, 'iron_legs', false, false, 211, 'iron_legs'),
('single_50km',  'riding', 'riding', 'Iron Legs III', 'Half-century. You earned this one on the saddle.',                    '50 km in one ride',  'km', 3, 'iron_legs', false, false, 212, 'iron_legs'),
('single_100km', 'riding', 'riding', 'Iron Legs IV',  'The century ride. You''re officially a machine.',                     '100 km in one ride', 'km', 4, 'iron_legs', false, false, 213, 'iron_legs'),
('single_200km', 'riding', 'riding', 'Iron Legs V',   'Ultra-distance. You''ve entered legend territory.',                   '200 km in one ride', 'km', 5, 'iron_legs', false, false, 214, 'iron_legs')
ON CONFLICT (badge_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- TIME ON BIKE — Saddle Time (5), display_tab=riding
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO badge_definitions (badge_key, category, display_tab, name, flavor_text, criteria_text, criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key) VALUES
('time_5h',   'riding', 'riding', 'Saddle Time I',   'Five hours of freedom.',                         '5 hours total',   'hours', 1, 'saddle_time', false, false, 220, 'saddle_time'),
('time_15h',  'riding', 'riding', 'Saddle Time II',  'That''s a good night''s sleep — on two wheels.', '15 hours total',  'hours', 2, 'saddle_time', false, false, 221, 'saddle_time'),
('time_50h',  'riding', 'riding', 'Saddle Time III', 'Fifty hours the city was yours.',                '50 hours total',  'hours', 3, 'saddle_time', false, false, 222, 'saddle_time'),
('time_150h', 'riding', 'riding', 'Saddle Time IV',  'A full work week. But better.',                  '150 hours total', 'hours', 4, 'saddle_time', false, false, 223, 'saddle_time'),
('time_500h', 'riding', 'riding', 'Saddle Time V',   '500 hours of wind, road, and freedom.',          '500 hours total', 'hours', 5, 'saddle_time', false, false, 224, 'saddle_time')
ON CONFLICT (badge_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- RIDE COUNT — Pedal Counter (5), display_tab=riding
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO badge_definitions (badge_key, category, display_tab, name, flavor_text, criteria_text, criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key) VALUES
('rides_10',   'riding', 'riding', 'Pedal Counter I',   'Double digits. The habit is forming.',                                              '10 rides',    'rides', 1, 'pedal_counter', false, false, 230, 'pedal_counter'),
('rides_30',   'riding', 'riding', 'Pedal Counter II',  'A ride a day for a month. Or your own pace. Either way.',                            '30 rides',    'rides', 2, 'pedal_counter', false, false, 231, 'pedal_counter'),
('rides_100',  'riding', 'riding', 'Pedal Counter III', 'Welcome to the Century Club.',                                                      '100 rides',   'rides', 3, 'pedal_counter', false, false, 232, 'pedal_counter'),
('rides_300',  'riding', 'riding', 'Pedal Counter IV',  '300 times you chose the bike. 300 times the city was better for it.',                '300 rides',   'rides', 4, 'pedal_counter', false, false, 233, 'pedal_counter'),
('rides_1000', 'riding', 'riding', 'Pedal Counter V',   'A thousand rides. You don''t ride a bike — you ARE a cyclist.',                      '1,000 rides', 'rides', 5, 'pedal_counter', false, false, 234, 'pedal_counter')
ON CONFLICT (badge_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- FREQUENCY — Iron Streak (5) + Weekend Warrior (3) + Early Bird (3) +
--             Night Owl (3) + Monthly Regular (3), display_tab=consistency
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO badge_definitions (badge_key, category, display_tab, name, flavor_text, criteria_text, criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key) VALUES
('streak_7',   'consistency', 'consistency', 'Iron Streak I',   'A full week. Momentum is real.',                                   '7-day streak',   'days', 1, 'iron_streak', false, false, 300, 'iron_streak'),
('streak_14',  'consistency', 'consistency', 'Iron Streak II',  'Two weeks of showing up. This is who you are now.',                 '14-day streak',  'days', 2, 'iron_streak', false, false, 301, 'iron_streak'),
('streak_30',  'consistency', 'consistency', 'Iron Streak III', 'Rain or shine. Monday or Sunday. Nothing stops you.',               '30-day streak',  'days', 3, 'iron_streak', false, false, 302, 'iron_streak'),
('streak_60',  'consistency', 'consistency', 'Iron Streak IV',  'Two months unbroken. You''ve ascended.',                            '60-day streak',  'days', 4, 'iron_streak', false, false, 303, 'iron_streak'),
('streak_100', 'consistency', 'consistency', 'Iron Streak V',   'Triple digits. Duolingo''s owl is jealous.',                        '100-day streak', 'days', 5, 'iron_streak', false, false, 304, 'iron_streak'),

('weekend_4',  'consistency', 'consistency', 'Weekend Warrior I',   'Saturdays are for saddles.',                             'Ride every weekend for 4 weeks',   'weekends', 1, 'weekend_warrior', false, false, 310, 'weekend_warrior'),
('weekend_8',  'consistency', 'consistency', 'Weekend Warrior II',  'Two months of weekend rides. Brunch can wait.',          '8 consecutive weekends',           'weekends', 2, 'weekend_warrior', false, false, 311, 'weekend_warrior'),
('weekend_16', 'consistency', 'consistency', 'Weekend Warrior III', 'Four months. Your weekends have a new default.',         '16 consecutive weekends',          'weekends', 3, 'weekend_warrior', false, false, 312, 'weekend_warrior'),

('early_5',  'consistency', 'consistency', 'Early Bird I',   'The city is quiet. The roads are yours.',                                              '5 rides started before 7 AM',  'rides', 1, 'early_bird', false, false, 320, 'early_bird'),
('early_15', 'consistency', 'consistency', 'Early Bird II',  'You''ve seen more sunrises from a saddle than most see from a window.',                 '15 rides before 7 AM',         'rides', 2, 'early_bird', false, false, 321, 'early_bird'),
('early_50', 'consistency', 'consistency', 'Early Bird III', 'Dawn patrol veteran.',                                                                 '50 rides before 7 AM',         'rides', 3, 'early_bird', false, false, 322, 'early_bird'),

('night_5',  'consistency', 'consistency', 'Night Owl I',   'The night shift. Different roads, different rules.',    '5 rides after 9 PM',  'rides', 1, 'night_owl', false, false, 330, 'night_owl'),
('night_15', 'consistency', 'consistency', 'Night Owl II',  'The city''s nocturnal cyclist.',                        '15 rides after 9 PM', 'rides', 2, 'night_owl', false, false, 331, 'night_owl'),
('night_50', 'consistency', 'consistency', 'Night Owl III', 'You own the moonlight.',                                '50 rides after 9 PM', 'rides', 3, 'night_owl', false, false, 332, 'night_owl'),

('monthly_10', 'consistency', 'consistency', 'Monthly Regular I',   'This month heard your tires on the tarmac.',          '10 rides in a calendar month', 'rides', 1, 'monthly_regular', false, false, 340, 'monthly_regular'),
('monthly_20', 'consistency', 'consistency', 'Monthly Regular II',  'Every other day. Like clockwork.',                    '20 rides in a calendar month', 'rides', 2, 'monthly_regular', false, false, 341, 'monthly_regular'),
('monthly_30', 'consistency', 'consistency', 'Monthly Regular III', 'Every. Single. Day. This month was yours.',           '30 rides in a calendar month', 'rides', 3, 'monthly_regular', false, false, 342, 'monthly_regular')
ON CONFLICT (badge_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- ENVIRONMENTAL IMPACT — Green Machine (5) + Penny Wise (5), display_tab=impact
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO badge_definitions (badge_key, category, display_tab, name, flavor_text, criteria_text, criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key) VALUES
('co2_5kg',   'impact', 'impact', 'Green Machine I',   'That''s 60 smartphone charges the planet didn''t need.',                '5 kg CO2 saved',   'kg', 1, 'green_machine', false, false, 400, 'green_machine'),
('co2_15kg',  'impact', 'impact', 'Green Machine II',  'Nearly a tree''s worth of annual absorption. Keep going.',              '15 kg CO2 saved',  'kg', 2, 'green_machine', false, false, 401, 'green_machine'),
('co2_50kg',  'impact', 'impact', 'Green Machine III', 'Two trees'' worth. You''re a rolling forest.',                          '50 kg CO2 saved',  'kg', 3, 'green_machine', false, false, 402, 'green_machine'),
('co2_150kg', 'impact', 'impact', 'Green Machine IV',  'Seven trees breathing easier because of you.',                          '150 kg CO2 saved', 'kg', 4, 'green_machine', false, false, 403, 'green_machine'),
('co2_500kg', 'impact', 'impact', 'Green Machine V',   'Half a metric ton. You''ve offset a transatlantic flight.',             '500 kg CO2 saved', 'kg', 5, 'green_machine', false, false, 404, 'green_machine'),

('money_10',   'impact', 'impact', 'Penny Wise I',   'That''s a nice coffee. From pedaling.',                  '10 EUR saved',    'EUR', 1, 'penny_wise', false, false, 410, 'penny_wise'),
('money_50',   'impact', 'impact', 'Penny Wise II',  'A dinner for two — funded by your legs.',                '50 EUR saved',    'EUR', 2, 'penny_wise', false, false, 411, 'penny_wise'),
('money_200',  'impact', 'impact', 'Penny Wise III', 'A weekend trip. The bike paid for itself.',              '200 EUR saved',   'EUR', 3, 'penny_wise', false, false, 412, 'penny_wise'),
('money_500',  'impact', 'impact', 'Penny Wise IV',  'Half a new bike. Funded by not driving.',                '500 EUR saved',   'EUR', 4, 'penny_wise', false, false, 413, 'penny_wise'),
('money_2000', 'impact', 'impact', 'Penny Wise V',   'A whole new bike. And then some.',                       '2,000 EUR saved', 'EUR', 5, 'penny_wise', false, false, 414, 'penny_wise')
ON CONFLICT (badge_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- HEALTH — Time Banker (5) + Community Giver (4), display_tab=impact
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO badge_definitions (badge_key, category, display_tab, name, flavor_text, criteria_text, criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key) VALUES
('ml_2',    'impact', 'impact', 'Time Banker I',   'One hour of life. Earned on two wheels.',                       '2 microlives (1 hour)',      'microlives', 1, 'time_banker', false, false, 420, 'time_banker'),
('ml_8',    'impact', 'impact', 'Time Banker II',  'Half a workday of bonus life.',                                 '8 microlives (4 hours)',     'microlives', 2, 'time_banker', false, false, 421, 'time_banker'),
('ml_48',   'impact', 'impact', 'Time Banker III', 'You''ve earned an extra day on Earth. Literally.',              '48 microlives (1 day)',      'microlives', 3, 'time_banker', false, false, 422, 'time_banker'),
('ml_336',  'impact', 'impact', 'Time Banker IV',  'A full bonus week of living.',                                  '336 microlives (1 week)',    'microlives', 4, 'time_banker', false, false, 423, 'time_banker'),
('ml_1440', 'impact', 'impact', 'Time Banker V',   'Thirty extra days. You''ve cheated time itself.',               '1,440 microlives (1 month)', 'microlives', 5, 'time_banker', false, false, 424, 'time_banker'),

('community_60s',   'impact', 'impact', 'Community Giver I',   'A minute of time donated to your city''s future.',              '60 seconds donated',    'seconds', 1, 'community_giver', false, false, 430, 'community_giver'),
('community_300s',  'impact', 'impact', 'Community Giver II',  'Five minutes of data for safer roads.',                         '5 minutes donated',     'seconds', 2, 'community_giver', false, false, 431, 'community_giver'),
('community_1800s', 'impact', 'impact', 'Community Giver III', 'Half an hour of community contribution.',                       '30 minutes donated',    'seconds', 3, 'community_giver', false, false, 432, 'community_giver'),
('community_3600s', 'impact', 'impact', 'Community Giver IV',  'An hour of your cycling data powering safer infrastructure.',   '1 hour donated',        'seconds', 4, 'community_giver', false, false, 433, 'community_giver')
ON CONFLICT (badge_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- HAZARD REPORTING — Road Guardian (5) + Validator (3) + Specialists (5),
--                    display_tab=safety
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO badge_definitions (badge_key, category, display_tab, name, flavor_text, criteria_text, criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key) VALUES
('hazard_5',   'safety', 'safety', 'Road Guardian I',   'Eyes open, roads safer.',                                                              '5 hazards reported',   'hazards', 1, 'road_guardian', false, false, 500, 'road_guardian'),
('hazard_15',  'safety', 'safety', 'Road Guardian II',  'The streets have a sentinel.',                                                         '15 hazards reported',  'hazards', 2, 'road_guardian', false, false, 501, 'road_guardian'),
('hazard_50',  'safety', 'safety', 'Road Guardian III', 'Guardian Angel status. The city owes you.',                                             '50 hazards reported',  'hazards', 3, 'road_guardian', false, false, 502, 'road_guardian'),
('hazard_100', 'safety', 'safety', 'Road Guardian IV',  'A hundred reports. A hundred moments someone else didn''t get hurt.',                   '100 hazards reported', 'hazards', 4, 'road_guardian', false, false, 503, 'road_guardian'),
('hazard_250', 'safety', 'safety', 'Road Guardian V',   'Legend. Streets literally safer because you exist.',                                    '250 hazards reported', 'hazards', 5, 'road_guardian', false, false, 504, 'road_guardian'),

('validate_10',  'safety', 'safety', 'Validator I',   'Trust the crowd. Verify the hazard.',       '10 hazard validations',  'validations', 1, 'validator', false, false, 510, 'validator'),
('validate_30',  'safety', 'safety', 'Validator II',  'Thirty second opinions that matter.',        '30 validations',         'validations', 2, 'validator', false, false, 511, 'validator'),
('validate_100', 'safety', 'safety', 'Validator III', 'The safety network''s backbone.',             '100 validations',        'validations', 3, 'validator', false, false, 512, 'validator'),

('hazard_pothole',      'safety', 'safety', 'Crater Hunter',      'You see the road others don''t.',                                         'Report 10 potholes',                      'hazards', 0, NULL, false, false, 520, 'hazard_pothole'),
('hazard_parking',      'safety', 'safety', 'Lane Defender',      'Take back the lane.',                                                     'Report 10 illegally parked cars in bike lanes', 'hazards', 0, NULL, false, false, 521, 'hazard_parking'),
('hazard_construction', 'safety', 'safety', 'Hard Hat Spotter',   'Because "road work ahead" doesn''t always come with signs.',               'Report 10 construction zones',            'hazards', 0, NULL, false, false, 522, 'hazard_construction'),
('hazard_intersection', 'safety', 'safety', 'Junction Watcher',   'The most dangerous 10 meters of any ride.',                                'Report 10 dangerous intersections',       'hazards', 0, NULL, false, false, 523, 'hazard_intersection'),
('hazard_all_types',    'safety', 'safety', 'Hazard Encyclopedia','You''ve seen it all. And reported it all.',                                'Report at least 1 of every hazard type',  NULL,      0, NULL, false, false, 524, 'hazard_all_types')
ON CONFLICT (badge_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- QUIZ — Quiz Master (4) + Perfect Score (3), display_tab=safety
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO badge_definitions (badge_key, category, display_tab, name, flavor_text, criteria_text, criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key) VALUES
('quiz_5',   'safety', 'safety', 'Quiz Master I',   'Knowledge check: passed.',                          '5 quizzes completed',   'quizzes', 1, 'quiz_master', false, false, 530, 'quiz_master'),
('quiz_15',  'safety', 'safety', 'Quiz Master II',  'Fifteen rounds of safety wisdom.',                  '15 quizzes completed',  'quizzes', 2, 'quiz_master', false, false, 531, 'quiz_master'),
('quiz_50',  'safety', 'safety', 'Quiz Master III', 'Walking safety encyclopedia.',                      '50 quizzes completed',  'quizzes', 3, 'quiz_master', false, false, 532, 'quiz_master'),
('quiz_100', 'safety', 'safety', 'Quiz Master IV',  'Professor of the Pavement.',                        '100 quizzes completed', 'quizzes', 4, 'quiz_master', false, false, 533, 'quiz_master'),

('quiz_perfect_1',        'safety', 'safety', 'Sharp Mind',    'Clean sweep. Not a single mistake.',                                        '1 perfect quiz score',          NULL, 0, NULL, false, false, 540, 'quiz_perfect'),
('quiz_perfect_5',        'safety', 'safety', 'Razor Sharp',   'Five flawless rounds. Your brain is your best safety gear.',                '5 perfect scores',              NULL, 0, NULL, false, false, 541, 'quiz_perfect'),
('quiz_perfect_streak_3', 'safety', 'safety', 'Genius Chain',  'Three in a row. Perfection isn''t luck — it''s you.',                       '3 perfect scores in a row',     NULL, 0, NULL, false, false, 542, 'quiz_perfect')
ON CONFLICT (badge_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- ATHLETIC — Mountain Goat (4) + Skyward (4) + One-timers (5), display_tab=explore
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO badge_definitions (badge_key, category, display_tab, name, flavor_text, criteria_text, criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key) VALUES
('climb_100m',  'explore', 'explore', 'Mountain Goat I',   'Your legs found the hills. And they didn''t quit.',                      '100m elevation gain in one ride', 'm', 1, 'mountain_goat', false, false, 600, 'mountain_goat'),
('climb_300m',  'explore', 'explore', 'Mountain Goat II',  'That''s a small mountain. On a bicycle.',                                '300m in one ride',                'm', 2, 'mountain_goat', false, false, 601, 'mountain_goat'),
('climb_500m',  'explore', 'explore', 'Mountain Goat III', 'Half a vertical kilometer. Gravity is just a suggestion to you.',        '500m in one ride',                'm', 3, 'mountain_goat', false, false, 602, 'mountain_goat'),
('climb_1000m', 'explore', 'explore', 'Mountain Goat IV',  'One. Full. Vertical. Kilometer. Respect.',                               '1,000m in one ride',              'm', 4, 'mountain_goat', false, false, 603, 'mountain_goat'),

('total_climb_1km',  'explore', 'explore', 'Skyward I',   'Your first vertical kilometer.',                         '1 km total climbing',  'km', 1, 'skyward', false, false, 610, 'skyward'),
('total_climb_5km',  'explore', 'explore', 'Skyward II',  'That''s higher than Mont Blanc.',                        '5 km total',           'km', 2, 'skyward', false, false, 611, 'skyward'),
('total_climb_10km', 'explore', 'explore', 'Skyward III', 'You''ve climbed higher than Everest. Repeatedly.',       '10 km total',          'km', 3, 'skyward', false, false, 612, 'skyward'),
('total_climb_25km', 'explore', 'explore', 'Skyward IV',  'You''ve pedaled to the edge of space. Almost.',          '25 km total',          'km', 4, 'skyward', false, false, 613, 'skyward'),

('sprint_500m_climb', 'explore', 'explore', 'Hill Demon',    'Pure climbing. No flatland padding.',                                '500m elevation gain in a ride under 25km',    'm',     0, NULL, false, false, 620, 'sprint_500m_climb'),
('endurance_2h',      'explore', 'explore', 'Endurance I',   'Two hours in the saddle. Body and machine, one rhythm.',             'Single ride lasting 2+ hours',                'hours', 0, NULL, false, false, 621, 'endurance'),
('endurance_4h',      'explore', 'explore', 'Endurance II',  'Four hours. You went on a journey, not a ride.',                     'Single ride lasting 4+ hours',                'hours', 0, NULL, false, false, 622, 'endurance'),
('round_trip',        'explore', 'explore', 'Boomerang',     'Full circle. The best rides end where they begin.',                  'Start and end within 200m, ride 10+ km',      'km',    0, NULL, false, false, 623, 'round_trip'),
('multi_3stops',      'explore', 'explore', 'Triple Tap',    'Three stops, one ride. Efficiency on wheels.',                       'Complete a ride with 3 waypoints',            NULL,    0, NULL, false, false, 624, 'multi_3stops')
ON CONFLICT (badge_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- WEATHER & CONDITIONS (8), display_tab=explore
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO badge_definitions (badge_key, category, display_tab, name, flavor_text, criteria_text, criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key) VALUES
('rain_ride',    'explore', 'explore', 'Drizzle Drifter',   'A little water never hurt anyone with the right attitude.',          '5 rides in rain (precipitation > 0mm)',          'rides', 0, NULL, false, false, 630, 'drizzle_drifter'),
('rain_ride_10', 'explore', 'explore', 'Storm Chaser',      'You don''t check the weather. The weather checks you.',              '15 rides in rain',                               'rides', 0, NULL, false, false, 631, 'storm_chaser'),
('wind_ride',    'explore', 'explore', 'Headwind Hero',     'The wind pushed. You pushed harder.',                                '5 rides with wind > 30 km/h',                    'rides', 0, NULL, false, false, 632, 'headwind_hero'),
('cold_ride',    'explore', 'explore', 'Frost Rider',       'When others layer up indoors, you layer up and ride.',               '5 rides below 5C',                               'rides', 0, NULL, false, false, 633, 'frost_rider'),
('hot_ride',     'explore', 'explore', 'Heatwave Hauler',   'SPF and saddle. You''re unstoppable.',                               '5 rides above 35C',                              'rides', 0, NULL, false, false, 634, 'heatwave_hauler'),
('all_weather',  'explore', 'explore', 'All-Weather Rider', 'You''ve conquered every element.',                                   'Ride in rain, wind>30, cold<5, and hot>35',      NULL,    0, NULL, false, false, 635, 'all_weather'),
('good_air_20',  'explore', 'explore', 'Clean Air Chaser',  'You pick the best air to breathe deep in.',                          '20 rides with AQI Good or Fair',                 'rides', 0, NULL, false, false, 636, 'good_air'),
('aqi_aware_5',  'explore', 'explore', 'Air Aware',         'You checked the air. Knew the risk. Rode smart.',                    '5 rides completed where AQI was moderate or worse', 'rides', 0, NULL, false, false, 637, 'aqi_aware')
ON CONFLICT (badge_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEASONAL & EVENTS — Annual (8) + Seasonal (5), display_tab=events
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO badge_definitions (badge_key, category, display_tab, name, flavor_text, criteria_text, criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key) VALUES
('new_year',         'events', 'events', 'Fresh Start',       'New year. New rides. Same incredible you.',                  'Ride on January 1st',              NULL, 0, NULL, false, true, 700, 'new_year'),
('valentine',        'events', 'events', 'Love Cyclist',      'Who needs roses when you have roads?',                       'Ride on Valentine''s Day',         NULL, 0, NULL, false, true, 701, 'valentine'),
('earth_day',        'events', 'events', 'Earth Rider',       'Ride for the planet. Report for the planet.',                'Ride + report 1 hazard on Earth Day', NULL, 0, NULL, false, true, 702, 'earth_day'),
('bike_day',         'events', 'events', 'World Bike Day',    'Your day. Our day. The world''s day.',                        'Ride on World Bicycle Day',        NULL, 0, NULL, false, true, 703, 'bike_day'),
('summer_solstice',  'events', 'events', 'Longest Ride Day',  'The longest day demands the longest ride.',                  'Ride on summer solstice',          NULL, 0, NULL, false, true, 704, 'summer_solstice'),
('halloween',        'events', 'events', 'Ghost Rider',       'The streets are haunted. You''re haunting them back.',       'Ride on Halloween',                NULL, 0, NULL, false, true, 705, 'halloween'),
('christmas',        'events', 'events', 'Santa''s Shortcut', 'Delivering gifts? No. Delivering kilometers.',              'Ride on Christmas Eve or Day',     NULL, 0, NULL, false, true, 706, 'christmas'),
('winter_solstice',  'events', 'events', 'Darkest Day Rider', 'The shortest day, but you still made time.',                'Ride on winter solstice',          NULL, 0, NULL, false, true, 707, 'winter_solstice'),

('spring_bloom',  'events', 'events', 'Spring Bloom',  'Spring awakening — on two wheels.',                          '30 rides in spring (Mar-May)',           'rides', 0, NULL, false, true, 710, 'spring_bloom'),
('summer_blaze',  'events', 'events', 'Summer Blaze',  'Heat, sun, and pedal power.',                                '30 rides in summer (Jun-Aug)',           'rides', 0, NULL, false, true, 711, 'summer_blaze'),
('autumn_leaf',   'events', 'events', 'Autumn Leaf',   'Crunching leaves under rubber.',                              '30 rides in autumn (Sep-Nov)',           'rides', 0, NULL, false, true, 712, 'autumn_leaf'),
('winter_steel',  'events', 'events', 'Winter Steel',  'When the roads are cold, the riders are steel.',              '30 rides in winter (Dec-Feb)',           'rides', 0, NULL, false, true, 713, 'winter_steel'),
('four_seasons',  'events', 'events', 'Four Seasons',  'A ride for every season. A cyclist for all of them.',         'Earn all 4 seasonal badges in one year', NULL,    0, NULL, false, true, 714, 'four_seasons')
ON CONFLICT (badge_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMUNITY & SOCIAL — Social Cyclist (3) + Cheerleader (3) + Commentator (3)
--                      + Shield Bearer (3), display_tab=community
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO badge_definitions (badge_key, category, display_tab, name, flavor_text, criteria_text, criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key) VALUES
('shares_5',  'community', 'community', 'Social Cyclist I',   'Your rides inspire others to start theirs.',          '5 trips shared',  'shares',   1, 'social_cyclist', false, false, 800, 'social_cyclist'),
('shares_15', 'community', 'community', 'Social Cyclist II',  'Fifteen stories on the community wall.',              '15 trips shared', 'shares',   2, 'social_cyclist', false, false, 801, 'social_cyclist'),
('shares_50', 'community', 'community', 'Social Cyclist III', 'The feed''s favorite cyclist.',                       '50 trips shared', 'shares',   3, 'social_cyclist', false, false, 802, 'social_cyclist'),

('likes_10',  'community', 'community', 'Cheerleader I',   'A thumbs up can make someone''s day.',           '10 likes/loves given', 'likes',    1, 'cheerleader', false, false, 810, 'cheerleader'),
('likes_50',  'community', 'community', 'Cheerleader II',  'Fifty moments of encouragement.',                '50 likes/loves',       'likes',    2, 'cheerleader', false, false, 811, 'cheerleader'),
('likes_200', 'community', 'community', 'Cheerleader III', 'The community''s biggest fan.',                  '200 likes/loves',      'likes',    3, 'cheerleader', false, false, 812, 'cheerleader'),

('comments_5',  'community', 'community', 'Commentator I',   'Words matter. Yours especially.',                                   '5 comments',  'comments', 1, 'commentator', false, false, 820, 'commentator'),
('comments_20', 'community', 'community', 'Commentator II',  'Twenty conversations started from the saddle.',                      '20 comments', 'comments', 2, 'commentator', false, false, 821, 'commentator'),
('comments_50', 'community', 'community', 'Commentator III', 'The community voice. People look for your take.',                    '50 comments', 'comments', 3, 'commentator', false, false, 822, 'commentator'),

('protected_5',   'community', 'community', 'Shield Bearer I',   'Five cyclists rode safer because of you.',                         '5 riders protected',   'riders', 1, 'shield_bearer', false, false, 830, 'shield_bearer'),
('protected_25',  'community', 'community', 'Shield Bearer II',  'Twenty-five people who didn''t hit that pothole.',                  '25 riders protected',  'riders', 2, 'shield_bearer', false, false, 831, 'shield_bearer'),
('protected_100', 'community', 'community', 'Shield Bearer III', 'A hundred safe passages. Your legacy on the road.',                '100 riders protected', 'riders', 3, 'shield_bearer', false, false, 832, 'shield_bearer')
ON CONFLICT (badge_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECRET / HIDDEN (11) — inline in relevant display_tab
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO badge_definitions (badge_key, category, display_tab, name, flavor_text, criteria_text, criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key) VALUES
('mirror_distance',    'riding',      'riding',      'Mirror Ride',        'Numbers don''t lie. And yours are beautifully symmetric.',              'Ride a mirror distance (11.1, 22.2 km etc.)',         'km',   0, NULL, true, false, 900, 'mirror_distance'),
('full_moon',          'explore',     'explore',     'Lunatic',            'Some say the moon makes people do strange things. Like cycling.',       'Complete a ride during a full moon',                   NULL,   0, NULL, true, false, 901, 'full_moon'),
('midnight',           'explore',     'explore',     'Cinderella',         'The clock struck twelve. You were still pedaling.',                     'Start a ride before midnight, finish after',           NULL,   0, NULL, true, false, 902, 'midnight'),
('friday_13',          'events',      'events',      'Lucky Rider',        'Bad luck? You make your own luck.',                                    'Complete a ride on Friday the 13th',                   NULL,   0, NULL, true, false, 903, 'friday_13'),
('leap_day',           'events',      'events',      'Leap Rider',         'Once every four years. And you were on the bike.',                     'Ride on February 29th',                                NULL,   0, NULL, true, false, 904, 'leap_day'),
('pi_day',             'events',      'events',      'Irrational Rider',   '3.14159... kilometers of mathematical beauty.',                        'Ride on March 14 AND ride at least 3.14 km',          'km',   0, NULL, true, false, 905, 'pi_day'),
('same_origin_dest_7', 'consistency', 'consistency', 'Creature of Habit',  'They say variety is the spice of life. You disagree.',                 'Same origin and destination for 7 consecutive days',   'days', 0, NULL, true, false, 906, 'same_origin_dest_7'),
('zero_risk',          'safety',      'safety',      'Ghost Rider',        'A ride so safe it barely existed. But you did it.',                    'Complete a ride where 100% of the route is safe risk', NULL,   0, NULL, true, false, 907, 'zero_risk'),
('round_number',       'riding',      'riding',      'Numberphile',        'Some people just know when to stop.',                                  'End a ride on exactly X.0 km (5+ km)',                 'km',   0, NULL, true, false, 908, 'round_number'),
('five_am',            'consistency', 'consistency', 'Before the World Wakes', 'While the city sleeps, you ride.',                                 'Start a ride before 5 AM',                             NULL,   0, NULL, true, false, 909, 'five_am'),
('holiday_rider',      'events',      'events',      'Festive Pedals',     'The city rests. You ride.',                                            'Ride on any nationally recognized public holiday',     NULL,   0, NULL, true, false, 910, 'holiday_rider')
ON CONFLICT (badge_key) DO NOTHING;
