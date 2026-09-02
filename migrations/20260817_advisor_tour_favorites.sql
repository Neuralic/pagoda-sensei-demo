-- Advisor favorites for Tour Library (per user).
CREATE TABLE IF NOT EXISTS public.advisor_tour_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tour_id bigint NOT NULL REFERENCES public.tour(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT advisor_tour_favorites_user_tour_unique UNIQUE (user_id, tour_id)
);

CREATE INDEX IF NOT EXISTS idx_advisor_tour_favorites_user
  ON public.advisor_tour_favorites(user_id);

CREATE INDEX IF NOT EXISTS idx_advisor_tour_favorites_tour
  ON public.advisor_tour_favorites(tour_id);

COMMENT ON TABLE public.advisor_tour_favorites IS
  'Advisor/agency starred tours in Tour Library';
