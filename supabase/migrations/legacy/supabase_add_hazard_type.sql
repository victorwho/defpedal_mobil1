alter table public.hazards
  add column if not exists hazard_type text;

alter table public.hazards
  drop constraint if exists hazards_hazard_type_check;

alter table public.hazards
  add constraint hazards_hazard_type_check
  check (
    hazard_type is null
    or hazard_type in (
      'illegally_parked_car',
      'blocked_bike_lane',
      'missing_bike_lane',
      'pothole',
      'poor_surface',
      'narrow_street',
      'dangerous_intersection',
      'construction',
      'aggressive_traffic',
      'other'
    )
  );

comment on column public.hazards.hazard_type is
  'Bike-safety hazard category selected by the rider at report time.';
