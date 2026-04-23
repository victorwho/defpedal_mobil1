-- Fix the handle_new_user trigger so anonymous sign-ups don't crash with
-- "Database error saving new user". Anonymous users have no email and no
-- raw_user_meta_data.full_name, so the previous coalesce(full_name,
-- split_part(email, '@', 1)) resolved to NULL. `profiles.display_name` is
-- NOT NULL, so the explicit NULL triggered a constraint violation on every
-- anonymous signup — which in turn made the mobile app's
-- `signInAnonymously()` call fail at app launch, leaving guest users with
-- no session and breaking the entire signup-gate flow.
--
-- Falls back to empty string (matches the column default) when both sources
-- are missing. A real display name can be set later via the app's profile
-- update flow.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO profiles (id, display_name, auto_share_rides, trim_route_endpoints)
  VALUES (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1),
      ''
    ),
    true,
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$function$;
