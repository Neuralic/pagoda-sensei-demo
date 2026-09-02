-- Track when admins were emailed about a job with zero guide applications (24h+ after release).
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS admin_no_applicant_notified_at timestamptz;
