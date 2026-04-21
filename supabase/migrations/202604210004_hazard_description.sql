-- Improved Hazard System — optional free-text description on reports.
--
-- Product: when a rider picks "Other" in the hazard picker, they can type
-- a short description (e.g. "glass shards across bike lane", "loose dog
-- barking at cyclists"). Field is optional — an empty/null description is
-- valid and the Report button stays active either way.
--
-- Schema: nullable text, capped at 280 chars (Twitter-style) to keep
-- things scannable on the detail sheet and prevent abuse (someone pasting
-- an essay into every report). Trim applied client-side; server stores
-- whatever it receives within the length bound.

alter table public.hazards
  add column if not exists description text;

alter table public.hazards
  drop constraint if exists hazards_description_length_check;

alter table public.hazards
  add constraint hazards_description_length_check
  check (description is null or char_length(description) <= 280);

comment on column public.hazards.description is
  'Optional free-text description supplied by the reporter, primarily used with hazard_type=''other''. Capped at 280 characters.';
