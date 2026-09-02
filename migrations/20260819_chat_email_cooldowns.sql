-- Cooldown so a burst of chat messages does not send one email per message.
CREATE TABLE IF NOT EXISTS public.chat_email_cooldowns (
  chat_id text NOT NULL,
  recipient_key text NOT NULL,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, recipient_key)
);

CREATE INDEX IF NOT EXISTS chat_email_cooldowns_sent_idx
  ON public.chat_email_cooldowns (last_sent_at);

COMMENT ON TABLE public.chat_email_cooldowns IS
  'Last chat notification email per thread + recipient; used to throttle follow-up mail';
