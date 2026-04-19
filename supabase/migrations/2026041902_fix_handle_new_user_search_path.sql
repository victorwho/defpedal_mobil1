-- Fix: "Database error saving new user" on email signup.
--
-- The handle_new_user() trigger is SECURITY DEFINER but had no search_path set
-- (flagged as `function_search_path_mutable` by the Supabase linter). When
-- GoTrue inserts a new row into auth.users, the trigger fires inside GoTrue's
-- transaction whose search_path is `auth, pg_catalog`. The trigger body
-- references `profiles` (unqualified) → "relation profiles does not exist".
--
-- Pinning the function's search_path to `public, auth, pg_temp` restores the
-- resolution without touching the function body. This matches the pattern used
-- in 202604120001_set_search_path_on_security_definer.sql for other
-- SECURITY DEFINER functions — handle_new_user was missed.

ALTER FUNCTION public.handle_new_user() SET search_path = public, auth, pg_temp;
