-- Migration: Add client_name to chats for per-client (travel order) threads
-- Date: 2025-02-23
-- Description:
--   Add client_name (TEXT NULL). NULL or '' = general chat between agent and guide.
--   Non-empty client_name = separate thread for that client/travel order.
--   One general chat per agent-guide pair; multiple client-named chats per pair.

-- Step 1: Add column
ALTER TABLE public.chats
ADD COLUMN IF NOT EXISTS client_name TEXT NULL;

-- Step 2: Drop old unique constraint (one chat per pair)
ALTER TABLE public.chats
DROP CONSTRAINT IF EXISTS chats_unique_agent_guide;

-- Step 3: Unique index: one "general" chat per pair (client_name NULL/empty), one chat per (pair, client_name) for client threads
-- COALESCE(NULLIF(TRIM(client_name), ''), '___GENERAL___') maps NULL or '' to ___GENERAL___
CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_agency_guide_client
ON public.chats (agency_id, guide_id, COALESCE(NULLIF(TRIM(client_name), ''), '___GENERAL___'));

-- Step 4: Index for listing chats by pair
CREATE INDEX IF NOT EXISTS idx_chats_agency_guide_client_name
ON public.chats (agency_id, guide_id, client_name);
