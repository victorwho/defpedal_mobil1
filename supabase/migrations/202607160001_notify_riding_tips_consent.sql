-- Anonymous push consent — "Riding tips & reminders" (2026-07-16).
--
-- Context: production audit found the anonymous push channel was ALREADY live
-- without consent — `requireWriteUser` accepts anonymous sessions on
-- PUT /v1/push-token (323 of 439 tokens belonged to anonymous users) and the
-- firstride cron gates only on notify_mia (default TRUE), so 285 'mia'
-- notifications had been sent to anonymous users. These columns turn that
-- into an explicit ePrivacy/GDPR opt-in:
--   notify_riding_tips              — the opt-in flag (default false = opted out)
--   notify_riding_tips_consented_at — the GDPR consent record; set when the
--                                     flag flips false→true, NEVER overwritten
--                                     on repeat ONs, nulled on withdrawal.
--
-- Server enforcement lands in the same release: anonymous users are eligible
-- only for the ANONYMOUS_ALLOWED_TRIGGERS whitelist AND only with this flag
-- true AND only with the ANON_PUSH_ENABLED kill switch on.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_riding_tips boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_riding_tips_consented_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.notify_riding_tips IS
  'Explicit opt-in to riding-tips push notifications (the consent gate for anonymous push). Default false — ePrivacy opt-in, never opt-out.';
COMMENT ON COLUMN public.profiles.notify_riding_tips_consented_at IS
  'GDPR consent record: timestamp of the false→true flip. Never overwritten while the flag stays true; nulled when consent is withdrawn.';

-- Token hygiene: prune push tokens of anonymous users with no activity in the
-- retention window. SECURITY DEFINER so it can consult auth.users.last_sign_in_at
-- (not exposed via PostgREST). Called by the daily hazards-expire cron.
-- "Activity" = any of: token re-registered (app open by an opted-in user),
-- a trip started, or an auth sign-in — all within the window.
CREATE OR REPLACE FUNCTION public.delete_stale_anonymous_push_tokens(
  retention_days integer DEFAULT 90
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.push_tokens pt
  USING public.profiles p
  WHERE p.id = pt.user_id
    AND p.is_anonymous
    AND pt.updated_at < now() - make_interval(days => retention_days)
    AND NOT EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.user_id = pt.user_id
        AND t.started_at > now() - make_interval(days => retention_days)
    )
    AND NOT EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = pt.user_id
        AND u.last_sign_in_at > now() - make_interval(days => retention_days)
    );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Service-role only — this is a cron maintenance primitive, not client API.
REVOKE ALL ON FUNCTION public.delete_stale_anonymous_push_tokens(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_stale_anonymous_push_tokens(integer) FROM anon;
REVOKE ALL ON FUNCTION public.delete_stale_anonymous_push_tokens(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_stale_anonymous_push_tokens(integer) TO service_role;
