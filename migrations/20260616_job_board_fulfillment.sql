-- Job board visibility reason + tour reference ID + guide fulfillment on accept

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS reference_code text NULL,
  ADD COLUMN IF NOT EXISTS board_hidden_reason text NULL;

COMMENT ON COLUMN jobs.reference_code IS 'Human-readable tour/job ID for invoices (e.g. PT-A1B2C3D4).';
COMMENT ON COLUMN jobs.board_hidden_reason IS 'Why job_available was set false: hired | past_date | accepted | manual';

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_reference_code_unique
  ON jobs (reference_code)
  WHERE reference_code IS NOT NULL;

ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS pickup_date date NULL,
  ADD COLUMN IF NOT EXISTS pickup_time text NULL,
  ADD COLUMN IF NOT EXISTS pickup_location text NULL,
  ADD COLUMN IF NOT EXISTS guide_display_name text NULL,
  ADD COLUMN IF NOT EXISTS guide_whatsapp text NULL,
  ADD COLUMN IF NOT EXISTS fulfillment_submitted_at timestamptz NULL;

COMMENT ON COLUMN job_applications.pickup_date IS 'Guide-confirmed pickup date shown to travelers.';
COMMENT ON COLUMN job_applications.guide_whatsapp IS 'Guide WhatsApp for traveler contact on the itinerary.';

-- Backfill reference codes for existing jobs
UPDATE jobs
SET reference_code = 'PT-' || upper(substring(replace(id::text, '-', '') from 1 for 8))
WHERE reference_code IS NULL;
