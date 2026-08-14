-- Add avoid_heat column to saved_routes for cool (shade/heat-model) routing
-- preference. Mirrors 202604110001_saved_routes_avoid_hills.sql.
--
-- Companion note (apply-time follow-up, NOT in this file): the live
-- `claim_route_share` RPC maps a share's routingMode onto saved_routes
-- (currently 'flat' -> avoid_hills, ELSE -> 'safe'). A claimed 'cool' share
-- therefore degrades to a plain safe saved route until that RPC is updated
-- to also set avoid_heat = (routingMode = 'cool'). Per the RPC-drift rule,
-- read the live definition via pg_get_functiondef before redefining it.
ALTER TABLE saved_routes ADD COLUMN IF NOT EXISTS avoid_heat BOOLEAN NOT NULL DEFAULT false;
