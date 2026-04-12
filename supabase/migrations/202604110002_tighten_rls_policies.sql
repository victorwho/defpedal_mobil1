-- Tighten RLS policies on trips, hazards, and navigation_feedback.
--
-- Previously all three tables used `using (true)` / `with check (true)`,
-- allowing any holder of the Supabase anon key (embedded in the APK) to
-- read ALL users' trips, forge records under arbitrary user_ids, and
-- enumerate location history.  The API server uses supabaseAdmin (service
-- role) which bypasses RLS, so this migration does not affect normal app
-- operation — it closes the direct-Supabase-access attack vector.

-- -------------------------------------------------------------------------
-- trips — owner-scoped SELECT/UPDATE, auth-scoped INSERT
-- -------------------------------------------------------------------------
do $$ begin
  drop policy if exists "Allow public select on trips" on trips;
  drop policy if exists "Allow insert for all" on trips;
  drop policy if exists "Allow update for all" on trips;
  create policy "Owner can read own trips"
    on trips for select
    using (user_id = auth.uid());

  create policy "Authenticated users can insert own trips"
    on trips for insert
    with check (user_id = auth.uid());

  create policy "Owner can update own trips"
    on trips for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
end $$;

-- -------------------------------------------------------------------------
-- hazards — public read (safety data), auth-scoped INSERT
-- Hazards are community safety data — anyone can see them, but you can
-- only report hazards attributed to your own user_id (or null for anon).
-- -------------------------------------------------------------------------
do $$ begin
  drop policy if exists "Allow public select on hazards" on hazards;
  drop policy if exists "hazards_insert_all" on hazards;
  create policy "Anyone can read hazards"
    on hazards for select
    using (true);

  create policy "Authenticated users can insert own hazards"
    on hazards for insert
    with check (user_id = auth.uid() or user_id is null);
end $$;

-- -------------------------------------------------------------------------
-- navigation_feedback — owner-scoped SELECT, auth-scoped INSERT
-- -------------------------------------------------------------------------
do $$ begin
  drop policy if exists "Allow reading feedback" on navigation_feedback;
  drop policy if exists "Allow anonymous feedback insertion" on navigation_feedback;
  drop policy if exists "Allow public insert on feedback" on navigation_feedback;
  create policy "Owner can read own feedback"
    on navigation_feedback for select
    using (user_id = auth.uid());

  create policy "Authenticated users can insert own feedback"
    on navigation_feedback for insert
    with check (user_id = auth.uid() or user_id is null);
end $$;
