-- Transferz bookings attached to an itinerary (agent-visible only; not guide jobs).
CREATE TABLE IF NOT EXISTS itinerary_transferz_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  activity_date DATE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  title TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  location TEXT,
  description TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itinerary_transferz_itinerary_id
  ON itinerary_transferz_bookings(itinerary_id);

CREATE INDEX IF NOT EXISTS idx_itinerary_transferz_itinerary_activity_date
  ON itinerary_transferz_bookings(itinerary_id, activity_date);
