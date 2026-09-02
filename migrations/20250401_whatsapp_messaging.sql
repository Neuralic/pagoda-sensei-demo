-- WhatsApp Cloud API sync: platform remains source of truth; optional mirror + inbound ingest

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS whatsapp_sync_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS whatsapp_wa_id text NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS whatsapp_last_chat_id uuid NULL REFERENCES public.chats(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.users.whatsapp_sync_enabled IS 'When true, messages from other party in app are also sent to this user''s WhatsApp (if phone known).';
COMMENT ON COLUMN public.users.whatsapp_wa_id IS 'Meta WhatsApp ID (digits, no +) for this user once known from inbound messages.';
COMMENT ON COLUMN public.users.whatsapp_last_chat_id IS 'Last chat focused in app; inbound WhatsApp text is routed here when the sender matches a participant.';

CREATE INDEX IF NOT EXISTS idx_users_whatsapp_wa_id ON public.users (whatsapp_wa_id) WHERE whatsapp_wa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_whatsapp_last_chat_id ON public.users (whatsapp_last_chat_id) WHERE whatsapp_last_chat_id IS NOT NULL;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS source_channel text NOT NULL DEFAULT 'app';

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS whatsapp_message_id text NULL;

COMMENT ON COLUMN public.chat_messages.source_channel IS 'app | whatsapp — where the user composed the message';
COMMENT ON COLUMN public.chat_messages.whatsapp_message_id IS 'Meta wamid for deduplication when ingesting webhooks';

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_whatsapp_message_id_unique
  ON public.chat_messages (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;
