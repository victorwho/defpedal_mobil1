-- ════════════════════════════════════════════════════════════════════════════
-- Drop the user_quiz_history.question_id → quiz_questions(id) foreign key.
--
-- Why
-- ───
-- The original Habit Engine migration (202604030001) modeled the quiz
-- catalogue as a Supabase table, with `user_quiz_history.question_id` carrying
-- a FK back to `quiz_questions(id)`. The architecture has since moved to a
-- pair of static TypeScript catalogues
-- (`services/mobile-api/src/data/quiz-questions.ts` for RO and
-- `quiz-questions-es.ts` for ES), and the route handlers validate the
-- `questionId` against the appropriate pool BEFORE inserting into
-- `user_quiz_history` (`findQuizQuestionInPool` returns undefined → 404).
-- The FK is therefore redundant; it enforces an invariant the application
-- already enforces.
--
-- It is also actively harmful for multi-country pools: the live `quiz_questions`
-- table happens to hold the Romanian UUIDs (seeded by hand at some point), so
-- RO inserts work. The Spanish pool UUIDs are NOT in the table — without this
-- DROP, every Spanish quiz answer would fail with `foreign_key_violation`
-- (SQLSTATE 23503), silently breaking the feature for ES riders.
--
-- We do NOT drop the `quiz_questions` table itself. It's tiny, RLS-guarded,
-- and may still be useful as a content catalogue for future tooling (CMS,
-- analytics joins, translation review). Just the constraint comes off.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_quiz_history
  DROP CONSTRAINT IF EXISTS user_quiz_history_question_id_fkey;
