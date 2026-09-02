-- Migration: Add edit and delete functionality to chat_messages table
-- Date: 2025-01-27
-- Description: 
--   Add fields to support message editing and deletion:
--   - is_deleted: boolean flag to mark deleted messages
--   - deleted_at: timestamp when message was deleted
--   - is_edited: boolean flag to mark edited messages
--   - edited_at: timestamp when message was last edited
--   - updated_at: timestamp for tracking updates (auto-updated)

-- Step 1: Add is_deleted column (default false)
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Add deleted_at column (nullable)
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Step 3: Add is_edited column (default false)
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT false;

-- Step 4: Add edited_at column (nullable)
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- Step 5: Add updated_at column (nullable, will be set by trigger or application)
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Step 6: Create index on is_deleted for faster filtering
CREATE INDEX IF NOT EXISTS idx_chat_messages_is_deleted 
ON public.chat_messages(is_deleted) 
WHERE is_deleted = false;

-- Step 7: Create index on is_edited for faster filtering
CREATE INDEX IF NOT EXISTS idx_chat_messages_is_edited 
ON public.chat_messages(is_edited) 
WHERE is_edited = true;

-- Step 8: Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Step 9: Create trigger to auto-update updated_at on message updates
DROP TRIGGER IF EXISTS update_chat_messages_updated_at ON public.chat_messages;
CREATE TRIGGER update_chat_messages_updated_at
    BEFORE UPDATE ON public.chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

