-- Allow Pagoda admin UUIDs as chat message senders.
-- Admins live in `admin`, not `users`, so a FK to users blocks itinerary support chat.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'chat_messages'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'sender_id'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.chat_messages DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

COMMENT ON COLUMN public.chat_messages.sender_id IS
  'Sender user id (users.id) or admin id (admin.id) for itinerary_support threads';
