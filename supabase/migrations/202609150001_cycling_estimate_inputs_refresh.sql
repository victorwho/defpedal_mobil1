-- Refresh the cycling-estimate inputs (2026-09-15)
--
-- Two changes, both to inputs rather than to the model.
--
-- 1. `trips_per_person_per_day` 2.5 -> 3.0.
--    2.5 was the low end of the usual 2.5-3.5 European urban range, picked to
--    err low on a headline figure. 3.0 is the middle of that range and is the
--    more representative choice; erring low is defensible but it is still a
--    thumb on the scale. Lifts every city ~20%.
--
-- 2. Bucharest gets a RECENT, CITY-SPECIFIC modal share.
--    Was 3.4% — a Romanian county-seat average from SUMPs measured 2015-2017.
--    Now 3.94%, from the Bucharest Master Plan Velo (F.I.P. Consulting,
--    commissioned by Bucharest City Hall March 2023, published 2024). Newer by
--    seven years and measured for Bucharest rather than inferred from a
--    national mean. Its stated modal split: surface public transport 37.68%,
--    car 27.36%, walking 20.71%, metro 9.56%, bicycle/scooter 3.94%.
--
-- ⚠️ THE NEW FIGURE COVERS BICYCLES **AND SCOOTERS** — "deplasări ... cu
-- bicicleta sau trotineta". It is therefore NOT a pure cycling number, and
-- using it under a label that says "cyclists" would quietly count e-scooter
-- riders as cyclists. Hence `modal_share_covers`: the UI reads it and changes
-- the label, so Bucharest says "bikes & scooters" while cities still on the
-- World Bank figure say "cyclists". Never widen a measure without moving the
-- word that describes it.
--
-- ⚠️ DO NOT USE THE 18% FIGURE from the same research. It is stated POTENTIAL
-- demand — "18% of Bucharest residents would travel by bicycle if attractive
-- infrastructure existed" — not observed usage. It is the single most
-- attractive-looking number in the source and the single most wrong one to put
-- on this card.

alter table public.city_cycling_estimates
  add column if not exists modal_share_covers text not null default 'bicycle';

comment on column public.city_cycling_estimates.modal_share_covers is
  'What the modal share actually measures: bicycle | bicycle_or_scooter. The UI label MUST follow this — see migration 202609150001.';

-- Middle of the standard range rather than the low end, for every city.
update public.city_cycling_estimates
set trips_per_person_per_day = 3.0;

-- Bucharest: newer, city-specific, broader measure.
update public.city_cycling_estimates
set modal_share        = 0.0394,
    modal_share_source = 'Master Plan Velo București (F.I.P. Consulting for Primăria Municipiului București), survey 2023-2024',
    modal_share_year   = 2024,
    modal_share_covers = 'bicycle_or_scooter'
where id = 'ro:bucuresti';

-- Ship the coverage flag to the client so the label can follow the measure.
create or replace function public.get_city_cycling_estimate(
  p_lat double precision,
  p_lon double precision,
  p_max_distance_meters double precision default 60000
)
returns jsonb
language sql
stable
as $fn$
  with pt as (select ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography g)
  select jsonb_build_object(
    'city',        c.city,
    'dailyCyclists', (
      case
        when raw.v >= 100000 then round(raw.v / 10000.0) * 10000
        else round(raw.v / 1000.0) * 1000
      end
    )::bigint,
    'isRiderCity', ST_DWithin(c.centre, pt.g, c.catchment_meters),
    'distanceMeters', round(ST_Distance(c.centre, pt.g))::int,
    'modalSharePercent', round(c.modal_share * 100, 1),
    'modalShareSource',  c.modal_share_source,
    'modalShareYear',    c.modal_share_year,
    'modalShareCovers',  c.modal_share_covers,
    'population',        c.population
  )
  from city_cycling_estimates c, pt,
  lateral (
    select (c.population * c.trips_per_person_per_day * c.modal_share / 2.0) as v
  ) raw
  where c.enabled
    and ST_DWithin(c.centre, pt.g, p_max_distance_meters)
  order by ST_Distance(c.centre, pt.g)
  limit 1;
$fn$;
