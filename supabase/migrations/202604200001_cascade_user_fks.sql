-- Add ON DELETE CASCADE to all FK constraints that reference auth.users(id).
--
-- Rationale: without CASCADE, deleting a user (test or otherwise) via the
-- Supabase dashboard or admin API fails with a generic "Database error
-- deleting user" because child rows block the delete. Adding CASCADE lets
-- user deletion transitively remove their app-owned data in one step.
--
-- 14 constraints across 13 tables (user_follows has two).

BEGIN;

-- trips
ALTER TABLE public.trips
  DROP CONSTRAINT IF EXISTS trips_user_id_fkey,
  ADD CONSTRAINT trips_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- hazard_validations
ALTER TABLE public.hazard_validations
  DROP CONSTRAINT IF EXISTS hazard_validations_user_id_fkey,
  ADD CONSTRAINT hazard_validations_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ride_impacts
ALTER TABLE public.ride_impacts
  DROP CONSTRAINT IF EXISTS ride_impacts_user_id_fkey,
  ADD CONSTRAINT ride_impacts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- streak_state
ALTER TABLE public.streak_state
  DROP CONSTRAINT IF EXISTS streak_state_user_id_fkey,
  ADD CONSTRAINT streak_state_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- user_badges
ALTER TABLE public.user_badges
  DROP CONSTRAINT IF EXISTS user_badges_user_id_fkey,
  ADD CONSTRAINT user_badges_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- user_quiz_history
ALTER TABLE public.user_quiz_history
  DROP CONSTRAINT IF EXISTS user_quiz_history_user_id_fkey,
  ADD CONSTRAINT user_quiz_history_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- user_follows (two FKs)
ALTER TABLE public.user_follows
  DROP CONSTRAINT IF EXISTS user_follows_follower_id_fkey,
  ADD CONSTRAINT user_follows_follower_id_fkey
    FOREIGN KEY (follower_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  DROP CONSTRAINT IF EXISTS user_follows_following_id_fkey,
  ADD CONSTRAINT user_follows_following_id_fkey
    FOREIGN KEY (following_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- quiz_answers
ALTER TABLE public.quiz_answers
  DROP CONSTRAINT IF EXISTS quiz_answers_user_id_fkey,
  ADD CONSTRAINT quiz_answers_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- xp_events
ALTER TABLE public.xp_events
  DROP CONSTRAINT IF EXISTS xp_events_user_id_fkey,
  ADD CONSTRAINT xp_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- leaderboard_snapshots
ALTER TABLE public.leaderboard_snapshots
  DROP CONSTRAINT IF EXISTS leaderboard_snapshots_user_id_fkey,
  ADD CONSTRAINT leaderboard_snapshots_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- mia_journey_events
ALTER TABLE public.mia_journey_events
  DROP CONSTRAINT IF EXISTS mia_journey_events_user_id_fkey,
  ADD CONSTRAINT mia_journey_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- mia_detection_signals
ALTER TABLE public.mia_detection_signals
  DROP CONSTRAINT IF EXISTS mia_detection_signals_user_id_fkey,
  ADD CONSTRAINT mia_detection_signals_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- user_telemetry_events
ALTER TABLE public.user_telemetry_events
  DROP CONSTRAINT IF EXISTS user_telemetry_events_user_id_fkey,
  ADD CONSTRAINT user_telemetry_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMIT;
