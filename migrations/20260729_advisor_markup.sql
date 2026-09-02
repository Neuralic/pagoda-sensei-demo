-- Advisor proposal markup: account default, per-itinerary override, and optional line prices.
-- Base (supplier/net) comes from platform display price or jobs.supplier_price.
-- Client-facing display = client_price if set, else base × (1 + effective markup %).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_markup_pct numeric DEFAULT NULL;

COMMENT ON COLUMN users.default_markup_pct IS
  'Travel advisor default proposal markup percent (e.g. 20 = +20%). Used when itinerary.markup_pct is null.';

ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS markup_pct numeric DEFAULT NULL;

ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS margin_strategy text DEFAULT NULL;

COMMENT ON COLUMN itineraries.markup_pct IS
  'Proposal markup percent for this itinerary. Null falls back to users.default_markup_pct.';

COMMENT ON COLUMN itineraries.margin_strategy IS
  'How advisor profit is intended to be handled: keep | share | split. Informational for now.';

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS supplier_price numeric DEFAULT NULL;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS client_price numeric DEFAULT NULL;

COMMENT ON COLUMN jobs.supplier_price IS
  'Advisor-entered supplier/net cost for this line (e.g. partner quote). Used as markup base when set.';

COMMENT ON COLUMN jobs.client_price IS
  'Optional fixed client-facing sell price. When set, overrides markup formula for this line.';
