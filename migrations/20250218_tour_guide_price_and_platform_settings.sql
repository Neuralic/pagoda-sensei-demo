-- Add guide price to tour (price set by guide when creating/editing tour library)
ALTER TABLE public.tour ADD COLUMN IF NOT EXISTS guide_price numeric DEFAULT NULL;
