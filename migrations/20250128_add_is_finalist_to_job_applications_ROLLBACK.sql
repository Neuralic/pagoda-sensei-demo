-- Rollback migration: Remove is_finalist column from job_applications table
-- Date: 2025-01-28
-- WARNING: This will remove the is_finalist column and all its data

-- Drop the index first
DROP INDEX IF EXISTS idx_job_applications_is_finalist;

-- Remove the column
ALTER TABLE job_applications
DROP COLUMN IF EXISTS is_finalist;

