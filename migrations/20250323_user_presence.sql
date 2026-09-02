-- Presence for agents/guides: heartbeat updates presence_state + presence_updated_at.
-- Admin UI treats stale rows as offline (see lib/presence.ts).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS presence_state text;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS presence_updated_at timestamptz;

COMMENT ON COLUMN public.users.presence_state IS 'online | idle | offline (last explicit write)';
COMMENT ON COLUMN public.users.presence_updated_at IS 'Last heartbeat or logout time';
