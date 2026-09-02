-- Itinerary support chats (Pagoda admin ↔ travel advisor) on the existing chats table.
ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS itinerary_id uuid REFERENCES itineraries(id) ON DELETE SET NULL;

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS chat_kind text NOT NULL DEFAULT 'marketplace';

-- guide_id references users(id). Admins are NOT in users, so itinerary_support
-- threads keep guide_id NULL and rely on chat_participants + itinerary access.
ALTER TABLE chats
  ALTER COLUMN guide_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS chats_itinerary_id_idx ON chats (itinerary_id)
  WHERE itinerary_id IS NOT NULL;

-- One support thread per itinerary
CREATE UNIQUE INDEX IF NOT EXISTS chats_itinerary_support_unique
  ON chats (itinerary_id)
  WHERE chat_kind = 'itinerary_support' AND itinerary_id IS NOT NULL;

COMMENT ON COLUMN chats.chat_kind IS 'marketplace = advisor↔guide; itinerary_support = Pagoda↔advisor on an itinerary';
COMMENT ON COLUMN chats.itinerary_id IS 'When set with chat_kind=itinerary_support, links the thread to that itinerary';
