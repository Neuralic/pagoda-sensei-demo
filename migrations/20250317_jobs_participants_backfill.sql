-- Ensure jobs have participant columns (adults, children, infants) for per-person pricing.
-- Backfill existing tour jobs that have no participant breakdown: infer adults from group_size.

-- Add columns if missing (e.g. adults/children may not exist in older schemas)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS adults integer DEFAULT NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS children integer DEFAULT NULL;

-- Backfill: for tour jobs with no participant data, set adults from group_size (or 1), children=0, infants=0
UPDATE jobs
SET
  adults = COALESCE(NULLIF(NULLIF(group_size, 0), NULL), 1),
  children = 0,
  infants = COALESCE(infants, 0)
WHERE tour_id IS NOT NULL
  AND (
    (adults IS NULL AND children IS NULL)
    OR (COALESCE(adults, 0) + COALESCE(children, 0) + COALESCE(infants, 0) = 0)
  );
