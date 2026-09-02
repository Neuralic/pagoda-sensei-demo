-- Guide availability calendar (§3.3 — optional at profile upload, required before first booking)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS guide_availability_calendar jsonb NOT NULL DEFAULT '{"unavailableDates":[],"updatedAt":null}'::jsonb;

COMMENT ON COLUMN profiles.guide_availability_calendar IS
  'JSON: { unavailableDates: string[] (YYYY-MM-DD), updatedAt: ISO timestamp | null }. updatedAt set when guide/operator saves calendar.';
