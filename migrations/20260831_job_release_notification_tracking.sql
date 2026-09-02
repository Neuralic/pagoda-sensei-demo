-- The 24-hour "open this tour to other guides" broadcast has never run in production: no cron
-- was ever scheduled for /api/jobs/release-notifications. Turning it on needs two things this
-- migration provides, or the first run emails every guide the entire back-catalogue.
--
-- 1. A dedup stamp. The route's only guard was "skip if another guide already applied", so a
--    tour nobody applied to would be re-broadcast on every single run — 96 times a day at a
--    15-minute schedule, to every guide.
-- 2. A backfill. With the stamp added and the route's window bug fixed, every tour ever
--    released more than 24 hours ago suddenly qualifies. Stamping history as already-handled
--    means only tours released from now on are broadcast.
--
-- Tours in that history that genuinely still need guides are better re-opened deliberately
-- than by a mass send nobody asked for.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS guides_notified_at timestamptz;

COMMENT ON COLUMN jobs.guides_notified_at IS
  'When this tour was broadcast to guides other than the tour owner, 24h after release. Set once; a non-null value means the broadcast has happened and must not repeat.';

-- Backfill: treat everything already past its 24-hour window as handled.
UPDATE jobs
   SET guides_notified_at = COALESCE(released_at, now())
 WHERE guides_notified_at IS NULL
   AND released_at IS NOT NULL
   AND released_at < now() - interval '24 hours';

-- The cron scans for unstamped tours past the window; keep that lookup cheap.
CREATE INDEX IF NOT EXISTS idx_jobs_pending_guide_broadcast
  ON jobs (released_at)
  WHERE guides_notified_at IS NULL AND released_at IS NOT NULL;
