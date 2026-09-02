-- Migration: Make job_id nullable and enforce unique agent-guide pairs in chats table
-- Date: 2025-01-27
-- Description: 
--   1. Make job_id nullable (chats are now based on agent-guide pairs, not jobs)
--   2. Enforce UNIQUE constraint on (agency_id, guide_id) - only ONE chat per agent-guide pair
--   3. Merge any existing duplicate chats (keep most recent, move messages/participants)

-- Step 1: Drop the existing foreign key constraint on job_id
ALTER TABLE public.chats 
DROP CONSTRAINT IF EXISTS chats_job_id_fkey;

-- Step 2: Drop the NOT NULL constraint on job_id
ALTER TABLE public.chats 
ALTER COLUMN job_id DROP NOT NULL;

-- Step 3: Re-add the foreign key constraint with ON DELETE SET NULL to handle deletions gracefully
-- This allows the foreign key to be NULL while still maintaining referential integrity when a job_id is provided
ALTER TABLE public.chats 
ADD CONSTRAINT chats_job_id_fkey 
FOREIGN KEY (job_id) 
REFERENCES jobs (id) 
ON DELETE SET NULL;

-- Step 4: Merge any existing duplicate chats before adding unique constraint
-- For each agent-guide pair with multiple chats, keep the most recent one and merge the others
DO $$
DECLARE
  duplicate_record RECORD;
  chat_to_keep UUID;
BEGIN
  -- Find all duplicate agent-guide pairs
  FOR duplicate_record IN
    SELECT agency_id, guide_id, COUNT(*) as count
    FROM public.chats
    GROUP BY agency_id, guide_id
    HAVING COUNT(*) > 1
  LOOP
    -- For each duplicate pair, keep the most recent chat (by created_at)
    SELECT id INTO chat_to_keep
    FROM public.chats
    WHERE agency_id = duplicate_record.agency_id
      AND guide_id = duplicate_record.guide_id
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Move all messages from duplicate chats to the chat we're keeping
    UPDATE public.chat_messages
    SET chat_id = chat_to_keep
    WHERE chat_id IN (
      SELECT id FROM public.chats
      WHERE agency_id = duplicate_record.agency_id
        AND guide_id = duplicate_record.guide_id
        AND id != chat_to_keep
    );
    
    -- Ensure participants exist in the chat we're keeping (upsert handles duplicates)
    INSERT INTO public.chat_participants (chat_id, user_id)
    SELECT DISTINCT chat_to_keep, user_id
    FROM public.chat_participants
    WHERE chat_id IN (
      SELECT id FROM public.chats
      WHERE agency_id = duplicate_record.agency_id
        AND guide_id = duplicate_record.guide_id
        AND id != chat_to_keep
    )
    ON CONFLICT (chat_id, user_id) DO NOTHING;
    
    -- Delete the duplicate chats (CASCADE will clean up any remaining related records)
    DELETE FROM public.chats
    WHERE agency_id = duplicate_record.agency_id
      AND guide_id = duplicate_record.guide_id
      AND id != chat_to_keep;
  END LOOP;
END $$;

-- Step 5: Add a UNIQUE constraint to ensure only ONE chat exists between each agent-guide pair
-- This is the core requirement: one chat per agent-guide pair, regardless of job_id
-- This constraint will prevent any future duplicate chats from being created
ALTER TABLE public.chats 
ADD CONSTRAINT chats_unique_agent_guide 
UNIQUE (agency_id, guide_id);

-- Step 6: Add an index to improve query performance for finding chats by agent-guide pair
CREATE INDEX IF NOT EXISTS idx_chats_agency_guide ON public.chats (agency_id, guide_id);

-- Verification query (commented out - run manually to verify)
-- SELECT 
--   column_name, 
--   is_nullable, 
--   data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'chats' 
--   AND column_name = 'job_id';

