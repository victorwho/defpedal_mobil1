-- Improved Hazard System — rename hazard_type 'construction' → 'aggro_dogs'.
--
-- Product decision: replace the 'construction' hazard category with
-- 'aggro_dogs' (aggressive dogs). The category occupies the same severity
-- bucket (3 = highest, on-map) in HazardLayers.tsx and inherits the same
-- baseline TTL (21 days) because a territorial / aggressive dog at a
-- specific address is typically persistent across weeks.
--
-- Order of operations: widen the CHECK constraint to accept BOTH values,
-- migrate existing rows, then tighten back with only 'aggro_dogs'. This
-- avoids any window where existing 'construction' rows become invalid.

-- ── Step 1: widen the constraint to accept both values ──────────────────
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
      'aggro_dogs',
      'aggressive_traffic',
      'other'
    )
  );

-- ── Step 2: migrate existing data ───────────────────────────────────────
update public.hazards
   set hazard_type = 'aggro_dogs'
 where hazard_type = 'construction';

-- ── Step 3: tighten — drop 'construction' from allowed values ───────────
alter table public.hazards
  drop constraint hazards_hazard_type_check;

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
      'aggro_dogs',
      'aggressive_traffic',
      'other'
    )
  );

-- ── Step 4: rewire hazard_baseline_ttl() — swap 'construction' for ──────
--    'aggro_dogs' at the same 21-day baseline. All other branches are
--    unchanged from 202604210001.
CREATE OR REPLACE FUNCTION hazard_baseline_ttl(p_type text)
RETURNS interval AS $$
BEGIN
  RETURN CASE p_type
    WHEN 'poor_surface'           THEN interval '4 hours'    -- transient
    WHEN 'aggressive_traffic'     THEN interval '4 hours'
    WHEN 'illegally_parked_car'   THEN interval '6 hours'
    WHEN 'blocked_bike_lane'      THEN interval '12 hours'
    WHEN 'narrow_street'          THEN interval '30 days'    -- semi-permanent
    WHEN 'missing_bike_lane'      THEN interval '30 days'
    WHEN 'dangerous_intersection' THEN interval '30 days'
    WHEN 'pothole'                THEN interval '14 days'
    WHEN 'aggro_dogs'             THEN interval '21 days'
    ELSE                               interval '24 hours'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp;
