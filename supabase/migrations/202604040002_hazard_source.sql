-- Add source column to hazards table to track how hazards were reported.
-- Values: 'in_ride' (during navigation), 'manual' (crosshair placement), 'armchair' (long-press from planning)

alter table public.hazards
  add column if not exists source text default 'manual';
