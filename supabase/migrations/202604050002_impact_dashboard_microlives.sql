-- Extend get_impact_dashboard RPC to include microlives totals.

CREATE OR REPLACE FUNCTION public.get_impact_dashboard(
  p_user_id UUID,
  p_time_zone TEXT DEFAULT 'UTC'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_streak JSONB;
  v_totals JSONB;
  v_this_week JSONB;
  v_guardian_tier TEXT;
  v_week_start TIMESTAMPTZ;
BEGIN
  -- Monday-aligned week start in user's timezone
  v_week_start := date_trunc('week', (now() AT TIME ZONE p_time_zone))::TIMESTAMPTZ;

  -- Streak state
  SELECT jsonb_build_object(
    'currentStreak', COALESCE(ss.current_streak, 0),
    'longestStreak', COALESCE(ss.longest_streak, 0),
    'lastQualifyingDate', ss.last_qualifying_date,
    'freezeAvailable', COALESCE(ss.freeze_available, false)
  )
  INTO v_streak
  FROM public.streak_state ss
  WHERE ss.user_id = p_user_id;

  IF v_streak IS NULL THEN
    v_streak := jsonb_build_object(
      'currentStreak', 0,
      'longestStreak', 0,
      'lastQualifyingDate', NULL,
      'freezeAvailable', false
    );
  END IF;

  -- Totals from profiles (includes new microlives columns)
  SELECT jsonb_build_object(
    'totalCo2SavedKg', COALESCE(p.total_co2_saved_kg, 0),
    'totalMoneySavedEur', COALESCE(p.total_money_saved_eur, 0),
    'totalHazardsReported', COALESCE(p.total_hazards_reported, 0),
    'totalRidersProtected', COALESCE(p.total_riders_protected, 0),
    'totalMicrolives', COALESCE(p.total_microlives, 0),
    'totalCommunitySeconds', COALESCE(p.total_community_seconds, 0)
  ),
  COALESCE(p.guardian_tier, 'reporter')
  INTO v_totals, v_guardian_tier
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF v_totals IS NULL THEN
    v_totals := jsonb_build_object(
      'totalCo2SavedKg', 0,
      'totalMoneySavedEur', 0,
      'totalHazardsReported', 0,
      'totalRidersProtected', 0,
      'totalMicrolives', 0,
      'totalCommunitySeconds', 0
    );
    v_guardian_tier := 'reporter';
  END IF;

  -- This week aggregation from ride_impacts
  SELECT jsonb_build_object(
    'rides', COUNT(*),
    'co2SavedKg', COALESCE(SUM(ri.co2_saved_kg), 0),
    'moneySavedEur', COALESCE(SUM(ri.money_saved_eur), 0),
    'hazardsReported', 0
  )
  INTO v_this_week
  FROM public.ride_impacts ri
  WHERE ri.user_id = p_user_id
    AND ri.created_at >= v_week_start;

  IF v_this_week IS NULL THEN
    v_this_week := jsonb_build_object('rides', 0, 'co2SavedKg', 0, 'moneySavedEur', 0, 'hazardsReported', 0);
  END IF;

  RETURN jsonb_build_object(
    'streak', v_streak,
    'totals', v_totals,
    'thisWeek', v_this_week,
    'guardianTier', v_guardian_tier
  );
END;
$$;
