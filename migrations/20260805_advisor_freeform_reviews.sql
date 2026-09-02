-- Freeform advisor reviews: guide name + destination without a required job.
ALTER TABLE public.reviews
  ALTER COLUMN job_id DROP NOT NULL;

ALTER TABLE public.reviews
  ALTER COLUMN hiring_history_id DROP NOT NULL;

ALTER TABLE public.reviews
  ALTER COLUMN reviewee_id DROP NOT NULL;

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS destination text;

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS guide_name text;
