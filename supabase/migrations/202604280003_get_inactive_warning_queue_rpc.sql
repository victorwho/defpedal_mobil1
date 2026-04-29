-- Inactive-warning mailer queue RPC.
--
-- Compliance plan item 13 follow-up #2. The Edge Function `inactive-warning`
-- needs `email` per queued user, but profiles has no email column (emails live
-- in `auth.users`). PostgREST does not expose the auth schema for direct joins,
-- and supabase-js cannot do a cross-schema join in one round trip.
--
-- This RPC encapsulates the join behind a SECURITY DEFINER function callable
-- only by service_role (the Edge Function uses the service-role key). Returns
-- the queue rows the mailer needs in a single call.
--
-- locale is NULL because no profile.locale column exists today — the Edge
-- Function falls back to English when locale is NULL, which matches the
-- soft-launch Romania-first plan (RO users get EN until we add per-profile
-- locale). When/if locale lands on profiles, change the SELECT to read it.

CREATE OR REPLACE FUNCTION public.get_inactive_warning_queue(batch_size INT DEFAULT 50)
RETURNS TABLE(
  id UUID,
  email TEXT,
  locale TEXT,
  inactive_warning_sent_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id,
    u.email::TEXT,
    NULL::TEXT AS locale,
    p.inactive_warning_sent_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.inactive_warning_sent_at IS NOT NULL
    AND p.inactive_warning_email_sent_at IS NULL
    AND u.email IS NOT NULL
  ORDER BY p.inactive_warning_sent_at ASC
  LIMIT batch_size;
$$;

COMMENT ON FUNCTION public.get_inactive_warning_queue(INT) IS
  'Returns up to batch_size users in the inactive-warning mailer queue '
  '(profiles.inactive_warning_sent_at IS NOT NULL AND inactive_warning_email_sent_at IS NULL), '
  'joined with auth.users to surface email. Service-role only.';

REVOKE EXECUTE ON FUNCTION public.get_inactive_warning_queue(INT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_inactive_warning_queue(INT) TO service_role;
