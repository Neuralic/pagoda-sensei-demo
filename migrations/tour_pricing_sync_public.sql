-- =============================================================================
-- Sync public.tour from introspected legacy shape → app target
-- =============================================================================
-- Run this on DBs that have the older tour row (guide_price + optional per-person)
-- but not yet: pricing_model, group_rate columns, max_group_size.
--
-- Your live table may also have:
--   additional_per_adult, additional_per_child, additional_per_infant  (removed here)
--   no max_group_size  (added here)
--
-- Idempotent. Safe to re-run.
-- =============================================================================

BEGIN;

-- Columns required by the app (add before COMMENT ON)
ALTER TABLE public.tour ADD COLUMN IF NOT EXISTS pricing_model text DEFAULT NULL;
ALTER TABLE public.tour ADD COLUMN IF NOT EXISTS base_rate numeric DEFAULT NULL;
ALTER TABLE public.tour ADD COLUMN IF NOT EXISTS base_group_size integer DEFAULT NULL;
ALTER TABLE public.tour ADD COLUMN IF NOT EXISTS additional_per_person_rate numeric DEFAULT NULL;
ALTER TABLE public.tour ADD COLUMN IF NOT EXISTS max_group_size integer DEFAULT NULL;

-- Legacy triple "additional per age" (if present from older experiments)
ALTER TABLE public.tour DROP COLUMN IF EXISTS additional_per_adult;
ALTER TABLE public.tour DROP COLUMN IF EXISTS additional_per_child;
ALTER TABLE public.tour DROP COLUMN IF EXISTS additional_per_infant;

COMMENT ON COLUMN public.tour.guide_price IS 'Legacy flat guide price; prefer per_person or group_rate columns.';
COMMENT ON COLUMN public.tour.price_per_adult IS 'per_person: guide price per adult (12+).';
COMMENT ON COLUMN public.tour.price_per_child IS 'per_person: guide price per child (3-11).';
COMMENT ON COLUMN public.tour.price_per_infant IS 'per_person: guide price per infant (0-2).';
COMMENT ON COLUMN public.tour.pricing_model IS 'per_person | group_rate';
COMMENT ON COLUMN public.tour.base_rate IS 'group_rate: flat total for up to base_group_size people.';
COMMENT ON COLUMN public.tour.base_group_size IS 'group_rate: headcount included in base_rate.';
COMMENT ON COLUMN public.tour.additional_per_person_rate IS 'group_rate: per extra person beyond base (one rate, all ages).';
COMMENT ON COLUMN public.tour.max_group_size IS 'group_rate: max total participants; NULL = no cap (legacy).';

COMMIT;
