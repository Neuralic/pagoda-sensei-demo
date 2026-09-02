-- Rollback Migration: Revert to job-based chats (remove unique constraint, make job_id required)
-- Date: 2025-01-27
-- WARNING: This will fail if there are any chats with NULL job_id values
-- You must first update or delete those chats before running this rollback

-- Step 1: Update any chats with NULL job_id to have a valid job_id or delete them
-- UNCOMMENT AND MODIFY THIS QUERY BASED ON YOUR NEEDS:
-- UPDATE public.chats SET job_id = '<some-default-job-id>' WHERE job_id IS NULL;
-- OR
-- DELETE FROM public.chats WHERE job_id IS NULL;

-- Step 2: Drop the unique constraint on agent-guide pairs
ALTER TABLE public.chats 
DROP CONSTRAINT IF EXISTS chats_unique_agent_guide;

-- Step 3: Drop the index for agent-guide pairs
DROP INDEX IF EXISTS public.idx_chats_agency_guide;

-- Step 4: Drop the foreign key constraint
ALTER TABLE public.chats 
DROP CONSTRAINT IF EXISTS chats_job_id_fkey;

-- Step 5: Re-add NOT NULL constraint
ALTER TABLE public.chats 
ALTER COLUMN job_id SET NOT NULL;

-- Step 6: Re-add the foreign key constraint with CASCADE delete
ALTER TABLE public.chats 
ADD CONSTRAINT chats_job_id_fkey 
FOREIGN KEY (job_id) 
REFERENCES jobs (id) 
ON DELETE CASCADE;

