-- Per-line advisor commission override (e.g. 0% on Shinkansen, 15% on tours).
-- Null = use itinerary markup_pct → account default → platform default.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS line_markup_pct numeric DEFAULT NULL;

COMMENT ON COLUMN jobs.line_markup_pct IS
  'Advisor proposal markup % for this line only. Null inherits itinerary markup_pct.';
