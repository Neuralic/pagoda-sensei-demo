-- Advisor intake form on draft itinerary creation (build mode + client preferences).

ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS build_mode text NOT NULL DEFAULT 'self';

ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS intake_data jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN itineraries.build_mode IS 'self = advisor builds in Tour Library; pagoda_build = Pagoda team builds proposal';
COMMENT ON COLUMN itineraries.intake_data IS 'Client intake: budget, travel style, interests, travelers, accessibility/dietary notes';
