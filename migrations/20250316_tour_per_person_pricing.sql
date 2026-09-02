-- Per-person pricing for tours (adults 12+, children 3-11, infants 0-2)
-- guide_price retained for backward compatibility (flat rate); when per-person is set it takes precedence for new bookings.
ALTER TABLE public.tour ADD COLUMN IF NOT EXISTS price_per_adult numeric DEFAULT NULL;
ALTER TABLE public.tour ADD COLUMN IF NOT EXISTS price_per_child numeric DEFAULT NULL;
ALTER TABLE public.tour ADD COLUMN IF NOT EXISTS price_per_infant numeric DEFAULT NULL;

-- Job participant breakdown: add infants (0-2)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS infants integer DEFAULT 0;
