-- Inactive-warning email audit column.
--
-- Compliance plan item 13 (data retention) follow-up. The flag_inactive_users
-- RPC sets profiles.inactive_warning_sent_at when a user crosses the 23-month
-- inactivity threshold. Until now the warning email itself was logged-only
-- pending a mailer pipeline. This migration adds the idempotency column the
-- pipeline (Supabase Edge Function `inactive-warning`) uses to track which
-- warnings have been delivered.
--
-- The mailer queue is computed at runtime as:
--   inactive_warning_sent_at  IS NOT NULL
--   inactive_warning_email_sent_at IS NULL
--
-- so we never re-send an already-delivered warning, and a transient mailer
-- failure leaves the row in the queue for the next cron tick to retry.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS inactive_warning_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.inactive_warning_email_sent_at IS
  'Timestamp when the 23-month inactive-warning email was actually delivered '
  'to the user (set by the inactive-warning Supabase Edge Function). NULL '
  'until a delivery succeeds. Resend on transient failure: row stays in the '
  'queue until inactive_warning_email_sent_at is set or the user becomes '
  'active again (which clears inactive_warning_sent_at via clear_inactive_warning).';

-- Partial index so the Edge Function's queue lookup stays fast as the table
-- grows. Only indexes rows actually in the queue (NULL email_sent_at + NOT
-- NULL warning_sent_at).
CREATE INDEX IF NOT EXISTS idx_profiles_inactive_warning_pending
  ON public.profiles (inactive_warning_sent_at)
  WHERE inactive_warning_sent_at IS NOT NULL
    AND inactive_warning_email_sent_at IS NULL;

-- Keep the existing clear_inactive_warning() function in sync: when a user
-- becomes active again, we should clear BOTH columns so a future round of
-- inactivity starts fresh. Re-create the function with the additional UPDATE.
-- Parameter name `target_user_id` matches the original definition in
-- 202604280001_retention_policies.sql to keep named-arg callers stable.
CREATE OR REPLACE FUNCTION public.clear_inactive_warning(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.profiles
  SET
    inactive_warning_sent_at = NULL,
    inactive_warning_email_sent_at = NULL
  WHERE id = target_user_id;
END;
$$;

COMMENT ON FUNCTION public.clear_inactive_warning(UUID) IS
  'Resets the inactive-warning state for a user when they sign in again. '
  'Called from the auth refresh path. Clears both the warning timestamp and '
  'the email-delivered timestamp so a future inactivity round starts clean.';
