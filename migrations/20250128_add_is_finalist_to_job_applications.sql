-- Add is_finalist column to job_applications table
-- This column marks which candidate is selected as the finalist for PDF display

ALTER TABLE job_applications
ADD COLUMN IF NOT EXISTS is_finalist BOOLEAN DEFAULT FALSE;

-- Create an index for faster queries when filtering by finalist status
CREATE INDEX IF NOT EXISTS idx_job_applications_is_finalist ON job_applications(job_id, is_finalist) WHERE is_finalist = TRUE;

-- Add a comment to document the column
COMMENT ON COLUMN job_applications.is_finalist IS 'Marks the selected finalist candidate for a job. Only one candidate per job should have this set to TRUE.';

