-- Guide bid per-person pricing (for custom jobs or when guide is not tour owner)
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS price_per_adult numeric DEFAULT NULL;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS price_per_child numeric DEFAULT NULL;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS price_per_infant numeric DEFAULT NULL;
