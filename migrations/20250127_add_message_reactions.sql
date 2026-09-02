-- Migration: Add message reactions functionality
-- Date: 2025-01-27
-- Description: 
--   Create a table to store emoji reactions on chat messages
--   Each reaction links a message, user, and emoji

-- Step 1: Create chat_message_reactions table
CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(message_id, user_id, emoji)
);

-- Step 2: Create index on message_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_message_id 
ON public.chat_message_reactions(message_id);

-- Step 3: Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_user_id 
ON public.chat_message_reactions(user_id);

-- Step 4: Create composite index for unique constraint performance
CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_message_user_emoji 
ON public.chat_message_reactions(message_id, user_id, emoji);

