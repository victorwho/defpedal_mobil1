-- Attach RLS + grants to road_risk_data_v22 so that after the rename
-- swap (202605270004), the new table has the identical security posture
-- as the live one.
--
-- Mirrors exactly what's currently on public.road_risk_data:
--   * RLS enabled
--   * SELECT policy with USING (true) — public read
--   * SELECT granted to anon, authenticated, service_role
--   * postgres role retains its default owner privileges
--
-- Policy name intentionally uses the v22 suffix so it doesn't collide
-- with the still-live policy "Allow public read access to road_risk_data"
-- on the old table (which will keep that name after it gets renamed to
-- road_risk_data_v21_old). After the rename swap the v22 policy is
-- renamed to the canonical name.

alter table public.road_risk_data_v22 enable row level security;

drop policy if exists "Allow public read access to road_risk_data_v22"
  on public.road_risk_data_v22;

create policy "Allow public read access to road_risk_data_v22"
  on public.road_risk_data_v22
  for select
  using (true);

grant select on public.road_risk_data_v22 to anon;
grant select on public.road_risk_data_v22 to authenticated;
grant select on public.road_risk_data_v22 to service_role;
