-- Supabase's default ACL on CREATE TABLE grants ALL privileges to
-- anon, authenticated, and service_role. The live road_risk_data table
-- only has SELECT (created by legacy scripts before this default
-- applied). Revoke the excess privileges on v22 so the new table has
-- the identical least-privilege posture after the rename swap.
--
-- After this migration, v22 grants mirror live exactly:
--   anon, authenticated, service_role  → SELECT only
--   postgres                            → ALL (table owner)
--
-- In practice the RLS layer (202605270002) blocks INSERT/UPDATE/DELETE
-- because there's no policy for those operations, but TRUNCATE bypasses
-- RLS and is controlled by grants alone. Principle of least privilege.

revoke insert, update, delete, truncate, references, trigger
  on public.road_risk_data_v22
  from anon, authenticated, service_role;
