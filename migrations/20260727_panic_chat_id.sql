-- Link support alerts (formerly panic) to a message-board conversation when raised from chat.
ALTER TABLE panic
  ADD COLUMN IF NOT EXISTS chat_id uuid NULL;

CREATE INDEX IF NOT EXISTS panic_chat_id_idx ON panic (chat_id);
