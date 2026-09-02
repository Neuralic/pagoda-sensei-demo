-- Free-text comments/ideas shared with the travel advisor when a job/tour is added to an itinerary.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS advisor_comments text;

COMMENT ON COLUMN jobs.advisor_comments IS
  'Optional notes and ideas shared with the travel advisor for this itinerary activity (separate from guide-facing notes).';
