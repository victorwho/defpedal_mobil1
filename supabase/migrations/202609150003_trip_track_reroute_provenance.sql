-- Route provenance on trip_tracks (2026-09-15)
--
-- `trip_tracks.planned_route_polyline6` has always been written at ride END,
-- from whatever geometry the navigation screen happened to be holding at that
-- moment. When a ride rerouted, that is the POST-reroute line — so the column
-- named "planned" recorded, for exactly the rides where the distinction
-- matters, the route the rider ended up on rather than the one they chose.
--
-- Measured over 253 tracks with both a planned polyline and a GPS trail: 97
-- began where the ride began, 30 began at the ride's END (a reroute home, or a
-- loop measured backwards), and 122 began somewhere else entirely. The column
-- was answering a different question on nearly two thirds of rides, silently.
--
-- The fix is on the client (it snapshots the geometry at Start and submits
-- that), so this migration only adds the columns that say what happened
-- AFTERWARDS. `planned_route_polyline6` keeps its name; its meaning narrows to
-- "the route the rider set out on".
--
-- ⚠️ NO BACKFILL, AND NONE IS POSSIBLE. For rides recorded before the client
-- half ships, the original geometry was never stored anywhere — not on
-- `trips`, not in the feed, not in the activity payload. Those rides stay
-- uncomparable, and the three columns below stay NULL for them forever. That
-- is the honest state; do not invent one.
--
-- ⚠️ `reroute_count` IS NULLABLE WITH NO DEFAULT, DELIBERATELY. A default of 0
-- would stamp "this ride had no reroutes" on every historical row when the
-- truth is "we do not know". NULL is the only value that says the second
-- thing, and the API layer mirrors this: it writes `?? null`, never `?? 0`.
-- Never add a default here.
--
-- ⚠️ ORDERING: this migration must be LIVE BEFORE the API deploys, and the
-- failure if it is not is SILENT rather than loud. The auto-publish path
-- selects `final_route_polyline6` from `trip_tracks`; PostgREST 400s on an
-- unknown column, and that call destructures only `data`, so the error is
-- discarded and `trackRow` comes back null. The ride still publishes to the
-- community feed — with an EMPTY geometry, i.e. a feed card with no line on
-- the map — for as long as the API is ahead of the schema. Nothing logs it.
--
-- The trip_track WRITE path needs no ordering: the new fields are optional
-- from the wire down, so an older client simply sends none of them and an
-- older server strips them (Fastify ajv `removeAdditional`, pinned by a test
-- in `routes-v1.test.ts`).

alter table public.trip_tracks
  add column if not exists final_route_polyline6 text,
  add column if not exists reroute_count integer,
  add column if not exists last_reroute_at timestamptz;

comment on column public.trip_tracks.planned_route_polyline6 is
  'The route the rider SET OUT on, snapshotted at Start. Narrowed from its original meaning on 2026-09-15 (migration 202609150003) — before that it was whatever geometry navigation held at ride end, which on a rerouted ride is the final route. Rides recorded before that date are not comparable against final_route_polyline6.';

comment on column public.trip_tracks.final_route_polyline6 is
  'The route the rider finished on. Equal to planned_route_polyline6 when the ride never rerouted. NULL for every ride recorded before migration 202609150003 — unknown, not absent.';

comment on column public.trip_tracks.reroute_count is
  'How many times navigation replaced the route mid-ride. NULLABLE WITH NO DEFAULT on purpose: NULL means unknown (a pre-2026-09-15 ride, or a client too old to report it), 0 means the ride genuinely never rerouted. Adding a default would collapse those two into a false zero.';

comment on column public.trip_tracks.last_reroute_at is
  'When the last mid-ride reroute happened. NULL when the ride never rerouted OR when it is unknown — read it alongside reroute_count, which separates the two.';
